import { pgTable, integer, uuid, varchar, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { editeurs } from "./editeurs";

export const manuelScolaireDetail = pgTable("manuel_scolaire_detail", {
  produitId: integer("produit_id").primaryKey().references(() => produits.id, { onDelete: "cascade" }),
  typeManuel: varchar("type_manuel", { length: 20 }),
  editeurId: uuid("editeur_id").references(() => editeurs.id),
  prixReglemente: boolean("prix_reglemente").default(false),
  prixReglementeValeur: numeric("prix_reglemente_valeur", { precision: 12, scale: 2 }),
  anneeImport: uuid("annee_import"),
  createdAt: timestamp("date_creation").defaultNow(),
  updatedAt: timestamp("date_maj").defaultNow(),
});
