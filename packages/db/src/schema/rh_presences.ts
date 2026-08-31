import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  varchar,
  date,
} from "drizzle-orm/pg-core";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";

// ─── RH-02 : présences, autorisations HS, calculs, résumés mensuels ───

/** Saisies de présence (heures brutes, l'humain saisit, le moteur calcule) */
export const attendanceEntries = pgTable("attendance_entries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  timeIn: time("time_in"),
  timeInBreak: time("time_in_break"), // départ à la pause (pointage en direct)
  timeOutBreak: time("time_out_break"), // retour de pause (pointage en direct)
  timeOut: time("time_out"),
  source: varchar("source", { length: 20 }).default("manual"), // manual | biometric | import
  status: varchar("status", { length: 20 }).default("present"), // present | absent | conge | maladie | mission
  notes: text("notes"),
  // specs MVP — validation admin par ligne : l'extra n'est compté que si validé
  validateEarlyArrival: boolean("validate_early_arrival").default(false), // Oui = l'arrivée anticipée compte
  validateLateDeparture: boolean("validate_late_departure").default(false), // Oui = le départ tardif compte
  taskBonus: numeric("task_bonus", { precision: 12, scale: 2 }).default("0"), // prime de tâche (FCFA)
  validated: boolean("validated").default(false),
  validatedBy: integer("validated_by").references(() => utilisateurs.id),
  validatedAt: timestamp("validated_at"),
  createdBy: integer("created_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Autorisations d'heures supplémentaires (préalables) */
export const overtimeAuthorizations = pgTable("overtime_authorizations", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  maxHours: numeric("max_hours", { precision: 4, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).default("en_attente"), // en_attente | approuvee | refusee
  authorizedBy: integer("authorized_by").references(() => utilisateurs.id),
  authorizedAt: timestamp("authorized_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Résultat du moteur de calcul (transparence totale) */
export const attendanceCalculations = pgTable("attendance_calculations", {
  id: serial("id").primaryKey(),
  attendanceEntryId: integer("attendance_entry_id").notNull().references(() => attendanceEntries.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  rawMinutes: integer("raw_minutes").default(0),
  breakMinutes: integer("break_minutes").default(0),
  workedMinutes: integer("worked_minutes").default(0),
  normalMinutes: integer("normal_minutes").default(0),
  overtimeMinutes: integer("overtime_minutes").default(0),
  lateMinutes: integer("late_minutes").default(0),
  earlyDepartureMinutes: integer("early_departure_minutes").default(0),
  isAbsent: boolean("is_absent").default(false),
  codePresence: varchar("code_presence", { length: 2 }).default("P"), // A | HS | R | P (specs MVP)
  calculationDetails: jsonb("calculation_details"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

/** Résumés mensuels (clôture, export paie) */
export const attendanceMonthlySummaries = pgTable("attendance_monthly_summaries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  totalNormalMinutes: integer("total_normal_minutes").default(0),
  totalOvertimeMinutes: integer("total_overtime_minutes").default(0),
  totalLateMinutes: integer("total_late_minutes").default(0),
  totalTaskBonus: numeric("total_task_bonus", { precision: 12, scale: 2 }).default("0"), // Σ primes de tâche (specs MVP 02/03)
  daysPresent: integer("days_present").default(0),
  daysAbsent: integer("days_absent").default(0),
  daysOnLeave: integer("days_on_leave").default(0),
  locked: boolean("locked").default(false),
  lockedAt: timestamp("locked_at"),
  lockedBy: integer("locked_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
