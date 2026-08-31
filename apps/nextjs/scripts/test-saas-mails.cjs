const BASE_CENTRAL = "http://localhost:3001";
const BASE_GARAGE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");

(async () => {
  const c = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_central" });
  await c.connect();

  // ── 1. Endpoint santé ──
  const h = await fetch(BASE_CENTRAL + "/api/health");
  const hd = await h.json();
  check("Health : 200 + db ok + rôle central", h.status === 200 && hd?.db === true && hd?.role === "central", JSON.stringify(hd));
  const hg = await (await fetch(BASE_GARAGE + "/api/health")).json();
  check("Health garage : rôle garage", hg?.role === "garage", JSON.stringify(hg));

  // ── 2. File d'envoi : bienvenue (inscription d'un garage de test) ──
  await c.query("DELETE FROM tenant_sites WHERE code_site='MAIL-TEST'");
  await c.query("DELETE FROM boite_envoi WHERE type_evenement LIKE 'SAAS_%'");
  const reg = await fetch(BASE_CENTRAL + "/api/sync/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codeSite: "MAIL-TEST", nomGarage: "Garage Mail Test", email: "mailtest@garage.cm" }),
  });
  check("Inscription garage test", reg.status === 200, "status=" + reg.status);
  const bienvenue = (await c.query("SELECT * FROM boite_envoi WHERE type_evenement='SAAS_BIENVENUE_ESSAI'")).rows;
  check("Mail de bienvenue mis en file", bienvenue.length === 1 && bienvenue[0].corps_json?.destinataire === "mailtest@garage.cm", JSON.stringify(bienvenue[0]?.corps_json?.sujet));
  check("Sujet bienvenue + essai 30 j", (bienvenue[0]?.corps_json?.sujet ?? "").includes("30 jours"), bienvenue[0]?.corps_json?.sujet);

  // ── 3. Quittance par email après confirmation de paiement ──
  const [site] = (await c.query("SELECT id FROM tenant_sites WHERE code_site='MAIL-TEST'")).rows;
  const jar = new Map();
  async function http(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const ck = [...jar.entries()].map(([k, v]) => k + "=" + v).join("; ");
    if (ck) headers.cookie = ck;
    const res = await fetch(BASE_CENTRAL + path, { ...opts, headers, redirect: "manual" });
    const scs = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
    for (const sc of scs) { const pair = sc.split(";")[0]; const i = pair.indexOf("="); if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)); }
    return res;
  }
  async function trpcPost(path, body) {
    const r = await http("/api/trpc/" + path + "?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: body } }) });
    return r.json();
  }
  const csrf = await (await http("/api/auth/csrf")).json();
  await http("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE_CENTRAL + "/dashboard" }),
  });
  const cp = await trpcPost("central.creerPaiement", { siteId: site.id, montant: 15000, periodeMois: 1, modePaiement: "cinetpay", fournisseur: "om" });
  const pid = cp[0]?.result?.data?.json?.id;
  await trpcPost("central.confirmerPaiement", { id: pid });
  const quittance = (await c.query("SELECT * FROM boite_envoi WHERE type_evenement='SAAS_QUITTANCE_PAIEMENT'")).rows;
  check("Quittance mise en file", quittance.length === 1 && quittance[0].corps_json?.destinataire === "mailtest@garage.cm", JSON.stringify(quittance[0]?.corps_json?.sujet));
  check("Quittance : référence + montant", (quittance[0]?.corps_json?.corps ?? "").includes("15 000") && (quittance[0]?.corps_json?.sujet ?? "").startsWith("Quittance"), quittance[0]?.corps_json?.sujet);

  // ── 4. Nettoyage ──
  await c.query("DELETE FROM tenant_sites WHERE code_site='MAIL-TEST'");
  await c.query("DELETE FROM boite_envoi WHERE type_evenement LIKE 'SAAS_%'");
  await c.end();

  console.log(`\nRÉSULTAT MAILS : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });