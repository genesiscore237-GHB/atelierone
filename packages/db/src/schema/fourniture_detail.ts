import { pgTable, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { produits } from "./produits";

export const fournitureDetail = pgTable("fourniture_detail", {
  produitId: integer("produit_id").primaryKey().references(() => produits.id, { onDelete: "cascade" }),
  typeFourniture: varchar("type_fourniture", { length: 50 }),
  createdAt: timestamp("date_creation").defaultNow(),
  updatedAt: timestamp("date_maj").defaultNow(),
});
