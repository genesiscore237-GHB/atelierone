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

  /**
   * Le contenu de ce conditionnement est-il CONFIRMÉ ?
   *
   * Un facteur seul ne dit rien de sa fiabilité : « 10 » peut venir d'un bon
   * du fournisseur, ou de quelqu'un qui a supposé qu'il y avait 10 filtres
   * dans la boîte. Le cahier des charges est explicite — si le contenu d'un
   * kit est inconnu, on l'enregistre comme une unité commerciale distincte,
   * on ne l'invente pas.
   *
   * Défaut `false` : une offre ajoutée aujourd'hui n'a pas encore été vérifiée
   * contre une source. Tant que ce n'est pas vrai, aucune conversion implicite
   * n'est autorisée (garde serveur + moteur).
   */
  contenuConfirme: boolean("contenu_confirme").notNull().default(false),

  /** Devise de l'offre. Absente avant la migration 0023 : le prix sans devise
   *  était un prix sans unité de compte. Backfill à la devise de l'agence. */
  devise: varchar("devise", { length: 10 }).default("XAF"),

  /** Minimum de commande CHEZ CE fournisseur. `produits.qte_min_commande`
   *  existe déjà mais vaut pour tous les fournisseurs confondus. */
  quantiteMinCommande: numeric("quantite_min_commande", { precision: 12, scale: 2 }),

  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
