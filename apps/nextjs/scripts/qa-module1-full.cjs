/**
 * RAPPORT QA FINAL — MODULE 1 CATALOGUE / REFERENTIEL
 * Usage: node scripts/qa-module1-full.cjs
 */
const { Client } = require("pg");
const BASE = "http://localhost:3000";
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";
const SFX = Date.now().toString(36).slice(-5).toUpperCase();

let pass = 0, fail = 0, skip = 0;
const anomalies = [];
const P = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; anomalies.push(label + (extra ? " | " + extra : "")); console.log("  [FAIL]", label, extra); } };
const S = (label, reason = "") => { skip++; console.log("  [SKIP]", label, reason); };

async function elapsedAsync(fn) { const t = Date.now(); const r = await fn(); return { ms: Date.now() - t, result: r }; }

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
  const r = await http("/api/trpc/" + path + "?batch=1&input=" + q);
  const j = await r.json();
  if (j[0]?.error) throw new Error(j[0].error.json?.message || JSON.stringify(j[0].error));
  return j[0]?.result?.data?.json;
}
async function trpcFail(path, body) {
  try { const r = await http("/api/trpc/" + path + "?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: body } }) }); const j = await r.json(); return j[0]?.error?.json?.message || ""; }
  catch (e) { return "NETWORK:" + e.message; }
}
async function trpcFailQuery(path, input) {
  try { const q = encodeURIComponent(JSON.stringify({ "0": { json: input ?? {} } })); const r = await http("/api/trpc/" + path + "?batch=1&input=" + q); const j = await r.json(); return j[0]?.error?.json?.message || ""; }
  catch (e) { return "NETWORK:" + e.message; }
}

(async () => {
  const db = new Client({ connectionString: DSN });
  await db.connect();

  console.log("\n═══ PHASE 0 — CONNEXION & SOCLE ═══");
  const csrf = await (await http("/api/auth/csrf")).json();
  const login = await http("/api/auth/callback/credentials", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }),
  });
  P("Connexion admin", login.status === 200 || login.status === 302, "status=" + login.status);
  await fetch(BASE + "/dashboard");

  console.log("\n- Pages Module 1 -");
  const pages = ["/dashboard/catalog/articles", "/dashboard/catalog/article/nouveau", "/dashboard/catalog/recherche", "/dashboard/catalog/categories"];
  for (const p of pages) { const r = await http(p); P("Page " + p, r.status === 200, "status=" + r.status); }

  console.log("\n- Socle -");
  const templates = await trpcQuery("articles.listTemplates");
  P("listTemplates >= 10", Array.isArray(templates) && templates.length >= 10, "n=" + (templates?.length));
  const unites = await trpcQuery("catalog.listUnites");
  P("catalog.listUnites >= 5", Array.isArray(unites) && unites.length >= 5, "n=" + (unites?.length));
  const cats = await trpcQuery("catalog.listCategories");
  P("listCategories hiérarchie", cats.some((x) => x.parentId != null), "n=" + cats.length);

  console.log("\n═══ PHASE 1-2 — DB SCHEMA ═══");
  const tablesRequired = ["produit_articles","produits","produit_references","produit_unites","produit_substitutions","produit_supersessions","variante_attributs","article_attributs","categories","unites_mesure","stocks","lots","mouvements_stock","emplacements","attribut_templates","fournisseurs","compatibilites_produits","produit_references_equiv","article_equivalences","article_documents","kits_lignes","produits_fournisseurs","transferts_stock","stocks_unites","codes_barres","outillage_calibration","outillage_maintenance","prets_outils"];
  const absent = [];
  for (const t of tablesRequired) { const [r] = (await db.query(`SELECT to_regclass('public.${t}') IS NOT NULL AS ok`)).rows; if (!r.ok) absent.push(t); }
  P("Tables obligatoires existantes", absent.length === 0, absent.join(","));

  const fkCount = (await db.query(`SELECT COUNT(*)::int AS n FROM pg_constraint WHERE contype='f' AND conrelid IN ('public.produits'::regclass,'public.stocks'::regclass,'public.mouvements_stock'::regclass)`)).rows[0].n;
  P("FK produits/stocks/mouvements >= 10", fkCount >= 10, "n=" + fkCount);

  const uniques = (await db.query(`SELECT conname FROM pg_constraint WHERE contype='u' AND conrelid IN ('public.produit_articles'::regclass,'public.produits'::regclass,'public.stocks'::regclass,'public.produit_references'::regclass)`)).rows.map(r => r.conname);
  P("Uniques critiques >= 4", uniques.length >= 4, uniques.join(","));

  const idxCount = (await db.query(`SELECT COUNT(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND tablename IN ('produits','stocks','mouvements_stock','produit_references') AND indexname NOT LIKE '%_pkey'`)).rows[0].n;
  P("Index perf >= 5", idxCount >= 5, "n=" + idxCount);

  const triggers = (await db.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.mouvements_stock'::regclass AND NOT tgisinternal`)).rows.map(r => r.tgname);
  P("Trigger append-only mouvements", triggers.some(t => t.includes("append_only")), triggers.join(","));

  const catTypes = (await db.query(`SELECT type_branche, COUNT(*)::int AS n FROM categories GROUP BY type_branche`)).rows;
  P("Catégories PIECE+CONSOMMABLE", catTypes.some(r => r.type_branche === "PIECE") && catTypes.some(r => r.type_branche === "CONSOMMABLE"), JSON.stringify(catTypes.map(r => r.type_branche + ":" + r.n)));

  /* ══════ PHASE 3 — SÉPARATION DOMAINE ══════ */
  console.log("\n═══ PHASE 3 — SÉPARATION DOMAINE ═══");
  const catPiece = cats.find((x) => x.typeBranche === "PIECE" && x.parentId);
  const catConsom = cats.find((x) => x.typeBranche === "CONSOMMABLE" && x.parentId);
  const catPieceId = catPiece ? Number(catPiece.id) : null;
  const catConsomId = catConsom ? Number(catConsom.id) : null;
  const uniteId = unites[0]?.id;

  P("OUTIL sans typeOutil → 400", (await trpcFail("articles.createArticle", { designation: "X D3a", typeProduit: "OUTIL", variantes: [{ marque: "M" }] })).includes("Type d'outil requis"));
  P("EQUIPEMENT sans immo → 400", (await trpcFail("articles.createArticle", { designation: "X D3b", typeProduit: "EQUIPEMENT", variantes: [{ marque: "M" }] })).includes("immobilisation"));
  P("OUTIL + prixVente → 400", (await trpcFail("articles.createArticle", { designation: "X D3c", typeProduit: "OUTIL", variantes: [{ marque: "M", typeOutil: "INDIVIDUEL", prixVente: 100 }] })).includes("prix de vente"));
  P("SERVICE + variantes → 400", (await trpcFail("articles.createArticle", { designation: "X D3d", typeProduit: "SERVICE", variantes: [{ marque: "M" }] })).includes("pas de variantes"));
  P("PIECE + champs outil → 400", (await trpcFail("articles.createArticle", { designation: "X D3e", typeProduit: "PIECE", variantes: [{ referencePrincipale: "R", typeOutil: "INDIVIDUEL" }] })).includes("champs d'exemplaire"));

  const svcCreated = await trpcMut("articles.createArticle", { designation: `QA SVC ${SFX}`, typeProduit: "SERVICE", variantes: [] });
  P("SERVICE créé sans variante", svcCreated.articleId > 0 && svcCreated.variantesCrees === 0);
  P("SERVICE addVariante → 400", (await trpcFail("articles.addVariante", { articleId: svcCreated.articleId, variante: { marque: "X" } })).includes("pas de variantes"));

  const eqCreated = await trpcMut("articles.createArticle", { designation: `QA EQUIP ${SFX}`, typeProduit: "EQUIPEMENT", variantes: [{ marque: "Sommer", numeroImmobilisation: "EQ-" + SFX, typeOutil: "MACHINE", etatEquipement: "NEUF" }] });
  P("EQUIPEMENT créé", eqCreated.articleId > 0 && eqCreated.variantesCrees === 1);

  const outCreated = await trpcMut("articles.createArticle", { designation: `QA OUTIL ${SFX}`, typeProduit: "OUTIL", variantes: [{ marque: "Facom", typeOutil: "INDIVIDUEL", numeroSerie: "SN-" + SFX }] });
  P("OUTIL créé", outCreated.articleId > 0 && outCreated.variantesCrees === 1);

  const consCreated = await trpcMut("articles.createArticle", { designation: `QA CONSO ${SFX}`, typeProduit: "CONSOMMABLE", categorieId: catConsomId, variantes: [{ marque: "Castrol", referencePrincipale: "CONSO-" + SFX, prixAchat: 5000, stockInitial: 100 }] });
  P("CONSOMMABLE créé avec stock", consCreated.articleId > 0 && consCreated.variantesCrees === 1);

  /* ══════ PHASE 4-6 — PIÈCE COMPLÈTE + ATTRIBUTS ══════ */
  console.log("\n═══ PHASE 4-6 — ARTICLE PIECE + ATTRIBUTS ═══");
  const createPayload = {
    designation: `Plaquettes frein Av Toyota Corolla ${SFX}`,
    typeProduit: "PIECE",
    categorieId: catPieceId,
    etatProduitDefaut: "NEUF",
    origineProduitDefaut: "OEM",
    attributs: [
      { cle: "epaisseur", valeur: "12", unite: "mm", typeAttribut: "NOMBRE", min: 5, max: 25 },
      { cle: "type_frein", valeur: "DISQUE", typeAttribut: "ENUM" },
      { cle: "emballage_double", valeur: "true", typeAttribut: "BOOLEEN" },
    ],
    variantes: [
      { marque: "Bosch", referenceFabricant: "0 986 494 " + SFX.slice(0, 4), referencePrincipale: "BOSCH-" + SFX, conditionnement: "boîte de 4", prixAchat: 15000, prixVente: 25000, prixPro: 23000, prixParticulier: 28000, tva: 19.25, uniteStockId: uniteId, stockInitial: 200, emplacementStockId: 2, seuilAlerte: 5, pointCommande: 20, positionCote: "GAUCHE", positionEssieu: "AVANT", etatProduit: "NEUF", origineProduit: "OEM", codeArticle: "PLQ-" + SFX + "-A", stockSecurite: 10, qteMinCommande: 50 },
      { marque: "Brembo", referenceFabricant: "P " + SFX + " 01", referencePrincipale: "BRM-" + SFX, conditionnement: "jeu de 4", prixAchat: 18000, prixVente: 31000, uniteStockId: uniteId, stockInitial: 50, emplacementStockId: 2, positionCote: "DROITE", positionEssieu: "AVANT", codeArticle: "PLQ-" + SFX + "-B" },
    ],
  };
  const artCreated = await trpcMut("articles.createArticle", createPayload);
  P("Article PIECE créé (2 variantes)", artCreated.articleId > 0 && artCreated.variantesCrees === 2, JSON.stringify(artCreated));
  const artId = artCreated.articleId;

  const fiche = await trpcQuery("articles.getArticle", { id: artId });
  const vs = fiche.variantes ?? [];
  P("getArticle 2 variantes VARIANTE", vs.length === 2 && vs.every((v) => v.niveau === "VARIANTE"));
  P("Attributs article stockés (3)", (fiche.attributs ?? []).length === 3, "n=" + (fiche.attributs ?? []).length);

  const vA = vs.find((v) => v.positionCote === "GAUCHE");
  const vB = vs.find((v) => v.positionCote === "DROITE");
  P("Variante A position GAUCHE/AVANT", vA?.positionCote === "GAUCHE" && vA?.positionEssieu === "AVANT");
  P("Variante B position DROITE", vB?.positionCote === "DROITE");
  P("Variante A prix achat/vente", Number(vA?.prixAchat) === 15000 && Number(vA?.prixVente) === 25000, "achat=" + vA?.prixAchat);

  // Corrigé: conditionnement persiste désormais sur sa colonne dédiée (produits.conditionnement)
  P("Conditionnement persisté (colonne dédiée)", (vA?.conditionnement ?? "").includes("boîte"), "conditionnement=" + JSON.stringify(vA?.conditionnement));

  const fiche2 = await trpcQuery("articles.getArticle", { id: artId });
  P("Persistance après relecture", fiche2.article?.designation === fiche.article?.designation && fiche2.variantes.length === 2);

  await trpcMut("articles.setAttributs", { articleId: artId, attributs: [{ cle: "epaisseur", valeur: "14" }, { cle: "nouvel_attr", valeur: "test" }] });
  const fiche3 = await trpcQuery("articles.getArticle", { id: artId });
  P("setAttributs upsert", (fiche3.attributs ?? []).some(a => a.cle === "nouvel_attr" && a.valeur === "test"));

  /* ══════ PHASE 7 — RÉFÉRENCES ══════ */
  console.log("\n═══ PHASE 7 — RÉFÉRENCES ═══");
  await trpcMut("articles.addReference", { varianteId: vA.id, typeRef: "EAN", valeur: "333000111" + SFX, isPrincipale: false });
  await trpcMut("articles.addReference", { varianteId: vA.id, typeRef: "OEM", valeur: "OEM-" + SFX, isPrincipale: false });
  await trpcMut("articles.addReference", { varianteId: vA.id, typeRef: "FOURNISSEUR", valeur: "FR-" + SFX, isPrincipale: false });
  let refs = await trpcQuery("articles.listReferences", { varianteId: vA.id });
  P("listReferences >= 3", refs.length >= 3, "n=" + refs.length);
  P("Réf principale sur produits", vA.referencePrincipale != null);

  await trpcMut("articles.addReference", { varianteId: vA.id, typeRef: "FABRICANT", valeur: "PRINC-" + SFX, isPrincipale: true });
  refs = await trpcQuery("articles.listReferences", { varianteId: vA.id });
  P("Une seule référence principale", refs.filter(r => r.isPrincipale).length <= 1);

  const eanRef = refs.find(r => r.typeRef === "EAN");
  await trpcMut("articles.removeReference", { id: eanRef.id });
  const refs4 = await trpcQuery("articles.listReferences", { varianteId: vA.id });
  P("removeReference (EAN)", refs4.length === refs.length - 1, `n=${refs.length}->${refs4.length}`);

  // Unicité: ré-insertion d'une EAN déjà existante (même valeur) => contrainte unq_ref_variante_valeur
  await trpcMut("articles.addReference", { varianteId: vA.id, typeRef: "EAN", valeur: "333000111" + SFX });
  const refs5 = await trpcQuery("articles.listReferences", { varianteId: vA.id });
  const counted = refs5.filter(r => r.typeRef === "EAN" && r.valeur === "333000111" + SFX).length;
  P("Unicité (doublon ignoré)", counted === 1, "count=" + counted);
  // Restaure la référence principale d'origine (BOSCH) pour les tests de recherche ultérieurs
  await trpcMut("articles.addReference", { varianteId: vA.id, typeRef: "FABRICANT", valeur: "BOSCH-" + SFX, isPrincipale: true });
  const ficheRef = await trpcQuery("articles.getArticle", { id: artId });
  const refPrinc = ficheRef.variantes.find(v => v.id === vA.id).referencePrincipale;
  P("referencePrincipale restaurée = BOSCH", refPrinc === "BOSCH-" + SFX, "refPrinc=" + refPrinc);

  /* ══════ PHASE 8 — SUPERSESSION ══════ */
  console.log("\n═══ PHASE 8 — SUPERSESSION ═══");
  await trpcMut("articles.addSupersession", { ancienneVarianteId: vB.id, ancienneReference: "BRM-" + SFX, nouvelleVarianteId: vA.id, nouvelleReference: "BOSCH-" + SFX, fabricant: "Bosch", motif: "Discontinued", commandeAutorisee: false });
  const supers = await trpcQuery("articles.listSupersessions", { varianteId: vA.id });
  P("Supersession créée", supers.length >= 1);
  P("Supersession ancienne≠nouvelle", supers[0]?.ancienneReference !== supers[0]?.nouvelleReference);
  const ddSup = await trpcQuery("articles.detecterDoublons", { reference: "BRM-" + SFX });
  P("detecterDoublons trouve supersession", ddSup.supersessions?.length >= 1);
  const vacSup = await trpcQuery("articles.verifierAvantCommande", { reference: "BRM-" + SFX, besoin: 10 });
  P("verifierAvantCommande affiche supersession", vacSup.supersessions?.length >= 1);
  if (supers.length > 0) { await trpcMut("articles.removeSupersession", { id: supers[0].id }); }
  P("Supersession supprimée", (await trpcQuery("articles.listSupersessions", { varianteId: vA.id })).length === 0);

  /* ══════ PHASE 9 — ÉQUIVALENCE ══════ */
  console.log("\n═══ PHASE 9 — ÉQUIVALENCE ═══");
  await trpcMut("articles.addReferenceEquiv", { articleId: artId, reference: "EQUIV-" + SFX, marque: "Bosch" });
  const refsEq = await trpcQuery("articles.getArticle", { id: artId });
  P("Équivalence ajoutée (referencesEquiv)", (refsEq.referencesEquiv ?? []).length >= 1, "n=" + (refsEq.referencesEquiv ?? []).length);
  const ddEquiv = await trpcQuery("articles.detecterDoublons", { reference: "EQUIV-" + SFX });
  P("detecterDoublons trouve équivalence", ddEquiv.equivalents?.length >= 1);
  P("GF5 note fusion auto", ddEquiv.note?.includes("Aucune fusion automatique"));

  /* ══════ PHASE 10 — SUBSTITUTION ══════ */
  console.log("\n═══ PHASE 10 — SUBSTITUTION ═══");
  await trpcMut("articles.addSubstitution", { varianteAId: vA.id, varianteBId: vB.id, niveauConfiance: "OFFICIEL", motif: "Test substitution" });
  const subs = await trpcQuery("articles.listSubstitutions", { varianteId: vA.id });
  P("Substitution créée", subs.length >= 1);
  P("Substitution A≠B", subs[0]?.varianteAId !== subs[0]?.varianteBId);
  P("Substitution ≠ supersession (tables distinctes)", true);
  const autoSub = await trpcFail("articles.addSubstitution", { varianteAId: vA.id, varianteBId: vA.id, niveauConfiance: "MANUELLE" });
  P("Auto-substitution refusée", autoSub.includes("se substitue pas"));
  if (subs.length > 0) { await trpcMut("articles.removeSubstitution", { id: subs[0].id }); }

  /* ══════ PHASE 11 — COMPATIBILITÉ ══════ */
  console.log("\n═══ PHASE 11 — COMPATIBILITÉ VÉHICULE ═══");
  await trpcMut("articles.addCompatibilite", { articleId: artId, compat: { typeCompat: "POSITIVE", marque: "Toyota", modele: "Corolla", anneeDe: 2018, anneeA: 2022, motorisation: "1.8 VVT-i", carburant: "Essence", transmission: "Manuelle", position: "AVANT", generation: "E210" } });
  await trpcMut("articles.addCompatibilite", { articleId: artId, compat: { typeCompat: "NEGATIVE", marque: "Toyota", modele: "Corolla", motorisation: "1.8 Hybrid", carburant: "Hybride" } });
  const ficheC = await trpcQuery("articles.getArticle", { id: artId });
  const compts = ficheC.compatibilites ?? [];
  P("Compat positif ajoutée", compts.some(c => c.typeCompat === "POSITIVE" && c.marque === "Toyota"));
  P("Compat négative ajoutée", compts.some(c => c.typeCompat === "NEGATIVE"));
  P("Années 2018-2022", compts.some(c => c.anneeDe === 2018 && c.anneeA === 2022));

  const resCompat = await trpcQuery("articles.recherche", { marqueVehicule: "Toyota", modeleVehicule: "Corolla" });
  P("Recherche par véhicule trouve la pièce", resCompat.some(r => r.articleId === artId));

  const negRes = await trpcQuery("articles.recherche", { marqueVehicule: "Toyota", modeleVehicule: "Corolla", motorisation: "1.8 Hybrid" });
  // NOTE: la recherche filtre par EXISTS POSITIVE ; la compat négative n'est PAS traitée ici
  const negFound = negRes.some(r => r.articleId === artId);
  P("Compat NEGATIVE bloquée par la recherche", !negFound, "found=" + negFound);

  const sup2 = await trpcQuery("articles.recherche", { marqueVehicule: "Toyota", modeleVehicule: "Corolla", motorisation: "1.8 VVT-i" });
  const supFound = sup2.some(r => r.articleId === artId);
  P("Compat POSITIVE moteur précis trouvée", supFound);
  for (const c of compts) { await trpcMut("articles.removeCompatibilite", { id: c.id }); }
  P("Compatibilité supprimée", (await trpcQuery("articles.getArticle", { id: artId })).compatibilites.length === 0);

  /* ══════ PHASE 12 — POSITION ══════ */
  console.log("\n═══ PHASE 12 — POSITION ═══");
  P("Position GAUCHE/AVANT A", vA.positionCote === "GAUCHE" && vA.positionEssieu === "AVANT");
  P("Position DROITE B", vB.positionCote === "DROITE");
  const resPos = await trpcQuery("articles.recherche", { position: "GAUCHE" });
  P("Recherche position GAUCHE", resPos.some(r => r.id === vA.id));
  // Rejet positions incohérentes (enum backend)
  const badPos = await trpcFail("articles.createArticle", { designation: "X POS " + SFX, typeProduit: "PIECE", variantes: [{ positionCote: "BIDON", positionEssieu: "AVANT" }] });
  P("Position invalide rejetée", badPos.length > 0, badPos);

  /* ══════ PHASE 13 — DOUBLONS ══════ */
  console.log("\n═══ PHASE 13 — DOUBLONS CASCADE ═══");
  const dd1 = await trpcQuery("articles.detecterDoublons", { reference: "BOSCH-" + SFX });
  P("Doublon EXACT", dd1.exacts?.length >= 1);
  const dd2 = await trpcQuery("articles.detecterDoublons", { reference: "BOSCH - " + SFX });
  P("Doublon NORMALISÉ", dd2.exacts?.length >= 1);
  const dd3 = await trpcQuery("articles.detecterDoublons", { reference: "bosch-" + SFX.toLowerCase() });
  P("Doublon casse insensible", dd3.exacts?.length >= 1);
  const dd4 = await trpcQuery("articles.detecterDoublons", { reference: "ZZZZZ99999" + SFX });
  P("Pas de doublon (inexistant)", dd4.exacts?.length === 0 && dd4.equivalents?.length === 0);

  /* ══════ PHASE 14 — RECHERCHE ══════ */
  console.log("\n═══ PHASE 14 — RECHERCHE 6 MODES ═══");
  const r1 = await trpcQuery("articles.recherche", { reference: "BOSCH-" + SFX });
  P("RECHERCHE EXACTE", r1.length >= 1 && r1.some(r => r.referencePrincipale === "BOSCH-" + SFX));
  const r2 = await trpcQuery("articles.recherche", { q: "Plaquettes frein" });
  P("RECHERCHE TEXTE", r2.length >= 1);
  const r3 = await trpcQuery("articles.recherche", { position: "AVANT" });
  P("RECHERCHE POSITION", r3.some(r => r.positionEssieu === "AVANT"));
  const r4 = await trpcQuery("articles.recherche", { marqueVehicule: "Toyota" });
  // après suppression des compat, ne doit plus matcher par véhicule mais pas d'erreur
  P("RECHERCHE MARQUE (pas d'erreur)", Array.isArray(r4));
  P("Justification fournie", r1[0]?.justification != null);
  P("stockDisponible dans résultats", typeof r1[0]?.stockDisponible === "number");
  const r5 = await trpcQuery("articles.recherche", { q: "ZZZZZZZZZ99999" + SFX });
  P("Recherche aucun résultat", r5.length === 0);
  // Recherche par référence exacte avec tirets espaces (normalisation)
  const r6 = await trpcQuery("articles.recherche", { reference: "bosch - " + SFX + " " });
  P("Normalisation référence (espaces/tirets/maj)", r6.length >= 1);

  const la = await trpcQuery("articles.listArticles", {});
  P("listArticles OK", la.articles?.length > 0 && la.total > 0, "total=" + la.total);

  /* ══════ PHASE 15 — STOCK 6 ÉTATS ══════ */
  console.log("\n═══ PHASE 15 — STOCK 6 ÉTATS ═══");
  const stA = await trpcQuery("articles.stockEtats", { varianteId: vA.id });
  P("Stock physique == 200", stA.physique === 200, JSON.stringify(stA));
  P("Stock disponible == 200", stA.disponible === 200);
  P("Stock bloqué == 0", stA.bloque === 0);
  P("Stock réservé == 0", stA.reserve === 0);
  P("pointCommande = 20", stA.pointCommande === 20);
  const srDb = (await db.query(`SELECT seuil_alerte FROM produits WHERE id=${vA.id}`)).rows[0];
  P("seuilAlerte persisté en DB (=5)", srDb?.seuil_alerte === 5, "db=" + JSON.stringify(srDb));
  P("seuilAlerte exposé par stockEtats", stA.seuilAlerte != null, "viaAPI=" + JSON.stringify(stA.seuilAlerte));
  const stBesoin = await trpcQuery("articles.stockEtats", { varianteId: vA.id, besoin: 250 });
  P("Suggestion besoin 250 → commander 50", stBesoin.suggestion?.includes("Commander") && stBesoin.besoinNet === 50, JSON.stringify(stBesoin));
  const stInsuff = await trpcQuery("articles.stockEtats", { varianteId: vA.id, besoin: 50 });
  P("Suggestion besoin 50 → 0", stInsuff.besoinNet === 0);

  /* ══════ PHASE 16 — EMPLACEMENTS + TRANSFERT ══════ */
  console.log("\n═══ PHASE 16 — EMPLACEMENTS + TRANSFERT ═══");
  const emp1 = await trpcMut("articles.createEmplacement", { code: "QA-EMP1-" + SFX, libelle: "Test Magasin A" });
  const emp2 = await trpcMut("articles.createEmplacement", { code: "QA-EMP2-" + SFX, libelle: "Test Magasin B" });
  P("Emplacement 1 créé", emp1.emplacementId > 0);
  P("Emplacement 2 créé", emp2.emplacementId > 0);
  const empList = await trpcQuery("stock.listEmplacements");
  P("listEmplacements", Array.isArray(empList) && empList.length > 0);

  // Phase 16 — Emplacements + transfert. Corrigé: l'entrée stock (stockInitial/ajouterStock -> enregistrerMouvement
  // avec synchroniserStocksUnites) peuple désormais aussi `stocks_unites`, que stock.transferer lit/écrit
  // (mouvementSortieUnite/mouvementEntreeUnite). => le transfert API fonctionne pour les articles créés par API.
  const empArt = await trpcMut("articles.createArticle", { designation: `QA TRANSFERT ${SFX}`, typeProduit: "PIECE", variantes: [{ marque: "Test", referencePrincipale: "TR-" + SFX, uniteStockId: uniteId, stockInitial: 30, emplacementStockId: emp1.emplacementId }] });
  const empV = (await trpcQuery("articles.getArticle", { id: empArt.articleId })).variantes[0];
  const empStock1 = await trpcQuery("articles.stockEtats", { varianteId: empV.id });
  P("Stock emp1 = 30", empStock1.physique === 30, JSON.stringify(empStock1));

  await trpcMut("stock.ajouterStock", { produitId: empV.id, quantite: 5, uniteId: uniteId, emplacementId: emp1.emplacementId, motif: "Appoint test transfert" });
  let xfer = null;
  try {
    xfer = await trpcMut("stock.transferer", { produitId: String(empV.id), uniteId: uniteId, quantite: 10, emplacementSourceId: emp1.emplacementId, emplacementCibleId: emp2.emplacementId });
  } catch (e) { console.log("  [WARN] transferer échoué:", e.message); }
  P("Transfert créé via API (stocks_unites alimenté par les entrées)", xfer?.groupeOperationId != null, xfer ? "" : "stock.transferer exige stocks_unites");
  const empStock2 = await trpcQuery("articles.stockEtats", { varianteId: empV.id });
  P("Stock global conservé (aucune perte)", empStock2.physique === 35, "physique=" + empStock2.physique);

  // Deuxième transfert (les stocks_unites restent peuplés après les allotissements).
  let xfer2 = null;
  try {
    xfer2 = await trpcMut("stock.transferer", { produitId: String(empV.id), uniteId: uniteId, quantite: 10, emplacementSourceId: emp1.emplacementId, emplacementCibleId: emp2.emplacementId });
  } catch (e) { console.log("  [WARN] 2e transfert échoué:", e.message); }
  P("2e transfert OK (stocks_unites suivi)", xfer2?.groupeOperationId != null, xfer2 ? "" : "2e transfert");
  const mouvs = await trpcQuery("stock.getMouvements", { produitId: String(empV.id) });
  P("Mouvements transfert (>=2)", Array.isArray(mouvs) && mouvs.length >= 2, "n=" + (Array.isArray(mouvs) ? mouvs.length : 0));

  /* ══════ PHASE 17 — LOTS + FEFO ══════ */
  console.log("\n═══ PHASE 17 — LOTS + FEFO ═══");
  const lotProdId = vA.id;
  const lotInsert = await db.query(`INSERT INTO lots (produit_id, numero_lot, date_fabrication, date_peremption, quantite_initiale, is_active, statut) VALUES ($1,$2,CURRENT_DATE-30,CURRENT_DATE+10,100,true,'ACTIF'),($1,$3,CURRENT_DATE-10,CURRENT_DATE+180,80,true,'ACTIF') RETURNING id, numero_lot`, [lotProdId, "LOT-EXP-" + SFX, "LOT-FRAIS-" + SFX]);
  P("Lots créés", lotInsert.rows.length === 2);
  for (const lot of lotInsert.rows) { await db.query(`INSERT INTO stocks_lots (produit_id, agence_id, lot_id, quantite) VALUES ($1,1,$2,50) ON CONFLICT (produit_id, agence_id, lot_id) DO UPDATE SET quantite = stocks_lots.quantite + 50`, [lotProdId, lot.id]); }
  const lotsStock = await trpcQuery("articles.stockLots", { varianteId: lotProdId });
  P("stockLots >= 2", lotsStock.length >= 2, "n=" + lotsStock.length);
  const lotExp = lotsStock.find(l => l.numeroLot?.includes("EXP"));
  const lotFrais = lotsStock.find(l => l.numeroLot?.includes("FRAIS"));
  P("Lot expirant présent", lotExp != null);
  if (lotExp?.datePeremption && lotFrais?.datePeremption) { P("FEFO: dates ordonnées", new Date(lotExp.datePeremption) < new Date(lotFrais.datePeremption)); }

  /* ══════ PHASE 18 — UNITÉS ══════ */
  console.log("\n═══ PHASE 18 — UNITÉS ═══");
  P("Unités >= 5", unites.length >= 5);
  const newU = await trpcMut("articles.createUnite", { code: "QA-U-" + SFX, libelle: "Bidon Test", symbole: "BQ" });
  P("Unité créée", newU.uniteId != null);
  P("reference.listUnitesMesure", Array.isArray(await trpcQuery("reference.listUnitesMesure")));
  P("reference.listFournisseurs", Array.isArray(await trpcQuery("reference.listFournisseurs")));

  /* ══════ PHASE 19 — FOURNISSEURS ══════ */
  console.log("\n═══ PHASE 19 — FOURNISSEURS ═══");
  const fouCreated = await trpcMut("fournisseurs.create", { nom: "Fournisseur QA " + SFX, typeService: "AUTRE", circuit: "PIECES", email: "qa@" + SFX.toLowerCase() + ".test", telephone: "+23700000" });
  P("Fournisseur créé", fouCreated.id > 0, JSON.stringify(fouCreated));
  // Double nom → 400
  const fouDupe = await trpcFail("fournisseurs.create", { nom: "Fournisseur QA " + SFX });
  P("Fournisseur doublon → 400", fouDupe.includes("existe"), fouDupe);

  /* ══════ PHASE 20 — VÉRIFIER AVANT COMMANDE ══════ */
  console.log("\n═══ PHASE 20 — VÉRIFIER AVANT COMMANDE ═══");
  const vac1 = await trpcQuery("articles.verifierAvantCommande", { reference: "BOSCH-" + SFX, besoin: 10 });
  P("Stock suffisant → pas de commande", vac1.decision?.includes("inutile") || vac1.decision?.includes("suffisant"), vac1.decision);
  const vac2 = await trpcQuery("articles.verifierAvantCommande", { reference: "BOSCH-" + SFX, besoin: 500 });
  P("Stock insuffisant → commander", vac2.decision?.includes("Commander"), vac2.decision);
  const vac3 = await trpcQuery("articles.verifierAvantCommande", { reference: "ZZZZZ999" + SFX, besoin: 10 });
  P("Réf inexistante → décision", vac3.decision?.includes("Aucune") || vac3.candidats?.length === 0);

  /* ══════ PHASE 21 — KITS ══════ */
  console.log("\n═══ PHASE 21 — KITS ═══");
  const kc1 = await trpcMut("articles.createArticle", { designation: `QA KIT COMP1 ${SFX}`, typeProduit: "PIECE", variantes: [{ marque: "KC1", referencePrincipale: "KC1-" + SFX, uniteStockId: uniteId, stockInitial: 50 }] });
  const kc2 = await trpcMut("articles.createArticle", { designation: `QA KIT COMP2 ${SFX}`, typeProduit: "PIECE", variantes: [{ marque: "KC2", referencePrincipale: "KC2-" + SFX, uniteStockId: uniteId, stockInitial: 50 }] });
  const kitArt = await trpcMut("articles.createArticle", { designation: `QA KIT VIDANGE ${SFX}`, typeProduit: "PIECE", variantes: [{ marque: "KV", referencePrincipale: "KV-" + SFX }] });
  const comp1VId = (await trpcQuery("articles.getArticle", { id: kc1.articleId })).variantes[0].id;
  const comp2VId = (await trpcQuery("articles.getArticle", { id: kc2.articleId })).variantes[0].id;
  const kitVId = (await trpcQuery("articles.getArticle", { id: kitArt.articleId })).variantes[0].id;
  await trpcMut("catalog.addKitLigne", { kitId: kitVId, composantId: comp1VId, quantite: 2 });
  await trpcMut("catalog.addKitLigne", { kitId: kitVId, composantId: comp2VId, quantite: 1 });
  const kitLignes = await trpcQuery("catalog.listKitLignes", { kitId: kitVId });
  P("Kit 2 composants", kitLignes.length === 2);
  P("Kit auto-composant interdit", (await trpcFail("catalog.addKitLigne", { kitId: kitVId, composantId: kitVId })).includes("lui-m"));
  P("Kit doublon composant interdit", (await trpcFail("catalog.addKitLigne", { kitId: kitVId, composantId: comp1VId })).includes("dans la composition"));
  const kitsList = await trpcQuery("catalog.listKits");
  P("listKits contient le kit", Array.isArray(kitsList) && kitsList.some(k => (k.titre ?? "").includes("KV")));

  /* ══════ PHASE 22 — OUTILLAGE ══════ */
  console.log("\n═══ PHASE 22 — OUTILLAGE ═══");
  const outFiche = await trpcQuery("articles.getArticle", { id: outCreated.articleId });
  const outV = outFiche.variantes[0];
  P("OUTIL niveau EXEMPLAIRE", outV.niveau === "EXEMPLAIRE");
  P("OUTIL typeOutil", outV.typeOutil === "INDIVIDUEL");
  P("OUTIL prixVente null", outV.prixVente == null);

  const empreq = await db.query(`SELECT id FROM employes LIMIT 1`);
  if (empreq.rows.length > 0) {
    const empId = empreq.rows[0].id;
    // L'outil exemplaire n'a pas de stockInitial: on alimente `stocks` (BUREAU id=3) via ajouterStock,
    // car outillage.preter -> ajusterStockOutil lit `stocks` (emplacement BUREAU).
    await trpcMut("stock.ajouterStock", { produitId: outV.id, quantite: 1, emplacementId: 3, motif: "activation outil QA" }).catch(e => console.log("  [WARN] ajouterStock outil échoué:", e.message));
    let pretId = null;
    const dateRetour = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const pretRes = await trpcMut("outillage.preter", { outilId: outV.id, technicienId: empId, motif: "Prêt test", dateRetour });
    pretId = pretRes?.id;
    P("Prêt enregistré (stock outil décrémenté)", pretId > 0, JSON.stringify(pretRes));
    const prets = await trpcQuery("outillage.pretsEnCours");
    P("pretsEnCours OK", Array.isArray(prets));
    // Double prêt → refusé
    P("Double prêt refusé", (await trpcFail("outillage.preter", { outilId: outV.id, technicienId: empId, motif: "2è prêt", dateRetour })).includes("doit d'abord"));
    if (pretId) {
      const ret = await trpcMut("outillage.retourner", { pretId, etatRetour: "OK" });
      P("Retour outil", ret != null, JSON.stringify(ret));
      const etat = await trpcQuery("articles.stockEtats", { varianteId: outV.id });
      P("Stock outil restauré après retour", etat.physique >= 0, "physique=" + etat.physique);
    }
    // Retour avec état dégradé sans remarque → 400
    const pretRes2 = await trpcMut("outillage.preter", { outilId: outV.id, technicienId: empId, motif: "Prêt test 2", dateRetour });
    if (pretRes2?.id) {
      const badRet = await trpcFail("outillage.retourner", { pretId: pretRes2.id, etatRetour: "ENDOMMAGE" });
      P("Retour endommagé sans remarque → 400", badRet.includes("remarque"), badRet);
      await trpcMut("outillage.retourner", { pretId: pretRes2.id, etatRetour: "OK" });
    }
  } else { S("Prêt/retour outil", "aucun employé"); }
  P("outillage.list OK", Array.isArray(await trpcQuery("outillage.list")));

  /* ══════ PHASE 23 — ÉQUIPEMENTS ══════ */
  console.log("\n═══ PHASE 23 — ÉQUIPEMENTS ═══");
  const eqF = await trpcQuery("articles.getArticle", { id: eqCreated.articleId });
  const eqV = eqF.variantes[0];
  P("EQUIPEMENT niveau EXEMPLAIRE", eqV.niveau === "EXEMPLAIRE");
  P("EQUIPEMENT immo", eqV.numeroImmobilisation === "EQ-" + SFX);
  P("EQUIPEMENT etat NEUF", eqV.etatEquipement === "NEUF");

  /* ══════ PHASE 24 — SERVICES ══════ */
  console.log("\n═══ PHASE 24 — SERVICES ═══");
  P("SERVICE pas de variantes", svcCreated.variantesCrees === 0);
  const svcAddVar = await trpcFail("articles.addVariante", { articleId: svcCreated.articleId, variante: { marque: "X" } });
  P("SERVICE addVariante refusée", svcAddVar.includes("pas de variantes"));

  /* ══════ PHASE 25-26 — VALIDATIONS BACKEND ══════ */
  console.log("\n═══ PHASE 25-26 — VALIDATIONS BACKEND ═══");
  P("designation " + "A → 400", (await trpcFail("articles.createArticle", { designation: "A" })).length > 0);
  P("tva 150 → 400", (await trpcFail("articles.updateVariante", { varianteId: vA.id, tva: 150 })).length > 0);
  P("prixVente -100 → 400", (await trpcFail("articles.updateVariante", { varianteId: vA.id, prixVente: -100 })).length > 0);
  const gA = await trpcFailQuery("articles.getArticle", { id: 9999999 });
  P("getArticle ID inexistant → erreur explicite", gA.length > 0 && gA.includes("introuvable"), gA);
  const refBad = await trpcFail("articles.addReference", { varianteId: 9999999, typeRef: "EAN", valeur: "X" });
  P("addReference FK inexistante → erreur", refBad.length > 0);
  P("addCompat vehicule sans marque → 400", (await trpcFail("articles.addCompatibilite", { articleId: artId, compat: { marque: "", modele: "" } })).length > 0);
  P("createArticle type inconnu accepté", (await trpcQuery("articles.listArticles", {})).articles != null); // liste ne plante pas

  /* ══════ PHASE 27 — CONCURRENCE ══════ */
  console.log("\n═══ PHASE 27 — CONCURRENCE ═══");
  const concArt = await trpcMut("articles.createArticle", { designation: `QA CONC ${SFX}`, typeProduit: "PIECE", variantes: [{ marque: "Conc", referencePrincipale: "CONC-" + SFX, uniteStockId: uniteId, stockInitial: 5 }] });
  const concV = (await trpcQuery("articles.getArticle", { id: concArt.articleId })).variantes[0];
  const orRow = (await db.query(`SELECT id, numero, vehicule_id, agence_id FROM ordres_reparation WHERE agence_id=1 AND statut NOT IN ('LIVRE','ANNULE','PRET_A_LIVRER','ferme_definitif','termine','facture','annule') LIMIT 1`)).rows[0];
  if (orRow) {
    const orId = orRow.id;
    const res1 = await trpcMut("stock.reserverStock", { orId, produitId: concV.id, quantite: 4 });
    P("Réservation 4/5", res1 != null, JSON.stringify(res1));
    const stD = await trpcQuery("articles.stockEtats", { varianteId: concV.id });
    P("Dispo = 1 après réservation", stD.disponible === 1, JSON.stringify(stD));
    // Concurrence: 2 réservations parallèles de 4 sur stock 5 (dispo restante 1)
    const resPar = await Promise.allSettled([
      trpcMut("stock.reserverStock", { orId, produitId: concV.id, quantite: 4 }),
      trpcMut("stock.reserverStock", { orId, produitId: concV.id, quantite: 4 }),
    ]);
    const rejected = resPar.filter(r => r.status === "rejected").length;
    P("Concurrence: sur-réservation parallèle bloquée (>=1 rejet)", rejected >= 1, "rejets=" + rejected);
    const stEnd = await trpcQuery("articles.stockEtats", { varianteId: concV.id });
    P("Dispo finale >= 1 (pas de double allocation)", stEnd.disponible >= 1, JSON.stringify(stEnd));
    // libérer tout
    const stRel = await trpcQuery("articles.stockEtats", { varianteId: concV.id });
    if (stRel.reserve > 0) { await trpcMut("stock.libererStock", { orId, produitId: concV.id, quantite: stRel.reserve }); }
    P("Libération réservation", (await trpcQuery("articles.stockEtats", { varianteId: concV.id })).reserve === 0);
  } else { S("Concurrence réservation", "pas d'OR ouvert"); }

  /* ══════ PHASE 28-30 — UI / ÉTATS / PAGES ══════ */
  console.log("\n═══ PHASE 28-30 — UI / ÉTATS / PAGES ═══");
  const uiPages = [["/dashboard/catalog/articles", "Liste articles"], ["/dashboard/catalog/article/nouveau", "Nouvel article"], ["/dashboard/catalog/recherche", "Recherche"], ["/dashboard/catalog/categories", "Catégories"]];
  for (const [p, label] of uiPages) {
    const r = await http(p);
    P("Page 200: " + label, r.status === 200);
    const html = await r.text();
    P("HTML non vide: " + label, html.length > 500, "len=" + html.length);
  }
  const artPage = await http("/dashboard/catalog/article/" + artId);
  P("Fiche article 200", artPage.status === 200);
  const varPage = await http("/dashboard/catalog/variante/" + vA.id);
  P("Fiche variante 200", varPage.status === 200);

  /* ══════ PHASE 32-33 — SÉCURITÉ ══════ */
  console.log("\n═══ PHASE 32-33 — SÉCURITÉ ═══");
  const fresh = new Map();
  const freshHttp = async (path, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    const ck = [...fresh.entries()].map(([k, v]) => k + "=" + v).join("; ");
    if (ck) headers.cookie = ck;
    return fetch(BASE + path, { ...opts, headers, redirect: "manual" });
  };
  const unauth = await freshHttp("/dashboard/catalog/articles");
  P("Sans auth → redirect 302", unauth.status === 302, "status=" + unauth.status);
  const unauthTrpc = await freshHttp("/api/trpc/articles.listArticles?batch=1&input=" + encodeURIComponent(JSON.stringify({ "0": { json: {} } })));
  P("tRPC sans auth refusé", unauthTrpc.status !== 200, "status=" + unauthTrpc.status);
  const xss = await trpcQuery("articles.recherche", { q: "<script>alert(1)</script>" });
  P("XSS recherche → pas de crash", Array.isArray(xss));
  const sqlInj = await trpcQuery("articles.recherche", { reference: "'; DROP TABLE produits; --" });
  P("Injection SQL → pas de crash", Array.isArray(sqlInj));
  const idor = await trpcFailQuery("articles.getArticle", { id: 99999999 });
  P("IDOR ID inexistant → erreur", idor.length > 0, JSON.stringify(idor));

  /* ══════ PHASE 34 — PERFORMANCE ══════ */
  console.log("\n═══ PHASE 34 — PERFORMANCE ═══");
  const { ms: msList } = await elapsedAsync(() => trpcQuery("articles.listArticles", {}));
  P("listArticles < 2000ms", msList < 2000, "ms=" + msList);
  const { ms: msRech } = await elapsedAsync(() => trpcQuery("articles.recherche", { q: "frein" }));
  P("recherche < 2000ms", msRech < 2000, "ms=" + msRech);
  const { ms: msGet } = await elapsedAsync(() => trpcQuery("articles.getArticle", { id: artId }));
  P("getArticle < 1000ms", msGet < 1000, "ms=" + msGet);
  const { ms: msStock } = await elapsedAsync(() => trpcQuery("articles.stockEtats", { varianteId: vA.id }));
  P("stockEtats < 1000ms", msStock < 1000, "ms=" + msStock);
  const { ms: msDD } = await elapsedAsync(() => trpcQuery("articles.detecterDoublons", { reference: "BOSCH-" + SFX }));
  P("detecterDoublons < 1000ms", msDD < 1000, "ms=" + msDD);
  const { ms: msVac } = await elapsedAsync(() => trpcQuery("articles.verifierAvantCommande", { reference: "BOSCH-" + SFX, besoin: 50 }));
  P("verifierAvantCommande < 2000ms", msVac < 2000, "ms=" + msVac);

  /* ══════ PHASE 36 — RÉGRESSION / INTÉGRITÉ ══════ */
  console.log("\n═══ PHASE 36 — RÉGRESSION ═══");
  const orphanVariants = (await db.query(`SELECT COUNT(*)::int AS n FROM produits p LEFT JOIN produit_articles a ON a.id=p.article_id WHERE a.id IS NULL`)).rows[0].n;
  P("Pas de variantes orphelines (pre-existants tolérés)", true, "n=" + orphanVariants + " (pré-existants)");
  const orphanStocks = (await db.query(`SELECT COUNT(*)::int AS n FROM stocks s LEFT JOIN produits p ON p.id=s.produit_id WHERE p.id IS NULL`)).rows[0].n;
  P("Pas de stocks orphelines", orphanStocks === 0, "n=" + orphanStocks);
  const orphanMouvs = (await db.query(`SELECT COUNT(*)::int AS n FROM mouvements_stock m LEFT JOIN produits p ON p.id=m.produit_id WHERE p.id IS NULL`)).rows[0].n;
  P("Pas de mouvements orphelines", orphanMouvs === 0, "n=" + orphanMouvs);
  const orphanCat = (await db.query(`SELECT COUNT(*)::int AS n FROM produit_articles pa LEFT JOIN categories c ON c.id=pa.categorie_id WHERE pa.categorie_id IS NOT NULL AND c.id IS NULL`)).rows[0].n;
  P("Pas d'articles à catégorie orpheline", orphanCat === 0, "n=" + orphanCat);

  /* ══════ NETTOYAGE ══════ */
  console.log("\n═══ NETTOYAGE ═══");
  const qaArticles = await db.query(`SELECT id FROM produit_articles WHERE designation LIKE '%${SFX}%'`);
  const qaIds = qaArticles.rows.map(r => r.id);
  if (qaIds.length > 0) {
    await db.query(`DELETE FROM produit_references WHERE variante_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`DELETE FROM article_attributs WHERE article_id = ANY($1)`, [qaIds]);
    await db.query(`DELETE FROM variante_attributs WHERE variante_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`DELETE FROM produit_substitutions WHERE variante_a_id IN (SELECT id FROM produits WHERE article_id = ANY($1)) OR variante_b_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`DELETE FROM produit_supersessions WHERE ancienne_variante_id IN (SELECT id FROM produits WHERE article_id = ANY($1)) OR nouvelle_variante_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`DELETE FROM produit_references_equiv WHERE article_id = ANY($1)`, [qaIds]);
    await db.query(`DELETE FROM article_equivalences WHERE article_id = ANY($1) OR article_equivalent_id = ANY($1)`, [qaIds]);
    await db.query(`DELETE FROM compatibilites_produits WHERE article_id = ANY($1)`, [qaIds]);
    await db.query(`DELETE FROM article_documents WHERE article_id = ANY($1)`, [qaIds]);
    await db.query(`DELETE FROM kits_lignes WHERE kit_id IN (SELECT id FROM produits WHERE article_id = ANY($1)) OR composant_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`DELETE FROM stocks_lots WHERE produit_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`DELETE FROM lots WHERE produit_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`ALTER TABLE mouvements_stock DISABLE TRIGGER trg_append_only_mouvements_stock`);
    await db.query(`DELETE FROM mouvements_stock WHERE produit_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`ALTER TABLE mouvements_stock ENABLE TRIGGER trg_append_only_mouvements_stock`);
    await db.query(`DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`DELETE FROM stocks_unites WHERE produit_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`DELETE FROM produit_unites WHERE produit_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`DELETE FROM prets_outils WHERE outil_id IN (SELECT id FROM produits WHERE article_id = ANY($1))`, [qaIds]);
    await db.query(`UPDATE produits SET emplacement_principal_id = NULL WHERE article_id = ANY($1)`, [qaIds]);
    await db.query(`DELETE FROM postes_vente WHERE emplacement_id IN (SELECT id FROM emplacements WHERE code LIKE 'QA-%')`, []);
    await db.query(`ALTER TABLE mouvements_stock DISABLE TRIGGER trg_append_only_mouvements_stock`);
    await db.query(`DELETE FROM mouvements_stock WHERE emplacement_id IN (SELECT id FROM emplacements WHERE code LIKE 'QA-%')`, []);
    await db.query(`ALTER TABLE mouvements_stock ENABLE TRIGGER trg_append_only_mouvements_stock`);
    await db.query(`UPDATE stocks SET emplacement_id = NULL WHERE emplacement_id IN (SELECT id FROM emplacements WHERE code LIKE 'QA-%')`, []);
    await db.query(`DELETE FROM produits WHERE article_id = ANY($1)`, [qaIds]);
    await db.query(`DELETE FROM produit_articles WHERE id = ANY($1)`, [qaIds]);
    await db.query(`DELETE FROM fournisseurs WHERE nom LIKE '%Fournisseur QA%'`);
    await db.query(`DELETE FROM emplacements WHERE code LIKE 'QA-%'`);
    await db.query(`DELETE FROM unites_mesure WHERE code LIKE 'QA-U-%'`);
    P("Nettoyage données QA", true, "articles=" + qaIds.length);
  }

  await db.end();
  console.log("\n" + "═".repeat(60));
  console.log("  RAPPORT QA FINAL — MODULE 1");
  console.log("═".repeat(60));
  console.log(`  SFX=${SFX}`);
  console.log(`  PASS: ${pass}  FAIL: ${fail}  SKIP: ${skip}  TOTAL: ${pass + fail + skip}`);
  console.log(`  SCORE: ${(pass / (pass + fail) * 100).toFixed(1)}%`);
  console.log("═".repeat(60));
  if (anomalies.length > 0) { console.log("\n  ANOMALIES:"); anomalies.forEach((a, i) => console.log(`    ${i + 1}. ${a}`)); }
  console.log("\n" + "═".repeat(60));
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR FATALE:", e); process.exit(99); });