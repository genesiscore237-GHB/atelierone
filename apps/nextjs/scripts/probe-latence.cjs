const BASE = "http://localhost:3000";
const { performance } = require("perf_hooks");
(async () => {
  const jar = new Map();
  async function http(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const ck = [...jar.entries()].map(([k, v]) => k + "=" + v).join("; ");
    if (ck) headers.cookie = ck;
    const res = await fetch(BASE + path, { ...opts, headers, redirect: "manual" });
    const scs = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
    for (const sc of scs) { const pair = sc.split(";")[0]; const i = pair.indexOf("="); if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)); }
    return res;
  }
  async function trpcPost(path, body) {
    const t0 = performance.now();
    const r = await http("/api/trpc/" + path + "?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: body } }) });
    const ms = performance.now() - t0;
    let err = "";
    try { const j = await r.json(); err = j[0]?.error?.json?.message ?? ""; } catch {}
    return { ms: Math.round(ms), err };
  }
  async function trpcGet(path, body) {
    const enc = encodeURIComponent(JSON.stringify({ "0": { json: body ?? {} } }));
    const t0 = performance.now();
    const r = await http("/api/trpc/" + path + "?batch=1&input=" + enc);
    const ms = performance.now() - t0;
    let err = "";
    try { const j = await r.json(); err = j[0]?.error?.json?.message ?? ""; } catch {}
    return { ms: Math.round(ms), err };
  }

  const csrf = await (await http("/api/auth/csrf")).json();
  await http("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }) });

  const tests = [
    ["GET  user.getMe", () => trpcGet("user.getMe")],
    ["GET  licence.etat", () => trpcGet("licence.etat")],
    ["GET  rh.list (200)", () => trpcGet("rh.list", { limit: 200, statut: "actif" })],
    ["GET  rhPosture.now", () => trpcGet("rhPosture.now")],
    ["GET  rhPosture.journee", () => trpcGet("rhPosture.journee", { employeId: 9 })],
    ["GET  outillage.list", () => trpcGet("outillage.list", { limit: 300 })],
    ["GET  outillage.pretsEnCours", () => trpcGet("outillage.pretsEnCours")],
    ["GET  stock.getDashboard", () => trpcGet("stock.getDashboard")],
    ["GET  stock.getAlertes", () => trpcGet("stock.getAlertes")],
    ["GET  stock.getMouvements (50)", () => trpcGet("stock.getMouvements", { limit: 50 })],
    ["GET  stock.getMouvements (500)", () => trpcGet("stock.getMouvements", { limit: 500 })],
    ["GET  stock.chercherAvantCommander", () => trpcGet("stock.chercherAvantCommander", { q: "", type: "TOUS", limit: 100 })],
    ["GET  catalog.listProducts (500)", () => trpcGet("catalog.listProducts", { query: "", limit: 500 })],
    ["GET  catalog.listProducts 'h'", () => trpcGet("catalog.listProducts", { query: "h", limit: 500 })],
    ["GET  catalog.listCategories", () => trpcGet("catalog.listCategories")],
    ["GET  catalog.getArbreEmballage", () => trpcGet("catalog.getArbreEmballage", { produitId: "1" })],
    ["GET  inventory.getStock", () => trpcGet("inventory.getStock", { produitId: "1" })],
    ["GET  inventory.getMovements (50)", () => trpcGet("inventory.getMovements", { produitId: "1", limit: 50 })],
    ["GET  stock.getStocksDormants", () => trpcGet("stock.getStocksDormants", { jours: 90, limit: 50 })],
    ["GET  stock.dlcAlertes", () => trpcGet("stock.dlcAlertes", { seuilJours: 30 })],
    ["GET  stock.getAlertesAntiVol", () => trpcGet("stock.getAlertesAntiVol")],
    ["GET  stock.getPrevisionsAchat", () => trpcGet("stock.getPrevisionsAchat", {})],
    ["GET  stock.listDemandesCommande", () => trpcGet("stock.listDemandesCommande")],
    ["GET  rhDashboard.getKpis", () => trpcGet("rhDashboard.getKpis")],
    ["GET  or.getDashboard", () => trpcGet("or.getDashboard")],
    ["GET  or.list (200)", () => trpcGet("or.list", { limit: 200 })],
    ["GET  vehicules.list", () => trpcGet("vehicules.list", { limit: 100 })],
    ["GET  finance.treasuryDashboard", () => trpcGet("finance.treasuryDashboard")],
    ["GET  sync.etat", () => trpcGet("sync.etat")],
  ];

  // 3 passes, on garde le meilleur (cache à chaud) ET on note le premier (froid)
  const results = [];
  for (const [label, fn] of tests) {
    const first = await fn();
    const warm = [];
    for (let i = 0; i < 3; i++) { const r = await fn(); warm.push(r.ms); }
    const best = Math.min(...warm);
    results.push({ label, froid: first.ms, chaud: best, err: first.err });
  }
  results.sort((a, b) => b.froid - a.froid);
  console.log("Requête | 1er (froid) | meilleur (chaud)");
  console.log("-".repeat(70));
  for (const r of results) {
    console.log(`${r.label.padEnd(40)} ${String(r.froid).padStart(6)} ms   ${String(r.chaud).padStart(6)} ms ${r.err ? "  ERR: " + r.err.slice(0, 60) : ""}`);
  }
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });