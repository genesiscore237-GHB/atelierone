import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../../..");
const OLD_DUMP = path.join(REPO_ROOT, "DOC/OLD/bd mkd.md");
const OUT_DIR = path.join(REPO_ROOT, "packages/db/data");
const OUT_PRODUCTS = path.join(OUT_DIR, "old-products.json");
const OUT_EDITORS = path.join(OUT_DIR, "old-editeurs.json");
const OUT_CATEGORIES = path.join(OUT_DIR, "old-categories.json");

function parseMySqlDump(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");

  const editeurs: { id: number; name: string; actif: number }[] = [];
  const categories: { id: number; name: string; parentCatID: number; actif: number }[] = [];
  const products: Record<string, any>[] = [];

  let inEditeurs = false;
  let inCategories = false;
  let inProducts = false;
  let currentInsert: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("INSERT INTO `editeurs`")) {
      inEditeurs = true;
      currentInsert = [line];
      continue;
    }
    if (line.startsWith("INSERT INTO `productcategory`")) {
      inCategories = true;
      currentInsert = [line];
      continue;
    }
    if (line.startsWith("INSERT INTO `products`")) {
      inProducts = true;
      currentInsert = [line];
      continue;
    }

    if (inEditeurs) {
      currentInsert.push(line);
      if (line.endsWith(";")) {
        const sql = currentInsert.join("\n");
        const matches = sql.match(/\(([^)]+)\)/g);
        if (matches) {
          for (const m of matches) {
            const vals = parseValues(m);
            if (vals && vals.length >= 3) {
              editeurs.push({ id: Number(vals[0]), name: String(vals[1]), actif: Number(vals[2]) });
            }
          }
        }
        inEditeurs = false;
        currentInsert = [];
      }
      continue;
    }

    if (inCategories) {
      currentInsert.push(line);
      if (line.endsWith(";")) {
        const sql = currentInsert.join("\n");
        const matches = sql.match(/\(([^)]+)\)/g);
        if (matches) {
          for (const m of matches) {
            const vals = parseValues(m);
            if (vals && vals.length >= 5) {
              categories.push({ id: Number(vals[0]), name: String(vals[1]), parentCatID: Number(vals[3]), actif: Number(vals[6] ?? vals[vals.length - 1]) });
            }
          }
        }
        inCategories = false;
        currentInsert = [];
      }
      continue;
    }

    if (inProducts) {
      currentInsert.push(line);
      if (line.endsWith(";")) {
        const sql = currentInsert.join("\n");
        const matches = sql.match(/\(([^)]+)\)/g);
        if (matches) {
          for (const m of matches) {
            const vals = parseValues(m);
            if (vals && vals.length >= 18) {
              products.push({
                id: vals[0],
                name: vals[1],
                agence: Number(vals[2]),
                editeurID: Number(vals[3]),
                minSalePrice: Number(vals[4]),
                salePrice: Number(vals[5]),
                maxPurchasePrice: Number(vals[6]),
                prodCatID: Number(vals[7]),
                comments: vals[8],
                productStateID: Number(vals[9]),
                currentQte: Number(vals[10]),
                alertQte: Number(vals[11]),
                minQte: Number(vals[12]),
                maxQte: Number(vals[13]),
                stockValue: Number(vals[14]),
                actif: Number(vals[15]),
                totalQtePurchased: Number(vals[16]),
                totalValuePurchased: Number(vals[17]),
                barCode: vals[18],
              });
            }
          }
        }
        inProducts = false;
        currentInsert = [];
      }
      continue;
    }
  }

  return { editeurs, categories, products };
}

function parseValues(match: string): string[] {
  let s = match.replace(/^\(/, "").replace(/\)$/, "");
  const result: string[] = [];
  let current = "";
  let inString = false;
  let quoteChar = "";

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!inString) {
      if (ch === ",") {
        result.push(current.trim());
        current = "";
        continue;
      }
      if (ch === "'" || ch === '"') {
        inString = true;
        quoteChar = ch;
        continue;
      }
      if (ch === " " || ch === "\n" || ch === "\r") {
        continue;
      }
      current += ch;
    } else {
      if (ch === "\\") {
        current += ch + (s[i + 1] || "");
        i++;
        continue;
      }
      if (ch === quoteChar) {
        inString = false;
        continue;
      }
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

// --- New category system for a librairie-papeterie ---
// Old categories: 1=Librairie, 2=Multimedia, 3=Papeterie, 5=Jeux, 6=Dictionnaires, 8=Fascicules, 10=Courses, 11=Anglophone
const OLD_TO_NEW_CAT_MAP: Record<number, { code: string; nom: string }> = {
  1: { code: "MAN-SCO-PRI", nom: "Primaire" },
  2: { code: "MUL-INF", nom: "Informatique & Accessoires" },
  3: { code: "PAP-GEN", nom: "Papeterie Générale" },
  5: { code: "JEU-EDU", nom: "Jeux Éducatifs" },
  6: { code: "DIC-ALL", nom: "Dictionnaires" },
  8: { code: "FAS-SCO", nom: "Fascicules" },
  10: { code: "DIV-CAD", nom: "Cadeaux & Emballages" },
  11: { code: "MAN-SCO-ANG", nom: "Section Anglophone" },
};

// New hierarchical categories
export const NEW_CATEGORIES = {
  root: [
    { nom: "Manuels Scolaires", code: "MAN-SCO", description: "Livres et manuels pour le primaire, secondaire et université" },
    { nom: "Littérature & Loisirs", code: "LIT-LOI", description: "Romans, BD, mangas, poésie, théâtre" },
    { nom: "Dictionnaires & Encyclopédies", code: "DIC-ENC", description: "Dictionnaires de langues, encyclopédies" },
    { nom: "Papeterie & Écriture", code: "PAP-ECR", description: "Cahiers, stylos, papier, classement" },
    { nom: "Fournitures Scolaires", code: "FOU-SCO", description: "Sacs, trousses, protège-cahiers, géométrie" },
    { nom: "Mobilier & Bureau", code: "MOB-BUR", description: "Mobilier, lampes, horloges" },
    { nom: "Multimédia & Informatique", code: "MUL-INF", description: "Clés USB, cartouches, calculatrices" },
    { nom: "Jeux & Jouets Éducatifs", code: "JEU-EDU", description: "Jeux de société, puzzles, jouets" },
    { nom: "Impression & Services", code: "IMP-SER", description: "Photocopie, impression, plastification" },
    { nom: "Divers & Accessoires", code: "DIV-ACC", description: "Cadeaux, emballages, marque-pages" },
  ],
  sub: [
    // MAN-SCO
    { nom: "Maternelle", code: "MAN-SCO-MAT", parentCode: "MAN-SCO" },
    { nom: "Primaire", code: "MAN-SCO-PRI", parentCode: "MAN-SCO" },
    { nom: "Secondaire Général", code: "MAN-SCO-SEC", parentCode: "MAN-SCO" },
    { nom: "Secondaire Technique", code: "MAN-SCO-TEC", parentCode: "MAN-SCO" },
    { nom: "Anglophone (GCE)", code: "MAN-SCO-ANG", parentCode: "MAN-SCO" },
    { nom: "Université & Supérieur", code: "MAN-SCO-UNI", parentCode: "MAN-SCO" },
    { nom: "Scientifique", code: "MAN-SCO-SCI", parentCode: "MAN-SCO" },
    { nom: "Littéraire", code: "MAN-SCO-LIT", parentCode: "MAN-SCO" },
    // LIT-LOI
    { nom: "Romans & Fictions Africains", code: "LIT-LOI-ROM", parentCode: "LIT-LOI" },
    { nom: "Bandes Dessinées & Mangas", code: "LIT-LOI-BD", parentCode: "LIT-LOI" },
    { nom: "Poésie & Théâtre", code: "LIT-LOI-POE", parentCode: "LIT-LOI" },
    { nom: "Jeunesse & Éveil", code: "LIT-LOI-JEU", parentCode: "LIT-LOI" },
    { nom: "Essais & Documents", code: "LIT-LOI-ESS", parentCode: "LIT-LOI" },
    // DIC-ENC
    { nom: "Dictionnaires Français", code: "DIC-ENC-FR", parentCode: "DIC-ENC" },
    { nom: "Dictionnaires Bilingues", code: "DIC-ENC-BIL", parentCode: "DIC-ENC" },
    { nom: "Encyclopédies & Atlas", code: "DIC-ENC-ATL", parentCode: "DIC-ENC" },
    // PAP-ECR
    { nom: "Cahiers & Copies Doubles", code: "PAP-ECR-CAH", parentCode: "PAP-ECR" },
    { nom: "Stylos & Écriture", code: "PAP-ECR-STY", parentCode: "PAP-ECR" },
    { nom: "Papier & Enveloppes", code: "PAP-ECR-PAP", parentCode: "PAP-ECR" },
    { nom: "Classement & Archives", code: "PAP-ECR-CLA", parentCode: "PAP-ECR" },
    { nom: "Correcteurs & Gommes", code: "PAP-ECR-COR", parentCode: "PAP-ECR" },
    { nom: "Agrafeuses & Agrafes", code: "PAP-ECR-AGR", parentCode: "PAP-ECR" },
    { nom: "Colle & Adhésifs", code: "PAP-ECR-COL", parentCode: "PAP-ECR" },
    { nom: "Ciseaux & Cutters", code: "PAP-ECR-CIS", parentCode: "PAP-ECR" },
    { nom: "Règles & Mesures", code: "PAP-ECR-REG", parentCode: "PAP-ECR" },
    // FOU-SCO
    { nom: "Sacs & Cartables", code: "FOU-SCO-SAC", parentCode: "FOU-SCO" },
    { nom: "Trousses & Accessoires", code: "FOU-SCO-TRO", parentCode: "FOU-SCO" },
    { nom: "Géométrie & Dessin", code: "FOU-SCO-GEO", parentCode: "FOU-SCO" },
    { nom: "Protège-cahiers & Couvertures", code: "FOU-SCO-PRO", parentCode: "FOU-SCO" },
    // MOB-BUR
    { nom: "Mobilier de Bureau", code: "MOB-BUR-MOB", parentCode: "MOB-BUR" },
    { nom: "Éclairage & Lampes", code: "MOB-BUR-ECL", parentCode: "MOB-BUR" },
    // MUL-INF
    { nom: "Clés USB & Stockage", code: "MUL-INF-USB", parentCode: "MUL-INF" },
    { nom: "Cartouches & Toners", code: "MUL-INF-CAR", parentCode: "MUL-INF" },
    { nom: "Calculatrices", code: "MUL-INF-CAL", parentCode: "MUL-INF" },
    { nom: "Accessoires Informatiques", code: "MUL-INF-ACC", parentCode: "MUL-INF" },
    // JEU-EDU
    { nom: "Jeux de Société", code: "JEU-EDU-SOC", parentCode: "JEU-EDU" },
    { nom: "Puzzles & Construction", code: "JEU-EDU-PUZ", parentCode: "JEU-EDU" },
    // DIV-ACC
    { nom: "Cadeaux & Emballages", code: "DIV-ACC-CAD", parentCode: "DIV-ACC" },
    { nom: "Marque-pages & Accessoires", code: "DIV-ACC-MAR", parentCode: "DIV-ACC" },
  ],
};

function classifyProduct(name: string, oldCatId: number, salePrice: number): string {
  const upper = name.toUpperCase();

  // Multimedia
  if (oldCatId === 2) return "MUL-INF";

  // Jeux
  if (oldCatId === 5) return "JEU-EDU";

  // Dictionnaires
  if (oldCatId === 6) return "DIC-ENC";

  // Fascicules
  if (oldCatId === 8) return "FAS-SCO";

  // Courses / Divers
  if (oldCatId === 10) return "DIV-ACC-CAD";

  // Papeterie
  if (oldCatId === 3) {
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
    return "PAP-GEN";
  }

  // Anglophone section
  if (oldCatId === 11) {
    if (/NURSERY|NUR /.test(upper)) return "MAN-SCO-MAT";
    if (/FORM 1|FORM 2|FORM 3|FORM 4|FORM 5|CLASS 1|CLASS 2|CLASS 3|CLASS 4|CLASS 5|CLASS 6/.test(upper)) return "MAN-SCO-PRI";
    if (/ADVANCED|ADV |A LEVEL|GCE/.test(upper)) return "MAN-SCO-SEC";
    return "MAN-SCO-ANG";
  }

  // Librairie (books) - oldCatId 1 or 4
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

function findEditeurName(editeurs: any[], id: number): string {
  const ed = editeurs.find((e: any) => e.id === id);
  return ed ? ed.name : "";
}

async function main() {
  console.log("Parsing old MySQL dump...");
  const { editeurs, categories, products } = parseMySqlDump(OLD_DUMP);
  console.log(`Found: ${editeurs.length} publishers, ${categories.length} categories, ${products.length} products`);

  // Save raw parsed data
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_EDITORS, JSON.stringify(editeurs, null, 2));
  fs.writeFileSync(OUT_CATEGORIES, JSON.stringify(categories, null, 2));

  // Map and transform products
  const editeurNameMap: Record<number, string> = {};
  for (const ed of editeurs) {
    const name = ed.name.trim();
    if (name !== "Non Applicable" && name !== "" && name !== "*" && name !== "D" && name !== "H" && name !== "L" && name !== "P" && name.length > 1) {
      editeurNameMap[ed.id] = name;
    }
  }

  const mapped = products
    .filter(p => p.actif === 1 && p.salePrice > 0)
    .map((p, idx) => {
      const catCode = classifyProduct(p.name, p.prodCatID, p.salePrice);
      const editeurName = editeurNameMap[p.editeurID] || undefined;

      // Determine levels
      const upperName = `${p.id} ${p.name}`.toUpperCase();
      let niveau = "";
      let matiere = "";

      if (/NURSERY|SIL|PETITE SECTION|MOYENNE SECTION|GRANDE SECTION/.test(upperName)) niveau = "Maternelle";
      else if (/CP |CE1|CE2/.test(upperName)) niveau = "CP-CE2";
      else if (/CM1|CM2/.test(upperName)) niveau = "CM1-CM2";
      else if (/6E|6EME/.test(upperName)) niveau = "6e";
      else if (/5E|5EME/.test(upperName)) niveau = "5e";
      else if (/4E|4EME/.test(upperName)) niveau = "4e";
      else if (/3E|3EME/.test(upperName)) niveau = "3e";
      else if (/2ND|SECONDE/.test(upperName)) niveau = "Seconde";
      else if (/1ERE|PREMIERE/.test(upperName)) niveau = "Première";
      else if (/TLE|TERMINALE/.test(upperName)) niveau = "Terminale";
      else if (/CLASS 1|CLASS 2|FORM 1/.test(upperName)) niveau = "Class 1-2";
      else if (/CLASS 3|CLASS 4|FORM 2/.test(upperName)) niveau = "Class 3-4";
      else if (/CLASS 5|CLASS 6|FORM 3/.test(upperName)) niveau = "Class 5-6";
      else if (/FORM 4|FORM 5/.test(upperName)) niveau = "Form 4-5";
      else if (/ADVANCED/.test(upperName)) niveau = "Advanced Level";

      // Matiere
      if (/MATHS?|MATHÉMATIQUES?/.test(upperName)) matiere = "Mathématiques";
      else if (/FRANÇAIS|FRANCAIS/.test(upperName)) matiere = "Français";
      else if (/ANGLAIS|ENGLISH/.test(upperName)) matiere = "Anglais";
      else if (/PHYSIQUE|PHYSICS/.test(upperName)) matiere = "Physique";
      else if (/CHIMIE|CHEMISTRY/.test(upperName)) matiere = "Chimie";
      else if (/SVT|BIOLOGIE|BIOLOGY/.test(upperName)) matiere = "SVT/Biologie";
      else if (/HISTOIRE|HISTORY/.test(upperName)) matiere = "Histoire";
      else if (/GÉOGRAPHIE|GEOGRAPHIE|GEOGRAPHY/.test(upperName)) matiere = "Géographie";
      else if (/PHILOSOPHIE|PHILO/.test(upperName)) matiere = "Philosophie";
      else if (/ALLEMAND/.test(upperName)) matiere = "Allemand";
      else if (/ESPAGNOL/.test(upperName)) matiere = "Espagnol";
      else if (/COMPTABILITÉ|COMPTABILITE|ACCOUNT/.test(upperName)) matiere = "Comptabilité";
      else if (/INFORMATIQUE|COMPUTER|ICT/.test(upperName)) matiere = "Informatique";
      else if (/ÉCONOMIE|ECONOMIE|ECONOMICS/.test(upperName)) matiere = "Économie";
      else if (/DROIT|LAW/.test(upperName)) matiere = "Droit";
      else if (/SCIENCE|SCIENCES/.test(upperName)) matiere = "Sciences";
      else if (/ÉDUCATION|EDUCATION|CITOYENNETÉ|CITOYEN|CITIZENSHIP/.test(upperName)) matiere = "Éducation Civique";

      const etat = p.productStateID === 2 ? "occasion" : "neuf";

      return {
        titre: p.name.charAt(0).toUpperCase() + p.name.slice(1),
        codeBarre: p.barCode || `AO-${String(idx + 1).padStart(5, "0")}`,
        oldId: p.id,
        auteur: "",
        editeur: editeurName || undefined,
        categorieCode: catCode,
        prixVente: p.salePrice > 0 ? String(p.salePrice) : "0",
        prixAchat: p.maxPurchasePrice > 0 ? String(p.maxPurchasePrice) : undefined,
        tva: catCode?.startsWith("MAN") ? "5.5" : "18",
        niveauScolaire: niveau || undefined,
        matiere: matiere || undefined,
        statut: p.currentQte === 0 ? "rupture" : "actif",
        etat,
        seuilAlerte: Math.max(p.alertQte, 5),
        ancienStock: p.currentQte,
      };
    });

  console.log(`Mapped ${mapped.length} active products`);
  fs.writeFileSync(OUT_PRODUCTS, JSON.stringify(mapped, null, 2));
  console.log(`Products saved to ${OUT_PRODUCTS}`);
  console.log(`Editors saved to ${OUT_EDITORS}`);
  console.log(`Categories saved to ${OUT_CATEGORIES}`);
}

main().catch(console.error);
