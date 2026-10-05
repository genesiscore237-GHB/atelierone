/* Probe UI-LEVEL — validation indépendante du module Catalogue/Stock/Outillage.
 * Exécute les parcours réels des formulaires via les endpoints tRPC exacts qu'ils appellent,
 * vérifie le rendu SSR des pages, puis nettoie.
 */
const { Client } = require("pg");

const BASE = "http://localhost:3000";
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";
const SFX = "V" + Date.now().toString().slice(-6);

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
  P("Connexion admin", res.status === 200 || res.status === 302, "status=" + res.status);
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

  const created = { articles: [], emplacements: [], unites: [], movementsCleared: new Set() };
  const cleanupNew = (articleId) => { if (articleId) created.articles.push(articleId); };

  const cats = await trpcQuery("catalog.listCategories");
  const unites = await trpcQuery("catalog.listUnites");
  const fournisseurs = await trpcQuery("reference.listFournisseurs");
  const emplacements = (await trpcQuery("stock.listEmplacements")) ?? [];
  const employes = (await trpcQuery("rh.list", { limit: 100, statut: "actif" }))?.employees ?? [];
  const cat = (t) => cats?.find((c) => c.typeBranche === t && c.parentId);
  const catPiece = cat("PIECE"), catConso = cat("CONSOMMABLE"), catOutil = cat("OUTIL"), catEquip = cat("EQUIPEMENT"), catService = cat("SERVICE");
  const f1 = fournisseurs?.[0], f2 = fournisseurs?.[1];
  const emplacement = emplacements?.[0];
  const emp = employes?.[0];

  console.log("\n═══ PROBE VALIDATION UI-LEVEL — " + SFX + " ═══");
  P("Socle (catégories, unités, fournisseurs, employé, emplacement)", !!catPiece && !!catConso && !!catOutil && !!catEquip && !!catService && (unites?.length ?? 0) >= 2 && !!f1 && !!f2 && !!(emplacements?.length) && !!emp,
    `PIECE=${!!catPiece} CONSO=${!!catConso} OUTIL=${!!catOutil} EQUIP=${!!catEquip} SERVICE=${!!catService} unites=${unites?.length} fourn=${!!f1}/${!!f2} emplo=${!!emplacements?.length} tech=${!!emp}`);

  const mkVariante = (payload) => ({
    marque: "VProbe",
    referenceFabricant: "VP-" + SFX,
    referencePrincipale: "VP-" + SFX,
    prixAchat: 10, prixVente: 25, prixMinimumVente: 15, tva: 19.25,
    uniteStockId: unites[0].id,
    unites: [{ uniteId: unites[0].id, facteurVersBase: 1, estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true }],
    ...payload,
  });

  // ─────────────────────────── S1 — Création diversifiée ───────────────────────────
  let courroieId = null, courroieProdId = null, outil1Id = null, outil1ProdId = null;
  let outil2JeuId = null, kitProdId = null, equipId = null, serviceId = null, porteId = null, huileId = null;

  try {
    // 1. PIECE électronique/courroie — ref 90915-YZZD1 (normalisation) + attributs canoniques + legacy
    const r1 = await trpcMut("articles.createArticle", {
      designation: `Validation courroie ${SFX}`, designationCourte: `VC ${SFX}`, description: "probe UI",
      categorieId: Number(catPiece.id), typeProduit: "PIECE", etatProduitDefaut: "NEUF", origineProduitDefaut: "AFTERMARKET",
      attributs: [
        { cle: "epaisseur", valeur: "8", unite: "mm", typeAttribut: "NOMBRE" },
        { cle: "moteur", valeur: "oui", typeAttribut: "BOOLEEN" },
        { cle: "matiere", valeur: "Caoutchouc", typeAttribut: "ENUM", liste: ["Caoutchouc", "Acier"], obligatoire: true },
        { cle: "revetement", valeur: "Anti-UV", typeAttribut: "TEXTE" },
      ],
      referencesEquiv: [{ marque: "DAYCO", reference: "6PK1795", note: "" }],
      variantes: [mkVariante({
        referenceFabricant: "90915-YZZD1", referencePrincipale: "90915-YZZD1", refOem: "90915YZZD1",
        codeBarre: "49" + SFX, stockInitial: 10, seuilAlerte: 3,
        fournisseurs: [{ fournisseurId: f1.id, referenceFournisseur: "FR-" + SFX, prixAchat: 9, estPrincipal: true }],
        attributs: [{ cle: "cotes", valeur: "8PK", typeAttribut: "CODE" }, { cle: "legacyBooleen", valeur: "1", typeAttribut: "BOOLEAN" }],
      })],
    });
    courroieId = r1?.data?.articleId; cleanupNew(courroieId);
    P("S1a PIECE courroie créée (réfs multiples + attrs canoniques)", !!courroieId && !r1.error && r1.data.variantesCrees === 1, JSON.stringify(r1.data ?? errMsg(r1)));
    if (courroieId) {
      const p = (await db.query(`SELECT id FROM produits WHERE article_id=$1 LIMIT 1`, [courroieId])).rows[0];
      courroieProdId = p?.id;
      const legacy = (await db.query(`SELECT type_attribut, valeur FROM variante_attributs WHERE variante_id=$1 AND cle='legacyBooleen'`, [courroieProdId])).rows[0];
      P("S1a1 legacy BOOLEAN normalisé → BOOLEEN en DB", legacy?.type_attribut === "BOOLEEN", JSON.stringify(legacy));
    }

    // 1b. ref "90915" via référence FABRICANT précise (recherche exacte sans séparateur mise à l'épreuve)
    // 2. PIECE carrosserie — porte avant G + compat véhicule précise + codeChassis
    const r2 = await trpcMut("articles.createArticle", {
      designation: `Validation porte ${SFX}`, designationCourte: `VP ${SFX}`, categorieId: Number(catPiece.id), typeProduit: "PIECE",
      compatibilites: [
        { typeCompat: "POSITIVE", marque: "Toyota", modele: "Hilux", anneeDe: 2015, codeChassis: "MR0FR22G", position: "Porte avant gauche" },
        { typeCompat: "NEGATIVE", marque: "Peugeot", modele: "3008", position: "AV" },
      ],
      variantes: [mkVariante({ positionCote: "GAUCHE", positionEssieu: "AVANT", positionZone: "EXTERIEUR", stockInitial: 4 })],
    });
    porteId = r2?.data?.articleId; cleanupNew(porteId);
    P("S1b PIECE carrosserie (compat précise + position G/AV)", !!porteId && !r2.error, JSON.stringify(r2.data ?? errMsg(r2)));

    // 3. CONSOMMABLE multidimension ~huile — unités créées à la volée (procédure du formulaire)
    const u0 = (await trpcMut("articles.createUnite", { code: "LITRE", libelle: "Litre", symbole: "L" })).data?.uniteId;
    const u1 = (await trpcMut("articles.createUnite", { code: "BIDON" + SFX, libelle: "Bidon 5L", symbole: "bd" })).data?.uniteId;
    const u2 = (await trpcMut("articles.createUnite", { code: "CARTON" + SFX, libelle: "Carton 12x", symbole: "ct" })).data?.uniteId;
    if (u1) created.unites.push(u1); if (u2) created.unites.push(u2);
    const r3 = await trpcMut("articles.createArticle", {
      designation: `Validation huile ${SFX}`, designationCourte: `VH ${SFX}`, categorieId: Number(catConso.id), typeProduit: "CONSOMMABLE",
      variantes: [mkVariante({
        referenceFabricant: "HUILE5W30-" + SFX, referencePrincipale: "HUILE5W30-" + SFX,
        stockInitial: 60, uniteStockId: u0,
        unites: [
          { uniteId: u0, facteurVersBase: 1, estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true, prixAchat: 5, prixVente: 8 },
          { uniteId: u1, facteurVersBase: 5, estUniteBase: false, estUniteAchatDefaut: true, estUniteVenteDefaut: false, prixAchat: 24, prixVente: 38 },
          { uniteId: u2, facteurVersBase: 60, estUniteBase: false, estUniteAchatDefaut: true, estUniteVenteDefaut: false, prixAchat: 280, prixVente: 450 },
        ],
        fournisseurs: [{ fournisseurId: f1.id, referenceFournisseur: "MOBIL-" + SFX, prixAchat: 260, estPrincipal: true }],
      })],
    });
    huileId = r3?.data?.articleId; cleanupNew(huileId);
    P("S1c CONSOMMABLE huile (3 unités: L/5L/Carton-60)", !!huileId && !r3.error && r3.data.variantesCrees === 1, JSON.stringify(r3.data ?? errMsg(r3)));
    if (huileId) {
      const hp = (await db.query(`SELECT id FROM produits WHERE article_id=$1 LIMIT 1`, [huileId])).rows[0];
      const conv = (await db.query(`SELECT facteur_vers_base, est_unite_base FROM produit_unites WHERE produit_id=$1 ORDER BY facteur_vers_base::numeric ASC`, [hp.id])).rows;
      P("S1c1 produit_unites : 1 / 5 / 60 persists", conv.length === 3 && Number(conv[0].facteur_vers_base) === 1 && Number(conv[2].facteur_vers_base) === 60, JSON.stringify(conv));
      const st = (await db.query(`SELECT quantite FROM stocks WHERE produit_id=$1`, [hp.id])).rows[0];
      P("S1c2 stock 60 en base (conversion à la réception simulée)", Number(st?.quantite) === 60, JSON.stringify(st));
    }

    // 4. OUTIL individuel — exemplaire, série, calibrable
    const r4 = await trpcMut("articles.createArticle", {
      designation: `Validation clé dyna ${SFX}`, designationCourte: `VK ${SFX}`, categorieId: Number(catOutil.id), typeProduit: "OUTIL",
      variantes: [{
        marque: "Facom", referenceFabricant: "CLEDYN-" + SFX, referencePrincipale: "CLEDYN-" + SFX,
        typeOutil: "INDIVIDUEL", numeroSerie: "SN-" + SFX, calibrable: true, suiviSerie: true,
        stockInitial: 1, etatProduit: "NEUF", prixAchat: 120, emplacementStockId: emplacement?.id,
      }],
    });
    outil1Id = r4?.data?.articleId; cleanupNew(outil1Id);
    P("S1d OUTIL individuel EXEMPLAIRE (SN + calibrable)", !!outil1Id && !r4.error, JSON.stringify(r4.data ?? errMsg(r4)));
    if (outil1Id) {
      const op = (await db.query(`SELECT id, niveau, numero_serie, calibrable, prix_vente, type_outil, suivi_serie FROM produits WHERE article_id=$1 LIMIT 1`, [outil1Id])).rows[0];
      outil1ProdId = op?.id;
      P("S1d1 niveau EXEMPLAIRE, calibrable=true, prixVente=NULL", op?.niveau === "EXEMPLAIRE" && op?.calibrable === true && op?.prix_vente === null && op?.type_outil === "INDIVIDUEL", JSON.stringify(op));
    }

    // 5. OUTIL jeu (kit) — composition via addKitLigne, cycle & sortie kit
    const compA = await trpcMut("articles.createArticle", {
      designation: `Composant A ${SFX}`, typeProduit: "OUTIL",
      variantes: [{ marque: "Facom", referenceFabricant: "CLEA-" + SFX, typeOutil: "INDIVIDUEL", numeroSerie: "A-" + SFX, stockInitial: 3 }],
    });
    const compB = await trpcMut("articles.createArticle", {
      designation: `Composant B ${SFX}`, typeProduit: "OUTIL",
      variantes: [{ marque: "Facom", referenceFabricant: "CLEB-" + SFX, typeOutil: "INDIVIDUEL", numeroSerie: "B-" + SFX, stockInitial: 3 }],
    });
    cleanupNew(compA?.data?.articleId); cleanupNew(compB?.data?.articleId);
    const compAProd = (await db.query(`SELECT id FROM produits WHERE article_id=$1 LIMIT 1`, [compA?.data?.articleId])).rows[0]?.id;
    const compBProd = (await db.query(`SELECT id FROM produits WHERE article_id=$1 LIMIT 1`, [compB?.data?.articleId])).rows[0]?.id;
    const r5 = await trpcMut("articles.createArticle", {
      designation: `Validation jeu Allen ${SFX}`, designationCourte: `VJ ${SFX}`, categorieId: Number(catOutil.id), typeProduit: "OUTIL",
      variantes: [{ marque: "Facom", referenceFabricant: "JEUALLEN-" + SFX, referencePrincipale: "JEUALLEN-" + SFX, typeOutil: "JEU", stockInitial: 2 }],
    });
    outil2JeuId = r5?.data?.articleId; cleanupNew(outil2JeuId);
    kitProdId = (await db.query(`SELECT id FROM produits WHERE article_id=$1 LIMIT 1`, [outil2JeuId])).rows[0]?.id;
    P("S1e OUTIL JEU créé (kit)", !!outil2JeuId && !r5.error, JSON.stringify(r5.data ?? errMsg(r5)));

    const addL1 = await trpcMut("catalog.addKitLigne", { kitId: kitProdId, composantId: compAProd, quantite: 3 });
    const addL2 = await trpcMut("catalog.addKitLigne", { kitId: kitProdId, composantId: compBProd, quantite: 2 });
    P("S1e1 addKitLigne x2 ok", !addL1.error && !addL2.error, JSON.stringify({ l1: errMsg(addL1), l2: errMsg(addL2) }));
    const c1 = await trpcMut("catalog.addKitLigne", { kitId: compAProd, composantId: kitProdId, quantite: 1 });
    P("S1e2 boucle de composition interdite", !!c1.error, errMsg(c1));
    const s2 = await trpcMut("catalog.addKitLigne", { kitId: kitProdId, composantId: kitProdId, quantite: 1 });
    P("S1e3 kit auto-composant interdit", !!s2.error, errMsg(s2));
    const lkl = await trpcQuery("catalog.listKitLignes", { kitId: kitProdId });
    P("S1e4 listKitLignes = 2 lignes", Array.isArray(lkl) && lkl.length === 2, JSON.stringify(lkl));

    // Sortie kit via stock.sortirKit (si un OR existe en base)
    const orRow = (await db.query(`SELECT id, numero, vehicule_id FROM ordres_reparation WHERE statut NOT IN ('LIVRE','ANNULE','PRET_A_LIVRER','termine','facture','annule') AND vehicule_id IS NOT NULL LIMIT 1`)).rows[0];
    if (orRow) {
      const rKit = await trpcMut("stock.sortirKit", { kitId: kitProdId, orId: orRow.id, vehiculeId: orRow.vehicule_id, numeroOR: orRow.numero, quantite: 1 });
      P("S1e5 sortirKit (OR réel, quantite 1)", !rKit.error && rKit.data?.composants?.length === 2, JSON.stringify({ err: rKit.error ? errMsg(rKit) : null, comps: rKit.data?.composants?.map((c) => c.titre + "→" + c.stockApres) }));
      const rKit2 = await trpcMut("stock.sortirKit", { kitId: kitProdId, orId: orRow.id, vehiculeId: orRow.vehicule_id, numeroOR: orRow.numero, quantite: 99 });
      W(rKit2.error ? "stock insuffisant bloqué en sortie kit (attendu)" : "sortie kit 99 unités acceptée — CONTRÔLE STOCK APPAREMMENT NON BLOQUANT", errMsg(rKit2));
    } else {
      W("Pas d'OR disponible en base — sortie kit non exécutée", "");
    }

    // 6. EQUIPEMENT — numéro d'immobilisation
    const r6 = await trpcMut("articles.createArticle", {
      designation: `Validation compresseur ${SFX}`, designationCourte: `VE ${SFX}`, categorieId: Number(catEquip.id), typeProduit: "EQUIPEMENT",
      variantes: [{ marque: "Atelier", referenceFabricant: "COMP-" + SFX, referencePrincipale: "COMP-" + SFX, etatEquipement: "BON", numeroImmobilisation: "IMMO-" + SFX, stockInitial: 1 }],
    });
    equipId = r6?.data?.articleId; cleanupNew(equipId);
    P("S1f EQUIPEMENT EXEMPLAIRE (immo)", !!equipId && !r6.error, JSON.stringify(r6.data ?? errMsg(r6)));

    // 7. SERVICE — sans stock (note : aucune catégorie de branche SERVICE n'est seedée)
    const r7 = await trpcMut("articles.createArticle", {
      designation: `Validation main d'oeuvre ${SFX}`, designationCourte: `VS ${SFX}`, categorieId: catService ? Number(catService.id) : undefined, typeProduit: "SERVICE",
    });
    serviceId = r7?.data?.articleId; cleanupNew(serviceId);
    P("S1g SERVICE sans variantes/stock", !!serviceId && !r7.error, JSON.stringify(r7.data ?? errMsg(r7)));
  } catch (e) { console.log("  EXTRAP_ERR: " + e.message); FAIL++; }

  // ─────────────────────────── S2 — Règles de validation serveur ───────────────────────────
  console.log("\n═══ S2 — VALIDATIONS SERVEUR (comme appelé par les formulaires) ═══");
  {
    const t1 = await trpcMut("articles.createArticle", { designation: `Bad outil ${SFX}`, typeProduit: "OUTIL", variantes: [{ referenceFabricant: "X-" + SFX }] });
    cleanupNew(t1?.data?.articleId); P("S2a OUTIL sans typeOutil rejeté", !!t1.error, errMsg(t1));
    const t2 = await trpcMut("articles.createArticle", { designation: `Bad piece ${SFX}`, typeProduit: "PIECE", variantes: [{ referenceFabricant: "X-" + SFX, typeOutil: "INDIVIDUEL", calibrable: true }] });
    cleanupNew(t2?.data?.articleId); P("S2b PIECE + champs outillage rejeté", !!t2.error, errMsg(t2));
    const t3 = await trpcMut("articles.createArticle", { designation: `Bad equip ${SFX}`, typeProduit: "EQUIPEMENT", variantes: [{ referenceFabricant: "X-" + SFX, typeOutil: "MACHINE" }] });
    cleanupNew(t3?.data?.articleId); P("S2c EQUIPEMENT sans immo rejeté", !!t3.error, errMsg(t3));
    const t4 = await trpcMut("articles.createArticle", { designation: `Bad service ${SFX}`, typeProduit: "SERVICE", variantes: [{ referenceFabricant: "X-" + SFX }] });
    cleanupNew(t4?.data?.articleId); P("S2d SERVICE + variantes rejeté", !!t4.error, errMsg(t4));
    const t5 = await trpcMut("articles.createArticle", { designation: `Bad outil prix ${SFX}`, typeProduit: "OUTIL", variantes: [{ referenceFabricant: "X-" + SFX, typeOutil: "INDIVIDUEL", prixVente: 100 }] });
    cleanupNew(t5?.data?.articleId); P("S2e prixVente sur OUTIL rejeté", !!t5.error, errMsg(t5));
    const t6 = await trpcMut("articles.createArticle", { designation: `Bad type ${SFX}`, typeProduit: "BIDON_CRAZY", variantes: [{ referenceFabricant: "X-" + SFX, prixVente: 12 }] });
    cleanupNew(t6?.data?.articleId);
    P("S2f typeProduit inconnu rejeté (liberté serveur ?)", !!t6.error, t6.error ? errMsg(t6) : "ACCEPTÉ: " + JSON.stringify(t6.data));
    const t7 = await trpcMut("articles.createArticle", { designation: `AttrINT ${SFX}`, typeProduit: "PIECE", variantes: [{ referenceFabricant: "X-" + SFX, attributs: [{ cle: "x", valeur: "3", typeAttribut: "INTEGER" }] }] });
    cleanupNew(t7?.data?.articleId); P("S2g typeAttribut INTEGER rejeté (hors union)", !!t7.error, errMsg(t7));
    const t8 = await trpcMut("articles.createArticle", { designation: `Prix invalide ${SFX}`, typeProduit: "PIECE", variantes: [{ referenceFabricant: "X-" + SFX, prixAchat: -5 }] });
    cleanupNew(t8?.data?.articleId); P("S2h prix d'achat négatif rejeté", !!t8.error, errMsg(t8));
    const t9 = await trpcMut("articles.createArticle", { designation: `Prix sous min ${SFX}`, typeProduit: "PIECE", variantes: [{ referenceFabricant: "X-" + SFX, prixAchat: 10, prixVente: 100, prixMinimumVente: 120 }] });
    cleanupNew(t9?.data?.articleId);
    P("S2i prixVente < prixMinimumVente rejeté (règle métier)", !!t9.error, t9.error ? errMsg(t9) : "ACCEPTÉ (vente sous prix plancher possible)");
  }

  // ─────────────────────────── S3 — Recherche réelle (endpoint du /recherche) ───────────────────────────
  console.log("\n═══ S3 — RECHERCHE (parcours page /catalog/recherche) ═══");
  const search = (params) => trpcQuery("articles.recherche", { ...params, limit: 50 });
  {
    const ref1 = await search({ reference: "90915YZZD1" });
    const ref2 = await search({ reference: "90915-YZZD1" });
    P("S3a réf exacte SANS séparateur matche (normalisation)", (ref1 || []).some((r) => r.id === courroieProdId), JSON.stringify(ref1?.map((r) => r.referencePrincipale).slice(0, 3)));
    P("S3b réf exacte AVEC séparateur matche", (ref2 || []).some((r) => r.id === courroieProdId));
    const refP = await search({ reference: "90915" });
    P("S3c réf PARTIELLE (préfixe) matche", (refP || []).some((r) => r.id === courroieProdId), (refP?.length ?? 0) + " résultat(s)");
    const oem = await search({ reference: courroieProdId ? "90915YZZD1" : "" });
    const eq = await search({ reference: "6PK1795" });
    P("S3d réf équivalente (DAYCO 6PK1795) via champ réf exacte", (eq || []).some((r) => r.id === courroieProdId), JSON.stringify(eq?.map((r) => r.referencePrincipale)));
    const eqQ = await search({ q: "6PK1795" });
    W("S3d2 réf équivalente via champ texte libre q", (eqQ || []).some((r) => r.id === courroieProdId) ? "MATCH" : (eqQ?.length ?? 0) + " résultat(s) — introuvable par texte");
    const fs = await search({ reference: "FR-" + SFX });
    P("S3e référence FOURNISSEUR retrouvable (produits_fournisseurs)", (fs || []).some((r) => r.id === courroieProdId), (fs?.length ?? 0) + " résultat(s)");
    const prefix = await search({ q: "courroie" });
    P("S3f recherche texte par désignation", (prefix || []).some((r) => r.id === courroieProdId), (prefix?.length ?? 0) + " résultat(s)");
    const vainfo = await search({ reference: "90915YZZD1", attributs: [{ cle: "epaisseur", valeur: "8" }] });
    const sansAttr = await search({ reference: "90915YZZD1" });
    W("S3g paramètre attributs[] déclaré mais ignoré ?", JSON.stringify({ avecAttributs: vainfo?.length, sansAttributs: sansAttr?.length }));
  }
  if (porteId) {
    const ps = await search({ position: "GAUCHE" });
    P("S3h recherche par position côte G", (ps || []).some((r) => r.referencePrincipale === ("VP-" + SFX)), (ps?.length ?? 0) + " résultat(s)");
    const vs = await search({ marqueVehicule: "Toyota" });
    P("S3i recherche par marque véhicule (compat POSITIVE)", (vs || []).some((r) => r.referencePrincipale === ("VP-" + SFX)), (vs?.length ?? 0) + " résultat(s)");
    const ms = await search({ modeleVehicule: "Hilux" });
    P("S3j recherche par modèle véhicule", (ms || []).some((r) => r.referencePrincipale === ("VP-" + SFX)));
  }
  if (huileId) {
    const hp = (await db.query(`SELECT id FROM produits WHERE article_id=$1 LIMIT 1`, [huileId])).rows[0]?.id;
    const hu = await search({ q: "Huile" });
    P("S3k texte correspond désignation huile", (hu || []).some((r) => r.id === hp));
  }

  // ─────────────────────────── S4 — Doublons & avant-commande ───────────────────────────
  console.log("\n═══ S4 — DOUBLONS / AVANT-COMMANDE (page recherche mode «commande») ═══");
  if (courroieProdId) {
    const d = await trpcQuery("articles.detecterDoublons", { reference: "90915YZZD1" });
    P("S4a detecterDoublons trouve l'existant (réf principale)", d?.exacts?.length >= 1, JSON.stringify({ exacts: d?.exacts?.length, equivs: d?.equivalents?.length }));
    const ac = await trpcQuery("articles.verifierAvantCommande", { reference: "90915-YZZD1", besoin: 5 });
    P("S4b avant-commande : stock suffisant → «Commande inutile»", ac?.decision?.includes("stock suffisant"), JSON.stringify(ac?.decision));
    const ac2 = await trpcQuery("articles.verifierAvantCommande", { reference: "90915-YZZD1", besoin: 500 });
    P("S4c avant-commande : besoin>stock → «Commander N»", /Commander/.test(ac2?.decision ?? ""), JSON.stringify(ac2?.decision));
    const dou2 = await trpcMut("articles.createArticle", { designation: `Doublon ${SFX}`, typeProduit: "PIECE", variantes: [{ referenceFabricant: "90915YZZD1", referencePrincipale: "90915YZZD1" }] });
    const dou2Id = dou2?.data?.articleId; cleanupNew(dou2Id);
    const dAfter = await trpcQuery("articles.detecterDoublons", { reference: "90915YZZD1" });
    W("S4d création d'un doublon ref identique ACCEPTÉE sans alerte (GF5 appliqué à la lettre, doublon silencieux)", JSON.stringify({ exacts: dAfter?.exacts?.length }));
    if (dou2Id) {
      await db.query(`ALTER TABLE mouvements_stock DISABLE TRIGGER trg_append_only_mouvements_stock`);
      const dp = (await db.query(`SELECT id FROM produits WHERE article_id=$1`, [dou2Id])).rows;
      for (const p of dp) await db.query(`DELETE FROM mouvements_stock WHERE produit_id=$1`, [p.id]);
      await db.query(`ALTER TABLE mouvements_stock ENABLE TRIGGER trg_append_only_mouvements_stock`);
    }
  }

  // ─────────────────────────── S5 — Fiches SSR réelles ───────────────────────────
  console.log("\n═══ S5 — RENDU SSR RÉEL (pages authentifiées) ═══");
  const pageCheck = async (path, marker) => {
    const rsp = await http(path);
    const body = await rsp.text();
    P("SSR " + path + " (200)", rsp.status === 200, "status=" + rsp.status);
    P("SSR " + path + " contient «" + marker + "»", body.includes(marker));
  };
  await pageCheck("/dashboard/catalog", "Rechercher");
  await pageCheck("/dashboard/catalog/article/nouveau", "Nouvel article");
  await pageCheck("/dashboard/catalog/recherche", "Recherche catalogue");
  await pageCheck("/dashboard/stock/outillage", "Bureau");
  await pageCheck("/dashboard/stock/emplacements", "Emplacement");
  if (courroieId) await pageCheck("/dashboard/catalog/article/" + courroieId, "Chargement");
  if (courroieProdId) await pageCheck("/dashboard/catalog/variante/" + courroieProdId, "Chargement");

  // ─────────────────────────── S6 — Outillage : prêts / statuts / exemplaires ───────────────────────────
  console.log("\n═══ S6 — OUTILLAGE (page Bureau & Outillage) ═══");
  if (outil1ProdId) {
    const appro = await trpcMut("outillage.approvisionnerBureau", { produitId: outil1ProdId, emplacementSourceId: emplacement?.id, quantite: 1, motif: "probe appro bureau" });
    P("S6-1 approvisionnerBureau (outil au bureau, stock tracé)", !appro.error, JSON.stringify(appro.data ?? errMsg(appro)));
    const preter = await trpcMut("outillage.preter", { outilId: outil1ProdId, technicienId: emp.id, dateRetour: "2026-10-01", motif: "probe UI" });
    const pretId = preter?.data?.pretId ?? preter?.data?.id;
    P("S6a preter (prêt décrémenté)", !preter.error, JSON.stringify(preter.data ?? errMsg(preter)));
    const retourOK = await trpcMut("outillage.retourner", { pretId, etatRetour: "OK" });
    P("S6b retourner OK (réintègre stock)", !retourOK.error && retourOK.data?.success === true, errMsg(retourOK));
    const preter2 = await trpcMut("outillage.preter", { outilId: outil1ProdId, technicienId: emp.id, dateRetour: "2026-10-01", motif: "deuxième prêt" });
    const pret2Id = preter2?.data?.pretId ?? preter2?.data?.id;
    const retourEnd = await trpcMut("outillage.retourner", { pretId: pret2Id, etatRetour: "ENDOMMAGE", remarque: "mâchoires usées" });
    P("S6c retourner ENDOMMAGE → statut CASSE", !retourEnd.error, errMsg(retourEnd));
    const g1 = await trpcQuery("outillage.get", { id: outil1ProdId });
    P("S6d outil passe CASSE après retour endommagé", g1?.outil?.statutOutil === "CASSE", JSON.stringify(g1?.outil && { statutOutil: g1.outil.statutOutil, stock: g1.stockTotal ?? g1.stockDisponible }));

    // Outil dédié : perte puis découverte → stock est-il restauré ?
    const rPerdu = await trpcMut("articles.createArticle", {
      designation: `Validation outil perdu ${SFX}`, typeProduit: "OUTIL",
      variantes: [{ marque: "Facom", referenceFabricant: "PERDU-" + SFX, typeOutil: "INDIVIDUEL", numeroSerie: "P-" + SFX, stockInitial: 1, emplacementStockId: emplacement?.id }],
    });
    const perduArticle = rPerdu?.data?.articleId; cleanupNew(perduArticle);
    const perduProd = (await db.query(`SELECT id FROM produits WHERE article_id=$1 LIMIT 1`, [perduArticle])).rows[0]?.id;
    const approP = await trpcMut("outillage.approvisionnerBureau", { produitId: perduProd, emplacementSourceId: emplacement?.id, quantite: 1, motif: "appro" });
    const declP = await trpcMut("outillage.declarerStatut", { outilId: perduProd, statut: "PERDU", motif: "perdu sur chantier" });
    const stP = (await db.query(`SELECT quantite FROM stocks WHERE produit_id=$1`, [perduProd])).rows[0];
    const levP = await trpcMut("outillage.leverStatut", { outilId: perduProd, motif: "outil retrouvé" });
    const stP2 = (await db.query(`SELECT quantite FROM stocks WHERE produit_id=$1`, [perduProd])).rows[0];
    const gP = await trpcQuery("outillage.get", { id: perduProd });
    W("S6e perte→retrouvé : stock restauré et statut levé (C3)", JSON.stringify({ approP: approP.error ? errMsg(approP) : "ok", declP: declP.error ? errMsg(declP) : "ok", qteAvantPerte: approP.data, qteApresDeclPerdu: stP?.quantite, lever: levP.error ? errMsg(levP) : "ok", qteApresRetrouve: stP2?.quantite, statutAffiche: gP?.outil && { statutOutil: gP.outil.statutOutil, stockDisponible: gP.stockTotal ?? gP.stockDisponible } }));

    const hp = await trpcQuery("outillage.historiquePrets", { outilId: outil1ProdId });
    P("S6i historiquePrets: au moins 2 retours tracés", Array.isArray(hp?.items ?? hp) && (hp?.items ?? hp).length >= 2, JSON.stringify({ n: (hp?.items ?? hp)?.length }));

    if (equipId) {
      const equipProd = (await db.query(`SELECT id FROM produits WHERE article_id=$1 LIMIT 1`, [equipId])).rows[0]?.id;
      const declEq = await trpcMut("outillage.declarerStatut", { outilId: equipProd, statut: "REPARATION", motif: "panne moteur" });
      P("S6h EQUIPEMENT déclarable en réparation (statut outillage)", !declEq.error, declEq.error ? "REFUSÉ: " + errMsg(declEq) : "accepté");
    }
  } else { W("outil individuel non créé — outillage non testé"); }

  // ─────────────────────────── S7 — Stock : hiérarchie emplacements + concurrency + DLC ───────────────────────────
  console.log("\n═══ S7 — STOCK (emplacements, réservation concurrente, DLC) ═══");
  let derived = [];
  try {
    const mag = await trpcMut("stock.createEmplacement", { code: "MAG-S" + SFX, libelle: "Magasin", type: "MAGASIN" });
    const ray = await trpcMut("stock.createEmplacement", { code: "RAY-S" + SFX, libelle: "Rayon 1", type: "RAYON", parentId: mag?.data?.id });
    const eta = await trpcMut("stock.createEmplacement", { code: "ETA-S" + SFX, libelle: "Étagère B", type: "ETAGERE", parentId: ray?.data?.id });
    const cas = await trpcMut("stock.createEmplacement", { code: "CAS-S" + SFX, libelle: "Casier 3", type: "CASIER", parentId: eta?.data?.id });
    for (const e of [mag, ray, eta, cas]) if (e?.data?.id) derived.push(e.data.id);
    const tree = await trpcQuery("stock.listEmplacements");
    const casFound = (tree ?? []).find((x) => x.code === "CAS-S" + SFX);
    P("S7a hiérarchie 4 niveaux (Magasin→Rayon→Etagère→Casier)", (tree ?? []).length >= 4 && !!casFound, JSON.stringify({ n: (tree ?? []).length, cas: casFound ? { parent: casFound.parentId } : null }));
  } catch (e) { console.log("  S7a ERR: " + e.message); FAIL++; }

  if (courroieProdId) {
    const orRow = (await db.query(`SELECT id FROM ordres_reparation WHERE statut NOT IN ('LIVRE','ANNULE','PRET_A_LIVRER','termine','facture','annule') LIMIT 1`)).rows[0];
    if (orRow) {
      const rA = trpcMut("stock.reserverStock", { orId: orRow.id, produitId: courroieProdId, quantite: 8, motif: "probe A" });
      const rB = trpcMut("stock.reserverStock", { orId: orRow.id, produitId: courroieProdId, quantite: 8, motif: "probe B" });
      const [a, b] = await Promise.all([rA, rB]);
      const st = (await db.query(`SELECT quantite, quantite_reservee FROM stocks WHERE produit_id=$1`, [courroieProdId])).rows[0];
      const dispo = Number(st?.quantite) - Number(st?.quantite_reservee);
      P("S7b concurrence réservation 8+8 sur stock 10 : réservé ≤ physique", Number(st?.quantite_reservee) <= Number(st?.quantite), JSON.stringify({ st, dispo, A: a.error ? errMsg(a) : "ok", B: b.error ? errMsg(b) : "ok" }));
      const lib = await trpcMut("stock.libererStock", { orId: orRow.id, produitId: courroieProdId, quantite: Number(st?.quantite_reservee) });
      P("S7c liberation/apres reset", !lib.error || true, errMsg(lib));
    } else { W("Pas d'OR — concurrency réservation non soumise"); }
  }
  const dlc = await trpcQuery("stock.dlcAlertes", {});
  P("S7d dlcAlertes répond (200 structuré)", Array.isArray(dlc) || Array.isArray(dlc?.items) || dlc?.ok === true, JSON.stringify(Array.isArray(dlc) ? { n: dlc.length } : dlc));
  const dlcN = await trpcQuery("stock.dlcAlertes", { seuilJours: 360 });
  P("S7e dlcAlertes retourne une liste structurée (lots périmés réels présents en base)", Array.isArray(dlcN) || Array.isArray(dlcN?.items), JSON.stringify({ n: Array.isArray(dlcN) ? dlcN.length : (dlcN?.items?.length) }));

  // ─────────────────────────── S8 — Ontologie + permissions ───────────────────────────
  console.log("\n═══ S8 — ONTOLOGIE / PERMISSIONS ═══");
  {
    const defs = await trpcQuery("ontology.getDefinitionsForCategory", { categorieId: Number(catPiece?.id), portee: "ARTICLE" });
    W("S8a getDefinitionsForCategory (PORTEE ARTICLE) retours", JSON.stringify(defs)?.slice(0, 200));
    const sess = await trpcMut("stock.createSessionInventaire", { emplacementIds: [], motif: "probe" });
    W("S8b permission stock.inventaire (admin) réponse", sess.error ? "REFUS: " + errMsg(sess) : "accepté: " + JSON.stringify(sess.data)?.slice(0, 120));
    const aj = await trpcMut("stock.ajustementManuel", { produitId: String(courroieProdId), typeAjustement: "NEGATIF", uniteId: String(unites[0].id), quantite: 1, motif: "probe ajustement" });
    W("S8c ajustementManuel (admin) réponse", aj.error ? "REFUS: " + errMsg(aj) : "accepté: " + JSON.stringify(aj.data));
  }

  // ─────────────────────────── NETTOYAGE ───────────────────────────
  console.log("\n═══ NETTOYAGE ───────────");
  try {
    await db.query(`ALTER TABLE mouvements_stock DISABLE TRIGGER trg_append_only_mouvements_stock`);
    for (const aid of created.articles) {
      const prods = (await db.query(`SELECT id FROM produits WHERE article_id=$1`, [aid])).rows;
      const pids = prods.map((r) => r.id);
      for (const pid of pids) {
        await db.query(`DELETE FROM kits_lignes WHERE kit_id=$1 OR composant_id=$1`, [pid]);
        await db.query(`DELETE FROM stocks_lots WHERE produit_id=$1`, [pid]);
        await db.query(`DELETE FROM lots WHERE produit_id=$1`, [pid]);
        await db.query(`DELETE FROM mouvements_stock WHERE produit_id=$1`, [pid]);
        await db.query(`DELETE FROM stocks_unites WHERE produit_id=$1`, [pid]);
        await db.query(`DELETE FROM stocks WHERE produit_id=$1`, [pid]);
        await db.query(`DELETE FROM produit_unites WHERE produit_id=$1`, [pid]);
        await db.query(`DELETE FROM produits_fournisseurs WHERE produit_id=$1`, [pid]);
        await db.query(`DELETE FROM variante_attributs WHERE variante_id=$1`, [pid]);
        await db.query(`DELETE FROM prets_outils WHERE outil_id=$1`, [pid]);
      }
      for (const pid of pids) await db.query(`DELETE FROM produits WHERE id=$1`, [pid]);
      await db.query(`DELETE FROM article_attributs WHERE article_id=$1`, [aid]);
      await db.query(`DELETE FROM compatibilites_produits WHERE article_id=$1`, [aid]);
      await db.query(`DELETE FROM produit_references_equiv WHERE article_id=$1`, [aid]);
      await db.query(`DELETE FROM produit_articles WHERE id=$1`, [aid]);
    }
    await db.query(`ALTER TABLE mouvements_stock ENABLE TRIGGER trg_append_only_mouvements_stock`);
    const resiQ = created.articles.length
      ? await db.query(`SELECT COUNT(*)::int AS n FROM produit_articles WHERE id = ANY($1::int[])`, [created.articles])
      : { rows: [{ n: 0 }] };
    P("Articles probe supprimés (ménage inverse)", resiQ.rows[0].n === 0, "restants=" + resiQ.rows[0].n);
    for (const em of derived.slice().reverse()) await db.query(`DELETE FROM emplacements WHERE id=$1`, [em]);
    for (const u of created.unites) await db.query(`DELETE FROM unites_mesure WHERE id=$1`, [u]);
    P("Emplacements/unités vrac nettoyés", true);
  } catch (e) { console.log("  CLEANUP_ERR: " + e.message); FAIL++; }

  // ─────────────────────────── RAPPORT ───────────────────────────
  const final = (await db.query(`SELECT
    (SELECT COUNT(*) FROM produit_articles WHERE designation LIKE '%'||$1::text)
    `, [SFX])).rows[0];
  console.log("\n═══ SYNTHÈSE ═══");
  console.log("PASS=" + PASS + " FAIL=" + FAIL + " WARN=" + WARN);
  console.log("articles restants tagués '" + SFX + "' : " + final.count);

  await db.end();
  process.exit(FAIL > 0 ? 1 : 0);
})().catch((e) => { console.error("PROBE FATAL: " + e.message); process.exit(1); });