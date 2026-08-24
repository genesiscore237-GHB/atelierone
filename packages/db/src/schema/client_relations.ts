import { pgTable, serial, integer, varchar, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { utilisateurs } from "./utilisateurs";

/** Contacts d'un client (1..n) — un seul contact principal par client. */
export const clientContacts = pgTable("client_contacts", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  nom: varchar("nom", { length: 255 }).notNull(),
  prenom: varchar("prenom", { length: 255 }),
  fonction: varchar("fonction", { length: 120 }),
  email: varchar("email", { length: 255 }),
  telephone: varchar("telephone", { length: 50 }),
  estContactPrincipal: boolean("est_contact_principal").default(false),
  estContactFacturation: boolean("est_contact_facturation").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Adresses d'un client (1..n) : FACTURATION | LIVRAISON | SIEGE | AUTRE. */
export const clientAdresses = pgTable("client_adresses", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).default("AUTRE"), // FACTURATION|LIVRAISON|SIEGE|AUTRE
  ligne1: varchar("ligne1", { length: 255 }),
  ligne2: varchar("ligne2", { length: 255 }),
  quartier: varchar("quartier", { length: 120 }),
  ville: varchar("ville", { length: 100 }),
  pays: varchar("pays", { length: 100 }).default("Cameroun"),
  estPrincipale: boolean("est_principale").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Historique des interactions avec le client (appels, visites, relances, réclamations…). */
export const clientInteractions = pgTable("client_interactions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 30 }).default("AUTRE"), // APPEL|VISITE|EMAIL|RELANCE|RECLAMATION|AUTRE
  dateHeure: timestamp("date_heure").defaultNow(),
  sujet: varchar("sujet", { length: 255 }),
  contenu: text("contenu"),
  createdBy: integer("created_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Audit trail des changements de statut client. */
export const clientStatutHistorique = pgTable("client_statut_historique", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  ancienStatut: varchar("ancien_statut", { length: 30 }),
  nouveauStatut: varchar("nouveau_statut", { length: 30 }).notNull(),
  motif: text("motif"),
  changePar: integer("change_par").references(() => utilisateurs.id),
  changeLe: timestamp("change_le").defaultNow(),
});