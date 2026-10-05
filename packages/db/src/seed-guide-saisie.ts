import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import {
  categories,
  attributDefinitions,
  guideCategories,
  guideSteps,
  guideRules,
  guideExamples,
  guideCommonErrors,
  guideSearchAliases,
} from "./schema";
import { eq, and, or, sql } from "drizzle-orm";

requireLocalOrForced("seed-guide-saisie (PHASE 5, Module 1)");

const CAT_FILTRE_HUILE = 17;
const CAT_OUTILLAGE = 11;
const PRODUIT_EXEMPLE_FILTRE = 178;

async function seedTaxonomie() {
  await db.execute(sql`
    WITH RECURSIVE depth AS (
      SELECT id, 0 AS d FROM categories WHERE parent_id IS NULL
      UNION ALL
      SELECT c.id, depth.d + 1 FROM categories c JOIN depth ON c.parent_id = depth.id
    )
    UPDATE categories SET
      niveau_ontologie = COALESCE(
        NULLIF(niveau_ontologie, 'CATEGORIE'),
        CASE WHEN depth.d = 0 THEN 'FAMILLE' WHEN depth.d = 1 THEN 'CATEGORIE' ELSE 'TYPE' END
      ),
      domaine = COALESCE(domaine,
        CASE
          WHEN type_branche IN ('OUTIL', 'SERVICE', 'EQUIPEMENT') THEN 'ATELIER'
          ELSE 'AUTOMOBILE'
        END
      )
    FROM depth WHERE categories.id = depth.id
  `);
  console.log("Taxonomie : domaine + niveauOntologie posés (idempotent).");
}

const DEFS_VAL: {
  cle: string;
  modeleValeur: Record<string, unknown>;
  explication: string;
}[] = [];

async function seedDefs() {
  const defsVal: typeof DEFS_VAL = [
    {
      cle: "filetage",
      modeleValeur: { exemples: ["3/4-16", "M18x1.5", "M20x1.5"], format: "diamètre/pas — 3/4-16 (impérial) ou M18x1.5 (métrique)" },
      explication: "Filetage = diamètre et pas du pas de vis. En impérial « 3/4-16 » = 3/4 de pouce, 16 filets par pouce. En métrique « M18x1.5 » = 18 mm de diamètre, pas de 1,5 mm. Ne jamais confondre avec la taille de clé.",
    },
    {
      cle: "type_filtre",
      modeleValeur: { exemples: ["SPIN_ON", "CARTRIDGE", "BOLT_ON"], format: "SPIN_ON | CARTRIDGE | BOLT_ON" },
      explication: "Type de fixation : SPIN_ON vissé sur le bloc moteur ; CARTRIDGE cartouche à remplacer dans son porte-filtre ; BOLT_ON monté avec boulon central.",
    },
    {
      cle: "diametre_exterieur",
      modeleValeur: { exemples: ["65 mm", "76 mm", "93 mm"], format: "nombre + unité (mm)" },
      explication: "Diamètre extérieur de la cartouche filtrante, exprimé en millimètres.",
    },
    {
      cle: "plage_couple",
      modeleValeur: { exemples: ["10–100 N·m", "30–210 N·m"], format: "min–max en N·m" },
      explication: "Plage de serrage de la clé dynamométrique en Newton-mètre. Toujours en N·m, jamais en daN·m.",
    },
    {
      cle: "carre_transmission",
      modeleValeur: { exemples: ["1/4\"", "3/8\"", "1/2\"", "3/4\""], format: "pouce (1/4, 3/8, 1/2, 3/4)" },
      explication: "Taille du carré d'entraînement de la douille. 1/2 standard atelier, 3/8 visserie fine, 3/4 mécanique lourde.",
    },
    {
      cle: "precision",
      modeleValeur: { exemples: ["± 3 %", "± 1 N·m"], format: "± tolérance (en % ou en N·m)" },
      explication: "Précision de mesure de l'outil de contrôle, validée par calibration périodique.",
    },
    {
      cle: "calibrable",
      modeleValeur: { exemples: [true, false], format: "oui/non" },
      explication: "L'outil est-il soumis à une calibration périodique (norme ISO 6789) ?",
    },
    {
      cle: "certification",
      modeleValeur: { exemples: [true, false], format: "oui/non" },
      explication: "Certificat de calibration délivré. Une certification périmée rend l'outil non conforme.",
    },
  ];
  for (const v of defsVal) {
    await db
      .update(attributDefinitions)
      .set({ modeleValeur: v.modeleValeur as any, explication: v.explication })
      .where(eq(attributDefinitions.cle, v.cle));
  }
  console.log(`attribut_definitions : modèle + explication posés sur ${defsVal.length} clés.`);
}

async function seedHeaders() {
  const headers = [
    { categorieId: CAT_FILTRE_HUILE, typeProduit: "PIECE", titre: "Filtre à huile — montage et filetage", contexte: "Le couple conducteur est : véhicule compatible + filetage exact. Un même type de montage (SPIN_ON) couvre des filetages multiples ; le filetage est la donnée la plus discriminante.", ordre: 1 },
    { categorieId: null, typeProduit: "OUTIL", titre: "Outillage — modèle vs exemplaire", contexte: "On enregistre d'abord un MODÈLE (la référence outil) puis des EXEMPLAIRES (unités physiques : n°, acquisition, calibration, prêts). On ne supprime jamais un exemplaire perdu ou volé : statut PERDU / VOLE / REFORME.", ordre: 10 },
    { categorieId: null, typeProduit: "PIECE", titre: "Pièce de rechange — règles générales", contexte: "Renseignez la référence fabricant (marque du produit) ET la référence OEM (code équipementier d'origine) quand ils existent. Les deux ont des rôles différents.", ordre: 20 },
    { categorieId: null, typeProduit: "CONSOMMABLE", titre: "Consommable — conditionnement", contexte: "Indiquez la contenance/conditionnement commercial (5 L, bidon, cartouche) : il conditionne le stock et la conversion d'unités.", ordre: 30 },
  ];
  for (const h of headers) {
    await db
      .insert(guideCategories)
      .values(h as any)
      .onConflictDoUpdate({ target: [guideCategories.categorieId, guideCategories.typeProduit], set: { titre: h.titre, contexte: h.contexte as any, ordre: h.ordre, isActive: true } });
  }
  console.log("guide_categories : 4 en-têtes (filtre huile + fallbacks).");
}

const STEPS_FILTRE: (typeof guideSteps.$inferInsert)[] = [
  { categorieId: CAT_FILTRE_HUILE, ordre: 1, titre: "Identifier le type de montage", texte: "Choisissez le type de fixation du filtre dans la liste : SPIN_ON (vissé), CARTRIDGE (cartouche) ou BOLT_ON (à bol).", portee: "ARTICLE", champCle: "type_filtre", recommandation: "Un type SPIN_ON exige un filetage ; une cartouche exige la référence du porte-filtre si applicable." },
  { categorieId: CAT_FILTRE_HUILE, ordre: 2, titre: "Relever le filetage et le diamètre", texte: "Notez le filetage exact (ex. 3/4-16) puis le diamètre extérieur en mm (ex. 76 mm).", portee: "VARIANTE", champCle: "filetage", recommandation: "En cas de doute, mesurez avec un pied à coulisse (pas en filets/pouce) plutôt que d'inférer depuis le type de montage." },
  { categorieId: CAT_FILTRE_HUILE, ordre: 3, titre: "Préciser la compatibilité véhicules", texte: "Ajoutez les compatibilités marque → modèle → motorisation. Une variante peut être compatible avec plusieurs véhicules.", portee: "VARIANTE", recommandation: "Vérifiez via la recherche catalogue (réf OEM, VIN) avant de créer une nouvelle variante." },
  { categorieId: CAT_FILTRE_HUILE, ordre: 4, titre: "Bague d'étanchéité et accessoires", texte: "Précisez si la bague/joint d'étanchéité est incluse et si un joint torique accompagne la cartouche.", portee: "ARTICLE" },
];

const RULES_FILTRE: (typeof guideRules.$inferInsert)[] = [
  { categorieId: CAT_FILTRE_HUILE, type: "VALEUR", condition: "type_filtre = SPIN_ON", conseil: "La famille la plus répandue : filetage 3/4-16 (impérial), M18x1.5 ou M20x1.5 (métrique).", preuve: "Gabarit Filtre à huile : le filetage pilote l'outil de démontage (clé à filtre) et le montage." },
  { categorieId: CAT_FILTRE_HUILE, type: "UNITE", condition: "diametre_exterieur", conseil: "Exprimez toujours le diamètre en millimètres (mm) et le couple en N·m.", preuve: "Conversion 1000 mm = 1 m est le seul référentiel accepté au niveau global." },
  { categorieId: CAT_FILTRE_HUILE, type: "PIEGE", condition: "champ filetage", conseil: "Ne confondez pas le filetage avec la taille de la clé : « M18x1.5 » est le filetage, la clé fait 24 mm.", preuve: "Erreur courante constatée dans les saisies : filetage reporté comme diamètre de clé." },
  { categorieId: CAT_FILTRE_HUILE, type: "PIEGE", condition: "références", conseil: "La référence OEM (ex. 90915-YZZD1) n'est PAS la référence fabricant du filtre (ex. Mann W712/92) : chacun porte son champ.", preuve: "REF_FAB_DANS_OEM : une confusion empêche la croisée catalogue." },
  { categorieId: CAT_FILTRE_HUILE, type: "ASSOCIATION", condition: "type_filtre = CARTRIDGE", conseil: "Une cartouche s'accompagne généralement d'un joint torique neuf et du guide de remplacement.", preuve: "Les fabricants préconisent le remplacement du joint à chaque changement." },
];

const ERRORS_FILTRE: (typeof guideCommonErrors.$inferInsert)[] = [
  { categorieId: CAT_FILTRE_HUILE, code: "FILETAGE_UNITE_INCOHERENTE", message: "Le filetage mélange unités (ex. « 3/4 × 16 »).", actions: "Uniformiser au format diamètre/pas : 3/4-16 (impérial) ou M18x1.5 (métrique).", severity: "warning" },
  { categorieId: CAT_FILTRE_HUILE, code: "REF_FAB_DANS_OEM", message: "La référence fabricant a été saisie dans le champ OEM (ou inversement).", actions: "Corriger dans les références : FABRICANT = marque du produit ; OEM = code d'origine équipementier.", severity: "error" },
  { categorieId: CAT_FILTRE_HUILE, code: "TYPE_FILTRE_MANQUANT", message: "Type de montage non renseigné.", actions: "Choisir SPIN_ON / CARTRIDGE / BOLT_ON avant de renseigner le filetage.", severity: "warning" },
];

const RULES_OUTILLAGE: (typeof guideRules.$inferInsert)[] = [
  { categorieId: CAT_OUTILLAGE, type: "PIEGE", condition: "niveau = EXEMPLAIRE", conseil: "Ne supprimez jamais un exemplaire perdu ou volé : passez-le en PERDU / VOLE / REFORME.", preuve: "Un exemplaire supprimé perd son historique de prêts et de calibration." },
  { categorieId: CAT_OUTILLAGE, type: "UNITE", condition: "plage_couple", conseil: "Exprimez le couple en N·m (jamais en daN·m ni en lbf·ft).", preuve: "Référentiel d'unités : conversion autorisée uniquement dans le même domaine." },
  { categorieId: CAT_OUTILLAGE, type: "VALEUR", condition: "calibrable = true", conseil: "Prévoir la prochaine calibration dès la création du modèle, avant de créer les exemplaires.", preuve: "Norme ISO 6789 : vérification périodique obligatoire pour les outils dynamométriques." },
];

const EXAMPLES_FILTRE: (typeof guideExamples.$inferInsert)[] = [
  { categorieId: CAT_FILTRE_HUILE, produitId: PRODUIT_EXEMPLE_FILTRE, libelle: "Mann W712/92 — variante de référence", motif: "Référence du gabarit : marque + réf fabricant + OEM (90915-YZZD1) + filetage cohérent.", estReference: true, ordre: 1 },
];

const ALIASES: (typeof guideSearchAliases.$inferInsert)[] = [
  { alias: "filtre a huile", categorieId: CAT_FILTRE_HUILE, type: "CATEGORIE" },
  { alias: "filtre huile", categorieId: CAT_FILTRE_HUILE, type: "CATEGORIE" },
  { alias: "filtre a combustion", categorieId: CAT_FILTRE_HUILE, type: "CATEGORIE" },
  { alias: "cartouche huile", categorieId: CAT_FILTRE_HUILE, type: "CATEGORIE" },
  { alias: "vissé", definitionId: undefined, type: "CHAMP" },
  { alias: "type de montage", definitionId: undefined, type: "CHAMP" },
  { alias: "clé dynamométrique", categorieId: CAT_OUTILLAGE, type: "CATEGORIE" },
  { alias: "cle dynamo", categorieId: CAT_OUTILLAGE, type: "CATEGORIE" },
];

async function seedGuideRows() {
  await db.delete(guideSteps).where(eq(guideSteps.categorieId, CAT_FILTRE_HUILE));
  await db.delete(guideRules).where(eq(guideRules.categorieId, CAT_FILTRE_HUILE));
  await db.delete(guideRules).where(eq(guideRules.categorieId, CAT_OUTILLAGE));
  await db.delete(guideCommonErrors).where(eq(guideCommonErrors.categorieId, CAT_FILTRE_HUILE));
  await db.delete(guideExamples).where(eq(guideExamples.categorieId, CAT_FILTRE_HUILE));
  await db.delete(guideSearchAliases).where(eq(guideSearchAliases.categorieId, CAT_FILTRE_HUILE));

  await db.insert(guideSteps).values(STEPS_FILTRE).onConflictDoNothing();
  await db.insert(guideRules).values([...RULES_FILTRE, ...RULES_OUTILLAGE]).onConflictDoNothing();
  await db.insert(guideCommonErrors).values(ERRORS_FILTRE).onConflictDoNothing();
  await db.insert(guideExamples).values(EXAMPLES_FILTRE).onConflictDoNothing();
  const aliasesVal = ALIASES.map((a) => ({ ...a, definitionId: a.definitionId ?? null }));
  await db.insert(guideSearchAliases).values(aliasesVal).onConflictDoNothing();
  console.log("Guide rows : étapes, règles, erreurs, exemples, alias posés.");
}

async function main() {
  await seedTaxonomie();
  await seedDefs();
  await seedHeaders();
  await seedGuideRows();
  console.log("SEED GUIDE PHASE 5 : OK (idempotent, rejouable).");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERREUR:", e?.message ?? e);
    process.exit(1);
  });