import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import * as schema from "./schema";
import { eq } from "drizzle-orm";

requireLocalOrForced("db:seed-rayons (seed-rayons.ts)");

/**
 * Seed des rayons — conception DOC/US-Rayons.md §3.2
 * Idempotent : upsert par code, réexécutable sans doublons.
 * 8 zones + 31 rayons + 60 étagères + 4 emplacements non marchands = 103 emplacements.
 */

type EmplDef = {
  code: string;
  libelle: string;
  type: string;
  parentCode?: string;
  categorieCode?: string;
  sousSystemeCode?: string;
  niveauCode?: string;
  classeCode?: string;
  filiereCode?: string;
  ordre?: number;
};

const NEW_CATEGORIES = [
  { nom: "Tableaux & Ardoises", code: "FOU-SCO-TAB", description: "Tableaux blancs, ardoises, craies et accessoires", parentCode: "FOU-SCO" },
  { nom: "Loisirs créatifs", code: "JEU-EDU-LOI", description: "Pâte à modeler, origami, perles, activités manuelles", parentCode: "JEU-EDU" },
];

const EMPLACEMENTS: EmplDef[] = [
  // ─── Z0 — RÉSERVE (non marchand) ───────────────────────────────
  { code: "Z0-ENT", libelle: "Entrepôt Central", type: "ENTREPOT", ordre: 1 },
  { code: "Z0-RES-LIB", libelle: "Réserve Librairie", type: "RESERVE", ordre: 2 },
  { code: "Z0-RES-PAP", libelle: "Réserve Papeterie", type: "RESERVE", ordre: 3 },
  { code: "Z0-VIT", libelle: "Vitrine", type: "VITRINE", ordre: 4 },

  // ─── Z1 — ENTRÉE & IMPULSION ───────────────────────────────────
  { code: "Z1", libelle: "Entrée & Impulsion", type: "ZONE", ordre: 1 },
  { code: "Z1-R01", libelle: "Nouveautés", type: "RAYON", parentCode: "Z1", ordre: 1 },
  { code: "Z1-R02", libelle: "Promotions & Soldes", type: "RAYON", parentCode: "Z1", ordre: 2 },
  { code: "Z1-R03", libelle: "Rentrée Scolaire", type: "RAYON", parentCode: "Z1", ordre: 3 },

  // ─── Z2 — LIBRAIRIE SCOLAIRE ───────────────────────────────────
  { code: "Z2", libelle: "Librairie Scolaire", type: "ZONE", ordre: 2 },
  { code: "Z2-R01", libelle: "Manuels Scolaires Francophone", type: "RAYON", parentCode: "Z2", categorieCode: "MAN-SCO", sousSystemeCode: "FR", ordre: 1 },
  { code: "MFR-MAT", libelle: "Maternelle", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "MAT", ordre: 1 },
  { code: "MFR-SIL", libelle: "SIL", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "PRIM", classeCode: "SIL", ordre: 2 },
  { code: "MFR-CP", libelle: "CP", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "PRIM", classeCode: "CP", ordre: 3 },
  { code: "MFR-CE1", libelle: "CE1", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "PRIM", classeCode: "CE1", ordre: 4 },
  { code: "MFR-CE2", libelle: "CE2", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "PRIM", classeCode: "CE2", ordre: 5 },
  { code: "MFR-CM1", libelle: "CM1", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "PRIM", classeCode: "CM1", ordre: 6 },
  { code: "MFR-CM2", libelle: "CM2", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "PRIM", classeCode: "CM2", ordre: 7 },
  { code: "MFR-6E", libelle: "6e (tronc commun)", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "6e", ordre: 8 },
  { code: "MFR-5E", libelle: "5e (tronc commun)", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "5e", ordre: 9 },
  { code: "MFR-4E-GEN", libelle: "4e Général", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "4e", filiereCode: "GEN", ordre: 10 },
  { code: "MFR-3E-GEN", libelle: "3e Général", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "3e", filiereCode: "GEN", ordre: 11 },
  { code: "MFR-2NDE-GEN", libelle: "2nde Général", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "2NDE", filiereCode: "GEN", ordre: 12 },
  { code: "MFR-1ERE-GEN", libelle: "1ère Général", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "1ERE", filiereCode: "GEN", ordre: 13 },
  { code: "MFR-TLE-GEN", libelle: "Tle Général", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "TLE", filiereCode: "GEN", ordre: 14 },
  { code: "MFR-4E-TEC", libelle: "4e Technique", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "4e", filiereCode: "TECH", ordre: 15 },
  { code: "MFR-3E-TEC", libelle: "3e Technique", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "3e", filiereCode: "TECH", ordre: 16 },
  { code: "MFR-2NDE-TEC", libelle: "2nde Technique", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "2NDE", filiereCode: "TECH", ordre: 17 },
  { code: "MFR-1ERE-TEC", libelle: "1ère Technique", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "1ERE", filiereCode: "TECH", ordre: 18 },
  { code: "MFR-TLE-TEC", libelle: "Tle Technique", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SEC", classeCode: "TLE", filiereCode: "TECH", ordre: 19 },
  { code: "MFR-SUP", libelle: "Université", type: "ETAGERE", parentCode: "Z2-R01", categorieCode: "MAN-SCO", sousSystemeCode: "FR", niveauCode: "SUP", ordre: 20 },

  { code: "Z2-R02", libelle: "Manuels Scolaires Anglophone", type: "RAYON", parentCode: "Z2", categorieCode: "MAN-SCO", sousSystemeCode: "EN", ordre: 2 },
  { code: "MEN-NUR", libelle: "Nursery", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "NURSERY", ordre: 1 },
  { code: "MEN-C1", libelle: "Class 1", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "PRIMARY", classeCode: "C1", ordre: 2 },
  { code: "MEN-C2", libelle: "Class 2", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "PRIMARY", classeCode: "C2", ordre: 3 },
  { code: "MEN-C3", libelle: "Class 3", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "PRIMARY", classeCode: "C3", ordre: 4 },
  { code: "MEN-C4", libelle: "Class 4", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "PRIMARY", classeCode: "C4", ordre: 5 },
  { code: "MEN-C5", libelle: "Class 5", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "PRIMARY", classeCode: "C5", ordre: 6 },
  { code: "MEN-C6", libelle: "Class 6", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "PRIMARY", classeCode: "C6", ordre: 7 },
  { code: "MEN-FORM1", libelle: "Form 1 (tronc commun)", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "FORM1", ordre: 8 },
  { code: "MEN-FORM2", libelle: "Form 2 (tronc commun)", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "FORM2", ordre: 9 },
  { code: "MEN-FORM3-GEN", libelle: "Form 3 General", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "FORM3", filiereCode: "GEN", ordre: 10 },
  { code: "MEN-FORM4-GEN", libelle: "Form 4 General", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "FORM4", filiereCode: "GEN", ordre: 11 },
  { code: "MEN-FORM5-GEN", libelle: "Form 5 General", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "FORM5", filiereCode: "GEN", ordre: 12 },
  { code: "MEN-L6-GEN", libelle: "Lower Sixth General", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "L6", filiereCode: "GEN", ordre: 13 },
  { code: "MEN-U6-GEN", libelle: "Upper Sixth General", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "U6", filiereCode: "GEN", ordre: 14 },
  { code: "MEN-FORM3-TEC", libelle: "Form 3 Technical", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "FORM3", filiereCode: "TECH", ordre: 15 },
  { code: "MEN-FORM4-TEC", libelle: "Form 4 Technical", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "FORM4", filiereCode: "TECH", ordre: 16 },
  { code: "MEN-FORM5-TEC", libelle: "Form 5 Technical", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "FORM5", filiereCode: "TECH", ordre: 17 },
  { code: "MEN-L6-TEC", libelle: "Lower Sixth Technical", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "L6", filiereCode: "TECH", ordre: 18 },
  { code: "MEN-U6-TEC", libelle: "Upper Sixth Technical", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "SECONDARY", classeCode: "U6", filiereCode: "TECH", ordre: 19 },
  { code: "MEN-HIGH", libelle: "Higher Education", type: "ETAGERE", parentCode: "Z2-R02", categorieCode: "MAN-SCO", sousSystemeCode: "EN", niveauCode: "HIGHER", ordre: 20 },

  { code: "Z2-R03", libelle: "Littérature & Loisirs", type: "RAYON", parentCode: "Z2", categorieCode: "LIT-LOI", ordre: 3 },
  { code: "LIT-ROM", libelle: "Romans & Fictions", type: "ETAGERE", parentCode: "Z2-R03", categorieCode: "LIT-LOI-ROM", ordre: 1 },
  { code: "LIT-BD", libelle: "BD & Mangas", type: "ETAGERE", parentCode: "Z2-R03", categorieCode: "LIT-LOI-BD", ordre: 2 },
  { code: "LIT-JEU", libelle: "Jeunesse & Éveil", type: "ETAGERE", parentCode: "Z2-R03", categorieCode: "LIT-LOI-JEU", ordre: 3 },
  { code: "LIT-POE", libelle: "Poésie & Théâtre", type: "ETAGERE", parentCode: "Z2-R03", categorieCode: "LIT-LOI-POE", ordre: 4 },
  { code: "LIT-ESS", libelle: "Essais & Documents", type: "ETAGERE", parentCode: "Z2-R03", categorieCode: "LIT-LOI-ESS", ordre: 5 },

  { code: "Z2-R04", libelle: "Dictionnaires & Encyclopédies", type: "RAYON", parentCode: "Z2", categorieCode: "DIC-ENC", ordre: 4 },
  { code: "DIC-FR", libelle: "Dictionnaires Français", type: "ETAGERE", parentCode: "Z2-R04", categorieCode: "DIC-ENC-FR", ordre: 1 },
  { code: "DIC-BIL", libelle: "Dictionnaires Bilingues", type: "ETAGERE", parentCode: "Z2-R04", categorieCode: "DIC-ENC-BIL", ordre: 2 },
  { code: "DIC-ATL", libelle: "Encyclopédies & Atlas", type: "ETAGERE", parentCode: "Z2-R04", categorieCode: "DIC-ENC-ATL", ordre: 3 },

  // ─── Z3 — PAPETERIE & ÉCRITURE ─────────────────────────────────
  { code: "Z3", libelle: "Papeterie & Écriture", type: "ZONE", ordre: 3 },
  { code: "Z3-R01", libelle: "Stylos & Écriture", type: "RAYON", parentCode: "Z3", categorieCode: "PAP-ECR-STY", ordre: 1 },
  { code: "STY-BIL", libelle: "Stylos bille & gel", type: "ETAGERE", parentCode: "Z3-R01", categorieCode: "PAP-ECR-STY", ordre: 1 },
  { code: "STY-PLU", libelle: "Stylos plume & calligraphie", type: "ETAGERE", parentCode: "Z3-R01", categorieCode: "PAP-ECR-STY", ordre: 2 },
  { code: "STY-MIN", libelle: "Porte-mines & mines", type: "ETAGERE", parentCode: "Z3-R01", categorieCode: "PAP-ECR-STY", ordre: 3 },
  { code: "STY-MAR", libelle: "Marqueurs & surligneurs", type: "ETAGERE", parentCode: "Z3-R01", categorieCode: "PAP-ECR-STY", ordre: 4 },

  { code: "Z3-R02", libelle: "Crayons, Gommes & Correcteurs", type: "RAYON", parentCode: "Z3", categorieCode: "PAP-ECR-COR", ordre: 2 },
  { code: "Z3-R03", libelle: "Cahiers & Papiers", type: "RAYON", parentCode: "Z3", categorieCode: "PAP-ECR-CAH", ordre: 3 },
  { code: "CAH-CAH", libelle: "Cahiers & copies doubles", type: "ETAGERE", parentCode: "Z3-R03", categorieCode: "PAP-ECR-CAH", ordre: 1 },
  { code: "CAH-PAP", libelle: "Ramettes & papier", type: "ETAGERE", parentCode: "Z3-R03", categorieCode: "PAP-ECR-PAP", ordre: 2 },
  { code: "CAH-ENV", libelle: "Enveloppes & blocs", type: "ETAGERE", parentCode: "Z3-R03", categorieCode: "PAP-ECR-PAP", ordre: 3 },

  { code: "Z3-R04", libelle: "Classement & Archives", type: "RAYON", parentCode: "Z3", categorieCode: "PAP-ECR-CLA", ordre: 4 },
  { code: "CLA-TRI", libelle: "Classeurs & trieurs", type: "ETAGERE", parentCode: "Z3-R04", categorieCode: "PAP-ECR-CLA", ordre: 1 },
  { code: "CLA-CHE", libelle: "Chemises & pochettes", type: "ETAGERE", parentCode: "Z3-R04", categorieCode: "PAP-ECR-CLA", ordre: 2 },
  { code: "CLA-BOI", libelle: "Boîtes d'archives", type: "ETAGERE", parentCode: "Z3-R04", categorieCode: "PAP-ECR-CLA", ordre: 3 },

  { code: "Z3-R05", libelle: "Colle & Adhésifs", type: "RAYON", parentCode: "Z3", categorieCode: "PAP-ECR-COL", ordre: 5 },
  { code: "Z3-R06", libelle: "Agrafeuses, Ciseaux & Cutters", type: "RAYON", parentCode: "Z3", categorieCode: "PAP-ECR-AGR", ordre: 6 },
  { code: "Z3-R07", libelle: "Règles & Mesures", type: "RAYON", parentCode: "Z3", categorieCode: "PAP-ECR-REG", ordre: 7 },

  // ─── Z4 — FOURNITURES SCOLAIRES ────────────────────────────────
  { code: "Z4", libelle: "Fournitures Scolaires", type: "ZONE", ordre: 4 },
  { code: "Z4-R01", libelle: "Sacs & Cartables", type: "RAYON", parentCode: "Z4", categorieCode: "FOU-SCO-SAC", ordre: 1 },
  { code: "Z4-R02", libelle: "Trousses & Accessoires", type: "RAYON", parentCode: "Z4", categorieCode: "FOU-SCO-TRO", ordre: 2 },
  { code: "Z4-R03", libelle: "Géométrie & Dessin", type: "RAYON", parentCode: "Z4", categorieCode: "FOU-SCO-GEO", ordre: 3 },
  { code: "GEO-BOI", libelle: "Boîtes & compas", type: "ETAGERE", parentCode: "Z4-R03", categorieCode: "FOU-SCO-GEO", ordre: 1 },
  { code: "GEO-INS", libelle: "Instruments seuls", type: "ETAGERE", parentCode: "Z4-R03", categorieCode: "FOU-SCO-GEO", ordre: 2 },
  { code: "Z4-R04", libelle: "Protège-cahiers & Couvertures", type: "RAYON", parentCode: "Z4", categorieCode: "FOU-SCO-PRO", ordre: 4 },
  { code: "Z4-R05", libelle: "Tableaux & Ardoises", type: "RAYON", parentCode: "Z4", categorieCode: "FOU-SCO-TAB", ordre: 5 },

  // ─── Z5 — MOBILIER & BUREAU ────────────────────────────────────
  { code: "Z5", libelle: "Mobilier & Bureau", type: "ZONE", ordre: 5 },
  { code: "Z5-R01", libelle: "Mobilier de Bureau", type: "RAYON", parentCode: "Z5", categorieCode: "MOB-BUR-MOB", ordre: 1 },
  { code: "Z5-R02", libelle: "Éclairage & Lampes", type: "RAYON", parentCode: "Z5", categorieCode: "MOB-BUR-ECL", ordre: 2 },

  // ─── Z6 — MULTIMÉDIA & INFORMATIQUE ────────────────────────────
  { code: "Z6", libelle: "Multimédia & Informatique", type: "ZONE", ordre: 6 },
  { code: "Z6-R01", libelle: "Calculatrices", type: "RAYON", parentCode: "Z6", categorieCode: "MUL-INF-CAL", ordre: 1 },
  { code: "CAL-SCI", libelle: "Calculatrices scientifiques", type: "ETAGERE", parentCode: "Z6-R01", categorieCode: "MUL-INF-CAL", ordre: 1 },
  { code: "CAL-SIM", libelle: "Calculatrices simples & financières", type: "ETAGERE", parentCode: "Z6-R01", categorieCode: "MUL-INF-CAL", ordre: 2 },
  { code: "Z6-R02", libelle: "Clés USB & Stockage", type: "RAYON", parentCode: "Z6", categorieCode: "MUL-INF-USB", ordre: 2 },
  { code: "Z6-R03", libelle: "Cartouches & Toners", type: "RAYON", parentCode: "Z6", categorieCode: "MUL-INF-CAR", ordre: 3 },
  { code: "Z6-R04", libelle: "Accessoires Informatiques", type: "RAYON", parentCode: "Z6", categorieCode: "MUL-INF-ACC", ordre: 4 },

  // ─── Z7 — JEUX & LOISIRS ÉDUCATIFS ─────────────────────────────
  { code: "Z7", libelle: "Jeux & Loisirs Éducatifs", type: "ZONE", ordre: 7 },
  { code: "Z7-R01", libelle: "Jeux de Société", type: "RAYON", parentCode: "Z7", categorieCode: "JEU-EDU-SOC", ordre: 1 },
  { code: "Z7-R02", libelle: "Puzzles & Construction", type: "RAYON", parentCode: "Z7", categorieCode: "JEU-EDU-PUZ", ordre: 2 },
  { code: "Z7-R03", libelle: "Loisirs créatifs", type: "RAYON", parentCode: "Z7", categorieCode: "JEU-EDU-LOI", ordre: 3 },

  // ─── Z8 — SERVICES & DIVERS ────────────────────────────────────
  { code: "Z8", libelle: "Services & Divers", type: "ZONE", ordre: 8 },
  { code: "Z8-R01", libelle: "Impression & Services", type: "RAYON", parentCode: "Z8", categorieCode: "IMP-SER", ordre: 1 },
  { code: "Z8-R02", libelle: "Cadeaux & Emballages", type: "RAYON", parentCode: "Z8", categorieCode: "DIV-ACC-CAD", ordre: 2 },
  { code: "Z8-R03", libelle: "Marque-pages & Accessoires", type: "RAYON", parentCode: "Z8", categorieCode: "DIV-ACC-MAR", ordre: 3 },
];

async function main() {
  // 1. Agence de référence
  const [agence] = await db
    .select({ id: schema.agences.id, nom: schema.agences.nom, code: schema.agences.code })
    .from(schema.agences)
    .limit(1);
  if (!agence) throw new Error("Aucune agence trouvée — exécutez d'abord db:seed");
  console.log(`Agence: ${agence.nom} (${agence.code})`);

  // 2. Référentiels
  const [categoriesList, sousSystemesList, niveauxList, classesList, filieresList] = await Promise.all([
    db.select().from(schema.categories),
    db.select().from(schema.sousSystemes),
    db.select().from(schema.niveaux),
    db.select().from(schema.classes),
    db.select().from(schema.filieres),
  ]);

  const catByCode = new Map(categoriesList.map(c => [c.code, c.id]));
  const ssByCode = new Map(sousSystemesList.map(s => [s.code, s.id]));
  const nivByCode = new Map(niveauxList.map(n => [n.code, n.id]));
  const classeByCode = new Map(classesList.map(c => [c.code, c.id]));
  const filByCode = new Map(filieresList.map(f => [f.code, f.id]));

  // 3. Nouvelles catégories (idempotent)
  for (const nc of NEW_CATEGORIES) {
    if (catByCode.has(nc.code)) continue;
    const parentId = nc.parentCode ? catByCode.get(nc.parentCode) : null;
    const [inserted] = await db.insert(schema.categories).values({
      nom: nc.nom,
      code: nc.code,
      description: nc.description,
      parentId,
    }).returning();
    if (inserted) {
      catByCode.set(nc.code, inserted.id);
      console.log(`Catégorie créée: ${nc.code} (${nc.nom})`);
    }
  }

  // 4. Emplacements — par niveau (zones → rayons → étagères), idempotent par code
  const existing = await db.select().from(schema.emplacements)
    .where(eq(schema.emplacements.agenceId, agence.id));
  const existingCodes = new Set(existing.map(e => e.code.toUpperCase()));

  const emplacementIdByCode = new Map(existing.map(e => [e.code.toUpperCase(), e.id]));

  let created = 0;
  let skipped = 0;

  for (const def of EMPLACEMENTS) {
    const codeKey = def.code.toUpperCase();
    if (existingCodes.has(codeKey)) {
      // Mise à jour des liens éducatifs/catégorie si le seed évolue (idempotent)
      const existingRow = existing.find(e => e.code.toUpperCase() === codeKey)!;
      const updates: Record<string, unknown> = {};
      if (def.libelle && existingRow.libelle !== def.libelle) updates.libelle = def.libelle;
      const categorieId = def.categorieCode ? catByCode.get(def.categorieCode) ?? null : null;
      const parentId = def.parentCode ? emplacementIdByCode.get(def.parentCode.toUpperCase()) : null;
      if (def.categorieCode && existingRow.categorieId !== categorieId) updates.categorieId = categorieId ?? undefined;
      if (parentId !== undefined && existingRow.parentId !== parentId) updates.parentId = parentId ?? undefined;
      if (Object.keys(updates).length > 0) {
        await db.update(schema.emplacements).set({ ...updates, updatedAt: new Date() }).where(eq(schema.emplacements.id, existingRow.id));
        console.log(`Emplacement mis à jour: ${def.code}`);
      }
      skipped++;
      continue;
    }

    const parentId = def.parentCode ? emplacementIdByCode.get(def.parentCode.toUpperCase()) : null;
    if (def.parentCode && !parentId) {
      console.warn(`Parent introuvable pour ${def.code} → ${def.parentCode}, insertion différée`);
      continue;
    }

    const profondeur = parentId ? 1 + (existing.find(e => e.id === parentId)?.profondeur ?? 0) : 0;

    const [row] = await db.insert(schema.emplacements).values({
      agenceId: agence.id,
      type: def.type,
      code: def.code,
      libelle: def.libelle,
      parentId,
      profondeur,
      categorieId: def.categorieCode ? catByCode.get(def.categorieCode) ?? null : null,
      sousSystemeId: def.sousSystemeCode ? ssByCode.get(def.sousSystemeCode) ?? null : null,
      niveauId: def.niveauCode ? nivByCode.get(def.niveauCode) ?? null : null,
      classeId: def.classeCode ? classeByCode.get(def.classeCode) ?? null : null,
      filiereId: def.filiereCode ? filByCode.get(def.filiereCode) ?? null : null,
      ordre: def.ordre ?? 0,
    }).returning();

    if (row) {
      emplacementIdByCode.set(codeKey, row.id);
      existingCodes.add(codeKey);
      created++;
    }
  }

  // 5. Auto-vérification
  const after = await db.select().from(schema.emplacements).where(eq(schema.emplacements.agenceId, agence.id));
  const codesSansClasseAttendue = new Set(["MFR-MAT", "MFR-SUP", "MEN-NUR", "MEN-HIGH"]);
  const manuelsSansClasse = after.filter(e =>
    e.type === "ETAGERE" &&
    (e.code ?? "").startsWith("M") &&
    !e.classeId &&
    !codesSansClasseAttendue.has(e.code ?? "")
  );
  const etageresNonClassees = after.filter(e => e.type === "ETAGERE" && !e.classeId);

  console.log("\n=== RÉSULTAT SEED RAYONS ===");
  console.log(`Créés: ${created}, existants (inchangés): ${skipped}`);
  console.log(`Total emplacements agence: ${after.length}`);
  const byType: Record<string, number> = {};
  for (const e of after) byType[e.type] = (byType[e.type] ?? 0) + 1;
  console.log(`Par type: ${JSON.stringify(byType)}`);
  if (manuelsSansClasse.length > 0) {
    console.warn(`⚠ Étageres manuels sans classe liée: ${manuelsSansClasse.map(e => e.code).join(", ")}`);
  } else {
    console.log("✓ Toutes les étagères manuels ont une classe liée");
  }
  console.log(`Étagères sans classe (hors-éducatif + maternelle/université): ${etageresNonClassees.length} (attendu: 26)`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
