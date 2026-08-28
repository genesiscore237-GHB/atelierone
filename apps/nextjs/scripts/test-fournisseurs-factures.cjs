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

  // ── 0. Nettoyage des données de test des runs précédents ──
  const oldList = await trpcGet("fournisseurs.list", { inclureInactifs: true, limit: 200 });
  const olds = (oldList[0]?.result?.data?.json?.fournisseurs ?? []).filter((f) => /^(Eneo Énergie|Pièces Auto DLA) /.test(f.nom));
  for (const f of olds) {
    const fiche = await trpcGet("fournisseurs.get", { id: f.id });
    for (const fx of fiche[0]?.result?.data?.json?.factures ?? []) {
      await trpcPost("fournisseurs.supprimerFacture", { id: fx.id });
    }
  }

  // ── 1. Référentiel : fournisseur CHARGES + fournisseur PIECES ──
  const suffix = Date.now().toString().slice(-4);
  const r1 = await trpcPost("fournisseurs.create", { nom: `Eneo Énergie ${suffix}`, typeService: "ENERGIE", circuit: "CHARGES", contact: "Service client", telephone: "677 11 22 33", conditionsPaiement: "30 jours", niuNif: "M000000000001E", ville: "Douala" });
  const fCharges = r1[0]?.result?.data?.json;
  check("Fournisseur CHARGES créé", !!fCharges?.id && fCharges?.circuit === "CHARGES" && fCharges?.typeService === "ENERGIE" && /^F-/.test(fCharges?.code ?? ""), JSON.stringify(r1[0]?.error?.json?.message));
  const r1b = await trpcPost("fournisseurs.create", { nom: `Pièces Auto DLA ${suffix}`, typeService: "PIECES_AUTO", circuit: "PIECES", telephone: "655 44 55 66" });
  const fPieces = r1b[0]?.result?.data?.json;
  check("Fournisseur PIECES créé", !!fPieces?.id && fPieces?.circuit === "PIECES", r1b[0]?.error?.json?.message);
  const r1c = await trpcPost("fournisseurs.create", { nom: `Pièces Auto DLA ${suffix}`, typeService: "PIECES_AUTO" });
  check("Doublon de nom refusé", !!r1c[0]?.error && /existe déjà/.test(r1c[0].error.json.message), r1c[0]?.error?.json?.message);

  // ── 2. Recherche référentiel ──
  const l1 = await trpcGet("fournisseurs.list", { q: `Eneo Énergie ${suffix}` });
  check("Recherche par nom", (l1[0]?.result?.data?.json?.fournisseurs ?? []).some((f) => f.id === fCharges?.id), "n=" + l1[0]?.result?.data?.json?.total);
  const l2 = await trpcGet("fournisseurs.list", { typeService: "ENERGIE" });
  check("Filtre par type service", (l2[0]?.result?.data?.json?.fournisseurs ?? []).some((f) => f.id === fCharges?.id));
  const l3 = await trpcGet("fournisseurs.list", { circuit: "CHARGES" });
  check("Filtre par circuit CHARGES", (l3[0]?.result?.data?.json?.fournisseurs ?? []).every((f) => f.circuit === "CHARGES"));

  // ── 3. Factures : enregistrement avec libellé, catégorie, circuit, mode, partiel ──
  const f1 = await trpcPost("fournisseurs.createFacture", {
    fournisseurId: fCharges?.id, dateFacture: "2026-08-01", numeroFactureFournisseur: "ENEO-2026-081",
    libelle: "Facture électricité août 2026", categorieDepense: "ELECTRICITE", circuit: "CHARGES",
    modePaiement: "virement", montantTTC: 150000, montantHT: 125000, montantTVA: 25000, montantPaye: 50000,
  });
  const fx1 = f1[0]?.result?.data?.json;
  check("Facture CHARGES créée (partielle)", !!fx1?.id && fx1?.statut === "partielle" && /^FF-/.test(fx1?.reference ?? ""), JSON.stringify(f1[0]?.error?.json?.message));
  check("Facture partielle : payé 50k / reste 100k", Number(fx1?.montantPaye) === 50000 && Number(fx1?.montantRestant) === 100000, JSON.stringify({ p: fx1?.montantPaye, r: fx1?.montantRestant }));

  const f2 = await trpcPost("fournisseurs.createFacture", {
    fournisseurId: fPieces?.id, dateFacture: "2026-08-10", numeroFactureFournisseur: "PADLA-2026-045",
    libelle: "Plaquettes de frein lot 12", circuit: "PIECES", categorieDepense: "OUTILLAGE",
    modePaiement: "om", montantTTC: 240000, montantPaye: 240000,
  });
  const fx2 = f2[0]?.result?.data?.json;
  check("Facture PIECES créée (payée)", fx2?.statut === "paye" && Number(fx2?.montantRestant) === 0, JSON.stringify(fx2?.statut));

  const f3 = await trpcPost("fournisseurs.createFacture", {
    fournisseurId: fCharges?.id, dateFacture: "2026-07-15", numeroFactureFournisseur: "ENEO-2026-070",
    libelle: "Facture électricité juillet 2026", categorieDepense: "ELECTRICITE", circuit: "CHARGES",
    modePaiement: "especes", montantTTC: 130000, montantPaye: 0,
  });
  const fx3 = f3[0]?.result?.data?.json;
  check("Facture impayée créée", fx3?.statut === "impayee", fx3?.statut);

  // ── 4. Recherche intelligente ──
  const rq1 = await trpcGet("fournisseurs.listFactures", { q: "électricité" });
  check("Recherche par mot-clé libellé", (rq1[0]?.result?.data?.json?.factures ?? []).length >= 2 && (rq1[0]?.result?.data?.json?.factures ?? []).every((f) => (f.libelle ?? "").includes("électricité")), "n=" + rq1[0]?.result?.data?.json?.total);
  const rq2 = await trpcGet("fournisseurs.listFactures", { q: "ENEO-2026-081" });
  check("Recherche par n° facture fournisseur", (rq2[0]?.result?.data?.json?.factures ?? []).some((f) => f.id === fx1?.id), "n=" + rq2[0]?.result?.data?.json?.total);
  const rq3 = await trpcGet("fournisseurs.listFactures", { fournisseurId: fCharges?.id });
  check("Filtre fournisseur", (rq3[0]?.result?.data?.json?.factures ?? []).length === 2 && (rq3[0]?.result?.data?.json?.factures ?? []).every((f) => f.fournisseurId === fCharges?.id));
  const rq4 = await trpcGet("fournisseurs.listFactures", { dateDebut: "2026-08-01", dateFin: "2026-08-31" });
  check("Filtre période août", (rq4[0]?.result?.data?.json?.factures ?? []).length === 2, "n=" + rq4[0]?.result?.data?.json?.total);
  const rq5 = await trpcGet("fournisseurs.listFactures", { montantMin: 200000, montantMax: 300000 });
  check("Filtre montant 200k-300k", (rq5[0]?.result?.data?.json?.factures ?? []).some((f) => f.id === fx2?.id) && (rq5[0]?.result?.data?.json?.factures ?? []).every((f) => Number(f.montantTTC) >= 200000 && Number(f.montantTTC) <= 300000), "n=" + rq5[0]?.result?.data?.json?.total);
  const rq6 = await trpcGet("fournisseurs.listFactures", { circuit: "CHARGES" });
  check("Filtre circuit CHARGES", (rq6[0]?.result?.data?.json?.factures ?? []).every((f) => f.circuit === "CHARGES") && (rq6[0]?.result?.data?.json?.factures ?? []).length === 2, "n=" + rq6[0]?.result?.data?.json?.total);
  const rq7 = await trpcGet("fournisseurs.listFactures", { categorieDepense: "ELECTRICITE" });
  check("Filtre catégorie ELECTRICITE", (rq7[0]?.result?.data?.json?.factures ?? []).length === 2, "n=" + rq7[0]?.result?.data?.json?.total);
  const rq8 = await trpcGet("fournisseurs.listFactures", { statut: "paye" });
  check("Filtre statut payée", (rq8[0]?.result?.data?.json?.factures ?? []).some((f) => f.id === fx2?.id));

  // ── 5. Stats globales ──
  const s = await trpcGet("fournisseurs.stats", {});
  const sd = s[0]?.result?.data?.json;
  check("Stats : total TTC = 520k", sd?.totalTTC === 520000, JSON.stringify(sd));
  check("Stats : charges 2 / pièces 1", sd?.charges?.nb === 2 && sd?.pieces?.nb === 1, JSON.stringify({ c: sd?.charges?.nb, p: sd?.pieces?.nb }));
  check("Stats : payé 290k / restant 230k", sd?.totalPaye === 290000 && sd?.totalRestant === 230000, JSON.stringify({ p: sd?.totalPaye, r: sd?.totalRestant }));

  // ── 6. Fiche fournisseur : stats + factures ──
  const g = await trpcGet("fournisseurs.get", { id: fCharges?.id });
  const gd = g[0]?.result?.data?.json;
  check("Fiche : 2 factures + totaux", gd?.factures?.length === 2 && gd?.stats?.nbFactures === 2 && gd?.stats?.totalTTC === 280000, JSON.stringify(gd?.stats));
  check("Fiche : NIU + conditions conservés", gd?.fournisseur?.niuNif === "M000000000001E" && gd?.fournisseur?.conditionsPaiement === "30 jours");

  // ── 7. Paiement + scan ──
  const pay = await trpcPost("fournisseurs.payerFacture", { id: fx3?.id, montant: 130000 });
  check("Paiement total → payée", pay[0]?.result?.data?.json?.statut === "paye" && pay[0]?.result?.data?.json?.montantRestant === 0, JSON.stringify(pay[0]?.error?.json?.message));
  const pay2 = await trpcPost("fournisseurs.payerFacture", { id: fx1?.id, montant: 100000 });
  check("Paiement partiel → reste 0 → payée", pay2[0]?.result?.data?.json?.statut === "paye", JSON.stringify(pay2[0]?.error?.json?.message));
  const pay3 = await trpcPost("fournisseurs.payerFacture", { id: fx1?.id, montant: 1000 });
  check("Déjà payée → refus", !!pay3[0]?.error && /déjà entièrement payée/.test(pay3[0].error.json.message), pay3[0]?.error?.json?.message);

  const sc = await trpcPost("fournisseurs.attacherScan", { id: fx2?.id, fichierUrl: "/uploads/factures-fournisseur/test-scan.pdf" });
  check("Scan rattaché", !sc[0]?.error, sc[0]?.error?.json?.message);
  const rq9 = await trpcGet("fournisseurs.listFactures", { q: "PADLA-2026-045" });
  check("Scan visible dans la liste", (rq9[0]?.result?.data?.json?.factures ?? [])[0]?.fichierUrl?.includes("test-scan.pdf"));

  // ── 8. Suppression (non liée commande) + désactivation ──
  const del = await trpcPost("fournisseurs.supprimerFacture", { id: fx3?.id });
  check("Facture supprimée (archive propre)", !del[0]?.error, del[0]?.error?.json?.message);
  const des = await trpcPost("fournisseurs.changerStatut", { id: fCharges?.id, actif: false });
  check("Fournisseur désactivé", !des[0]?.error && des[0]?.result?.data?.json?.actif === false, des[0]?.error?.json?.message);
  const l4 = await trpcGet("fournisseurs.list", {});
  check("Désactivé masqué par défaut", !(l4[0]?.result?.data?.json?.fournisseurs ?? []).some((f) => f.id === fCharges?.id));
  const l5 = await trpcGet("fournisseurs.list", { inclureInactifs: true });
  check("Visible avec inclureInactifs", (l5[0]?.result?.data?.json?.fournisseurs ?? []).some((f) => f.id === fCharges?.id));

  // ── 9. Pages ──
  for (const p of ["/dashboard/fournisseurs-factures", "/dashboard/fournisseurs-factures?tab=factures"]) {
    const r = await http(p);
    check("Page " + p, r.status === 200, "status=" + r.status);
  }

  console.log(`\nRÉSULTAT : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });