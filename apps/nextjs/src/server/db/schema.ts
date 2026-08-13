import { relations } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, pgEnum, integer, numeric } from "drizzle-orm/pg-core";

import {
  organisations, utilisateurs, agences, caisses, categories, produits, stocks, mouvementsStock, auditLogs, permissions, roles, rolePermissions, sessionsCaisse, ventes, ventesLignes, paiements, dettesClients, remboursementsDettes, comptes, ecrituresJournal, lignesEcritureJournal, retours, lignesRetour, avoirs, depenses, boiteEnvoi, reglesTarification, approbations, clients, fournisseurs, achats, achatsLignes, bonsReception, lignesBonReception, faitsVentesQuotidiens, faitsCaisseQuotidiens, faitsStockQuotidiens, alertesStock, clesApi, alertes, reglesAutomatisation, travauxExport, transfertsStock, verificationTokens, codesBarres, tarifs, produitsFournisseurs, inventaires, employes, mouvementsCaisse } from "@atelierone/db";

// === ENUMS KEPT FOR OLD TABLES ===

export const movementTypeEnum = pgEnum("movement_type", ["IN", "OUT", "TRANSFER", "ADJUSTMENT"]);
export const inventorySessionStatusEnum = pgEnum("inventory_session_status", ["OPEN", "COUNTING", "REVIEW", "APPROVED", "COMPLETED"]);

// === RE-EXPORTS: ENGLISH ALIASES FOR @atelierone/db TABLES ===

export const organizations = organisations;
export const profiles = utilisateurs;
export const pointsOfSale = agences;
export const cashRegisters = caisses;
export const products = produits;
export const inventoryBalances = stocks;
export const inventoryMovements = mouvementsStock;
export const auditEvents = auditLogs;
export const posSessions = sessionsCaisse;
export const sales = ventes;
export const saleItems = ventesLignes;
export const payments = paiements;
export const customerDebts = dettesClients;
export const debtPayments = remboursementsDettes;
export const accounts = comptes;
export const journalEntries = ecrituresJournal;
export const journalItems = lignesEcritureJournal;
export const returns = retours;
export const returnItems = lignesRetour;
export const credits = avoirs;
export const expenses = depenses;
export const outbox = boiteEnvoi;
export const pricingRules = reglesTarification;
export const approvals = approbations;
export const customers = clients;
export const suppliers = fournisseurs;
export const purchaseOrders = achats;
export const purchaseOrderLines = achatsLignes;
export const goodsReceipts = bonsReception;
export const goodsReceiptLines = lignesBonReception;
export const dailySalesFacts = faitsVentesQuotidiens;
export const dailyCashFacts = faitsCaisseQuotidiens;
export const dailyInventoryFacts = faitsStockQuotidiens;
export const stockAlerts = alertesStock;
export const apiKeys = clesApi;
export const alerts = alertes;
export const automationRules = reglesAutomatisation;
export const exportJobs = travauxExport;
export const stockTransfers = transfertsStock;

// === UNIQUE TABLES (no integer equivalent in @atelierone/db) ===

export const platformStatsFacts = pgTable("platform_stats_facts", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date").defaultNow().notNull(),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  mrrAmount: numeric("mrr_amount", { precision: 10, scale: 2 }).notNull(),
  activeTenantsCount: integer("active_tenants_count").notNull(),
  trialTenantsCount: integer("trial_tenants_count").notNull(),
  churnRate: numeric("churn_rate", { precision: 5, scale: 2 }).notNull(),
  totalRevenue: numeric("total_revenue", { precision: 12, scale: 2 }).notNull(),
  totalTenants: integer("total_tenants").notNull(),
  todaySalesCount: integer("today_sales_count").notNull(),
  syncHealth: numeric("sync_health", { precision: 5, scale: 2 }).default("98.7"),
  criticalAlerts: integer("critical_alerts").default(0),
});

export const inventorySessions = pgTable("inventory_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  posId: integer("pos_id").notNull().references(() => pointsOfSale.id),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  status: inventorySessionStatusEnum("status").default("OPEN").notNull(),
  startedBy: integer("started_by").references(() => profiles.id),
  approvedBy: integer("approved_by").references(() => profiles.id),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
});

export const inventoryCounts = pgTable("inventory_counts", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => inventorySessions.id),
  productId: integer("product_id").notNull().references(() => products.id),
  countedQuantity: integer("counted_quantity").notNull(),
  systemQuantity: integer("system_quantity").notNull(),
  discrepancy: integer("discrepancy").notNull(),
  countedBy: integer("counted_by").references(() => profiles.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// === RELATIONS FOR UNIQUE TABLES ===

export const inventorySessionsRelations = relations(inventorySessions, ({ one, many }) => ({
  pos: one(pointsOfSale, {
    fields: [inventorySessions.posId],
    references: [pointsOfSale.id],
  }),
  organization: one(organizations, {
    fields: [inventorySessions.organizationId],
    references: [organizations.id],
  }),
  counts: many(inventoryCounts),
}));

export const inventoryCountsRelations = relations(inventoryCounts, ({ one }) => ({
  session: one(inventorySessions, {
    fields: [inventoryCounts.sessionId],
    references: [inventorySessions.id],
  }),
  product: one(products, {
    fields: [inventoryCounts.productId],
    references: [products.id],
  }),
  countedBy: one(profiles, {
    fields: [inventoryCounts.countedBy],
    references: [profiles.id],
  }),
}));

// === RE-EXPORT EXTRA @atelierone/db TABLES WITHOUT ENGLISH ALIASES ===

export {
  codesBarres,
  tarifs,
  produitsFournisseurs,
  inventaires,
  employes,
  mouvementsCaisse,
  roles,
  permissions,
  rolePermissions,
};

export { promotions, notifications } from "@atelierone/db";
