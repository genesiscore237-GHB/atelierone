const BASE_CENTRAL = "http://localhost:3001";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_central";

function makeClient() {
  const jar = new Map();
  async function http(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const c = [...jar.entries()].map(([k, v]) => k + "=" + v).join("; ");
    if (c) headers.cookie = c;
    const res = await fetch(BASE_CENTRAL + path, { ...opts, headers, redirect: "manual" });
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
  async function login(email, password) {
    const csrf = await (await http("/api/auth/csrf")).json();
    await http("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: BASE_CENTRAL + "/dashboard" }),
    });
  }
  return { http, trpcGet, trpcPost, login, jar };
}

(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();

  // ── 0. Créer un utilisateur éditeur avec le rôle "consultation" ──
  const hash = require("bcryptjs").hashSync("test-editeur-123", 10);
  await c.query("DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email='editeur.test@gpj.cm')");
  await c.query("DELETE FROM utilisateurs WHERE email='editeur.test@gpj.cm'");
  const [roleCons] = (await c.query("SELECT id FROM roles WHERE code='consultation'")).rows;
  await c.query("INSERT INTO utilisateurs (id, email, nom, prenom, mot_de_passe, agence_id, role_id, is_active, status) VALUES (99901, 'editeur.test@gpj.cm', 'Editeur', 'Test', $1, 1, $2, true, 'active')", [hash, roleCons.id]);
  await c.query("DELETE FROM role_permissions rp USING permissions p WHERE rp.permission_id=p.id AND rp.role_id=$1 AND p.code IN ('central.consulter','central.gerer')", [roleCons.id]);

  const admin = makeClient();
  const cons = makeClient();
  await admin.login("admin@gpj.cm", "admin123");

  // ── 1. Sans permission → lecture refusée (FORBIDDEN) ──
  await cons.login("editeur.test@gpj.cm", "test-editeur-123");
  const r1 = await cons.trpcGet("central.dashboard", {});
  check("Sans central.consulter → dashboard refusé", !!r1[0]?.error && r1[0]?.error?.json?.data?.code === "FORBIDDEN", JSON.stringify(r1[0]?.error?.json?.message));

  // ── 2. central.consulter seul → lecture OK, mutation refusée ──
  const [permConsulter] = (await c.query("SELECT id FROM permissions WHERE code='central.consulter'")).rows;
  await c.query("INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)", [roleCons.id, permConsulter.id]);
  const r2 = await cons.trpcGet("central.dashboard", {});
  check("Avec central.consulter → dashboard OK", !r2[0]?.error && !!r2[0]?.result?.data?.json?.stats, JSON.stringify(r2[0]?.error?.json?.message));
  const r3 = await cons.trpcPost("central.suspendreSite", { id: 1, suspendu: false });
  check("Sans central.gerer → mutation refusée", !!r3[0]?.error && r3[0]?.error?.json?.data?.code === "FORBIDDEN", JSON.stringify(r3[0]?.error?.json?.message));

  // ── 3. central.gerer ajouté → mutation autorisée (et auditée) ──
  const [permGerer] = (await c.query("SELECT id FROM permissions WHERE code='central.gerer'")).rows;
  await c.query("INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)", [roleCons.id, permGerer.id]);
  const dash = await admin.trpcGet("central.dashboard", {});
  const site = (dash[0]?.result?.data?.json?.sites ?? []).find((s) => s.codeSite === "GPJ-001");
  const r4 = await cons.trpcPost("central.etendreLicence", { siteId: site?.id, mois: 1, mode: "ABONNEMENT" });
  check("Avec central.gerer → extension autorisée", !r4[0]?.error && !!r4[0]?.result?.data?.json?.dateFin, r4[0]?.error?.json?.message);
  const dash2 = await admin.trpcGet("central.dashboard", {});
  check("Action de l'éditeur auditée (acteur = editeur.test)", (dash2[0]?.result?.data?.json?.audit ?? []).some((a) => a.action === "LICENCE_ETENDUE" && a.acteurEmail === "editeur.test@gpj.cm"), JSON.stringify((dash2[0]?.result?.data?.json?.audit ?? []).slice(0, 2).map((x) => x.action)));

  // ── 4. Verrouillage anti-brute-force : 6 échecs → 7e refusé ──
  const brute = makeClient();
  let blocked = false;
  for (let i = 0; i < 7; i++) {
    await brute.login("editeur.test@gpj.cm", "mauvais-mot-de-passe");
    const s = await brute.http("/api/auth/session");
    const data = await s.json().catch(() => null);
    if (!data?.user) { blocked = true; break; }
  }
  check("Verrouillage après échecs répétés (login refusé)", blocked === true, "dernier login non bloqué ?");

  // ── 5. Nettoyage ──
  await c.query("DELETE FROM audit_logs WHERE user_id=99901");
  await c.query("DELETE FROM utilisateurs WHERE id=99901");
  await c.query("DELETE FROM role_permissions rp USING permissions p WHERE rp.permission_id=p.id AND rp.role_id=$1 AND p.code IN ('central.consulter','central.gerer')", [roleCons.id]);
  await c.end();

  console.log(`\nRÉSULTAT RBAC : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });