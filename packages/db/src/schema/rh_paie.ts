import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";

// ─── RH-04 : paie (périodes, éléments configurés, bulletins, lignes) ───

/** Périodes de paie (intervalle de dates, open/closed) */
export const payrollPeriods = pgTable("payroll_periods", {
  id: serial("id").primaryKey(),
  startDate: varchar("start_date", { length: 10 }).notNull(), // YYYY-MM-DD
  endDate: varchar("end_date", { length: 10 }).notNull(), // YYYY-MM-DD
  status: varchar("status", { length: 20 }).default("open"), // open | closed
  closedAt: timestamp("closed_at"),
  closedBy: integer("closed_by").references(() => utilisateurs.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Éléments de paie paramétrables (gains / retenues) */
export const payrollItemsConfig = pgTable("payroll_items_config", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // earning | deduction
  method: varchar("method", { length: 30 }).notNull(), // percent | fixed | manual | hours_x_rate | absent_days
  params: jsonb("params"), // ex: {"rate": 1.25, "percent": 10, "amount": 0}
  isTaxable: boolean("is_taxable").default(false),
  active: boolean("active").default(true),
  sortOrder: integer("sort_order").default(0),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Bulletins de paie mensuels */
export const payrollEntries = pgTable("payroll_entries", {
  id: serial("id").primaryKey(),
  periodId: integer("period_id").notNull().references(() => payrollPeriods.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employes.id),
  baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull(),
  normalHours: numeric("normal_hours", { precision: 6, scale: 2 }).default("0"),
  overtimeHours: numeric("overtime_hours", { precision: 6, scale: 2 }).default("0"),
  daysPresent: integer("days_present").default(0),
  daysAbsent: integer("days_absent").default(0),
  presenceBonus: numeric("presence_bonus", { precision: 12, scale: 2 }).default("0"),
  performanceBonus: numeric("performance_bonus", { precision: 12, scale: 2 }).default("0"),
  otherEarnings: numeric("other_earnings", { precision: 12, scale: 2 }).default("0"),
  totalEarnings: numeric("total_earnings", { precision: 12, scale: 2 }).default("0"),
  deductions: numeric("deductions", { precision: 12, scale: 2 }).default("0"),
  cnpsEmployee: numeric("cnps_employee", { precision: 12, scale: 2 }).default("0"),
  cnpsEmployer: numeric("cnps_employer", { precision: 12, scale: 2 }).default("0"),
  netImposable: numeric("net_imposable", { precision: 12, scale: 2 }).default("0"),
  irpp: numeric("irpp", { precision: 12, scale: 2 }).default("0"),
  netPay: numeric("net_pay", { precision: 12, scale: 2 }).default("0"),
  paymentMethod: varchar("payment_method", { length: 30 }).default("especes"), // especes | om | momo | virement
  status: varchar("status", { length: 20 }).default("prepare"), // prepare | valide | paye
  generatedAt: timestamp("generated_at").defaultNow(),
  paidAt: timestamp("paid_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Lignes détaillées d'un bulletin (transparence) */
export const payrollEntryLines = pgTable("payroll_entry_lines", {
  id: serial("id").primaryKey(),
  payrollEntryId: integer("payroll_entry_id").notNull().references(() => payrollEntries.id, { onDelete: "cascade" }),
  itemCode: varchar("item_code", { length: 40 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  direction: varchar("direction", { length: 10 }).notNull(), // gain | retenue
  sortOrder: integer("sort_order").default(0),
});
