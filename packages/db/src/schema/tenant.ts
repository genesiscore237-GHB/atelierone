import { pgTable, serial, integer, varchar, text, timestamp, boolean, jsonb, date } from "drizzle-orm/pg-core";

/**
 * MODULE SAAS — tables du SERVEUR CENTRAL (APP_ROLE=central).
 * Comptes garages, licences signées, paiements, ingests de synchronisation.
 * Ces tables n'existent que dans la base centrale (simulation : atelierone_central).
 */

/** Sites garages enregistrés (tenants). */
export const tenantSites = pgTable("tenant_sites", {
  id: serial("id").primaryKey(),
  codeSite: varchar("code_site", { length: 50 }).notNull().unique(), // ex. GPJ-001
  nomGarage: varchar("nom_garage", { length: 255 }).notNull(),
  ville: varchar("ville", { length: 100 }),
  telephone: varchar("telephone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  statut: varchar("statut", { length: 30 }).default("ACTIF"), // ACTIF | SUSPENDU | RESILIE
  versionLogiciel: varchar("version_logiciel", { length: 30 }),
  cleApi: varchar("cle_api", { length: 100 }).notNull(), // token d'ingestion sync
  dernierHeartbeat: timestamp("dernier_heartbeat"),
  derniereSync: timestamp("derniere_sync"),
  inscritLe: timestamp("inscrit_le").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Périodes de licence émises (historique + période courante). */
export const tenantLicences = pgTable("tenant_licences", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => tenantSites.id, { onDelete: "cascade" }),
  jeton: text("jeton").notNull(), // jeton signé remis au garage
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin").notNull(),
  graceJours: integer("grace_jours").default(7),
  statut: varchar("statut", { length: 30 }).default("ACTIVE"), // ACTIVE | EXPIREE | SUSPENDUE
  mode: varchar("mode", { length: 20 }).default("ESSAI"), // ESSAI | ABONNEMENT
  emitLe: timestamp("emit_le").defaultNow(),
  creePar: integer("cree_par"),
});

/** Historique des paiements (CinetPay simulé ou réel). */
export const tenantPaiements = pgTable("tenant_paiements", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => tenantSites.id, { onDelete: "cascade" }),
  licenceId: integer("licence_id").references(() => tenantLicences.id),
  reference: varchar("reference", { length: 100 }).notNull().unique(),
  montant: integer("montant").notNull(), // en FCFA
  modePaiement: varchar("mode_paiement", { length: 30 }).default("cinetpay"), // cinetpay | paydunya | manuel | simulation
  statut: varchar("statut", { length: 30 }).default("EN_ATTENTE"), // EN_ATTENTE | CONFIRME | ECHOUE | REMBOURSE
  periodeMois: integer("periode_mois").default(1), // nombre de mois étendus
  fournisseur: varchar("fournisseur", { length: 50 }), // orange_money | mtn_momo | carte
  payeLe: timestamp("paye_le"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Payloads de synchronisation reçus des garages (archive + agrégation). */
export const syncIngests = pgTable("sync_ingests", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => tenantSites.id, { onDelete: "cascade" }),
  entite: varchar("entite", { length: 80 }).notNull(), // clients, ventes, ordres_reparation…
  action: varchar("action", { length: 20 }).notNull(), // CREATE | UPDATE | DELETE | DELTA
  payload: jsonb("payload").notNull(),
  nbLignes: integer("nb_lignes").default(0),
  reçuLe: timestamp("recu_le").defaultNow(),
});

/** Snapshots agrégés par site (vue parent simplifiée). */
export const tenantSnapshots = pgTable("tenant_snapshots", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => tenantSites.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 30 }).notNull(), // VENTES | OR | STOCK
  montant: integer("montant").default(0),
  nb: integer("nb").default(0),
  periode: varchar("periode", { length: 10 }), // YYYY-MM
  majLe: timestamp("maj_le").defaultNow(),
});

/** Actions de relance générées pour l'éditeur (licence expirant, hors-ligne, paiement échoué). */
export const tenantRelances = pgTable("tenant_relances", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => tenantSites.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull(), // LICENCE_EXPIRANT | HORS_LIGNE | SANS_LICENCE
  message: varchar("message", { length: 500 }).notNull(),
  statut: varchar("statut", { length: 20 }).default("A_FAIRE"), // A_FAIRE | FAITE | IGNOREE
  creeLe: timestamp("cree_le").defaultNow(),
  faiteLe: timestamp("faite_le"),
  faitePar: integer("faite_par"),
});

/** Journal des actions de l'éditeur (audit SaaS). */
export const tenantAudit = pgTable("tenant_audit", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => tenantSites.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  details: jsonb("details"),
  acteurId: integer("acteur_id"),
  acteurEmail: varchar("acteur_email", { length: 255 }),
  creeLe: timestamp("cree_le").defaultNow(),
});

/** Usage des modules par site et période (analytique d'adoption → upsell). */
export const tenantUsage = pgTable("tenant_usage", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => tenantSites.id, { onDelete: "cascade" }),
  entite: varchar("entite", { length: 80 }).notNull(), // clients, ventes, ordres_reparation…
  periode: varchar("periode", { length: 10 }).notNull(), // YYYY-MM
  nbLignes: integer("nb_lignes").default(0),
  majLe: timestamp("maj_le").defaultNow(),
});