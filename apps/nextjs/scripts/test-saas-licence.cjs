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
  async function login(email = "admin@gpj.cm", password = "admin123") {
    const csrf = await (await http("/api/auth/csrf")).json();
    await http("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: base + "/dashboard" }),
    });
  }
  return { http, trpcPost, trpcGet, login, jar };
}

(async () => {
  const { Client } = require("pg");
  const sign = require("node:crypto");
  const SECRET = "sim-secret-atelierone-2026";

  // ── 0. Nettoyage (idempotence) ──
  const clean = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await clean.connect();
  await clean.query("DELETE FROM licence_locale; DELETE FROM sync_etat;");
  await clean.end();
  const cleanCentral = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_central" });
  await cleanCentral.connect();
  await cleanCentral.query("DELETE FROM sync_ingests; DELETE FROM tenant_snapshots; DELETE FROM tenant_paiements; DELETE FROM tenant_licences; DELETE FROM tenant_sites;");
  await cleanCentral.end();

  const garage = makeClient(BASE_GARAGE);
  const central = makeClient(BASE_CENTRAL);
  await garage.login();
  await central.login();

  // ── 1. État initial : pas de licence → SANS_LICENCE ──
  const e0 = await garage.trpcGet("licence.etat", {});
  const e0d = e0[0]?.result?.data?.json;
  check("Garage A : SANS_LICENCE au départ", e0d?.statut === "SANS_LICENCE", JSON.stringify(e0d));

  // ── 2. Enregistrement du garage (licence d'essai 30 j) ──
  const reg = await garage.trpcPost("licence.enregistrer", { codeSite: "GPJ-001", nomGarage: "Garage Polyvalent Junior", email: "admin@gpj.cm", ville: "Douala" });
  const regd = reg[0]?.result?.data?.json;
  check("Garage enregistré (essai 30 j)", !!regd?.dateFin && !reg[0]?.error, reg[0]?.error?.json?.message ?? JSON.stringify(regd));
  const joursEssai = Math.ceil((new Date(regd.dateFin) - new Date()) / 86400000);
  check("Essai ≈ 30 jours", joursEssai >= 28 && joursEssai <= 31, "jours=" + joursEssai);

  // ── 3. État : licence OK après enregistrement ──
  const e1 = await garage.trpcGet("licence.etat", {});
  const e1d = e1[0]?.result?.data?.json;
  check("Licence OK (statut + mode ESSAI)", e1d?.statut === "OK" && e1d?.mode === "ESSAI" && e1d?.actif === true, JSON.stringify(e1d));

  // ── 4. Le central a bien le site ──
  const dash = await central.trpcGet("central.dashboard", {});
  const dd = dash[0]?.result?.data?.json;
  const site = (dd?.sites ?? []).find((s) => s.codeSite === "GPJ-001");
  check("Central : site GPJ-001 présent", !!site && site?.licence?.mode === "ESSAI", JSON.stringify(site?.licence));
  check("Central : licence active comptée", dd?.stats?.nbSites === 1 && dd?.stats?.licencesActives === 1, JSON.stringify(dd?.stats));

  // ── 5. Mutation OK avec licence active ──
  const cl = await garage.trpcGet("clients.list", { limit: 10 });
  const clientId = (cl[0]?.result?.data?.json?.clients ?? [])[0]?.id;
  check("Client réel trouvé pour le test", !!clientId, "id=" + clientId);
  const or = await garage.trpcPost("or.create", { vehiculeId: 9, clientId, plainte: "Test licence active", priorite: "P3", motEntree: "ENTRETIEN" });
  const orId = or[0]?.result?.data?.json?.id;
  check("Mutation autorisée avec licence active", !!orId, or[0]?.error?.json?.message);

  // ── 6. Forcer une licence EXPIRÉE (blocage) : insérer un jeton signé avec dateFin dépassée ──
  const payload = { siteId: "GPJ-001", nomGarage: "Garage Polyvalent Junior", dateDebut: "2026-07-01", dateFin: "2026-07-10", graceJours: 7, mode: "ABONNEMENT", emitLe: new Date().toISOString() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign.createHmac("sha256", SECRET).update(body).digest("base64url");
  const jeton = `${body}.${sig}`;
  const client = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await client.connect();
  await client.query("UPDATE licence_locale SET jeton=$1, date_fin=$2, mode='ABONNEMENT'", [jeton, new Date("2026-07-10")]);
  await client.end();

  // La vérification se fait depuis MAINTENANT → dateFin dépassée + grâce dépassée → BLOQUE
  const e2 = await garage.trpcGet("licence.etat", {});
  const e2d = e2[0]?.result?.data?.json;
  check("Licence expirée → BLOQUE", e2d?.statut === "BLOQUE", JSON.stringify(e2d));

  // Query toujours autorisée
  const q = await garage.trpcGet("or.getById", { id: orId });
  check("Query autorisée même bloquée (lecture)", !q[0]?.error, q[0]?.error?.json?.message);

  // Mutation refusée (FORBIDDEN) — attendre le rafraîchissement du garde (cache 5 s)
  await new Promise((r) => setTimeout(r, 6500));
  const or2 = await garage.trpcPost("or.create", { vehiculeId: 9, clientId, plainte: "Doit être refusé", priorite: "P3" });
  check("Mutation refusée quand BLOQUE", !!or2[0]?.error && or2[0]?.error?.json?.data?.code === "FORBIDDEN", JSON.stringify(or2[0]?.error?.json?.message));

  // ── 7. Renouvellement : le central étend (paiement simulé) → heartbeat → OK ──
  const cp = await central.trpcPost("central.creerPaiement", { siteId: site.id, montant: 25000, periodeMois: 1, modePaiement: "cinetpay", fournisseur: "orange_money" });
  const pid = cp[0]?.result?.data?.json?.id;
  check("Paiement créé (EN_ATTENTE)", !!pid, JSON.stringify(cp[0]?.error?.json?.message));
  const cf = await central.trpcPost("central.confirmerPaiement", { id: pid });
  check("Paiement confirmé", !cf[0]?.error, cf[0]?.error?.json?.message);

  const rn = await garage.trpcPost("licence.renouveler", {});
  const rnd = rn[0]?.result?.data?.json;
  check("Heartbeat → licence renouvelée", !rn[0]?.error && rnd?.renouvelee === true, JSON.stringify(rn[0]?.error?.json?.message ?? rnd));
  check("Renouvellement étend la période (ABONNEMENT)", new Date(rnd.dateFin) > new Date(), "fin=" + rnd?.dateFin);

  const e3 = await garage.trpcGet("licence.etat", {});
  const e3d = e3[0]?.result?.data?.json;
  check("Licence redevient OK après paiement", e3d?.statut === "OK" && e3d?.mode === "ABONNEMENT", JSON.stringify(e3d));

  // Mutation autorisée de nouveau
  const or3 = await garage.trpcPost("or.create", { vehiculeId: 9, clientId, plainte: "Après renouvellement", priorite: "P3" });
  check("Mutation autorisée après renouvellement", !!or3[0]?.result?.data?.json?.id, or3[0]?.error?.json?.message);

  console.log(`\nRÉSULTAT LICENCE : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });