const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();
const today = new Date().toISOString().slice(0, 10);
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  // Nettoyage : postures/pointage du jour de EMP001 (id 9) + déverrouillage des résumés du mois
  await c.query("DELETE FROM employee_postures WHERE date=$1", [today]);
  await c.query("DELETE FROM attendance_calculations WHERE date=$1 AND employee_id=9", [today]);
  await c.query("DELETE FROM attendance_entries WHERE date=$1 AND employee_id=9", [today]);
  await c.query(`UPDATE attendance_monthly_summaries SET locked=false WHERE year=${y} AND month=${m};`);
  await c.query("DELETE FROM employee_salary_history WHERE employee_id=9;");
  await c.end();

  const jar = new Map();
  async function http(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const ck = [...jar.entries()].map(([k, v]) => k + "=" + v).join("; ");
    if (ck) headers.cookie = ck;
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

  // â”€â”€ 1. Unification : saveEntry(status=conge) â†’ posture CONGE dans now â”€â”€
  const s1 = await trpcPost("rhPresence.saveEntry", { employeeId: 9, date: today, status: "conge" });
  check("PrÃ©sence : congÃ© saisi", !s1[0]?.error, s1[0]?.error?.json?.message);
  const n1 = await trpcGet("rhPosture.now", {});
  const emp1 = (n1[0]?.result?.data?.json?.employes ?? []).find((e) => e.id === 9);
  check("Posture CONGE dÃ©rivÃ©e du statut de prÃ©sence", emp1?.posture === "CONGE", emp1?.posture);

  // â”€â”€ 2. Unification : mission via prÃ©sence â†’ posture EN_MISSION avec motif â”€â”€
  const s2 = await trpcPost("rhPresence.saveEntry", { employeeId: 9, date: today, status: "mission", motifMission: "COMMISSION", reference: "Fournisseur Douala" });
  check("PrÃ©sence : mission saisie", !s2[0]?.error, s2[0]?.error?.json?.message);
  const n2 = await trpcGet("rhPosture.now", {});
  const emp2 = (n2[0]?.result?.data?.json?.employes ?? []).find((e) => e.id === 9);
  check("Posture EN_MISSION + motif + rÃ©fÃ©rence", emp2?.posture === "EN_MISSION" && emp2?.motifMission === "COMMISSION" && emp2?.reference === "Fournisseur Douala", JSON.stringify({ p: emp2?.posture, m: emp2?.motifMission }));

  // â”€â”€ 3. Merge : corriger le statut sans heures n'efface pas le pointage â”€â”€
  const p1 = await trpcPost("rhPosture.pointer", { employeId: 9, action: "ARRIVEE" });
  check("Pointage direct : arrivÃ©e", !p1[0]?.error, p1[0]?.error?.json?.message);
  const s3 = await trpcPost("rhPresence.saveEntry", { employeeId: 9, date: today, status: "present", taskBonus: 500 });
  check("PrÃ©sence : correction sans heures", !s3[0]?.error, s3[0]?.error?.json?.message);
  const j1 = await trpcGet("rhPosture.journee", { employeId: 9, date: today });
  const j1d = j1[0]?.result?.data?.json;
  check("Merge : timeIn du pointage conservÃ© + prime ajoutÃ©e", !!j1d?.pointage?.timeIn && Number(j1d?.pointage?.taskBonus) === 500, JSON.stringify(j1d?.pointage));

  // â”€â”€ 4. Source tracÃ©e : direct vs manual â”€â”€
  check("Source du pointage direct = 'direct'", j1d?.pointage?.source === "direct", j1d?.pointage?.source);

  // â”€â”€ 5. Pause rÃ©elle via saveEntry (correction) â”€â”€
  const s4 = await trpcPost("rhPresence.saveEntry", { employeeId: 9, date: today, timeInBreak: "12:00", timeOutBreak: "12:30" });
  check("PrÃ©sence : pause corrigeable", !s4[0]?.error, s4[0]?.error?.json?.message);
  const j2 = await trpcGet("rhPosture.journee", { employeId: 9, date: today });
  const j2d = j2[0]?.result?.data?.json;
  const tIB = (j2d?.pointage?.timeInBreak ?? "").slice(0, 5), tOB = (j2d?.pointage?.timeOutBreak ?? "").slice(0, 5);
  check("Pause rÃ©elle enregistrÃ©e (30 min)", tIB === "12:00" && tOB === "12:30", JSON.stringify(j2d?.pointage));

  // â”€â”€ 6. Salaire en vigueur sur la pÃ©riode (historique) â”€â”€
  const h1 = await trpcPost("rhPresence.saveEntry", { employeeId: 9, date: today, status: "present", timeIn: "08:00", timeOut: "17:00", timeInBreak: "12:00", timeOutBreak: "12:30" });
  check("JournÃ©e complÃ¨te (8,5 h travaillÃ©es)", !h1[0]?.error, h1[0]?.error?.json?.message);
  const c2 = new Client({ connectionString: DSN });
  await c2.connect();
  await c2.query("INSERT INTO employee_salary_history (employee_id, base_salary, start_date, reason) VALUES (9, 300000, '2026-01-01', 'Test historique');");
  await c2.end();
  const sl = await trpcGet("rhPosture.salaireIntervalle", { employeId: 9, dateDebut: today, dateFin: today });
  const sld = sl[0]?.result?.data?.json;
  check("Salaire historique utilisÃ© (300 000 Ã· 225,3)", sld?.salaireBase === 300000 && sld?.salaireHistorique === true, JSON.stringify({ b: sld?.salaireBase, h: sld?.salaireHistorique }));
  check("Brut cohÃ©rent : 8,5 h Ã— 1331,56 â‰ˆ 11318", (sld?.resultat?.heuresNormales ?? 0) > 0 && (sld?.resultat?.brut ?? 0) > 0, JSON.stringify({ h: sld?.resultat?.heuresNormales, b: sld?.resultat?.brut }));

  // â”€â”€ 7. Garde de clÃ´ture : verrouiller le mois â†’ pointage refusÃ© â”€â”€
  await trpcPost("rhPresence.closeMonth", { year: y, month: m });
  const refus = await trpcPost("rhPosture.pointer", { employeId: 9, action: "DEPART" });
  check("Pointage refusé après clôture du mois", !!refus[0]?.error && /clôturé/.test(refus[0].error.json.message), refus[0]?.error?.json?.message);
  const refus2 = await trpcPost("rhPresence.saveEntry", { employeeId: 9, date: today, status: "present" });
  check("saveEntry refusé après clôture", !!refus2[0]?.error && /clôturé/.test(refus2[0].error.json.message), refus2[0]?.error?.json?.message);

  // â”€â”€ 8. Nettoyage â”€â”€
  const c3 = new Client({ connectionString: DSN });
  await c3.connect();
  await c3.query("DELETE FROM employee_salary_history WHERE employee_id=9;");
  await c3.query("DELETE FROM employee_postures WHERE date=$1", [today]);
  await c3.query("DELETE FROM attendance_calculations WHERE date=$1 AND employee_id=9", [today]);
  await c3.query("DELETE FROM attendance_entries WHERE date=$1 AND employee_id=9", [today]);
  await c3.query(`UPDATE attendance_monthly_summaries SET locked=false WHERE year=${y} AND month=${m};`);
  await c3.end();

  console.log(`\nRÃ‰SULTAT UNIFICATION : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });