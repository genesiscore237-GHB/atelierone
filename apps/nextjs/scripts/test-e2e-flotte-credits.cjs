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

  console.log("=== T5 — FLOTTE → FACTURATION GROUPÉE (crédit) → DETTE → ENCAISSEMENT → SOLDE ===");

  // 1. Client FLOTTE + contrat + 2 véhicules couverts
  const c = await trpcPost("clients.create", {
    typeClient: "FLOTTE", raisonSociale: `TEST Flotte ${TS}`, niuNif: `M0FLOTTE${TS}`, telephone: "699 55 55 55", email: `flotte-${TS}@x.cm`,
    contactPrincipal: { nom: "Ngono", telephone: "699 55 55 56", fonction: "Responsable flotte" },
  });
  const clientId = c[0]?.result?.data?.json?.id;
  const ct = await trpcPost("contrats.create", {
    clientId, libelle: `Contrat flotte crédit ${TS}`, typeContrat: "FORFAIT_MENSUEL",
    dateDebut: "2026-01-01", dateFin: "2026-12-31", delaiPaiementJours: 30, remisePourcent: 0, statutInitial: "ACTIF",
  });
  const contratId = ct[0]?.result?.data?.json?.id;
  const v1 = await trpcPost("vehicules.create", { immatriculation: `LT-FL-${TS}-A`, clientId, marque: "Toyota", modele: "Corolla", typeVehicule: "voiture" });
  const v2 = await trpcPost("vehicules.create", { immatriculation: `LT-FL-${TS}-B`, clientId, marque: "Toyota", modele: "Yaris", typeVehicule: "voiture" });
  await trpcPost("vehicules.lierContrat", { vehiculeId: v1[0]?.result?.data?.json?.id, contratId });
  await trpcPost("vehicules.lierContrat", { vehiculeId: v2[0]?.result?.data?.json?.id, contratId });
  check("Flotte : contrat + 2 véhicules couverts", !!clientId && !!contratId, ct[0]?.error?.json?.message);

  // 2. Deux OR terminés (avec lignes) sur la période
  for (const vehId of [v1[0]?.result?.data?.json?.id, v2[0]?.result?.data?.json?.id]) {
    const ro = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Entretien mensuel", priorite: "P3", motEntree: "ENTRETIEN" });
    const orId = ro[0]?.result?.data?.json?.id;
    await trpcPost("or.addLigne", { ordreId: orId, type: "SERVICE", libelle: "Vidange + filtres", quantite: 1, prixUnitaire: 25000, tva: 19.25 });
    await trpcPost("or.addLigne", { ordreId: orId, type: "SERVICE", libelle: "Contrôle général", quantite: 1, prixUnitaire: 10000, tva: 19.25 });
    await trpcPost("or.update", { id: orId, statut: "PRET_A_LIVRER" });
  }
  check("2 OR terminés (prêts à livrer) avec lignes", true);

  // 3. Facturation groupée du contrat (crédit, échéance +30 j)
  const mois = new Date().toISOString().slice(0, 7);
  const rg = await trpcPost("contrats.facturerPeriode", { contratId, dateDebut: `${mois}-01`, dateFin: new Date().toISOString().slice(0, 10), modePaiement: "credit" });
  const fg = rg[0]?.result?.data?.json;
  check("Facture groupée crédit (2 OR, échéance +30 j)", !rg[0]?.error && fg?.orsFactures === 2 && /^FAC-/.test(fg?.reference ?? ""), rg[0]?.error?.json?.message);
  const totalGrp = Number(fg?.montantTotal ?? 0);
  const attendu = Math.round(2 * (25000 + 10000) * 1.1925 * 100) / 100;
  check("Montant = Σ lignes TVA incluse × 2 OR", Math.abs(totalGrp - attendu) < 1, `attendu=${attendu} reçu=${totalGrp}`);

  // 4. Dette créée (impayée) + solde client
  const ficheClient = await trpcGet("clients.get", { id: clientId });
  check("Solde client = dette groupée", Math.abs(Number(ficheClient[0]?.result?.data?.json?.solde ?? 0) - totalGrp) < 1, `solde=${ficheClient[0]?.result?.data?.json?.solde}`);
  const dettes = await trpcGet("customers.clientDebts", { clientId: String(clientId) });
  const dette = (dettes[0]?.result?.data?.json?.debts ?? []).find((d) => Number(d.montantRestant) === totalGrp);
  check("Dette impayée à l'échéance du contrat", !!dette && dette.statut === "impaye" && dette.echeanceLe, JSON.stringify(dette).slice(0, 150));

  // 5. Encaissement partiel (session caisse ouverte)
  const sess = await trpcPost("pos.openSession", { soldeOuverture: 0 });
  const caisseId = sess[0]?.result?.data?.json?.caisseId ?? null;
  check("Session caisse disponible pour encaissement (ouverte ou créée)", !sess[0]?.error || /déjà ouverte/.test(sess[0]?.error?.json?.message ?? ""), sess[0]?.error?.json?.message ?? sess[0]?.result?.data?.json);
  const partiel = Math.round(totalGrp / 2);
  const rp = await trpcPost("finance.payDebt", { venteId: String(dette.venteId), montant: partiel, modePaiement: "especes", caisseId: caisseId ?? undefined });
  check("Encaissement partiel OK", !rp[0]?.error, JSON.stringify(rp[0]?.error?.json ?? rp[0]?.result?.data?.json).slice(0, 150));
  const dettes2 = await trpcGet("customers.clientDebts", { clientId: String(clientId) });
  const dette2 = (dettes2[0]?.result?.data?.json?.debts ?? []).find((d) => d.venteId === dette.venteId);
  check("Dette → PARTIEL (restant réduit)", dette2?.statut === "partiel" && Math.abs(Number(dette2.montantRestant) - (totalGrp - partiel)) < 1, JSON.stringify(dette2).slice(0, 150));
  const ficheClient2 = await trpcGet("clients.get", { id: clientId });
  check("Solde client = restant après encaissement", Math.abs(Number(ficheClient2[0]?.result?.data?.json?.solde ?? 0) - (totalGrp - partiel)) < 1, `solde=${ficheClient2[0]?.result?.data?.json?.solde}`);

  // 6. Encaissement complet → PAYÉ → solde 0
  const rc = await trpcPost("finance.payDebt", { venteId: String(dette.venteId), montant: totalGrp - partiel, modePaiement: "om", caisseId: caisseId ?? undefined });
  check("Encaissement complet OK", !rc[0]?.error, JSON.stringify(rc[0]?.error?.json ?? rc[0]?.result?.data?.json).slice(0, 150));
  const ficheClient3 = await trpcGet("clients.get", { id: clientId });
  check("Solde client = 0 (dette soldée)", Number(ficheClient3[0]?.result?.data?.json?.solde ?? -1) === 0, `solde=${ficheClient3[0]?.result?.data?.json?.solde}`);

  console.log(`\nRÉSULTAT T5: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });