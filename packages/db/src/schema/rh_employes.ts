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
  changedBy: integer("changed_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Historique des salaires de base */
export const employeeSalaryHistory = pgTable("employee_salary_history", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  baseSalary: decimal("base_salary", { precision: 12, scale: 2 }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  modePaie: varchar("mode_paie", { length: 30 }), // NON_REMUNERE | FORFAIT_HEBDOMADAIRE | SALAIRE_MENSUEL | SALAIRE_HORAIRE (applicable à partir de startDate)
  forfaitHebdomadaire: decimal("forfait_hebdomadaire", { precision: 12, scale: 2 }),
  reason: text("reason"),
  changedBy: integer("changed_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Historique des statuts (actif, congé, suspendu, archive, sorti) */
export const employeeStatusHistory = pgTable("employee_status_history", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  statut: varchar("statut", { length: 30 }).notNull(),
  reembauchable: boolean("reembauchable"), // tracé au moment d'une sortie définitive
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  reason: text("reason"),
  changedBy: integer("changed_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Avances sur salaire (transactionnelles, traçables) */
export const employeeAdvances = pgTable("employee_advances", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 30 }),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  dateDemande: date("date_demande"),
  dateApprobation: date("date_approbation"),
  dateVersement: date("date_versement").notNull(),
  montant: decimal("montant", { precision: 12, scale: 0 }).notNull(),
  motif: text("motif"),
  moyenPaiement: varchar("moyen_paiement", { length: 30 }), // especes | virement | cheque | mobile_money
  periodeConcerneeDebut: date("periode_concernee_debut"),
  periodeConcerneeFin: date("periode_concernee_fin"),
  periodeRecuperationDebut: date("periode_recuperation_debut"),
  periodeRecuperationFin: date("periode_recuperation_fin"),
  montantRecupere: decimal("montant_recupe", { precision: 12, scale: 0 }).default("0"),
  soldeRestant: decimal("solde_restant", { precision: 12, scale: 0 }).notNull(),
  statut: varchar("statut", { length: 30 }).notNull().default("VERSÉE"), // DEMANDÉE | APPROUVÉE | VERSÉE | PARTIELLEMENT_RÉCUPÉRÉE | RÉCUPÉRÉE | ANNULÉE
  responsableId: integer("responsable_id").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Récupérations d'avances (lignes de remboursement) */
export const advanceRecoveries = pgTable("advance_recoveries", {
  id: serial("id").primaryKey(),
  advanceId: integer("advance_id").notNull().references(() => employeeAdvances.id, { onDelete: "cascade" }),
  dateRecuperation: date("date_recuperation").notNull(),
  montant: decimal("montant", { precision: 12, scale: 0 }).notNull(),
  periodeConcerneeDebut: date("periode_concernee_debut"),
  periodeConcerneeFin: date("periode_concernee_fin"),
  payrollEntryId: integer("payroll_entry_id"), // lien vers le bulletin si applicable
  createdBy: integer("created_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Journal des transitions d'état des avances (traçabilité acteur/date/ancien/nouveau/justification) */
export const advanceTransitions = pgTable("advance_transitions", {
  id: serial("id").primaryKey(),
  advanceId: integer("advance_id").notNull().references(() => employeeAdvances.id, { onDelete: "cascade" }),
  fromStatus: varchar("from_status", { length: 30 }),
  toStatus: varchar("to_status", { length: 30 }).notNull(),
  acteurId: integer("acteur_id").references(() => utilisateurs.id),
  justification: text("justification"),
  createdAt: timestamp("created_at").defaultNow(),
});
