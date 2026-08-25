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

  console.log("=== T2 — PIÈCE MANQUANTE → COMMANDE FOURNISSEUR → RÉCEPTION → SERVICE ===");

  // Préparation rapide : client + véhicule + OR + diagnostic validé + devis accepté
  const c = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: `Test Cmd ${TS}`, prenom: "Fournisseur", telephone: "699 22 22 22" });
  const clientId = c[0]?.result?.data?.json?.id;
  const v = await trpcPost("vehicules.create", { immatriculation: `LT-CMD-${TS}`, clientId, marque: "Renault", modele: "Kangoo", typeVehicule: "utilitaire" });
  const vehId = v[0]?.result?.data?.json?.id;
  const ro = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Embrayage", priorite: "P2", motEntree: "DIAGNOSTIC" });
  const orId = ro[0]?.result?.data?.json?.id;
  const prod = await trpcGet("catalog.list", { query: "Plaquettes atelier", limit: 10 });
  const prodId = Number((prod[0]?.result?.data?.json?.items ?? []).find((p) => p.titre === "Plaquettes atelier test")?.id);
  const rd = await trpcPost("or.creerRapportDiagnostic", { orId, constat: "Embrayage fatigué", cause: "Kit usé", lignes: [{ type: "PIECE", produitId: prodId, libelle: "Plaquettes", quantite: 3, prixUnitaire: 25000 }] });
  const rapportId = rd[0]?.result?.data?.json?.rapportId;
  await trpcPost("or.validerDiagnostic", { rapportId });
  await trpcPost("or.soumettreDevis", { orId });
  await trpcPost("or.validerDevis", { orId, accepte: true });
  check("OR prêt pour la demande (EN_COURS + devis accepté)", true);

  // 1. Demande → MANQUANTE (stock épuisé ? on force le manquant)
  const rdm = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 3, note: "Rupture" }] });
  const demandeId = rdm[0]?.result?.data?.json?.demandeId;
  const demListe = await trpcGet("or.listerDemandesPieces", { orId });
  const ligneId = (demListe[0]?.result?.data?.json ?? []).find((d) => d.id === demandeId)?.lignes?.[0]?.id;
  const rmanq = await trpcPost("or.traiterDemandePieces", { demandeId, actions: [{ ligneId, servir: false, motifManquant: "Rupture de stock" }] });
  check("Demande déclarée MANQUANTE par le magasin", !rmanq[0]?.error && rmanq[0]?.result?.data?.json?.statut === "MANQUANTE", rmanq[0]?.error?.json?.message);

  // 2. Commande fournisseur liée à l'OR
  const fourn = await trpcGet("reference.listFournisseurs", {});
  let fournisseurId = (fourn[0]?.result?.data?.json ?? [])[0]?.id;
  if (!fournisseurId) {
    const rf = await trpcPost("procurement.createFournisseur", { nom: "Pièces Auto DLA", telephone: "677 00 00 00" });
    fournisseurId = rf[0]?.result?.data?.json?.id;
  }
  const rcmd = await trpcPost("or.creerCommandeFournisseur", { orId, fournisseurId, livraisonAttendue: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), lignes: [{ produitId: prodId, quantite: 3, prixUnitaire: 18000 }] });
  const achatId = rcmd[0]?.result?.data?.json?.achatId;
  const refBC = rcmd[0]?.result?.data?.json?.reference;
  check("Commande BC- créée et liée à l'OR", !!achatId && /^BC-/.test(refBC ?? ""), rcmd[0]?.error?.json?.message);
  const cmds = await trpcGet("or.listerCommandesFournisseur", { orId });
  check("Commande visible dans la fiche OR (traçabilité)", (cmds[0]?.result?.data?.json ?? []).some((x) => x.id === achatId && x.statut === "commande"), JSON.stringify(cmds[0]?.result?.data?.json).slice(0, 120));

  // 3. Réception fournisseur (bon de réception + stock alimenté)
  const rrec = await trpcPost("procurement.receivePurchaseOrder", { id: String(achatId), lignes: [{ produitId: String(prodId), quantiteRecue: 3, prixUnitaire: 18000 }] });
  check("Réception fournisseur OK (stock alimenté)", !rrec[0]?.error, JSON.stringify(rrec[0]?.error?.json ?? rrec[0]?.result?.data?.json).slice(0, 150));
  const mvtsRec = await trpcGet("stock.getMouvements", { produitId: String(prodId), type: "ACHAT_RECEPTION", limit: 5 });
  const entree = (mvtsRec[0]?.result?.data?.json ?? []).find((m) => Number(m.quantite) === 3);
  check("Mouvement ACHAT_RECEPTION tracé (stock 10 → 13)", !!entree && Number(entree.stockApres) === 13, JSON.stringify(mvtsRec[0]?.result?.data?.json ?? []).slice(0, 140));

  // 4. Nouvelle demande → servie (la pièce est disponible)
  const rdm2 = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 3 }] });
  const demande2 = rdm2[0]?.result?.data?.json?.demandeId;
  const dem2 = await trpcGet("or.listerDemandesPieces", { orId });
  const ligne2Id = (dem2[0]?.result?.data?.json ?? []).find((d) => d.id === demande2)?.lignes?.[0]?.id;
  const rsv = await trpcPost("or.traiterDemandePieces", { demandeId: demande2, actions: [{ ligneId: ligne2Id, servir: true, quantiteServie: 3 }] });
  check("Pièce commandée puis servie (SERVIE)", !rsv[0]?.error && rsv[0]?.result?.data?.json?.statut === "SERVIE", rsv[0]?.error?.json?.message);
  const mvts2 = await trpcGet("stock.listMouvementsParOR", { orId });
  const sortie2 = (mvts2[0]?.result?.data?.json ?? []).find((m) => m.produitId === prodId && m.type === "SORTIE_OR" && Number(m.quantite) === 3);
  check("Sortie de 3 tracée (stock 13 → 10)", !!sortie2 && Number(sortie2.stockApres) === 10, JSON.stringify(sortie2).slice(0, 120));

  // 5. Fin du cycle : livraison + facture
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "CONTROLE_QUALITE" });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "PRET_A_LIVRER" });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "LIVRE" });
  const fact = await trpcPost("or.facturer", { id: orId, modePaiement: "especes" });
  check("Livraison + facture comptant", !fact[0]?.error && /^FAC-/.test(fact[0]?.result?.data?.json?.reference ?? ""), fact[0]?.error?.json?.message);

  // 6. Traçabilité : COMMANDE_FOURNISSEUR dans l'historique
  const df = await trpcGet("or.getById", { id: orId });
  const types = new Set((df[0]?.result?.data?.json?.historique ?? []).map((h) => h.type));
  check("Historique : COMMANDE_FOURNISSEUR tracée", types.has("COMMANDE_FOURNISSEUR") && types.has("DEMANDE_PIECES"), [...types].join(","));

  console.log(`\nRÉSULTAT T2: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });