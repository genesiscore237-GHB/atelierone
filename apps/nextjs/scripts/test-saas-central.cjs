const BASE_CENTRAL = "http://localhost:3001";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };

(async () => {
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
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE_CENTRAL + "/dashboard" }),
  });

  // ── 1. Dashboard : le site GPJ-001 existe (créé par le test licence) ──
  const d = await trpcGet("central.dashboard", {});
  const dd = d[0]?.result?.data?.json;
  const site = (dd?.sites ?? []).find((s) => s.codeSite === "GPJ-001");
  check("Dashboard : site GPJ-001", !!site, JSON.stringify(dd?.sites?.map((s) => s.codeSite)));
  check("Dashboard : licence ABONNEMENT + jours restants", site?.licence?.mode === "ABONNEMENT" && typeof site?.licence?.joursRestants === "number" && site?.licence?.joursRestants > 0, JSON.stringify(site?.licence));

  // ── 2. Historique licences ──
  const lic = await trpcGet("central.licences", { siteId: site?.id });
  const licList = lic[0]?.result?.data?.json ?? [];
  check("Licences historisées (ESSAI + ABONNEMENT)", licList.some((l) => l.mode === "ESSAI") && licList.some((l) => l.mode === "ABONNEMENT"), "n=" + licList.length);

  // ── 3. Extension manuelle (support) ──
  const ext = await trpcPost("central.etendreLicence", { siteId: site?.id, mois: 3, mode: "ABONNEMENT" });
  check("Extension manuelle +3 mois", !ext[0]?.error && !!ext[0]?.result?.data?.json?.dateFin, ext[0]?.error?.json?.message);

  // ── 4. Paiement multi-mois + confirmation ──
  const cp = await trpcPost("central.creerPaiement", { siteId: site?.id, montant: 75000, periodeMois: 3, modePaiement: "paydunya", fournisseur: "mtn_momo" });
  const pid = cp[0]?.result?.data?.json?.id;
  check("Paiement 3 mois créé (réf CP-)", !!pid && /^CP-/.test(cp[0]?.result?.data?.json?.reference ?? ""), JSON.stringify(cp[0]?.error?.json?.message));
  const cf = await trpcPost("central.confirmerPaiement", { id: pid });
  check("Paiement confirmé", !cf[0]?.error, cf[0]?.error?.json?.message);
  const cf2 = await trpcPost("central.confirmerPaiement", { id: pid });
  check("Double confirmation refusée", !!cf2[0]?.error && /[Dd]éjà confirmé/.test(cf2[0].error.json.message), cf2[0]?.error?.json?.message);

  // ── 5. Dashboard mis à jour (revenu) ──
  const d2 = await trpcGet("central.dashboard", {});
  const dd2 = d2[0]?.result?.data?.json;
  check("Revenu total = 100 000 F (25k + 75k)", dd2?.stats?.revenuTotal >= 100000, "revenu=" + dd2?.stats?.revenuTotal);
  check("Paiements confirmés comptés", (dd2?.stats?.paiementsConfirmes ?? 0) >= 2, "n=" + dd2?.stats?.paiementsConfirmes);

  // ── 6. Suspension / réactivation ──
  const susp = await trpcPost("central.suspendreSite", { id: site?.id, suspendu: true });
  check("Site suspendu", !susp[0]?.error, susp[0]?.error?.json?.message);
  const d3 = await trpcGet("central.dashboard", {});
  const s3 = (d3[0]?.result?.data?.json?.sites ?? []).find((s) => s.id === site?.id);
  check("Statut SUSPENDU visible", s3?.statut === "SUSPENDU", s3?.statut);
  const react = await trpcPost("central.suspendreSite", { id: site?.id, suspendu: false });
  check("Site réactivé", !react[0]?.error, react[0]?.error?.json?.message);

  // ── 7. Ingests visibles dans l'audit ──
  const ing = await trpcGet("central.ingests", { siteId: site?.id, limit: 50 });
  check("Ingests du site consultables", (ing[0]?.result?.data?.json ?? []).length > 0, "n=" + (ing[0]?.result?.data?.json ?? []).length);

  // ── 8. Page dashboard SaaS ──
  const page = await http("/dashboard/saas");
  check("Page /dashboard/saas (200)", page.status === 200, "status=" + page.status);

  console.log(`\nRÉSULTAT CENTRAL : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });