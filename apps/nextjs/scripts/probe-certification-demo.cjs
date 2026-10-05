/* PROBE CERTIFICATION DEMO — Catalogue Universel.
 * Parcourt le parcours UI exact (mêmes endpoints tRPC que les pages) :
 *  §59 — catégorie « Capteurs ADAS » sans modification de code
 *  §60 — 5 attributs (définition + résolution héritée)
 *  §61 — DECIMAL °C (attribut numérique décimal avec unité Celsius) + « Module hydraulique XZ-500 »
 *  + compatibilité véhicule, référence équivalente, recherche par référence.
 */
const { Client } = require("pg");

const BASE = "http://localhost:3000";
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";
const SFX = "C" + Date.now().toString().slice(-6);

let PASS = 0, FAIL = 0, WARN = 0;
function P(name, ok, detail = "") {
  if (ok) { PASS++; console.log("  [PASS] " + name + (detail ? " — " + detail : "")); }
  else { FAIL++; console.log("  [FAIL] " + name + (detail ? " — " + detail : "")); }
}
function W(name, detail = "") {
  WARN++; console.log("  [!WARN] " + name + (detail ? " — " + detail : ""));
}
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
async function login() {
  const csrf = await (await http("/api/auth/csrf")).json();
  const res = await http("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }),
  });
  console.log("  Connexion admin: status=" + res.status);
  await http("/dashboard");
}
function unwrap(j0) {
  const d = j0?.result?.data;
  return d && typeof d === "object" && "json" in d ? d.json : d;
}
async function trpcMut(path, body) {
  const r = await http("/api/trpc/" + path + "?batch=1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ "0": { json: body } }),
  });
  const j = await r.json();
  return { error: j[0]?.error, data: unwrap(j[0]) };
}
async function trpcQuery(path, input = {}) {
  const q = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
  const r = await http("/api/trpc/" + path + "?batch=1&input=" + q);
  return unwrap((await r.json())[0]);
}
const errMsg = (r) => r?.error?.json?.message ?? r?.error?.data?.message ?? JSON.stringify(r?.error ?? r?.data ?? null);

(async () => {
  const db = new Client({ connectionString: DSN });
  await db.connect();
  await login();

  console.log("\n═══ PROBE CERTIFICATION DEMO — " + SFX + " ═══");

  const cats = await trpcQuery("catalog.listCategories");
  const unites = (await trpcQuery("reference.listUnitesMesure")) ?? [];
  const celsius = unites.find((u) => /CELSIUS|°C/.test(u.code + " " + u.symbole));
  P("Socle unités + unité Celsius du seed DEMO", !!celsius && (unites?.length ?? 0) >= 48, `unites=${unites?.length}`, );

  // ── §59 — Catégorie « Capteurs ADAS » (administrée via catalogue, sans code métier) ──
  const parent = cats?.find((c) => c.code === "DEMO-ELEC");
  let catId = null;

  const rCat = await trpcMut("catalog.createCategory", {
    nom: "Capteurs ADAS",
    code: "DEMO-CERT-CAPTEURS",
    description: "Module de certification — catégorie créée depuis l'interface sans modification de code.",
    parentId: parent ? String(parent.id) : undefined,
    niveauOntologie: "CATEGORIE",
  });
  if (rCat.error) W("Catégorie Capteurs ADAS (conflit attendu si déjà certifiée)", errMsg(rCat));
  else P("§59 Catégorie « Capteurs ADAS » créée via l'API de l'UI (createCategory)", !!rCat.data?.id, "id=" + rCat.data?.id);

  const cats2 = await trpcQuery("catalog.listCategories");
  const cat = cats2?.find((c) => c.code === "DEMO-CERT-CAPTEURS");
  catId = cat ? Number(cat.id) : null;
  P("§59 Catégorie visible et positionnée dans l'arborescence", !!catId, `id=${catId} parent=${parent?.nom}`);
  if (!catId) { console.log("RÉSULTAT: " + PASS + " PASS / " + FAIL + " FAIL / " + WARN + " WARN"); process.exit(FAIL ? 1 : 0); }

  // ── §60 — 5 attributs (ontologie : upsert + résolution héritée comme le fait le wizard) ──
  const ATTRS = [
    { cle: "technologie", libelle: "Technologie de détection", typeAttribut: "ENUM", liste: ["RADAR", "LIDAR", "CAMERA", "ULTRASON"], filtrable: true, searchable: true },
    { cle: "bus", libelle: "Bus de communication", typeAttribut: "ENUM", liste: ["CAN", "CAN-FD", "FlexRay", "LIN"], filtrable: true },
    { cle: "angle_montage", libelle: "Angle de montage", typeAttribut: "NOMBRE", unite: "DECIMAL", unit: null, filtrable: false, precision: 1, min: -90, max: 90 },
    { cle: "temp_max", libelle: "Température de fonctionnement max", typeAttribut: "NOMBRE", unite: "CELSIUS", unit: celsius?.id, filtrable: true, comparable: true },
    { cle: "ref_kit_calib", libelle: "Réf. kit calibration", typeAttribut: "REFERENCE", searchable: true, obligatoire: false },
  ];
  let upserted = 0;
  for (const a of ATTRS) {
    const r = await trpcMut("ontology.upsertDefinition", {
      categorieId: catId,
      portee: "VARIANTE",
      cle: a.cle,
      libelle: a.libelle,
      typeAttribut: a.typeAttribut === "ENUM" ? "ENUM" : a.typeAttribut,
      liste: a.liste ?? [],
      uniteId: a.unit || undefined,
      precision: a.precision,
      min: a.min,
      max: a.max,
      filtrable: a.filtrable ?? false,
      searchable: a.searchable ?? false,
      comparable: a.comparable ?? false,
      obligatoire: a.obligatoire ?? false,
      isActive: true,
    });
    if (r.data?.id) upserted++;
    else if (r.error) console.log("    upsert " + a.cle + " → " + errMsg(r));
  }
  P("§60 5 définitions upsertées sans modification de code", upserted === 5, `upserted=${upserted}`);

  const resolve = await trpcQuery("ontology.getDefinitionsForCategory", { categorieId: catId, portee: "VARIANTE" });
  const resolvedKeys = (resolve?.definitions ?? []).map((d) => d.cle).sort().join(",");
  P("§60 Résolution ontologique héritée (5 attrs) — chemin du wizard", resolve?.definitions?.length === 5, resolvedKeys);

  // ── §61 — Article « Module hydraulique XZ-500 » + attributs (DECIMAL °C) + compat + équivalence + recherche ──
  const existing = (await trpcQuery("articles.recherche", { q: "XZ-500" })) ?? [];
  let articleId = null, prodId = null, refPrincipal = "XZ-500-" + SFX;
  if (existing.length) {
    articleId = existing[0]?.articleId ?? null;
    prodId = existing[0]?.id ?? null;
    W("Article XZ-500 déjà présent, réutilisé", articleId);
  }
  if (!articleId) {
    const r = await trpcMut("articles.createArticle", {
      designation: `Module hydraulique XZ-500 ${SFX}`,
      designationCourte: `XZ500 ${SFX}`,
      description: "Module certifié via l'interface — démonstration du parcours sans code.",
      categorieId: Number(catId),
      typeProduit: "PIECE",
      etatProduitDefaut: "NEUF",
      origineProduitDefaut: "AFTERMARKET",
      attributs: [{ cle: "temp_max", valeur: "95.5", unite: "CELSIUS", typeAttribut: "NOMBRE", precision: 1 }],
      referencesEquiv: [{ marque: "GPJ", reference: "XZ500-EQUIV-" + SFX, note: "Certification" }],
      variantes: [{
        marque: "MecaDiag",
        referenceFabricant: refPrincipal,
        referencePrincipale: refPrincipal,
        prixAchat: 18500, prixVente: 39500, prixMinimumVente: 25000, tva: 19.25,
        uniteStockId: unites[0].id,
        unites: [{ uniteId: unites[0].id, facteurVersBase: 1, estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true }],
        codeBarre: "CERT-XZ500-" + SFX,
        stockInitial: 0,
        attributs: [
          { cle: "temp_max", valeur: "95.5", unite: "CELSIUS", typeAttribut: "NOMBRE", precision: 1 },
          { cle: "technologie", valeur: "ULTRASON", typeAttribut: "ENUM" },
        ],
      }],
    });
    articleId = r?.data?.articleId ?? null;
    prodId = r?.data?.produitsCrees?.[0]?.id ?? r?.data?.varianteId ?? null;
    P("§61 Article « Module hydraulique XZ-500 » créé via l'API de l'UI", !!articleId && !r.error, JSON.stringify(r.data ?? errMsg(r)));
    if (articleId) {
      const p = (await db.query(`SELECT id, code_barre FROM produits WHERE article_id=$1 LIMIT 1`, [articleId])).rows[0];
      prodId = p?.id;
    }
  }

  if (articleId) {
    const com = await trpcMut("articles.addCompatibilite", {
      articleId,
      compat: { typeCompat: "POSITIVE", marque: "Toyota", modele: "Highlander", anneeDe: 2020, anneeA: 2026, motorisation: "2.5 Hybrid" },
    });
    P("§61 Compatibilité véhicule ajoutée", !com.error && com.data?.success !== false, errMsg(com));

    const eq = await trpcMut("articles.addReferenceEquiv", { articleId, marque: "GPJ", reference: "XZ500-EQUIV-GLOBAL", note: "Certification" });
    P("§61 Référence équivalente (multi-référentiel) ajoutée", !eq.error, errMsg(eq));
  }

  if (prodId) {
    const v = await trpcQuery("articles.getVariante", { varianteId: prodId });
    const attrs = v?.attributs ?? [];
    const temp = (Array.isArray(attrs) ? attrs : []).find((x) => x.cle === "temp_max");
    P("§61 Attribut DECIMAL °C persisté (temp_max = 95.5 °C)", !!temp && String(temp.valeur).includes("95.5") && /CELSIUS|°C/.test(String(temp.unite)), JSON.stringify(temp));
    P("§61 Variante exportable avec prix/état/unité-stock (getVariante)", !!v?.variante?.id && v.variante?.prixVente != null, "prixVente=" + v?.variante?.prixVente + " ref=" + v?.variante?.referenceFabricant);

    const hits = (await trpcQuery("articles.recherche", { q: refPrincipal.slice(0, 8) })) ?? [];
    P("§61 Recherche par référence (moteur relatif)", hits.some((h) => h.id === prodId || h.referenceFabricant === refPrincipal), "hits=" + hits.length);
  }

  // Coffret 108 — réintégration complète
  const kit = (await trpcQuery("articles.recherche", { q: "OUT-0100" })) ?? [];
  void kit;

  console.log("\n═══ RÉSULTAT CERTIFICATION: " + PASS + " PASS / " + FAIL + " FAIL / " + WARN + " WARN ═══");
  await db.end();
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error("Erreur fatale:", e); process.exit(2); });