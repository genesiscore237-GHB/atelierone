import {
  boolean,
  date,
  decimal,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";

// ─── R6 : Cycle de vie RH — situations datées, catalogue et journal (D-R6-02, D-R6-09, D-R6-10) ───
// Une seule table générique datée remplace tout statut « maladie », « congé »,
// « mise à pied », « absence », « maternité » (aucune nouvelle valeur de statut).

/** Catalogue paramétrable des situations RH (catégorie/type + impacts par défaut + source de la règle). */
export const hrSituationTypes = pgTable("hr_situation_types", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  category: varchar("category", { length: 30 }).notNull(), // ABSENCE | CONGE | MALADIE | ACCIDENT_TRAVAIL | MATERNITE | DISCIPLINAIRE | SUSPENSION | SORTIE | AUTRE
  type: varchar("type", { length: 60 }).notNull(), // ex. MISE_A_PIED, CONGE_ANNUEL…
  subType: varchar("sub_type", { length: 60 }),
  name: varchar("name", { length: 120 }).notNull(),
  // Impacts par défaut (paramétrables par agence)
  impactContrat: varchar("impact_contrat", { length: 20 }).notNull().default("ACTIVE"), // ACTIVE | SUSPENDU | TERMINE
  impactPresence: varchar("impact_presence", { length: 30 }).notNull(), // POINTAGE_AUTORISE | POINTAGE_INTERDIT | PRESENCE | ABSENCE | CONGE | SUSPENSION | NON_COMPTABLE
  impactPlanning: varchar("impact_planning", { length: 30 }).notNull().default("PLANIFIE"), // PLANIFIE | NON_PLANIFIABLE | ABSENT | BLOQUE | AUTRE
  impactPaie: varchar("impact_paie", { length: 30 }).notNull(), // NORMAL | MAINTIEN_REMUNERATION | RETENUE | NON_REMUNERE | PARTIEL | INDEMNISATION_EXTERNE | A_DETERMINER | MANUEL
  modeCalculPaie: varchar("mode_calcul_paie", { length: 30 }).notNull().default("PRORATA_JOURS"), // PRORATA_JOURS | PRORATA_HEURES | FIXE | SANS
  baseCalculPaie: varchar("base_calcul_paie", { length: 30 }),
  validationRequise: boolean("validation_requise").notNull().default(true),
  approbationRequise: boolean("approbation_requise").notNull().default(true),
  requiresDocument: boolean("requires_document").notNull().default(false),
  // Règle applicable (jamais une politique GPJ présentée comme légale)
  source: varchar("source", { length: 10 }).notNull().default("POL"), // LOI | CONV | POL | CFG
  baseJuridique: varchar("base_juridique", { length: 60 }), // ex. art. 30, art. 84
  // Garde-fous (art. 30 : mise à pied ≤ 8 jours ouvrables)
  dureeMaxJours: integer("duree_max_jours"),
  notificationEcriteRequise: boolean("notification_ecrite_requise").notNull().default(false),
  communicationInspectionRequise: boolean("communication_inspection_requise").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Situation RH datée d'un employé (objet de premier niveau, impacts dérivés — D-R6-09). */
export const employeeSituations = pgTable("employee_situations", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  employeeId: integer("employee_id").notNull().references(() => employes.id, { onDelete: "cascade" }),
  situationTypeId: integer("situation_type_id").references(() => hrSituationTypes.id),
  category: varchar("category", { length: 30 }).notNull(),
  type: varchar("type", { length: 60 }).notNull(),
  subType: varchar("sub_type", { length: 60 }),
  name: varchar("name", { length: 120 }),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin"), // NULL = ouverte
  dateEffet: date("date_effet"), // défaut = date_debut (source de vérité temporelle)
  dureeJours: integer("duree_jours"), // mise à pied (art. 30)
  motif: text("motif"),
  faitReproche: text("fait_reproche"), // MAP
  commentaire: text("commentaire"),
  justificatifUrl: varchar("justificatif_url", { length: 500 }),
  // Garde-fous mise à pied (art. 30)
  notificationEcrite: boolean("notification_ecrite").notNull().default(false),
  notificationAt: timestamp("notification_at"),
  communicationInspection: boolean("communication_inspection").notNull().default(false),
  communicationInspectionAt: timestamp("communication_inspection_at"),
  detailsFinanciers: text("details_financiers"), // interdiction d'amende : retenue strictement proportionnelle aux jours non prestés
  montantRetenue: decimal("montant_retenue", { precision: 12, scale: 0 }),
  // Impacts (politique explicite, jamais « suspension = 0 »)
  impactContrat: varchar("impact_contrat", { length: 20 }).notNull(),
  impactPresence: varchar("impact_presence", { length: 30 }).notNull(),
  impactPlanning: varchar("impact_planning", { length: 30 }).notNull(),
  impactPaie: varchar("impact_paie", { length: 30 }).notNull(),
  modeCalculPaie: varchar("mode_calcul_paie", { length: 30 }).notNull().default("PRORATA_JOURS"),
  baseCalculPaie: varchar("base_calcul_paie", { length: 30 }),
  validationRequise: boolean("validation_requise").notNull().default(true),
  anomalie: varchar("anomalie", { length: 40 }), // OUVERTURE_D_ANOMALIE (conflit non résolu silencieusement)
  // Workflow (D-R6-10)
  statutWorkflow: varchar("statut_workflow", { length: 20 }).notNull().default("BROUILLON"), // BROUILLON|SOUMIS|EN_ATTENTE|APPROUVE|REFUSE|ACTIF|TERMINE|ANNULE
  approbationRequise: boolean("approbation_requise").notNull().default(true),
  approbateurId: integer("approbateur_id").references(() => utilisateurs.id),
  approuveAt: timestamp("approuve_at"),
  // Provenance (lecture conjointe avec l'existant : absences / sanctions / leave_requests / employes)
  provenanceTable: varchar("provenance_table", { length: 40 }),
  provenanceId: integer("provenance_id"),
  // Audit
  createdBy: integer("created_by").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Journal des transitions d'état des situations (pattern R5 `advance_transitions`). */
export const employeeSituationTransitions = pgTable("employee_situation_transitions", {
  id: serial("id").primaryKey(),
  situationId: integer("situation_id").notNull().references(() => employeeSituations.id, { onDelete: "cascade" }),
  fromStatus: varchar("from_status", { length: 20 }),
  toStatus: varchar("to_status", { length: 20 }).notNull(),
  acteurId: integer("acteur_id").references(() => utilisateurs.id),
  justification: text("justification"),
  documentUrl: varchar("document_url", { length: 500 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});