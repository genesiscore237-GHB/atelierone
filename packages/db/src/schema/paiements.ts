import { boolean, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { ventes } from "./ventes";
import { retours } from "./retours";

export const paiements = pgTable("paiements", {
  id: serial("id").primaryKey(),
  venteId: integer("vente_id").notNull().references(() => ventes.id),
  retourId: integer("retour_id").references(() => retours.id),
  montant: numeric("montant", { precision: 12, scale: 2 }).notNull(),
  modePaiement: varchar("mode_paiement", { length: 50 }).notNull(),
  reference: varchar("reference", { length: 255 }),
  statut: varchar("statut", { length: 50 }).default("initie"),
  fournisseurPaiement: varchar("fournisseur_paiement", { length: 100 }),
  idReferenceFournisseur: varchar("id_reference_fournisseur", { length: 255 }),
  estIdempotent: boolean("est_idempotent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
