import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { utilisateurs } from "./utilisateurs";

// ─── RH-00 : Paramétrage RH central (aucune valeur métier en dur) ───

/** Cycles de travail (ex. Atelier standard, Administratif, Magasin) */
export const hrWorkCycles = pgTable("hr_work_cycles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false),
  active: boolean("active").default(true),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Horaires par jour pour un cycle donné */
export const hrWorkSchedules = pgTable("hr_work_schedules", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull().references(() => hrWorkCycles.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0 = dimanche … 6 = samedi
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  breakStart: time("break_start"),
  breakEnd: time("break_end"),
  expectedHours: numeric("expected_hours", { precision: 4, scale: 2 }),
  overtimeThreshold: numeric("overtime_threshold", { precision: 4, scale: 2 }), // seuil HS journalier (9,5 semaine / 4,5 samedi — specs MVP)
  isWorkingDay: boolean("is_working_day").default(true),
});

/** Paramètres globaux de présence (un par agence) */
export const hrAttendanceSettings = pgTable("hr_attendance_settings", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().unique().references(() => agences.id),
  lateToleranceMinutes: integer("late_tolerance_minutes").default(0),
  roundToMinutes: integer("round_to_minutes").default(0), // 0 = aucune, 5, 15…
  autoDeductBreak: boolean("auto_deduct_break").default(true),
  countEarlyArrival: boolean("count_early_arrival").default(false), // Oui = extra payé / Non = plafonné à l'heure de début
  countLateDeparture: boolean("count_late_departure").default(false), // Oui = extra payé / Non = plafonné à l'heure de fin
  autoDeductLate: boolean("auto_deduct_late").default(true), // retards déduits automatiquement (specs MVP)
  autoDeductEarlyDeparture: boolean("auto_deduct_early_departure").default(true), // départs anticipés déduits (specs MVP)
  maxNormalHoursPerDay: numeric("max_normal_hours_per_day", { precision: 4, scale: 2 }).default("8"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => utilisateurs.id),
});

/** Types de congés / absences configurables */
export const hrLeaveTypes = pgTable("hr_leave_types", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  isPaid: boolean("is_paid").default(true),
  deductBalance: boolean("deduct_balance").default(true),
  requiresDocument: boolean("requires_document").default(false),
  color: varchar("color", { length: 20 }).default("#6366f1"),
  active: boolean("active").default(true),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Types de sanctions configurables */
export const hrSanctionTypes = pgTable("hr_sanction_types", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  severityLevel: integer("severity_level").default(1), // 1 = léger … 5 = licenciement
  active: boolean("active").default(true),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Jours fériés (calendrier paramétrable) */
export const hrPublicHolidays = pgTable("hr_public_holidays", {
  id: serial("id").primaryKey(),
  /** Vraie colonne SQL DATE : un férié ne peut plus être une chaîne arbitraire (RPT-02). */
  date: date("date").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  isRecurringYearly: boolean("is_recurring_yearly").default(false),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Paramètres généraux RH (un par agence) */
export const hrGeneralSettings = pgTable("hr_general_settings", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().unique().references(() => agences.id),
  employeeCodePrefix: varchar("employee_code_prefix", { length: 10 }).default("GPJ"),
  employeeCodeSequence: integer("employee_code_sequence").default(0),
  timezone: varchar("timezone", { length: 60 }).default("Africa/Douala"),
  currency: varchar("currency", { length: 3 }).default("XAF"),
  evaluationEnabled: boolean("evaluation_enabled").default(true),
  evaluationFrequency: varchar("evaluation_frequency", { length: 20 }).default("trimestrielle"),
  annualLeaveDays: numeric("annual_leave_days", { precision: 5, scale: 1 }).default("30"), // acquisition annuelle de congés (RH-03)
  disciplinaryWindowMonths: integer("disciplinary_window_months").default(12), // période glissante compteur avertissements (RH-07)
  standardMonthlyHours: numeric("standard_monthly_hours", { precision: 6, scale: 2 }).default("225.3"), // heures standard/mois → taux horaire (specs MVP)
  overtimeMultiplier: numeric("overtime_multiplier", { precision: 4, scale: 2 }).default("1.5"), // majoration HS (specs MVP)
  defaultOvertimeThreshold: numeric("default_overtime_threshold", { precision: 4, scale: 2 }).default("9.5"), // seuil HS journalier par défaut (specs MVP)
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => utilisateurs.id),
});

/**
 * RPT-03 §18 : règles de SENSIBILISATION RH (table dédiée).
 *
 * Volontairement SÉPARÉE de `late_deduction_rules` (retenues de paie) :
 * une règle de sensibilisation ne produit AUCUNE retenue. Le déclenchement est
 * porté par `condition` + `metrique` + `seuil`, jamais par une formule de paie.
 *
 * `niveau` ∈ INFO | WARNING | CRITICAL, `condition` ∈ GE | GT | LE | LT | EQ.
 */
export const hrSensibilisationRules = pgTable("hr_sensibilisation_rules", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  code: varchar("code", { length: 60 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  /** INFO | WARNING | CRITICAL */
  niveau: varchar("niveau", { length: 10 }).notNull(),
  /** Ordre d'affichage déterministe : plus petit = plus prioritaire. */
  priorite: integer("priorite").notNull().default(100),
  /** GE | GT | LE | LT | EQ — comparateur appliqué à `seuil`. */
  condition: varchar("condition", { length: 4 }).notNull(),
  /** Métrique observée, cf. METRIQUES_SENSIBILISATION de rh-sensibilisation-engine. */
  metrique: varchar("metrique", { length: 40 }).notNull(),
  seuil: numeric("seuil", { precision: 12, scale: 2 }).notNull(),
  message: text("message").notNull(),
  actionRecommandee: text("action_recommandee").notNull(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
