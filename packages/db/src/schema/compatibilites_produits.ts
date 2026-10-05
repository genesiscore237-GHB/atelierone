import { pgTable, serial, integer, varchar, text, date } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { produitArticles } from "./produit_articles";

/**
 * COMPATIBILITÉ VÉHICULE (extrêmement granulaire, V3) :
 * un article peut être compatible avec plusieurs véhicules (POSITIVE) et
 * exclu pour certains (NEGATIVE). L'équivalence n'implique JAMAIS la
 * compatibilité. La contrainte unique a été retirée (contrôle applicatif)
 * pour permettre POSITIVE + NEGATIVE sur le même véhicule.
 */
export const compatibilitesProduits = pgTable("compatibilites_produits", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").references(() => produitArticles.id, { onDelete: "cascade" }),
  produitId: integer("produit_id").references(() => produits.id, { onDelete: "cascade" }),
  // POSITIVE (compatible avec) | NEGATIVE (compatible sauf avec)
  typeCompat: varchar("type_compat", { length: 10 }).default("POSITIVE"),
  marque: varchar("marque", { length: 80 }).notNull(),
  modele: varchar("modele", { length: 120 }).notNull(),
  anneeDe: integer("annee_de"),
  anneeA: integer("annee_a"),
  dateProductionDebut: date("date_production_debut"),
  dateProductionFin: date("date_production_fin"),
  motorisation: varchar("motorisation", { length: 80 }),
  version: varchar("version", { length: 120 }),
  generation: varchar("generation", { length: 120 }),
  carburant: varchar("carburant", { length: 30 }),
  cylindree: varchar("cylindree", { length: 30 }),
  puissanceKw: varchar("puissance_kw", { length: 30 }),
  codeMoteur: varchar("code_moteur", { length: 60 }),
  boite: varchar("boite", { length: 40 }),
  codeBoite: varchar("code_boite", { length: 60 }),
  transmission: varchar("transmission", { length: 40 }),
  carrosserie: varchar("carrosserie", { length: 40 }),
  nbPortes: integer("nb_portes"),
  normeEuro: varchar("norme_euro", { length: 20 }),
  codeChassis: varchar("code_chassis", { length: 60 }),
  typeFreinage: varchar("type_freinage", { length: 40 }),
  diametreFrein: varchar("diametre_frein", { length: 30 }),
  codesPr: text("codes_pr"),
  marche: varchar("marche", { length: 40 }),
  position: varchar("position", { length: 40 }),
  refOem: varchar("ref_oem", { length: 160 }),
  refEquivalente: varchar("ref_equivalente", { length: 160 }),
  restrictions: text("restrictions"),
  notes: text("notes"),
});