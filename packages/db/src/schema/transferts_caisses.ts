import { pgTable, serial, integer, varchar, numeric, timestamp } from "drizzle-orm/pg-core";
import { caisses } from "./caisses";
import { agences } from "./agences";
import { utilisateurs } from "./utilisateurs";

export const transfertsCaisses = pgTable("transferts_caisses", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 100 }).notNull(),
  caisseSourceId: integer("caisse_source_id").notNull().references(() => caisses.id),
  caisseDestId: integer("caisse_dest_id").notNull().references(() => caisses.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  montant: numeric("montant", { precision: 12, scale: 2 }).notNull(),
  motif: varchar("motif", { length: 255 }),
  statut: varchar("statut", { length: 50 }).default("effectue"),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  approuvePar: integer("approuve_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
  approuveLe: timestamp("approuve_le"),
});
