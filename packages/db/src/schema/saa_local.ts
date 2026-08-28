import { pgTable, serial, varchar, timestamp, boolean, text, integer } from "drizzle-orm/pg-core";

/**
 * MODULE SAAS — tables du GARAGE (pack installé chez le client).
 * Licence locale à décompte + état de synchronisation incrémentale.
 */

/** Licence locale : une seule ligne par site (le jeton signé reçu du central). */
export const licenceLocale = pgTable("licence_locale", {
  id: serial("id").primaryKey(),
  siteId: varchar("site_id", { length: 50 }).notNull(), // code du site (ex. GPJ-001)
  cleApi: varchar("cle_api", { length: 100 }), // clé d'ingestion reçue du central
  jeton: text("jeton").notNull(), // jeton signé par le central
  dateFin: timestamp("date_fin").notNull(),
  graceJours: integer("grace_jours").default(7),
  mode: varchar("mode", { length: 20 }).default("ESSAI"),
  dernierHeartbeat: timestamp("dernier_heartbeat"),
  derniereVerification: timestamp("derniere_verification").defaultNow(),
  miseAJourLe: timestamp("mise_a_jour_le").defaultNow(),
});

/** État de la synchro incrémentale par table (delta sync local → central). */
export const syncEtat = pgTable("sync_etat", {
  id: serial("id").primaryKey(),
  table: varchar("table", { length: 80 }).notNull().unique(), // clients, ventes…
  dernierSync: timestamp("dernier_sync").defaultNow(),
  statut: varchar("statut", { length: 20 }).default("OK"), // OK | ERREUR
  erreur: text("erreur"),
  nbPoussees: integer("nb_poussees").default(0),
  majLe: timestamp("maj_le").defaultNow(),
});

/** File d'attente de reprise (si l'ingest échoue, on garde la trace). */
export const syncOutbox = pgTable("sync_outbox", {
  id: serial("id").primaryKey(),
  entite: varchar("entite", { length: 80 }).notNull(),
  payload: text("payload").notNull(), // JSON
  statut: varchar("statut", { length: 20 }).default("EN_ATTENTE"), // EN_ATTENTE | ENVOYE | ECHEC
  tentatives: integer("tentatives").default(0),
  erreur: text("erreur"),
  createdAt: timestamp("created_at").defaultNow(),
  envoyeLe: timestamp("envoye_le"),
});