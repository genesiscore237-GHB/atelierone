import { pgTable, serial, integer, varchar, timestamp, date, text, boolean, time } from "drizzle-orm/pg-core";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";

/**
 * POSTURE DES EMPLOYÉS (temps réel) — pointage en direct.
 * Chaque action du responsable (arrivée, départ pause, retour pause, départ,
 * début/retour de mission) est horodatée et dérive la posture courante :
 * EN_TRAVAIL | EN_PAUSE | EN_MISSION | HORS_SITE | EN_RETARD | ABSENT.
 */
export const employeePostures = pgTable("employee_postures", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  action: varchar("action", { length: 30 }).notNull(), // ARRIVEE | DEPART_PAUSE | RETOUR_PAUSE | DEPART | MISSION_DEBUT | MISSION_RETOUR
  posture: varchar("posture", { length: 30 }).notNull(), // EN_TRAVAIL | EN_PAUSE | EN_MISSION | HORS_SITE | EN_RETARD | ABSENT
  motifMission: varchar("motif_mission", { length: 40 }), // COMMISSION | TEST_VEHICULE | STAGE | FORMATION | SORTIE_APPROVISIONNEMENT | AUTRE
  reference: varchar("reference", { length: 120 }), // ex. OR-26-0101, véhicule testé, fournisseur…
  notes: text("notes"),
  horodatage: timestamp("horodatage").defaultNow(),
  pointePar: integer("pointe_par").references(() => utilisateurs.id),
  actif: boolean("actif").default(true), // la posture courante (une seule active par employé/date)
  createdAt: timestamp("created_at").defaultNow(),
});

/** Motifs de mission normalisés (posture). */
export const TYPES_MISSION = [
  "COMMISSION",
  "TEST_VEHICULE",
  "STAGE",
  "FORMATION",
  "SORTIE_APPROVISIONNEMENT",
  "AUTRE",
] as const;