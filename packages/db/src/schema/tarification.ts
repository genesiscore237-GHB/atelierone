import { pgTable, uuid, varchar, timestamp, boolean, text, jsonb, integer, numeric } from "drizzle-orm/pg-core";

import { organisations } from "./platform";
import { produits } from "./produits";
import { utilisateurs } from "./utilisateurs";

export const reglesTarification = pgTable("regles_tarification", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisations.id),
  produitId: integer("produit_id").references(() => produits.id),
  typeRegle: varchar("type_regle", { length: 50 }).notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  conditions: jsonb("conditions"),
  valeur: numeric("valeur", { precision: 12, scale: 2 }),
  priorite: integer("priorite").default(0),
  estActive: boolean("est_active").default(true),
  dateDebut: timestamp("date_debut"),
  dateFin: timestamp("date_fin"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const promotions = pgTable("promotions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisations.id),
  nom: varchar("nom", { length: 255 }).notNull(),
  typePromo: varchar("type_promo", { length: 50 }).notNull(),
  conditions: jsonb("conditions"),
  valeur: numeric("valeur", { precision: 12, scale: 2 }),
  dateDebut: timestamp("date_debut").notNull(),
  dateFin: timestamp("date_fin").notNull(),
  estActive: boolean("est_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const approbations = pgTable("approbations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisations.id),
  typeRessource: varchar("type_ressource", { length: 50 }).notNull(),
  ressourceId: varchar("ressource_id", { length: 100 }),
  demandePar: integer("demande_par").notNull().references(() => utilisateurs.id),
  approuvePar: integer("approuve_par").references(() => utilisateurs.id),
  statut: varchar("statut", { length: 50 }).default("en_attente"),
  motif: text("motif"),
  createdAt: timestamp("created_at").defaultNow(),
  misAJourLe: timestamp("mis_a_jour_le").defaultNow(),
});


