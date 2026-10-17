import { pgTable, serial, integer, varchar, numeric, date, timestamp, text } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { clients } from "./clients";
import { dettesClients } from "./dettes";
import { fournisseurs } from "./fournisseurs";
import { dettesFournisseurs } from "./dettes_fournisseurs";
import { vehicules } from "./vehicules";
import { ordresReparation } from "./ordres_reparation";

export const previsionsTresorerie = pgTable("previsions_tresorerie", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  type: varchar("type", { length: 50 }).notNull(),
  categorie: varchar("categorie", { length: 100 }),
  montantPrevu: numeric("montant_prevu", { precision: 12, scale: 2 }).notNull(),
  montantReel: numeric("montant_reel", { precision: 12, scale: 2 }),
  datePrevision: date("date_prevision").notNull(),
  dateRealisation: date("date_realisation"),
  libelle: varchar("libelle", { length: 255 }).notNull(),
  statut: varchar("statut", { length: 50 }).default("prevu"),
  referenceId: integer("reference_id"),
  referenceType: varchar("reference_type", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const relances = pgTable("relances", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id),
  // Migration 0014 — la table ne savait raccrocher une relance qu'à un client
  // ou une dette. Impossible d'écrire « ce véhicule a été relancé », qui est
  // la seule relance utile au garage.
  orId: integer("or_id").references(() => ordresReparation.id, { onDelete: "cascade" }),
  vehiculeId: integer("vehicule_id").references(() => vehicules.id, { onDelete: "cascade" }),
  detteId: integer("dette_id").references(() => dettesClients.id),
  fournisseurId: integer("fournisseur_id").references(() => fournisseurs.id),
  detteFournisseurId: integer("dette_fournisseur_id").references(() => dettesFournisseurs.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  type: varchar("type", { length: 50 }).notNull(),
  canal: varchar("canal", { length: 50 }).default("SYSTEME"),
  message: text("message").notNull(),
  statut: varchar("statut", { length: 50 }).default("EN_ATTENTE"),
  envoyeeLe: timestamp("envoyee_le"),
  luLe: timestamp("lu_le"),
  creePar: integer("cree_par"),
  createdAt: timestamp("created_at").defaultNow(),
});
