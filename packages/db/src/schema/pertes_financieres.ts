import { pgTable, integer, timestamp, varchar, numeric, text } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { produits } from "./produits";
import { utilisateurs } from "./utilisateurs";
import { lots } from "./lots";

export const pertesFinancieres = pgTable("pertes_financieres", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  produitId: integer("produit_id").references(() => produits.id),
  lotId: integer("lot_id").references(() => lots.id),
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull(),
  coutUnitaire: numeric("cout_unitaire", { precision: 12, scale: 2 }).notNull(),
  montantPerte: numeric("montant_perte", { precision: 12, scale: 2 }).notNull(),
  typePerte: varchar("type_perte", { length: 50 }).notNull(),
  motif: text("motif"),
  reference: varchar("reference", { length: 100 }),
  referenceType: varchar("reference_type", { length: 50 }),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  datePerte: timestamp("date_perte").defaultNow(),
});
