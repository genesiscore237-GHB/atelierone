import { pgTable, serial, integer, varchar, text, timestamp, unique } from "drizzle-orm/pg-core";
import { produitArticles } from "./produit_articles";

/**
 * RÉFÉRENCES ÉQUIVALENTES (cross-reference) — le magasinier cherche une
 * référence (OEM constructeur ou marque) et retrouve toutes les références
 * équivalentes du même article.
 * Ex. Filtre à huile : OEM Toyota 90915-YZZD2 ≡ MANN W 712/95 ≡ Bosch 0 986 …
 */
export const produitReferencesEquiv = pgTable(
  "produit_references_equiv",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id").notNull().references(() => produitArticles.id, { onDelete: "cascade" }),
    marque: varchar("marque", { length: 100 }),
    reference: varchar("reference", { length: 160 }).notNull(),
    note: varchar("note", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [unique("unq_ref_equiv_article").on(t.articleId, t.reference)]
);