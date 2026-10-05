import { pgTable, serial, integer, varchar, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { produits } from "./produits";
import { produitArticles } from "./produit_articles";
import { attributDefinitions } from "./catalogue_ontologie";

/**
 * GUIDE DE SAISIE INTELLIGENT (PHASE 2 du plan Module 1).
 * Connaissance data-driven par catégorie : rien n'est codé en dur dans l'UI,
 * le `GuidePanel` rend ce bundle à ses 4 points d'entrée (catégorie, recherche,
 * fiche article, wizard).
 */

/** En-tête de Guide par catégorie et/ou type de produit (fallback transverse). */
export const guideCategories = pgTable(
  "guide_categories",
  {
    id: serial("id").primaryKey(),
    categorieId: integer("categorie_id").references(() => categories.id),
    typeProduit: varchar("type_produit", { length: 30 }),
    titre: varchar("titre", { length: 160 }).notNull(),
    contexte: text("contexte"),
    ordre: integer("ordre").default(0),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("unq_guide_cat").on(t.categorieId, t.typeProduit)]
);

/** Étapes de saisie ordonnées par catégorie. */
export const guideSteps = pgTable("guide_steps", {
  id: serial("id").primaryKey(),
  categorieId: integer("categorie_id")
    .notNull()
    .references(() => categories.id),
  ordre: integer("ordre").notNull(),
  titre: varchar("titre", { length: 160 }).notNull(),
  texte: text("texte").notNull(),
  portee: varchar("portee", { length: 20 }),
  champCle: varchar("champ_cle", { length: 100 }),
  recommandation: text("recommandation"),
});

/** Règles de saisie : valeurs canoniques, conversions, pièges. */
export const guideRules = pgTable("guide_rules", {
  id: serial("id").primaryKey(),
  categorieId: integer("categorie_id")
    .notNull()
    .references(() => categories.id),
  type: varchar("type", { length: 20 }).notNull(),
  condition: text("condition"),
  conseil: text("conseil").notNull(),
  preuve: text("preuve"),
  exempleId: integer("exemple_id").references(() => produits.id),
});

/** Bibliothèque d'exemples du référentiel (pointeurs vers produits/articles). */
export const guideExamples = pgTable("guide_examples", {
  id: serial("id").primaryKey(),
  categorieId: integer("categorie_id")
    .notNull()
    .references(() => categories.id),
  produitId: integer("produit_id").references(() => produits.id),
  articleId: integer("article_id").references(() => produitArticles.id),
  libelle: varchar("libelle", { length: 160 }).notNull(),
  motif: varchar("motif", { length: 255 }),
  estReference: boolean("est_reference").default(false),
  ordre: integer("ordre").default(0),
});

/** Erreurs courantes + correctifs. */
export const guideCommonErrors = pgTable("guide_common_errors", {
  id: serial("id").primaryKey(),
  categorieId: integer("categorie_id")
    .notNull()
    .references(() => categories.id),
  code: varchar("code", { length: 80 }).notNull(),
  message: varchar("message", { length: 255 }).notNull(),
  actions: text("actions").notNull(),
  severity: varchar("severity", { length: 10 }).default("warning"),
});

/** Alias vernaculaire → cible (catégorie ou définition d'attribut). */
export const guideSearchAliases = pgTable(
  "guide_search_aliases",
  {
    id: serial("id").primaryKey(),
    alias: varchar("alias", { length: 160 }).notNull(),
    categorieId: integer("categorie_id").references(() => categories.id),
    definitionId: integer("definition_id").references(() => attributDefinitions.id),
    type: varchar("type", { length: 20 }).notNull(),
  },
  (t) => [uniqueIndex("unq_guide_alias_active").on(t.alias, t.type)]
);

// ─────────────────────────────────────────────────────────────────────────────
// CONCEPT ARTICLE — outil d'aide intelligent à la saisie (Phase « Guide v2 »).
// Réutilise l'ontologie (categories + attribut_definitions) comme source de
// vérité ; ces tables n'ajoutent QUE les structures manquantes :
// variantes types, procédures de saisie, mapping champ → wizard, règles de
// modélisation, relations métier.
// ─────────────────────────────────────────────────────────────────────────────

/** Type de variante métier d'un concept article (ex : Filtre vissable vs cartouche). */
export const guideVariantTypes = pgTable("guide_variant_types", {
  id: serial("id").primaryKey(),
  categorieId: integer("categorie_id")
    .notNull()
    .references(() => categories.id),
  nom: varchar("nom", { length: 160 }).notNull(),
  description: text("description"),
  diffPrincipale: varchar("diff_principale", { length: 255 }),
  estReference: boolean("est_reference").default(false),
  ordre: integer("ordre").default(0),
  isActive: boolean("is_active").default(true),
});

/** Caractéristique qui différencie réellement les variantes (portée VARIANTE/EXEMPLAIRE). */
export const guideVariantDifferentiators = pgTable("guide_variant_differentiators", {
  id: serial("id").primaryKey(),
  variantTypeId: integer("variant_type_id")
    .notNull()
    .references(() => guideVariantTypes.id),
  cle: varchar("cle", { length: 100 }).notNull(),
  libelle: varchar("libelle", { length: 160 }).notNull(),
  portee: varchar("portee", { length: 20 }).default("VARIANTE"),
  uniteExemple: varchar("unite_exemple", { length: 80 }),
  statut: varchar("statut", { length: 20 }).default("OPTIONNEL"), // OBLIGATOIRE | RECOMMANDE | OPTIONNEL | SELON_PRODUIT
  exemple: varchar("exemple", { length: 160 }),
  ordre: integer("ordre").default(0),
});

/** Procédure de saisie complète (scénarios : NOM_SEUL, NOM_REF, EXISTANT). */
export const guideProcedures = pgTable("guide_procedures", {
  id: serial("id").primaryKey(),
  categorieId: integer("categorie_id")
    .notNull()
    .references(() => categories.id),
  scenario: varchar("scenario", { length: 20 }).default("NOM_SEUL"),
  titre: varchar("titre", { length: 200 }).notNull(),
  contexte: text("contexte"),
  ordre: integer("ordre").default(0),
  isActive: boolean("is_active").default(true),
});

/** Étape d'une procédure de saisie. */
export const guideProcedureSteps = pgTable("guide_procedure_steps", {
  id: serial("id").primaryKey(),
  procedureId: integer("procedure_id")
    .notNull()
    .references(() => guideProcedures.id),
  ordre: integer("ordre").notNull(),
  titre: varchar("titre", { length: 160 }).notNull(),
  ecran: varchar("ecran", { length: 160 }),
  action: text("action").notNull(),
  champs: text("champs"), // liste "clé=valeur" séparée par lignes
  verification: varchar("verification", { length: 255 }),
});

/** Mapping information métier → champ AtelierOne (niveau + statut + exemple). */
export const guideFieldMappings = pgTable("guide_field_mappings", {
  id: serial("id").primaryKey(),
  categorieId: integer("categorie_id")
    .notNull()
    .references(() => categories.id),
  variantTypeId: integer("variant_type_id").references(() => guideVariantTypes.id),
  informationMetier: varchar("information_metier", { length: 200 }).notNull(),
  portee: varchar("portee", { length: 20 }).default("VARIANTE"),
  champAtelierOne: varchar("champ_atelier_one", { length: 160 }),
  ecran: varchar("ecran", { length: 160 }),
  etape: varchar("etape", { length: 160 }),
  statut: varchar("statut", { length: 20 }).default("OPTIONNEL"),
  uniteExemple: varchar("unite_exemple", { length: 80 }),
  ordre: integer("ordre").default(0),
});

/** Règle de modélisation : « quand créer une variante / quand enrichir une référence ». */
export const guideModelingRules = pgTable("guide_modeling_rules", {
  id: serial("id").primaryKey(),
  categorieId: integer("categorie_id")
    .notNull()
    .references(() => categories.id),
  titre: varchar("titre", { length: 200 }).notNull(),
  enonce: text("enonce").notNull(),
  casExemple: varchar("cas_exemple", { length: 255 }),
  ordre: integer("ordre").default(0),
});

/** Relations métier : équivalent, substitut, compatible, successeur, incompatible, composant, kit. */
export const guideRelations = pgTable("guide_relations", {
  id: serial("id").primaryKey(),
  categorieId: integer("categorie_id")
    .notNull()
    .references(() => categories.id),
  typeRelation: varchar("type_relation", { length: 20 }).notNull(),
  definition: text("definition").notNull(),
  exemple: varchar("exemple", { length: 255 }),
  ordre: integer("ordre").default(0),
});