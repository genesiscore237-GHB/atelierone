import { pgTable, serial, integer, varchar, text, timestamp, boolean, jsonb, numeric, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { produits } from "./produits";
import { unitesMesure } from "./unites_mesure";

/**
 * CATALOGUE UNIVERSEL — P0 (fondations).
 * 1. attribut_definitions : ontologie des attributs par nœud catégorie/famille
 *    (rend « NEW CATEGORY WITHOUT CODE CHANGE » exploitable pour l'UI).
 * 2. unites_domaines / unites_conversions : conversions inter-échelles
 *    (1000 mm = 1 m exigible au niveau global, pas seulement par produit).
 */

/** Ontologie : gabarit d'attributs déclaré pour une catégorie / famille / type. */
export const attributDefinitions = pgTable(
  "attribut_definitions",
  {
    id: serial("id").primaryKey(),
    categorieId: integer("categorie_id").references(() => categories.id, { onDelete: "cascade" }),
    familleId: integer("famille_id").references(() => categories.id, { onDelete: "cascade" }),
    typeProduit: varchar("type_produit", { length: 20 }),
    portee: varchar("portee", { length: 20 }).notNull().default("ARTICLE"), // ARTICLE | VARIANTE | EXEMPLAIRE | POSITION | VEHICULE | LOT | FOURNISSEUR
    cle: varchar("cle", { length: 100 }).notNull(),
    libelle: varchar("libelle", { length: 160 }).notNull(),
    typeAttribut: varchar("type_attribut", { length: 20 }).notNull().default("TEXTE"), // 13 types (voir TYPES_ATTRIBUT)
    obligatoire: boolean("obligatoire").notNull().default(false),
    searchable: boolean("searchable").notNull().default(false),
    filtrable: boolean("filtrable").notNull().default(false),
    comparable: boolean("comparable").notNull().default(false),
    min: numeric("min", { precision: 12, scale: 2 }),
    max: numeric("max", { precision: 12, scale: 2 }),
    precision: numeric("precision", { precision: 8, scale: 4 }),
    liste: jsonb("liste").$type<string[]>().notNull().default([]), // options ENUM / MULTI_ENUM
    uniteId: uuid("unite_id").references(() => unitesMesure.id, { onDelete: "set null" }),
    aide: text("aide"),
    // Guide de saisie (PHASE 2) : modèle de valeur + explication longue (non-cassant)
    modeleValeur: jsonb("modele_valeur").$type<{
      exemples?: string[];
      regex?: string;
      format?: string;
      bornes?: { min?: number; max?: number };
    }>(),
    explication: text("explication"),
    ordre: integer("ordre").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("unq_attribut_definition_scope").on(t.categorieId, t.cle),
  ]
);

/** Domaine d'unités (longueur, masse, volume, température, pression, énergie…). */
export const unitesDomaines = pgTable("unites_domaines", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  libelle: varchar("libelle", { length: 50 }).notNull(),
  uniteBaseId: uuid("unite_base_id").notNull().references(() => unitesMesure.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Conversion d'une unité vers la base de son domaine (facteur ou formule). */
export const unitesConversions = pgTable(
  "unites_conversions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domaineId: uuid("domaine_id").notNull().references(() => unitesDomaines.id, { onDelete: "cascade" }),
    uniteId: uuid("unite_id").notNull().references(() => unitesMesure.id, { onDelete: "cascade" }),
    facteurVersBase: numeric("facteur_vers_base", { precision: 30, scale: 12 }),
    formuleDerivee: text("formule_derivee"),
    precision: numeric("precision", { precision: 8, scale: 4 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("unq_unites_conversions_domaine_unite").on(t.domaineId, t.uniteId)]
);