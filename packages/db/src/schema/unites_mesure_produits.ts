import { pgTable, integer, boolean, uuid } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { unitesMesure } from "./unites_mesure";

export const unitesMesureProduits = pgTable("unites_mesure_produits", {
  id: uuid("id").defaultRandom().primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  uniteId: uuid("unite_id").notNull().references(() => unitesMesure.id),
  facteurConversion: integer("facteur_conversion").notNull().default(1),
  prixAchat: integer("prix_achat").default(0),
  prixVente: integer("prix_vente").default(0),
  estUniteAchatDefaut: boolean("est_unite_achat_defaut").default(false),
  estUniteVenteDefaut: boolean("est_unite_vente_defaut").default(false),
  estUniteBase: boolean("est_unite_base").default(false),
});
