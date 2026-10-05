const BASE = "http://localhost:3000";
const { Client } = require("pg");
const sign = require("node:crypto");
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
  async function trpcGet(path, body) {
    const enc = encodeURIComponent(JSON.stringify({ "0": { json: body } }));
    const r = await http("/api/trpc/" + path + "?batch=1&input=" + enc);
    return r.json();
  }
  async function trpcPost(path, body) {
    const r = await http("/api/trpc/" + path + "?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: body } }) });
    return r.json();
  }
  const csrf = await (await http("/api/auth/csrf")).json();
  await http("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }),
  });

  // Insérer un jeton expiré
  const SECRET = "sim-secret-atelierone-2026";
  const payload = { siteId: "GPJ-001", nomGarage: "Garage", dateDebut: "2026-07-01", dateFin: "2026-07-10", graceJours: 7, mode: "ABONNEMENT", emitLe: new Date().toISOString() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign.createHmac("sha256", SECRET).update(body).digest("base64url");
  const client = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await client.connect();
  await client.query("UPDATE licence_locale SET jeton=$1, date_fin=$2", [body + "." + sig, new Date("2026-07-10")]);
  await client.end();

  await new Promise((r) => setTimeout(r, 6500));
  const e = await trpcGet("licence.etat", {});
  console.log("etat:", JSON.stringify(e[0]?.result?.data?.json));
  const or2 = await trpcPost("or.create", { vehiculeId: 9, plainte: "Test", priorite: "P3" });
  console.log("ERREUR COMPLÈTE:", JSON.stringify(or2[0]?.error).slice(0, 400));
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });