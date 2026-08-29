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
  const garage = makeClient(BASE_GARAGE);
  const central = makeClient(BASE_CENTRAL);
  await garage.login();
  await central.login();

  // ── 1. Portail : configuration + licence locale ──
  const p = await garage.trpcGet("licence.portail", {});
  const pd = p[0]?.result?.data?.json;
  check("Portail : config actif (central + site)", pd?.config?.actif === true && pd?.config?.siteCode === "GPJ-001" && pd?.config?.versionPack, JSON.stringify(pd?.config));
  check("Portail : licence locale OK", pd?.licenceLocale?.statut === "OK" && pd?.licenceLocale?.mode === "ABONNEMENT", JSON.stringify(pd?.licenceLocale));

  // ── 2. Portail : données centrales (licences + paiements) ──
  check("Portail : licences historisées reçues", Array.isArray(pd?.central?.licences) && pd?.central?.licences?.length >= 2, "n=" + pd?.central?.licences?.length);
  check("Portail : paiements reçus (25k + 75k)", Array.isArray(pd?.central?.paiements) && pd?.central?.paiements?.length >= 2 && pd?.central?.paiements?.some((x) => x.statut === "CONFIRME"), "n=" + pd?.central?.paiements?.length);

  // ── 3. Portail : sync par table ──
  check("Portail : sync par table listée", Array.isArray(pd?.sync) && pd?.sync?.length >= 3 && pd?.sync?.every((s) => typeof s.dernierSync === "object" || typeof s.dernierSync === "string"), "n=" + pd?.sync?.length);

  // ── 4. Nouveau paiement → visible dans le portail ──
  const dash = await central.trpcGet("central.dashboard", {});
  const site = (dash[0]?.result?.data?.json?.sites ?? []).find((s) => s.codeSite === "GPJ-001");
  const cp = await central.trpcPost("central.creerPaiement", { siteId: site?.id, montant: 25000, periodeMois: 1, modePaiement: "cinetpay", fournisseur: "mtn_momo" });
  const pid = cp[0]?.result?.data?.json?.id;
  await central.trpcPost("central.confirmerPaiement", { id: pid });
  const p2 = await garage.trpcGet("licence.portail", {});
  const p2d = p2[0]?.result?.data?.json;
  check("Portail : nouveau paiement confirmé visible", (p2d?.central?.paiements ?? []).some((x) => x.id === pid && x.statut === "CONFIRME"), "id=" + pid);

  // ── 5. Page rendue (HTTP) ──
  const page = await garage.http("/dashboard/mon-abonnement");
  check("Page /dashboard/mon-abonnement (200)", page.status === 200, "status=" + page.status);

  console.log(`\nRÉSULTAT PORTAIL : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });