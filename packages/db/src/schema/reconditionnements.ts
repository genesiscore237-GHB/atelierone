import { pgTable, integer, timestamp, varchar, uuid, numeric } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { unitesMesure } from "./unites_mesure";
import { utilisateurs } from "./utilisateurs";

export const reconditionnements = pgTable("reconditionnements", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  uniteSourceId: uuid("unite_source_id").notNull().references(() => unitesMesure.id),
  quantiteSource: integer("quantite_source").notNull(),
  uniteCibleId: uuid("unite_cible_id").notNull().references(() => unitesMesure.id),
  quantiteGeneree: numeric("quantite_generee", { precision: 12, scale: 2 }).notNull(),
  facteurConversion: integer("facteur_conversion").notNull(),
  effectuePar: integer("effectue_par").notNull().references(() => utilisateurs.id),
  motif: varchar("motif", { length: 255 }),
  dateReconditionnement: timestamp("date_reconditionnement").defaultNow(),
});
