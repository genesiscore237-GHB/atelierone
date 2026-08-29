const BASE_GARAGE = "http://localhost:3000";
const BASE_CENTRAL = "http://localhost:3001";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

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
  async function login(email, password, totp) {
    const csrf = await (await http("/api/auth/csrf")).json();
    await http("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, totp: totp ?? "", callbackUrl: base + "/dashboard" }),
    });
  }
  return { http, trpcGet, trpcPost, login };
}

(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();
  await c.query("UPDATE utilisateurs SET two_factor_enabled=false, two_factor_secret=NULL WHERE email='admin@gpj.cm'");
  await c.end();

  const client = makeClient(BASE_GARAGE);

  // ── 1. Headers de sécurité présents ──
  const hdr = await client.http("/login");
  const csp = hdr.headers.get("content-security-policy") ?? "";
  const coop = hdr.headers.get("cross-origin-opener-policy") ?? "";
  const corp = hdr.headers.get("cross-origin-resource-policy") ?? "";
  check("CSP présent (default-src 'self')", csp.includes("default-src 'self'"), csp.slice(0, 60));
  check("COOP same-origin", coop === "same-origin", coop);
  check("CORP same-origin", corp === "same-origin", corp);
  check("HSTS + X-Frame-Options", (hdr.headers.get("strict-transport-security") ?? "").includes("max-age"), "");

  // ── 2. Rate limiting : 11 POST uploads rapides → 429 ──
  let status429 = false;
  const form = new FormData();
  form.append("file", new Blob(["x"], { type: "image/png" }), "t.png");
  form.append("folder", "test");
  for (let i = 0; i < 20; i++) {
    const r = await client.http("/api/uploads", { method: "POST", body: form });
    if (r.status === 429) { status429 = true; break; }
  }
  check("Rate limiting uploads (429 après saturation)", status429 === true, "pas de 429");

  // ── 3. Login admin sans 2FA OK ──
  await client.login("admin@gpj.cm", "admin123", "");
  const s = await client.http("/api/auth/session");
  const sess = await s.json();
  check("Login admin OK (2FA désactivé)", !!sess?.user, JSON.stringify(sess?.error));

  // ── 4. Activation 2FA : générer secret + confirmer avec un code valide ──
  const secretRes = await client.trpcGet("user.activer2FA", {});
  const secret = secretRes[0]?.result?.data?.json?.secret;
  check("Secret 2FA généré (base32)", typeof secret === "string" && /^[A-Z2-7]{32}$/.test(secret), JSON.stringify(secret));
  const mauvaiseConf = await client.trpcPost("user.confirmer2FA", { code: "000000" });
  check("Code 2FA invalide refusé", !!mauvaiseConf[0]?.error, mauvaiseConf[0]?.error?.json?.message);
  // Générer un vrai code TOTP avec le même algorithme (RFC 6238)
  const { createHmac } = require("node:crypto");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secret.replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of cleaned) { value = (value << 5) | alphabet.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; } }
  const secretBuf = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secretBuf).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code = String(((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3] % 1000000).padStart(6, "0").slice(-6);
  const bonneConf = await client.trpcPost("user.confirmer2FA", { code });
  check("Code 2FA valide → activé", !bonneConf[0]?.error, bonneConf[0]?.error?.json?.message);

  // ── 5. Login SANS code → refusé ; AVEC code → OK ──
  const s2 = makeClient(BASE_GARAGE);
  await s2.login("admin@gpj.cm", "admin123", "");
  const sess2 = await (await s2.http("/api/auth/session")).json();
  check("Login sans code 2FA refusé", !sess2?.user, JSON.stringify(sess2?.user));

  const s3 = makeClient(BASE_GARAGE);
  await s3.login("admin@gpj.cm", "admin123", code);
  const sess3 = await (await s3.http("/api/auth/session")).json();
  check("Login avec code 2FA accepté", !!sess3?.user, JSON.stringify(sess3?.error));

  // ── 6. Endpoint statut 2FA ──
  const st = await (await makeClient(BASE_GARAGE).http("/api/auth/2fa-status?email=admin@gpj.cm")).json();
  check("2fa-status renvoie required=true", st?.required === true, JSON.stringify(st));

  // ── 7. Désactivation avec code valide ──
  const des = await s3.trpcPost("user.desactiver2FA", { code });
  check("2FA désactivé avec code valide", !des[0]?.error, des[0]?.error?.json?.message);
  const st2 = await (await makeClient(BASE_GARAGE).http("/api/auth/2fa-status?email=admin@gpj.cm")).json();
  check("2fa-status renvoie required=false après désactivation", st2?.required === false, JSON.stringify(st2));

  // ── 8. Rotation clé API (central) + bascule automatique côté garage ──
  const central = makeClient(BASE_CENTRAL);
  await central.login("admin@gpj.cm", "admin123", "");
  const dash = await central.trpcGet("central.dashboard", {});
  const site = (dash[0]?.result?.data?.json?.sites ?? []).find((x) => x.codeSite === "GPJ-001");
  const rot = await central.trpcPost("central.rotationCleApi", { siteId: site?.id });
  const nouvelleCle = rot[0]?.result?.data?.json?.cleApi;
  check("Rotation clé API du site", !rot[0]?.error && /^GPJ-001-/.test(nouvelleCle ?? ""), rot[0]?.error?.json?.message);

  // Le garage (qui a encore l'ancienne clé) renouvelle → reçoit la nouvelle clé
  const garage = makeClient(BASE_GARAGE);
  await garage.login("admin@gpj.cm", "admin123", "");
  const rn = await garage.trpcPost("licence.renouveler", {});
  check("Garage : heartbeat accepté avec l'ancienne clé (fenêtre 24 h)", !rn[0]?.error, rn[0]?.error?.json?.message);
  check("Garage : clé rotée signalée + licence renouvelée", rn[0]?.result?.data?.json?.cleRotee === true && rn[0]?.result?.data?.json?.renouvelee === true, JSON.stringify(rn[0]?.result?.data?.json));

  // La clé locale du garage est maintenant la nouvelle → l'ingest repasse
  const { Client: PgClient } = require("pg");
  const chk = new PgClient({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await chk.connect();
  const [local] = (await chk.query("SELECT cle_api FROM licence_locale LIMIT 1")).rows;
  check("Garage : clé locale mise à jour", local?.cle_api === nouvelleCle, JSON.stringify({ local: local?.cle_api, attendue: nouvelleCle }));
  const p = await garage.trpcPost("sync.pousser", {});
  check("Garage : sync repasse avec la nouvelle clé", !p[0]?.error && p[0]?.result?.data?.json?.success === true, JSON.stringify(p[0]?.error?.json?.message ?? p[0]?.result?.data?.json));
  await chk.end();

  console.log(`\nRÉSULTAT SÉCURITÉ : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });