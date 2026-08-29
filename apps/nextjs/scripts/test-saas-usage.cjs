const BASE_GARAGE = "http://localhost:3000";
const BASE_CENTRAL = "http://localhost:3001";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };

function makeClient(base) {
  const jar = new Map();
  async function http(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const c = [...jar.entries()].map(([k, v]) => k + "=" + v).join("; ");
    if (c) headers.cookie = c;
    const res = await fetch(base + path, { ...opts, headers, redirect: "manual" });
    const scs = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
    for (const sc of scs) { const pair = sc.split(";")[0]; const i = pair.indexOf("="); if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)); }
    return res;
  }
  async function trpcGet(path, body) {
    const enc = encodeURIComponent(JSON.stringify({ "0": { json: body } }));
    const r = await http("/api/trpc/" + path + "?batch=1&input=" + enc);
    return r.json();
  }
  async function trpcPost(path, body) {
    const r = await http("/api/trpc/" + path + "?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: body } }) });
    return r.json();
  }
  async function login() {
    const csrf = await (await http("/api/auth/csrf")).json();
    await http("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: base + "/dashboard" }),
    });
  }
  return { http, trpcGet, trpcPost, login };
}

(async () => {
  const { Client } = require("pg");
  const clean = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_central" });
  await clean.connect();
  await clean.query("DELETE FROM tenant_usage;");
  await clean.end();
  const cleanG = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await cleanG.connect();
  await cleanG.query("DELETE FROM sync_etat;");
  await cleanG.end();

  const garage = makeClient(BASE_GARAGE);
  const central = makeClient(BASE_CENTRAL);
  await garage.login();
  await central.login();

  // ── 1. Pousser les données → usage agrégé ──
  const p = await garage.trpcPost("sync.pousser", {});
  check("Poussée OK", !p[0]?.error && p[0]?.result?.data?.json?.success === true, JSON.stringify(p[0]?.error?.json?.message));

  const u = await central.trpcGet("central.usage", {});
  const ud = u[0]?.result?.data?.json;
  check("Usage : période courante", !!ud?.periode, JSON.stringify(ud?.periode));
  const gpj = (ud?.sites ?? []).find((s) => s.siteCode === "GPJ-001");
  check("GPJ-001 présent dans l'usage", !!gpj, JSON.stringify(ud?.sites?.map((s) => s.siteCode)));
  check("GPJ-001 : ≥ 3 modules actifs (clients, OR, ventes…)", (gpj?.nbModules ?? 0) >= 3, "n=" + gpj?.nbModules + " " + JSON.stringify(gpj?.modules?.map((m) => m.entite)));
  check("Modules comptés avec lignes", (gpj?.modules ?? []).every((m) => m.nbLignes > 0), JSON.stringify(gpj?.modules?.slice(0, 3)));

  // ── 2. Nouvelle poussée → cumul (upsert) ──
  await garage.trpcPost("sync.pousser", {});
  const u2 = await central.trpcGet("central.usage", {});
  const gpj2 = (u2[0]?.result?.data?.json?.sites ?? []).find((s) => s.siteCode === "GPJ-001");
  check("Cumul après 2e poussée (nbLignes ≥)", (gpj2?.modules ?? []).every((m, i) => m.nbLignes >= (gpj?.modules?.[i]?.nbLignes ?? 0)));

  // ── 3. Tri par adoption (top garages en premier) ──
  const sorted = (u2[0]?.result?.data?.json?.sites ?? []).map((s) => s.nbModules);
  check("Sites triés par adoption décroissante", sorted.every((v, i) => i === 0 || sorted[i - 1] >= v), JSON.stringify(sorted));

  console.log(`\nRÉSULTAT USAGE : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });