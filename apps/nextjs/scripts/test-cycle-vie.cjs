const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();
  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  const immat = `CV-${suffix}-AB`;
  await c.query("DELETE FROM lignes_ordre_reparation WHERE ordre_id IN (SELECT id FROM ordres_reparation WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE $1))", [`CV-%-AB`]);
  await c.query("DELETE FROM ordres_reparation WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE $1)", [`CV-%-AB`]);
  await c.query("UPDATE vehicules SET is_active=false WHERE immatriculation LIKE $1", [`CV-%-AB`]);
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

  // ── 1. Réception + diagnostic enrichi (DTC/tests) ──
  const rec = await trpcPost("or.receptionner", {
    client: { nom: `CycleTest${suffix}` },
    vehicule: { immatriculation: immat, marque: "Toyota", modele: "Corolla" },
    reception: { kilometrageEntree: 90000, pannesDeclarees: "Voyant moteur", motEntree: "PANNE", outillage: {}, signatureDeposant: "Test" },
  });
  const orId = Number(rec[0]?.result?.data?.json?.id);
  check("Réception créée", !!orId, rec[0]?.error?.json?.message);
  const diag = await trpcPost("or.creerRapportDiagnostic", {
    orId, constat: "Défaut sonde lambda banc 1", cause: "Sonde HS",
    codesDTC: "P0134, P0135", tests: "Valise OBD + contrôle tension",
    lignes: [
      { type: "SERVICE", libelle: "Diagnostic électronique", quantite: 1, prixUnitaire: 10000 },
      { type: "PIECE", libelle: "Sonde lambda", quantite: 1, prixUnitaire: 25000 },
    ],
  });
  const rapportId = Number(diag[0]?.result?.data?.json?.rapportId);
  check("Diagnostic enrichi soumis (DTC + tests)", !!rapportId, diag[0]?.error?.json?.message);
  await trpcPost("or.validerDiagnostic", { rapportId });

  // ── 2. DVI : points + envoi (figé) + conversion en lignes ──
  const dvi = await trpcPost("or.sauvegarderInspection", {
    orId, template: "MULTI_POINTS",
    points: [
      { groupe: "Freinage", libelle: "Plaquettes avant", statut: "SURVEILLER", mesure: "2.1 mm", priorite: "PROCHE_VISITE" },
      { groupe: "Freinage", libelle: "Disques avant", statut: "URGENT", mesure: "rayés", notes: "Changement conseillé", priorite: "IMMEDIATE" },
      { groupe: "Pneumatiques", libelle: "Pneu AVG", statut: "OK", mesure: "6 mm" },
    ],
  });
  const inspectionId = Number(dvi[0]?.result?.data?.json?.inspectionId);
  check("Inspection DVI créée (3 points)", !!inspectionId, dvi[0]?.error?.json?.message);
  const env = await trpcPost("or.envoyerInspection", { inspectionId });
  check("Inspection envoyée (figée)", !env[0]?.error, env[0]?.error?.json?.message);
  const inspections = await trpcGet("or.listerInspections", { orId });
  const insp = (inspections[0]?.result?.data?.json ?? []).find((i) => i.id === inspectionId);
  check("DVI listé avec ses points (statut ENVOYE)", insp?.statut === "ENVOYE" && (insp?.points ?? []).length === 3, JSON.stringify(insp).slice(0, 120));
  const urgents = (insp?.points ?? []).filter((p) => p.statut === "URGENT" || p.statut === "SURVEILLER");
  const conv = await trpcPost("or.convertirPointsEnLignes", { orId, pointIds: urgents.map((p) => p.id), prixUnitaire: 0 });
  check("Points DVI convertis en lignes de devis", !conv[0]?.error && conv[0]?.result?.data?.json?.lignes === 2, JSON.stringify(conv[0]?.result?.data?.json));

  // ── 3. Devis : version + autorisation LIGNE PAR LIGNE (1 autorisée, 1 déclinée) ──
  await trpcPost("or.creerVersionDevis", { orId });
  const versions = await trpcGet("or.listerDevisVersions", { orId });
  const v1 = (versions[0]?.result?.data?.json ?? []).find((v) => v.version === 1);
  check("Devis v1 créé (versionné)", !!v1 && v1.statut === "BROUILLON", JSON.stringify(v1));
  await trpcPost("or.envoyerVersionDevis", { devisVersionId: v1.id });
  const getOr = await trpcGet("or.getById", { id: orId });
  const lignes = (getOr[0]?.result?.data?.json?.lignes ?? []);
  check("OR en attente de validation (devis envoyé)", getOr[0]?.result?.data?.json?.statut === "EN_ATTENTE_VALIDATION", getOr[0]?.result?.data?.json?.statut);
  const ligneAutoriser = lignes.find((l) => String(l.libelle).includes("Sonde"));
  const ligneDecliner = lignes.find((l) => String(l.libelle).includes("Disques"));
  const aut = await trpcPost("or.autoriserLignes", {
    orId, devisVersionId: v1.id,
    lignes: [
      { ligneId: ligneAutoriser.id, statut: "AUTORISE" },
      { ligneId: ligneDecliner.id, statut: "DECLINE" },
    ],
    methode: "SMS", qui: "Client CycleTest",
  });
  check("Autorisation ligne par ligne (1 auto, 1 déclinée)", !aut[0]?.error && aut[0]?.result?.data?.json?.autorises === 1 && aut[0]?.result?.data?.json?.declines === 1, JSON.stringify(aut[0]?.result?.data?.json ?? aut[0]?.error?.json?.message));
  const getOr2 = await trpcGet("or.getById", { id: orId });
  const l2 = (getOr2[0]?.result?.data?.json?.lignes ?? []);
  const sonde = l2.find((l) => String(l.libelle).includes("Sonde"));
  const disque = l2.find((l) => String(l.libelle).includes("Disques"));
  check("Ligne AUTORISÉE + OR EN_COURS", sonde?.statutAutorisation === "AUTORISE" && getOr2[0]?.result?.data?.json?.statut === "EN_COURS", JSON.stringify({ s: sonde?.statutAutorisation, st: getOr2[0]?.result?.data?.json?.statut }));
  check("Ligne DÉCLINÉE conservée (deferred work)", disque?.statutAutorisation === "DECLINE", "ligne perdue ?");
  const vers2 = await trpcGet("or.listerDevisVersions", { orId });
  check("Version v1 = AUTORISE_PARTIEL", (vers2[0]?.result?.data?.json ?? []).find((v) => v.version === 1)?.statut === "AUTORISE_PARTIEL", "statut incorrect");

  // ── 4. Job card : ligne bloquée + pointage début/fin (timer) + historique ──
  const bl = await trpcPost("or.updateLigne", { id: sonde.id, bloque: true, raisonBlocageLigne: "Attente pièce en magasin" });
  check("Ligne bloquée (raison)", !bl[0]?.error, bl[0]?.error?.json?.message);
  await trpcPost("or.updateLigne", { id: sonde.id, statut: "fait" });
  const pt1 = await trpcPost("or.pointageIntervention", { orId, technicienId: 13, dateIntervention: new Date().toISOString().slice(0, 10), description: "Diagnostic + sonde" });
  check("Pointage démarré (timer)", !!pt1[0]?.result?.data?.json?.id, pt1[0]?.error?.json?.message);
  const pt2 = await trpcPost("or.pointageIntervention", { orId, technicienId: 13, dateIntervention: new Date().toISOString().slice(0, 10), heureFin: true });
  check("Pointage terminé (durée calculée > 0)", !pt2[0]?.error && Number(pt2[0]?.result?.data?.json?.dureeHeures) > 0, JSON.stringify(pt2[0]?.result?.data?.json ?? pt2[0]?.error?.json?.message));

  // ── 5. Contrôle qualité : rejet impossible si non conforme → valide → PRET_A_LIVRER ──
  const qcKo = await trpcPost("or.validerControleQualite", {
    orId, resultat: "VALIDE",
    checklist: [{ libelle: "Travaux conformes", ok: false }, { libelle: "Niveaux liquides", ok: true }],
  });
  check("Validation QC refusée si point non conforme", !!qcKo[0]?.error, qcKo[0]?.error?.json?.message);
  const qcOk = await trpcPost("or.validerControleQualite", {
    orId, resultat: "VALIDE", essaiRoutier: true, distanceEssai: "5 km",
    checklist: [{ libelle: "Travaux conformes", ok: true }, { libelle: "Niveaux liquides", ok: true }, { libelle: "Absence de fuite", ok: true }],
  });
  check("Contrôle qualité validé → PRÊT À LIVRER", !qcOk[0]?.error && qcOk[0]?.result?.data?.json?.nouveauStatut === "PRET_A_LIVRER", qcOk[0]?.error?.json?.message);

  // ── 6. Restitution : check-list sortie + signature → LIVRE ──
  const rest = await trpcPost("or.restituerVehicule", {
    orId, kilometrageSortie: 90012, niveauCarburantSortie: "1/4",
    checklist: [
      { libelle: "Outillage / accessoires vérifiés (vs entrée)", ok: true },
      { libelle: "Clés rendues", ok: true },
      { libelle: "Documents du véhicule", ok: true },
    ],
    recuperateurNom: "M. Client", signatureClient: "Client CycleTest", observations: "Travaux autorisés réalisés ; disques déclinés",
  });
  check("Restitution validée → LIVRE + km sortie", !rest[0]?.error, rest[0]?.error?.json?.message);
  const getOr3 = await trpcGet("or.getById", { id: orId });
  check("OR LIVRE + km sortie enregistré", getOr3[0]?.result?.data?.json?.statut === "LIVRE" && Number(getOr3[0]?.result?.data?.json?.kilometrageSortie) === 90012, JSON.stringify({ st: getOr3[0]?.result?.data?.json?.statut, km: getOr3[0]?.result?.data?.json?.kilometrageSortie }));

  // ── 7. Audit : historiques DVI, LIGNE, TEMPS, QC, RESTITUTION ──
  const c2 = new Client({ connectionString: DSN });
  await c2.connect();
  const types = (await c2.query("SELECT DISTINCT type FROM or_historique WHERE or_id=$1", [orId])).rows.map((r) => r.type);
  for (const t of ["DVI", "LIGNE", "TEMPS", "CONTROLE_QUALITE", "RESTITUTION", "VALIDATION_DEVIS", "VALIDATION_DIAGNOSTIC"]) {
    check(`Audit : ${t} tracé`, types.includes(t), "types=" + types.join(","));
  }
  const autorisationsBd = (await c2.query("SELECT statut, methode FROM or_autorisations WHERE or_id=$1 ORDER BY id", [orId])).rows;
  check("Autorisations en base (AUTORISE + DECLINE, méthode SMS)", autorisationsBd.length === 2 && autorisationsBd[0].statut === "AUTORISE" && autorisationsBd[0].methode === "SMS" && autorisationsBd[1].statut === "DECLINE", JSON.stringify(autorisationsBd));

  // ── 8. Nettoyage ──
  await c2.query("DELETE FROM lignes_ordre_reparation WHERE ordre_id IN (SELECT id FROM ordres_reparation WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE $1))", [`CV-%-AB`]);
  await c2.query("DELETE FROM ordres_reparation WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE $1)", [`CV-%-AB`]);
  await c2.query("UPDATE vehicules SET is_active=false WHERE immatriculation LIKE $1", [`CV-%-AB`]);
  await c2.query("UPDATE clients SET is_active=false WHERE nom LIKE $1", [`CycleTest${suffix}%`]);
  await c2.end();

  console.log(`\nRÉSULTAT CYCLE DE VIE : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });