import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";

/**
 * ÉQUIVALENCES / SUPERSESSION entre articles (specs V2 §02).
 * Un article peut être remplacé par un équivalent (nouvelle référence),
 * interchangeable, ou être composant d'un kit.
 */
export const articleEquivalences = pgTable("article_equivalences", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  articleId: integer("article_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  articleEquivalentId: integer("article_equivalent_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  // SUPERSESSION | INTERCHANGEABLE | KIT_COMPOSANT
  type: varchar("type", { length: 30 }).default("SUPERSESSION"),
  priorite: integer("priorite").default(0),
  notes: varchar("notes", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});
