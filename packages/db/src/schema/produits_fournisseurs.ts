import { pgTable, serial, integer, varchar, numeric, timestamp, boolean, uuid } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { fournisseurs } from "./fournisseurs";
import { unitesMesure } from "./unites_mesure";

export const produitsFournisseurs = pgTable("produits_fournisseurs", {
  id: serial("id").primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  fournisseurId: integer("fournisseur_id").notNull().references(() => fournisseurs.id),
  uniteId: uuid("unite_id").references(() => unitesMesure.id),
  referenceFournisseur: varchar("reference_fournisseur", { length: 255 }),
  prixAchat: numeric("prix_achat", { precision: 12, scale: 2 }),
  delaiApprovisionnement: integer("delai_approvisionnement"),
  estPrincipal: boolean("est_principal").default(false),
  // V3 : conditionnement spécifique fournisseur (ex. carton de 12 vs carton de 24)
  uniteConditionnement: uuid("unite_conditionnement").references(() => unitesMesure.id),
  facteurConditionnement: numeric("facteur_conditionnement", { precision: 12, scale: 2 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
