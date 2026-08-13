import { pgTable, uuid, integer, numeric, boolean, timestamp, varchar, unique } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { unitesMesure } from "./unites_mesure";

export const produitUnites = pgTable("produit_unites", {
  id: uuid("id").defaultRandom().primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  uniteId: uuid("unite_id").notNull().references(() => unitesMesure.id),
  parentId: uuid("parent_id").references(() => produitUnites.id),
  facteurVersParent: numeric("facteur_vers_parent", { precision: 12, scale: 6 }).notNull().default("1"),
  facteurVersBase: numeric("facteur_vers_base", { precision: 12, scale: 6 }),
  prixAchat: numeric("prix_achat", { precision: 12, scale: 2 }),
  prixVente: numeric("prix_vente", { precision: 12, scale: 2 }),
  estUniteBase: boolean("est_unite_base").default(false),
  estUniteAchatDefaut: boolean("est_unite_achat_defaut").default(false),
  estUniteVenteDefaut: boolean("est_unite_vente_defaut").default(false),
  statut: varchar("statut", { length: 20 }).default("CREE"),
  autoriserDeconditionnementVente: boolean("autoriser_deconditionnement_vente").default(false),
  dateDebutValidite: timestamp("date_debut_validite").defaultNow(),
  dateFinValidite: timestamp("date_fin_validite"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  unqProduitUnite: unique("unq_produit_unites_produit_unite").on(t.produitId, t.uniteId),
}));
