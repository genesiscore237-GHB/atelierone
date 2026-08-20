const BASE = "http://localhost:3000";
const PROD_ID = 19;
const OR_ID = 5;
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

  // 1. Alertes DLC : le lot périmé doit figurer en rouge
  const al = await trpcGet("stock.dlcAlertes", { seuilJours: 30 });
  const alertes = al[0]?.result?.data?.json ?? [];
  const perime = alertes.find((a) => a.numeroLot === "LOT-PERIME");
  const valide = alertes.find((a) => a.numeroLot === "LOT-VALIDE");
  console.log("alertes DLC:", alertes.map((a) => a.numeroLot + ":" + a.statut).join(", "));
  check("Alerte DLC : lot périmé présent (statut perime)", !!perime && perime.statut === "perime", JSON.stringify(alertes).slice(0, 150));
  check("Alerte DLC : lot valide absent", !valide, "");

  // 2. Réservation → bloquée si stock périmé (1 demandé, dispo non périmée 20 ≥ 1... NON : on teste le cas périmé d'abord)
  // Cas A : réserver 25 (dispo non périmée 20 < 25) → bloqué car une partie est périmée
  const resA = await trpcPost("stock.reserverStock", { orId: OR_ID, produitId: PROD_ID, quantite: 25, motif: "Test DLC blocage" });
  console.log("réservation 25:", resA[0]?.error?.json?.message ?? "ACCEPTÉ (anormal)");
  check("Réservation 25 bloquée (dispo non périmée 20 < 25)", !!resA[0]?.error && /p[eé]rim/i.test(resA[0].error.json.message), resA[0]?.error?.json?.message);

  // Cas B : sortir 25 → bloqué pareil
  const sortB = await trpcPost("stock.sortirPourOR", { orId: OR_ID, produitId: PROD_ID, quantite: 25, motif: "Test DLC blocage sortie" });
  console.log("sortie 25:", sortB[0]?.error?.json?.message ?? "ACCEPTÉ (anormal)");
  check("Sortie 25 bloquée (stock périmé inclus)", !!sortB[0]?.error && /p[eé]rim/i.test(sortB[0].error.json.message), sortB[0]?.error?.json?.message);

  // Cas C : sortir 5 (dispo non périmée 20 ≥ 5) → autorisée
  const sortC = await trpcPost("stock.sortirPourOR", { orId: OR_ID, produitId: PROD_ID, quantite: 5, motif: "Sortie DLC valide" });
  console.log("sortie 5:", sortC[0]?.error?.json?.message ?? ("OK stock=" + sortC[0].result.data.json.stockApres));
  check("Sortie 5 autorisée (stock non périmé suffisant)", !sortC[0]?.error, sortC[0]?.error?.json?.message);

  // Cas D : réserver 20 → dispo non périmée restante = 20 → OK (20 ≥ 20)
  const resD = await trpcPost("stock.reserverStock", { orId: OR_ID, produitId: PROD_ID, quantite: 20, motif: "Réservation DLC valide" });
  console.log("réservation 20:", resD[0]?.error?.json?.message ?? ("OK dispo=" + resD[0].result.data.json.disponible));
  check("Réservation 20 autorisée (dispo non périmée = 20)", !resD[0]?.error, resD[0]?.error?.json?.message);

  // Libération pour nettoyage
  await trpcPost("stock.libererStock", { orId: OR_ID, produitId: PROD_ID, quantite: 20, motif: "Libération test DLC" });

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
