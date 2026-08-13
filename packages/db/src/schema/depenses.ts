import { integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { fournisseurs } from "./fournisseurs";
import { utilisateurs } from "./utilisateurs";
import { caisses } from "./caisses";
import { sessionsCaisse } from "./sessions_caisse";

export const depenses = pgTable("depenses", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  categorie: varchar("categorie", { length: 100 }).notNull(),
  montant: numeric("montant", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  fournisseurId: integer("fournisseur_id").references(() => fournisseurs.id),
  modePaiement: varchar("mode_paiement", { length: 50 }).default("especes"),
  caisseId: integer("caisse_id").references(() => caisses.id),
  sessionCaisseId: integer("session_caisse_id").references(() => sessionsCaisse.id),
  dateDepense: timestamp("date_depense").defaultNow(),
  enregistrePar: integer("enregistre_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});
