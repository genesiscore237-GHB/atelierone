// P0 — VÉRIFICATION DU CATALOGUE UNIVERSEL (fondations ontologiques).
// DB + API round-trip : migration idempotente, 13 types, provenance/statut, 1000 mm = 1 m,
// catégorie avec domaine (NEW CATEGORY WITHOUT CODE CHANGE), définition ontologique.
// Nettoyage immédiat : aucune trace en prod (hard delete SQL des données de test).
const BASE = "http://localhost:3000";
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };

(async () => {
  const jar = new Map();
  async function http(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const ck = [...jar.entries()].map(([k, v]) => k + "=" + v).join("; ");
    if (ck) headers.cookie = ck;
    const res = await fetch(BASE + path, { ...opts, headers, redirect: "manual" });
    const scs = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
    for (const sc of scs) { const pair = sc.split(";")[0]; const i = pair.indexOf("="); if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)); }
    return res;
  }
  async function trpcPost(path, body) {
    const r = await http("/api/trpc/" + path + "?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: body } }) });
    return r.json();
  }
  async function trpcGet(path, body) {
    const enc = encodeURIComponent(JSON.stringify({ "0": { json: body ?? {} } }));
    const r = await http("/api/trpc/" + path + "?batch=1&input=" + enc);
    return r.json();
  }
  const pg = new Client({ connectionString: DSN });
  await pg.connect();
  const q = async (sql, args) => (await pg.query(sql, args)).rows;
  const qd0 = async (sql, args) => { try { const r = await pg.query(sql, args); return r.rows; } catch { return []; } };
  await qd0("DELETE FROM attribut_definitions WHERE cle IN ('largeur_conseillee','certifie')", []);
  await qd0("DELETE FROM categories WHERE code LIKE 'P0ONT-%'", []);

  // ── 0. Auth ──────────────────────────────────────────────────────────────
  const csrf = await (await http("/api/auth/csrf")).json();
  const login = await http("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }),
  });
  check("Login admin (redirect dashboard)", login.status === 302, "status=" + login.status);
  if (login.status !== 302) { console.log("ABORT - authentification"); process.exit(1); }

  // ── 1. DB : schéma P0 présent ────────────────────────────────────────────
  const tables = await q("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('attribut_definitions','unites_domaines','unites_conversions')");
  check("Tables P0 présentes", tables.length === 3, "found=" + tables.length);

  const eavCols = await q("SELECT table_name, count(*)::int n FROM information_schema.columns WHERE table_name IN ('article_attributs','variante_attributs') AND column_name IN ('obligatoire','searchable','filtrable','comparable','liste','precision','unite_id','aide','statut_valeur','provenance','source','niveau_confiance','source_date','source_par','preuve') GROUP BY table_name");
  check("Colonnes EAV étendues (15/15 par table)", eavCols.length === 2 && eavCols.every((r) => r.n === 15), JSON.stringify(eavCols));

  const catCols = await q("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='categories' AND column_name IN ('domaine','niveau_ontologie','renderer_hint')");
  check("Colonnes ontologie catégories", catCols[0].n === 3);

  const checks = await q("SELECT count(*)::int n FROM pg_constraint WHERE conname LIKE 'ck_%' AND conrelid IN ('attribut_definitions'::regclass,'article_attributs'::regclass,'variante_attributs'::regclass) AND (conname LIKE '%type_attribut%' OR conname LIKE '%statut_valeur%' OR conname LIKE '%provenance%' OR conname LIKE '%niveau_confiance%' OR conname LIKE '%portee%' OR conname LIKE '%scope%')");
  check("Contraintes CHECK ontologie (11)", checks[0].n === 11, "n=" + checks[0].n);

  const seedUnits = await q("SELECT count(*)::int n FROM unites_mesure WHERE code IN ('M','CM','MM','KM','KG','G','T','L','ML','C','F','K','BAR','PA','PSI','J','KJ','M2','S','MIN','H')");
  check("Unités physiques seedées (21/21)", seedUnits[0].n === 21, "n=" + seedUnits[0].n);
  const seedDoms = await q("SELECT code FROM unites_domaines ORDER BY code");
  check("Domaines seedés (8)", seedDoms.length === 8, "n=" + seedDoms.length);

  const mm = await q("SELECT uc.facteur_vers_base::text f FROM unites_conversions uc JOIN unites_mesure um ON um.id=uc.unite_id JOIN unites_domaines ud ON ud.id=uc.domaine_id WHERE um.code='MM' AND ud.code='LONGUEUR'");
  check("Conversion 1000 mm = 1 m (facteur 0.001)", mm.length === 1 && Number(mm[0].f) === 0.001, JSON.stringify(mm));
  const temp = await q("SELECT sum((uc.formule_derivee IS NOT NULL)::int)::int n FROM unites_conversions uc JOIN unites_domaines ud ON ud.id=uc.domaine_id WHERE ud.code='TEMPERATURE' AND uc.formule_derivee IS NOT NULL");
  check("Température : conversions par formule (≥2)", (temp[0]?.n ?? 0) >= 2, JSON.stringify(temp));

  // ── 2. API : catégorie ontologique (NEW CATEGORY WITHOUT CODE CHANGE) ────
  const ts = Date.now().toString(36);
  let catId = null;
  const catRes = await trpcPost("catalog.createCategory", {
    nom: `P0-Ontologie (${ts})`,
    code: `P0ONT-${ts}`,
    description: "Test P0 — catégorie avec domaine LONGUEUR",
    domaine: "LONGUEUR",
    niveauOntologie: "SOUS",
    rendererHint: "select",
  });
  const created = catRes[0];
  if (created?.result?.data?.json?.id) {
    catId = created.result.data.json.id;
    check("createCategory avec domaine/niveau/renderer", true);
  } else {
    check("createCategory avec domaine/niveau/renderer", false, JSON.stringify(created?.error?.json?.message ?? created));
  }

  if (catId) {
    const lc = await trpcGet("catalog.listCategories", {});
    const me = (lc[0]?.result?.data?.json ?? []).find((c) => String(c.id) === String(catId));
    check("Persistance domaine/niveau/renderer (listCategories)", !!me && me.domaine === "LONGUEUR" && me.niveauOntologie === "SOUS" && me.rendererHint === "select", JSON.stringify(me));
  }

  // ── 3. API : domaines d'unités + conversion universelle ──────────────────
  const domRes = await trpcGet("ontology.listDomains", {});
  const doms = domRes[0]?.result?.data?.json ?? [];
  check("ontology.listDomains → 8 domaines", doms.length === 8, "n=" + doms.length);
  const long = doms.find((d) => d.code === "LONGUEUR");
  check("Domaine LONGUEUR base M", !!long && long.baseCode === "M", JSON.stringify(long?.baseCode));
  const mmU = long?.conversions?.find((c) => c.uniteCode === "MM");
  const mU = long?.conversions?.find((c) => c.uniteCode === "M");
  check("MM dans LONGUEUR (facteur 0.001)", !!mmU && Math.abs(Number(mmU.facteurVersBase) - 0.001) < 1e-9, JSON.stringify(mmU));

  if (mmU && mU) {
    const conv = await trpcGet("ontology.convert", { valeur: 1000, uniteId: mmU.uniteId, cibleUniteId: mU.uniteId });
    const out = conv[0]?.result?.data?.json;
    check("PREUVE 1000 mm = 1 m (via API)", !!out && Math.abs(out.valeurConvertie - 1) < 1e-9, JSON.stringify(out));
  }

  const convErr = await trpcGet("ontology.convert", { valeur: 1, uniteId: mmU?.uniteId, cibleUniteId: mU?.uniteId ?? "00000000-0000-0000-0000-000000000000" });
  // impossible ici (même domaine) — on teste plutôt un vrai cas : MM → KG (domaines différents).
  const kgDom = doms.find((d) => d.code === "MASSE");
  const kgU = kgDom?.conversions?.find((c) => c.uniteCode === "KG");
  if (kgU && mmU) {
    const x = await trpcGet("ontology.convert", { valeur: 1, uniteId: mmU.uniteId, cibleUniteId: kgU.uniteId });
    check("Conversion MM→KG refusée (domaines différents)", x[0]?.error?.json?.data?.code === "BAD_REQUEST", JSON.stringify(x[0]?.error?.json?.data?.code ?? x[0]?.error?.json?.code));
  }

  // ── 4. API : définition ontologique + résolution par catégorie ───────────
  let defId = null;
  if (catId) {
    const up = await trpcPost("ontology.upsertDefinition", {
      categorieId: Number(catId),
      portee: "ARTICLE",
      cle: "largeur_conseillee",
      libelle: "Largeur (conseillée)",
      typeAttribut: "NOMBRE",
      searchable: true,
      filtrable: true,
      comparable: true,
      uniteId: mmU?.uniteId ?? null,
    });
    const d = up[0]?.result?.data?.json;
    if (d?.id) { defId = d.id; check("upsertDefinition (NOMBRE, MM, searchable)", true); } else { check("upsertDefinition", false, JSON.stringify(up[0]?.error?.json?.message ?? up)); }

    const leg = await trpcPost("ontology.upsertDefinition", {
      categorieId: Number(catId),
      portee: "ARTICLE",
      cle: "certifie",
      libelle: "Certifié OEM",
      typeAttribut: "BOOLEAN", // legacy → BOOLEEN
    });
    const ld = leg[0]?.result?.data?.json;
    check("upsertDefinition BOOLEAN normalisé en BOOLEEN", !!ld && ld.typeAttribut === "BOOLEEN", JSON.stringify(ld?.typeAttribut));

    const resol = await trpcGet("ontology.getDefinitionsForCategory", { categorieId: Number(catId) });
    const rr = resol[0]?.result?.data?.json;
    const trouves = (rr?.definitions ?? []).map((x) => x.cle).sort();
    check("Résolution défnitions par catégorie (2)", rr && rr.definitions.length === 2 && trouves.includes("largeur_conseillee") && trouves.includes("certifie"), JSON.stringify(trouves));
  }

  // ── 5. API : attributs EAV étendus (13 types, provenance, INCONNU) ───────
  const artCode = "P0ART-" + ts;
  const artRes = await trpcPost("articles.createArticle", {
    designation: `P0-ART-${ts} Article de test fondations ontologiques`,
    typeProduit: "PIECE",
    attributs: [
      { cle: "hauteur", valeur: "12", unite: "MM", typeAttribut: "NOMBRE", precision: 1, uniteId: mmU?.uniteId ?? null, searchable: true, filtrable: true },
      { cle: "opc_data", valeur: "true", typeAttribut: "BOOLEAN", obligatoire: true }, // legacy → BOOLEEN
      { cle: "tension_inconnue", statutValeur: "INCONNU", provenance: "MESURE", source: "PKL-2026", niveauConfiance: "TECHNIQUE" },
      { cle: "pose_non_applicable", statutValeur: "N_A" },
    ],
  });
  const artOut = artRes[0];
  let articleId = null;
  const artId = artOut?.result?.data?.json?.articleId ?? artOut?.result?.data?.json?.id;
  if (artId) { articleId = artId; check("createArticle avec attributs étendus (4)", true); } else { check("createArticle", false, JSON.stringify(artOut?.error?.json?.message ?? artOut)); }

  if (articleId) {
    const ga = await trpcGet("articles.getArticle", { id: articleId });
    const attrs = ga[0]?.result?.data?.json?.attributs ?? [];
    const byCle = Object.fromEntries(attrs.map((a) => [a.cle, a]));
    check("BOOLEAN legacy → BOOLEEN stocké", byCle.opc_data?.typeAttribut === "BOOLEEN", byCle.opc_data?.typeAttribut);
    check("INCONNU + provenance MESURE + confiance persistés", byCle.tension_inconnue?.statutValeur === "INCONNU" && byCle.tension_inconnue?.provenance === "MESURE" && byCle.tension_inconnue?.niveauConfiance === "TECHNIQUE", JSON.stringify(byCle.tension_inconnue));
    check("N_A persisté (pose_non_applicable)", byCle.pose_non_applicable?.statutValeur === "N_A");
    check("searchable/filtrable persistés (hauteur)", byCle.hauteur?.searchable === true && byCle.hauteur?.filtrable === true && Number(byCle.hauteur?.precision) === 1, JSON.stringify(byCle.hauteur));
    check("obligatoire persisté (opc_data)", byCle.opc_data?.obligatoire === true);

    const sa = await trpcPost("articles.setAttributs", {
      articleId: Number(articleId),
      attributs: [
        { cle: "largeur_conseillee", valeur: "185", unite: "MM", typeAttribut: "NOMBRE", uniteId: mmU?.uniteId ?? null },
        { cle: "hauteur", valeur: "14", typeAttribut: "NOMBRE" },
        { cle: "marque_conseillee", typeAttribut: "ENUM", liste: ["Brand A", "Brand B"], filtrable: true },
      ],
    });
    check("setAttributs (upsert + liste ENUM)", sa[0]?.result?.data?.json?.success === true, JSON.stringify(sa[0]?.error?.json?.message ?? sa));

    const ga2 = await trpcGet("articles.getArticle", { id: articleId });
    const attrs2 = ga2[0]?.result?.data?.json?.attributs ?? [];
    const byCle2 = Object.fromEntries(attrs2.map((a) => [a.cle, a]));
    check("setAttributs : valeur mise à jour", byCle2.hauteur?.valeur === "14", byCle2.hauteur?.valeur);
    check("setAttributs : liste ENUM persistée + filtrable", byCle2.marque_conseillee?.liste?.length === 2 && byCle2.marque_conseillee?.filtrable === true, JSON.stringify(byCle2.marque_conseillee));
  }

  // ── 6. Nettoyage immédiat (aucune trace) ─────────────────────────────────
  // Chaîne complète : chemins produit (variantes) → article → définitions → catégorie.
  const qd = async (sql, args) => { try { const r = await pg.query(sql, args); return r.rows; } catch (e) { console.log("  [NOTE cleanup]", e.message); return []; } };
  const artIds = (await qd("SELECT id FROM produit_articles WHERE designation LIKE $1", ["P0-ART-%"])).map((r) => r.id);
  const varIds = (await qd("SELECT id FROM produits WHERE code_article LIKE $1", ["P0ART-%"])).map((r) => r.id);
  if (articleId && !artIds.includes(Number(articleId))) artIds.push(Number(articleId));
  await qd("DELETE FROM variante_attributs WHERE variante_id = ANY($1)", [varIds]);
  await qd("DELETE FROM mouvements_stock WHERE produit_id = ANY($1)", [varIds]);
  await qd("DELETE FROM stocks_lots WHERE produit_id = ANY($1)", [varIds]);
  await qd("DELETE FROM stocks WHERE produit_id = ANY($1)", [varIds]);
  await qd("DELETE FROM codes_barres WHERE produit_id = ANY($1)", [varIds]);
  await qd("DELETE FROM produit_unites WHERE produit_id = ANY($1)", [varIds]);
  await qd("DELETE FROM produits_fournisseurs WHERE produit_id = ANY($1)", [varIds]);
  await qd("DELETE FROM produits WHERE id = ANY($1)", [varIds]);
  await qd("DELETE FROM article_attributs WHERE article_id = ANY($1)", [artIds]);
  await qd("DELETE FROM article_documents WHERE article_id = ANY($1)", [artIds]);
  await qd("DELETE FROM compatibilites_produits WHERE article_id = ANY($1)", [artIds]);
  await qd("DELETE FROM produit_references_equiv WHERE article_id = ANY($1)", [artIds]);
  await qd("DELETE FROM produit_articles WHERE id = ANY($1)", [artIds]);
  await qd("DELETE FROM attribut_definitions WHERE cle IN ('largeur_conseillee','certifie') OR categorie_id = ANY($1)", [[catId ?? -1]]);
  await qd("DELETE FROM categories WHERE code LIKE 'P0ONT-%'", []);
  const traceCat = await qd("SELECT count(*)::int n FROM categories WHERE code LIKE 'P0ONT-%'", []);
  const traceArt = await qd("SELECT count(*)::int n FROM produit_articles WHERE designation LIKE 'P0-ART-%' OR designation LIKE 'Article P0 %' OR designation LIKE 'Probe P0 %'", []);
  const traceVar = await qd("SELECT count(*)::int n FROM produits WHERE code_article LIKE 'P0ART-%'", []);
  const traceDef = await qd("SELECT count(*)::int n FROM attribut_definitions WHERE cle IN ('largeur_conseillee','certifie')", []);
  check("Cleanup : zéro trace (cat/article/def)", traceCat[0]?.n === 0 && traceArt[0]?.n === 0 && traceVar[0]?.n === 0 && traceDef[0]?.n === 0, `cat=${traceCat[0]?.n} art=${traceArt[0]?.n} var=${traceVar[0]?.n} def=${traceDef[0]?.n}`);

  await pg.end();
  console.log(`\nRÉSULTAT P0 : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("ERREUR script:", e.message); process.exit(2); });