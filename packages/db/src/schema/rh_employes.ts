import {
  boolean,
  date,
  decimal,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { utilisateurs } from "./utilisateurs";
import { employes } from "./employes";

// ─── RH-01 : référentiels, hiérarchie et historiques employés ───

/** Départements / services du garage */
export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  code: varchar("code", { length: 30 }).notNull(),
  parentId: integer("parent_id"),
  active: boolean("active").default(true),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Postes / fonctions référentiel */
export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  code: varchar("code", { length: 30 }).notNull(),
  departmentId: integer("department_id").references(() => departments.id),
  defaultRoleId: integer("default_role_id"),
  active: boolean("active").default(true),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Types de contrat paramétrables (CDI, CDD, Stage…) */
export const contractTypes = pgTable("contract_types", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  active: boolean("active").default(true),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Historique des postes occupés */
export const employeePositions = pgTable("employee_positions", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  positionId: integer("position_id").notNull().references(() => positions.id),
  departmentId: integer("department_id").references(() => departments.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Historique des salaires de base */
export const employeeSalaryHistory = pgTable("employee_salary_history", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  baseSalary: decimal("base_salary", { precision: 12, scale: 2 }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  reason: text("reason"),
  changedBy: integer("changed_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});
