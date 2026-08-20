import { pgTable, serial, integer, varchar, numeric, timestamp, text } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { produits } from "./produits";
import { ordresReparation } from "./ordres_reparation";
import { utilisateurs } from "./utilisateurs";

/**
 * ÉCHANGE STANDARD (CORES) — specs V2 §04 processus 8, §05 règle 9.
 * Sortie de la pièce neuve (liée à un OR) + enregistrement de la coquille
 * retournée (valeur_core = dépôt) → suivi du dépôt.
 * Statuts : EN_ATTENTE | COQUILLE_RETOURNEE | COQUILLE_PERDUE
 */
export const echangesCores = pgTable("echanges_cores", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  orId: integer("or_id").references(() => ordresReparation.id),
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull().default("1"),
  // Valeur du dépôt (coquille) remboursée au retour
  valeurCore: numeric("valeur_core", { precision: 12, scale: 2 }).notNull().default("0"),
  statut: varchar("statut", { length: 30 }).default("EN_ATTENTE"),
  dateEchange: timestamp("date_echange").defaultNow(),
  dateRetourCoquille: timestamp("date_retour_coquille"),
  // Référence du mouvement de sortie lié
  mouvementId: integer("mouvement_id"),
  motif: text("motif"),
  creePar: integer("cree_par").references(() => utilisateurs.id),
});