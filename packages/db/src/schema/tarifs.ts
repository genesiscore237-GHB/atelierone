import { pgTable, serial, integer, varchar, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { produits } from "./produits";

export const tarifs = pgTable("tarifs", {
  id: serial("id").primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  prix: numeric("prix", { precision: 12, scale: 2 }).notNull(),
  label: varchar("label", { length: 255 }),
  quantiteMin: integer("quantite_min").default(1),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
