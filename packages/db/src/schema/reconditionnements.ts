import { pgTable, integer, timestamp, varchar, uuid, numeric } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { unitesMesure } from "./unites_mesure";
import { utilisateurs } from "./utilisateurs";

/**
 * RECONDITIONNEMENT — Transformation d'une grande unité en unités plus petites.
 * Inter-articles : fût 200L (produitSourceId) → bidons 5L (produitCibleId).
 * Historique : produitSourceId conserve l'ancien `produitId` (compatibilité).
 */
export const reconditionnements = pgTable("reconditionnements", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  // Article source (fût / grande unité) — ancien nom : produitId
  produitSourceId: integer("produit_source_id").notNull().references(() => produits.id),
  uniteSourceId: uuid("unite_source_id").notNull().references(() => unitesMesure.id),
  quantiteSource: numeric("quantite_source", { precision: 12, scale: 2 }).notNull(),
  // Article cible (bidon 5L / unité plus petite) — NULL pour compatibilité ancien format
  produitCibleId: integer("produit_cible_id").references(() => produits.id),
  uniteCibleId: uuid("unite_cible_id").notNull().references(() => unitesMesure.id),
  quantiteGeneree: numeric("quantite_generee", { precision: 12, scale: 2 }).notNull(),
  // Ratio explicite (ex. 1 fût 200L → 40 bidons 5L) ou dérivé des facteurs d'unités
  facteurConversion: numeric("facteur_conversion", { precision: 12, scale: 4 }),
  effectuePar: integer("effectue_par").notNull().references(() => utilisateurs.id),
  motif: varchar("motif", { length: 255 }),
  groupeOperationId: uuid("groupe_operation_id"),
  dateReconditionnement: timestamp("date_reconditionnement").defaultNow(),
});
