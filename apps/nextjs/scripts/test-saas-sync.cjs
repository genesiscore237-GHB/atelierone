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
  async function trpcPost(path, body) {
    const r = await http("/api/trpc/" + path + "?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: body } }) });
    return r.json();
  }
  async function trpcGet(path, body) {
    const enc = encodeURIComponent(JSON.stringify({ "0": { json: body } }));
    const r = await http("/api/trpc/" + path + "?batch=1&input=" + enc);
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
  return { http, trpcPost, trpcGet, login };
}

(async () => {
  const { Client } = require("pg");
  const clean = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_central" });
  await clean.connect();
  await clean.query("DELETE FROM sync_ingests; DELETE FROM tenant_snapshots;");
  await clean.end();
  const cleanG = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await cleanG.connect();
  await cleanG.query("DELETE FROM sync_etat;");
  await cleanG.end();

  const garage = makeClient(BASE_GARAGE);
  const central = makeClient(BASE_CENTRAL);
  await garage.login();
  await central.login();

  // ── 1. État sync avant ──
  const s0 = await garage.trpcGet("sync.etat", {});
  const s0d = s0[0]?.result?.data?.json;
  check("Sync configuré (centralUrl + siteCode)", s0d?.actif === true && s0d?.centralUrl === BASE_CENTRAL && s0d?.siteCode === "GPJ-001", JSON.stringify(s0d));

  // ── 2. Poussée manuelle (deltas 90 j) ──
  const p = await garage.trpcPost("sync.pousser", {});
  const pd = p[0]?.result?.data?.json;
  check("Poussée réussie", !p[0]?.error && pd?.success === true, JSON.stringify(p[0]?.error?.json?.message ?? pd));
  check("Des lignes envoyées", (pd?.envoye ?? 0) > 0, "envoye=" + pd?.envoye);

  // ── 3. Le central a reçu les ingests ──
  const ing = await central.trpcGet("central.ingests", { limit: 100 });
  const ingList = (ing[0]?.result?.data?.json ?? []) || [];
  check("Ingests reçus au central", ingList.length > 0, "n=" + ingList.length);
  const entites = new Set(ingList.map((i) => i.entite));
  check("Tables métier présentes (clients, ventes, OR…)", ["clients", "ventes", "ordres_reparation"].every((e) => entites.has(e)), [...entites].join(","));
  const nbLignes = ingList.reduce((s, i) => s + (i.nbLignes ?? 0), 0);
  check("Lignes totales > 0", nbLignes > 0, "lignes=" + nbLignes);

  // ── 4. Snapshots agrégés (VENTES) ──
  const dash = await central.trpcGet("central.dashboard", {});
  const dd = dash[0]?.result?.data?.json;
  const ventes = (dd?.snapshots ?? []).find((sn) => sn.type === "VENTES");
  check("Snapshot VENTES agrégé", !!ventes && (ventes.montant ?? 0) > 0, JSON.stringify(ventes));
  check("Ingests 30 j comptés dans les stats", (dd?.stats?.ingests30j ?? 0) > 0, "n=" + dd?.stats?.ingests30j);

  // ── 5. Dernière sync du site mise à jour ──
  const site = (dd?.sites ?? []).find((s) => s.codeSite === "GPJ-001");
  check("Dernière sync mise à jour au central", !!site?.derniereSync, JSON.stringify(site?.derniereSync));

  // ── 6. Idempotence : une poussée immédiate n'envoie pas de volume aberrant ──
  const p2 = await garage.trpcPost("sync.pousser", {});
  const p2d = p2[0]?.result?.data?.json;
  check("2e poussée : volume maîtrisé (≤ 20)", (p2d?.envoye ?? 0) <= 20, "envoye=" + p2d?.envoye);

  // ── 7. Nouvelle donnée → poussée suivante l'emporte ──
  const cl = await garage.trpcGet("clients.list", { limit: 10 });
  const cli = await garage.trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: "Sync", prenom: "Test", telephone: "699 00 00 09", email: "sync@t.cm", ville: "Yaoundé" });
  check("Client créé côté garage", !!cli[0]?.result?.data?.json?.id, cli[0]?.error?.json?.message);
  const p3 = await garage.trpcPost("sync.pousser", {});
  const p3d = p3[0]?.result?.data?.json;
  check("3e poussée : le nouveau client part", (p3d?.envoye ?? 0) >= 1, "envoye=" + p3d?.envoye);

  console.log(`\nRÉSULTAT SYNC : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });