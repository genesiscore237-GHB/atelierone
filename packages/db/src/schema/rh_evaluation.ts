import {
  boolean,
  integer,
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
import { positions } from "./rh_employes";

// ─── RH-05 : évaluation & performance (grilles, campagnes, scores, barème) ───

/** Grilles d'évaluation par poste (paramétrables) */
export const evaluationGrids = pgTable("evaluation_grids", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  positionId: integer("position_id").references(() => positions.id),
  scale: varchar("scale", { length: 20 }).default("1-5"), // échelle de notation (1-5, 1-10, A-E)
  active: boolean("active").default(true),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Critères d'une grille (pondération) */
export const evaluationCriteria = pgTable("evaluation_criteria", {
  id: serial("id").primaryKey(),
  gridId: integer("grid_id").notNull().references(() => evaluationGrids.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  weight: numeric("weight", { precision: 5, scale: 1 }).notNull(), // % (la somme doit faire 100)
  maxScore: numeric("max_score", { precision: 4, scale: 1 }).default("5"),
  sortOrder: integer("sort_order").default(0),
});

/** Campagnes d'évaluation */
export const evaluationCampaigns = pgTable("evaluation_campaigns", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  periodStart: varchar("period_start", { length: 10 }).notNull(),
  periodEnd: varchar("period_end", { length: 10 }).notNull(),
  status: varchar("status", { length: 20 }).default("ouverte"), // ouverte | cloturee
  createdBy: integer("created_by").references(() => utilisateurs.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Évaluations d'un employé lors d'une campagne */
export const evaluations = pgTable("evaluations", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => evaluationCampaigns.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employes.id),
  evaluatorId: integer("evaluator_id").references(() => utilisateurs.id),
  gridId: integer("grid_id").references(() => evaluationGrids.id),
  globalScore: numeric("global_score", { precision: 4, scale: 2 }),
  appreciation: text("appreciation"),
  objectives: text("objectives"),
  status: varchar("status", { length: 20 }).default("finalisee"),
  evaluatedAt: timestamp("evaluated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Notes par critère */
export const evaluationScores = pgTable("evaluation_scores", {
  id: serial("id").primaryKey(),
  evaluationId: integer("evaluation_id").notNull().references(() => evaluations.id, { onDelete: "cascade" }),
  criterionId: integer("criterion_id").notNull().references(() => evaluationCriteria.id),
  score: numeric("score", { precision: 4, scale: 1 }).notNull(),
  comment: text("comment"),
});

/** Barème de prime de performance (selon note globale) */
export const performanceBonusRules = pgTable("performance_bonus_rules", {
  id: serial("id").primaryKey(),
  minScore: numeric("min_score", { precision: 4, scale: 2 }).notNull(),
  maxScore: numeric("max_score", { precision: 4, scale: 2 }).notNull(),
  bonusAmount: numeric("bonus_amount", { precision: 12, scale: 2 }).default("0"), // FCFA
  active: boolean("active").default(true),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});
