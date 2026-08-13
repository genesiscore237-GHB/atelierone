import { boolean, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { utilisateurs } from "./utilisateurs";

export const caisses = pgTable("caisses", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  libelle: varchar("libelle", { length: 255 }).notNull(),
  notes: text("notes"),
  actif: boolean("actif").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mouvementsCaisse = pgTable("mouvements_caisse", {
  id: serial("id").primaryKey(),
  caisseId: integer("caisse_id").notNull().references(() => caisses.id),
  type: varchar("type", { length: 50 }).notNull(),
  montant: numeric("montant", { precision: 12, scale: 2 }).notNull(),
  motif: varchar("motif", { length: 500 }),
  reference: varchar("reference", { length: 100 }),
  entiteType: varchar("entite_type", { length: 50 }),
  entiteId: integer("entite_id"),
  categorieDepense: varchar("categorie_depense", { length: 100 }),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});
