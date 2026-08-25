const BASE = "http://localhost:3000";
const TS = Date.now();
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
(async () => {
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

  console.log("=== T1 — CYCLE COMPLET (Client → Véhicule → OR → Pièces → Livraison → Facture → Solde 0) ===");

  // ── 1. CLIENT ENTREPRISE (module Clients & Contrats) ──
  const c = await trpcPost("clients.create", {
    typeClient: "ENTR", raisonSociale: `TEST E2E Transports ${TS}`, niuNif: `M0TEST${TS}`, rccm: "RC/TEST/2026/0001",
    telephone: "699 11 11 11", email: `test-e2e-${TS}@transports.cm`, delaiPaiementJours: 30,
    contactPrincipal: { nom: "Diallo", telephone: "699 11 11 12", email: "d@transports.cm", fonction: "Directeur" },
  });
  const clientId = c[0]?.result?.data?.json?.id;
  check("Client ENTREPRISE créé (source de vérité)", !!clientId && /^CLT-/.test(c[0]?.result?.data?.json?.codeClient ?? ""), c[0]?.error?.json?.message);

  // ── 2. CONTRAT MAINTENANCE ACTIF (module Clients & Contrats) ──
  const ct = await trpcPost("contrats.create", {
    clientId, libelle: `Contrat flotte TEST E2E ${TS}`, typeContrat: "FORFAIT_ANNUEL",
    dateDebut: "2026-01-01", dateFin: "2026-12-31", delaiPaiementJours: 30, remisePourcent: 5, statutInitial: "ACTIF",
  });
  const contratId = ct[0]?.result?.data?.json?.id;
  check("Contrat maintenance ACTIF (remise 5 %) créé", !!contratId, ct[0]?.error?.json?.message);

  // ── 3. VÉHICULE couvert par le contrat (module Véhicules & Atelier) ──
  const v = await trpcPost("vehicules.create", { immatriculation: `LT-TEST-${TS}`, clientId, marque: "Toyota", modele: "Land Cruiser", annee: 2022, typeVehicule: "utilitaire", kilometrage: 15000 });
  const vehId = v[0]?.result?.data?.json?.id;
  check("Véhicule créé (EN RÉCEPTION)", !!vehId, v[0]?.error?.json?.message);
  const lc = await trpcPost("vehicules.lierContrat", { vehiculeId: vehId, contratId });
  check("Véhicule couvert par le contrat", !lc[0]?.error, lc[0]?.error?.json?.message);

  // ── 4. RÉCEPTION (OR, priorité P1, contrat auto) ──
  const ro = await trpcPost("or.create", {
    vehiculeId: vehId, plainte: "Vibration au freinage", priorite: "P1", motEntree: "PANNE",
    datePromesse: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), emplacement: "Pont 1",
    clientAttendSurPlace: true,
  });
  const orId = ro[0]?.result?.data?.json?.id;
  const orFiche = await trpcGet("or.getById", { id: orId });
  check("OR créé : EN_ATTENTE_DIAGNOSTIC + P1 + contrat auto", orFiche[0]?.result?.data?.json?.statut === "EN_ATTENTE_DIAGNOSTIC" && orFiche[0]?.result?.data?.json?.priorite === "P1" && orFiche[0]?.result?.data?.json?.contratId === contratId, JSON.stringify(orFiche[0]?.result?.data?.json).slice(0, 120));
  const ficheVeh = await trpcGet("vehicules.get", { id: vehId });
  check("Véhicule passé EN RÉPARATION", ficheVeh[0]?.result?.data?.json?.vehicule?.statutImmobilisation === "en_reparation", ficheVeh[0]?.result?.data?.json?.vehicule?.statutImmobilisation);

  // ── 5. DIAGNOSTIC → VALIDATION CHEF ──
  const prod = await trpcGet("catalog.list", { query: "Plaquettes atelier", limit: 10 });
  const prodId = Number((prod[0]?.result?.data?.json?.items ?? []).find((p) => p.titre === "Plaquettes atelier test")?.id);
  const rd = await trpcPost("or.creerRapportDiagnostic", {
    orId, constat: "Plaquettes usées, vibration au freinage", cause: "Plaquettes avant HS",
    lignes: [
      { type: "PIECE", produitId: prodId, libelle: "Plaquettes avant", quantite: 2, prixUnitaire: 25000, tva: 19.25 },
      { type: "SERVICE", libelle: "Main d'œuvre freinage", quantite: 2, prixUnitaire: 10000, tva: 19.25 },
    ],
  });
  const rapportId = rd[0]?.result?.data?.json?.rapportId;
  check("Diagnostic soumis (SOUMIS)", !!rapportId, rd[0]?.error?.json?.message);
  const rvD = await trpcPost("or.validerDiagnostic", { rapportId, commentaire: "Conforme" });
  check("Diagnostic validé par le chef (EN_COURS)", !rvD[0]?.error, rvD[0]?.error?.json?.message);

  // ── 6. DEVIS → ACCEPTÉ ──
  await trpcPost("or.soumettreDevis", { orId });
  const rvDev = await trpcPost("or.validerDevis", { orId, accepte: true });
  check("Devis accepté par le client (EN_COURS + devisAccepte)", !rvDev[0]?.error, rvDev[0]?.error?.json?.message);

  // ── 7. DEMANDE PIÈCES → SERVIE (stock 10→8 + SORTIE_OR) ──
  const rdm = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 2 }] });
  const demandeId = rdm[0]?.result?.data?.json?.demandeId;
  check("Demande de pièces créée", !!demandeId, rdm[0]?.error?.json?.message);
  const demListe = await trpcGet("or.listerDemandesPieces", { orId });
  const ligneId = (demListe[0]?.result?.data?.json ?? []).find((d) => d.id === demandeId)?.lignes?.[0]?.id;
  const rsv = await trpcPost("or.traiterDemandePieces", { demandeId, actions: [{ ligneId, servir: true, quantiteServie: 2 }] });
  check("Demande servie par le magasin (SERVIE)", !rsv[0]?.error && rsv[0]?.result?.data?.json?.statut === "SERVIE", rsv[0]?.error?.json?.message);
  const mvts = await trpcGet("stock.listMouvementsParOR", { orId });
  const mvt = (mvts[0]?.result?.data?.json ?? []).find((m) => m.produitId === prodId && m.type === "SORTIE_OR");
  check("Mouvement SORTIE_OR tracé à l'OR (2 pièces, stock 10→8)", !!mvt && Number(mvt.quantite) === 2 && Number(mvt.stockApres) === 8, JSON.stringify(mvts[0]?.result?.data?.json ?? []).slice(0, 140));

  // ── 8. RÉPARATION → CONTRÔLE QUALITÉ → PRÊT → LIVRÉ ──
  const r1 = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "CONTROLE_QUALITE" });
  check("EN_COURS → CONTRÔLE QUALITÉ (test)", r1[0]?.result?.data?.json?.statut === "CONTROLE_QUALITE", r1[0]?.error?.json?.message);
  const r2 = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "PRET_A_LIVRER" });
  check("CONTRÔLE QUALITÉ → PRÊT À LIVRER", r2[0]?.result?.data?.json?.statut === "PRET_A_LIVRER", r2[0]?.error?.json?.message);
  const r3 = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "LIVRE" });
  check("PRÊT À LIVRER → LIVRÉ (véhicule sorti)", r3[0]?.result?.data?.json?.statut === "LIVRE", r3[0]?.error?.json?.message);
  const ficheV2 = await trpcGet("vehicules.get", { id: vehId });
  check("Véhicule SORTI après livraison", ficheV2[0]?.result?.data?.json?.vehicule?.statutImmobilisation === "sorti", ficheV2[0]?.result?.data?.json?.vehicule?.statutImmobilisation);

  // ── 9. FACTURATION comptant (remise contrat 5 % auto) ──
  const fact = await trpcPost("or.facturer", { id: orId, modePaiement: "especes" });
  const fac = fact[0]?.result?.data?.json;
  check("Facture créée (FAC-, comptant)", !fact[0]?.error && /^FAC-/.test(fac?.reference ?? ""), fact[0]?.error?.json?.message);
  const brut = (2 * 25000 + 2 * 10000) * 1.1925; // 2×25000 + 2×10000, TVA 19,25 %
  const attendu = Math.round(brut * 0.95 * 100) / 100; // remise contrat 5 %
  check("Montant = lignes TVA incluse − remise 5 %", Math.abs(Number(fac?.montantTotal) - attendu) < 1, `attendu=${attendu} reçu=${fac?.montantTotal}`);
  const dFac = await trpcGet("or.getById", { id: orId });
  check("OR facturé (statut LIVRE + venteId)", dFac[0]?.result?.data?.json?.statut === "LIVRE" && !!dFac[0]?.result?.data?.json?.venteId, dFac[0]?.result?.data?.json?.statut);
  const dbl = await trpcPost("or.facturer", { id: orId, modePaiement: "especes" });
  check("Double facturation refusée", !!dbl[0]?.error && /déjà facturé/.test(dbl[0].error.json.message), dbl[0]?.error?.json?.message);

  // ── 10. SOLDE CLIENT = 0 (comptant) ──
  const ficheClient = await trpcGet("clients.get", { id: clientId });
  check("Solde client = 0 (facture comptant)", Number(ficheClient[0]?.result?.data?.json?.solde ?? -1) === 0, `solde=${ficheClient[0]?.result?.data?.json?.solde}`);

  // ── 11. TRACABILITÉ COMPLÈTE ──
  const df = await trpcGet("or.getById", { id: orId });
  const types = new Set((df[0]?.result?.data?.json?.historique ?? []).map((h) => h.type));
  const attendus = ["CREATION", "VALIDATION_DIAGNOSTIC", "VALIDATION_DEVIS", "DEMANDE_PIECES", "STATUT"];
  check("Historique : création + diagnostic + devis + demandes + statuts", attendus.every((t) => types.has(t)), [...types].join(","));
  const alerteOk = df[0]?.result?.data?.json?.alerte;
  check("Alerte = OK (véhicule livré)", alerteOk === "OK", `alerte=${alerteOk}`);

  console.log(`\nRÉSULTAT T1: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });