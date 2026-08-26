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

  // ── 0. Client FLOTTE ──
  const fc = await trpcGet("clients.list", { search: "Flotte Urban Trans", limit: 100 });
  let flotteId = (fc[0]?.result?.data?.json?.clients ?? []).find((c) => c.raisonSociale === "Flotte Urban Trans SA")?.id;
  if (!flotteId) {
    const rf = await trpcPost("clients.create", { typeClient: "FLOTTE", raisonSociale: "Flotte Urban Trans SA", niuNif: "M071620000099Z", telephone: "699 88 77 66", email: "flotte@utrans.cm", contactPrincipal: { nom: "Ngo Bassa", telephone: "699 88 77 66" } });
    flotteId = rf[0]?.result?.data?.json?.id;
  }
  check("Client FLOTTE disponible", !!flotteId, "id=" + flotteId);

  // ── 1. Véhicule avec chauffeur ──
  const imma = "FT-2026-FV" + Date.now().toString().slice(-3);
  const r1 = await trpcPost("vehicules.create", {
    immatriculation: imma, clientId: flotteId, marque: "Toyota", modele: "Hiace", annee: 2022,
    kilometrage: 89000, carburant: "diesel", typeVehicule: "autocar", numeroChassis: "JTFHV23P000000001",
    chauffeurNom: "Etienne Mbarga", chauffeurTelephone: "677 45 45 45",
  });
  const v = r1[0]?.result?.data?.json;
  const vId = v?.id;
  check("Véhicule créé avec chauffeur", !!vId && v?.chauffeurNom === "Etienne Mbarga" && v?.chauffeurTelephone === "677 45 45 45", r1[0]?.error?.json?.message);

  const ru = await trpcPost("vehicules.update", { id: vId, chauffeurNom: "Etienne Mbarga II", chauffeurTelephone: "677 45 45 46" });
  check("Chauffeur modifiable", !ru[0]?.error, ru[0]?.error?.json?.message);

  // ── 2. Employé technicien (responsable) ──
  const emps = await trpcGet("rh.list", { limit: 100, statut: "actif" });
  const emp001 = (emps[0]?.result?.data?.json?.employees ?? []).find((e) => e.matricule === "EMP001");
  check("Employé technicien disponible", !!emp001, "id=" + emp001?.id);

  // ── 3. Produit + OR avec plainte, priorité P1 ──
  const prod = await trpcGet("catalog.list", { query: "Plaquettes atelier", limit: 10 });
  let prodId = Number((prod[0]?.result?.data?.json?.items ?? []).find((p) => p.titre === "Plaquettes atelier test")?.id);
  if (!prodId) {
    const rp = await trpcPost("catalog.create", { typeProduit: "PIECE", titre: "Plaquettes atelier test", codeBarre: "PLAQ-360-" + Date.now().toString().slice(-4), prixAchat: 15000, prixVente: 25000 });
    prodId = rp[0]?.result?.data?.json?.id;
  }
  check("Produit pièce disponible", !!prodId, "id=" + prodId);

  const ro = await trpcPost("or.create", { vehiculeId: vId, clientId: flotteId, plainte: "Vibrations au freinage + témoin frein allumé", priorite: "P1", motEntree: "PANNE" });
  const orId = ro[0]?.result?.data?.json?.id;
  check("OR créé (P1)", !!orId, ro[0]?.error?.json?.message);

  const rt = await trpcPost("or.assignerTechnicien", { id: orId, technicienId: Number(emp001.id) });
  check("Technicien assigné (responsable)", !rt[0]?.error, rt[0]?.error?.json?.message);

  // ── 4. Diagnostic → validation chef ──
  const rd = await trpcPost("or.creerRapportDiagnostic", {
    orId,
    constat: "Plaquettes avant usées à 90%, disque rayé",
    cause: "Usure normale + absence d'entretien",
    lignes: [
      { type: "PIECE", produitId: prodId, libelle: "Plaquettes avant", quantite: 2, prixUnitaire: 25000 },
      { type: "SERVICE", libelle: "Main d'œuvre", quantite: 2, prixUnitaire: 10000 },
    ],
  });
  const rapportId = rd[0]?.result?.data?.json?.rapportId;
  check("Rapport diagnostic créé", !!rapportId, rd[0]?.error?.json?.message);
  const rv = await trpcPost("or.validerDiagnostic", { rapportId, commentaire: "OK, remplacement plaquettes + rectification disque" });
  check("Diagnostic validé (chef)", !rv[0]?.error, rv[0]?.error?.json?.message);

  // ── 5. Devis soumis + accepté ──
  const sd = await trpcPost("or.soumettreDevis", { orId });
  check("Devis soumis au client", !sd[0]?.error, sd[0]?.error?.json?.message);
  const vd = await trpcPost("or.validerDevis", { orId, accepte: true });
  check("Devis accepté par le client", !vd[0]?.error, vd[0]?.error?.json?.message);

  // ── 6. Demande pièces → servie ──
  const dp = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 2, prixEstime: 25000, note: "Avant" }] });
  const demandeId = dp[0]?.result?.data?.json?.demandeId;
  const demListe = await trpcGet("or.listerDemandesPieces", { orId });
  const ligneId = (demListe[0]?.result?.data?.json ?? []).find((d) => d.id === demandeId)?.lignes?.[0]?.id;
  check("Demande pièces créée", !!demandeId && !!ligneId, JSON.stringify(dp[0]?.error?.json?.message));
  const tp = await trpcPost("or.traiterDemandePieces", { demandeId, actions: [{ ligneId, servir: true, quantiteServie: 2 }] });
  check("Demande servie par le magasin", !tp[0]?.error && tp[0]?.result?.data?.json?.statut === "SERVIE", tp[0]?.error?.json?.message);

  // ── 7. Commande fournisseur (livré) ──
  const fous = await trpcGet("reference.listFournisseurs", {});
  let fournisseurId = (fous[0]?.result?.data?.json ?? [])[0]?.id;
  if (!fournisseurId) {
    const rf = await trpcPost("procurement.createFournisseur", { nom: "Pièces Auto DLA 360", telephone: "677 00 00 01" });
    fournisseurId = rf[0]?.result?.data?.json?.id;
  }
  const cfo = await trpcPost("or.creerCommandeFournisseur", { orId, fournisseurId, livraisonAttendue: "2026-09-10", lignes: [{ produitId: prodId, quantite: 2, prixUnitaire: 18000 }] });
  const bcRef = cfo[0]?.result?.data?.json?.reference;
  check("Commande fournisseur BC-", !!bcRef && /^BC-/.test(bcRef ?? ""), cfo[0]?.error?.json?.message);
  const cmdId = cfo[0]?.result?.data?.json?.achatId;
  check("Commande fournisseur reçue id", !!cmdId, "cmdId=" + cmdId);
  const rec = await trpcPost("procurement.receivePurchaseOrder", { id: String(cmdId), lignes: [{ produitId: String(prodId), quantiteRecue: 2, prixUnitaire: 18000 }] });
  check("Commande reçue (fournisseur livré)", !rec[0]?.error, rec[0]?.error?.json?.message);

  // ── 8. Facture ──
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "CONTROLE_QUALITE" });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "PRET_A_LIVRER" });
  const fac = await trpcPost("or.facturer", { id: orId, modePaiement: "especes" });
  const venteId = fac[0]?.result?.data?.json?.venteId;
  check("OR facturé (venteId)", !!venteId, fac[0]?.error?.json?.message);

  // ── 9. FICHE 360° : toutes les sections ──
  const g = await trpcGet("vehicules.get", { id: vId });
  const f = g[0]?.result?.data?.json;
  check("Fiche 360° retournée", !!f?.vehicule, JSON.stringify(g[0]?.error?.json?.message));

  check("1. Infos véhicule complètes", f?.vehicule?.immatriculation === imma && f?.vehicule?.marque === "Toyota" && f?.vehicule?.numeroChassis, "imma=" + f?.vehicule?.immatriculation);
  check("2. Propriétaire (client FLOTTE)", f?.client?.id === flotteId && f?.client?.typeClient === "FLOTTE" && f?.client?.telephone, "type=" + f?.client?.typeClient);
  check("3. Chauffeur remonté", f?.vehicule?.chauffeurNom === "Etienne Mbarga II" && f?.vehicule?.chauffeurTelephone === "677 45 45 46", JSON.stringify({ n: f?.vehicule?.chauffeurNom, t: f?.vehicule?.chauffeurTelephone }));
  check("4. Date d'entrée (OR courant)", !!f?.orCourant?.dateOuverture, JSON.stringify(f?.orCourant?.dateOuverture));
  check("5. Plaintes du client", f?.orCourant?.plainte?.includes("Vibrations"), f?.orCourant?.plainte);
  check("6. Diagnostic remonté", !!f?.rapportDiagnostic && f?.rapportDiagnostic?.constat?.includes("Plaquettes"), JSON.stringify(f?.rapportDiagnostic?.constat));
  check("7. Diagnostic validé (client/chef)", f?.rapportDiagnostic?.statut === "VALIDE" && !!f?.rapportDiagnostic?.valideLe && !!f?.rapportDiagnostic?.validateur, JSON.stringify({ s: f?.rapportDiagnostic?.statut, v: f?.rapportDiagnostic?.validePar }));
  check("8. Responsable garage assigné", !!f?.responsable && f?.responsable?.nom, JSON.stringify(f?.responsable));
  check("9. Travaux faits (lignes)", Array.isArray(f?.lignesTravaux) && f?.lignesTravaux?.length >= 2 && f?.lignesTravaux?.some((l) => l?.libelle?.includes("Plaquettes")), "n=" + f?.lignesTravaux?.length);
  const dem = (f?.demandesPieces ?? [])[0];
  check("10. Pièces commandées + fournisseur livré", dem?.statut === "SERVIE" && dem?.lignes?.[0]?.produitLibelle, JSON.stringify({ s: dem?.statut, l: dem?.lignes?.[0]?.produitLibelle }));
  check("11. Priorité P1 remontée", f?.orCourant?.priorite === "P1", f?.orCourant?.priorite);
  check("12. Statut OR au clic (LIVRE, terminé)", !!f?.orCourant?.statut && f?.orCourant?.statut === "LIVRE" && f?.orTermine === true, f?.orCourant?.statut);
  check("13. Flotte identifiée", f?.client?.typeClient === "FLOTTE");
  check("14. Devis accepté (proforma)", f?.orCourant?.devisAccepte === true, "dev=" + f?.orCourant?.devisAccepte);
  check("14b. Facture produite + lignes", !!f?.facture && f?.facture?.id === venteId && f?.factureLignes?.length >= 1, JSON.stringify({ ref: f?.facture?.reference, n: f?.factureLignes?.length }));
  check("14c. Référence facture FAC-", /^FAC-/.test(f?.facture?.reference ?? ""), f?.facture?.reference);
  check("15. Historique événements tracé", Array.isArray(f?.timeline) && f?.timeline?.length >= 5, "n=" + f?.timeline?.length);
  check("16. Responsables dans historique", (f?.historiqueOR ?? []).every((h) => !h?.responsableTechnicienId || h?.responsable?.nom), "n=" + f?.historiqueOR?.length);
  check("17. Retours fournisseur (vide ici)", Array.isArray(f?.retours), "n=" + f?.retours?.length);

  // ── 10. Autres véhicules du même client ──
  const v2 = await trpcPost("vehicules.create", { immatriculation: imma + "B", clientId: flotteId, marque: "Nissan", modele: "Caravan" });
  const g2 = await trpcGet("vehicules.get", { id: vId });
  const f2 = g2[0]?.result?.data?.json;
  check("18. Autres véhicules du client listés", (f2?.autresVehicules ?? []).some((av) => av?.id === v2[0]?.result?.data?.json?.id), "n=" + f2?.autresVehicules?.length);

  console.log(`\nRÉSULTAT : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });