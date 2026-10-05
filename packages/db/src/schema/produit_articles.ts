import { pgTable, serial, integer, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { categories } from "./categories";

/**
 * ARTICLE (produit conceptuel) — la référence commerciale générique.
 * Ex. « Plaquette de frein », « Huile moteur 5W30 ».
 * Les unités réellement stockables / achetables sont les VARIANTES (table
 * `produits` avec `article_id` → cet article).
 *
 * Produit / pièce :  1 article → N variantes commerciales (marque, référence,
 *                     conditionnement) → stock par variante.
 * Outillage :        1 article (modèle) → N exemplaires physiques (chacun avec
 *                    son état, son emplacement, son historique de prêt).
 */
export const produitArticles = pgTable("produit_articles", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).unique(), // ex. ART-0001
  designation: varchar("designation", { length: 255 }).notNull(),
  designationCourte: varchar("designation_courte", { length: 200 }),
  description: text("description"),
  categorieId: integer("categorie_id").references(() => categories.id),
  typeProduit: varchar("type_produit", { length: 20 }).default("PIECE"), // PIECE | CONSOMMABLE | OUTIL | EQUIPEMENT | SERVICE | FOURNITURE | KIT
  imageUrl: varchar("image_url", { length: 500 }),
  // V3 : nature commerciale par défaut héritée par les variantes (état × origine × relation)
  etatProduitDefaut: varchar("etat_produit_defaut", { length: 20 }).default("NEUF"),
  origineProduitDefaut: varchar("origine_produit_defaut", { length: 20 }).default("AFTERMARKET"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});