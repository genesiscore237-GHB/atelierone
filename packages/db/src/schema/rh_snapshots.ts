import { integer, jsonb, pgTable, serial, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { utilisateurs } from "./utilisateurs";
import { payrollEntries, payrollPeriods } from "./rh_paie";
import { employes } from "./employes";
import { evaluations } from "./rh_evaluation";
import { leaveBalances } from "./rh_conges";

// ─── RH : SNAPSHOTS MÉTIER (Phase 6 — P13/N13) ───
// Principe : avant toute régénération d'un état existant (DELETE+INSERT ou
// écrasement), on archive l'état courant (entité + lignes de détail) en « snapshot »
// versionné. Les tables actives = état actuel ; les snapshots = historique rejouable.
// Aucun DELETE destructif : chaque remplacement est précédé d'un snapshot `version+1`.

/** Historique versionné des bulletins de paie (pré-conception P13, Phase 2 §9). */
export const payrollEntrySnapshots = pgTable(
  "payroll_entry_snapshots",
  {
    id: serial("id").primaryKey(),
    agenceId: integer("agence_id").notNull().references(() => agences.id),
    payrollEntryId: integer("payroll_entry_id").notNull().references(() => payrollEntries.id),
    version: integer("version").notNull(),
    periodId: integer("period_id").references(() => payrollPeriods.id),
    employeeId: integer("employee_id").references(() => employes.id),
    baseSalary: varchar("base_salary", { length: 40 }),
    netPay: varchar("net_pay", { length: 40 }),
    status: varchar("status", { length: 20 }),
    entityJson: jsonb("entity_json").notNull(), // bulletin complet (état avant régénération)
    linesJson: jsonb("lines_json").notNull(), // lignes détaillées (array)
    raison: varchar("raison", { length: 30 }).notNull(), // recalcul | adjustment
    createdBy: integer("created_by").references(() => utilisateurs.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    unqEntryVersion: unique("unq_payroll_entry_snapshots").on(t.payrollEntryId, t.version),
  })
);

/** Historique des réécritures du planning hebdo (N13) — un snapshot par appel saveWeek. */
export const planningSnapshots = pgTable("planning_snapshots", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  employeIdsJson: jsonb("employe_ids_json").notNull(), // employés concernés par la réécriture
  datesJson: jsonb("dates_json").notNull(), // dates concernées
  rowsJson: jsonb("rows_json").notNull(), // lignes affectées avant réécriture
  raison: varchar("raison", { length: 30 }).notNull(), // recalcul
  createdBy: integer("created_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Historique versionné des évaluations (notes par critère avant recalcul). */
export const evaluationSnapshots = pgTable(
  "evaluation_snapshots",
  {
    id: serial("id").primaryKey(),
    agenceId: integer("agence_id").notNull().references(() => agences.id),
    evaluationId: integer("evaluation_id").notNull().references(() => evaluations.id),
    version: integer("version").notNull(),
    entityJson: jsonb("entity_json").notNull(), // évaluation complète (état avant recalcul)
    scoresJson: jsonb("scores_json").notNull(), // notes par critère (array)
    raison: varchar("raison", { length: 30 }).notNull(), // recalcul
    createdBy: integer("created_by").references(() => utilisateurs.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    unqEvalVersion: unique("unq_evaluation_snapshots").on(t.evaluationId, t.version),
  })
);

/** Historique versionné des soldes de congés à la décision (avant décompte). */
export const leaveBalanceSnapshots = pgTable(
  "leave_balance_snapshots",
  {
    id: serial("id").primaryKey(),
    agenceId: integer("agence_id").notNull().references(() => agences.id),
    leaveBalanceId: integer("leave_balance_id").notNull().references(() => leaveBalances.id),
    version: integer("version").notNull(),
    entityJson: jsonb("entity_json").notNull(), // solde complet (état avant décision)
    raison: varchar("raison", { length: 30 }).notNull(), // decision
    createdBy: integer("created_by").references(() => utilisateurs.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    unqBalanceVersion: unique("unq_leave_balance_snapshots").on(t.leaveBalanceId, t.version),
  })
);