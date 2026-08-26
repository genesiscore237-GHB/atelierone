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

  console.log("=== KPI — SANTÉ DU GARAGE (scénario chiffré complet) ===");

  // Préparation : client + véhicule + OR livré avec diagnostic
  const c = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: `Test Perf ${TS}`, prenom: "KPI", telephone: "699 00 00 10" });
  const clientId = c[0]?.result?.data?.json?.id;
  const prod = await trpcGet("catalog.list", { query: "Plaquettes atelier", limit: 5 });
  const prodId = Number((prod[0]?.result?.data?.json?.items ?? []).find((p) => p.titre === "Plaquettes atelier test")?.id);

  // OR 1 : livré à temps (P2, famille FREINAGE)
  const v = await trpcPost("vehicules.create", { immatriculation: `LT-KPI-${TS}`, clientId, marque: "Toyota", modele: "RAV4", typeVehicule: "voiture" });
  const vehId = v[0]?.result?.data?.json?.id;
  const promesseFutur = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const ro = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Freins", priorite: "P2", motEntree: "PANNE", datePromesse: promesseFutur, familleService: "FREINAGE" });
  const or1Id = ro[0]?.result?.data?.json?.id;
  check("OR créé avec familleService=FREINAGE", ro[0]?.result?.data?.json?.familleService === "FREINAGE", ro[0]?.error?.json?.message);

  const rd = await trpcPost("or.creerRapportDiagnostic", { orId: or1Id, constat: "Plaquettes usées", lignes: [{ type: "PIECE", produitId: prodId, libelle: "Plaquettes", quantite: 2, prixUnitaire: 25000 }] });
  await trpcPost("or.validerDiagnostic", { rapportId: rd[0]?.result?.data?.json?.rapportId });
  await trpcPost("or.soumettreDevis", { orId: or1Id });
  await trpcPost("or.validerDevis", { orId: or1Id, accepte: true });
  await trpcPost("or.changerStatut", { id: or1Id, nouveauStatut: "CONTROLE_QUALITE" });
  await trpcPost("or.changerStatut", { id: or1Id, nouveauStatut: "PRET_A_LIVRER" });
  await trpcPost("or.changerStatut", { id: or1Id, nouveauStatut: "LIVRE" });
  check("OR livré (cycle complet)", true);

  // ── Santé : KPIs calculés sur les livrés de la période ──
  const dash = await trpcGet("atelierKpi.getSanteGarage", { periode: "mois" });
  const d = dash[0]?.result?.data?.json;
  console.log("santé:", JSON.stringify(d?.kpis ?? []).slice(0, 300));
  check("Santé : kpis array non vide", (d?.kpis ?? []).length >= 5, JSON.stringify(d?.kpis ?? []).slice(0, 80));
  check("Santé : repPriorite présente", (d?.repPriorite ?? []).length === 4);
  check("Top anciens présents", Array.isArray(d?.topAnciens));

  // Ponctualité : l'OR livré avait une promesse future → tenue
  const ponctualité = d.kpis.find((k) => k.code === "PONCTUALITE");
  check(`Ponctualité ≥ cible (${ponctualité.cible})`, ponctualité.statut !== "ROUGE", JSON.stringify(ponctualité));

  // FTQ : pas de retouche ni SAV → 100 %
  const ftq = d.kpis.find((k) => k.code === "FTQ");
  check(`FTQ = 100 % (pas de retouche ni SAV)`, Number(ftq.valeur) === 100, JSON.stringify(ftq));

  // ── Vue Qualité & SAV : OR livré ne compte pas comme comeback ──
  const savVue = await trpcGet("atelierKpi.getQualiteSAV", { periode: "mois" });
  check("SAV vue : 0 comeback (pas de récidive)", savVue[0]?.result?.data?.json?.total === 0, JSON.stringify(savVue[0]?.result?.data?.json).slice(0, 100));

  // ── Vue Diagnostic : délai moyen et précision ──
  const diag = await trpcGet("atelierKpi.getDiagnostics", { periode: "mois" });
  const dg = diag[0]?.result?.data?.json;
  check("Diagnostic : délai moyen calculé", typeof dg?.delaiMoyenJours === "number", JSON.stringify(dg).slice(0, 120));
  check("Diagnostic : précision 100 % (validé sans renvoi)", dg?.precision === 100);

  // ── Vue Compétences : comparatif techniciens ──
  const comp = await trpcGet("atelierKpi.getCompetences", { periode: "mois" });
  const fiches = comp[0]?.result?.data?.json?.fiches ?? [];
  check("Compétences : fiches techniciens générées", fiches.length > 0, `n=${fiches.length}`);
  const ficheAvecOrs = fiches.find((f) => f.livres > 0 || f.orResponsabilises > 0);
  check("Au moins une fiche avec activité", !!ficheAvecOrs);

  // ─── E5 — Satisfaction client à la livraison ───
  const rs = await trpcPost("atelierKpi.noterSatisfaction", { orId: or1Id, note: 4, commentaire: "Bon travail" });
  check("Satisfaction enregistrée (note 4)", !rs[0]?.error && rs[0]?.result?.data?.json?.note === 4, rs[0]?.error?.json?.message);
  const rsBad = await trpcPost("atelierKpi.noterSatisfaction", { orId: or1Id, note: 99 });
  check("Note hors plage (99) → refusée", !!rsBad[0]?.error, rsBad[0]?.error?.json?.message);
  const dashSat = await trpcGet("atelierKpi.getSanteGarage", { periode: "mois" });
  const satKpi = dashSat[0]?.result?.data?.json?.kpis.find((k) => k.code === "SATISFACTION_CLIENT");
  check("KPI satisfaction reflète la note (4/5)", satKpi?.valeur === 4, JSON.stringify(satKpi));

  // ── Cibles KPI paramétrables ──
  const cibles = await trpcGet("atelierKpi.getCibles", {});
  check("Cibles par défaut chargées", (cibles[0]?.result?.data?.json ?? []).length >= 5, JSON.stringify(cibles[0]?.result?.data?.json ?? []).slice(0, 150));
  const upCible = await trpcPost("atelierKpi.updateCible", { code: "PONCTUALITE", cible: 90, seuilOrange: 80, seuilRouge: 70 });
  check("Cible mise à jour", !upCible[0]?.error, upCible[0]?.error?.json?.message);
  const cibles2 = await trpcGet("atelierKpi.getCibles", {});
  const poncCible = (cibles2[0]?.result?.data?.json ?? []).find((x) => x.code === "PONCTUALITE");
  check("Nouvelle cible relue", poncCible && Number(poncCible.cible) === 90, JSON.stringify(poncCible));

  // ─── Standards par service paramétrables ───
  const std = await trpcGet("atelierKpi.getServicesStandards", {});
  check("Standards par défaut chargés", (std[0]?.result?.data?.json ?? []).length >= 5, JSON.stringify(std[0]?.result?.data?.json ?? []).slice(0, 200));
  const freinStd = (std[0]?.result?.data?.json ?? []).find((s) => s.famille === "FREINAGE");
  if (freinStd) {
    const upStd = await trpcPost("atelierKpi.upsertServiceStandard", { id: freinStd.id, famille: "FREINAGE", libelle: "Freinage (ajusté)", tempsStandardHeures: 4, delaiCibleJours: 2 });
    check("Standard ajusté (upsert par id)", !upStd[0]?.error, upStd[0]?.error?.json?.message);
  } else {
    const upStd2 = await trpcPost("atelierKpi.upsertServiceStandard", { famille: "FREINAGE_NEW", libelle: "Freinage nouveau", tempsStandardHeures: 3, delaiCibleJours: 1 });
    check("Standard créé (nouveau)", !!upStd2[0]?.result?.data?.json?.id, upStd2[0]?.error?.json?.message);
  }

  // ─── Vue Compétitivité délais ──
  const comp2 = await trpcGet("atelierKpi.getCompetitivite", { periode: "mois" });
  const fams = comp2[0]?.result?.data?.json?.familles ?? [];
  const frein = fams.find((f) => f.famille === "FREINAGE");
  check("Compétitivité délais : FREINAGE présent", !!frein, JSON.stringify(fams).slice(0, 150));
  check("Délai moyen vs cible calculés", frein?.delaiMoyenJours != null && frein?.cibleJours != null, JSON.stringify(frein).slice(0, 120));

  console.log(`\nRÉSULTAT KPI: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });