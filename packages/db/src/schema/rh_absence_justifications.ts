import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";
import { agences } from "./agences";

/**
 * RPT-04 — Workflow du justificatif d'absence / retard.
 *
 * PRINCIPE : l'événement métier n'est PAS dupliqué ici.
 * `attendance_entries` reste la source canonique (RPT-01) et `absences` fournit
 * un complément. Ces deux tables ne portent que l'ÉTAT DE JUSTIFICATION, keyed
 * par la clé de réconciliation (employee_id, date).
 *
 * On n'écrit donc JAMAIS dans `attendance_entries.validated*` ni
 * `absence_justificatif` : ces colonnes portent des données historiques
 * incohérentes (495 lignes `validated = true` sans `validated_by`) et les
 * écraser détruirait la trace d'import (R7).
 */

/** États stricts du justificatif (§11). */
export type StatutJustificatif = "AUCUN" | "FOURNI" | "VALIDE" | "REFUSE";

export const rhAbsenceJustifications = pgTable(
  "rh_absence_justifications",
  {
    id: serial("id").primaryKey(),
    agenceId: integer("agence_id")
      .notNull()
      .references(() => agences.id),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employes.id),
    /** Clé de réconciliation RPT-01 : (employee_id, date) */
    date: date("date").notNull(),

    statut: varchar("statut", { length: 20 }).notNull().default("FOURNI"),
    /**
     * Code métier issu de `hr_situation_types.code` (§10) : source unique du
     * référentiel. AUCUNE liste de motifs arbitraire n'est introduite ici.
     */
    motifCode: varchar("motif_code", { length: 40 }),
    motifLibelle: varchar("motif_libelle", { length: 120 }),

    /** Stockage documentaire : convention projet = URL (cf. employee_situations.justificatif_url). */
    justificatifUrl: text("justificatif_url"),
    justificatifReference: varchar("justificatif_reference", { length: 120 }),
    justificatifType: varchar("justificatif_type", { length: 40 }),

    deposePar: integer("depose_par").references(() => utilisateurs.id),
    deposeAt: timestamp("depose_at").defaultNow(),

    decisionPar: integer("decision_par").references(() => utilisateurs.id),
    decisionAt: timestamp("decision_at"),
    refusMotif: text("refus_motif"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    /** Une seule ligne de justification par (employé, date) — pas de doublon possible. */
    uniciteEmployeDate: uniqueIndex("rh_absence_justifications_employe_date_uidx").on(t.employeeId, t.date),
    idxPeriode: index("rh_absence_justifications_agence_date_idx").on(t.agenceId, t.date),
  })
);

/**
 * RPT-04 §17 — Historique IMMUABLE des décisions.
 *
 * Modèle calqué sur `employee_situation_transitions` (R6) : on conserve
 * l'ancienne décision, la nouvelle, l'acteur, la date et le motif. Un refus ne
 * peut jamais être écrasé en silence.
 */
export const rhAbsenceJustificationDecisions = pgTable(
  "rh_absence_justification_decisions",
  {
    id: serial("id").primaryKey(),
    /**
     * `onDelete: restrict` : l'historique est une preuve. Supprimer une
     * justification qui a des décisions doit être impossible (§32/§33) — on
     * corrige par une nouvelle décision, jamais par un DELETE.
     */
    justificationId: integer("justification_id")
      .notNull()
      .references(() => rhAbsenceJustifications.id, { onDelete: "restrict" }),
    agenceId: integer("agence_id").notNull(),
    ancienStatut: varchar("ancien_statut", { length: 20 }),
    nouveauStatut: varchar("nouveau_statut", { length: 20 }).notNull(),
    action: varchar("action", { length: 30 }).notNull(), // DEPOT | VALIDATION | REFUS | CORRECTION
    acteurId: integer("acteur_id").references(() => utilisateurs.id),
    motif: text("motif").notNull(),
    documentUrl: text("document_url"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    idxJustification: index("rh_absence_justification_decisions_justification_idx").on(t.justificationId),
    idxPeriode: index("rh_absence_justification_decisions_agence_created_idx").on(t.agenceId, t.createdAt),
  })
);

export type RhAbsenceJustification = typeof rhAbsenceJustifications.$inferSelect;
export type RhAbsenceJustificationDecision = typeof rhAbsenceJustificationDecisions.$inferSelect;
