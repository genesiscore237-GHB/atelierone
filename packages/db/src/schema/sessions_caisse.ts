import { integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { caisses } from "./caisses";
import { utilisateurs } from "./utilisateurs";

export const sessionsCaisse = pgTable("sessions_caisse", {
  id: serial("id").primaryKey(),
  caisseId: integer("caisse_id").notNull().references(() => caisses.id),
  ouvertPar: integer("ouvert_par").notNull().references(() => utilisateurs.id),
  fermePar: integer("ferme_par").references(() => utilisateurs.id),
  statut: varchar("statut", { length: 50 }).default("ouverte"),
  soldeOuverture: numeric("solde_ouverture", { precision: 12, scale: 2 }).notNull(),
  soldeActuel: numeric("solde_actuel", { precision: 12, scale: 2 }).notNull(),
  soldeAttenduFermeture: numeric("solde_attendu_fermeture", { precision: 12, scale: 2 }),
  soldeCompteFermeture: numeric("solde_compte_fermeture", { precision: 12, scale: 2 }),
  ecart: numeric("ecart", { precision: 12, scale: 2 }),
  ouvertLe: timestamp("ouvert_le").defaultNow(),
  fermeLe: timestamp("ferme_le"),
  createdAt: timestamp("created_at").defaultNow(),
});
