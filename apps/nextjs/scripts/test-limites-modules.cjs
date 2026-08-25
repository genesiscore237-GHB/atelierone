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

  console.log("=== CAS LIMITES — règles strictes par module ===");

  // Client : code client immuable (doublon refusé), archivage refusé si contrat actif, transition illégale
  const c = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: `Test Lim ${TS}`, prenom: "Client", telephone: "699 88 88 88" });
  const clientId = c[0]?.result?.data?.json?.id;
  const codeClient = c[0]?.result?.data?.json?.codeClient;
  const ct = await trpcPost("contrats.create", { clientId, libelle: `Contrat limite ${TS}`, typeContrat: "FORFAIT_ANNUEL", dateDebut: "2026-01-01", dateFin: "2026-12-31", statutInitial: "ACTIF" });
  const contratId = ct[0]?.result?.data?.json?.id;
  const arch = await trpcPost("clients.archiver", { id: clientId });
  check("Archivage client refusé (contrat ACTIF)", !!arch[0]?.error && /contrat actif/i.test(arch[0].error.json.message), arch[0]?.error?.json?.message);
  const transIllegale = await trpcPost("clients.changerStatut", { id: clientId, nouveauStatut: "PROSPECT", motif: "retour" });
  check("Transition client ACTIF → PROSPECT refusée", !!transIllegale[0]?.error, transIllegale[0]?.error?.json?.message);
  const codeDup = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: "Dup", prenom: "Code", telephone: "699 88 88 89", codeClient });
  check("Code client manuel en doublon → refusé", !!codeDup[0]?.error && /existe déjà/.test(codeDup[0].error.json.message), codeDup[0]?.error?.json?.message);

  // Contrat : résiliation sans motif, EXPIRE auto, renouvellement
  const resi = await trpcPost("contrats.resilier", { id: contratId });
  check("Résiliation contrat sans motif → refusée", !!resi[0]?.error && /motif/.test(resi[0].error.json.message), resi[0]?.error?.json?.message);
  const cExp = await trpcPost("contrats.create", { clientId, libelle: `Contrat expiré ${TS}`, typeContrat: "A_LA_DEMANDE", dateDebut: "2025-01-01", dateFin: "2025-06-30", statutInitial: "ACTIF" });
  const expId = cExp[0]?.result?.data?.json?.id;
  const renouv = await trpcPost("contrats.renouveler", { id: expId, nouvelleFin: "2027-12-31" });
  check("Contrat expiré → renouvellement possible (RENOUVELLE)", renouv[0]?.result?.data?.json?.statut === "RENOUVELLE", renouv[0]?.error?.json?.message);

  // Véhicule : immat doublon, véhicule SORTI → OR refusé, ré-entrée
  const v = await trpcPost("vehicules.create", { immatriculation: `LT-LIM-${TS}`, clientId, marque: "Suzuki", modele: "Swift", typeVehicule: "voiture" });
  const vehId = v[0]?.result?.data?.json?.id;
  const vDup = await trpcPost("vehicules.create", { immatriculation: `LT-LIM-${TS}`, clientId, marque: "Autre" });
  check("Immatriculation doublon → refusée", !!vDup[0]?.error && /existe déjà/.test(vDup[0].error.json.message), vDup[0]?.error?.json?.message);

  // OR : transitions illégales, BLOQUE/ANNULE sans raison, terminaux
  const ro = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Test limites", priorite: "P3", motEntree: "DIAGNOSTIC" });
  const orId = ro[0]?.result?.data?.json?.id;
  const saut = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "LIVRE" });
  check("OR : attente diagnostic → LIVRE refusé (saut d'étapes)", !!saut[0]?.error, saut[0]?.error?.json?.message);
  const bloq = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "BLOQUE" });
  check("OR : BLOQUE sans raison → refusé", !!bloq[0]?.error && /raison/.test(bloq[0].error.json.message), bloq[0]?.error?.json?.message);
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "BLOQUE", raison: "Validation client" });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "EN_COURS" });
  const annul = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "ANNULE" });
  check("OR : ANNULE sans motif → refusé", !!annul[0]?.error, annul[0]?.error?.json?.message);
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "ANNULE", raison: "Client annule" });
  const reouv = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "EN_COURS" });
  check("OR : ANNULE est terminal (réouverture refusée)", !!reouv[0]?.error, reouv[0]?.error?.json?.message);

  // Demande pièces : quantité servie > demandée refusée
  const prod = await trpcGet("catalog.list", { query: "Plaquettes atelier", limit: 10 });
  const prodId = Number((prod[0]?.result?.data?.json?.items ?? []).find((p) => p.titre === "Plaquettes atelier test")?.id);
  const ro2 = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Test demande", priorite: "P3", motEntree: "DIAGNOSTIC" });
  const or2Id = ro2[0]?.result?.data?.json?.id;
  const rdm = await trpcPost("or.creerDemandePieces", { orId: or2Id, lignes: [{ produitId: prodId, quantite: 2 }] });
  const demandeId = rdm[0]?.result?.data?.json?.demandeId;
  const dem = await trpcGet("or.listerDemandesPieces", { orId: or2Id });
  const ligneId = (dem[0]?.result?.data?.json ?? []).find((d) => d.id === demandeId)?.lignes?.[0]?.id;
  const trop = await trpcPost("or.traiterDemandePieces", { demandeId, actions: [{ ligneId, servir: true, quantiteServie: 5 }] });
  check("Demande : quantité servie (5) > demandée (2) → refusée", !!trop[0]?.error && /supérieure/.test(trop[0].error.json.message), trop[0]?.error?.json?.message);

  // Plafond de crédit : facturation crédit au-delà du plafond refusée
  const c2 = await trpcPost("clients.create", { typeClient: "ENTR", raisonSociale: `TEST Plafond ${TS}`, niuNif: `M0PLAF${TS}`, telephone: "699 99 99 99", email: `p-${TS}@x.cm`, plafondCredit: 5000, contactPrincipal: { nom: "X", telephone: "699 99 99 90" } });
  const client2 = c2[0]?.result?.data?.json?.id;
  const v2 = await trpcPost("vehicules.create", { immatriculation: `LT-PLF-${TS}`, clientId: client2, marque: "Dacia", modele: "Logan", typeVehicule: "voiture" });
  const ro3 = await trpcPost("or.create", { vehiculeId: v2[0]?.result?.data?.json?.id, clientId: client2, plainte: "Test plafond", priorite: "P3", motEntree: "DIAGNOSTIC" });
  const or3Id = ro3[0]?.result?.data?.json?.id;
  await trpcPost("or.addLigne", { ordreId: or3Id, type: "SERVICE", libelle: "Grosse réparation", quantite: 1, prixUnitaire: 100000 });
  await trpcPost("or.update", { id: or3Id, statut: "PRET_A_LIVRER" });
  const fac = await trpcPost("or.facturer", { id: or3Id, modePaiement: "credit" });
  check("Plafond de crédit (5 000 F) dépassé (100 000 F) → facture crédit refusée", !!fac[0]?.error && /plafond|crédit/i.test(fac[0].error.json.message), fac[0]?.error?.json?.message);
  const fac2 = await trpcPost("or.facturer", { id: or3Id, modePaiement: "especes" });
  check("Même facture en comptant → autorisée (plafond non concerné)", !fac2[0]?.error && /^FAC-/.test(fac2[0]?.result?.data?.json?.reference ?? ""), fac2[0]?.error?.json?.message);

  // Recherche multicritère (client par NIU / raison sociale)
  const s1 = await trpcGet("clients.list", { search: `M0PLAF${TS}`, limit: 10 });
  check("Recherche client par NIU", (s1[0]?.result?.data?.json?.clients ?? []).some((x) => x.id === client2), JSON.stringify(s1[0]?.result?.data?.json?.clients ?? []).slice(0, 100));
  const s2 = await trpcGet("clients.list", { search: `TEST Plafond ${TS}`, limit: 10 });
  check("Recherche client par raison sociale", (s2[0]?.result?.data?.json?.clients ?? []).some((x) => x.id === client2));

  console.log(`\nRÉSULTAT LIMITES: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });