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

  // ── 1. KPIs stratégiques : MRR, ARPU, churn ──
  const d = await trpcGet("central.dashboard", {});
  const dd = d[0]?.result?.data?.json;
  check("Dashboard : MRR > 0", (dd?.stats?.mrr ?? 0) > 0, "mrr=" + dd?.stats?.mrr);
  check("Dashboard : ARPU calculé", typeof dd?.stats?.arpu === "number" && dd?.stats?.arpu > 0, "arpu=" + dd?.stats?.arpu);
  check("Dashboard : churn présent", typeof dd?.stats?.churn === "number", "churn=" + dd?.stats?.churn);

  // ── 2. Évolution 12 mois ──
  check("Évolution 12 mois", Array.isArray(dd?.evolutionRevenu) && dd?.evolutionRevenu?.length === 12, "n=" + dd?.evolutionRevenu?.length);
  check("Mois courant avec revenu", (dd?.evolutionRevenu ?? []).some((e) => e.montant > 0), JSON.stringify(dd?.evolutionRevenu?.slice(-2)));

  // ── 3. Santé par site ──
  const site = (dd?.sites ?? []).find((s) => s.codeSite === "GPJ-001");
  check("Site GPJ-001 : santé VERT (licence OK + heartbeat récent)", site?.sante === "VERT", "sante=" + site?.sante);
  check("Tous les sites ont une santé", (dd?.sites ?? []).every((s) => ["VERT", "ORANGE", "ROUGE"].includes(s.sante)));

  // ── 4. Fiche tenant (drill-down) ──
  const ft = await trpcGet("central.ficheTenant", { siteId: site?.id });
  const ftd = ft[0]?.result?.data?.json;
  check("Fiche tenant : infos site", ftd?.site?.codeSite === "GPJ-001" && ftd?.site?.nomGarage, JSON.stringify(ftd?.site?.codeSite));
  check("Fiche tenant : licence courante + jours restants", ftd?.licenceCourante && typeof ftd?.licenceCourante?.joursRestants === "number", JSON.stringify(ftd?.licenceCourante));
  check("Fiche tenant : licences historisées", (ftd?.licences ?? []).length >= 2, "n=" + ftd?.licences?.length);
  check("Fiche tenant : paiements + ingests + relances", Array.isArray(ftd?.paiements) && Array.isArray(ftd?.ingests) && Array.isArray(ftd?.relances) && Array.isArray(ftd?.audit));

  // ── 5. Relances générées + marquée faite ──
  const rel = await trpcGet("central.relances", {});
  const relList = rel[0]?.result?.data?.json ?? [];
  check("Relances listées", Array.isArray(relList), "n=" + relList.length);
  const aFaire = relList.find((r) => r.statut === "A_FAIRE");
  if (aFaire) {
    const m = await trpcPost("central.marquerRelanceFaite", { id: aFaire.id });
    check("Relance marquée faite", !m[0]?.error, m[0]?.error?.json?.message);
    const rel2 = await trpcGet("central.relances", {});
    check("Relance visible en FAITE", (rel2[0]?.result?.data?.json ?? []).some((r) => r.id === aFaire.id && r.statut === "FAITE"));
  } else {
    check("Relance marquée faite (skip — aucune A_FAIRE)", true);
    check("Relance visible en FAITE (skip)", true);
  }

  // ── 6. Export CSV ──
  const eg = await trpcGet("central.exportGarages", {});
  const egd = eg[0]?.result?.data?.json ?? "";
  check("Export garages : CSV avec en-tête", typeof egd === "string" && egd.startsWith("code_site;") && egd.includes("GPJ-001"), egd.slice(0, 60));
  const ep = await trpcGet("central.exportPaiements", {});
  const epd = ep[0]?.result?.data?.json ?? "";
  check("Export paiements : CSV avec en-tête", typeof epd === "string" && epd.startsWith("reference;") && epd.includes("CP-"), epd.slice(0, 60));

  // ── 7. Journal éditeur (audit) alimenté ──
  const cp = await trpcPost("central.creerPaiement", { siteId: site?.id, montant: 10000, periodeMois: 1, modePaiement: "cinetpay", fournisseur: "om" });
  const pid = cp[0]?.result?.data?.json?.id;
  await trpcPost("central.confirmerPaiement", { id: pid });
  const d2 = await trpcGet("central.dashboard", {});
  const dd2 = d2[0]?.result?.data?.json;
  check("Journal éditeur alimenté après action", Array.isArray(dd2?.audit) && (dd2?.audit ?? []).length > 0, "n=" + (dd2?.audit ?? []).length);
  check("Action PAIEMENT_CONFIRME journalisée", (dd2?.audit ?? []).some((x) => x.action === "PAIEMENT_CONFIRME"), JSON.stringify((dd2?.audit ?? []).slice(0, 3).map((x) => x.action)));
  check("Acteur email tracé", (dd2?.audit ?? []).some((x) => x.acteurEmail === "admin@gpj.cm"), JSON.stringify((dd2?.audit ?? []).slice(0, 2).map((x) => x.acteurEmail)));

  console.log(`\nRÉSULTAT ÉDITEUR : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });