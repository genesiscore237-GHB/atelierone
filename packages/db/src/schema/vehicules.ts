import { pgTable, serial, integer, varchar, text, numeric, date, timestamp, boolean } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { clients } from "./clients";

/**
 * VÉHICULES & PARC — fiche véhicule et suivi d'immobilisation.
 * Statuts d'immobilisation (statutImmobilisation) :
 * en_reception, en_diagnostic, en_reparation, attente_validation_client,
 * attente_piece_locale, piece_commandee_import, terminee_attente_paiement,
 * terminee_client_non_venu, transfere_site2, abandonne_contentieux, sorti
 */
export const vehicules = pgTable("vehicules", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  clientId: integer("client_id").references(() => clients.id),
  immatriculation: varchar("immatriculation", { length: 50 }).notNull(),
  marque: varchar("marque", { length: 100 }),
  modele: varchar("modele", { length: 100 }),
  annee: integer("annee"),
  couleur: varchar("couleur", { length: 50 }),
  numeroChassis: varchar("numero_chassis", { length: 100 }),
  kilometrage: integer("kilometrage"),
  carburant: varchar("carburant", { length: 30 }),
  typeVehicule: varchar("type_vehicule", { length: 30 }).default("voiture"), // voiture|utilitaire|poids_lourd|moto|autocar|autre
  statutImmobilisation: varchar("statut_immobilisation", { length: 50 }).default("en_reception"),
  siteId: integer("site_id").references(() => agences.id),
  emplacementId: integer("emplacement_id"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
