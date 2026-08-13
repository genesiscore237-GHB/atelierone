import { integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { utilisateurs } from "./utilisateurs";

export const comptes = pgTable("comptes", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  code: varchar("code", { length: 50 }).notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  typeCompte: varchar("type_compte", { length: 50 }).notNull(),
  isActive: varchar("is_active", { length: 20 }).default("actif"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ecrituresJournal = pgTable("ecritures_journal", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  reference: varchar("reference", { length: 100 }),
  libelle: varchar("libelle", { length: 500 }).notNull(),
  dateEcriture: timestamp("date_ecriture").defaultNow(),
  documentType: varchar("document_type", { length: 50 }),
  documentId: integer("document_id"),
  valideeLe: timestamp("validee_le"),
  valideePar: integer("validee_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lignesEcritureJournal = pgTable("lignes_ecriture_journal", {
  id: serial("id").primaryKey(),
  ecritureId: integer("ecriture_id").notNull().references(() => ecrituresJournal.id),
  compteId: integer("compte_id").notNull().references(() => comptes.id),
  montant: numeric("montant", { precision: 12, scale: 2 }).notNull(),
  sens: varchar("sens", { length: 10 }).notNull(),
  libelle: varchar("libelle", { length: 500 }),
});
