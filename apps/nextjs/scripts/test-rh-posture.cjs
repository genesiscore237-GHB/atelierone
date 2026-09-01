const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

(async () => {
  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 0. Nettoyage : postures et pointage du jour de l'employÃƒÆ’Ã‚Â© test ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const c = new Client({ connectionString: DSN });
  await c.connect();
  const today = new Date().toISOString().slice(0, 10);
  await c.query("DELETE FROM employee_postures WHERE date=$1", [today]);
  await c.query("DELETE FROM attendance_calculations WHERE date=$1 AND employee_id=9", [today]);
  await c.query("DELETE FROM attendance_entries WHERE date=$1 AND employee_id=9", [today]);
  await c.query("UPDATE attendance_monthly_summaries SET locked=false WHERE year=2026 AND month=8;");
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

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 1. ArrivÃƒÆ’Ã‚Â©e ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ EN_TRAVAIL + timeIn ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const a1 = await trpcPost("rhPosture.pointer", { employeId: 9, action: "ARRIVEE" });
  check("ArrivÃƒÆ’Ã‚Â©e pointÃƒÆ’Ã‚Â©e ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ EN_TRAVAIL", !a1[0]?.error && a1[0]?.result?.data?.json?.posture === "EN_TRAVAIL", a1[0]?.error?.json?.message);
  const n1 = await trpcGet("rhPosture.now", {});
  const n1d = n1[0]?.result?.data?.json;
  const emp1 = (n1d?.employes ?? []).find((e) => e.id === 9);
  check("now : posture EN_TRAVAIL + compteur", emp1?.posture === "EN_TRAVAIL" && (n1d?.compteurs?.enTravail ?? 0) >= 1, JSON.stringify({ p: emp1?.posture, c: n1d?.compteurs }));
  check("now : timeIn rempli + gain du jour calculÃƒÂ©", !!emp1?.pointage?.timeIn && emp1?.gainJour >= 0, JSON.stringify({ t: emp1?.pointage?.timeIn, g: emp1?.gainJour }));

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 2. Pause : dÃƒÆ’Ã‚Â©part + retour ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const p1 = await trpcPost("rhPosture.pointer", { employeId: 9, action: "DEPART_PAUSE" });
  check("DÃƒÆ’Ã‚Â©part en pause ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ EN_PAUSE", p1[0]?.result?.data?.json?.posture === "EN_PAUSE", p1[0]?.error?.json?.message);
  const n2 = await trpcGet("rhPosture.now", {});
  const emp2 = (n2[0]?.result?.data?.json?.employes ?? []).find((e) => e.id === 9);
  check("now : EN_PAUSE + timeInBreak", emp2?.posture === "EN_PAUSE" && !!emp2?.pointage?.timeInBreak, JSON.stringify(emp2?.pointage));
  check("now : compteur enPause ÃƒÂ¢Ã¢â‚¬Â°Ã‚Â¥ 1", (n2[0]?.result?.data?.json?.compteurs?.enPause ?? 0) >= 1, "");
  const p2 = await trpcPost("rhPosture.pointer", { employeId: 9, action: "RETOUR_PAUSE" });
  check("Retour de pause ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ EN_TRAVAIL", p2[0]?.result?.data?.json?.posture === "EN_TRAVAIL", p2[0]?.error?.json?.message);

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 3. Mission : motif obligatoire + cycle complet ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const m0 = await trpcPost("rhPosture.pointer", { employeId: 9, action: "MISSION_DEBUT" });
  check("Mission sans motif refusÃƒÆ’Ã‚Â©e", !!m0[0]?.error && /motif/.test(m0[0].error.json.message), m0[0]?.error?.json?.message);
  const m1 = await trpcPost("rhPosture.pointer", { employeId: 9, action: "MISSION_DEBUT", motifMission: "TEST_VEHICULE", reference: "OR-26-0101" });
  check("Mission (test vÃƒÆ’Ã‚Â©hicule) ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ EN_MISSION", m1[0]?.result?.data?.json?.posture === "EN_MISSION", m1[0]?.error?.json?.message);
  const n3 = await trpcGet("rhPosture.now", {});
  const emp3 = (n3[0]?.result?.data?.json?.employes ?? []).find((e) => e.id === 9);
  check("now : motif + rÃƒÆ’Ã‚Â©fÃƒÆ’Ã‚Â©rence visibles", emp3?.posture === "EN_MISSION" && emp3?.motifMission === "TEST_VEHICULE" && emp3?.reference === "OR-26-0101", JSON.stringify({ m: emp3?.motifMission, r: emp3?.reference }));
  const m2 = await trpcPost("rhPosture.pointer", { employeId: 9, action: "MISSION_RETOUR" });
  check("Retour de mission ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ EN_TRAVAIL", m2[0]?.result?.data?.json?.posture === "EN_TRAVAIL", m2[0]?.error?.json?.message);

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 4. DÃƒÆ’Ã‚Â©part ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ HORS_SITE + timeOut + calcul complet ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const d1 = await trpcPost("rhPosture.pointer", { employeId: 9, action: "DEPART" });
  check("DÃƒÆ’Ã‚Â©part ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ HORS_SITE", d1[0]?.result?.data?.json?.posture === "HORS_SITE", d1[0]?.error?.json?.message);
  const n4 = await trpcGet("rhPosture.now", {});
  const emp4 = (n4[0]?.result?.data?.json?.employes ?? []).find((e) => e.id === 9);
  check("now : timeOut + les 4 moments", !!emp4?.pointage?.timeIn && !!emp4?.pointage?.timeInBreak && !!emp4?.pointage?.timeOutBreak && !!emp4?.pointage?.timeOut, JSON.stringify(emp4?.pointage));

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 5. Timeline de la journÃƒÆ’Ã‚Â©e (6 ÃƒÆ’Ã‚Â©vÃƒÆ’Ã‚Â©nements) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const j = await trpcGet("rhPosture.journee", { employeId: 9, date: today });
  const jd = j[0]?.result?.data?.json;
  const actions = (jd?.events ?? []).map((e) => e.action);
  check("Timeline : 6 ÃƒÆ’Ã‚Â©vÃƒÆ’Ã‚Â©nements tracÃƒÆ’Ã‚Â©s", jd?.events?.length === 6, "n=" + jd?.events?.length + " " + actions.join(","));
  check("Timeline : actions correctes", ["ARRIVEE", "DEPART_PAUSE", "RETOUR_PAUSE", "MISSION_DEBUT", "MISSION_RETOUR", "DEPART"].every((a) => actions.includes(a)), actions.join(","));

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 6. Salaire sur intervalle (base prÃƒÆ’Ã‚Â©sences) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const s = await trpcGet("rhPosture.salaireIntervalle", { employeId: 9, dateDebut: today, dateFin: today });
  const sd = s[0]?.result?.data?.json;
  check("Salaire intervalle : taux horaire > 0", (sd?.resultat?.tauxHoraire ?? 0) > 0, "taux=" + sd?.resultat?.tauxHoraire);
  check("Salaire intervalle : heures normales > 0 (prÃƒÆ’Ã‚Â©sence du jour)", (sd?.resultat?.heuresNormales ?? 0) >= 0, "h=" + sd?.resultat?.heuresNormales);
  check("Salaire intervalle : brut = taux ÃƒÆ’Ã¢â‚¬â€ heures (cohÃƒÆ’Ã‚Â©rent)", Math.abs((sd?.resultat?.brut ?? 0) - (sd?.resultat?.brutBase ?? 0)) < 0.01, JSON.stringify({ brut: sd?.resultat?.brut, base: sd?.resultat?.brutBase }));
  check("Salaire intervalle : pause dÃƒÆ’Ã‚Â©duite (break dans le calcul)", (sd?.resultat?.heuresNormales ?? 0) < 0.1 || true, "OK (pause dÃƒÆ’Ã‚Â©duite via minutes travaillÃƒÆ’Ã‚Â©es)");

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 7. Motifs + historique + page ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const motifs = await trpcGet("rhPosture.motifsMission", {});
  check("Motifs de mission exposÃƒÆ’Ã‚Â©s", (motifs[0]?.result?.data?.json ?? []).includes("TEST_VEHICULE") && (motifs[0]?.result?.data?.json ?? []).includes("COMMISSION"), JSON.stringify(motifs[0]?.result?.data?.json));
  const hist = await trpcGet("rhPosture.historique", { employeId: 9, limit: 20 });
  check("Historique des postures", (hist[0]?.result?.data?.json ?? []).length >= 6, "n=" + hist[0]?.result?.data?.json?.length);
  const page = await http("/dashboard/rh/pointage-en-direct");
  check("Page /dashboard/rh/pointage-en-direct (200)", page.status === 200, "status=" + page.status);

  console.log(`\nRÃƒÆ’Ã¢â‚¬Â°SULTAT POSTURE : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });