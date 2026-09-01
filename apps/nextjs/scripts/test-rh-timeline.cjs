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
  await c.query("DELETE FROM employee_postures WHERE date=$1", [today]);
  await c.query("DELETE FROM attendance_calculations WHERE date=$1 AND employee_id=9", [today]);
  await c.query("DELETE FROM attendance_entries WHERE date=$1 AND employee_id=9", [today]);
  await c.query(`UPDATE attendance_monthly_summaries SET locked=false WHERE year=${y} AND month=${m};`);
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
  const empId = 9;

  // ── 1. Cycle complet du pointage ──
  const a1 = await trpcPost("rhPosture.pointer", { employeId: empId, action: "ARRIVEE" });
  check("Arrivée pointée", !a1[0]?.error, a1[0]?.error?.json?.message);
  const a2 = await trpcPost("rhPosture.pointer", { employeId: empId, action: "DEPART_PAUSE" });
  check("Départ en pause", !a2[0]?.error, a2[0]?.error?.json?.message);
  const a3 = await trpcPost("rhPosture.pointer", { employeId: empId, action: "RETOUR_PAUSE" });
  check("Retour de pause", !a3[0]?.error, a3[0]?.error?.json?.message);
  const a4 = await trpcPost("rhPosture.pointer", { employeId: empId, action: "MISSION_DEBUT", motifMission: "TEST_VEHICULE", reference: "OR-26-0101" });
  check("Mission début", !a4[0]?.error, a4[0]?.error?.json?.message);
  const a5 = await trpcPost("rhPosture.pointer", { employeId: empId, action: "MISSION_RETOUR" });
  check("Mission retour", !a5[0]?.error, a5[0]?.error?.json?.message);
  const a6 = await trpcPost("rhPosture.pointer", { employeId: empId, action: "DEPART" });
  check("Départ", !a6[0]?.error, a6[0]?.error?.json?.message);
  let j = await trpcGet("rhPosture.journee", { employeId: empId, date: today });
  let jd = j[0]?.result?.data?.json;
  check("Timeline : 6 événements", (jd?.events ?? []).length === 6, "n=" + (jd?.events ?? []).length);
  check("Les 4 moments remplis", !!jd?.pointage?.timeIn && !!jd?.pointage?.timeInBreak && !!jd?.pointage?.timeOutBreak && !!jd?.pointage?.timeOut, JSON.stringify(jd?.pointage));

  // ── 2. R1 — séquence logique (employé non pointé aujourd'hui) ──
  const s1 = await trpcPost("rhPosture.pointer", { employeId: 10, action: "DEPART_PAUSE" });
  check("Séquence : DEPART_PAUSE sans arrivée refusé", !!s1[0]?.error && /arrivée/.test(s1[0].error.json.message), s1[0]?.error?.json?.message);

  // ── 3. R3 — annuler le DEPART → redevient EN_TRAVAIL ──
  const depEvt = (jd?.events ?? []).find((e) => e.action === "DEPART" && !e.annule);
  const an1 = await trpcPost("rhPosture.annulerEvenement", { evenementId: depEvt.id, motif: "Départ pointé par erreur" });
  check("Annulation tracée OK", !an1[0]?.error, an1[0]?.error?.json?.message);
  j = await trpcGet("rhPosture.journee", { employeId: empId, date: today });
  jd = j[0]?.result?.data?.json;
  check("Départ annulé → timeOut null", !jd?.pointage?.timeOut, JSON.stringify(jd?.pointage));
  check("Événement annulé visible (barré) + motif", jd?.events?.some((e) => e.id === depEvt.id && e.annule && e.motifAnnulation === "Départ pointé par erreur"), "audit manquant");
  const n1 = await trpcGet("rhPosture.now", {});
  const e1 = (n1[0]?.result?.data?.json?.employes ?? []).find((e) => e.id === empId);
  check("Posture auto-réparée : EN_TRAVAIL après annulation du départ", e1?.posture === "EN_TRAVAIL", e1?.posture);

  // ── 4. R4 — corriger l'heure d'arrivée (1 clic, tracé) ──
  const c1 = await trpcPost("rhPosture.corrigerHeure", { employeId: empId, date: today, moment: "timeIn", heure: "08:00" });
  check("Correction d'heure OK", !c1[0]?.error, c1[0]?.error?.json?.message);
  j = await trpcGet("rhPosture.journee", { employeId: empId, date: today });
  jd = j[0]?.result?.data?.json;
  check("timeIn corrigé = 08:00", (jd?.pointage?.timeIn ?? "").slice(0, 5) === "08:00", jd?.pointage?.timeIn);
  const saisie = jd?.events?.find((e) => e.action === "SAISIE_HEURE" && !e.annule);
  check("Événement SAISIE_HEURE tracé (08:00)", !!saisie && (saisie.heure ?? "").slice(0, 5) === "08:00", JSON.stringify(saisie));
  check("Ancien ARRIVEE invalidé", jd?.events?.some((e) => e.action === "ARRIVEE" && e.annule), "audit manquant");

  // ── 5. Annuler la pause → les moments pause redeviennent vides ──
  const pauseEvt = jd?.events?.find((e) => e.action === "DEPART_PAUSE" && !e.annule);
  const an2 = await trpcPost("rhPosture.annulerEvenement", { evenementId: pauseEvt.id, motif: "Pause saisie au mauvais moment" });
  check("Annulation pause OK", !an2[0]?.error, an2[0]?.error?.json?.message);
  j = await trpcGet("rhPosture.journee", { employeId: empId, date: today });
  jd = j[0]?.result?.data?.json;
  check("Pause annulée (bloc) → les 2 moments pause vides", !jd?.pointage?.timeInBreak && !jd?.pointage?.timeOutBreak, JSON.stringify(jd?.pointage));
  check("Calcul rejoué (existe encore)", !!jd?.calcul, "calcul manquant");

  // ── 6. Annuler tout le pointage du jour → ABSENT ──
  const an3 = await trpcPost("rhPosture.annulerJournee", { employeId: empId, date: today, motif: "Journée à re-pointer entièrement" });
  check("Annulation journée OK (n événements > 0)", !an3[0]?.error && (an3[0]?.result?.data?.json?.annules ?? 0) > 0, JSON.stringify(an3[0]?.result?.data?.json));
  j = await trpcGet("rhPosture.journee", { employeId: empId, date: today });
  jd = j[0]?.result?.data?.json;
  check("Journée annulée → timeIn null", !jd?.pointage?.timeIn, JSON.stringify(jd?.pointage));
  const n2 = await trpcGet("rhPosture.now", {});
  const e2 = (n2[0]?.result?.data?.json?.employes ?? []).find((e) => e.id === empId);
  check("Posture = ABSENT après annulation du jour", e2?.posture === "ABSENT", e2?.posture);
  check("Tous les événements invalidés (audit)", (jd?.events ?? []).every((e) => e.annule), "n=" + (jd?.events ?? []).length);

  // ── 7. R5 — statut congé via la grille → événement STATUT ; lever le congé = annuler ──
  const g1 = await trpcPost("rhPresence.saveEntry", { employeeId: empId, date: today, status: "conge" });
  check("Grille : congé posé", !g1[0]?.error, g1[0]?.error?.json?.message);
  j = await trpcGet("rhPosture.journee", { employeId: empId, date: today });
  jd = j[0]?.result?.data?.json;
  check("Événement STATUT créé + status conge", jd?.events?.some((e) => e.action === "STATUT" && !e.annule && e.posture === "CONGE") && jd?.pointage?.status === "conge", JSON.stringify(jd?.pointage));
  const statutEvt = jd?.events?.find((e) => e.action === "STATUT" && !e.annule);
  const an4 = await trpcPost("rhPosture.annulerEvenement", { evenementId: statutEvt.id, motif: "Le congé est levé" });
  check("Lever le congé = annuler le STATUT", !an4[0]?.error, an4[0]?.error?.json?.message);
  const n3 = await trpcGet("rhPosture.now", {});
  const e3 = (n3[0]?.result?.data?.json?.employes ?? []).find((e) => e.id === empId);
  check("Posture redevient ABSENT (congé levé, non re-pointé)", e3?.posture === "ABSENT", e3?.posture);

  // ── 8. R8 — reflet immédiat : la grille (listEntries) lit la projection ──
  const r1 = await trpcPost("rhPosture.pointer", { employeId: empId, action: "ARRIVEE" });
  const c2 = await trpcPost("rhPosture.corrigerHeure", { employeId: empId, date: today, moment: "timeIn", heure: "09:15" });
  const d1 = await trpcPost("rhPosture.pointer", { employeId: empId, action: "DEPART" });
  const c4 = await trpcPost("rhPosture.corrigerHeure", { employeId: empId, date: today, moment: "timeOut", heure: "17:00" });
  check("Re-pointage + corrections (09:15 / 17:00)", !r1[0]?.error && !c2[0]?.error && !d1[0]?.error && !c4[0]?.error, "pointage ou correction KO");
  const jComplet = await trpcGet("rhPosture.journee", { employeId: empId, date: today });
  const jcd = jComplet[0]?.result?.data?.json;
  check("Journée complète recalculée (pause théorique 1 h déduite : 465−60=405)", Number(jcd?.calcul?.workedMinutes) === 405, "w=" + jcd?.calcul?.workedMinutes);
  const grille = await trpcGet("rhPresence.listEntries", { from: today, to: today, limit: 100 });
  const row = (grille[0]?.result?.data?.json ?? []).find((x) => x.employeeId === empId);
  check("Grille reflète la timeline (09:15 / 17:00)", (row?.timeIn ?? "").slice(0, 5) === "09:15" && (row?.timeOut ?? "").slice(0, 5) === "17:00", JSON.stringify({ ti: row?.timeIn, to: row?.timeOut }));

  // ── 9. R7 — clôture : annulation refusée ──
  await trpcPost("rhPresence.closeMonth", { year: y, month: m });
  const jFin = await trpcGet("rhPosture.journee", { employeId: empId, date: today });
  const arrEvt = (jFin[0]?.result?.data?.json?.events ?? []).find((e) => !e.annule);
  const an5 = await trpcPost("rhPosture.annulerEvenement", { evenementId: arrEvt.id, motif: "Test clôture" });
  check("Annulation refusée après clôture", !!an5[0]?.error && /clôturé/.test(an5[0].error.json.message), an5[0]?.error?.json?.message);

  // ── 10. Nettoyage ──
  const c3 = new Client({ connectionString: DSN });
  await c3.connect();
  await c3.query("DELETE FROM employee_postures WHERE date=$1", [today]);
  await c3.query("DELETE FROM attendance_calculations WHERE date=$1 AND employee_id=9", [today]);
  await c3.query("DELETE FROM attendance_entries WHERE date=$1 AND employee_id=9", [today]);
  await c3.query(`UPDATE attendance_monthly_summaries SET locked=false WHERE year=${y} AND month=${m};`);
  await c3.end();

  console.log(`\nRÉSULTAT TIMELINE : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });