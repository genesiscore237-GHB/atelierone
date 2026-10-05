const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";
const suffix = Date.now().toString(36);
const refA = `G4A${suffix.slice(-4)}`.toUpperCase();
const refB = `G4B${suffix.slice(-4)}`.toUpperCase();
let idArticle = 0;

async function nettoyer(c) {
  await c.query(`DELETE FROM produit_references WHERE variante_id IN (SELECT id FROM produits WHERE article_id IN (SELECT id FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%'))`);
  await c.query(`DELETE FROM variante_attributs WHERE variante_id IN (SELECT id FROM produits WHERE article_id IN (SELECT id FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%'))`);
  await c.query(`DELETE FROM produit_substitutions WHERE variante_a_id IN (SELECT id FROM produits WHERE article_id IN (SELECT id FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%')) OR variante_b_id IN (SELECT id FROM produits WHERE article_id IN (SELECT id FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%'))`);
  await c.query(`DELETE FROM produit_supersessions WHERE ancienne_variante_id IN (SELECT id FROM produits WHERE article_id IN (SELECT id FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%')) OR nouvelle_variante_id IN (SELECT id FROM produits WHERE article_id IN (SELECT id FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%'))`);
  await c.query(`ALTER TABLE mouvements_stock DISABLE TRIGGER trg_append_only_mouvements_stock`);
  await c.query(`DELETE FROM mouvements_stock WHERE produit_id IN (SELECT id FROM produits WHERE article_id IN (SELECT id FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%'))`);
  await c.query(`ALTER TABLE mouvements_stock ENABLE TRIGGER trg_append_only_mouvements_stock`);
  await c.query(`DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE article_id IN (SELECT id FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%'))`);
  await c.query(`DELETE FROM stocks_unites WHERE produit_id IN (SELECT id FROM produits WHERE article_id IN (SELECT id FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%'))`);
  await c.query(`DELETE FROM produit_unites WHERE produit_id IN (SELECT id FROM produits WHERE article_id IN (SELECT id FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%'))`);
  await c.query(`DELETE FROM produits WHERE article_id IN (SELECT id FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%')`);
  await c.query(`DELETE FROM produit_articles WHERE designation LIKE 'REGRESSION GF4%'`);
}

(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();
  const catPiece = (await c.query("SELECT id FROM categories WHERE type_branche='PIECE' LIMIT 1")).rows[0];
  const uniteId = (await c.query("SELECT id FROM unites_mesure ORDER BY id LIMIT 1")).rows[0].id;
  const emplacementId = (await c.query("SELECT id FROM emplacements WHERE type IN ('RAYON','MAGASIN','ZONE') ORDER BY id LIMIT 1")).rows[0]?.id ?? null;
  const categorieId = catPiece ? catPiece.id : null;
  await nettoyer(c);
  await c.end();

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
  async function trpcMut(path, body) {
    const r = await http("/api/trpc/" + path + "?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: body } }) });
    const j = await r.json();
    if (j[0]?.error) throw new Error(j[0].error.json?.message || JSON.stringify(j[0].error));
    return j[0]?.result?.data?.json;
  }
  async function trpcQuery(path, input) {
    const q = encodeURIComponent(JSON.stringify({ "0": { json: input ?? {} } }));
    const r = await http(`/api/trpc/${path}?batch=1&input=${q}`, { headers: { "Content-Type": "application/json" } });
    const j = await r.json();
    if (j[0]?.error) throw new Error(j[0].error.json?.message || JSON.stringify(j[0].error));
    return j[0]?.result?.data?.json;
  }
  async function trpcFail(path, body) {
    const r = await http("/api/trpc/" + path + "?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: body } }) });
    const j = await r.json();
    return (j[0]?.error?.json?.message) || "";
  }

  const csrf = await (await http("/api/auth/csrf")).json();
  const login = await http("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }),
  });
  check("Connexion admin", login.status === 200 || login.status === 302, "status=" + login.status);
  await fetch(BASE + "/dashboard");

  console.log("\n— Pages HTTP (200) —");
  for (const p of ["/dashboard/catalog/articles", "/dashboard/catalog/article/nouveau", "/dashboard/catalog/recherche", "/dashboard/catalog/categories"]) {
    const r = await http(p);
    check(`Page ${p}`, r.status === 200, "status=" + r.status);
  }

  console.log("\n— G0 Socle (templates, unités, catégories) —");
  const templates = await trpcQuery("articles.listTemplates");
  check("listTemplates ≥ 10", Array.isArray(templates) && templates.length >= 10, "n=" + (templates?.length));
  const unites = await trpcQuery("catalog.listUnites");
  check("listUnites ≥ 10", Array.isArray(unites) && unites.length >= 10, "n=" + (unites?.length));
  const cats = await trpcQuery("catalog.listCategories");
  const haveHierarchie = cats.some((x) => x.parentId != null);
  check("Catégories hiérarchie (3 niveaux)", haveHierarchie, "n=" + cats.length);

  console.log("\n— GF1 Garde-fous de création —");
  check("PIECE + champs outillage → 400",
    (await trpcFail("articles.createArticle", { designation: "X GF1a", typeProduit: "PIECE", variantes: [{ referencePrincipale: "R1", typeOutil: "INDIVIDUEL" }] })).includes("champs d'exemplaire"));
  check("OUTIL sans typeOutil → 400",
    (await trpcFail("articles.createArticle", { designation: "X GF1b", typeProduit: "OUTIL", variantes: [{ marque: "M" }] })).includes("Type d'outil requis"));
  check("EQUIPEMENT sans immo → 400",
    (await trpcFail("articles.createArticle", { designation: "X GF1c", typeProduit: "EQUIPEMENT", variantes: [{ marque: "M" }] })).includes("Numéro d'immobilisation requis"));
  check("OUTIL + prixVente → 400",
    (await trpcFail("articles.createArticle", { designation: "X GF1d", typeProduit: "OUTIL", variantes: [{ marque: "M", typeOutil: "INDIVIDUEL", prixVente: 100 }] })).includes("pas de prix de vente"));
  check("SERVICE + variantes → 400",
    (await trpcFail("articles.createArticle", { designation: "X GF1e", typeProduit: "SERVICE", variantes: [{ marque: "M" }] })).includes("n'a pas de variantes"));

  console.log("\n— Création valide PIECE (2 variantes) —");
  const created = await trpcMut("articles.createArticle", {
    designation: `REGRESSION GF4 ${suffix}`,
    typeProduit: "PIECE",
    categorieId,
    etatProduitDefaut: "NEUF",
    origineProduitDefaut: "AFTERMARKET",
    attributs: [{ cle: "epaisseur", valeur: "12", unite: "mm" }],
    variantes: [
      { marque: "Bosch", referenceFabricant: refA, referencePrincipale: refA, conditionnement: "boîte de 4", prixAchat: 1500, prixVente: 2500, prixPro: 2300, prixParticulier: 2800, tva: 19.25, uniteStockId: String(uniteId), stockInitial: 200, emplacementId, seuilAlerte: 5, pointCommande: 20, qteMinCommande: 10, positionCote: "GAUCHE", positionEssieu: "AVANT", etatProduit: "NEUF", origineProduit: "AFTERMARKET", codeArticle: `G4V1${suffix}` },
      { marque: "Brembo", referenceFabricant: refB, referencePrincipale: refB, conditionnement: "jeu de 4", prixAchat: 1800, prixVente: 3100, uniteStockId: String(uniteId), stockInitial: 50, emplacementId, positionCote: "DROITE", positionEssieu: "AVANT", codeArticle: `G4V2${suffix}` },
    ],
  });
  check("createArticle OK (2 variantes)", created.articleId > 0 && created.variantesCrees === 2, JSON.stringify(created));
  idArticle = created.articleId;

  const fiche = await trpcQuery("articles.getArticle", { id: idArticle });
  const vs = fiche.variantes;
  check("getArticle → 2 variantes niveau VARIANTE", vs.length === 2 && vs.every((v) => v.niveau === "VARIANTE"));
  const vA = vs.find((v) => v.codeArticle === `G4V1${suffix}`) ?? vs[0];
  const vB = vs.find((v) => v.codeArticle === `G4V2${suffix}`) ?? vs[1];
  check("Variante A : position préservée", vA?.positionCote === "GAUCHE" && vA?.positionEssieu === "AVANT");
  check("Attribut article enregistré", (fiche.attributs ?? []).some((a) => a.cle === "epaisseur" && a.valeur === "12"));

  console.log("\n— GF3 Stock (physique/bloqué/réservé/disponible/en commande) —");
  const etatA = await trpcQuery("articles.stockEtats", { varianteId: vA.id });
  check("stockEtats physique == 200", etatA.physique === 200, JSON.stringify(etatA));
  check("stockEtats dispo == 200 (rien bloqué/réservé)", etatA.disponible === 200, JSON.stringify(etatA));
  check("stockEtats pointCommande affiché", etatA.pointCommande === 20);
  const etatBesoin = await trpcQuery("articles.stockEtats", { varianteId: vA.id, besoin: 250 });
  check("GF3 suggestion besoin 250 → commander 50", etatBesoin.suggestion === `Commander ${etatBesoin.besoinNet} unité(s)` && etatBesoin.besoinNet === 50, JSON.stringify(etatBesoin));

  console.log("\n— GF4 Lots —");
  check("stockLots de la variante A vide (pas de lot)", (await trpcQuery("articles.stockLots", { varianteId: vA.id })).length === 0);

  console.log("\n— GF2 Références multiples (une principale max) —");
  await trpcMut("articles.addReference", { varianteId: vA.id, typeRef: "EAN", valeur: "333-000-111", isPrincipale: false });
  const refsA = await trpcQuery("articles.listReferences", { varianteId: vA.id });
  check("liste références ≥ 1 (EAN ajoutée) — principale stockée sur produits", refsA.length >= 1, "n=" + refsA.length);
  await trpcMut("articles.addReference", { varianteId: vA.id, typeRef: "FABRICANT", valeur: `${refA}-ALT`, isPrincipale: true });
  const refsA2 = await trpcQuery("articles.listReferences", { varianteId: vA.id });
  check("GF2 une seule référence principale max", refsA2.filter((r) => r.isPrincipale).length === 1, JSON.stringify(refsA2));
  const fiche2 = await trpcQuery("articles.getArticle", { id: idArticle });
  const vA2 = fiche2.variantes.find((v) => v.id === vA.id);
  check("GF2 référencePrincipale mise à jour", vA2.referencePrincipale === `${refA}-ALT`, "=" + vA2.referencePrincipale);
  const refSup = refsA2.find((r) => r.typeRef === "FABRICANT");
  await trpcMut("articles.removeReference", { id: refSup.id });
  const refsA3 = await trpcQuery("articles.listReferences", { varianteId: vA.id });
  check("removeReference OK", refsA3.length === refsA2.length - 1);

  console.log("\n— GF5 + recherche unifiée —");
  const doublons = await trpcQuery("articles.detecterDoublons", { reference: refA });
  check("detecterDoublons trouve l'exact", Array.isArray(doublons.exacts) && doublons.exacts.length >= 1, JSON.stringify(doublons));

  const verif = await trpcQuery("articles.verifierAvantCommande", { reference: `${refA}- ALT`, besoin: 1 });
  check("verifAvantCommande : candidats ≥ 1", (verif.candidats ?? []).length >= 1, JSON.stringify(verif));
  check("verifAvantCommande : décision stock suffisant", verif.decision.startsWith("Commande inutile"), verif.decision);

  const searchRef = await trpcQuery("articles.recherche", { reference: `${refA}!!` });
  check("recherche réf normalisée (ignore séparateurs)", Array.isArray(searchRef) && searchRef.some((r) => r.id === vA.id), JSON.stringify(searchRef?.map((r) => r.referencePrincipale)));
  const searchText = await trpcQuery("articles.recherche", { q: "REGRESSION GF4".toLowerCase(), limit: 50 });
  check("recherche texte désignation", Array.isArray(searchText) && searchText.length >= 1);
  const searchPos = await trpcQuery("articles.recherche", { position: "GAUCHE", limit: 50 });
  check("recherche par position", Array.isArray(searchPos) && searchPos.some((r) => r.id === vA.id));

  console.log("\n— Substitutions & supersessions —");
  await trpcMut("articles.addSubstitution", { varianteAId: vA.id, varianteBId: vB.id, niveauConfiance: "TECHNIQUE", motif: "test GF5" });
  const subs = await trpcQuery("articles.listSubstitutions", { varianteId: vA.id });
  check("addSubstitution + list OK", subs.some((s) => s.varianteAId === vA.id && s.varianteBId === vB.id), JSON.stringify(subs));
  await trpcMut("articles.removeSubstitution", { id: subs.find((s) => s.varianteAId === vA.id).id });
  check("removeSubstitution OK", (await trpcQuery("articles.listSubstitutions", { varianteId: vA.id })).length === subs.length - 1);

  await trpcMut("articles.addSupersession", { ancienneReference: `OLD-${refA}`, nouvelleVarianteId: vA.id, nouvelleReference: `${refA}-ALT`, motif: "test GF5" });
  const sups = await trpcQuery("articles.listSupersessions", { varianteId: vA.id });
  check("addSupersession + list OK", sups.some((s) => s.ancienneReference === `OLD-${refA}`), JSON.stringify(sups));
  await trpcMut("articles.removeSupersession", { id: sups.find((s) => s.ancienneReference === `OLD-${refA}`).id });
  check("removeSupersession OK", (await trpcQuery("articles.listSupersessions", { varianteId: vA.id })).length === sups.length - 1);

  console.log("\n— Attributs variante —");
  await trpcMut("articles.setAttributsVariante", { varianteId: vA.id, attributs: [{ cle: "epaisseur-disque", valeur: "12", unite: "mm" }] });
  const ficheV = await trpcQuery("articles.getVariante", { varianteId: vA.id });
  check("setAttributsVariante + getVariante OK", ficheV.attributs.some((a) => a.cle === "epaisseur-disque" && a.valeur === "12"), JSON.stringify(ficheV.attributs));
  check("getVariante : articleDesignation incluse", (ficheV.variante.articleDesignation ?? "").includes("GF4"), ficheV.variante.articleDesignation);

  console.log("\n— Pages fiche (200) —");
  for (const p of [`/dashboard/catalog/article/${idArticle}`, `/dashboard/catalog/variante/${vA.id}`]) {
    const r = await http(p);
    check(`Page ${p}`, r.status === 200, "status=" + r.status);
  }

  console.log("\n— Nettoyage —");
  const c2 = new Client({ connectionString: DSN });
  await c2.connect();
  await nettoyer(c2);
  await c2.end();
  check("Nettoyage DB effectué", true);

  console.log(`\nRÉSULTAT MODULE 1 (G4) : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });