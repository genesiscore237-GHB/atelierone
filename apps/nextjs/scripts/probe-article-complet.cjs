/* Probe bout-en-bout de l'article complet (V3) : bloc 3/4 comptable/prixMin/attributs ontologie.
 * Crée un article via articles.createArticle (API live), vérifie chaque table en DB, nettoie.
 */
const { Client } = require("pg");

const BASE = "http://localhost:3000";
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";
const SFX = "PRB" + Date.now().toString().slice(-6);

let PASS = 0, FAIL = 0;
function P(name, ok, detail = "") {
  if (ok) { PASS++; console.log("  [PASS] " + name + (detail ? " — " + detail : "")); }
  else { FAIL++; console.log("  [FAIL] " + name + (detail ? " — " + detail : "")); }
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
  P("Connexion admin", res.status === 200 || res.status === 302, "status=" + res.status);
  await fetch(BASE + "/dashboard");
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

(async () => {
  const db = new Client({ connectionString: DSN });
  await db.connect();
  await login();

  const cats = await trpcQuery("catalog.listCategories");
  const unites = await trpcQuery("catalog.listUnites");
  const fournisseurs = await trpcQuery("reference.listFournisseurs");
  const emplacements = (await trpcQuery("stock.listEmplacements")) ?? [];
  const cat = cats.find((x) => x.typeBranche === "PIECE" && x.parentId);
  const unite = unites[0];
  const uniteSecondaire = unites.find((u) => u.id !== unite.id);
  const f1 = fournisseurs[0], f2 = fournisseurs[1];
  const emplacement = emplacements[0];

  console.log("\n═══ PROBE ARTICLE COMPLET — " + SFX + " ═══");
  P("Socle catégorie PIECE + 2 unités + 2 fournisseurs", !!cat && !!unite && !!uniteSecondaire && !!f1 && !!f2);

  const catId = Number(cat.id);
  let articleId = null;

  try {
    const res = await trpcMut("articles.createArticle", {
      designation: `Probe complet ${SFX}`,
      designationCourte: `PC ${SFX}`,
      description: "Probe E2E V3",
      imageUrl: "https://example.com/probe.png",
      categorieId: catId,
      typeProduit: "PIECE",
      etatProduitDefaut: "NEUF",
      origineProduitDefaut: "AFTERMARKET",
      attributs: [
        { cle: "epaisseur", valeur: "2", unite: "mm", typeAttribut: "NOMBRE", uniteId: unite.id, min: 0, max: 100, searchable: true, filtrable: true },
        { cle: "matiere", valeur: "Acier", typeAttribut: "ENUM", liste: ["Acier", "Alliage"], obligatoire: true },
      ],
      compatibilites: [
        { typeCompat: "POSITIVE", marque: "Toyota", modele: "Hilux", anneeDe: 2015, anneeA: 2020, motorisation: "2.4 D", position: "Avant" },
        { typeCompat: "NEGATIVE", marque: "Peugeot", modele: "3008", anneeDe: 2019, position: "AV" },
      ],
      referencesEquiv: [
        { marque: "GATES", reference: "G26095", note: "courroie alternateur" },
        { marque: "", reference: "DAYCO 6PK1795", note: "" },
      ],
      variantes: [
        {
          marque: "ProbeBrake",
          referenceFabricant: "PB-" + SFX,
          referencePrincipale: "PB-" + SFX,
          codeBarre: "3" + SFX,
          prixAchat: 150.5,
          prixVente: 250,
          prixPro: 220,
          prixParticulier: 280,
          tva: 19.25,
          prixMinimumVente: 185,
          compteComptable: "6071",
          centreDeCout: "CO-AT-01",
          methodeValorisation: "FIFO",
          uniteStockId: unite.id,
          stockInitial: 10,
          emplacementStockId: emplacement?.id,
          seuilAlerte: 5,
          stockSecurite: 3,
          pointCommande: 2,
          qteMinCommande: 1.5,
          etatProduit: "NEUF",
          origineProduit: "CONSTRUCTEUR",
          fournisseurId: f1.id,
          unites: [
            { uniteId: unite.id, facteurVersBase: 1, prixAchat: 150.5, prixVente: 250, estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true },
            { uniteId: uniteSecondaire.id, facteurVersBase: 12, prixAchat: 150, prixVente: 255, estUniteAchatDefaut: false, estUniteVenteDefaut: false },
          ],
          fournisseurs: [
            { fournisseurId: f1.id, referenceFournisseur: "F1-" + SFX, prixAchat: 145, delaiApprovisionnement: 3, estPrincipal: true },
            { fournisseurId: f2.id, referenceFournisseur: "F2-" + SFX, prixAchat: 148, delaiApprovisionnement: 5, estPrincipal: false, uniteConditionnement: unite.id, facteurConditionnement: 24 },
          ],
          attributs: [
            { cle: "diametre", valeur: "295", unite: "mm", typeAttribut: "NOMBRE" },
            { cle: "nb_perforations", valeur: "5", typeAttribut: "CODE" },
          ],
        },
      ],
    });
    const data = res?.data;
    articleId = data?.articleId;
    P("createArticle OK (retour attrs)", !!res && !res?.error && data?.variantesCrees === 1 && data?.compatibilitesCrees === 2 && data?.referencesEquivCrees === 2, JSON.stringify(data));
    if (res?.error) console.log("  EXTRACT_ERR: " + JSON.stringify(res.error.json?.message ?? res.error));

    if (articleId) {
      const article = (await db.query(`SELECT id, designation, designation_courte, image_url, type_produit, categorie_id, etat_produit_defaut, origine_produit_defaut FROM produit_articles WHERE id=$1`, [articleId])).rows[0];
      P("produit_articles : designationCourte+imageUrl+defauts", !!article && article.designation_courte === ("PC " + SFX) && !!article.image_url && article.type_produit === "PIECE" && article.etat_produit_defaut === "NEUF", JSON.stringify(article));

      const prod = (await db.query(`SELECT id, prix_minimum_vente, compte_comptable, centre_de_cout, methode_valorisation, prix_achat, prix_vente, tva, reference_principale, niveau FROM produits WHERE article_id=$1`, [articleId])).rows[0];
      P("produits : comptable + prixMin persistés", !!prod && Number(prod.prix_minimum_vente) === 185 && prod.compte_comptable === "6071" && prod.centre_de_cout === "CO-AT-01" && prod.methode_valorisation === "FIFO" && prod.niveau === "VARIANTE", JSON.stringify(prod));

      const pats = (await db.query(`SELECT cle, valeur, type_attribut, searchable, filtrable FROM article_attributs WHERE article_id=$1 ORDER BY cle`, [articleId])).rows;
      P("article_attributs : 2 attributs ontologie (NOMBRE+ENUM)", pats.length === 2 && pats.some((a) => a.cle === "epaisseur" && a.type_attribut === "NOMBRE" && a.searchable === true) && pats.some((a) => a.cle === "matiere" && a.type_attribut === "ENUM"), JSON.stringify(pats));

      const comps = (await db.query(`SELECT type_compat, marque, modele, annee_de, annee_a, motorisation, position FROM compatibilites_produits WHERE article_id=$1 ORDER BY id`, [articleId])).rows;
      P("compatibilites_produits : 2 lignes (POS+NEG)", comps.length === 2 && comps.some((c) => c.type_compat === "POSITIVE" && c.marque === "Toyota") && comps.some((c) => c.type_compat === "NEGATIVE" && c.marque === "Peugeot"), JSON.stringify(comps));

      const eqs = (await db.query(`SELECT marque, reference, note FROM produit_references_equiv WHERE article_id=$1 ORDER BY id`, [articleId])).rows;
      P("produit_references_equiv : 2 lignes", eqs.length === 2 && eqs.some((e) => e.reference === "G26095") && eqs.some((e) => e.reference === "DAYCO 6PK1795"), JSON.stringify(eqs));

      const pus = (await db.query(`SELECT unite_id, facteur_vers_base, est_unite_base, prix_achat, prix_vente FROM produit_unites WHERE produit_id=$1 ORDER BY est_unite_base DESC`, [prod.id])).rows;
      P("produit_unites : 2 conversions (base + secondaire, facteur 12)", pus.length === 2 && pus.some((u) => u.est_unite_base === true && Number(u.facteur_vers_base) === 1) && pus.some((u) => u.est_unite_base === false && Number(u.facteur_vers_base) === 12), JSON.stringify(pus));

      const pf = (await db.query(`SELECT fournisseur_id, reference_fournisseur, prix_achat, delai_approvisionnement, est_principal, facteur_conditionnement FROM produits_fournisseurs WHERE produit_id=$1 ORDER BY id`, [prod.id])).rows;
      P("produits_fournisseurs : 2 fournisseurs (principal+2nd, cond÷ 24)", pf.length === 2 && pf.some((f) => f.est_principal === true) && pf.some((f) => f.est_principal === false && Number(f.facteur_conditionnement) === 24), JSON.stringify(pf));

      const vat = (await db.query(`SELECT cle, valeur, unite, type_attribut FROM variante_attributs WHERE variante_id=$1 ORDER BY cle`, [prod.id])).rows;
      P("variante_attributs : 2 attributs variante", vat.length === 2 && vat.some((a) => a.cle === "diametre" && a.valeur === "295" && a.unite === "mm") && vat.some((a) => a.cle === "nb_perforations"), JSON.stringify(vat));

      const mvts = (await db.query(`SELECT type, sens, quantite FROM mouvements_stock WHERE produit_id=$1`, [prod.id])).rows;
      P("mouvements_stock : stock initial 10 (entrée)", mvts.some((m) => m.sens === "E" && Number(m.quantite) === 10), JSON.stringify(mvts));

      // Vérification cohérence positionnement : la vignette article est en ligne.
      const vignette = await trpcQuery("articles.getArticle", { id: articleId });
      P("getArticle : payload riche (variantes/compat/équiv)", !!vignette && Array.isArray(vignette.variantes) && vignette.variantes.length === 1 && Array.isArray(vignette.compatibilites) && vignette.compatibilites.length === 2, JSON.stringify(vignette && { id: vignette.id, nVariantes: vignette.variantes?.length, nCompat: vignette.compatibilites?.length, nEq: vignette.referencesEquiv?.length }));
    }
  } catch (e) {
    console.log("  EXTRAP_ERR: " + e.message);
    FAIL++;
  }

  const getDefs = await trpcQuery("ontology.getDefinitionsForCategory", { categorieId: catId, portee: "ARTICLE" });
  P("ontologie getDefinitionsForCategory (ARTICLE)", !!getDefs && typeof getDefs.chain === "object" && Array.isArray(getDefs.definitions), "n=" + (getDefs?.definitions?.length ?? "?"));

  const createEmpl = await trpcMut("stock.createEmplacement", { code: "PRB-" + SFX, libelle: "Probe créé à la volée", type: "RAYON" });
  const emplId = createEmpl?.data?.id;
  P("stock.createEmplacement (création à la volée)", !!emplId, "id=" + emplId);
  if (emplId) {
    const empl = (await db.query(`SELECT id, code, type FROM emplacements WHERE id=$1`, [emplId])).rows[0];
    P("emplacement en DB (code/type)", !!empl && empl.type === "RAYON", JSON.stringify(empl));
  }

  // ─── Nettoyage ───
  console.log("\n═══ NETTOYAGE ═══");
  if (articleId) {
    const prodIds = (await db.query(`SELECT id FROM produits WHERE article_id=$1`, [articleId])).rows.map((r) => r.id);
    for (const pid of prodIds) {
      await db.query(`DELETE FROM stocks_lots WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM lots WHERE produit_id=$1`, [pid]);
    }
    await db.query(`ALTER TABLE mouvements_stock DISABLE TRIGGER trg_append_only_mouvements_stock`);
    for (const pid of prodIds) await db.query(`DELETE FROM mouvements_stock WHERE produit_id=$1`, [pid]);
    await db.query(`ALTER TABLE mouvements_stock ENABLE TRIGGER trg_append_only_mouvements_stock`);
    for (const pid of prodIds) {
      await db.query(`DELETE FROM stocks_unites WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM stocks WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM produit_unites WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM produits_fournisseurs WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM variante_attributs WHERE variante_id=$1`, [pid]);
    }
    for (const pid of prodIds) await db.query(`DELETE FROM produits WHERE id=$1`, [pid]);
    await db.query(`DELETE FROM article_attributs WHERE article_id=$1`, [articleId]);
    await db.query(`DELETE FROM compatibilites_produits WHERE article_id=$1`, [articleId]);
    await db.query(`DELETE FROM produit_references_equiv WHERE article_id=$1`, [articleId]);
    await db.query(`DELETE FROM produit_articles WHERE id=$1`, [articleId]);
    const r = (await db.query(`SELECT COUNT(*)::int AS n FROM produit_articles WHERE id=$1`, [articleId])).rows[0];
    P("Article supprimé (ménage inverse)", r.n === 0);
    const resi = (await db.query(`SELECT
      ((SELECT COUNT(*) FROM produits WHERE article_id=$1) +
      (SELECT COUNT(*) FROM compatibilites_produits WHERE article_id=$1) +
      (SELECT COUNT(*) FROM produit_references_equiv WHERE article_id=$1) +
      (SELECT COUNT(*) FROM article_attributs WHERE article_id=$1) +
      (SELECT COUNT(*) FROM produit_unites pu JOIN produits pr ON pr.id=pu.produit_id WHERE pr.article_id=$1) +
      (SELECT COUNT(*) FROM produits_fournisseurs pf JOIN produits pr ON pr.id=pf.produit_id WHERE pr.article_id=$1) +
      (SELECT COUNT(*) FROM variante_attributs va JOIN produits pr ON pr.id=va.variante_id WHERE pr.article_id=$1)) AS total
      `, [articleId])).rows[0];
    P("Aucun résidu (tout périmètre)", Number(resi.total) === 0, "total=" + resi.total);
  }
  if (emplId) {
    await db.query(`DELETE FROM emplacements WHERE id=$1`, [emplId]);
    const r = (await db.query(`SELECT COUNT(*)::int AS n FROM emplacements WHERE id=$1`, [emplId])).rows[0];
    P("Emplacement nettoyé", r.n === 0);
  }

  await db.end();
  console.log(`\n════════════════════════════════════════`);
  console.log(`PROBE ARTICLE COMPLET : PASS ${PASS} / FAIL ${FAIL}`);
  console.log(`════════════════════════════════════════`);
  process.exit(FAIL > 0 ? 1 : 0);
})().catch((e) => { console.error("PROBE FATAL: " + e.message); process.exit(1); });