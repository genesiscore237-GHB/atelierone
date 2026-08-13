import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { db } from "./client";
import * as schema from "./schema";
import { sql } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

requireLocalOrForced("seed-manuels");

const DATA_FILE = path.resolve(__dirname, "../data/manuels-officiels.json");

type Ligne = {
  source: string;
  ministere: string;
  annee: string;
  sousSysteme: string;
  filiere: string | null;
  classe: string | null;
  classeRaw: string | null;
  matiere: string | null;
  titre: string;
  auteurs: string;
  editeur: string;
  prix: number;
};

const ROOT_CATEGORIES = [
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
];

const SUB_CATEGORIES: { nom: string; code: string; parentCode: string }[] = [
  { nom: "Maternelle", code: "MAN-SCO-MAT", parentCode: "MAN-SCO" },
  { nom: "Primaire", code: "MAN-SCO-PRI", parentCode: "MAN-SCO" },
  { nom: "Secondaire Général", code: "MAN-SCO-SEC", parentCode: "MAN-SCO" },
  { nom: "Secondaire Technique", code: "MAN-SCO-TEC", parentCode: "MAN-SCO" },
  { nom: "Anglophone (GCE)", code: "MAN-SCO-ANG", parentCode: "MAN-SCO" },
  { nom: "Université & Supérieur", code: "MAN-SCO-UNI", parentCode: "MAN-SCO" },
  { nom: "Scientifique", code: "MAN-SCO-SCI", parentCode: "MAN-SCO" },
  { nom: "Littéraire", code: "MAN-SCO-LIT", parentCode: "MAN-SCO" },
  { nom: "Romans & Fictions", code: "LIT-LOI-ROM", parentCode: "LIT-LOI" },
  { nom: "Bandes Dessinées & Mangas", code: "LIT-LOI-BD", parentCode: "LIT-LOI" },
  { nom: "Poésie & Théâtre", code: "LIT-LOI-POE", parentCode: "LIT-LOI" },
  { nom: "Jeunesse & Éveil", code: "LIT-LOI-JEU", parentCode: "LIT-LOI" },
  { nom: "Essais & Documents", code: "LIT-LOI-ESS", parentCode: "LIT-LOI" },
  { nom: "Dictionnaires Français", code: "DIC-ENC-FR", parentCode: "DIC-ENC" },
  { nom: "Dictionnaires Bilingues", code: "DIC-ENC-BIL", parentCode: "DIC-ENC" },
  { nom: "Encyclopédies & Atlas", code: "DIC-ENC-ATL", parentCode: "DIC-ENC" },
  { nom: "Cahiers & Copies Doubles", code: "PAP-ECR-CAH", parentCode: "PAP-ECR" },
  { nom: "Stylos & Écriture", code: "PAP-ECR-STY", parentCode: "PAP-ECR" },
  { nom: "Papier & Enveloppes", code: "PAP-ECR-PAP", parentCode: "PAP-ECR" },
  { nom: "Classement & Archives", code: "PAP-ECR-CLA", parentCode: "PAP-ECR" },
  { nom: "Correcteurs & Gommes", code: "PAP-ECR-COR", parentCode: "PAP-ECR" },
  { nom: "Agrafeuses & Agrafes", code: "PAP-ECR-AGR", parentCode: "PAP-ECR" },
  { nom: "Colle & Adhésifs", code: "PAP-ECR-COL", parentCode: "PAP-ECR" },
  { nom: "Ciseaux & Cutters", code: "PAP-ECR-CIS", parentCode: "PAP-ECR" },
  { nom: "Règles & Mesures", code: "PAP-ECR-REG", parentCode: "PAP-ECR" },
  { nom: "Papeterie Générale", code: "PAP-GEN", parentCode: "PAP-ECR" },
  { nom: "Sacs & Cartables", code: "FOU-SCO-SAC", parentCode: "FOU-SCO" },
  { nom: "Trousses & Accessoires", code: "FOU-SCO-TRO", parentCode: "FOU-SCO" },
  { nom: "Géométrie & Dessin", code: "FOU-SCO-GEO", parentCode: "FOU-SCO" },
  { nom: "Protège-cahiers & Couvertures", code: "FOU-SCO-PRO", parentCode: "FOU-SCO" },
  { nom: "Mobilier de Bureau", code: "MOB-BUR-MOB", parentCode: "MOB-BUR" },
  { nom: "Éclairage & Lampes", code: "MOB-BUR-ECL", parentCode: "MOB-BUR" },
  { nom: "Clés USB & Stockage", code: "MUL-INF-USB", parentCode: "MUL-INF" },
  { nom: "Cartouches & Toners", code: "MUL-INF-CAR", parentCode: "MUL-INF" },
  { nom: "Calculatrices", code: "MUL-INF-CAL", parentCode: "MUL-INF" },
  { nom: "Accessoires Informatiques", code: "MUL-INF-ACC", parentCode: "MUL-INF" },
  { nom: "Jeux de Société", code: "JEU-EDU-SOC", parentCode: "JEU-EDU" },
  { nom: "Puzzles & Construction", code: "JEU-EDU-PUZ", parentCode: "JEU-EDU" },
  { nom: "Cadeaux & Emballages", code: "DIV-ACC-CAD", parentCode: "DIV-ACC" },
  { nom: "Marque-pages & Accessoires", code: "DIV-ACC-MAR", parentCode: "DIV-ACC" },
];

// Règles de la migration 0027 : type_branche par préfixe de code
function typeBrancheFor(code: string): string {
  if (code.startsWith("MAN-SCO")) return "MANUEL";
  if (code.startsWith("LIT-LOI") || code.startsWith("DIC-ENC")) return "LIBRAIRIE";
  return "FOURNITURE";
}

// mapping matiere libellé -> code matieres (best-effort, context FR/EN)
const MATIERE_MAP: Record<string, string[]> = {
  FR: ["Français", "Langue Française", "Langage", "Lecture", "Écriture", "Handwriting", "Sound and Word Building"],
  ANG: ["Anglais", "English", "English Language", "Language"],
  MATH: ["Mathématiques", "Mathématique", "Mathématiques générales", "Mathématiques appliquées à la gestion", "Mathématiques appliquées à la gestion Financières", "Mathématiques et Statistiques appliquées à la gestion", "Additional Mathematics", "Pure Mathematics"],
  MATHS: ["Mathematics"],
  HIST: ["Histoire", "History"],
  GEO: ["Géographie", "Geography"],
  HG: ["Histoire-Géographie", "Sciences Humaines et Sociales", "Social Studies"],
  SVT: ["SVTEEHB", "SVTEEHB (Tles C et TI)", "Science et Technologie", "Sciences", "Science and Technology", "Sciences Tles littéraires"],
  PHY: ["Physique", "Chimie", "PCT", "Physique, Chimie", "Physique (Tles C, D, E et TI)", "Chimie (Tles C, D, E et TI)", "Physique-Chimie"],
  PHYSICS: ["Physics"],
  CHEM: ["Chemistry"],
  PHILO: ["Philosophie", "Philosophie (C et D)", "Philosophie (SES)", "Philosophie (essai)", "Philosophie (littéraires)", "Philosophie (scientifiques)"],
  ICT: ["Informatique", "Informatique (C, D, E et TI)", "TIC", "ICT", "Computer Science", "Bureautique", "Gestion Informatisée des organisations", "Travaux administratifs assistés par ordinateur"],
  LIT: ["Littérature", "Literature", "Literature in English"],
  CIT: ["Citizenship", "Éducation à la Citoyenneté", "Éducation à la citoyenneté"],
  ALL: ["Langues Étrangères (Allemand)"],
  ESP: ["Langues Étrangères (Espagnol)"],
  ART: ["Arts Cinématographiques", "Dessin, Peinture, Coloriage", "Drawing and Coloring", "Éducation artistique et Décorative"],
  EDM: ["Home Economics", "Cuisine / Techniques Culinaires", "Nutrition", "Sciences des Équipements et du Logement", "Préfecture / Gérontologie Diététique", "Sciences des Équipements et du Logement et Aménagement et Hygiène du Milieu de Vie"],
};

function slug(code: string): string {
  return code.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 45);
}

function classeToNiveau(classe: string | null): string | null {
  if (!classe) return null;
  if (/^N[123]$/.test(classe)) return "NURSERY";
  if (/^C[1-6]$/.test(classe)) return "PRIMARY";
  if (["PS", "MS", "GS"].includes(classe)) return "MAT";
  if (["SIL", "CP", "CE1", "CE2", "CM1", "CM2"].includes(classe)) return "PRIM";
  if (["6e", "5e", "4e", "3e", "2NDE", "1ERE", "TLE"].includes(classe)) return "SEC";
  return "SECONDARY"; // FORM1-5, L6, U6
}

function classeToCategorieManuel(classe: string | null, sousSysteme: string, filiere: string | null): string {
  if (!classe) return "MAN-SCO-SEC";
  if (sousSysteme === "EN") {
    if (/^[NC][1-6]?$/.test(classe) || /^C[1-6]$/.test(classe) || /^N[123]$/.test(classe)) return "MAN-SCO-PRI";
    return "MAN-SCO-ANG";
  }
  if (["PS", "MS", "GS"].includes(classe)) return "MAN-SCO-MAT";
  if (["SIL", "CP", "CE1", "CE2", "CM1", "CM2"].includes(classe)) return "MAN-SCO-PRI";
  if (filiere === "TECH") return "MAN-SCO-TEC";
  return "MAN-SCO-SEC";
}

// Fournitures inventées : [titre, categorie, prixAchat] — marge ~75% => prixVente = round(PA * 1.75 / 5) * 5
const FOURNITURES: [string, string, number][] = [
  ["Cahier 200 pages 21x29.7", "PAP-ECR-CAH", 400],
  ["Cahier 96 pages", "PAP-ECR-CAH", 250],
  ["Stylo à bille bleu", "PAP-ECR-STY", 100],
  ["Stylo à bille rouge", "PAP-ECR-STY", 100],
  ["Crayon HB", "PAP-ECR-STY", 75],
  ["Gomme blanche", "PAP-ECR-COR", 50],
  ["Taille-crayon", "PAP-ECR-COR", 100],
  ["Règle 30 cm", "PAP-ECR-REG", 150],
  ["Équerre 45°", "PAP-ECR-REG", 100],
  ["Compas", "FOU-SCO-GEO", 500],
  ["Ciseaux", "PAP-ECR-CIS", 400],
  ["Bâton de colle", "PAP-ECR-COL", 200],
  ["Agrafeuse", "PAP-ECR-AGR", 2500],
  ["Boîte d'agrafes", "PAP-ECR-AGR", 300],
  ["Ramette A4 (500 feuilles)", "PAP-ECR-PAP", 2500],
  ["Classeur A4", "PAP-ECR-CLA", 800],
  ["Chemise cartonnée", "PAP-ECR-CLA", 150],
  ["Enveloppes A4 (lot 20)", "PAP-ECR-PAP", 400],
  ["Cartable", "FOU-SCO-SAC", 7000],
  ["Trousse", "FOU-SCO-TRO", 1500],
  ["Protège-cahiers (lot 10)", "FOU-SCO-PRO", 500],
  ["Calculatrice scientifique", "MUL-INF-CAL", 3500],
  ["Marqueurs permanents (lot 4)", "PAP-ECR-STY", 800],
  ["Feutres de couleur (lot 12)", "PAP-ECR-STY", 1200],
  ["Crayons de couleur (lot 12)", "PAP-ECR-STY", 1000],
  ["Correcteur liquide", "PAP-ECR-COR", 250],
];

function venteMarge(pa: number): number {
  return Math.round((pa * 1.75) / 5) * 5;
}

function genIsbn(seq: number): string {
  // ISBN-13 déterministe "978" + 10 chiffres (unicité garantie par compteur)
  return `978${String(seq).padStart(10, "0")}`;
}

async function seed() {
  console.log("=== SEED MANUELS OFFICIELS ===");

  // Nettoyage ciblé (idempotent) : tables recréées par ce seed
  await db.execute(sql`TRUNCATE TABLE
    produits, codes_barres, produit_unites, unites_mesure_produits, stocks,
    manuel_scolaire_detail, fourniture_detail, editeurs, fournisseurs, categories
    RESTART IDENTITY CASCADE`);

  // 1. Référentiels
  const agence = (await db.select().from(schema.agences).limit(1))[0];
  const sousSystemes = await db.select().from(schema.sousSystemes);
  const ssByCode: Record<string, string> = {};
  for (const s of sousSystemes) ssByCode[s.code] = s.id;
  const ministeres = await db.select().from(schema.ministeres);
  const minByCode: Record<string, string> = {};
  for (const m of ministeres) minByCode[m.code] = m.id;
  const niveaux = await db.select().from(schema.niveaux);
  const nivByCode: Record<string, string> = {};
  for (const n of niveaux) nivByCode[n.code] = n.id;
  const filieres = await db.select().from(schema.filieres);
  const filByCode: Record<string, string> = {};
  for (const f of filieres) filByCode[f.code] = f.id;
  const classes = await db.select().from(schema.classes);
  const clsByCode: Record<string, string> = {};
  for (const c of classes) clsByCode[c.code] = c.id;
  const matieres = await db.select().from(schema.matieres);
  const matByLibelle: Record<string, string> = {};
  for (const m of matieres) matByLibelle[m.libelle.toLowerCase()] = m.id;
  const annees = await db.select().from(schema.anneesScolaires);
  const anneeByLibelle: Record<string, string> = {};
  for (const a of annees) anneeByLibelle[a.libelle] = a.id;
  const [pce] = await db.select().from(schema.unitesMesure).where(sql`code = 'PCE'`).limit(1);

  // Correction accents matières (le spec e2e cherche "Mathématiques" et "Français")
  await db.execute(sql`UPDATE matieres SET libelle = 'Mathématiques' WHERE code = 'MATH'`);
  await db.execute(sql`UPDATE matieres SET libelle = 'Mathematics' WHERE code = 'MATHS'`);
  await db.execute(sql`UPDATE matieres SET libelle = 'Français' WHERE code = 'FR'`);
  const matieres2 = await db.select().from(schema.matieres);
  for (const m of matieres2) matByLibelle[m.libelle.toLowerCase()] = m.id;

  // 2. Catégories (racines + sous-catégories) avec type_branche RG-002
  const catMap: Record<string, number> = {};
  for (const rc of ROOT_CATEGORIES) {
    const [c] = await db.insert(schema.categories).values({
      nom: rc.nom,
      code: rc.code,
      description: rc.description,
      typeBranche: typeBrancheFor(rc.code),
      isActive: true,
    }).returning();
    catMap[rc.code] = c.id;
  }
  for (const sc of SUB_CATEGORIES) {
    const [c] = await db.insert(schema.categories).values({
      nom: sc.nom,
      code: sc.code,
      parentId: catMap[sc.parentCode],
      typeBranche: typeBrancheFor(sc.code),
      isActive: true,
    }).returning();
    catMap[sc.code] = c.id;
  }
  console.log(`Catégories: ${Object.keys(catMap).length}`);

  // 3. Éditeurs + fournisseurs (un par éditeur distinct)
  const lignes: Ligne[] = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  const editeursDistincts = [...new Set(lignes.map((l) => l.editeur).filter(Boolean))] as string[];
  const usedSlugs = new Set<string>();
  const editeurIdByNom: Record<string, string> = {};
  const fournisseurIdByNom: Record<string, number> = {};
  for (const nom of editeursDistincts) {
    let code = slug(nom);
    if (!code) code = "EDIT";
    if (usedSlugs.has(code)) code = `${code}-${usedSlugs.size + 1}`;
    usedSlugs.add(code);
    const [ed] = await db.insert(schema.editeurs).values({ nom, agenceId: agence.id }).returning();
    editeurIdByNom[nom] = ed.id;
    const [f] = await db.insert(schema.fournisseurs).values({
      nom,
      code,
      agenceId: agence.id,
      pays: "Cameroun",
      isActive: true,
    }).returning();
    fournisseurIdByNom[nom] = f.id;
  }
  console.log(`Éditeurs/fournisseurs: ${editeursDistincts.length}`);

  // 4. Produits MANUEL (listes officielles)
  const batchSize = 100;
  let isbnSeq = 1000000000;
  const produitsManuels: (typeof schema.produits.$inferInsert)[] = [];
  const refsBySource: Record<string, { anneeId: string; ministereId: string }> = {
    "MINEDUB-2025-2026": { anneeId: anneeByLibelle["2025-2026"] ?? Object.values(anneeByLibelle)[0], ministereId: minByCode["MINEDUB"] },
    "ESGF-2026-2027": { anneeId: anneeByLibelle["2026-2027"] ?? Object.values(anneeByLibelle)[0], ministereId: minByCode["MINESEC"] },
    "STT-2025-2026": { anneeId: anneeByLibelle["2025-2026"] ?? Object.values(anneeByLibelle)[0], ministereId: minByCode["MINESEC"] },
    "STVE-TST-2025-2026": { anneeId: anneeByLibelle["2025-2026"] ?? Object.values(anneeByLibelle)[0], ministereId: minByCode["MINESEC"] },
    "INDUSTRIAL-2025-2026": { anneeId: anneeByLibelle["2025-2026"] ?? Object.values(anneeByLibelle)[0], ministereId: minByCode["MINESEC"] },
  };

  for (const l of lignes) {
    const refs = refsBySource[l.source];
    const codeBarre = genIsbn(isbnSeq++);
    const niveau = classeToNiveau(l.classe);
    const catCode = classeToCategorieManuel(l.classe, l.sousSysteme, l.filiere);
    let matiereId: string | null = null;
    const libelleLower = (l.matiere ?? "").toLowerCase();
    for (const [code, libelles] of Object.entries(MATIERE_MAP)) {
      if (libelles.some((x) => x.toLowerCase() === libelleLower)) {
        matiereId = matByLibelle[code.toLowerCase()] ?? null;
        break;
      }
    }
    if (!matiereId && (l.matiere ?? "").toLowerCase() === "mathématiques") {
      matiereId = matByLibelle["mathématiques"] ?? null;
    }
    produitsManuels.push({
      typeProduit: "MANUEL",
      codeBarre,
      isbn: codeBarre,
      titre: l.titre,
      auteur: (l.auteurs ?? "").slice(0, 255) || null,
      editeur: l.editeur || null,
      collection: null,
      niveauScolaire: l.classeRaw ?? l.classe ?? null,
      matiere: l.matiere ?? null,
      langue: l.sousSysteme === "EN" ? "EN" : "FR",
      etat: "neuf",
      description: `Manuel officiel ${l.ministere} ${l.annee} - ${l.matiere ?? "Matière générale"} (${l.classeRaw ?? l.classe ?? ""}). Prix réglementé ${l.prix} FCFA.`,
      categorieId: catMap[catCode] ?? null,
      fournisseurId: l.editeur ? (fournisseurIdByNom[l.editeur] ?? null) : null,
      sousSystemeId: ssByCode[l.sousSysteme === "EN" ? "EN" : "FR"],
      niveauId: niveau ? nivByCode[niveau] : null,
      filiereId: l.filiere ? filByCode[l.filiere] : null,
      classeId: l.classe ? (clsByCode[l.classe] ?? null) : null,
      matiereId,
      anneeListeId: refs.anneeId,
      ministereId: refs.ministereId,
      statutOfficiel: "OFFICIEL",
      prixReglemente: true,
      prixReglementeValeur: String(l.prix),
      uniteBaseId: pce.id,
      prixVente: String(l.prix),
      prixMinimumVente: String(l.prix),
      prixAchat: String(Math.round(l.prix * 0.55)),
      prixAchatReference: String(Math.round(l.prix * 0.55)),
      tva: "0",
      seuilAlerte: 5,
      seuilCritique: 2,
      stockMaximum: 500,
      statut: "actif",
      statutCycleVie: "ACTIF",
      uniteVente: "unite",
      uniteAchat: "unite",
      photos: [`https://placehold.co/200x280/1e293b/ffffff?text=${encodeURIComponent(l.titre.slice(0, 2) || "LI")}`],
      isActive: true,
    });
  }

  const allInserted: any[] = [];
  for (let i = 0; i < produitsManuels.length; i += batchSize) {
    const batch = produitsManuels.slice(i, i + batchSize);
    const inserted = await db.insert(schema.produits).values(batch).returning();
    allInserted.push(...inserted);
    console.log(`  Manuels: ${Math.min(i + batchSize, produitsManuels.length)}/${produitsManuels.length}`);
  }

  // 5. Fournitures inventées
  const produitsFournitures: (typeof schema.produits.$inferInsert)[] = [];
  for (const [titre, catCode, pa] of FOURNITURES) {
    const pv = venteMarge(pa);
    produitsFournitures.push({
      typeProduit: "FOURNITURE",
      codeBarre: genIsbn(isbnSeq++),
      isbn: null,
      titre,
      auteur: null,
      editeur: null,
      etat: "neuf",
      description: `${titre} - Fourniture scolaire/bureau de qualité.`,
      categorieId: catMap[catCode] ?? null,
      fournisseurId: null,
      statutOfficiel: null,
      prixReglemente: false,
      uniteBaseId: pce.id,
      prixVente: String(pv),
      prixMinimumVente: String(Math.round(pv * 0.9)),
      prixAchat: String(pa),
      prixAchatReference: String(pa),
      tva: "0",
      seuilAlerte: 5,
      seuilCritique: 2,
      stockMaximum: 200,
      statut: "actif",
      statutCycleVie: "ACTIF",
      uniteVente: "unite",
      uniteAchat: "unite",
      format: "A5",
      matiereComposition: "Matériaux de haute qualité",
      photos: [`https://placehold.co/200x200/334155/ffffff?text=${encodeURIComponent(titre.slice(0, 2) || "FO")}`],
      isActive: true,
    });
  }
  for (let i = 0; i < produitsFournitures.length; i += batchSize) {
    const batch = produitsFournitures.slice(i, i + batchSize);
    const inserted = await db.insert(schema.produits).values(batch).returning();
    allInserted.push(...inserted);
  }
  console.log(`Produits au total: ${allInserted.length} (manuels ${produitsManuels.length} + fournitures ${produitsFournitures.length})`);

  // 6. Tables dépendantes
  const manuelDetailValues: (typeof schema.manuelScolaireDetail.$inferInsert)[] = [];
  const produitUnitesValues: (typeof schema.produitUnites.$inferInsert)[] = [];
  const unitesMesureProduitsValues: (typeof schema.unitesMesureProduits.$inferInsert)[] = [];
  const codesBarresValues: (typeof schema.codesBarres.$inferInsert)[] = [];
  const stocksValues: (typeof schema.stocks.$inferInsert)[] = [];
  const fournitureDetailValues: (typeof schema.fournitureDetail.$inferInsert)[] = [];
  let stockSeq = 1;

  for (const p of allInserted) {
    const pa = Number(p.prixAchat || 0);
    const pv = Number(p.prixVente || 0);
    const estManuel = p.typeProduit === "MANUEL";
    const ligne = lignes.find((l) => l.titre === p.titre && Number(l.prix) === pv);
    const editeurNom = ligne?.editeur ?? null;

    produitUnitesValues.push({
      produitId: p.id,
      uniteId: pce.id,
      facteurVersParent: "1",
      facteurVersBase: "1",
      prixAchat: String(pa),
      prixVente: String(pv),
      estUniteBase: true,
      estUniteAchatDefaut: true,
      estUniteVenteDefaut: true,
      statut: "ACTIF",
    });
    unitesMesureProduitsValues.push({
      produitId: p.id,
      uniteId: pce.id,
      facteurConversion: 1,
      prixAchat: pa,
      prixVente: pv,
      estUniteAchatDefaut: true,
      estUniteVenteDefaut: true,
      estUniteBase: true,
    });
    codesBarresValues.push({
      produitId: p.id,
      type: "SYSTEME",
      valeur: p.codeBarre,
      estDefaut: true,
    });
    stocksValues.push({
      produitId: p.id,
      agenceId: agence.id,
      quantite: (stockSeq * 7) % 30 + 5,
      quantiteReservee: 0,
      quantiteRayon: 0,
      uniteReferenceId: pce.id,
      coutUnitaireMoyen: String(pa),
    });
    stockSeq++;
    if (estManuel) {
      manuelDetailValues.push({
        produitId: p.id,
        typeManuel: "OFFICIEL",
        editeurId: editeurNom ? (editeurIdByNom[editeurNom] ?? null) : null,
        prixReglemente: true,
        prixReglementeValeur: String(pv),
        anneeImport: ligne ? refsBySource[ligne.source].anneeId : null,
      });
    } else {
      fournitureDetailValues.push({
        produitId: p.id,
        typeFourniture: "SCOLAIRE",
      });
    }
  }

  await db.insert(schema.produitUnites).values(produitUnitesValues);
  await db.insert(schema.unitesMesureProduits).values(unitesMesureProduitsValues);
  await db.insert(schema.codesBarres).values(codesBarresValues);
  await db.insert(schema.stocks).values(stocksValues);
  await db.insert(schema.manuelScolaireDetail).values(manuelDetailValues);
  await db.insert(schema.fournitureDetail).values(fournitureDetailValues);
  console.log(`produit_unites: ${produitUnitesValues.length}, codes_barres: ${codesBarresValues.length}, stocks: ${stocksValues.length}, manuel_detail: ${manuelDetailValues.length}, fourniture_detail: ${fournitureDetailValues.length}`);

  console.log("=== SEED TERMINÉ ===");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
