import { pgTable, integer, timestamp, numeric, unique, serial } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { lots } from "./lots";

export const stocksLots = pgTable("stocks_lots", {
  id: serial("id").primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  unqProduitAgenceLot: unique("unq_stocks_lots_produit_agence_lot").on(t.produitId, t.agenceId, t.lotId),
}));