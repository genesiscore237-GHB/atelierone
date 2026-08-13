import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const organisations = pgTable("organisations", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  logoUrl: text("logo_url"),
  telephone: varchar("telephone", { length: 50 }),
  adresse: text("adresse"),
  devise: varchar("devise", { length: 10 }).default("XAF"),
  fuseauHoraire: varchar("fuseau_horaire", { length: 50 }).default("Africa/Douala"),
  statut: varchar("statut", { length: 50 }).default("actif"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const clesApi = pgTable("cles_api", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisations.id),
  nom: varchar("nom", { length: 255 }).notNull(),
  clef: text("clef").notNull().unique(),
  permissions: jsonb("permissions").default([]),
  estActif: boolean("est_actif").default(true),
  expireLe: timestamp("expire_le"),
  createdAt: timestamp("created_at").defaultNow(),
  derniereUtilisationLe: timestamp("derniere_utilisation_le"),
});


