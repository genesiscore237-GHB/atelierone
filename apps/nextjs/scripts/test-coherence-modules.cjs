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

  console.log("=== COHÉRENCE — C1/C2/C3 : Client ↔ Véhicule ↔ OR ↔ Stock ===");
  const c = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: `Test Coh ${TS}`, prenom: "Stock", telephone: "699 77 77 77" });
  const clientId = c[0]?.result?.data?.json?.id;
  const v = await trpcPost("vehicules.create", { immatriculation: `LT-COH-${TS}`, clientId, marque: "Ford", modele: "Ranger", typeVehicule: "utilitaire" });
  const vehId = v[0]?.result?.data?.json?.id;

  // C1 : véhicule ↔ client
  const ficheV = await trpcGet("vehicules.get", { id: vehId });
  check("C1 — Véhicule lié au client (fiche véhicule → propriétaire)", ficheV[0]?.result?.data?.json?.client?.id === clientId, JSON.stringify(ficheV[0]?.result?.data?.json?.client).slice(0, 80));

  // C2 : OR hérite le client du véhicule
  const ro = await trpcPost("or.create", { vehiculeId: vehId, plainte: "Révision", priorite: "P3", motEntree: "ENTRETIEN" });
  const orId = ro[0]?.result?.data?.json?.id;
  const orFiche = await trpcGet("or.getById", { id: orId });
  check("C2 — OR hérite le client du véhicule", orFiche[0]?.result?.data?.json?.clientId === clientId, `clientId=${orFiche[0]?.result?.data?.json?.clientId}`);

  // C3a : Réservation (dispo 10 → 8) puis sortie (dispo 8 → 8-2=6)
  const prod = await trpcGet("catalog.list", { query: "Plaquettes atelier", limit: 10 });
  const prodId = Number((prod[0]?.result?.data?.json?.items ?? []).find((p) => p.titre === "Plaquettes atelier test")?.id);
  const r1 = await trpcPost("stock.reserverStock", { orId, produitId: prodId, quantite: 2, motif: "Réservation test cohérence" });
  check("C3a — Réservation OK (dispo 10 → 8)", !r1[0]?.error && r1[0]?.result?.data?.json?.disponible === 8, JSON.stringify(r1[0]?.result?.data?.json ?? r1[0]?.error?.json).slice(0, 120));
  const r2 = await trpcPost("stock.sortirPourOR", { orId, produitId: prodId, quantite: 2, motif: "Sortie réservée" });
  check("C3b — Sortie de la quantité réservée OK (stock 10 → 8)", !r2[0]?.error && r2[0]?.result?.data?.json?.stockApres === 8, JSON.stringify(r2[0]?.result?.data?.json ?? r2[0]?.error?.json).slice(0, 120));
  const r3 = await trpcPost("stock.retourAtelier", { orId, produitId: prodId, quantite: 1, motif: "Pièce non utilisée" });
  check("C3c — Retour atelier réintègre (stock 8 → 9)", !r3[0]?.error && r3[0]?.result?.data?.json?.stockApres === 9, JSON.stringify(r3[0]?.result?.data?.json ?? r3[0]?.error?.json).slice(0, 120));
  const mvts = await trpcGet("stock.listMouvementsParOR", { orId });
  const types = new Set((mvts[0]?.result?.data?.json ?? []).map((m) => m.type));
  check("C3d — Mouvements tracés (SORTIE_OR + RETOUR_ATELIER + RESERVATION)", types.has("SORTIE_OR") && types.has("RETOUR_ATELIER") && types.has("RESERVATION"), [...types].join(","));

  // C3e : sortie bloquée si OR PRÊT À LIVRER (statut V2)
  await trpcPost("or.update", { id: orId, statut: "PRET_A_LIVRER" });
  const r4 = await trpcPost("stock.sortirPourOR", { orId, produitId: prodId, quantite: 1, motif: "Doit être refusée" });
  check("C3e — Sortie bloquée si OR PRÊT À LIVRER", !!r4[0]?.error && /PRÊT|LIVRE|ANNUL/.test(r4[0].error.json.message), r4[0]?.error?.json?.message);

  console.log("\n=== C7 — INVENTAIRE → STOCK → OR (écart appliqué puis sortie) ===");
  const sess = await trpcPost("stock.createSessionInventaire", { libelle: `Inventaire cohérence ${TS}` });
  const sid = sess[0]?.result?.data?.json?.id;
  await trpcPost("stock.demarrerSessionInventaire", { id: sid });
  const cmp = await trpcPost("stock.compterProduit", { sessionId: sid, produitId: String(prodId), quantiteReelle: 20, commentaire: "Comptage correction" });
  const ecart = Number(cmp[0]?.result?.data?.json?.ecart ?? 0);
  check("C7a — Comptage (écart = réelle − théorique)", !cmp[0]?.error && ecart === 20 - Number(cmp[0]?.result?.data?.json?.quantiteTheorique ?? 0), JSON.stringify(cmp[0]?.result?.data?.json ?? cmp[0]?.error?.json).slice(0, 100));
  await trpcPost("stock.validerSession", { id: sid });
  const mvtsInv = await trpcGet("stock.getMouvements", { produitId: String(prodId), type: "AJUSTEMENT_INVENTAIRE_POSITIF", limit: 3 });
  const ajust = (mvtsInv[0]?.result?.data?.json ?? []).find((m) => Number(m.stockApres) === 20);
  check("C7b — Écart appliqué au stock via mouvement d'ajustement (= 20)", !!ajust, JSON.stringify(mvtsInv[0]?.result?.data?.json ?? []).slice(0, 140));

  // C7c : nouvel OR → sortie utilisable avec le stock corrigé
  const v2 = await trpcPost("vehicules.create", { immatriculation: `LT-COH2-${TS}`, clientId, marque: "Ford", modele: "Focus", typeVehicule: "voiture" });
  const ro2 = await trpcPost("or.create", { vehiculeId: v2[0]?.result?.data?.json?.id, plainte: "Freins", priorite: "P3", motEntree: "DIAGNOSTIC" });
  const or2Id = ro2[0]?.result?.data?.json?.id;
  const sortie = await trpcPost("stock.sortirPourOR", { orId: or2Id, produitId: prodId, quantite: 2, motif: "Sortie post-inventaire" });
  check("C7c — Sortie possible avec le stock corrigé (20 → 18)", !sortie[0]?.error && sortie[0]?.result?.data?.json?.stockApres === 18, JSON.stringify(sortie[0]?.result?.data?.json ?? sortie[0]?.error?.json).slice(0, 100));

  console.log(`\nRÉSULTAT COHÉRENCE: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });