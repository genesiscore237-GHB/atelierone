import { pgTable, integer, numeric, timestamp, varchar, uuid } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { unitesMesure } from "./unites_mesure";
import { utilisateurs } from "./utilisateurs";

export const deconditionnements = pgTable("deconditionnements", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  uniteSourceId: uuid("unite_source_id").notNull().references(() => unitesMesure.id),
  quantiteSource: numeric("quantite_source", { precision: 12, scale: 2 }).notNull(),
  uniteCibleId: uuid("unite_cible_id").notNull().references(() => unitesMesure.id),
  quantiteGeneree: numeric("quantite_generee", { precision: 12, scale: 2 }).notNull(),
  effectuePar: integer("effectue_par").notNull().references(() => utilisateurs.id),
  motif: varchar("motif", { length: 255 }),
  dateDeconditionnement: timestamp("date_deconditionnement").defaultNow(),
});
