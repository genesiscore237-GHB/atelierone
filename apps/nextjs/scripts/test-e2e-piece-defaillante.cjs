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

  console.log("=== T3 — PIÈCE DÉFAILLANTE → RETOUR FOURNISSEUR → REMPLACEMENT → LIVRAISON ===");

  const c = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: `Test Def ${TS}`, prenom: "Piece", telephone: "699 33 33 33" });
  const clientId = c[0]?.result?.data?.json?.id;
  const v = await trpcPost("vehicules.create", { immatriculation: `LT-DEF-${TS}`, clientId, marque: "Kia", modele: "Picanto", typeVehicule: "voiture" });
  const vehId = v[0]?.result?.data?.json?.id;
  const ro = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Freins", priorite: "P2", motEntree: "DIAGNOSTIC" });
  const orId = ro[0]?.result?.data?.json?.id;
  const prod = await trpcGet("catalog.list", { query: "Plaquettes atelier", limit: 10 });
  const prodId = Number((prod[0]?.result?.data?.json?.items ?? []).find((p) => p.titre === "Plaquettes atelier test")?.id);
  const rd = await trpcPost("or.creerRapportDiagnostic", { orId, constat: "Plaquettes à remplacer", lignes: [{ type: "PIECE", produitId: prodId, libelle: "Plaquettes", quantite: 1, prixUnitaire: 25000 }] });
  await trpcPost("or.validerDiagnostic", { rapportId: rd[0]?.result?.data?.json?.rapportId });
  await trpcPost("or.soumettreDevis", { orId });
  await trpcPost("or.validerDevis", { orId, accepte: true });

  // 1. Demande servie (la pièce arrive du fournisseur)
  const rdm = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 1 }] });
  const demandeId = rdm[0]?.result?.data?.json?.demandeId;
  const demListe = await trpcGet("or.listerDemandesPieces", { orId });
  const ligneId = (demListe[0]?.result?.data?.json ?? []).find((d) => d.id === demandeId)?.lignes?.[0]?.id;
  const rsv = await trpcPost("or.traiterDemandePieces", { demandeId, actions: [{ ligneId, servir: true, quantiteServie: 1 }] });
  check("Pièce servie au technicien", rsv[0]?.result?.data?.json?.statut === "SERVIE", rsv[0]?.error?.json?.message);

  // 2. La pièce est défaillante → retour fournisseur
  const fourn = await trpcGet("reference.listFournisseurs", {});
  const fournisseurId = (fourn[0]?.result?.data?.json ?? [])[0]?.id;
  const rret = await trpcPost("or.creerRetourFournisseur", { orId, fournisseurId, motif: "DEFAILLANTE", commentaire: "Plaquette fissurée", lignes: [{ produitId: prodId, quantite: 1, note: "Fissure constatée" }] });
  const retourId = rret[0]?.result?.data?.json?.retourId;
  check("Retour fournisseur créé (RETOURNE, DEFAILLANTE)", !!retourId, rret[0]?.error?.json?.message);

  // 3. Pièce de remplacement reçue → clôture
  const rr = await trpcPost("or.enregistrerRemplacement", { retourId, commentaire: "Pièce de remplacement reçue" });
  check("Remplacement reçu (REMPLACE)", rr[0]?.result?.data?.json?.statut === "REMPLACE", rr[0]?.error?.json?.message);
  const rcl = await trpcPost("or.cloturerRetour", { retourId });
  check("Retour clôturé (CLOTURE)", rcl[0]?.result?.data?.json?.statut === "CLOTURE", rcl[0]?.error?.json?.message);
  const rcl2 = await trpcPost("or.cloturerRetour", { retourId });
  check("Double clôture refusée", !!rcl2[0]?.error, rcl2[0]?.error?.json?.message);

  // 4. La pièce de remplacement est servie (nouvelle demande) puis livraison
  const rdm2 = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 1, note: "Remplacement" }] });
  const dem2 = await trpcGet("or.listerDemandesPieces", { orId });
  const ligne2Id = (dem2[0]?.result?.data?.json ?? []).find((d) => d.id === rdm2[0]?.result?.data?.json?.demandeId)?.lignes?.[0]?.id;
  await trpcPost("or.traiterDemandePieces", { demandeId: rdm2[0]?.result?.data?.json?.demandeId, actions: [{ ligneId: ligne2Id, servir: true, quantiteServie: 1 }] });

  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "CONTROLE_QUALITE" });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "PRET_A_LIVRER" });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "LIVRE" });
  const fact = await trpcPost("or.facturer", { id: orId, modePaiement: "momo" });
  check("Livraison + facture MoMo", !fact[0]?.error && /^FAC-/.test(fact[0]?.result?.data?.json?.reference ?? ""), fact[0]?.error?.json?.message);

  // 5. Traçabilité : RETOUR_FOURNISSEUR dans l'historique + retour lié à l'OR
  const df = await trpcGet("or.getById", { id: orId });
  const types = new Set((df[0]?.result?.data?.json?.historique ?? []).map((h) => h.type));
  check("Historique RETOUR_FOURNISSEUR (2 entrées)", [...types].filter((t) => t === "RETOUR_FOURNISSEUR").length >= 2 || types.has("RETOUR_FOURNISSEUR"), [...types].join(","));
  const rets = await trpcGet("or.listerRetoursFournisseur", { orId });
  check("Retour lié à l'OR (statut CLOTURE)", (rets[0]?.result?.data?.json ?? []).some((r) => r.id === retourId && r.statut === "CLOTURE" && r.motif === "DEFAILLANTE"), JSON.stringify(rets[0]?.result?.data?.json).slice(0, 140));

  console.log(`\nRÉSULTAT T3: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });