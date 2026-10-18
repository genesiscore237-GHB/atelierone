import { pgTable, serial, integer, numeric, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { agences } from "./agences";

/**
 * PARAMÈTRES DE GESTION DU STOCK — par agence (migration 0014).
 *
 * Ce qui est une propriété du GESTIONNAIRE, pas de l'article : fenêtre
 * d'analyse de la consommation, délai fournisseur de repli, couverture de
 * sécurité, alertes DLC, dormance, méthode de valorisation.
 *
 * Ce qui est une propriété de l'ARTICLE — seuils d'alerte, seuil critique,
 * stock maximum, délai DLC — reste sur `produits`, où il figure déjà sur
 * les 319 références. Ne pas dupliquer les deux.
 *
 * Voir DOC/MODULES/module_stock_outillage/00_Cadrage.md § 3 et § 4.
 */
export const parametresStock = pgTable("parametres_stock", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id, { onDelete: "cascade" }),

  // ── Prévision de consommation ───────────────────────────────────────────
  /** Fenêtre d'analyse. 90 jours : 30 est trop court pour un garage
   *  saisonnier, 365 confondrait l'historique du stock avec celui de
   *  l'agencement. */
  joursHistoriqueConsommation: integer("jours_historique_consommation").notNull().default(90),

  /** Délai fournisseur de REPLI, tant que le délai réel n'a pas été
   *  mesuré sur les commandes du garage. C'est la donnée qui ment le plus
   *  souvent — donc celle qu'il faut deviner le moins possible. */
  delaiApprovisionnementDefautJours: integer("delai_approvisionnement_defaut_jours").notNull().default(7),

  /** Stock de sécurité en JOURS DE CONSOMMATION, pas en quantité : 3
   *  filtres et 3 bidons d'huile n'ont pas le même sens. */
  joursStockSecurite: numeric("jours_stock_securite", { precision: 6, scale: 2 }).notNull().default("15"),

  // ── Périmption et dormance ──────────────────────────────────────────────
  /** Filet quand le produit ne porte pas de `dlc_jours`. */
  dlcAlerteJours: integer("dlc_alerte_jours").notNull().default(30),
  /** Sans mouvement depuis N jours, l'article est dormant. */
  stockDormantJours: integer("stock_dormant_jours").notNull().default(90),

  // ── Valorisation ────────────────────────────────────────────────────────
  /** `CUMP` tant qu'aucune valorisation FIFO n'est écrite. On ne déclare
   *  pas une FIFO qu'on n'a pas implémentée. */
  methodeValorisation: varchar("methode_valorisation", { length: 10 }).notNull().default("CUMP"),

  // ── Seuils appliqués à un article créé sans seuil explicite ─────────────
  seuilAlerteDefaut: integer("seuil_alerte_defaut").notNull().default(5),
  seuilCritiqueDefaut: integer("seuil_critique_defaut").notNull().default(2),

  /** Le scan est un accélérateur, jamais une condition d'utilisation :
   *  un garage sans imprimante d'étiquettes doit pouvoir travailler
   *  intégralement à la frappe. */
  scanCodeBarres: boolean("scan_code_barres").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});