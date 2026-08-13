import { boolean, integer, pgTable, serial, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { produits } from "./produits";

export const codesBarres = pgTable("codes_barres", {
  id: serial("id").primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  valeur: varchar("valeur", { length: 100 }).notNull().unique(),
  estDefaut: boolean("est_defaut").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqProduitType: unique().on(table.produitId, table.type),
}));
