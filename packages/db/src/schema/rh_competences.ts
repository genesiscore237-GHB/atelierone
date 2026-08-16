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
import { positions } from "./rh_employes";

// ─── RH-06 : compétences & formations (référentiel, matrice, catalogue) ───

/** Compétences du référentiel (paramétrables) */
export const skills = pgTable("skills", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  category: varchar("category", { length: 60 }).notNull(), // mécanique, électricité, diagnostic, accueil, ...
  description: text("description"),
  active: boolean("active").default(true),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Compétences requises par poste (niveau 1-5 paramétrable) */
export const positionSkills = pgTable("position_skills", {
  id: serial("id").primaryKey(),
  positionId: integer("position_id").notNull().references(() => positions.id, { onDelete: "cascade" }),
  skillId: integer("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  requiredLevel: integer("required_level").notNull(), // 1-5 (paramétrable via RH-00 à terme)
});

/** Niveau actuel d'un employé sur une compétence */
export const employeeSkills = pgTable("employee_skills", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  skillId: integer("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  currentLevel: integer("current_level").notNull(), // 1-5
  assessedAt: timestamp("assessed_at").defaultNow(),
  assessedBy: integer("assessed_by").references(() => utilisateurs.id),
});

/** Catalogue de formations */
export const trainings = pgTable("trainings", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description"),
  provider: varchar("provider", { length: 120 }), // interne | externe (organisme)
  durationHours: numeric("duration_hours", { precision: 6, scale: 1 }),
  skillIds: jsonb("skill_ids").$type<number[]>(), // compétences ciblées
  active: boolean("active").default(true),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Sessions d'une formation (plan de formation) */
export const trainingSessions = pgTable("training_sessions", {
  id: serial("id").primaryKey(),
  trainingId: integer("training_id").notNull().references(() => trainings.id, { onDelete: "cascade" }),
  startDate: varchar("start_date", { length: 10 }).notNull(),
  endDate: varchar("end_date", { length: 10 }),
  location: varchar("location", { length: 160 }),
  status: varchar("status", { length: 20 }).default("planifiee"), // planifiee | en_cours | terminee | annulee
  createdBy: integer("created_by").references(() => utilisateurs.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Participants à une session (historique de formation suivi) */
export const trainingParticipations = pgTable("training_participations", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => trainingSessions.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).default("inscrit"), // inscrit | present | valide | absent
  certificateUrl: text("certificate_url"),
  score: numeric("score", { precision: 5, scale: 1 }),
});
