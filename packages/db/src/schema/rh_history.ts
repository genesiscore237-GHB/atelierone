import { date, integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { employes } from "./employes";
import { contrats } from "./absences";
import { utilisateurs } from "./utilisateurs";

/**
 * R7 — Historique versionné des contrats (rh_contract_versions).
 * Immuable : chaque mutation de `contrats` INSERT une version (avant-image datée).
 * `contrats` reste la projection courante ; l'historique est la seule mémoire du passé.
 */
export const contractVersions = pgTable("rh_contract_versions", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id")
    .notNull()
    .references(() => contrats.id, { onDelete: "cascade" }),
  employeId: integer("employe_id")
    .notNull()
    .references(() => employes.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  typeContrat: varchar("type_contrat", { length: 30 }),
  poste: varchar("poste", { length: 100 }),
  dateDebut: date("date_debut"),
  dateFin: date("date_fin"),
  dureeMois: integer("duree_mois"),
  salaireBase: text("salaire_base"),
  statut: varchar("statut", { length: 30 }),
  fichierUrl: text("fichier_url"),
  notes: text("notes"),
  finPeriodeEssai: date("fin_periode_essai"),
  avantages: text("avantages"),
  renouvellement: text("renouvellement"),
  reason: text("reason").notNull(),
  changedBy: integer("changed_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * R7 — Journal RH avant/après (rh_audit_logs).
 * Complète `audit_logs` (TRPC, léger, sans avant/après) avec le avant→après
 * JSON des mutations sensibles RH + motif obligatoire. Lecture via rhProcedure.
 */
export const rhAuditLogs = pgTable("rh_audit_logs", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull(),
  entityType: varchar("entity_type", { length: 40 }).notNull(),
  entityId: integer("entity_id").notNull(),
  action: varchar("action", { length: 60 }).notNull(),
  avantJson: jsonb("avant_json"),
  apresJson: jsonb("apres_json"),
  motif: text("motif").notNull(),
  userId: integer("user_id").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});