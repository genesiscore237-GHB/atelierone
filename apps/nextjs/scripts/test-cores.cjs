const BASE = "http://localhost:3000";
const CORE_ID = 20;
const NONCORE_ID = 21;
const OR_ID = 6;
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

  // 1. Échange sur un produit NON core → refusé
  const r1 = await trpcPost("stock.creerEchangeCore", { orId: OR_ID, produitId: NONCORE_ID, quantite: 1, valeurCore: 5000, motif: "Test échange non core" });
  console.log("échange non-core:", r1[0]?.error?.json?.message ?? "ACCEPTÉ (anormal)");
  check("Refus si produit non core", !!r1[0]?.error && /échange standard/.test(r1[0].error.json.message), r1[0]?.error?.json?.message);

  // 2. Échange sans valeur de dépôt → refusé
  const r2 = await trpcPost("stock.creerEchangeCore", { orId: OR_ID, produitId: CORE_ID, quantite: 1, valeurCore: 0, motif: "Test dépôt nul" });
  console.log("échange dépôt 0:", r2[0]?.error?.json?.message ?? "ACCEPTÉ (anormal)");
  check("Refus si dépôt = 0", !!r2[0]?.error && /dépôt/.test(r2[0].error.json.message), r2[0]?.error?.json?.message);

  // 3. Échange valide → pièce sortie + échange EN_ATTENTE
  const r3 = await trpcPost("stock.creerEchangeCore", { orId: OR_ID, produitId: CORE_ID, quantite: 2, valeurCore: 25000, motif: "Échange alternateur" });
  console.log("échange valide:", r3[0]?.error?.json?.message ?? ("OK id=" + r3[0].result.data.json.echangeId + " stock=" + r3[0].result.data.json.stockApres));
  const echangeId = r3[0]?.result?.data?.json?.echangeId;
  check("Échange créé (EN_ATTENTE, stock 10→8)", !r3[0]?.error && r3[0].result.data.json.stockApres === 8, r3[0]?.error?.json?.message);

  // 4. Mouvement SORTIE_OR tracé
  const mvts = await trpcGet("stock.listMouvementsParOR", { orId: OR_ID });
  const m = mvts[0]?.result?.data?.json ?? [];
  const sortieCore = m.find((x) => x.type === "SORTIE_OR" && x.produitId === CORE_ID);
  check("Mouvement SORTIE_OR tracé (core)", !!sortieCore, JSON.stringify(m.slice(0, 2)));

  // 5. Liste des cores (filtre OR) : EN_ATTENTE présent
  const cores = await trpcGet("stock.listerCores", { orId: OR_ID });
  const liste = cores[0]?.result?.data?.json ?? [];
  console.log("cores OR:", liste.map((c) => c.produitTitre + ":" + c.statut).join(", "));
  check("Liste cores : 1 échange EN_ATTENTE (dépôt 25000)", liste.length === 1 && liste[0].statut === "EN_ATTENTE" && liste[0].valeurCore === 25000, JSON.stringify(liste).slice(0, 150));

  // 6. Retour de coquille
  const r6 = await trpcPost("stock.retournerCoquille", { echangeId, perdue: false });
  console.log("retour coquille:", r6[0]?.error?.json?.message ?? ("OK statut=" + r6[0].result.data.json.statut));
  check("Coquille rendue (COQUILLE_RETOURNEE)", !r6[0]?.error && r6[0].result.data.json.statut === "COQUILLE_RETOURNEE", r6[0]?.error?.json?.message);

  // 7. Double traitement refusé
  const r7 = await trpcPost("stock.retournerCoquille", { echangeId, perdue: false });
  check("Double retour refusé", !!r7[0]?.error && /déjà traité/.test(r7[0].error.json.message), r7[0]?.error?.json?.message);

  // 8. Coquille perdue sur un 2e échange
  const r8 = await trpcPost("stock.creerEchangeCore", { orId: OR_ID, produitId: CORE_ID, quantite: 1, valeurCore: 25000, motif: "Échange 2 alternateur" });
  const echangeId2 = r8[0]?.result?.data?.json?.echangeId;
  const r8b = await trpcPost("stock.retournerCoquille", { echangeId: echangeId2, perdue: true });
  check("Coquille perdue (COQUILLE_PERDUE, dépôt conservé)", !r8b[0]?.error && r8b[0].result.data.json.statut === "COQUILLE_PERDUE", r8b[0]?.error?.json?.message);

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });