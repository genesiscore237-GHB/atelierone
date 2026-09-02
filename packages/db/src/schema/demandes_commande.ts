import { pgTable, serial, integer, varchar, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { utilisateurs } from "./utilisateurs";

/**
 * DEMANDE DE COMMANDE — « chercher avant de commander » :
 * quand une pièce n'existe pas dans le stock, le magasinier crée une demande
 * de commande (produit libre, pas encore en catalogue) — tracée, en attente.
 */
export const demandesCommande = pgTable("demandes_commande", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull(),
  designation: varchar("designation", { length: 255 }).notNull(),
  reference: varchar("reference", { length: 100 }),
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull().default("1"),
  unite: varchar("unite", { length: 40 }).default("pièce"),
  statut: varchar("statut", { length: 20 }).notNull().default("EN_ATTENTE"), // EN_ATTENTE | COMMANDEE | ANNULEE
  notes: text("notes"),
  creePar: integer("cree_par").references(() => utilisateurs.id),
  creeLe: timestamp("cree_le").defaultNow(),
});