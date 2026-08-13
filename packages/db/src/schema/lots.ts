import { pgTable, integer, varchar, timestamp, date, boolean, numeric, serial } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { fournisseurs } from "./fournisseurs";

export const lots = pgTable("lots", {
  id: serial("id").primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  numeroLot: varchar("numero_lot", { length: 100 }).notNull(),
  fournisseurId: integer("fournisseur_id").references(() => fournisseurs.id),
  statut: varchar("statut", { length: 50 }).default("disponible"),
  dateReception: timestamp("date_reception"),
  quantiteInitiale: integer("quantite_initiale"),
  coutUnitaire: numeric("cout_unitaire", { precision: 12, scale: 2 }),
  dateFabrication: date("date_fabrication"),
  datePeremption: date("date_peremption"),
  dateEntree: timestamp("date_entree").defaultNow(),
  isActive: boolean("is_active").default(true),
});
