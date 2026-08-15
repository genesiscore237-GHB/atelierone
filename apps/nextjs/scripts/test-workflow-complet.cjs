/**
 * TEST E2E COMPLET — MODULE RH ATELIERONE (RH-00 → RH-05)
 * Scénario réaliste garage GPJ, août 2026, 5 employés.
 * Vérifications de cohérence calculées à la main (formules camerounaises).
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
const check = (label, actual, expected, tolerance = 0.01) => {
  let ok;
  if (typeof actual === "number" || typeof expected === "number") {
    const a = Number(actual), e = Number(expected);
    ok = !Number.isNaN(a) && !Number.isNaN(e) && Math.abs(a - e) <= tolerance;
  } else {
    ok = String(actual) === String(expected);
  }
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label} (obtenu: ${actual}, attendu: ${expected})`);
  return ok;
};

(async () => {
  const csrf = await (await http("/api/auth/csrf")).json();
  await http("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }),
  });
  const year = 2026, month = 8;
  const WEEK = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]; // lun→ven

  // ── 1. RH-00 : vérification du paramétrage seed ──
  console.log("\n=== 1. RH-00 PARAMÉTRAGE ===");
  const settings = await trpcGet("rhSettings.getAll", {});
  const s = settings[0].result.data.json;
  const cycleAtelier = s.cycles.find((c) => c.isDefault);
  check("Cycle par défaut « Atelier Standard »", cycleAtelier?.name ?? "(absent)", "Atelier Standard");
  check("Samedi : 07:30-12:00", cycleAtelier?.schedules?.find((x) => x.dayOfWeek === 6)?.endTime ?? "-", "12:00:00");
  check("Tolérance retard", s.attendance?.lateToleranceMinutes ?? -1, 5);
  check("Plafond heures/jour", s.attendance?.maxNormalHoursPerDay ?? "-", 8.5);
  check("Types de congés", s.leaveTypes?.length ?? 0, 7);
  check("Jours fériés", s.holidays?.length ?? 0, 6);
  const irppConfig = await trpcGet("rhPayroll.listItemsConfig", {});
  const irppItem = irppConfig[0].result.data.json.find((i) => i.code === "IRPP");
  check("IRPP au barème (5 tranches)", (irppItem?.params?.scale ?? []).length, 5);

  // ── 2. RH-01 : fiches employés complètes ──
  console.log("\n=== 2. RH-01 FICHES EMPLOYÉS ===");
  const FICHES = [
    { id: "1", nom: "Directeur", prenom: "Patron", salaire: "400000", dept: 1, poste: 1, cnss: "CNSS-0001" },   // Directeur
    { id: "2", nom: "Chef", prenom: "Atelier", salaire: "250000", dept: 2, poste: 2, cnss: "CNSS-0002", mgr: 1 }, // Chef atelier → Directeur
    { id: "3", nom: "Secretaire", prenom: "Accueil", salaire: "120000", dept: 5, poste: 9, cnss: "CNSS-0003", mgr: 2 },
    { id: "4", nom: "Magasinier", prenom: "Stock", salaire: "100000", dept: 4, poste: 7, cnss: "CNSS-0004", mgr: 2 },
    { id: "5", nom: "Technicien", prenom: "Atelier", salaire: "150000", dept: 2, poste: 3, cnss: "CNSS-0005", mgr: 2 },
  ];
  for (const f of FICHES) {
    await trpc("rh.update", {
      id: f.id, workCycleId: cycleAtelier.id, salaireBase: f.salaire, departmentId: f.dept,
      positionId: f.poste, managerId: f.mgr ?? null, numCnss: f.cnss,
    });
  }
  const fiche1 = await trpcGet("rh.getFiche", { id: "1" });
  check("Employé 1 : cycle affecté", fiche1[0].result.data.json.workCycleName ?? "(aucun)", "Atelier Standard");
  const fiche5 = await trpcGet("rh.getFiche", { id: "5" });
  check("Employé 5 : manager = Chef Atelier", fiche5[0].result.data.json.managerNom ?? "(aucun)", "Atelier Chef");

  // ── 3. RH-02 : présences semaine (5 jours) ──
  console.log("\n=== 3. RH-02 PRÉSENCES ===");
  // Employé 1 : 5 jours présents, mercredi 19:00 (2h HS autorisées)
  for (const d of WEEK) await trpc("rhPresence.saveEntry", { employeeId: 1, date: d, timeIn: "07:30", timeOut: d === "2026-08-12" ? "20:00" : "18:00", status: "present" });
  const ot1 = await trpc("rhPresence.requestOvertime", { employeeId: 1, date: "2026-08-12", maxHours: 2, reason: "Réparation urgente flotte" });
  await trpc("rhPresence.decideOvertime", { id: ot1[0].result.data.json.id, status: "approuvee" });
  await trpc("rhPresence.saveEntry", { employeeId: 1, date: "2026-08-12", timeIn: "07:30", timeOut: "20:00", status: "present" });
  // Employé 2 : 4 jours présents + 1 jour absent non justifié (jeudi 13)
  for (const d of WEEK) if (d !== "2026-08-13") await trpc("rhPresence.saveEntry", { employeeId: 2, date: d, timeIn: "07:30", timeOut: "18:00", status: "present" });
  await trpc("rhPresence.saveEntry", { employeeId: 2, date: "2026-08-13", status: "absent" });
  // Employé 3 : 4 jours présents (vendredi 14 en congé — demande RH-03)
  for (const d of WEEK) if (d !== "2026-08-14") await trpc("rhPresence.saveEntry", { employeeId: 3, date: d, timeIn: "07:30", timeOut: "18:00", status: "present" });
  // Employés 4 et 5 : 5 jours présents ; employé 5 : mercredi 19:00 (1h HS sans autorisation)
  for (const d of WEEK) { await trpc("rhPresence.saveEntry", { employeeId: 4, date: d, timeIn: "07:30", timeOut: "18:00", status: "present" }); }
  for (const d of WEEK) { await trpc("rhPresence.saveEntry", { employeeId: 5, date: d, timeIn: "07:30", timeOut: d === "2026-08-12" ? "19:00" : "18:00", status: "present" }); }

  const pres1 = await trpcGet("rhPresence.listEntries", { employeeId: 1 });
  const calc1 = pres1[0].result.data.json.find((e) => e.date === "2026-08-12").calculation;
  check("E1 mercredi : 2h HS validées (120 min)", calc1.overtimeMinutes, 120);
  const pres2 = await trpcGet("rhPresence.listEntries", { employeeId: 2 });
  check("E2 jeudi : absent", pres2[0].result.data.json.find((e) => e.date === "2026-08-13").status, "absent");
  const pres5 = await trpcGet("rhPresence.listEntries", { employeeId: 5 });
  const calc5 = pres5[0].result.data.json.find((e) => e.date === "2026-08-12").calculation;
  check("E5 mercredi : 1h HS sans autorisation → 0 HS", calc5.overtimeMinutes, 0);

  // ── 4. RH-03 : congé employé 3 (3 jours, approuvé) ──
  console.log("\n=== 4. RH-03 CONGÉS ===");
  const leaveTypes = await trpcGet("rhSettings.listLeaveTypes", {});
  const congeAnnuel = leaveTypes[0].result.data.json.find((t) => t.code === "CONGE_ANNUEL");
  const req = await trpc("rhLeave.createRequest", { employeeId: 3, leaveTypeId: congeAnnuel.id, startDate: "2026-08-17", endDate: "2026-08-19", reason: "Congé annuel" });
  check("Demande 3 jours ouvrés", req[0].result.data.json.daysCount, "3.0");
  await trpc("rhLeave.decideRequest", { id: req[0].result.data.json.id, status: "approuve" });
  const bal3 = await trpcGet("rhLeave.getBalances", { employeeId: 3 });
  const solde3 = bal3[0].result.data.json.find((b) => b.leaveTypeCode === "CONGE_ANNUEL");
  // Prorata : l'employé 3 est embauché en 2026 → acquis ~20 j (30 × mois/12), puis −3
  const acquis3 = Number(solde3.acquiredDays);
  check("Solde E3 = acquis(prorata) − 3", Number(solde3.balance), acquis3 - 3);
  const pres3 = await trpcGet("rhPresence.listEntries", { employeeId: 3, from: "2026-08-17", to: "2026-08-19" });
  check("E3 : 3 jours marqués congé", pres3[0].result.data.json.filter((e) => e.status === "conge").length, 3);

  // ── 5. RH-02 : clôture du mois ──
  console.log("\n=== 5. RH-02 CLÔTURE ===");
  const closed = await trpc("rhPresence.closeMonth", { year, month });
  check("Résumés générés (5 avec présences + 3 sans)", closed[0].result.data.json.summaries, 8);

  // ── 6. RH-05 : évaluations + prime suggérée ──
  console.log("\n=== 6. RH-05 ÉVALUATIONS ===");
  const grids = await trpcGet("rhEvaluation.listGrids", {});
  const grid = grids[0].result.data.json[0];
  const camp = await trpc("rhEvaluation.createCampaign", { name: "Campagne août 2026", periodStart: "2026-08-01", periodEnd: "2026-08-31" });
  const campId = camp[0].result.data.json.id;
  const crit = grid.criteria;
  const ev5 = await trpc("rhEvaluation.saveEvaluation", { campaignId: campId, employeeId: 5, gridId: grid.id, scores: crit.map((c, i) => ({ criterionId: c.id, score: [4, 5, 3, 4, 5, 4][i] })), appreciation: "Bon technicien" });
  check("E5 : note pondérée 4,15", ev5[0].result.data.json.globalScore, 4.15);
  const bonus5 = await trpcGet("rhEvaluation.getSuggestedBonus", { score: 4.15 });
  check("Prime suggérée E5 (≥ 4/5 → 15 000)", bonus5[0].result.data.json.suggestedBonus, 15000);

  // ── 7. RH-04 : période + préparation de la paie ──
  console.log("\n=== 7. RH-04 PAIE ===");
  const period = await trpc("rhPayroll.openPeriod", { startDate: "2026-08-01", endDate: "2026-08-31" });
  const periodId = period[0].result.data.json.id;
  const prep = await trpc("rhPayroll.prepareMonth", { periodId });
  check("Bulletins générés (5 employés avec salaire)", prep[0].result.data.json.created, 5);

  const entries = await trpcGet("rhPayroll.listEntries", { periodId });
  const byEmp = (id) => entries[0].result.data.json.find((e) => e.employeeId === id);

  // Vérifications calculs (formules camerounaises)
  // E1 : brut 400000 + 2h HS × (400000/208) × 1,25 = 404807,69 ; CNPS 4,5 % ; IRPP barème
  const e1 = byEmp(1);
  check("E1 brut (400 000 + HS 4 807,69)", e1.totalEarnings, 404807.69, 1);
  const e1Detail = await trpcGet("rhPayroll.getEntry", { id: e1.id });
  check("E1 CNPS 4,5 %", e1Detail[0].result.data.json.cnpsEmployee, 18216.35, 1);
  check("E1 net imposable", e1Detail[0].result.data.json.netImposable, 386591.35, 1);
  check("E1 IRPP (8 000 + 27 000 + 25 %×86 591,35)", e1Detail[0].result.data.json.irpp, 56647.84, 1);
  check("E1 net à payer", e1Detail[0].result.data.json.netPay, 329943.51, 1);

  // E2 : brut 250000, 1 absence (250000/26), CNPS, IRPP
  const e2 = byEmp(2);
  check("E2 brut 250 000", e2.totalEarnings, 250000, 0.01);
  check("E2 1 jour absent", e2.daysAbsent, 1);

  // E3 : brut 120000, 1 jour congé (pas une absence)
  const e3 = byEmp(3);
  check("E3 brut 120 000", e3.totalEarnings, 120000, 0.01);
  check("E3 jours absents = 0 (congé ≠ absence)", e3.daysAbsent, 0);

  // E5 : brut 150000 + 0 HS (sans autorisation) + prime perf 15000 (ajustement)
  const e5 = byEmp(5);
  check("E5 brut 150 000 (0 HS sans autorisation)", e5.totalEarnings, 150000, 0.01);
  const adj5 = await trpc("rhPayroll.adjustEntry", { id: e5.id, performanceBonus: 15000 });
  // brut 165000 → CNPS 7425 → imposable 157575 → IRPP 13636,25 → net 143938,75
  check("E5 ajusté +prime 15 000 (calcul camerounais)", adj5[0].result.data.json.netPay, 143938.75, 1);

  // ── 8. Paiements + PDF ──
  console.log("\n=== 8. PAIEMENTS & PDF ===");
  await trpc("rhPayroll.markPaid", { id: e1.id, paymentMethod: "momo" });
  await trpc("rhPayroll.markPaid", { id: e2.id, paymentMethod: "om" });
  const paid = await trpcGet("rhPayroll.listEntries", { periodId });
  const paidE1 = paid[0].result.data.json.find((e) => e.employeeId === 1);
  check("E1 payé MoMo", paidE1.status + "/" + paidE1.paymentMethod, "paye/momo");
  const pdfRes = await http(`/api/rh/bulletin-pdf/${e1.id}`);
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  check("PDF bulletin E1 généré", buf.length > 5000 ? "ok" : "trop petit", "ok");
  check("PDF = %PDF", String.fromCharCode(buf[0], buf[1]), "%P");

  console.log("\n=== FLUX COMPLET TERMINÉ ===");
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
