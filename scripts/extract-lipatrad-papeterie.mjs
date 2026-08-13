#!/usr/bin/env node
/**
 * Extraction + classification du dump papeterie (atelierone_mvogada.sql)
 * vers le format d'import canonique JSONL du système (packages/db/src/import).
 *
 * Entrées : DOC/donnéés papeterie/atelierone_mvogada.sql
 * Sorties : DOC/donnéés papeterie/import-atelierone/
 *   - unites.jsonl, categories.jsonl, editeurs.jsonl, fournisseurs.jsonl,
 *     produits.jsonl, manuels.jsonl, produits_unites.jsonl,
 *     produits_fournisseurs.jsonl, rejets-produits.jsonl, RAPPORT-IMPORT.md
 *
 * Usage : node scripts/extract-atelierone-papeterie.mjs
 * Aucune écriture en base : les fichiers sont validés ensuite par
 *   pnpm -F @atelierone/db import:validate <entite> <fichier>  (schéma)
 *   pnpm -F @atelierone/db import:catalogue <dossier> [--apply] (import réel)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DUMP = join(ROOT, "DOC", "donnéés papeterie", "atelierone_mvogada.sql");
const OUT_DIR = join(ROOT, "DOC", "donnéés papeterie", "import-atelierone");

/* ============================================================
 * 1. Lecture + réparation du dump
 * ============================================================ */

let raw = readFileSync(DUMP, "utf8");

// La ligne 'BATHPHPRGE2' du dump est corrompue (blob binaire au milieu de la
// ligne). On la reconstruit à partir de la partie intacte du tuple.
raw = raw.replace(
  /\(\s*'BATHPHPRGE2'[\s\S]*?0, 1, 0, 0, ''\),/,
  `('BATHPHPRGE2', 'Basic themes in physical and pratical geography form 2', 2, -1, 5280, 5500, 0, 11, '', 0, 0, 10, 5, 20, 4400, 0, 5, 0, 0, ''),`,
);

/** Répare le mojibake latin1/UTF-8 (accents français doublement encodés). */
function fixMojibake(s) {
  if (!s) return s;
  return s
    .replace(/ÃƒÂ¨/g, "è").replace(/ÃƒÂ©/g, "é").replace(/ÃƒÂ´/g, "ô")
    .replace(/ÃƒÂ¢/g, "â").replace(/ÃƒÂª/g, "ê").replace(/ÃƒÂ®/g, "î")
    .replace(/ÃƒÂ¹/g, "ù").replace(/ÃƒÂ§/g, "ç").replace(/ÃƒÂ /g, "à")
    .replace(/Ã¨/g, "è").replace(/Ã©/g, "é").replace(/Ã´/g, "ô")
    .replace(/Ã¢/g, "â").replace(/Ãª/g, "ê").replace(/Ã®/g, "î")
    .replace(/Ã¹/g, "ù").replace(/Ã§/g, "ç").replace(/Ã /g, "à")
    .replace(/Â/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Découpe les valeurs d'un tuple SQL en tenant compte des quotes/échappements. */
function parseTupleValues(tuple) {
  const out = [];
  let cur = "";
  let inStr = false;
  for (let i = 0; i < tuple.length; i++) {
    const c = tuple[i];
    if (!inStr) {
      if (c === ",") { out.push(cur.trim()); cur = ""; continue; }
      if (c === "'") { inStr = true; continue; }
      if (c === " " || c === "\n" || c === "\r" || c === "\t") continue;
      cur += c;
      continue;
    }
    if (c === "\\") { cur += c + (tuple[i + 1] ?? ""); i++; continue; }
    if (c === "'") {
      if (tuple[i + 1] === "'") { cur += "'"; i++; continue; }
      inStr = false;
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Extrait les tuples d'un bloc INSERT ... VALUES ...; */
function parseInsert(body) {
  const rows = [];
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf("(", i);
    if (open < 0) break;
    let j = open + 1;
    let depth = 1;
    let inStr = false;
    let esc = false;
    for (; j < body.length && depth > 0; j++) {
      const c = body[j];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (c === "'") {
          if (body[j + 1] === "'") { j++; continue; }
          inStr = false;
        }
        continue;
      }
      if (c === "'") { inStr = true; continue; }
      if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    rows.push(parseTupleValues(body.slice(open + 1, j - 1)));
    i = j;
  }
  return rows;
}

/** Extrait le corps d'une instruction INSERT (tout après 'VALUES'). */
function insertBodyOf(sql) {
  const start = sql.indexOf("VALUES");
  if (start < 0) return "";
  const end = sql.lastIndexOf(";");
  return sql.slice(start + 6, end < 0 ? sql.length : end);
}

function tableInserts(raw, table) {
  const out = [];
  const re = new RegExp(`INSERT INTO \\\`${table}\\\`[\\s\\S]*?;`, "g");
  let m;
  while ((m = re.exec(raw)) !== null) out.push(m[0]);
  return out;
}

const num = (v) => (v == null || v === "" ? 0 : Number(v));

/* ============================================================
 * 2. Parsing des tables source
 * ============================================================ */

// --- editeurs (id -> name) ---
const editeursRaw = [];
for (const ins of tableInserts(raw, "editeurs")) {
  for (const v of parseInsert(insertBodyOf(ins))) {
    if (v.length >= 3) editeursRaw.push({ id: num(v[0]), name: fixMojibake(v[1]), actif: num(v[2]) });
  }
}
const editeursById = new Map(editeursRaw.map((e) => [e.id, e]));

// --- productcategory (id -> {name, parentCatID, actif}) ---
const categoriesRaw = [];
for (const ins of tableInserts(raw, "productcategory")) {
  for (const v of parseInsert(insertBodyOf(ins))) {
    if (v.length >= 7) {
      categoriesRaw.push({ id: num(v[0]), name: fixMojibake(v[1]), parentCatID: num(v[3]), actif: num(v[6]) });
    }
  }
}

// --- suppliers ---
const suppliersRaw = [];
for (const ins of tableInserts(raw, "suppliers")) {
  for (const v of parseInsert(insertBodyOf(ins))) {
    if (v.length >= 8) {
      suppliersRaw.push({
        id: num(v[0]),
        companyName: fixMojibake(v[1]),
        name: fixMojibake(v[2]),
        companyTel: v[3] ?? "",
        personalTel: v[4] ?? "",
        adr: fixMojibake(v[5] ?? ""),
        email: v[6] ?? "",
        comments: fixMojibake(v[7] ?? ""),
        actif: num(v[8] ?? 1),
      });
    }
  }
}

// --- products ---
const productsRaw = [];
for (const ins of tableInserts(raw, "products")) {
  for (const v of parseInsert(insertBodyOf(ins))) {
    if (v.length < 19) continue;
    productsRaw.push({
      id: v[0],
      name: fixMojibake(v[1]),
      agence: num(v[2]),
      editeurID: num(v[3]),
      minSalePrice: num(v[4]),
      salePrice: num(v[5]),
      maxPurchasePrice: num(v[6]),
      prodCatID: num(v[7]),
      comments: fixMojibake(v[8]),
      productStateID: num(v[9]),
      currentQte: num(v[10]),
      alertQte: num(v[11]),
      minQte: num(v[12]),
      maxQte: num(v[13]),
      stockValue: num(v[14]),
      actif: num(v[15]),
      totalQtePurchased: num(v[16]),
      totalValuePurchased: num(v[17]),
      barCode: v[18],
    });
  }
}

// --- supplier_transactions (liens produit -> fournisseur) ---
const txns = [];
for (const ins of tableInserts(raw, "supplier_transactions")) {
  for (const v of parseInsert(insertBodyOf(ins))) {
    if (v.length >= 8) {
      txns.push({
        supplierID: num(v[1]),
        productID: v[3],
        productStateID: num(v[4]),
        quantity: num(v[5]),
        purchasePrice: num(v[6]),
        date: v[7],
      });
    }
  }
}

/* ============================================================
 * 3. Arborescence de catégories cible (code stable -> champ)
 * ============================================================ */

const CATS = [
  // racines
  { code: "MAN-SCO", nom: "Manuels Scolaires", typeBranche: "MANUEL", description: "Livres et manuels pour le primaire, secondaire et université" },
  { code: "LIT-LOI", nom: "Littérature & Loisirs", typeBranche: "MANUEL", description: "Romans, BD, mangas, poésie, théâtre" },
  { code: "DIC-ENC", nom: "Dictionnaires & Encyclopédies", typeBranche: "MANUEL", description: "Dictionnaires de langues, encyclopédies" },
  { code: "FAS-SCO", nom: "Fascicules", typeBranche: "MANUEL", description: "Fascicules et annales scolaires" },
  { code: "PAP-ECR", nom: "Papeterie & Écriture", typeBranche: "FOURNITURE", description: "Cahiers, stylos, papier, classement" },
  { code: "FOU-SCO", nom: "Fournitures Scolaires", typeBranche: "FOURNITURE", description: "Sacs, trousses, protège-cahiers, géométrie" },
  { code: "MOB-BUR", nom: "Mobilier & Bureau", typeBranche: "FOURNITURE", description: "Mobilier, lampes, horloges" },
  { code: "MUL-INF", nom: "Multimédia & Informatique", typeBranche: "FOURNITURE", description: "Clés USB, cartouches, calculatrices" },
  { code: "JEU-EDU", nom: "Jeux & Jouets Éducatifs", typeBranche: "FOURNITURE", description: "Jeux de société, puzzles, jouets" },
  { code: "DIV-ACC", nom: "Divers & Accessoires", typeBranche: "FOURNITURE", description: "Cadeaux, emballages, marque-pages" },
  // sous-catégories
  { code: "MAN-SCO-MAT", nom: "Maternelle", typeBranche: "MANUEL", parentCode: "MAN-SCO" },
  { code: "MAN-SCO-PRI", nom: "Primaire", typeBranche: "MANUEL", parentCode: "MAN-SCO" },
  { code: "MAN-SCO-SEC", nom: "Secondaire Général", typeBranche: "MANUEL", parentCode: "MAN-SCO" },
  { code: "MAN-SCO-TEC", nom: "Secondaire Technique", typeBranche: "MANUEL", parentCode: "MAN-SCO" },
  { code: "MAN-SCO-ANG", nom: "Anglophone (GCE)", typeBranche: "MANUEL", parentCode: "MAN-SCO" },
  { code: "MAN-SCO-UNI", nom: "Université & Supérieur", typeBranche: "MANUEL", parentCode: "MAN-SCO" },
  { code: "MAN-SCO-SCI", nom: "Scientifique", typeBranche: "MANUEL", parentCode: "MAN-SCO" },
  { code: "MAN-SCO-LIT", nom: "Littéraire", typeBranche: "MANUEL", parentCode: "MAN-SCO" },
  { code: "LIT-LOI-ROM", nom: "Romans & Fictions Africains", typeBranche: "MANUEL", parentCode: "LIT-LOI" },
  { code: "LIT-LOI-BD", nom: "Bandes Dessinées & Mangas", typeBranche: "MANUEL", parentCode: "LIT-LOI" },
  { code: "LIT-LOI-POE", nom: "Poésie & Théâtre", typeBranche: "MANUEL", parentCode: "LIT-LOI" },
  { code: "LIT-LOI-JEU", nom: "Jeunesse & Éveil", typeBranche: "MANUEL", parentCode: "LIT-LOI" },
  { code: "LIT-LOI-ESS", nom: "Essais & Documents", typeBranche: "MANUEL", parentCode: "LIT-LOI" },
  { code: "DIC-ENC-FR", nom: "Dictionnaires Français", typeBranche: "MANUEL", parentCode: "DIC-ENC" },
  { code: "DIC-ENC-BIL", nom: "Dictionnaires Bilingues", typeBranche: "MANUEL", parentCode: "DIC-ENC" },
  { code: "DIC-ENC-ATL", nom: "Encyclopédies & Atlas", typeBranche: "MANUEL", parentCode: "DIC-ENC" },
  { code: "PAP-ECR-CAH", nom: "Cahiers & Copies Doubles", typeBranche: "FOURNITURE", parentCode: "PAP-ECR" },
  { code: "PAP-ECR-STY", nom: "Stylos & Écriture", typeBranche: "FOURNITURE", parentCode: "PAP-ECR" },
  { code: "PAP-ECR-PAP", nom: "Papier & Enveloppes", typeBranche: "FOURNITURE", parentCode: "PAP-ECR" },
  { code: "PAP-ECR-CLA", nom: "Classement & Archives", typeBranche: "FOURNITURE", parentCode: "PAP-ECR" },
  { code: "PAP-ECR-COR", nom: "Correcteurs & Gommes", typeBranche: "FOURNITURE", parentCode: "PAP-ECR" },
  { code: "PAP-ECR-AGR", nom: "Agrafeuses & Agrafes", typeBranche: "FOURNITURE", parentCode: "PAP-ECR" },
  { code: "PAP-ECR-COL", nom: "Colle & Adhésifs", typeBranche: "FOURNITURE", parentCode: "PAP-ECR" },
  { code: "PAP-ECR-CIS", nom: "Ciseaux & Cutters", typeBranche: "FOURNITURE", parentCode: "PAP-ECR" },
  { code: "PAP-ECR-REG", nom: "Règles & Mesures", typeBranche: "FOURNITURE", parentCode: "PAP-ECR" },
  { code: "PAP-GEN", nom: "Papeterie Générale", typeBranche: "FOURNITURE", parentCode: "PAP-ECR" },
  { code: "FOU-SCO-SAC", nom: "Sacs & Cartables", typeBranche: "FOURNITURE", parentCode: "FOU-SCO" },
  { code: "FOU-SCO-TRO", nom: "Trousses & Accessoires", typeBranche: "FOURNITURE", parentCode: "FOU-SCO" },
  { code: "FOU-SCO-GEO", nom: "Géométrie & Dessin", typeBranche: "FOURNITURE", parentCode: "FOU-SCO" },
  { code: "FOU-SCO-PRO", nom: "Protège-cahiers & Couvertures", typeBranche: "FOURNITURE", parentCode: "FOU-SCO" },
  { code: "MOB-BUR-MOB", nom: "Mobilier de Bureau", typeBranche: "FOURNITURE", parentCode: "MOB-BUR" },
  { code: "MOB-BUR-ECL", nom: "Éclairage & Lampes", typeBranche: "FOURNITURE", parentCode: "MOB-BUR" },
  { code: "MUL-INF-USB", nom: "Clés USB & Stockage", typeBranche: "FOURNITURE", parentCode: "MUL-INF" },
  { code: "MUL-INF-CAR", nom: "Cartouches & Toners", typeBranche: "FOURNITURE", parentCode: "MUL-INF" },
  { code: "MUL-INF-CAL", nom: "Calculatrices", typeBranche: "FOURNITURE", parentCode: "MUL-INF" },
  { code: "MUL-INF-ACC", nom: "Accessoires Informatiques", typeBranche: "FOURNITURE", parentCode: "MUL-INF" },
  { code: "JEU-EDU-SOC", nom: "Jeux de Société", typeBranche: "FOURNITURE", parentCode: "JEU-EDU" },
  { code: "JEU-EDU-PUZ", nom: "Puzzles & Construction", typeBranche: "FOURNITURE", parentCode: "JEU-EDU" },
  { code: "DIV-ACC-CAD", nom: "Cadeaux & Emballages", typeBranche: "FOURNITURE", parentCode: "DIV-ACC" },
  { code: "DIV-ACC-MAR", nom: "Marque-pages & Accessoires", typeBranche: "FOURNITURE", parentCode: "DIV-ACC" },
];

const MANUEL_PREFIXES = ["MAN-", "LIT-", "DIC-", "FAS-"];

/** Classification produit : ancienne catégorie + nom -> code cible. */
function classifyProduct(name, oldCatId) {
  const upper = name.toUpperCase();
  if (oldCatId === 2) return "MUL-INF";
  if (oldCatId === 5) return "JEU-EDU";
  if (oldCatId === 6) return "DIC-ENC";
  if (oldCatId === 8) return "FAS-SCO";
  if (oldCatId === 10) return "DIV-ACC-CAD";
  if (oldCatId === 3 || oldCatId === 9) {
    if (/AGENDA/.test(upper)) return "PAP-ECR-CAH";
    if (/CAHIER|CAH |CA[0-9]|COPIE|DOUBLE/.test(upper)) return "PAP-ECR-CAH";
    if (/STYLO|BIC|PLUME|ROLLER|FEUTRE|MARQUEUR|SURLIGNEUR/.test(upper)) return "PAP-ECR-STY";
    if (/PAPIER|RAMETTE|ENVELOPPE|KRAFT/.test(upper)) return "PAP-ECR-PAP";
    if (/CLASSEUR|ARCHIVE|CHEMISE|FARD|PORTE/.test(upper)) return "PAP-ECR-CLA";
    if (/CORRECTEUR|CORRECTOR|GOMME|EFFACEUR/.test(upper)) return "PAP-ECR-COR";
    if (/AGRAFE|AGRAFEUSE|STAPLER/.test(upper)) return "PAP-ECR-AGR";
    if (/COLLE|ADHESIF|RUBAN|SCOTCH/.test(upper)) return "PAP-ECR-COL";
    if (/CISEAU|CUTTER/.test(upper)) return "PAP-ECR-CIS";
    if (/REGLE|EQUERRE|RAPPORTEUR/.test(upper)) return "PAP-ECR-REG";
    if (/COMPAS/.test(upper)) return "FOU-SCO-GEO";
    if (/CRAYON|MINE|TAILLE|PORTE-?MINE|COULEUR|COLORIAGE/.test(upper)) return "PAP-ECR-STY";
    if (/TABLEAU|TABLEAUX/.test(upper)) return "MOB-BUR";
    if (/SAC|CARTABLE|TROUSSE/.test(upper)) return "FOU-SCO-SAC";
    if (/CADEAU|EMBALLAGE|PAQUET/.test(upper)) return "DIV-ACC-CAD";
    if (/PROTEGE|COUVRE/.test(upper)) return "FOU-SCO-PRO";
    if (/CALCULATRICE|ADDITIONNEUSE|CALCO|CASIO/.test(upper)) return "MUL-INF-CAL";
    if (/CORBEILLE|POUBELLE/.test(upper)) return "MOB-BUR";
    if (/LAMPE|LUMIERE/.test(upper)) return "MOB-BUR-ECL";
    if (/BULLETIN|REGISTRE|CARNET/.test(upper)) return "PAP-ECR-CLA";
    if (/BRISTOL|CARTONNE|CARTON/.test(upper)) return "PAP-ECR-PAP";
    if (/BLOQUE|BLOC/.test(upper)) return "PAP-ECR-PAP";
    if (/BOITE|CRAYONS/.test(upper)) return "FOU-SCO-TRO";
    return "PAP-GEN";
  }
  if (oldCatId === 11) {
    if (/NURSERY|NUR /.test(upper)) return "MAN-SCO-MAT";
    if (/FORM 4|FORM 5|ADVANCED|A LEVEL|GCE/.test(upper)) return "MAN-SCO-SEC";
    if (/FORM 1|FORM 2|FORM 3|CLASS 1|CLASS 2|CLASS 3|CLASS 4|CLASS 5|CLASS 6/.test(upper)) return "MAN-SCO-PRI";
    return "MAN-SCO-ANG";
  }
  if (oldCatId === 1 || oldCatId === 4 || oldCatId === 7) {
    if (/DICTIONNAIRE|DICT/.test(upper)) return "DIC-ENC";
    if (/ATLAS|ENVYCLO/.test(upper)) return "DIC-ENC-ATL";
    if (/CD|DVD|MULTIMEDIA/.test(upper)) return "MUL-INF";
    if (/JE(U|UX)|PUZZLE|JOUET/.test(upper)) return "JEU-EDU";
    if (/SIL|MATERN|PETITE SECTION|MOYENNE SECTION|GRANDE SECTION/.test(upper)) return "MAN-SCO-MAT";
    if (/CP |CE1|CE2|CM1|CM2|COURS PREP|COURS ELEM|COURS MOYEN/.test(upper)) return "MAN-SCO-PRI";
    if (/6E|6EME|5E|5EME|4E|4EME|3E|3EME|2ND|SECONDE|1ERE|PREMIERE|TLE|TERMINALE/.test(upper)) return "MAN-SCO-SEC";
    if (/SCIENCE|PHYSIQUE|CHIMIE|SVT|MATHS|MATH|TECHNO/.test(upper)) return "MAN-SCO-SCI";
    if (/HISTOIRE|GEOGRAPHIE|FRANCAIS|ANGLAIS|ALLEMAND|ESPAGNOL|PHILO/.test(upper)) return "MAN-SCO-LIT";
    if (/ROMAN|NOUVELLE|LITTERATURE|POESIE|THEATRE/.test(upper)) return "LIT-LOI-ROM";
    if (/BD |BANDE DESSINEE/.test(upper)) return "LIT-LOI-BD";
    if (/FASCICULE/.test(upper)) return "FAS-SCO";
    return "MAN-SCO-SEC";
  }
  return "MAN-SCO";
}

function inferNiveau(idAndName) {
  const u = ` ${idAndName.toUpperCase()} `;
  const trouve = [];
  // Niveaux francophones (vocabulaire de la table `schoolyears` de l'ancien système)
  const FR = [
    [/NURSERY|NUR(?=\s)/, "Nursery"],
    [/\bSIL(?=\s|\/)/, "SIL"],
    [/MATERNELLE|MATERN\b/, "Maternelle"],
    [/PETITE SECTION|PETITE SECT/, "Petite Section"],
    [/MOYENNE SECTION|MOYENNE SECT/, "Moyenne Section"],
    [/GRANDE SECTION|GRANDE SECT/, "Grande Section"],
    [/\bCP(?=\s|\/)/, "CP"],
    [/\bCE1(?=\s|\/)/, "CE1"],
    [/\bCE2(?=\s|\/)/, "CE2"],
    [/\bCM1(?=\s|\/)/, "CM1"],
    [/\bCM2(?=\s|\/)/, "CM2"],
    [/6EME|6E(?=\s|\/)|SIXIEME/, "6e"],
    [/5EME|5E(?=\s|\/)|CINQUIEME/, "5e"],
    [/4EME|4E(?=\s|\/)|QUATRIEME/, "4e"],
    [/3EME|3E(?=\s|\/)|TROISIEME/, "3e"],
    [/2NDE|2ND(?=\s|\/)|SECONDE/, "2nde"],
    [/1ERE|1RE|PREMIERE/, "1ère"],
    [/TLE|TERMINALE|TERMINAL/, "Terminale"],
  ];
  // Niveaux anglophones (section GCE)
  const EN = [
    [/CLASS 1|CLASS ONE/, "Class 1"],
    [/CLASS 2|CLASS TWO/, "Class 2"],
    [/CLASS 3|CLASS THREE/, "Class 3"],
    [/CLASS 4|CLASS FOUR/, "Class 4"],
    [/CLASS 5|CLASS FIVE/, "Class 5"],
    [/CLASS 6|CLASS SIX/, "Class 6"],
    [/FORM 1|FORM ONE/, "Form 1"],
    [/FORM 2|FORM TWO/, "Form 2"],
    [/FORM 3|FORM THREE/, "Form 3"],
    [/FORM 4|FORM FOUR/, "Form 4"],
    [/FORM 5|FORM FIVE/, "Form 5"],
    [/ADVANCED|A LEVEL|GCE/, "Advanced Level"],
  ];
  for (const [re, label] of [...FR, ...EN]) if (re.test(u)) trouve.push(label);
  const uniq = [...new Set(trouve)];
  return uniq.length > 0 ? uniq.join(" - ") : undefined;
}

function inferLangue(p, typeProduit) {
  if (typeProduit !== "MANUEL") return undefined;
  if (p.prodCatID === 11) return "Anglais";
  const u = ` ${p.name.toUpperCase()} `;
  if (/DEUTSCH|ALLEMAND|IHR UND WIR|\bIHR\b|\bWIR\b/.test(u)) return "Allemand";
  if (/ESPAGNOL|ESPAÑOL|ALGO MAS/.test(u)) return "Espagnol";
  const niveau = inferNiveau(`${p.id} ${p.name}`);
  if (niveau && /NURSERY|CLASS|FORM|ADVANCED/i.test(niveau)) return "Anglais";
  if (/ENGLISH|ANGL[A-Z]*|FRENCH|GCE|WORK ?BOOK|\bWB\b/.test(u)) return "Anglais";
  return "Français";
}

function inferFormat(nom) {
  const u = nom.toUpperCase();
  const formats = [];
  const reA = /(A[3-7])(?=$|[^0-9])/g;
  let m;
  while ((m = reA.exec(u)) !== null) formats.push(m[1]);
  const re24 = /24\s*[X×]\s*32/;
  const re32 = /32\s*[X×]\s*45/;
  if (re24.test(u)) formats.push("24x32");
  if (re32.test(u)) formats.push("32x45");
  return [...new Set(formats)].join(" ") || undefined;
}

/** Marques connues du catalogue + fournisseur associé quand il existe. */
const MARQUES = [
  { re: /CAHIER D['’]AFRIQUE/i, nom: "Cahier d'Afrique", fournisseur: "CAHIER D'AFRIQUE" },
  { re: /\bSAFCA\b/i, nom: "SAFCA", fournisseur: "SAFCA" },
  { re: /\bFUTURA\b/i, nom: "FUTURA", fournisseur: "FUTURA" },
  { re: /\bCLASSIM\b/i, nom: "CLASSIM", fournisseur: "CLASSIM" },
  { re: /\bGBI\b/i, nom: "GBI", fournisseur: "GBI" },
  { re: /\bSCRIPTO\b/i, nom: "SCRIPTO" },
  { re: /\bENJ\b/i, nom: "ENJ" },
  { re: /\bPOLYGON\b/i, nom: "POLYGON" },
  { re: /\bREYNOLDS\b/i, nom: "REYNOLDS" },
  { re: /\bBANANIER\b/i, nom: "BANANIER" },
  { re: /\bCASIO\b/i, nom: "CASIO" },
  { re: /\bGIOTTO\b/i, nom: "GIOTTO" },
  { re: /\bMAPED\b/i, nom: "MAPED" },
  { re: /\bGAZELLE\b/i, nom: "GAZELLE" },
  { re: /\bPRIMULA\b/i, nom: "PRIMULA" },
  { re: /\bREYEL\b/i, nom: "REYEL" },
  { re: /\bSTAPLER\b/i, nom: "STAPLER" },
  { re: /\bTORBEY\b/i, nom: "TORBEY" },
];

function inferMatiere(idAndName) {
  const u = idAndName.toUpperCase();
  if (/MATHS?|MATHÉMATIQUES?/.test(u)) return "Mathématiques";
  if (/FRANÇAIS|FRANCAIS/.test(u)) return "Français";
  if (/ANGLAIS|ENGLISH/.test(u)) return "Anglais";
  if (/PHYSIQUE|PHYSICS/.test(u)) return "Physique";
  if (/CHIMIE|CHEMISTRY/.test(u)) return "Chimie";
  if (/SVT|BIOLOGIE|BIOLOGY/.test(u)) return "SVT/Biologie";
  if (/HISTOIRE|HISTORY/.test(u)) return "Histoire";
  if (/GÉOGRAPHIE|GEOGRAPHIE|GEOGRAPHY/.test(u)) return "Géographie";
  if (/PHILOSOPHIE|PHILO/.test(u)) return "Philosophie";
  if (/ALLEMAND/.test(u)) return "Allemand";
  if (/ESPAGNOL/.test(u)) return "Espagnol";
  if (/COMPTABILITÉ|COMPTABILITE|ACCOUNT/.test(u)) return "Comptabilité";
  if (/INFORMATIQUE|COMPUTER|ICT/.test(u)) return "Informatique";
  if (/ÉCONOMIE|ECONOMIE|ECONOMICS/.test(u)) return "Économie";
  if (/DROIT|LAW/.test(u)) return "Droit";
  if (/SCIENCE|SCIENCES/.test(u)) return "Sciences";
  if (/ÉDUCATION|EDUCATION|CITOYENNETÉ|CITOYEN|CITIZENSHIP/.test(u)) return "Éducation Civique";
  return undefined;
}

/* ============================================================
 * 4. Transformation
 * ============================================================ */

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// --- Éditeurs : garde les actifs, exclut le bruit ---
const EDITEUR_JUNK = new Set(["non applicable", "*", "d", "h", "l", "div", "divers", "herve", "oto", "ed", ""]);
const editeursCibles = new Map(); // nom normalisé -> nom réel
const editeurNameByOldId = new Map();
for (const e of editeursRaw) {
  if (e.actif !== 1) continue;
  const nom = e.name;
  if (!nom || EDITEUR_JUNK.has(norm(nom))) continue;
  if (!editeursCibles.has(norm(nom))) editeursCibles.set(norm(nom), nom);
}
// map id -> nom d'éditeur réel (même si l'éditeur est inactif dans l'ancien système)
for (const e of editeursRaw) {
  const nom = e.name;
  if (nom && !EDITEUR_JUNK.has(norm(nom))) editeurNameByOldId.set(e.id, nom);
}

// --- Fournisseurs : garde les actifs, déduplique par nom ---
const FOURNISSEUR_JUNK = new Set(["divers", ""]);
const fournisseursCibles = []; // {code, nom, contact, telephone, email, adresse, pays, isActive}
const fournisseurCodeByOldId = new Map();
{
  const byName = new Map(); // nom normalisé -> meilleur enregistrement
  const picks = [];
  for (const s of suppliersRaw) {
    if (s.actif !== 1) continue;
    const nom = s.companyName || s.name;
    if (FOURNISSEUR_JUNK.has(norm(nom))) continue;
    const cle = norm(nom);
    const score =
      (s.companyName ? 2 : 0) +
      (s.companyTel || s.personalTel ? 2 : 0) +
      (s.email ? 1 : 0) +
      (s.adr ? 1 : 0);
    const prev = byName.get(cle);
    if (!prev || score > prev.score) byName.set(cle, { ...s, score });
  }
  const usedCodes = new Set();
  for (const s of byName.values()) {
    const base = s.companyName || s.name;
    let code = `FOU-${base
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 38)}`;
    if (!/^[A-Z0-9]/.test(code)) code = `FOU-${code}`;
    let suffix = 2;
    while (usedCodes.has(code)) code = `FOU-${base.slice(0, 38).toUpperCase()}-${suffix++}`;
    usedCodes.add(code);
    fournisseursCibles.push({
      code,
      nom: base,
      telephone: s.companyTel || s.personalTel || undefined,
      email: s.email || undefined,
      adresse: s.adr || undefined,
      pays: "Cameroun",
      isActive: true,
    });
    fournisseurCodeByOldId.set(s.id, code);
  }
}

// --- Liens produit -> fournisseur depuis supplier_transactions ---
const txnsByProduct = new Map(); // productID -> [{supplierID, purchasePrice, date}]
for (const t of txns) {
  if (!fournisseurCodeByOldId.has(t.supplierID)) continue;
  const arr = txnsByProduct.get(t.productID) ?? [];
  arr.push(t);
  txnsByProduct.set(t.productID, arr);
}

// --- Liens marque -> fournisseur (papeterie : SAFCA, FUTURA, CLASSIM, GBI, Cahier d'Afrique…) ---
const codeFournisseurByNom = new Map(fournisseursCibles.map((f) => [norm(f.nom), f.code]));
const brandSupplier = (marque) => {
  if (!marque.fournisseur) return undefined;
  return codeFournisseurByNom.get(norm(marque.fournisseur));
};
function marqueDuProduit(nom) {
  return MARQUES.find((m) => m.re.test(nom))?.nom;
}

// --- Produits : déduplication par id (clé codeBarre) ---
const produitsUniques = new Map(); // id -> produit fusionné
const merges = [];
for (const p of productsRaw) {
  const id = p.id.trim();
  if (!id) continue;
  const score =
    (p.actif === 1 ? 4 : 0) +
    (p.productStateID !== 2 ? 2 : 0) +
    (p.editeurID >= 0 ? 1 : 0) +
    (p.salePrice > 0 ? 1 : 0);
  const prev = produitsUniques.get(id);
  if (!prev || score > prev.score) {
    if (prev) merges.push({ id, garde: p.id, ecarte: prev.id, raison: "meilleur score" });
    produitsUniques.set(id, { ...p, score });
  } else {
    merges.push({ id, garde: prev.id, ecarte: p.id, raison: "doublon" });
  }
}

const produits = [...produitsUniques.values()];

// --- Fichiers de sortie ---
const lignes = [];
const rejets = [];
const manuels = [];
const produitsUnites = [];
const produitsFournisseurs = [];
const stocksInitiaux = [];

const CAPITALIZE = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** Nom de code : 2 premières lettres de chaque mot du titre (ex. "32 BANANIER" → "32BA"). */
function nomCodeDuTitre(titre) {
  const words = titre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 0);
  return words.map((w) => w.slice(0, 2)).join("");
}

// Affectation des nomCode uniques (suffixe -2, -3… en cas de collision)
const nomCodesUtilises = new Set();
function nomCodeUnique(titre) {
  const base = nomCodeDuTitre(titre) || "X";
  if (!nomCodesUtilises.has(base)) { nomCodesUtilises.add(base); return base; }
  let i = 2;
  let code = `${base}-${i}`;
  while (nomCodesUtilises.has(code)) { i++; code = `${base}-${i}`; }
  nomCodesUtilises.add(code);
  return code;
}

// Artefacts d'essai de l'ancien système (placeholders, tests, lignes parasites).
const JUNK_PRODUCT_IDS = new Set(["courses", "art-test", "art-mvogada", "art-mvogada2", "art-mmvogada3", "essai1", "essaiv"]);

for (const p of produits) {
  if (JUNK_PRODUCT_IDS.has(p.id)) {
    rejets.push({ id: p.id, nom: p.name, raison: "produit d'essai / artefact de l'ancien système (exclu manuellement)" });
    continue;
  }
  if (p.salePrice <= 0) {
    rejets.push({ id: p.id, nom: p.name, raison: "salePrice <= 0 (RG-016 : prixVente > 0 requis)" });
    continue;
  }
  const catCode = classifyProduct(p.name, p.prodCatID);
  const typeProduit = MANUEL_PREFIXES.some((pfx) => catCode.startsWith(pfx)) ? "MANUEL" : "FOURNITURE";
  const idAndName = `${p.id} ${p.name}`;
  const editeur = editeurNameByOldId.get(p.editeurID);
  const marque = marqueDuProduit(p.name);
  const txnsProd = (txnsByProduct.get(p.id) ?? []).sort((a, b) => (a.date < b.date ? 1 : -1));
  const principal = txnsProd.find((t) => t.purchasePrice > 0) ?? txnsProd[0];
  // fournisseur par marque (si aucune transaction réelle)
  const marqueFournisseurCode = brandSupplier(MARQUES.find((m) => m.nom === marque) ?? {});
  const fournisseurCode = principal ? fournisseurCodeByOldId.get(principal.supplierID) : marqueFournisseurCode;

  const codeBarre = (() => {
    const bc = (p.barCode ?? "").trim();
    return bc.length >= 4 ? bc : p.id;
  })();

  const produit = {
    codeBarre,
    nomCode: nomCodeUnique(p.name),
    typeProduit,
    titre: CAPITALIZE(p.name),
    referenceFabricant: p.id,
    editeur: editeur ?? undefined,
    categorieCode: catCode,
    uniteBaseCode: "PCE",
    prixVente: String(p.salePrice),
    prixMinimumVente: p.minSalePrice > 0 ? String(p.minSalePrice) : undefined,
    prixAchat: p.maxPurchasePrice > 0 ? String(p.maxPurchasePrice) : undefined,
    tva: typeProduit === "MANUEL" ? "5.5" : "18",
    langue: inferLangue(p, typeProduit),
    niveauScolaire: inferNiveau(idAndName),
    matiere: inferMatiere(idAndName),
    marque,
    format: inferFormat(p.name),
    description: p.comments?.trim() ? p.comments.trim() : undefined,
    etat: p.productStateID === 2 ? "occasion" : "neuf",
    seuilAlerte: p.alertQte > 0 ? p.alertQte : 5,
    stockMaximum: p.maxQte > 0 ? p.maxQte : undefined,
    statut: p.actif === 1 ? (p.currentQte === 0 ? "rupture" : "actif") : "inactif",
    statutCycleVie: p.actif === 1 ? "ACTIF" : "SUSPENDU",
    fournisseurCode,
    isActive: p.actif === 1,
    refSource: `atelierone_mvogada.products[${p.id}#${p.productStateID}]`,
  };
  for (const k of Object.keys(produit)) if (produit[k] === undefined) delete produit[k];
  lignes.push(produit);

  produitsUnites.push({
    codeBarre: produit.codeBarre,
    uniteCode: "PCE",
    facteurVersBase: "1",
    estUniteBase: true,
    estUniteAchatDefaut: true,
    estUniteVenteDefaut: true,
    refSource: produit.refSource,
  });

  if (typeProduit === "MANUEL") {
    manuels.push({
      codeBarre: produit.codeBarre,
      typeManuel: catCode.startsWith("MAN-SCO") ? "OFFICIEL" : "AUTRE",
      editeurNom: editeur ?? undefined,
      prixReglemente: false,
      anneeImport: "2025-2026",
      refSource: produit.refSource,
    });
  }

  for (const t of txnsProd) {
    const codeF = fournisseurCodeByOldId.get(t.supplierID);
    if (!codeF || t.purchasePrice <= 0) continue;
    produitsFournisseurs.push({
      codeBarre: produit.codeBarre,
      fournisseurCode: codeF,
      prixAchat: String(t.purchasePrice),
      estPrincipal: principal && principal.supplierID === t.supplierID,
      isActive: true,
      refSource: produit.refSource,
    });
  }
  // lien par marque (sans prix d'achat) : couverture fournisseur pour la papeterie
  if (marqueFournisseurCode && !txnsProd.some((t) => fournisseurCodeByOldId.get(t.supplierID) === marqueFournisseurCode)) {
    produitsFournisseurs.push({
      codeBarre: produit.codeBarre,
      fournisseurCode: marqueFournisseurCode,
      estPrincipal: !principal,
      isActive: true,
      refSource: produit.refSource,
    });
  }

  // Stock initial (stock d'ouverture de l'ancien système)
  if (p.currentQte > 0) {
    stocksInitiaux.push({
      codeBarre: produit.codeBarre,
      agenceCode: "MVOG-ADA",
      quantite: String(p.currentQte),
      refSource: produit.refSource,
    });
  }
}

// déduplication produits_fournisseurs (même codeBarre|fournisseurCode : garder la date la plus récente)
{
  const byKey = new Map();
  for (const pf of produitsFournisseurs) {
    const key = `${pf.codeBarre}|${pf.fournisseurCode}`;
    byKey.set(key, pf);
  }
  produitsFournisseurs.length = 0;
  produitsFournisseurs.push(...byKey.values());
}

const UNIQUES_DEDUP_OK = lignes.length === new Set(lignes.map((l) => l.codeBarre)).size;

/* ============================================================
 * 5. Écriture des fichiers
 * ============================================================ */

mkdirSync(OUT_DIR, { recursive: true });

const UNITS = [
  { code: "PCE", libelle: "Pièce", symbole: "pce", type: "QUANTITE", isActive: true, refSource: "atelierone_mvogada.unites" },
  { code: "DOZ", libelle: "Douzaine", symbole: "dz", type: "QUANTITE", isActive: true, refSource: "atelierone_mvogada.unites" },
  { code: "CTN", libelle: "Carton", symbole: "ctn", type: "QUANTITE", isActive: true, refSource: "atelierone_mvogada.unites" },
  { code: "PAQ", libelle: "Paquet", symbole: "paq", type: "QUANTITE", isActive: true, refSource: "atelierone_mvogada.unites" },
  { code: "RME", libelle: "Rame (500 feuilles)", symbole: "rme", type: "QUANTITE", isActive: true, refSource: "atelierone_mvogada.unites" },
];

const files = {
  "unites.jsonl": UNITS,
  "categories.jsonl": CATS.map((c) => ({
    code: c.code,
    nom: c.nom,
    typeBranche: c.typeBranche,
    parentCode: c.parentCode,
    description: c.description,
    isActive: true,
    refSource: "atelierone_mvogada.productcategory",
  })),
  "editeurs.jsonl": [...editeursCibles.values()].map((nom) => ({ nom, refSource: "atelierone_mvogada.editeurs" })),
  "fournisseurs.jsonl": fournisseursCibles,
  "produits.jsonl": lignes,
  "manuels.jsonl": manuels,
  "produits_unites.jsonl": produitsUnites,
  "produits_fournisseurs.jsonl": produitsFournisseurs,
  "stocks_initiaux.jsonl": stocksInitiaux,
  "rejets-produits.jsonl": rejets,
};

for (const [fichier, rows] of Object.entries(files)) {
  writeFileSync(join(OUT_DIR, fichier), rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

/* ============================================================
 * 6. Rapport
 * ============================================================ */

const statsCat = new Map();
const statsType = { MANUEL: 0, FOURNITURE: 0 };
const statsLangue = new Map();
const statsNiveau = new Map();
const statsFournisseurs = { avec: 0, sans: 0, liens: 0 };
for (const l of lignes) {
  statsCat.set(l.categorieCode, (statsCat.get(l.categorieCode) ?? 0) + 1);
  statsType[l.typeProduit] = (statsType[l.typeProduit] ?? 0) + 1;
  if (l.langue) statsLangue.set(l.langue, (statsLangue.get(l.langue) ?? 0) + 1);
  if (l.niveauScolaire) statsNiveau.set(l.niveauScolaire, (statsNiveau.get(l.niveauScolaire) ?? 0) + 1);
  if (l.fournisseurCode) statsFournisseurs.avec++; else statsFournisseurs.sans++;
}
statsFournisseurs.liens = produitsFournisseurs.length;
const liensParFournisseur = new Map();
for (const pf of produitsFournisseurs) {
  liensParFournisseur.set(pf.fournisseurCode, (liensParFournisseur.get(pf.fournisseurCode) ?? 0) + 1);
}

const nbParEtat = produits.reduce((acc, p) => {
  const k = p.productStateID === 2 ? "occasion" : "neuf";
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});

const stockTotal = produits
  .filter((p) => !JUNK_PRODUCT_IDS.has(p.id) && p.salePrice > 0)
  .reduce((acc, p) => acc + p.currentQte, 0);
const sansPrix = rejets.length;

const rapport = [
  "# Rapport d'extraction — Papeterie Mvog-Ada (atelierone_mvogada)",
  "",
  `Source : \`DOC/donnéés papeterie/atelierone_mvogada.sql\` (dump MySQL, agence Mvog-Ada)`,
  `Généré le : ${new Date().toISOString().slice(0, 10)}`,
  "",
  "## Fichiers produits (format canonique JSONL, prêts pour l'import)",
  "",
  "| Fichier | Lignes | Contenu |",
  "| --- | --- | --- |",
  `| unites.jsonl | ${UNITS.length} | Unités de mesure (PCE = base) |`,
  `| categories.jsonl | ${CATS.length} | Arborescence de catégories cible |`,
  `| editeurs.jsonl | ${editeursCibles.size} | Maisons d'édition actives |`,
  `| fournisseurs.jsonl | ${fournisseursCibles.length} | Fournisseurs actifs dédupliqués |`,
  `| produits.jsonl | ${lignes.length} | Produits valides (prixVente > 0) |`,
  `| manuels.jsonl | ${manuels.length} | Lignes manuel_scolaire_detail (RG-004) |`,
  `| produits_unites.jsonl | ${produitsUnites.length} | Unité de base PCE par produit |`,
  `| produits_fournisseurs.jsonl | ${produitsFournisseurs.length} | Liens produit ↔ fournisseur (prix d'achat) |`,
  `| stocks_initiaux.jsonl | ${stocksInitiaux.length} | Stocks d'ouverture (agence MVOG-ADA) |`,
  `| rejets-produits.jsonl | ${sansPrix} | Produits rejetés (prix de vente nul, RG-016) |`,
  "",
  "## Statistiques brutes",
  "",
  `- Lignes de la table \`products\` (avec doublons neuf/vieux) : ${productsRaw.length}`,
  `- Produits uniques après déduplication par id : ${produits.length}`,
  `- Doublons fusionnés : ${merges.length}`,
  `- Clés codeBarre toutes uniques : ${UNIQUES_DEDUP_OK ? "OUI" : "NON (à corriger)"}`,
  `- États : neuf = ${nbParEtat.neuf ?? 0}, occasion = ${nbParEtat.occasion ?? 0}`,
  `- Stock total (currentQte, à saisir après import) : ${stockTotal} unités`,
  `- Fournisseurs bruts : ${suppliersRaw.length} → importés : ${fournisseursCibles.length} (actifs, dédupliqués, "Divers" exclu)`,
  `- Éditeurs bruts : ${editeursRaw.length} → importés : ${editeursCibles.size}`,
  `- Liens produit↔fournisseur issus de supplier_transactions : ${produitsFournisseurs.length}`,
  `- Produits MANUEL (avec ligne manuels.jsonl) : ${manuels.length}`,
  "",
  "## Correspondance des catégories",
  "",
  "| Ancienne catégorie | Code cible | Type |",
  "| --- | --- | --- |",
  "| LIBRAIRIE (1) | MAN-SCO-\* (sous-classification par niveau/matière) | MANUEL |",
  "| ANGLOPHONE (11) | MAN-SCO-ANG / MAN-SCO-PRI / MAN-SCO-SEC | MANUEL |",
  "| DICTIONNAIRES (6) | DIC-ENC | MANUEL |",
  "| FASCICULE (8) | FAS-SCO | MANUEL |",
  "| PAPETERIE (3) | PAP-ECR-\* / FOU-SCO-\* / MOB-BUR-\* / MUL-INF-CAL (par heuristique) | FOURNITURE |",
  "| MULTIMEDIA (2) | MUL-INF | FOURNITURE |",
  "| JEUX EDUCATIFS (5) | JEU-EDU | FOURNITURE |",
  "| courses (10) | DIV-ACC-CAD | FOURNITURE |",
  "| edicef (4, inactif) | traité comme LIBRAIRIE | MANUEL |",
  "| FASCICULES (7, inactif) | traité comme FASCICULE | MANUEL |",
  "| beon (9, inactif) | traité comme PAPETERIE | FOURNITURE |",
  "",
  "## Répartition des produits par catégorie cible",
  "",
  ...[...statsCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `| ${c} | ${n} |`),
  "",
  "## Manuels scolaires vs fournitures / papeterie",
  "",
  `| Type | Nombre | Part |`,
  "| --- | --- | --- |",
  `| MANUEL (manuels scolaires, dictionnaires, fascicules, littérature) | ${statsType.MANUEL} | ${Math.round((statsType.MANUEL / lignes.length) * 100)} % |`,
  `| FOURNITURE (papeterie, fournitures scolaires, multimédia, jeux) | ${statsType.FOURNITURE} | ${Math.round((statsType.FOURNITURE / lignes.length) * 100)} % |`,
  "",
  "La distinction est portée par : `typeProduit` (MANUEL/FOURNITURE) + la catégorie cible (`categorieCode`, branche MAN-* / DIC-* / FAS-* / LIT-* pour les manuels ; PAP-* / FOU-* / MUL-* / JEU-* / MOB-* / DIV-* pour les fournitures).",
  "",
  "## Langue des manuels (anglophone vs francophone)",
  "",
  "| Langue | Nombre |",
  "| --- | --- |",
  ...[...statsLangue.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => `| ${l} | ${n} |`),
  "",
  "La langue est portée par le champ `langue` : « Anglais » (section ANGLOPHONE de l'ancien système + manuels en anglais), « Français » (section LIBRAIRIE francophone), « Allemand », « Espagnol ».",
  "",
  "## Répartition des manuels par classe (niveauScolaire)",
  "",
  "| Classe(s) | Manuels |",
  "| --- | --- |",
  ...[...statsNiveau.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `| ${n} | ${c} |`),
  "",
  "Le niveau est détecté dans le nom du produit (vocabulaire de la table `schoolyears` de l'ancien système : SIL, Maternelle, Petite/Moyenne/Grande Section, CP, CE1, CE2, CM1, CM2, 6e, 5e, 4e, 3e, 2nde, 1ère, Terminale, plus Class 1-6 / Form 1-5 / Advanced Level pour l'anglophone). Les manuels multi-classes (ex. « Bled CP/CE1 ») portent les deux classes.",
  "",
  "## Fournisseurs par produit",
  "",
  `- Produits avec fournisseur identifié : **${statsFournisseurs.avec}** / ${lignes.length}`,
  `- Produits sans fournisseur : ${statsFournisseurs.sans} (à attribuer manuellement, ou via un fournisseur par défaut)`,
  `- Liens produit ↔ fournisseur : ${statsFournisseurs.liens} (dont prix d'achat réels issus de \`supplier_transactions\`)`,
  "",
  "| Fournisseur | Liens |",
  "| --- | --- |",
  ...[...liensParFournisseur.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `| ${c} | ${n} |`),
  "",
  "Les liens viennent de deux sources : les achats réels de l'ancien système (`supplier_transactions`, avec prix d'achat) et les marques de papeterie dont le fournisseur est connu (SAFCA, FUTURA, CLASSIM, GBI, Cahier d'Afrique — sans prix). `fournisseurCode` sur le produit = fournisseur principal.",
  "",
  "## Codes de recherche",
  "",
  "Chaque produit est recherchable par : `codeBarre` (= ancien code produit de la papeterie, ex. `32BA`, `acance1`, `CA200SA`), `nomCode` (2 premières lettres de chaque mot du titre, ex. `32 BANANIER` → `32BA`) et `referenceFabricant` (= ancien id, même valeur), en plus du titre. Les codes anciens restent donc valables au POS et dans les listes scolaires.",
  "",
  "## Décisions de mapping",
  "",
  "1. **codeBarre** : l'ancien id produit est conservé comme codeBarre (référence connue du personnel ; `barCode` utilisé s'il est renseigné).",
  '2. **Déduplication** : un produit existant en « neuf » et « vieux » est fusionné (le neuf gagne) ; les produits uniquement « vieux » sont importés avec `etat: "occasion"`.',
  "3. **prixAchat** : `maxPurchasePrice` (prix d'achat recommandé de l'ancien système) ; les prix d'achat réels figurent dans produits_fournisseurs.jsonl.",
  "4. **tva** : 5,5 % pour les MANUEL, 18 % pour les FOURNITURE.",
  "5. **statut** : `rupture` si stock 0, `actif` sinon, `inactif` si désactivé (statutCycleVie SUSPENDU).",
  "6. **fournisseurs** : ancien fournisseur « Divers » (id 1) exclu ; déduplication par nom (la fiche la plus complète gagne) ; pays fixé à « Cameroun ».",
  "7. **Éditeurs** : seuls les éditeurs actifs sont importés (les noms restent en texte sur les produits, même pour un éditeur inactif).",
  "8. **Ligne corrompue** `BATHPHPRGE2` (blob binaire dans le dump) : reconstruite à partir de la partie intacte du tuple.",
  "9. **Stocks initiaux** : `currentQte` n'est pas importable par ce pipeline ; à saisir via un inventaire initial après import des produits.",
  "",
  "## Étapes pour insérer",
  "",
  "```bash",
  "# 1. Vérification (sans écriture)",
  "pnpm -F @atelierone/db import:catalogue \"DOC/donnéés papeterie/import-atelierone\"",
  "",
  "# 2. Import réel (une fois validé)",
  "pnpm -F @atelierone/db import:catalogue \"DOC/donnéés papeterie/import-atelierone\" --apply",
  "```",
  "",
];

writeFileSync(join(OUT_DIR, "RAPPORT-IMPORT.md"), rapport.join("\n"), "utf8");

/* ============================================================
 * 7. Sortie console
 * ============================================================ */

console.log(`Produits bruts : ${productsRaw.length}`);
console.log(`Produits uniques : ${produits.length}`);
console.log(`Doublons fusionnés : ${merges.length}`);
console.log(`Produits importés (prix>0) : ${lignes.length}`);
console.log(`Rejets (prix=0) : ${sansPrix}`);
console.log(`Manuels : ${manuels.length}`);
console.log(`Fournisseurs importés : ${fournisseursCibles.length}`);
console.log(`Éditeurs importés : ${editeursCibles.size}`);
console.log(`Liens produits_fournisseurs : ${produitsFournisseurs.length}`);
console.log(`Stocks initiaux : ${stocksInitiaux.length}`);
console.log(`Clés uniques : ${UNIQUES_DEDUP_OK}`);
console.log(`Sortie : ${OUT_DIR}`);
