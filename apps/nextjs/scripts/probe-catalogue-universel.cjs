/* PROBE CATALOGUE UNIVERSEL — cas réel « Batterie AGM Start&Stop 70 Ah ».
 * Parcourt le parcours du wizard (mêmes endpoints tRPC que l'interface) :
 *  - Catégorie « Borne de recharge véhicule électrique » SANS modification de code
 *    (définitions UNIT_VALUE / RANGE / VEHICLE_REFERENCE / DATETIME / LONG_TEXT)
 *  - Article Batterie AGM 70Ah + variante 70Ah/760A (stock initial tracé LOT + INITIAL_RECEIPT + audits)
 *  - Doublons multi-stratégies AVANT création (caractéristiques/nom → VARTA) puis APRÈS (réf exacte/croisée)
 *  - 2e variante 80Ah/800A : variantes distinctes JAMAIS fusionnées (GF5)
 *  - Recherche combinée expliquée + marges serveur + valeur_normalisee.
 */
const { Client } = require("pg");

const BASE = "http://localhost:3000";
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";
const SFX = "U" + Date.now().toString().slice(-7);

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

  console.log("\n═══ PROBE CATALOGUE UNIVERSEL — " + SFX + " ═══");

  // ── Socle référentiel ──
  const cats = await trpcQuery("catalog.listCategories");
  const unites = (await trpcQuery("reference.listUnitesMesure")) ?? [];
  const unitPieces = unites[0];
  const unitV = unites.find((u) => /^V$/.test(u.code) || /VOLT/i.test(u.code + " " + u.symbole));
  const unitAh = unites.find((u) => /^AH$/i.test(u.code) || /AMPERE?-HEURE/i.test(u.libelle));
  const unitA = unites.find((u) => /^A$/.test(u.code) && !/^AH$/i.test(u.code));
  const unitKg = unites.find((u) => /^KG$/i.test(u.code));
  const unitKW = unites.find((u) => /^KW$/i.test(u.code));
  const catBatt = cats?.find((c) => c.code === "DEMO-BATTERIES");
  P("Socle unités (pièce, V, Ah, A, kg, kW) + catégorie DEMO-BATTERIES",
    !!(unitPieces && unitV && unitAh && unitA && unitKg && unitKW && catBatt),
    `units=${unites?.length} catBatt=${catBatt?.id}`);

  // ── §1 Catégorie « Borne de recharge véhicule électrique » SANS modification de code ──
  let borneId = null;
  const found = cats?.find((c) => c.code === "DEMO-UNI-BORNE");
  if (found) {
    borneId = Number(found.id);
    W("Catégorie Borne déjà présente, réutilisée", borneId);
  } else {
    const r = await trpcMut("catalog.createCategory", {
      nom: "Borne de recharge véhicule électrique",
      code: "DEMO-UNI-BORNE",
      description: "Créée depuis l'interface (wizard) — aucune modification de code nécessaire (catalogue universel).",
      parentId: catBatt ? String(catBatt.id) : undefined,
      niveauOntologie: "CATEGORIE",
    });
    borneId = r?.data?.id ? Number(r.data.id) : null;
    P("§1 Catégorie « Borne de recharge VE » créée via l'API de l'UI", !!borneId && !r.error, "id=" + borneId + (r.error ? " " + errMsg(r) : ""));
  }

  // ── §2 Attributs NOUVEAUX TYPES via l'UI (upsert ontologie, chemin du wizard) ──
  const BORNES = [
    { cle: "puissance_max", libelle: "Puissance de charge max", typeAttribut: "UNIT_VALUE", uniteId: unitKW?.id, precision: 1, min: 3.7, max: 350, filtrable: true, searchable: true, comparable: true },
    { cle: "plage_puissance", libelle: "Plage de puissance (min;max)", typeAttribut: "RANGE", uniteId: unitKW?.id, min: 3.7, max: 22, filtrable: true },
    { cle: "connecteur", libelle: "Type de connecteur", typeAttribut: "VEHICLE_REFERENCE", liste: ["Type 2", "CCS Combo 2", "CHAdeMO", "Type 1", "GBT"], searchable: true, filtrable: true },
    { cle: "date_mise_service", libelle: "Date de mise en service", typeAttribut: "DATETIME", comparable: true },
    { cle: "observations_installation", libelle: "Observations d'installation", typeAttribut: "LONG_TEXT" },
  ];
  let upserted = 0;
  for (const a of BORNES) {
    const r = await trpcMut("ontology.upsertDefinition", {
      categorieId: borneId, portee: "ARTICLE", cle: a.cle, libelle: a.libelle,
      typeAttribut: a.typeAttribut, liste: a.liste ?? [], uniteId: a.uniteId, precision: a.precision,
      min: a.min, max: a.max, filtrable: a.filtrable ?? false, searchable: a.searchable ?? false,
      comparable: a.comparable ?? false, obligatoire: false, isActive: true,
    });
    if (r?.data?.id) upserted++;
    else if (r.error) console.log("    upsert " + a.cle + " → " + errMsg(r));
  }
  P("§2 5 définitions avec NOUVEAUX types (UNIT_VALUE, RANGE, VEHICLE_REFERENCE, DATETIME, LONG_TEXT) upsertées",
    upserted === 5, `upserted=${upserted}`);
  const resolve = await trpcQuery("ontology.getDefinitionsForCategory", { categorieId: borneId, portee: "ARTICLE" });
  const newTypes = (resolve?.definitions ?? []).map((d) => d.typeAttribut).sort().join(",");
  P("§2 Résolution ontologique : nouveaux types restitués par le moteur",
    (resolve?.definitions?.length ?? 0) === 5 && ["UNIT_VALUE", "RANGE", "VEHICLE_REFERENCE", "DATETIME", "LONG_TEXT"].every((t) => newTypes.includes(t)),
    newTypes);
  const dbTypes = (await db.query(`SELECT type_attribut FROM attribut_definitions WHERE categorie_id=$1 ORDER BY type_attribut`, [borneId])).rows;
  P("§2 Types persistés en base (CHECK élargi, migration catalogue-universel-v2)",
    dbTypes.length === 5 && dbTypes.every((r) => ["UNIT_VALUE", "RANGE", "VEHICLE_REFERENCE", "DATETIME", "LONG_TEXT"].includes(r.type_attribut)),
    dbTypes.map((r) => r.type_attribut).join(","));

  // ── §3 Article Batterie AGM Start&Stop 70 Ah (variante 70Ah/760A/12V) ──
  const ref70 = "BAT-AGM-70-" + SFX;
  const ref76 = "BAT-AGM-70-760-" + SFX;
  const designation = `Batterie AGM Start&Stop 70 Ah ${SFX}`;
  const AVANT = await trpcQuery("articles.detecterDoublons", {
    reference: ref70,
    nom: "Batterie AGM Start&Stop 70 Ah",
    marque: "DEMOBAT",
    categorieId: Number(catBatt.id),
    caracteristiques: [
      { cle: "technologie", valeur: "AGM" },
      { cle: "tension_nominale", valeur: "12" },
      { cle: "capacite", valeur: "70" },
      { cle: "courant_cca", valeur: "760" },
    ],
  });
  P("§4 AVANT création : doublons détectés sur l'existant (caractéristiques + nom)",
    (AVANT?.strategies?.caracteristiques ?? 0) > 0 && (AVANT?.strategies?.nomSimilaire ?? 0) > 0,
    `carac=${AVANT?.strategies?.caracteristiques} nom=${AVANT?.strategies?.nomSimilaire} proba=${AVANT?.probabilite}`);
  const vartaCandidat = (AVANT?.candidats ?? []).some((c) => /VARTA/.test(c.marque ?? ""));
  P("§4 La référence VARTA 570 901 06x apparaît comme candidat DOUBLON",
    vartaCandidat,
    (AVANT?.candidats ?? []).map((c) => `${c.marque} ${c.referencePrincipale}`).join(" | "));

  const r70 = await trpcMut("articles.createArticle", {
    designation,
    designationCourte: "BAT AGM 70 " + SFX,
    description: "Démo catalogue universel : batterie AGM Start&Stop créée via le wizard en 8 étapes.",
    categorieId: Number(catBatt.id),
    typeProduit: "PIECE",
    etatProduitDefaut: "NEUF",
    origineProduitDefaut: "AFTERMARKET",
    attributs: [
      { cle: "technologie", valeur: "AGM", typeAttribut: "ENUM" },
      { cle: "tension_nominale", valeur: "12", unite: "V", typeAttribut: "NOMBRE" },
      { cle: "capacite", valeur: "70", unite: "Ah", typeAttribut: "NOMBRE" },
      { cle: "courant_cca", valeur: "760", unite: "A", typeAttribut: "NOMBRE" },
      { cle: "poids", valeur: "18.5", unite: "kg", typeAttribut: "DECIMAL", precision: 1 },
    ],
    variantes: [{
      marque: "DEMOBAT",
      referenceFabricant: ref70,
      referencePrincipale: ref70,
      prixAchat: 45000, prixVente: 85000, prixMinimumVente: 60000, tva: 19.25,
      uniteStockId: unitPieces.id,
      unites: [{ uniteId: unitPieces.id, facteurVersBase: 1, estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true }],
      fournisseurs: [{ fournisseurId: (await trpcQuery("reference.listFournisseurs"))?.[0]?.id, referenceFournisseur: "FR-AGM70-" + SFX, prixAchat: 42000, estPrincipal: true }],
      codeBarre: "EAN-" + SFX,
      stockInitial: 12,
      numeroLot: "LOT-BAT-" + SFX,
      suiviLot: true,
      etatProduit: "NEUF", origineProduit: "AFTERMARKET",
      positionCote: "GAUCHE", positionEssieu: "N_A", positionEmplacement: "MOTEUR",
      attributs: [
        { cle: "technologie", valeur: "AGM", typeAttribut: "ENUM" },
        { cle: "tension_nominale", valeur: "12", unite: "V", typeAttribut: "NOMBRE" },
        { cle: "capacite", valeur: "70", unite: "Ah", typeAttribut: "NOMBRE" },
        { cle: "courant_cca", valeur: "760", unite: "A", typeAttribut: "NOMBRE" },
      ],
    }],
    compatibilites: [
      { typeCompat: "POSITIVE", marque: "Toyota", modele: "RAV4", anneeDe: 2020, anneeA: 2026, motorisation: "2.0", carburant: "ESSENCE" },
      { typeCompat: "POSITIVE", marque: "BMW", modele: "Série 3", anneeDe: 2018, anneeA: 2026, motorisation: "2.0" },
      { typeCompat: "POSITIVE", marque: "Mercedes-Benz", modele: "Classe C", anneeDe: 2021, anneeA: 2026, motorisation: "1.5" },
    ],
    referencesEquiv: [
      { marque: "Fabricant-B", reference: "AGM70-760-" + SFX, note: "Équivalence commerciale (non vérifiée OEM)" },
      { marque: "Fabricant-C", reference: "H6-AGM-70-" + SFX, note: "Équivalence commerciale (non vérifiée OEM)" },
    ],
  });
  const articleId = r70?.data?.articleId ?? null;
  P("§3 Article « Batterie AGM Start&Stop 70 Ah » créé (wizard → createArticle)", !!articleId && !r70.error, `articleId=${articleId} ${errMsg(r70)}`);
  if (!articleId) { console.log("\nRÉSULTAT: " + PASS + " PASS / " + FAIL + " FAIL / " + WARN + " WARN"); await db.end(); process.exit(FAIL ? 1 : 0); }

  const [v70] = (await db.query(`SELECT id, reference_principale, prix_vente FROM produits WHERE article_id=$1 ORDER BY id LIMIT 1`, [articleId])).rows;
  P("§3 Variante 70Ah/760A créée (SKU unique)", !!v70, JSON.stringify({ id: v70?.id, ref: v70?.reference_principale }));

  // ── Référence croisée + valeur_normalisee ──
  const cr = await trpcMut("articles.addReference", { varianteId: v70.id, typeRef: "FABRICANT", valeur: ref76, isPrincipale: false });
  P("§3 Référence croisée ajoutée (multi-référentiel)", !!cr && !cr.error && cr.data?.success !== false, errMsg(cr));
  const [vref] = (await db.query(`SELECT valeur, valeur_normalisee FROM produit_references WHERE variante_id=$1 AND valeur=$2`, [v70.id, ref76])).rows;
  P("§3 valeur_normalisee persistée (recherche normalisée)", !!vref && vref.valeur_normalisee === ref76.toLowerCase().replace(/[^a-z0-9]/g, ""), `norm=${vref?.valeur_normalisee}`);

  // ── Stock initial tracé : lot + INITIAL_RECEIPT + audits ──
  const [mvt] = (await db.query(`SELECT type, sens, quantite, lot_id FROM mouvements_stock WHERE produit_id=$1 ORDER BY id DESC LIMIT 1`, [v70.id])).rows;
  P("§3 Stock initial = mouvement INITIAL_RECEIPT (Entrée 12)", !!mvt && mvt.type === "INITIAL_RECEIPT" && mvt.sens === "E" && Number(mvt.quantite) === 12, JSON.stringify(mvt));
  const [stock] = (await db.query(`SELECT quantite FROM stocks WHERE produit_id=$1`, [v70.id])).rows;
  const [lstock] = (await db.query(`SELECT quantite FROM stocks_lots sl JOIN lots l ON l.id=sl.lot_id WHERE sl.produit_id=$1 AND l.numero_lot=$2`, [v70.id, "LOT-BAT-" + SFX])).rows;
  P("§3 Stock physique 12 + lot associé (stocks_lots)", !!stock && Number(stock.quantite) === 12 && !!lstock && Number(lstock.quantite) === 12, "stock=" + stock?.quantite + " lot=" + lstock?.quantite);
  const audits = (await db.query(`SELECT action FROM audit_logs WHERE entity_id=$1 AND action IN ('ARTICLE_CREATED','VARIANTE_CREATED','STOCK_INITIALIZED') ORDER BY action`, [v70.id])).rows;
  const audArt = (await db.query(`SELECT action, details FROM audit_logs WHERE entity_type='article' AND entity_id=$1 AND action='ARTICLE_CREATED'`, [articleId])).rows;
  P("§3 Audits tracés (VARIANTE_CREATED + STOCK_INITIALIZED sur variante, ARTICLE_CREATED sur article)",
    audits.length === 2 && audArt.length === 1,
    JSON.stringify(audits.map((a) => a.action)) + " + " + JSON.stringify(audArt.map((a) => a.action)));

  // ── Marges serveur ──
  const gv = await trpcQuery("articles.getVariante", { varianteId: v70.id });
  P("§3 Marges calculées côté serveur (getVariante)", !!gv?.marges && gv.marges.margeUnitaire === 40000 && gv.marges.prixVenteTTC === 101362.5,
    JSON.stringify(gv?.marges));
  const attrs70 = (gv?.attributs ?? []).filter((x) => ["capacite", "courant_cca", "technologie"].includes(x.cle));
  P("§3 Attributs dynamiques de la variante restitués (70Ah / 760A / AGM)", attrs70.length === 3, JSON.stringify(attrs70.map((a) => `${a.cle}=${a.valeur}${a.unite ?? ""}`)));
  const ga = await trpcQuery("articles.getArticle", { id: articleId });
  const poidsAttr = (ga?.attributs ?? []).find((x) => x.cle === "poids");
  P("§3 Attributs d'article restitués (poids DECIMAL 18.5 → niveau article, Z00 70Ah partagé)",
    !!poidsAttr && Number(poidsAttr.valeur) === 18.5 && poidsAttr.typeAttribut === "DECIMAL",
    JSON.stringify(poidsAttr ?? null));

  // ── §5 Doublons APRÈS création (réf exacte + croisée) ──
  const APRES = await trpcQuery("articles.detecterDoublons", {
    reference: ref70,
    nom: "Batterie AGM Start&Stop 70 Ah",
    marque: "DEMOBAT",
    categorieId: Number(catBatt.id),
    caracteristiques: [
      { cle: "technologie", valeur: "AGM" },
      { cle: "tension_nominale", valeur: "12" },
      { cle: "capacite", valeur: "70" },
      { cle: "courant_cca", valeur: "760" },
    ],
  });
  P("§5 APRÈS création : référence exacte signalée (probabilité FORTE)", APRES?.strategies?.referenceExacte >= 1 && APRES?.probabilite === "FORTE",
    `exact=${APRES?.strategies?.referenceExacte} candidats=${APRES?.candidats?.length} proba=${APRES?.probabilite}`);
  P("§5 GF5 : Aucune fusion automatique — la variante créée reste distincte",
    (APRES?.candidats ?? []).find((c) => c.id === v70.id)?.referencePrincipale === ref70 && /jamais fusionn/.test(APRES?.note ?? ""),
    APRES?.note);
  const CROISE = await trpcQuery("articles.detecterDoublons", { reference: ref76, marque: "DEMOBAT" });
  P("§5 Référence croisée reconnue par valeur_normalisee (réf retrouvée par rencontre croisée)",
    (CROISE?.strategies?.referenceCroisee ?? 0) >= 1, `croisées=${CROISE?.strategies?.referenceCroisee}`);

  // ── §6 2e variante 80 Ah / 800 A — variantes distinctes, jamais fusionnées ──
  const ref80 = "BAT-AGM-80-" + SFX;
  const r80 = await trpcMut("articles.addVariante", {
    articleId,
    variante: {
      marque: "DEMOBAT", referenceFabricant: ref80, referencePrincipale: ref80,
      prixAchat: 52000, prixVente: 99000, prixMinimumVente: 70000, tva: 19.25,
      uniteStockId: unitPieces.id,
      unites: [{ uniteId: unitPieces.id, facteurVersBase: 1, estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true }],
      codeBarre: "EAN80-" + SFX, stockInitial: 6, numeroLot: "LOT-BAT80-" + SFX, suiviLot: true,
      etatProduit: "NEUF", origineProduit: "AFTERMARKET",
      attributs: [
        { cle: "technologie", valeur: "AGM", typeAttribut: "ENUM" },
        { cle: "tension_nominale", valeur: "12", unite: "V", typeAttribut: "NOMBRE" },
        { cle: "capacite", valeur: "80", unite: "Ah", typeAttribut: "NOMBRE" },
        { cle: "courant_cca", valeur: "800", unite: "A", typeAttribut: "NOMBRE" },
      ],
    },
  });
  const v80id = r80?.data?.varianteId ?? null;
  P("§6 2e variante 80Ah/800A créée (addVariante)", !!v80id && !r80.error, `id=${v80id} ${errMsg(r80)}`);
  const both = (await db.query(`SELECT reference_principale FROM produits WHERE article_id=$1 ORDER BY reference_principale`, [articleId])).rows;
  P("§6 Les 2 variantes restent distinctes sous le même article (2 SKU, jamais fusionnés)",
    both.length === 2 && both.some((r) => r.reference_principale === ref70) && both.some((r) => r.reference_principale === ref80),
    both.map((r) => r.reference_principale).join(" + "));
  const D80 = await trpcQuery("articles.detecterDoublons", {
    reference: ref80, nom: "Batterie AGM Start&Stop 80 Ah", marque: "DEMOBAT",
    categorieId: Number(catBatt.id),
    caracteristiques: [{ cle: "capacite", valeur: "80" }, { cle: "technologie", valeur: "AGM" }],
  });
  P("§6 Doublon 70Ah/80Ah signalé (mêmes caractéristiques AGM) SANS fusion — l'utilisateur décide (GF5)",
    (D80?.candidats ?? []).some((c) => c.id === v70.id) && (D80?.probabilite === "MOYENNE" || D80?.probabilite === "FORTE"),
    `probabilite=${D80?.probabilite} candidats=${D80?.candidats?.map((c) => `${c.referencePrincipale}(${c.raisons?.length})`).join(" | ")}`);

  // ── §7 Recherche combinée expliquée ──
  const R1 = await trpcQuery("articles.recherche", { marqueVehicule: "Toyota", modeleVehicule: "RAV4", motorisation: "2.0", attributs: [{ cle: "capacite", valeur: "70" }] });
  const hitR1 = (R1 ?? []).find((r) => r.id === v70.id);
  P("§7 Recherche combinée véhicule+caractéristique (RAV4 + capacité 70Ah)", !!hitR1,
    (hitR1?.explications ?? []).join(" ; ") || "aucun");
  P("§7 Explications structurées servies au client (compat + caractéristique)",
    !!hitR1 && (hitR1.explications ?? []).some((e) => /Compatible véhicule.*Toyota.*RAV4/.test(e)) && (hitR1.explications ?? []).some((e) => e.includes("capacite: 70")),
    JSON.stringify(hitR1?.explications ?? []));
  const R2 = await trpcQuery("articles.recherche", { reference: ref70, attributs: [{ cle: "technologie", valeur: "AGM" }] });
  const hitR2 = (R2 ?? []).find((r) => r.id === v70.id);
  P("§7 Recherche par référence exacte + technologie AGM", !!hitR2 && /Référence exacte/.test(hitR2.explications?.[0] ?? ""),
    JSON.stringify((hitR2?.explications ?? []).slice(0, 2)));
  const R3 = await trpcQuery("articles.recherche", { reference: ref76 });
  const hitR3 = (R3 ?? []).find((r) => r.id === v70.id);
  P("§7 Réf. croisée retrouvée par recherche (FABRICANT multi-référentiel = croisée)", !!hitR3 && /croisée/.test(hitR3.explications?.[0] ?? ""),
    hitR3?.explications?.[0] ?? "aucune");
  const R4 = await trpcQuery("articles.recherche", { q: "BAT-AGM-70", attributs: [{ cle: "courant_cca", valeur: "760" }] });
  const hitR4 = (R4 ?? []).find((r) => r.id === v70.id);
  P("§7 Recherche textuelle + caractéristique 760A (le résumé explique chaque critère)",
    !!hitR4 && (hitR4.explications ?? []).some((e) => /Texte/.test(e)) && (hitR4.explications ?? []).some((e) => e.includes("courant_cca: 760")),
    JSON.stringify((hitR4?.explications ?? []).slice(0, 3))); 

  // ── §8 Catégorie Borne : produit réel avec les NOUVEAUX types ──
  const rBorne = await trpcMut("articles.createArticle", {
    designation: "Borne de recharge 22 kW Type 2 " + SFX,
    designationCourte: "BORNE-22 " + SFX,
    description: "Démo : catégorie nouvelle sans modification de code, attributs UNIT_VALUE/RANGE/DATETIME/LONG_TEXT.",
    categorieId: borneId,
    typeProduit: "PIECE",
    attributs: [
      { cle: "puissance_max", valeur: "22", unite: "kW", typeAttribut: "UNIT_VALUE" },
      { cle: "plage_puissance", valeur: "3.7;22", unite: "kW", typeAttribut: "RANGE" },
      { cle: "connecteur", valeur: "Type 2", typeAttribut: "VEHICLE_REFERENCE" },
      { cle: "date_mise_service", valeur: "2026-06-01T10:30:00", typeAttribut: "DATETIME" },
      { cle: "observations_installation", valeur: "Montage mural, raccord triphasé 400 V.", typeAttribut: "LONG_TEXT" },
    ],
    variantes: [{
      marque: "GreenUP", referenceFabricant: "BORNE-22-" + SFX, referencePrincipale: "BORNE-22-" + SFX,
      prixAchat: 285000, prixVente: 465000, tva: 19.25,
      uniteStockId: unitPieces.id,
      unites: [{ uniteId: unitPieces.id, facteurVersBase: 1, estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true }],
      stockInitial: 2, etatProduit: "NEUF", origineProduit: "AFTERMARKET",
    }],
  });
  const borneArticle = rBorne?.data?.articleId ?? null;
  P("§8 Produit réel créé sous la NOUVELLE catégorie (attributs nouveaux types persistés)", !!borneArticle && !rBorne.error, `articleId=${borneArticle} ${errMsg(rBorne)}`);
  if (borneArticle) {
    const [bv] = (await db.query(`SELECT id FROM produits WHERE article_id=$1 LIMIT 1`, [borneArticle])).rows;
    const valAttrs = (await db.query(`SELECT cle, valeur, unite, type_attribut FROM article_attributs WHERE article_id=$1 ORDER BY cle`, [borneArticle])).rows;
    const ok = valAttrs.length === 5
      && valAttrs.find((a) => a.cle === "puissance_max")?.type_attribut === "UNIT_VALUE" && valAttrs.find((a) => a.cle === "puissance_max")?.valeur === "22"
      && valAttrs.find((a) => a.cle === "plage_puissance")?.type_attribut === "RANGE" && valAttrs.find((a) => a.cle === "plage_puissance")?.valeur === "3.7;22"
      && valAttrs.find((a) => a.cle === "connecteur")?.type_attribut === "VEHICLE_REFERENCE"
      && valAttrs.find((a) => a.cle === "date_mise_service")?.type_attribut === "DATETIME"
      && valAttrs.find((a) => a.cle === "observations_installation")?.type_attribut === "LONG_TEXT";
    P("§8 Valeurs UNIT_VALUE / RANGE / VEHICLE_REFERENCE / DATETIME / LONG_TEXT persistées au niveau article",
      ok, valAttrs.map((a) => `${a.cle}:${a.type_attribut}=${a.valeur}`).join(" | "));
    const RB = await trpcQuery("articles.recherche", { q: "Borne de recharge 22" });
    P("§8 La nouvelle catégorie est pleinement recherchable sans ajout de code", (RB ?? []).length > 0, `hits=${(RB ?? []).length}`);
  }

  console.log("\n═══ RÉSULTAT CATALOGUE UNIVERSEL: " + PASS + " PASS / " + FAIL + " FAIL / " + WARN + " WARN ═══");
  await db.end();
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error("Erreur fatale:", e); process.exit(2); });