import { integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { achats } from "./achats";
import { fournisseurs } from "./fournisseurs";
import { agences } from "./agences";
import { caisses } from "./caisses";

export const dettesFournisseurs = pgTable("dettes_fournisseurs", {
  id: serial("id").primaryKey(),
  achatId: integer("achat_id").notNull().references(() => achats.id),
  fournisseurId: integer("fournisseur_id").notNull().references(() => fournisseurs.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  reference: varchar("reference", { length: 100 }).notNull(),
  montantTotal: numeric("montant_total", { precision: 12, scale: 2 }).notNull(),
  montantPaye: numeric("montant_paye", { precision: 12, scale: 2 }).default("0"),
  montantRestant: numeric("montant_restant", { precision: 12, scale: 2 }).notNull(),
  statut: varchar("statut", { length: 50 }).default("impaye"),
  echeanceLe: timestamp("echeance_le"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const remboursementsFournisseurs = pgTable("remboursements_fournisseurs", {
  id: serial("id").primaryKey(),
  detteId: integer("dette_id").notNull().references(() => dettesFournisseurs.id),
  montant: numeric("montant", { precision: 12, scale: 2 }).notNull(),
  modePaiement: varchar("mode_paiement", { length: 50 }).notNull(),
  caisseId: integer("caisse_id").references(() => caisses.id),
  effectueLe: timestamp("effectue_le").defaultNow(),
  reference: varchar("reference", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});
