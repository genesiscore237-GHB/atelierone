import { pgTable, serial, integer, varchar, text, timestamp, boolean, unique, jsonb } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { utilisateurs } from "./utilisateurs";

/**
 * GARAGE — relations avancées du catalogue (V3).
 * 1. Références multiples par variante (fab, OEM, EAN, UPC, GTIN, ancienne…).
 * 2. Supersessions : une ancienne référence remplacée par une nouvelle.
 * 3. Substitutions : variante A remplaçable par variante B (avec confiance).
 * 4. Templates techniques : modèles de caractéristiques (données, pas de code).
 */

/** Références multiples d'une variante (une principale au maximum). */
export const produitReferences = pgTable(
  "produit_references",
  {
    id: serial("id").primaryKey(),
    varianteId: integer("variante_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
    typeRef: varchar("type_ref", { length: 30 }).notNull(), // FABRICANT | OEM | CONSTRUCTEUR | FOURNISSEUR | EAN | UPC | GTIN | ANCIENNE | AUTRE
    valeur: varchar("valeur", { length: 160 }).notNull(),
    // Forme normalisée (minuscules sans espace/ponctuation) persistée pour une
    // recherche de doublons rapide et déterministe (moteur catalogue universel).
    valeurNormalisee: varchar("valeur_normalisee", { length: 160 }),
    isPrincipale: boolean("is_principale").default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [unique("unq_ref_variante_valeur").on(t.varianteId, t.valeur)]
);

/** Supersession de référence : « 12345 remplacée par 67890 — utilisez 67890 ». */
export const produitSupersessions = pgTable("produit_supersessions", {
  id: serial("id").primaryKey(),
  ancienneVarianteId: integer("ancienne_variante_id").references(() => produits.id, { onDelete: "cascade" }),
  ancienneReference: varchar("ancienne_reference", { length: 160 }).notNull(),
  nouvelleVarianteId: integer("nouvelle_variante_id").references(() => produits.id, { onDelete: "cascade" }),
  nouvelleReference: varchar("nouvelle_reference", { length: 160 }).notNull(),
  fabricant: varchar("fabricant", { length: 100 }),
  dateRemplacement: timestamp("date_remplacement").defaultNow(),
  motif: varchar("motif", { length: 255 }),
  commandeAutorisee: boolean("commande_autorisee").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Substitution variante → variante (jamais automatique, validation requise). */
export const produitSubstitutions = pgTable("produit_substitutions", {
  id: serial("id").primaryKey(),
  varianteAId: integer("variante_a_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  varianteBId: integer("variante_b_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  // OFFICIEL | HOMOLOGUE | TECHNIQUE | COMMERCIAL | MANUELLE
  niveauConfiance: varchar("niveau_confiance", { length: 20 }).default("MANUELLE"),
  validePar: integer("valide_par").references(() => utilisateurs.id),
  motif: varchar("motif", { length: 255 }),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Templates techniques : définitions de caractéristiques par famille (données extensibles). */
export const attributTemplates = pgTable("attribut_templates", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 60 }).notNull().unique(),
  libelle: varchar("libelle", { length: 120 }).notNull(),
  // [{ cle, label, unite, typeAttribut, min, max, enum[] }]
  defs: jsonb("defs").$type<Array<Record<string, unknown>>>().default([]),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});