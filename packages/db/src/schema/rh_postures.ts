import { pgTable, serial, integer, varchar, timestamp, date, text, boolean, time } from "drizzle-orm/pg-core";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";

/**
 * POSTURE DES EMPLOYÉS (temps réel) — pointage en direct.
 * Chaque action du responsable (arrivée, départ pause, retour pause, départ,
 * début/retour de mission) est horodatée et dérive la posture courante :
 * EN_TRAVAIL | EN_PAUSE | EN_MISSION | HORS_SITE | EN_RETARD | ABSENT.
 * La timeline est la SOURCE CANONIQUE : la ligne du jour (attendance_entries)
 * est une projection recalculée (reconstruireJournee). Les événements sont
 * immuables ; une correction = invalidation tracée (annule, motif, qui, quand).
 */
export const employeePostures = pgTable("employee_postures", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  action: varchar("action", { length: 30 }).notNull(), // ARRIVEE | DEPART_PAUSE | RETOUR_PAUSE | DEPART | MISSION_DEBUT | MISSION_RETOUR | SAISIE_HEURE | STATUT
  posture: varchar("posture", { length: 30 }).notNull(), // EN_TRAVAIL | EN_PAUSE | EN_MISSION | HORS_SITE | EN_RETARD | ABSENT | CONGE | MALADIE
  motifMission: varchar("motif_mission", { length: 40 }), // COMMISSION | TEST_VEHICULE | STAGE | FORMATION | SORTIE_APPROVISIONNEMENT | AUTRE
  reference: varchar("reference", { length: 120 }), // ex. OR-26-0101, véhicule testé, fournisseur…
  notes: text("notes"),
  horodatage: timestamp("horodatage").defaultNow(),
  // Heure du moment pour un événement différé / correction (SAISIE_HEURE) — sinon = heure du horodatage
  heureEvenement: time("heure_evenement"),
  pointePar: integer("pointe_par").references(() => utilisateurs.id),
  actif: boolean("actif").default(true), // la posture courante (une seule active par employé/date)
  // Invalidation tracée : jamais supprimé, toujours visible (barré) dans la timeline
  annule: boolean("annule").default(false),
  annulePar: integer("annule_par").references(() => utilisateurs.id),
  motifAnnulation: text("motif_annulation"),
  annuleA: timestamp("annule_a"),
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

/** Moments de la journée (projection) — un événement par moment. */
export const MOMENTS = ["timeIn", "timeInBreak", "timeOutBreak", "timeOut"] as const;

/** Action d'un événement → moment qu'il alimente (projection). */
export const ACTION_MOMENT: Record<string, string | null> = {
  ARRIVEE: "timeIn",
  DEPART_PAUSE: "timeInBreak",
  RETOUR_PAUSE: "timeOutBreak",
  DEPART: "timeOut",
  SAISIE_HEURE: null, // porte le moment ciblé dans notes/heureEvenement → résolu par la projection
  MISSION_DEBUT: null,
  MISSION_RETOUR: null,
  STATUT: null,
};