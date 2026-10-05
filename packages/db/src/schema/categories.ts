import { pgTable, serial, integer, varchar, timestamp, boolean } from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: varchar("description", { length: 500 }),
  parentId: integer("parent_id").references(() => categories.id),
  typeBranche: varchar("type_branche", { length: 20 }),
  // Catalogue universel (P0) : colonnes d'ontologie (nullable)
  domaine: varchar("domaine", { length: 50 }),
  niveauOntologie: varchar("niveau_ontologie", { length: 20 }).default("CATEGORIE"), // FAMILLE | CATEGORIE | SOUS | TYPE
  rendererHint: varchar("renderer_hint", { length: 40 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
