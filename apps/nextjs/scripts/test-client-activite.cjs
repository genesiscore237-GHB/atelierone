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

  // ── 1. Client FLOTTE + 2 véhicules ──
  const suffix = Date.now().toString().slice(-4);
  const rc = await trpcPost("clients.create", { typeClient: "FLOTTE", raisonSociale: `Trans Express ${suffix}`, niuNif: "M071620000099A", telephone: "699 00 00 02", email: "te@x.cm", contactPrincipal: { nom: "Diallo", telephone: "699 00 00 02" } });
  const clientId = rc[0]?.result?.data?.json?.id;
  check("Client FLOTTE créé", !!clientId, rc[0]?.error?.json?.message);

  const rv1 = await trpcPost("vehicules.create", { immatriculation: `TE-${suffix}-A`, clientId, marque: "Toyota", modele: "Hiace", chauffeurNom: "Mbarga" });
  const rv2 = await trpcPost("vehicules.create", { immatriculation: `TE-${suffix}-B`, clientId, marque: "Nissan", modele: "Caravan" });
  const v1 = rv1[0]?.result?.data?.json?.id, v2 = rv2[0]?.result?.data?.json?.id;
  check("2 véhicules créés", !!v1 && !!v2, `v1=${v1} v2=${v2}`);

  // ── 2. Produit + OR facturé pour le véhicule A ──
  const prod = await trpcGet("catalog.list", { query: "Plaquettes atelier", limit: 10 });
  let prodId = Number((prod[0]?.result?.data?.json?.items ?? []).find((p) => p.titre === "Plaquettes atelier test")?.id);
  if (!prodId) {
    const rp = await trpcPost("catalog.create", { typeProduit: "PIECE", titre: "Plaquettes atelier test", codeBarre: "PLAQ-CA-" + suffix, prixAchat: 15000, prixVente: 25000 });
    prodId = rp[0]?.result?.data?.json?.id;
  }

  const ro = await trpcPost("or.create", { vehiculeId: v1, clientId, plainte: "Freinage faible", priorite: "P2", motEntree: "PANNE" });
  const orId = ro[0]?.result?.data?.json?.id;
  check("OR créé (EN_TRAVAUX potentiel)", !!orId, ro[0]?.error?.json?.message);

  // Diagnostic + validation + devis + acceptation → EN_COURS → PRET_A_LIVRER → facture
  const rd = await trpcPost("or.creerRapportDiagnostic", { orId, constat: "Plaquettes usées", cause: "Usure", lignes: [{ type: "PIECE", produitId: prodId, libelle: "Plaquettes AV", quantite: 2, prixUnitaire: 25000 }, { type: "SERVICE", libelle: "MO", quantite: 1, prixUnitaire: 10000 }] });
  const rapportId = rd[0]?.result?.data?.json?.rapportId;
  await trpcPost("or.validerDiagnostic", { rapportId, commentaire: "OK" });
  await trpcPost("or.soumettreDevis", { orId });
  await trpcPost("or.validerDevis", { orId, accepte: true });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "CONTROLE_QUALITE" });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "PRET_A_LIVRER" });
  const fac = await trpcPost("or.facturer", { id: orId, modePaiement: "credit" });
  const venteId = fac[0]?.result?.data?.json?.venteId;
  check("OR facturé (venteId, crédit)", !!venteId, fac[0]?.error?.json?.message);
  const total = Number(fac[0]?.result?.data?.json?.montantTotal ?? 0);
  check("Montant facture > 0", total > 0, "total=" + total);

  // ── 3. Activité : véhicules + états facture ──
  const annee = new Date().getFullYear();
  const g = await trpcGet("clients.getActivite", { clientId, dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` });
  const a = g[0]?.result?.data?.json;
  check("getActivite OK", !!a?.vehicules, JSON.stringify(g[0]?.error?.json?.message));
  check("2 véhicules listés", a?.compteurs?.totalVehicules === 2, JSON.stringify(a?.compteurs));
  const vA = (a?.vehicules ?? []).find((v) => v.id === v1);
  const vB = (a?.vehicules ?? []).find((v) => v.id === v2);
  check("Véhicule A = LIVRE (facturé, livré)", vA?.etat === "LIVRE", vA?.etat);
  check("Véhicule B = SORTI (pas d'OR)", vB?.etat === "SORTI", vB?.etat);
  check("Facture A = NON_TRANSMISE", vA?.factures?.[0]?.etat === "NON_TRANSMISE", JSON.stringify(vA?.factures));
  check("Facture A montants", vA?.factures?.[0]?.total === total && vA?.factures?.[0]?.reste === total, JSON.stringify(vA?.factures?.[0]));
  check("Facturation synthèse", a?.facturation?.totalFacture === total && a?.facturation?.totalReste === total, JSON.stringify(a?.facturation));

  // ── 4. Cycle de transmission ──
  const t1 = await trpcPost("clients.marquerFactureTransmise", { orId });
  check("Marquer transmise", !t1[0]?.error, t1[0]?.error?.json?.message);
  const g2 = await trpcGet("clients.getActivite", { clientId, dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` });
  const a2 = g2[0]?.result?.data?.json;
  const vA2 = (a2?.vehicules ?? []).find((v) => v.id === v1);
  check("État = ATTENTE_PAIEMENT après transmission", vA2?.factures?.[0]?.etat === "ATTENTE_PAIEMENT", vA2?.factures?.[0]?.etat);

  const t2 = await trpcPost("clients.marquerAttenteBonCommande", { orId });
  check("Attente bon de commande", !t2[0]?.error, t2[0]?.error?.json?.message);
  const g3 = await trpcGet("clients.getActivite", { clientId, dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` });
  const a3 = g3[0]?.result?.data?.json;
  const vA3 = (a3?.vehicules ?? []).find((v) => v.id === v1);
  check("État = ATTENTE_BON_COMMANDE", vA3?.factures?.[0]?.etat === "ATTENTE_BON_COMMANDE", vA3?.factures?.[0]?.etat);

  const t3 = await trpcPost("clients.reprendreFacture", { orId });
  check("BC reçu → relance", !t3[0]?.error, t3[0]?.error?.json?.message);
  const g4 = await trpcGet("clients.getActivite", { clientId, dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` });
  const a4 = g4[0]?.result?.data?.json;
  const vA4 = (a4?.vehicules ?? []).find((v) => v.id === v1);
  check("État = ATTENTE_PAIEMENT après BC reçu", vA4?.factures?.[0]?.etat === "ATTENTE_PAIEMENT", vA4?.factures?.[0]?.etat);

  // ── 5. Avance + paiement complet ──
  const avance = Math.round(total / 2);
  const p1 = await trpcPost("finance.payDebt", { venteId: String(venteId), montant: avance, modePaiement: "especes" });
  check("Avance encaissée", !p1[0]?.error, p1[0]?.error?.json?.message);
  const g5 = await trpcGet("clients.getActivite", { clientId, dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` });
  const a5 = g5[0]?.result?.data?.json;
  const vA5 = (a5?.vehicules ?? []).find((v) => v.id === v1);
  check("État = AVANCE (partiel)", vA5?.factures?.[0]?.etat === "AVANCE" && vA5?.factures?.[0]?.paye === avance, JSON.stringify(vA5?.factures?.[0]));

  const p2 = await trpcPost("finance.payDebt", { venteId: String(venteId), montant: total - avance, modePaiement: "especes" });
  check("Solde encaissé", !p2[0]?.error, p2[0]?.error?.json?.message);
  const g6 = await trpcGet("clients.getActivite", { clientId, dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` });
  const a6 = g6[0]?.result?.data?.json;
  const vA6 = (a6?.vehicules ?? []).find((v) => v.id === v1);
  check("État = PAYEE + reste 0", vA6?.factures?.[0]?.etat === "PAYEE" && vA6?.factures?.[0]?.reste === 0, JSON.stringify(vA6?.factures?.[0]));
  check("Synthèse : reste = 0", a6?.facturation?.totalReste === 0 && a6?.facturation?.compteurs?.PAYEE === 1, JSON.stringify(a6?.facturation?.compteurs));

  // ── 6. Dashboard direction + facturation ──
  const d = await trpcGet("or.getDashboard", {});
  const dd = d[0]?.result?.data?.json;
  check("Dashboard direction KPIs", typeof dd?.kpis?.totalParc === "number" && typeof dd?.kpis?.enRetard === "number", JSON.stringify(dd?.kpis));
  check("Répartitions avec %", Array.isArray(dd?.repPriorite) && dd?.repPriorite?.length === 4 && typeof dd?.repPriorite?.[0]?.pourcent === "number", JSON.stringify(dd?.repPriorite?.slice(0, 1)));

  const f = await trpcGet("atelierKpi.getFacturation", { periode: "mois" });
  const fd = f[0]?.result?.data?.json;
  check("Facturation direction : totaux + taux", typeof fd?.totalFacture === "number" && fd?.totalFacture >= total && fd?.tauxRecouvrement !== null && typeof fd?.tauxRecouvrement === "number", JSON.stringify({ fact: fd?.totalFacture, taux: fd?.tauxRecouvrement }));
  check("États factures comptés", fd?.etats && typeof fd?.etats?.PAYEE === "number", JSON.stringify(fd?.etats));
  check("Top clients retard", Array.isArray(fd?.topClientsRetard), "n=" + fd?.topClientsRetard?.length);

  // ── 7. Pages servent ──
  for (const p of ["/dashboard", "/dashboard/atelier/performance", "/dashboard/atelier/performance?tab=sav", "/dashboard/atelier/performance?tab=facturation"]) {
    const r = await http(p);
    check("Page " + p, r.status === 200, "status=" + r.status);
  }

  console.log(`\nRÉSULTAT : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });