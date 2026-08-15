/**
 * SEED DÉMO — MODULE RH ATELIERONE (à laisser en place pour vérification)
 * 3 mois (juin, juillet, août 2026), 8 employés, tous les scénarios :
 * présences normales, retards, départs anticipés, HS autorisées/non,
 * absences, maladie, congés approuvés, jour férié, évaluations,
 * paie sur 3 périodes + paiements variés + PDF.
 *
 * Rejouable : nettoie d'abord les données de test.
 */
const fs = require("fs");
const BASE = "http://localhost:3000";
const jar = new Map();
async function http(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const c = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  if (c) headers.cookie = c;
  const res = await fetch(BASE + path, { ...opts, headers, redirect: "manual" });
  const scs = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  for (const sc of scs) { const pair = sc.split(";")[0]; const i = pair.indexOf("="); if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)); }
  return res;
}
async function trpc(path, body) {
  const f = "C:\\Users\\FAYACO~1\\AppData\\Local\\Temp\\opencode\\t.json";
  fs.writeFileSync(f, JSON.stringify({ "0": { json: body } }));
  const res = await http(`/api/trpc/${path}?batch=1`, { method: "POST", headers: { "Content-Type": "application/json" }, body: fs.readFileSync(f, "utf8") });
  return res.json();
}
async function trpcGet(path, body) {
  const enc = encodeURIComponent(JSON.stringify({ "0": { json: body } }));
  const res = await http(`/api/trpc/${path}?batch=1&input=${enc}`);
  return res.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Jours ouvrés d'un mois (lun-sam, hors fériés fournis)
function workingDays(year, month, holidays = []) {
  const days = [];
  const last = new Date(year, month, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (dow !== 0 && !holidays.includes(ds)) days.push(ds);
  }
  return days;
}

(async () => {
  const csrf = await (await http("/api/auth/csrf")).json();
  await http("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }),
  });

  console.log("=== SEED DÉMO RH — 3 MOIS (juin-août 2026) ===");

  // ── 0. Nettoyage préalable ──
  const { execSync } = require("child_process");
  const tables = ["payroll_entry_lines", "payroll_entries", "payroll_periods", "evaluation_scores", "evaluations",
    "evaluation_campaigns", "leave_balance_adjustments", "leave_requests", "leave_balances",
    "overtime_authorizations", "attendance_calculations", "attendance_entries", "attendance_monthly_summaries"];
  execSync(`psql -h localhost -U postgres -d atelierone_erp -c "DELETE FROM ${tables.join("; DELETE FROM ")};"`, { env: { ...process.env, PGPASSWORD: "postgres" } });
  execSync(`psql -h localhost -U postgres -d atelierone_erp -c "UPDATE employes SET salaire_base=NULL, work_cycle_id=NULL, department_id=NULL, position_id=NULL, manager_id=NULL, num_cnss=NULL; DELETE FROM hr_public_holidays WHERE name LIKE '%(test)%';"`, { env: { ...process.env, PGPASSWORD: "postgres" } });
  console.log("Base nettoyée.");

  // ── 1. RH-00 : cycle + férié test (démontre le traitement des fériés un jour ouvré) ──
  const settings = await trpcGet("rhSettings.getAll", {});
  const cycleId = settings[0].result.data.json.cycles.find((c) => c.isDefault).id;
  await trpc("rhSettings.addHoliday", { date: "2026-06-05", name: "Fête nationale (test)", isRecurringYearly: false });
  console.log(`Cycle Atelier Standard (id ${cycleId}) + jour férié test 2026-06-05.`);

  // ── 2. RH-01 : fiches des 8 employés ──
  const FICHES = [
    { id: "1", salaire: "400000", dept: 1, poste: 1, cnss: "CNSS-0001" },                    // Directeur
    { id: "2", salaire: "250000", dept: 2, poste: 2, cnss: "CNSS-0002", mgr: 1 },            // Chef Atelier
    { id: "3", salaire: "120000", dept: 5, poste: 9, cnss: "CNSS-0003", mgr: 2 },            // Secrétaire
    { id: "4", salaire: "100000", dept: 4, poste: 7, cnss: "CNSS-0004", mgr: 2 },            // Magasinier
    { id: "5", salaire: "150000", dept: 2, poste: 3, cnss: "CNSS-0005", mgr: 2 },            // Technicien
    { id: "6", salaire: "180000", dept: 6, poste: 10, cnss: "CNSS-0006", mgr: 1 },           // Comptable
    { id: "7", salaire: "90000", dept: 7, poste: 11, cnss: "CNSS-0007", mgr: 1 },            // RH
    { id: "8", salaire: null, dept: null, poste: null, cnss: null, mgr: 1 },                 // Consultation (sans salaire → pas de bulletin)
  ];
  for (const f of FICHES) {
    await trpc("rh.update", {
      id: f.id, workCycleId: cycleId, salaireBase: f.salaire ?? null,
      departmentId: f.dept ?? null, positionId: f.poste ?? null,
      managerId: f.mgr ?? null, numCnss: f.cnss ?? null,
    });
  }
  console.log("8 fiches employés renseignées (salaire, département, poste, manager, CNSS).");

  // ── 3. RH-02 + RH-03 : présences sur 3 mois avec tous les scénarios ──
  const holidays = ["2026-08-15"]; // Assomption (samedi, hors plage ouvrée)
  const MONTHS = [
    { m: 6, y: 2026 }, { m: 7, y: 2026 }, { m: 8, y: 2026 },
  ];

  for (const { m, y } of MONTHS) {
    const days = workingDays(y, m, holidays);
    console.log(`Mois ${m}/2026 : ${days.length} jours ouvrés.`);

    for (const date of days) {
      const dow = new Date(`${date}T12:00:00`).getDay();
      const dayNum = Number(date.slice(8, 10));
      const rows = [];

      // E1 Directeur : présent ; +2h HS le 2e jeudi (avec autorisation)
      const isThu2 = dow === 4 && dayNum >= 8 && dayNum <= 14;
      rows.push({ employeeId: 1, timeIn: "07:30", timeOut: isThu2 ? "20:00" : "18:00", status: "present" });

      // E2 Chef Atelier : présent ; absent non justifié les 5 et 20
      if (dayNum === 5 || dayNum === 20) {
        rows.push({ employeeId: 2, status: "absent" });
      } else {
        rows.push({ employeeId: 2, timeIn: "07:30", timeOut: "18:00", status: "present" });
      }

      // E3 Secrétaire : présent ; retards (08:15) les 2, 9, 16 ; congé 3 jours le 3e lundi-mardi-mercredi
      const isLate = [2, 9, 16].includes(dayNum);
      rows.push({ employeeId: 3, timeIn: isLate ? "08:15" : "07:30", timeOut: "18:00", status: "present" });

      // E4 Magasinier : présent ; départs anticipés (16:30) les 4, 18
      const isEarly = [4, 18].includes(dayNum);
      rows.push({ employeeId: 4, timeIn: "07:30", timeOut: isEarly ? "16:30" : "18:00", status: "present" });

      // E5 Technicien : présent ; +1h HS SANS autorisation le 3e vendredi (→ ignorée)
      const isFri3 = dow === 5 && dayNum >= 15 && dayNum <= 21;
      rows.push({ employeeId: 5, timeIn: "07:30", timeOut: isFri3 ? "19:00" : "18:00", status: "present" });

      // E6 Comptable : présent
      rows.push({ employeeId: 6, timeIn: "07:30", timeOut: "18:00", status: "present" });

      // E7 RH : présent ; maladie le 12
      rows.push({ employeeId: 7, timeIn: dayNum === 12 ? null : "07:30", timeOut: dayNum === 12 ? null : "18:00", status: dayNum === 12 ? "maladie" : "present" });

      // E8 Consultation : présent (sans salaire → pas de bulletin, mais présences suivies)
      rows.push({ employeeId: 8, timeIn: "07:30", timeOut: "18:00", status: "present" });

      await trpc("rhPresence.saveBatch", { date, rows });
    }

    // Autorisations HS E1 (2h, 2e jeudi)
    const thu2 = days.find((d) => new Date(`${d}T12:00:00`).getDay() === 4 && Number(d.slice(8, 10)) >= 8 && Number(d.slice(8, 10)) <= 14);
    if (thu2) {
      const ot = await trpc("rhPresence.requestOvertime", { employeeId: 1, date: thu2, maxHours: 2, reason: `Réparation urgente flotte — ${m}/2026` });
      await trpc("rhPresence.decideOvertime", { id: ot[0].result.data.json.id, status: "approuvee" });
    }

    // Congé E3 : 3 jours le 3e lundi-mardi-mercredi
    const thirdMon = days.filter((d) => new Date(`${d}T12:00:00`).getDay() === 1)[2];
    if (thirdMon) {
      const start = thirdMon;
      const end = days[days.indexOf(start) + 2];
      const leaveTypes = await trpcGet("rhSettings.listLeaveTypes", {});
      const conge = leaveTypes[0].result.data.json.find((t) => t.code === "CONGE_ANNUEL");
      const req = await trpc("rhLeave.createRequest", { employeeId: 3, leaveTypeId: conge.id, startDate: start, endDate: end, reason: `Congé annuel — ${m}/2026` });
      await trpc("rhLeave.decideRequest", { id: req[0].result.data.json.id, status: "approuve" });
      console.log(`  Congé E3 approuvé : ${start} → ${end}`);
    }
  }

  // ── 4. Clôture des 3 mois ──
  for (const { m } of MONTHS) {
    await trpc("rhPresence.closeMonth", { year: 2026, month: m });
  }
  console.log("3 mois de présences clôturés (juin, juillet, août).");

  // ── 5. RH-05 : évaluations (2 campagnes) ──
  const grids = await trpcGet("rhEvaluation.listGrids", {});
  const grid = grids[0].result.data.json[0];
  for (const [m, label] of [[6, "Juin"], [8, "Août"]]) {
    const camp = await trpc("rhEvaluation.createCampaign", { name: `Campagne ${label} 2026`, periodStart: `2026-${String(m).padStart(2, "0")}-01`, periodEnd: `2026-${String(m).padStart(2, "0")}-28` });
    const campId = camp[0].result.data.json.id;
    const crit = grid.criteria;
    // E5 : 4,15 en juin, 4,8 en août ; E4 : 3,2 en juin
    await trpc("rhEvaluation.saveEvaluation", { campaignId: campId, employeeId: 5, gridId: grid.id, scores: crit.map((c, i) => ({ criterionId: c.id, score: [4, 5, 3, 4, 5, 4][i] })), appreciation: "Bon technicien" });
    if (m === 8) {
      await trpc("rhEvaluation.saveEvaluation", { campaignId: campId, employeeId: 5, gridId: grid.id, scores: crit.map((c, i) => ({ criterionId: c.id, score: [5, 5, 4, 5, 5, 4][i] })), appreciation: "Excellente progression" });
    }
    if (m === 6) {
      await trpc("rhEvaluation.saveEvaluation", { campaignId: campId, employeeId: 4, gridId: grid.id, scores: crit.map((c) => ({ criterionId: c.id, score: 3 })), appreciation: "Régulier, peut mieux faire" });
    }
  }
  console.log("Évaluations : E5 (juin 4,15 / août 4,8), E4 (juin 3,2).");

  // ── 6. RH-04 : paie sur 3 périodes ──
  const PERIODS = [
    { start: "2026-06-01", end: "2026-06-30" },
    { start: "2026-07-01", end: "2026-07-31" },
    { start: "2026-08-01", end: "2026-08-31" },
  ];
  for (const p of PERIODS) {
    const period = await trpc("rhPayroll.openPeriod", { startDate: p.start, endDate: p.end });
    const periodId = period[0].result.data.json.id;
    const prep = await trpc("rhPayroll.prepareMonth", { periodId });
    console.log(`Période ${p.start} → ${p.end} : ${prep[0].result.data.json.created} bulletins générés`);
  }

  // Prime de performance E5 (août) : 15 000 (suggérée par la note 4,15/4,8)
  const entriesAug = await trpcGet("rhPayroll.listEntries", { periodId: (await trpcGet("rhPayroll.listPeriods", {}))[0].result.data.json.find((x) => x.startDate === "2026-08-01").id });
  const e5Aug = entriesAug[0].result.data.json.find((e) => e.employeeId === 5);
  await trpc("rhPayroll.adjustEntry", { id: e5Aug.id, performanceBonus: 15000, notes: "Prime performance août (note 4,8/5)" });

  // Paiements variés
  const entriesJun = await trpcGet("rhPayroll.listEntries", { periodId: (await trpcGet("rhPayroll.listPeriods", {}))[0].result.data.json.find((x) => x.startDate === "2026-06-01").id });
  const entriesJul = await trpcGet("rhPayroll.listEntries", { periodId: (await trpcGet("rhPayroll.listPeriods", {}))[0].result.data.json.find((x) => x.startDate === "2026-07-01").id });
  const e1Jun = entriesJun[0].result.data.json.find((e) => e.employeeId === 1);
  const e2Jul = entriesJul[0].result.data.json.find((e) => e.employeeId === 2);
  const e4Jun = entriesJun[0].result.data.json.find((e) => e.employeeId === 4);
  await trpc("rhPayroll.markPaid", { id: e1Jun.id, paymentMethod: "momo" });
  await trpc("rhPayroll.markPaid", { id: e2Jul.id, paymentMethod: "om" });
  await trpc("rhPayroll.markPaid", { id: e4Jun.id, paymentMethod: "especes" });
  await trpc("rhPayroll.markPaid", { id: e5Aug.id, paymentMethod: "virement" });
  console.log("Paiements : E1 juin (MoMo), E2 juillet (OM), E4 juin (Espèces), E5 août (Virement).");

  // ── 7. Récapitulatif ──
  console.log("\n=== RÉCAPITULATIF DES DONNÉES GÉNÉRÉES ===");
  const periods = await trpcGet("rhPayroll.listPeriods", {});
  console.log(`Périodes de paie : ${periods[0].result.data.json.length}`);
  const entries = await trpcGet("rhPayroll.listEntries", {});
  const all = entries[0].result.data.json;
  console.log(`Bulletins : ${all.length} (${all.filter((e) => e.status === "paye").length} payés)`);
  console.log(`PDF disponible pour chaque bulletin : /api/rh/bulletin-pdf/<id>`);
  console.log("\nLes données sont EN PLACE — vérifiez dans l'interface (Bureau → RH).");
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
