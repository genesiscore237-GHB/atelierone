const BASE = "http://localhost:3000";
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

  // ── 1. Réception (cycle) ──
  const rv = await trpcPost("vehicules.create", { immatriculation: "LT-CYCLE-AT", marque: "Peugeot", modele: "308", typeVehicule: "voiture" });
  const vehId = rv[0]?.result?.data?.json?.id;
  const rc = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: "Cycle", prenom: "Atelier", telephone: "699 00 00 09" });
  const clientId = rc[0]?.result?.data?.json?.id;
  const ro = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Bruit moteur", priorite: "P2", motEntree: "DIAGNOSTIC" });
  const orId = ro[0]?.result?.data?.json?.id;
  check("Réception OR créé (EN_ATTENTE_DIAGNOSTIC)", !!orId && ro[0]?.result?.data?.json?.statut === "EN_ATTENTE_DIAGNOSTIC", ro[0]?.error?.json?.message);

  // ── 2. Diagnostic du technicien → validation chef ──
  const prod = await trpcGet("catalog.list", { query: "Plaquettes atelier", limit: 10 });
  const prodId = Number((prod[0]?.result?.data?.json?.items ?? []).find((p) => p.titre === "Plaquettes atelier test")?.id);
  check("Produit de test trouvé", !!prodId, JSON.stringify((prod[0]?.result?.data?.json?.items ?? []).slice(0, 2)));
  const rd = await trpcPost("or.creerRapportDiagnostic", {
    orId,
    constat: "Bruit au démarrage, courroie détériorée",
    cause: "Courroie d'accessoires usée",
    lignes: [
      { type: "PIECE", produitId: prodId, libelle: "Plaquettes avant", quantite: 2, prixUnitaire: 25000 },
      { type: "SERVICE", libelle: "Main d'œuvre", quantite: 2, prixUnitaire: 10000 },
    ],
  });
  const rapportId = rd[0]?.result?.data?.json?.rapportId;
  check("Diagnostic soumis (SOUMIS, OR → à valider)", !!rapportId && ro[0]?.result?.data?.json, rd[0]?.error?.json?.message);
  const d1 = await trpcGet("or.getById", { id: orId });
  check("Rapport SOUMIS + OR EN_ATTENTE_VALIDATION_DIAGNOSTIC", d1[0]?.result?.data?.json?.rapportDiagnostic?.statut === "SOUMIS" && d1[0]?.result?.data?.json?.statut === "EN_ATTENTE_VALIDATION_DIAGNOSTIC", JSON.stringify(d1[0]?.result?.data?.json?.rapportDiagnostic).slice(0, 100));

  const rv2 = await trpcPost("or.validerDiagnostic", { rapportId, commentaire: "OK, travaux conformes" });
  check("Diagnostic validé par le chef (OR → EN_COURS)", !rv2[0]?.error, rv2[0]?.error?.json?.message);
  const d2 = await trpcGet("or.getById", { id: orId });
  check("Rapport VALIDE + OR EN_COURS", d2[0]?.result?.data?.json?.rapportDiagnostic?.statut === "VALIDE" && d2[0]?.result?.data?.json?.statut === "EN_COURS");

  // ── 3. Devis : soumission → refus (motif) → réapprobation ──
  const rv3 = await trpcPost("or.soumettreDevis", { orId });
  check("Devis soumis (OR → EN_ATTENTE_VALIDATION)", !rv3[0]?.error, rv3[0]?.error?.json?.message);
  const rv3b = await trpcPost("or.validerDevis", { orId, accepte: false });
  check("Refus de devis sans motif → refusé", !!rv3b[0]?.error && /motif/.test(rv3b[0].error.json.message), rv3b[0]?.error?.json?.message);
  const rv3c = await trpcPost("or.validerDevis", { orId, accepte: false, motif: "Prix trop élevé" });
  check("Refus de devis avec motif → tracé", !rv3c[0]?.error, rv3c[0]?.error?.json?.message);
  await trpcPost("or.soumettreDevis", { orId });
  const rv3d = await trpcPost("or.validerDevis", { orId, accepte: true });
  check("Devis accepté → EN_COURS", !rv3d[0]?.error, rv3d[0]?.error?.json?.message);
  const d3 = await trpcGet("or.getById", { id: orId });
  check("devisAccepte = true + historique VALIDATION_DEVIS", d3[0]?.result?.data?.json?.devisAccepte === true && (d3[0]?.result?.data?.json?.historique ?? []).some((h) => h.type === "VALIDATION_DEVIS"));

  // ── 4. Demande de pièces : servie par le magasin ──
  const r4 = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 2, prixEstime: 25000, note: "Avant" }] });
  const demandeId = r4[0]?.result?.data?.json?.demandeId;
  check("Demande créée (EN_ATTENTE)", !!demandeId, r4[0]?.error?.json?.message);
  const r4b = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 1 }] });
  check("Demande en cours → doublon refusé", !!r4b[0]?.error && /déjà en cours/.test(r4b[0].error.json.message), r4b[0]?.error?.json?.message);

  const demListe = await trpcGet("or.listerDemandesPieces", { orId });
  const ligneId = (demListe[0]?.result?.data?.json ?? []).find((d) => d.id === demandeId)?.lignes?.[0]?.id;
  const r4c = await trpcPost("or.traiterDemandePieces", { demandeId, actions: [{ ligneId, servir: true, quantiteServie: 2 }] });
  check("Demande servie par le magasin → SERVIE", !r4c[0]?.error && r4c[0]?.result?.data?.json?.statut === "SERVIE", r4c[0]?.error?.json?.message);

  const mvts = await trpcGet("stock.listMouvementsParOR", { orId });
  const sortie = (mvts[0]?.result?.data?.json ?? []).find((m) => m.produitId === prodId && m.type === "SORTIE_OR");
  check("Sortie de stock tracée à l'OR (2 pièces)", !!sortie && Number(sortie.quantite) === 2, JSON.stringify(mvts[0]?.result?.data?.json ?? []).slice(0, 150));
  const d4 = await trpcGet("or.getById", { id: orId });
  check("Historique DEMANDE_PIECES tracé", (d4[0]?.result?.data?.json?.historique ?? []).some((h) => h.type === "DEMANDE_PIECES"));

  // ── 5. Pièce manquante → commande fournisseur liée ──
  const r5 = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 3, note: "Stock épuisé" }] });
  const demande2 = r5[0]?.result?.data?.json?.demandeId;
  const dem2 = await trpcGet("or.listerDemandesPieces", { orId });
  const ligne2Id = (dem2[0]?.result?.data?.json ?? []).find((d) => d.id === demande2)?.lignes?.[0]?.id;
  const r5b = await trpcPost("or.traiterDemandePieces", { demandeId: demande2, actions: [{ ligneId: ligne2Id, servir: false, motifManquant: "Indisponible en stock" }] });
  check("Pièce manquante → MANQUANTE", !r5b[0]?.error && r5b[0]?.result?.data?.json?.statut === "MANQUANTE", r5b[0]?.error?.json?.message);

  const fournisseurs = await trpcGet("reference.listFournisseurs", {});
  let fournisseurId = (fournisseurs[0]?.result?.data?.json ?? [])[0]?.id;
  if (!fournisseurId) {
    const rf = await trpcPost("procurement.createFournisseur", { nom: "Pièces Auto DLA", telephone: "677 00 00 00" });
    fournisseurId = rf[0]?.result?.data?.json?.id;
  }
  const r5c = await trpcPost("or.creerCommandeFournisseur", { orId, fournisseurId, livraisonAttendue: "2026-09-01", lignes: [{ produitId: prodId, quantite: 3, prixUnitaire: 18000 }] });
  console.log("commande:", JSON.stringify(r5c[0]?.result?.data?.json ?? r5c[0]?.error?.json).slice(0, 120));
  check("Commande fournisseur liée à l'OR (BC-)", !r5c[0]?.error && /^BC-/.test(r5c[0]?.result?.data?.json?.reference ?? ""), r5c[0]?.error?.json?.message);
  const cmds = await trpcGet("or.listerCommandesFournisseur", { orId });
  check("Commande visible dans la fiche OR (traçabilité)", (cmds[0]?.result?.data?.json ?? []).length >= 1 && (cmds[0]?.result?.data?.json ?? [])[0]?.statut === "commande", JSON.stringify(cmds[0]?.result?.data?.json).slice(0, 120));

  // ── 6. Pièce défaillante → retour fournisseur → remplacement → clôture ──
  const r6 = await trpcPost("or.creerRetourFournisseur", { orId, fournisseurId, motif: "DEFAILLANTE", commentaire: "Plaquette fissurée à la réception", lignes: [{ produitId: prodId, quantite: 1, note: "Fissure" }] });
  const retourId = r6[0]?.result?.data?.json?.retourId;
  check("Retour fournisseur créé (RETOURNE)", !!retourId, r6[0]?.error?.json?.message);
  const r6b = await trpcPost("or.enregistrerRemplacement", { retourId, commentaire: "Reçue la pièce de remplacement" });
  check("Remplacement reçu (REMPLACE)", !r6b[0]?.error && r6b[0]?.result?.data?.json?.statut === "REMPLACE", r6b[0]?.error?.json?.message);
  const r6c = await trpcPost("or.cloturerRetour", { retourId });
  check("Retour clôturé (CLOTURE)", !r6c[0]?.error && r6c[0]?.result?.data?.json?.statut === "CLOTURE", r6c[0]?.error?.json?.message);
  const rets = await trpcGet("or.listerRetoursFournisseur", { orId });
  check("Retour visible dans la fiche OR (motif DEFAILLANTE)", (rets[0]?.result?.data?.json ?? []).some((r) => r.id === retourId && r.motif === "DEFAILLANTE"), JSON.stringify(rets[0]?.result?.data?.json).slice(0, 120));

  // ── 7. Traçabilité finale : historique complet ──
  const df = await trpcGet("or.getById", { id: orId });
  const types = new Set((df[0]?.result?.data?.json?.historique ?? []).map((h) => h.type));
  console.log("types historique:", [...types].join(", "));
  check("Historique : diagnostic + devis + demandes + commande + retour", ["VALIDATION_DIAGNOSTIC", "VALIDATION_DEVIS", "DEMANDE_PIECES", "COMMANDE_FOURNISSEUR", "RETOUR_FOURNISSEUR"].every((t) => types.has(t)), [...types].join(","));

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });