import { pgTable, serial, integer, varchar, text, timestamp, numeric, unique, boolean, jsonb, uuid } from "drizzle-orm/pg-core";
import { produitArticles } from "./produit_articles";
import { produits } from "./produits";
import { utilisateurs } from "./utilisateurs";
import { unitesMesure } from "./unites_mesure";

/**
 * GARAGE — fiche article avancée (conception étendue V3).
 * Attributs dynamiques structurés (commun ARTICLE / différenciant VARIANTE),
 * documents liés, maintenance des équipements/outils (par exemplaire) et
 * calibration des instruments de mesure.
 */

/** Attributs techniques dynamiques (clé → valeur) au niveau ARTICLE (caractéristiques communes). */
export const articleAttributs = pgTable("article_attributs", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => produitArticles.id, { onDelete: "cascade" }),
  cle: varchar("cle", { length: 100 }).notNull(), // ex. "largeur", "indice_charge", "sae_grade"…
  valeur: text("valeur"),
  unite: varchar("unite", { length: 30 }),
  ordre: integer("ordre").notNull().default(0),
  // V3 : attribut structuré
  typeAttribut: varchar("type_attribut", { length: 20 }).default("TEXTE"), // 13 types (voir TYPES_ATTRIBUT)
  min: numeric("min", { precision: 12, scale: 2 }),
  max: numeric("max", { precision: 12, scale: 2 }),
  portee: varchar("portee", { length: 20 }).default("ARTICLE"), // ARTICLE | VARIANTE | EXEMPLAIRE | POSITION | VEHICULE | LOT | FOURNISSEUR
  // Catalogue universel (P0) : contraintes & exploitation
  obligatoire: boolean("obligatoire").notNull().default(false),
  searchable: boolean("searchable").notNull().default(false),
  filtrable: boolean("filtrable").notNull().default(false),
  comparable: boolean("comparable").notNull().default(false),
  liste: jsonb("liste").$type<string[]>().notNull().default([]), // options ENUM / MULTI_ENUM
  precision: numeric("precision", { precision: 8, scale: 4 }),
  aide: text("aide"),
  uniteId: uuid("unite_id").references(() => unitesMesure.id, { onDelete: "set null" }),
  // INCONNU vs NON APPLICABLE structurés + provenance / confiance
  statutValeur: varchar("statut_valeur", { length: 20 }).notNull().default("RENSEIGNE"), // RENSEIGNE | INCONNU | N_A
  provenance: varchar("provenance", { length: 30 }),
  source: varchar("source", { length: 160 }),
  niveauConfiance: varchar("niveau_confiance", { length: 20 }),
  sourceDate: timestamp("source_date"),
  sourcePar: integer("source_par").references(() => utilisateurs.id, { onDelete: "set null" }),
  preuve: text("preuve"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique("unq_article_attribut").on(t.articleId, t.cle)]);

/** Attributs techniques différenciants au niveau VARIANTE (ex. épaisseur Bosch 18 mm vs Brembo 17,5 mm). */
export const varianteAttributs = pgTable("variante_attributs", {
  id: serial("id").primaryKey(),
  varianteId: integer("variante_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  cle: varchar("cle", { length: 100 }).notNull(),
  valeur: text("valeur"),
  unite: varchar("unite", { length: 30 }),
  ordre: integer("ordre").notNull().default(0),
  typeAttribut: varchar("type_attribut", { length: 20 }).default("TEXTE"),
  min: numeric("min", { precision: 12, scale: 2 }),
  max: numeric("max", { precision: 12, scale: 2 }),
  portee: varchar("portee", { length: 20 }).default("VARIANTE"),
  // Catalogue universel (P0)
  obligatoire: boolean("obligatoire").notNull().default(false),
  searchable: boolean("searchable").notNull().default(false),
  filtrable: boolean("filtrable").notNull().default(false),
  comparable: boolean("comparable").notNull().default(false),
  liste: jsonb("liste").$type<string[]>().notNull().default([]),
  precision: numeric("precision", { precision: 8, scale: 4 }),
  aide: text("aide"),
  uniteId: uuid("unite_id").references(() => unitesMesure.id, { onDelete: "set null" }),
  statutValeur: varchar("statut_valeur", { length: 20 }).notNull().default("RENSEIGNE"),
  provenance: varchar("provenance", { length: 30 }),
  source: varchar("source", { length: 160 }),
  niveauConfiance: varchar("niveau_confiance", { length: 20 }),
  sourceDate: timestamp("source_date"),
  sourcePar: integer("source_par").references(() => utilisateurs.id, { onDelete: "set null" }),
  preuve: text("preuve"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique("unq_variante_attribut").on(t.varianteId, t.cle)]);

/** Documents liés à l'ARTICLE (fiche technique, manuel, certificat, facture, photo…). */
export const articleDocuments = pgTable("article_documents", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => produitArticles.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }), // FICHE_TECHNIQUE | MANUEL | CERTIFICAT | FACTURE | BON_LIVRAISON | PHOTO | AUTRE
  titre: varchar("titre", { length: 200 }),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Historique de maintenance des équipements / outils (pont, compresseur…). */
export const outillageMaintenance = pgTable("outillage_maintenance", {
  id: serial("id").primaryKey(),
  outilId: integer("outil_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }), // PREVENTIVE | CURATIVE | CONTROLE
  dateMaintenance: timestamp("date_maintenance").notNull().defaultNow(),
  prestataire: varchar("prestataire", { length: 200 }),
  cout: numeric("cout", { precision: 12, scale: 2 }),
  rapportUrl: text("rapport_url"),
  observations: text("observations"),
  prochaineMaintenance: timestamp("prochaine_maintenance"),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Calibration / étalonnage des instruments de mesure (clés dynamométriques, multimètres…). */
export const outillageCalibration = pgTable("outillage_calibration", {
  id: serial("id").primaryKey(),
  outilId: integer("outil_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  dateCalibration: timestamp("date_calibration").notNull().defaultNow(),
  organisme: varchar("organisme", { length: 200 }),
  certificat: varchar("certificat", { length: 100 }),
  resultat: varchar("resultat", { length: 30 }), // CONFORME | NON_CONFORME | AVEC_RESERVES
  tolerance: varchar("tolerance", { length: 60 }),
  prochaineCalibration: timestamp("prochaine_calibration"),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});