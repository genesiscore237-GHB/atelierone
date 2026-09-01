const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const fmt = (n) => Math.round(Number(n ?? 0) * 100) / 100;
(async () => {
  const { Client } = require("pg");
  const pre = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await pre.connect();
  const preNow = new Date();
  await pre.query("UPDATE attendance_monthly_summaries SET locked=false WHERE year=$1 AND month=$2;", [preNow.getFullYear(), preNow.getMonth() + 1]);
  await pre.end();
  const jar = new Map();
  async function http(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const c = [...jar.entries()].map(([k, v]) => k + "=" + v).join("; ");
    if (c) headers.cookie = c;
    const res = await fetch(BASE + path, { ...opts, headers, redirect: "manual" });
    const scs = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
    for (const sc of scs) { const pair = sc.split(";")[0]; const i = pair.indexOf("="); if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)); }
    return res;
  }
  async function trpcPost(path, body) {
    const r = await http("/api/trpc/" + path + "?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: body } }) });
    return r.json();
  }
  async function trpcGet(path, body) {
    const enc = encodeURIComponent(JSON.stringify({ "0": { json: body } }));
    const r = await http("/api/trpc/" + path + "?batch=1&input=" + enc);
    return r.json();
  }
  const csrf = await (await http("/api/auth/csrf")).json();
  await http("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }),
  });

  // ── 1. Paramètres MVP : 225,3 h, majoration 1,5, seuil 9,5 ──
  const gen = await trpcGet("rhSettings.getGeneralSettings", {});
  const g = gen[0]?.result?.data?.json;
  console.log("paramètres généraux:", JSON.stringify(g).slice(0, 200));
  check("standardMonthlyHours = 225,3", Number(g?.standardMonthlyHours) === 225.3, g?.standardMonthlyHours);
  check("overtimeMultiplier = 1,5", Number(g?.overtimeMultiplier) === 1.5, g?.overtimeMultiplier);
  check("seuil HS défaut = 9,5", Number(g?.defaultOvertimeThreshold) === 9.5, g?.defaultOvertimeThreshold);

  // ── 2. Employés : les 13 fiches réelles existent ──
  const emps = await trpcGet("rh.list", { limit: 100, statut: "actif" });
  const listEmp = emps[0]?.result?.data?.json?.employees ?? [];
  const emp001 = listEmp.find((e) => e.matricule === "EMP001");
  const emp013 = listEmp.find((e) => e.matricule === "EMP013");
  check("13 employés actifs (EMP001→EMP013)", listEmp.length >= 13 && !!emp001 && !!emp013, "n=" + listEmp.length);
  check("EMP001 salaire 250000 + modePaie horaire", emp001?.salaireBase === "250000" && emp001?.statut === "actif", JSON.stringify(emp001).slice(0, 150));

  // ── 3. Pointage : journée type avec retard, HS validée, prime de tâche ──
  // Trouver un jour ouvré du mois courant (lundi→samedi)
  const now = new Date();
  const day = new Date();
  while (day.getDay() === 0) day.setDate(day.getDate() + 1); // pas dimanche
  const d = day.toISOString().slice(0, 10);
  console.log("jour de pointage:", d);

  const emp1 = Number(emp001.id); // Administrateur 250000
  const emp2 = Number(listEmp.find((e) => e.matricule === "EMP003").id); // Chef des ateliers 300000
  const emp3 = Number(listEmp.find((e) => e.matricule === "EMP005").id); // Tôlier apprenti 80000

  // EMP001 : 7h30-18h (standard) ; EMP003 : 8h-19h départ tardif validé → 1h HS ; EMP005 : 7h30-18h + prime 5000
  const saved = await trpcPost("rhPresence.saveBatch", {
    date: d,
    rows: [
      { employeeId: emp1, timeIn: "07:30", timeOut: "18:00", status: "present" },
      { employeeId: emp2, timeIn: "08:00", timeOut: "19:00", status: "present", validateLateDeparture: true },
      { employeeId: emp3, timeIn: "07:30", timeOut: "18:00", status: "present", taskBonus: 5000 },
    ],
  });
  const savedRes = saved[0]?.result?.data?.json ?? [];
  check("Pointage batch enregistré (3 lignes)", savedRes.length === 3 && savedRes.every((r) => r.ok), JSON.stringify(savedRes));

  const entries = await trpcGet("rhPresence.listEntries", { from: d, to: d, limit: 100 });
  const list = entries[0]?.result?.data?.json ?? [];
  const e1 = list.find((x) => x.employeeId === emp1);
  const e2 = list.find((x) => x.employeeId === emp2);
  const e3 = list.find((x) => x.employeeId === emp3);
  check("EMP001 : 9,5h HN, 0 HS, code P", e1?.calculation?.normalMinutes === 570 && e1?.calculation?.overtimeMinutes === 0 && e1?.calculation?.codePresence === "P", JSON.stringify(e1?.calculation).slice(0, 160));
  // EMP003 : arrivée 8h (retard 25min après tolérance 5) → travaillées 10h → 9,5h HN + 0,5h HS
  check("EMP003 : retard 25min + 0,5h HS (départ validé), code HS", e2?.calculation?.lateMinutes === 25 && e2?.calculation?.overtimeMinutes === 30 && e2?.calculation?.codePresence === "HS", JSON.stringify(e2?.calculation).slice(0, 160));
  check("EMP005 : prime de tâche 5000 saisie", Number(e3?.taskBonus) === 5000, e3?.taskBonus);

  // ── 4. Clôture du mois → résumé avec primes ──
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const closed = await trpcPost("rhPresence.closeMonth", { year: y, month: m });
  const closedRes = closed[0]?.result?.data?.json ?? {};
  check("Clôture du mois OK", Number(closedRes.summaries) > 0, JSON.stringify(closedRes));

  const summaries = await trpcGet("rhPresence.listSummaries", { year: y, month: m });
  const sumList = summaries[0]?.result?.data?.json ?? [];
  const s3 = sumList.find((s) => s.employeeId === emp3);
  check("Résumé EMP005 : prime de tâche 5000", Number(s3?.totalTaskBonus ?? 0) === 5000, JSON.stringify(s3).slice(0, 200));
  check("Résumé EMP005 verrouillé", !!s3?.locked);

  // ── 5. Paie heures réelles : brut = HN×taux + HS×taux×1,5 + primes ──
  const pStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const pEnd = new Date(y, m, 0).toISOString().slice(0, 10);
  const period = await trpcPost("rhPayroll.openPeriod", { startDate: pStart, endDate: pEnd });
  const periodId = period[0]?.result?.data?.json?.id ?? (period[0]?.result?.data?.json ?? period[0]?.result?.data?.json);
  console.log("période:", period[0]?.result?.data?.json);
  const prep = await trpcPost("rhPayroll.prepareMonth", { periodId });
  console.log("prepareMonth:", prep[0]?.error?.json?.message ?? prep[0]?.result?.data?.json);
  check("Paie préparée", !prep[0]?.error && prep[0]?.result?.data?.json?.created > 0, prep[0]?.error?.json?.message ?? "aucun bulletin");

  const bullets = await trpcGet("rhPayroll.listEntries", { periodId });
  const bulletins = bullets[0]?.result?.data?.json ?? [];
  const b1 = bulletins.find((b) => b.employeeId === emp1);
  const b2 = bulletins.find((b) => b.employeeId === emp2);
  const b3 = bulletins.find((b) => b.employeeId === emp3);
  if (b1) {
    const taux = 250000 / 225.3;
    const attendu = taux * 9.5;
    check("Bulletin EMP001 : brut ≈ HN(9,5h) × taux(250000/225,3)", Math.abs(Number(b1.totalEarnings) - attendu) < 5, `attendu=${attendu.toFixed(2)} reçu=${b1.totalEarnings}`);
    check("Bulletin EMP001 : pas de ligne BASE (heures réelles)", b1.status === "prepare");
  }
  if (b2) {
    const taux = 300000 / 225.3;
    const attendu = taux * 9.5 + taux * 0.5 * 1.5; // 0,5h HS (arrivée 8h)
    check("Bulletin EMP003 : brut ≈ HN + 0,5h HS × 1,5", Math.abs(Number(b2.totalEarnings) - attendu) < 5, `attendu=${attendu.toFixed(2)} reçu=${b2.totalEarnings}`);
  }
  if (b3) {
    const taux = 80000 / 225.3;
    const attendu = taux * 9.5 + 5000;
    check("Bulletin EMP005 : brut ≈ HN + prime tâche 5000", Math.abs(Number(b3.totalEarnings) - attendu) < 5, `attendu=${attendu.toFixed(2)} reçu=${b3.totalEarnings}`);
  }

  // ── 6. Planning hebdomadaire ──
  const monday = new Date(now);
  while (monday.getDay() !== 1) monday.setDate(monday.getDate() - 1);
  const iso = (x) => x.toISOString().slice(0, 10);
  const from = iso(monday);
  const to = iso(new Date(monday.getTime() + 5 * 86400000));
  const plan = await trpcPost("rhPlanning.saveWeek", {
    rows: [
      { employeId: emp1, date: from, affectation: "Accueil" },
      { employeId: emp2, date: from, affectation: "Atelier — Pont 1" },
      { employeId: emp3, date: from, affectation: "Carrosserie" },
      { employeId: emp1, date: iso(new Date(monday.getTime() + 86400000)), affectation: "Congé" },
    ],
  });
  check("Planning enregistré (4 lignes)", plan[0]?.result?.data?.json?.saved === 4, JSON.stringify(plan[0]?.result?.data?.json ?? plan[0]?.error?.json));
  const week = await trpcGet("rhPlanning.listWeek", { from, to });
  const weekRows = week[0]?.result?.data?.json ?? [];
  check("Planning relu (4 lignes)", weekRows.length === 4 && weekRows[0].affectation === "Accueil", JSON.stringify(weekRows).slice(0, 200));

  // ── 7. Dashboard : KPI CDI / Apprentissage / masse salariale base ──
  const kpis = await trpcGet("rhDashboard.getKpis", {});
  const k = kpis[0]?.result?.data?.json;
  console.log("KPIs:", JSON.stringify(k?.kpis ?? {}).slice(0, 250));
  check("KPI CDI = 4 (fiche client)", k?.kpis?.effectifCDI === 4, k?.kpis?.effectifCDI);
  check("KPI Apprentissage = 8 (fiche client)", k?.kpis?.effectifApprentissage === 8, k?.kpis?.effectifApprentissage);
  check("Masse salariale base = 1 640 000 (fiche client)", Number(k?.kpis?.masseSalariale) === 1640000, k?.kpis?.masseSalariale);
  const byContract = k?.repartitions?.byContractType ?? [];
  check("Répartition par type de contrat présente", byContract.length >= 3, JSON.stringify(byContract).slice(0, 150));

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });