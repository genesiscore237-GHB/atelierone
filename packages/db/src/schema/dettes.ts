import { integer, numeric, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { ventes } from "./ventes";
import { clients } from "./clients";
import { agences } from "./agences";

export const dettesClients = pgTable("dettes_clients", {
  id: serial("id").primaryKey(),
  venteId: integer("vente_id").notNull().references(() => ventes.id),
  clientId: integer("client_id").references(() => clients.id),
  agenceId: integer("agence_id").references(() => agences.id),
  montantTotal: numeric("montant_total", { precision: 12, scale: 2 }).notNull(),
  montantPaye: numeric("montant_paye", { precision: 12, scale: 2 }).default("0"),
  montantRestant: numeric("montant_restant", { precision: 12, scale: 2 }).notNull(),
  statut: varchar("statut", { length: 50 }).default("impaye"),
  echeanceLe: timestamp("echeance_le"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const remboursementsDettes = pgTable("remboursements_dettes", {
  id: serial("id").primaryKey(),
  detteId: integer("dette_id").notNull().references(() => dettesClients.id),
  montant: numeric("montant", { precision: 12, scale: 2 }).notNull(),
  modePaiement: varchar("mode_paiement", { length: 50 }).notNull(),
  effectueLe: timestamp("effectue_le").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});
