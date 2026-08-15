import {
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";
import { hrLeaveTypes } from "./rh_parametrage";

// ─── RH-03 : congés & absences (soldes, demandes, ajustements) ───

/** Soldes annuels par employé et type de congé */
export const leaveBalances = pgTable("leave_balances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  leaveTypeId: integer("leave_type_id").notNull().references(() => hrLeaveTypes.id),
  year: integer("year").notNull(),
  acquiredDays: numeric("acquired_days", { precision: 5, scale: 1 }).default("0"),
  takenDays: numeric("taken_days", { precision: 5, scale: 1 }).default("0"),
  adjustedDays: numeric("adjusted_days", { precision: 5, scale: 1 }).default("0"),
  balance: numeric("balance", { precision: 5, scale: 1 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Demandes de congés (workflow : brouillon → en_attente → approuve/refuse/annule) */
export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  leaveTypeId: integer("leave_type_id").notNull().references(() => hrLeaveTypes.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  daysCount: numeric("days_count", { precision: 5, scale: 1 }).notNull(),
  reason: text("reason"),
  documentUrl: text("document_url"),
  status: varchar("status", { length: 20 }).default("en_attente"), // brouillon | en_attente | approuve | refuse | annule
  requestedBy: integer("requested_by").references(() => utilisateurs.id),
  approvedBy: integer("approved_by").references(() => utilisateurs.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Ajustements manuels de solde (tracés + audit) */
export const leaveBalanceAdjustments = pgTable("leave_balance_adjustments", {
  id: serial("id").primaryKey(),
  leaveBalanceId: integer("leave_balance_id").notNull().references(() => leaveBalances.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 5, scale: 1 }).notNull(),
  reason: text("reason").notNull(),
  createdBy: integer("created_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});
