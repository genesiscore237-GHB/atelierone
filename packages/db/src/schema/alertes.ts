import { pgTable, uuid, integer, varchar, timestamp, boolean, text, jsonb } from "drizzle-orm/pg-core";
import { utilisateurs } from "./utilisateurs";
import { organisations } from "./platform";

export const alertes = pgTable("alertes", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisations.id),
  type: varchar("type", { length: 50 }).notNull(),
  severite: varchar("severite", { length: 50 }).default("MOYENNE"),
  titre: varchar("titre", { length: 255 }).notNull(),
  message: text("message").notNull(),
  donnees: jsonb("donnees"),
  estResolue: boolean("est_resolue").default(false),
  resolueLe: timestamp("resolue_le"),
  resoluePar: integer("resolue_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  alerteId: uuid("alerte_id").references(() => alertes.id),
  organisationId: integer("organisation_id").notNull().references(() => organisations.id),
  type: varchar("type", { length: 50 }).notNull(),
  destinataire: varchar("destinataire", { length: 255 }).notNull(),
  sujet: varchar("sujet", { length: 255 }),
  message: text("message").notNull(),
  statut: varchar("statut", { length: 50 }).default("EN_ATTENTE"),
  envoyeeLe: timestamp("envoyee_le"),
  erreurMessage: text("erreur_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reglesAutomatisation = pgTable("regles_automatisation", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisations.id),
  nom: varchar("nom", { length: 255 }).notNull(),
  description: text("description"),
  declencheur: varchar("declencheur", { length: 100 }).notNull(),
  conditions: jsonb("conditions"),
  actions: jsonb("actions"),
  estActive: boolean("est_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

