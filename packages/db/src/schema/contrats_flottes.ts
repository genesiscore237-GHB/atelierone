import { pgTable, serial, integer, varchar, text, numeric, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { clients } from "./clients";
import { vehicules } from "./vehicules";

/**
 * CONTRATS FLOTTES — maintenance régulière pour entreprises sous contrat.
 */
export const contratsFlottes = pgTable("contrats_flottes", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  clientId: integer("client_id").notNull().references(() => clients.id),
  numero: varchar("numero", { length: 50 }).notNull().unique(),
  libelle: varchar("libelle", { length: 255 }).notNull(),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin"),
  typeMaintenance: varchar("type_maintenance", { length: 50 }).default("PREVENTIVE"), // PREVENTIVE | CORRECTIVE | MIXTE
  frequenceControle: varchar("frequence_controle", { length: 50 }),
  conditionsPaiement: varchar("conditions_paiement", { length: 50 }), // 15/30/45/60 jours
  remisePourcent: numeric("remise_pourcent", { precision: 5, scale: 2 }).default("0"),
  statut: varchar("statut", { length: 30 }).default("actif"), // actif | suspendu | expire
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * VÉHICULES RATTACHÉS À UN CONTRAT FLOTTE.
 */
export const contratsFlotteVehicules = pgTable("contrats_flotte_vehicules", {
  id: serial("id").primaryKey(),
  contratId: integer("contrat_id").notNull().references(() => contratsFlottes.id, { onDelete: "cascade" }),
  vehiculeId: integer("vehicule_id").notNull().references(() => vehicules.id),
  createdAt: timestamp("created_at").defaultNow(),
});
