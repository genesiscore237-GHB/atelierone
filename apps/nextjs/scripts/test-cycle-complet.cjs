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

  // ── 1. Client + véhicule (cycle) ──
  const clients = await trpcGet("clients.list", { search: "Trans Logistique", limit: 100 });
  let entrId = (clients[0]?.result?.data?.json?.clients ?? []).find((c) => c.raisonSociale === "Trans Logistique SARL")?.id;
  if (!entrId) {
    const r = await trpcPost("clients.create", { typeClient: "ENTR", raisonSociale: "Trans Logistique SARL", niuNif: "M071620000000J", telephone: "655 11 22 33", email: "contact@translog.cm", contactPrincipal: { nom: "Mballa", telephone: "655 11 22 33" } });
    entrId = r[0]?.result?.data?.json?.id;
  }

  const rv = await trpcPost("vehicules.create", { immatriculation: "LT-CYCLE-01", clientId: entrId, marque: "Toyota", modele: "Hilux", annee: 2021, typeVehicule: "utilitaire" });
  const vehId = rv[0]?.result?.data?.json?.id;
  check("Véhicule de cycle créé", !!vehId, rv[0]?.error?.json?.message);

  // ── 2. Contrat actif couvrant le véhicule → OR rattaché automatiquement ──
  const rc = await trpcPost("contrats.create", {
    clientId: entrId, libelle: "Contrat cycle complet", typeContrat: "FORFAIT_ANNUEL",
    dateDebut: "2026-01-01", dateFin: "2026-12-31", delaiPaiementJours: 30, remisePourcent: 5, statutInitial: "ACTIF",
  });
  const contratId = rc[0]?.result?.data?.json?.id;
  await trpcPost("vehicules.lierContrat", { vehiculeId: vehId, contratId });

  const ro = await trpcPost("or.create", { vehiculeId: vehId, plainte: "Vibration au freinage" });
  const or1 = ro[0]?.result?.data?.json;
  check("OR ouvert", /^OR-/.test(or1?.numero ?? ""), ro[0]?.error?.json?.message);
  const or1Id = or1?.id;
  const fiche = await trpcGet("vehicules.get", { id: vehId });
  const detailOr = await trpcGet("or.getById", { id: or1Id });
  check("OR rattaché au contrat couvrant (auto)", detailOr[0]?.result?.data?.json?.contratId === contratId, `contratId=${detailOr[0]?.result?.data?.json?.contratId}`);
  check("Véhicule passé en réparation", fiche[0]?.result?.data?.json?.vehicule?.statutImmobilisation === "en_reparation", fiche[0]?.result?.data?.json?.vehicule?.statutImmobilisation);

  // ── 3. Lignes pièce + main d'œuvre ──
  await trpcPost("or.addLigne", { ordreId: or1Id, type: "PIECE", libelle: "Plaquettes avant", quantite: 1, prixUnitaire: 25000, tva: 19.25 });
  await trpcPost("or.addLigne", { ordreId: or1Id, type: "SERVICE", libelle: "Main d'œuvre freinage", quantite: 2, prixUnitaire: 10000, tva: 19.25 });
  const d1 = await trpcGet("or.getById", { id: or1Id });
  const lignes1 = d1[0]?.result?.data?.json?.lignes ?? [];
  check("2 lignes (pièce + MO) avec totaux", lignes1.length === 2, "n=" + lignes1.length);
  // totalTTC : 25000*1.1925 + 2*10000*1.1925 = 29812.5 + 23850 = 53662.5

  // ── 4. Facturation refusée avant "termine" ──
  const r4 = await trpcPost("or.facturer", { id: or1Id, modePaiement: "especes" });
  check("OR non terminé → facturation refusée", !!r4[0]?.error && /TERMINÉ/.test(r4[0].error.json.message), r4[0]?.error?.json?.message);

  await trpcPost("or.update", { id: or1Id, statut: "termine" });
  const r4b = await trpcPost("or.facturer", { id: or1Id, modePaiement: "especes" });
  console.log("facture OR1:", JSON.stringify(r4b[0]?.result?.data?.json ?? r4b[0]?.error?.json).slice(0, 150));
  const fac1 = r4b[0]?.result?.data?.json;
  check("OR terminé → facture comptant créée (FAC-)", !r4b[0]?.error && /^FAC-/.test(fac1?.reference ?? "") && fac1?.montantTotal > 0, r4b[0]?.error?.json?.message);
  const totalAttendu = Math.round(53662.5 * (1 - 5 / 100) * 100) / 100; // remise contrat 5 %
  check("Montant facturé correct (pièces + MO, TVA incluse, remise contrat 5 %)", Math.abs(Number(fac1?.montantTotal) - totalAttendu) < 1, `attendu=${totalAttendu} reçu=${fac1?.montantTotal}`);

  const d1b = await trpcGet("or.getById", { id: or1Id });
  check("OR passé à facture + vente liée", d1b[0]?.result?.data?.json?.statut === "facture" && !!d1b[0]?.result?.data?.json?.venteId, JSON.stringify(d1b[0]?.result?.data?.json).slice(0, 120));

  const r4c = await trpcPost("or.facturer", { id: or1Id, modePaiement: "especes" });
  check("Double facturation refusée", !!r4c[0]?.error && /déjà facturé/.test(r4c[0].error.json.message), r4c[0]?.error?.json?.message);

  // ── 5. Facturation groupée par contrat (crédit) ──
  const ro2 = await trpcPost("or.create", { vehiculeId: vehId, plainte: "Bruit direction" });
  const or2Id = ro2[0]?.result?.data?.json?.id;
  await trpcPost("or.addLigne", { ordreId: or2Id, type: "PIECE", libelle: "Rotule de direction", quantite: 1, prixUnitaire: 35000, tva: 19.25 });
  await trpcPost("or.update", { id: or2Id, statut: "termine" });

  const mois = new Date().toISOString().slice(0, 7);
  const rg = await trpcPost("contrats.facturerPeriode", {
    contratId, dateDebut: `${mois}-01`, dateFin: new Date().toISOString().slice(0, 10), modePaiement: "credit",
  });
  console.log("facture groupée:", JSON.stringify(rg[0]?.result?.data?.json ?? rg[0]?.error?.json).slice(0, 180));
  const fg = rg[0]?.result?.data?.json;
  check("Facture groupée créée (1 OR, crédit)", !rg[0]?.error && fg?.orsFactures === 1 && /^FAC-/.test(fg?.reference ?? ""), rg[0]?.error?.json?.message);
  const attenduGrp = Math.round(35000 * 1.1925 * (1 - 5 / 100) * 100) / 100; // remise contrat 5 %
  check("Montant groupé = lignes − remise contrat 5 %", Math.abs(Number(fg?.montantTotal) - attenduGrp) < 1, `attendu=${attenduGrp} reçu=${fg?.montantTotal}`);

  const d2 = await trpcGet("or.getById", { id: or2Id });
  check("OR2 facturé via la facture groupée", d2[0]?.result?.data?.json?.statut === "facture" && !!d2[0]?.result?.data?.json?.venteId);

  const rg2 = await trpcPost("contrats.facturerPeriode", { contratId, dateDebut: `${mois}-01`, dateFin: new Date().toISOString().slice(0, 10), modePaiement: "credit" });
  check("Facturation groupée sans OR restant → refusée", !!rg2[0]?.error, rg2[0]?.error?.json?.message);

  // ── 6. Dette créée + visible dans les créances du client ──
  const dettes = await trpcGet("customers.clientDebts", { clientId: String(entrId) });
  const debts = dettes[0]?.result?.data?.json?.debts ?? [];
  check("Dette crédit enregistrée (échéance contrat 30 j)", debts.some((dd) => Number(dd.montantRestant ?? 0) === Number(fg?.montantTotal ?? 0) && dd.statut === "impaye"), JSON.stringify(debts).slice(0, 200));

  // ── 7. Fiche client : solde mis à jour ──
  const ficheClient = await trpcGet("clients.get", { id: entrId });
  check("Solde client = dette groupée", Math.abs(Number(ficheClient[0]?.result?.data?.json?.solde ?? 0) - Number(fg?.montantTotal ?? 0)) < 1, `solde=${ficheClient[0]?.result?.data?.json?.solde}`);

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });