import { pgTable, uuid, varchar, timestamp, numeric, integer, text, jsonb } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { caisses } from "./caisses";
import { produits } from "./produits";

export const boiteEnvoi = pgTable("boite_envoi", {
  id: uuid("id").defaultRandom().primaryKey(),
  typeEvenement: varchar("type_evenement", { length: 100 }).notNull(),
  corpsJson: jsonb("corps_json").notNull(),
  statut: varchar("statut", { length: 50 }).default("en_attente"),
  createdAt: timestamp("created_at").defaultNow(),
  traiteLe: timestamp("traite_le"),
});

export const faitsVentesQuotidiens = pgTable("faits_ventes_quotidiens", {
  id: uuid("id").defaultRandom().primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  date: timestamp("date").notNull(),
  totalVentes: integer("total_ventes").default(0),
  montantTotal: numeric("montant_total", { precision: 12, scale: 2 }).default("0"),
  montantPaye: numeric("montant_paye", { precision: 12, scale: 2 }).default("0"),
  remiseTotal: numeric("remise_total", { precision: 12, scale: 2 }).default("0"),
  nombreProduits: integer("nombre_produits").default(0),
  calculeLe: timestamp("calcule_le").defaultNow(),
});

export const faitsCaisseQuotidiens = pgTable("faits_caisse_quotidiens", {
  id: uuid("id").defaultRandom().primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  caisseId: integer("caisse_id").references(() => caisses.id),
  date: timestamp("date").notNull(),
  totalEntrees: numeric("total_entrees", { precision: 12, scale: 2 }).default("0"),
  totalSorties: numeric("total_sorties", { precision: 12, scale: 2 }).default("0"),
  operationsCount: integer("operations_count").default(0),
  calculeLe: timestamp("calcule_le").defaultNow(),
});

export const faitsStockQuotidiens = pgTable("faits_stock_quotidiens", {
  id: uuid("id").defaultRandom().primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  date: timestamp("date").notNull(),
  totalProduits: integer("total_produits").default(0),
  valeurStock: numeric("valeur_stock", { precision: 12, scale: 2 }).default("0"),
  produitsRupture: integer("produits_rupture").default(0),
  alerteStock: integer("alerte_stock").default(0),
  calculeLe: timestamp("calcule_le").defaultNow(),
});

export const alertesStock = pgTable("alertes_stock", {
  id: uuid("id").defaultRandom().primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  typeAlerte: varchar("type_alerte", { length: 50 }).notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
});
