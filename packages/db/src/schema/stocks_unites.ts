import { pgTable, integer, timestamp, uuid, numeric, unique } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { unitesMesure } from "./unites_mesure";

export const stocksUnites = pgTable("stocks_unites", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  uniteId: uuid("unite_id").notNull().references(() => unitesMesure.id),
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  unqProduitAgenceUnite: unique("unq_stocks_unites_produit_agence_unite").on(t.produitId, t.agenceId, t.uniteId),
}));
