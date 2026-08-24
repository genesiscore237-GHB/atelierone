import { pgTable, serial, integer, varchar, text, timestamp, boolean, date, numeric } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { clients } from "./clients";
import { utilisateurs } from "./utilisateurs";
import { vehicules } from "./vehicules";

/**
 * CONTRATS DE MAINTENANCE — specs module Clients & Contrats.
 * Types : FORFAIT_MENSUEL | FORFAIT_ANNUEL | A_LA_DEMANDE | PREVENTIF_PROGRAMME | MIXTE
 * Statuts : BROUILLON | ACTIF | SUSPENDU | RESILIE | EXPIRE | RENOUVELLE
 */
export const contratsMaintenance = pgTable("contrats_maintenance", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  clientId: integer("client_id").notNull().references(() => clients.id),
  numeroContrat: varchar("numero_contrat", { length: 50 }).notNull().unique(),
  libelle: varchar("libelle", { length: 255 }).notNull(),
  typeContrat: varchar("type_contrat", { length: 40 }).default("A_LA_DEMANDE"), // FORFAIT_MENSUEL|FORFAIT_ANNUEL|A_LA_DEMANDE|PREVENTIF_PROGRAMME|MIXTE
  dateSignature: date("date_signature"),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin"),
  statut: varchar("statut", { length: 30 }).default("BROUILLON"), // BROUILLON|ACTIF|SUSPENDU|RESILIE|EXPIRE|RENOUVELLE
  montantForfait: numeric("montant_forfait", { precision: 12, scale: 2 }),
  frequenceFacturation: varchar("frequence_facturation", { length: 30 }).default("A_LA_DEMANDE"), // MENSUELLE|TRIMESTRIELLE|ANNUELLE|A_LA_DEMANDE
  delaiPaiementJours: integer("delai_paiement_jours").default(0),
  delaiInterventionHeures: integer("delai_intervention_heures"), // SLA
  couverture: varchar("couverture", { length: 120 }).default("PIECES_ET_MO"), // MO_SEULE|PIECES_ET_MO|PREVENTIF_UNIQUEMENT
  remisePourcent: numeric("remise_pourcent", { precision: 5, scale: 2 }).default("0"),
  conditionsParticulieres: text("conditions_particulieres"),
  dateResiliation: date("date_resiliation"),
  motifResiliation: text("motif_resiliation"),
  responsableInterne: integer("responsable_interne").references(() => utilisateurs.id),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Liaison contrat ↔ véhicules couverts.
 * Un véhicule peut être affecté temporairement par immatriculation (avant création dans le module Véhicules).
 */
export const contratsMaintenanceVehicules = pgTable("contrats_maintenance_vehicules", {
  id: serial("id").primaryKey(),
  contratId: integer("contrat_id").notNull().references(() => contratsMaintenance.id, { onDelete: "cascade" }),
  vehiculeId: integer("vehicule_id").references(() => vehicules.id, { onDelete: "set null" }),
  immatriculationTemp: varchar("immatriculation_temp", { length: 50 }),
  dateAjout: date("date_ajout").notNull(),
  dateRetrait: date("date_retrait"),
  actif: boolean("actif").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});