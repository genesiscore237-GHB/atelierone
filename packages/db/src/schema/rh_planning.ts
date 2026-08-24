import { pgTable, serial, integer, varchar, text, timestamp, unique } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";

/**
 * RH — PLANNING HEBDOMADAIRE / AFFECTATIONS (specs MVP 07_Planning).
 * Une ligne = un employé + un jour (Lundi→Samedi) avec son affectation.
 * Affectations types : Atelier-Pont 1, Magasin, Accueil, Congé, Formation,
 * Extérieur, Carrosserie, Diagnostic…
 */
export const planningAffectations = pgTable("planning_affectations", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  employeId: integer("employe_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  affectation: varchar("affectation", { length: 120 }).notNull(),
  notes: text("notes"),
  creePar: integer("cree_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  unqEmployeDate: unique("unq_planning_employe_date").on(t.employeId, t.date),
}));