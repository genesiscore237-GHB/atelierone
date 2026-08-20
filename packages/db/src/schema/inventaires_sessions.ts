import { pgTable, integer, timestamp, text, varchar } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { utilisateurs } from "./utilisateurs";

export const inventairesSessions = pgTable("inventaires_sessions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  libelle: varchar("libelle", { length: 255 }),
  statut: varchar("statut", { length: 20 }).notNull().default("brouillon"), // brouillon | en_cours | valide | cloture (specs V2 Annexe Statuts)
  effectuePar: integer("effectue_par").notNull().references(() => utilisateurs.id),
  validePar: integer("valide_par").references(() => utilisateurs.id),
  dateDebut: timestamp("date_debut").defaultNow(),
  dateFin: timestamp("date_fin"),
  notes: text("notes"),
});
