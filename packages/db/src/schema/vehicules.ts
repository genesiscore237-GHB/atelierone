import { pgTable, serial, integer, varchar, text, uniqueIndex, date, timestamp, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { agences } from "./agences";
import { clients } from "./clients";

/**
 * VÉHICULES & PARC — fiche véhicule et suivi d'immobilisation.
 * Statuts d'immobilisation (statutImmobilisation) :
 * en_reception, en_diagnostic, en_reparation, attente_validation_client,
 * attente_piece_locale, piece_commandee_import, terminee_attente_paiement,
 * terminee_client_non_venu, transfere_site2, abandonne_contentieux, sorti
 *
 * LOT R1 — `immatNorm` = plaque normalisée (trim + suppression espaces +
 * majuscules), colonne dérivée alimentée par les points d'écriture. Porte
 * l'unicité (agence, immat_norm) via index partiel : les véhicules sans
 * plaque (NULL) restent hors contrainte (D3 — aucune invention).
 */
export const vehicules = pgTable("vehicules", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  clientId: integer("client_id").references(() => clients.id),
  immatriculation: varchar("immatriculation", { length: 50 }).notNull(),
  immatNorm: varchar("immat_norm", { length: 50 }),
  marque: varchar("marque", { length: 100 }),
  modele: varchar("modele", { length: 100 }),
  version: varchar("version", { length: 100 }), // version / finition (fiche de réception)
  annee: integer("annee"),
  couleur: varchar("couleur", { length: 50 }),
  numeroChassis: varchar("numero_chassis", { length: 100 }),
  kilometrage: integer("kilometrage"),
  carburant: varchar("carburant", { length: 30 }),
  chauffeurNom: varchar("chauffeur_nom", { length: 100 }),
  chauffeurTelephone: varchar("chauffeur_telephone", { length: 30 }),
  typeVehicule: varchar("type_vehicule", { length: 30 }).default("voiture"),
  statutImmobilisation: varchar("statut_immobilisation", { length: 50 }).default("en_reception"),
  siteId: integer("site_id").references(() => agences.id),
  emplacementId: integer("emplacement_id"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // LOT R1 — unicité de la plaque par agence (uniquement si plaque renseignée).
  uqImmatNorm: uniqueIndex("uq_vehicules_agence_immat_norm")
    .on(t.agenceId, t.immatNorm)
    .where(sql`immat_norm IS NOT NULL`),
  idxImmatNorm: uniqueIndex("idx_vehicules_immat_norm").on(t.immatNorm),
}));
