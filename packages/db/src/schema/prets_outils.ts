import { pgTable, serial, integer, varchar, text, timestamp, boolean, uuid } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { produits } from "./produits";
import { employes } from "./employes";
import { outilsExemplaires } from "./outils_exemplaires";

/**
 * OUTILLAGE & MATÉRIEL — prêt d'outils aux techniciens.
 * Un outil (typeProduit = OUTIL) est prêté (sortie) puis rendu (retour).
 * Les consommables (typeProduit = CONSOMMABLE) restent en stock classique.
 */
export const pretsOutils = pgTable("prets_outils", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  outilId: integer("outil_id").notNull().references(() => produits.id),
  technicienId: integer("technicien_id").notNull().references(() => employes.id),
  orId: integer("or_id"), // intervention liée (facultatif)
  motif: varchar("motif", { length: 255 }),
  dateSortie: timestamp("date_sortie").defaultNow(),
  sortiePar: integer("sortie_par").references(() => employes.id),
  dateRetour: timestamp("date_retour"),
  retourneLe: timestamp("retourne_le"),
  retournePar: integer("retourne_par").references(() => employes.id),
  etatRetour: varchar("etat_retour", { length: 30 }), // OK | ENDOMMAGE | PERDU
  /**
   * L'exemplaire physique prêté, et non le produit.
   *
   * NULL quand l'outil n'est PAS suivi individuellement (`produits.suivi_serie`
   * à faux) : c'est tout l'intérêt du drapeau. Pour un outil suivi, ce champ
   * est obligatoire — la règle est appliquée par le serveur, pas seulement
   * par l'écran.
   *
   * `ON DELETE SET NULL` : garder l'historique d'un prêt compte plus que la
   * suppression de la ligne qui l'a produit.
   */
  exemplaireId: integer("exemplaire_id").references(() => outilsExemplaires.id, {
    onDelete: "set null",
  }),
  remarque: text("remarque"),
  actif: boolean("actif").default(true), // false une fois rendu
  createdAt: timestamp("created_at").defaultNow(),
});