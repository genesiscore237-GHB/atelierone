import { pgTable, serial, integer, varchar, date, numeric, boolean, timestamp, text } from "drizzle-orm/pg-core";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";

export const absences = pgTable("absences", {
  id: serial("id").primaryKey(),
  employeId: integer("employe_id").notNull().references(() => employes.id),
  typeAbsence: varchar("type_absence", { length: 50 }).notNull(),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin"),
  dureeJours: numeric("duree_jours", { precision: 5, scale: 1 }),
  motif: text("motif"),
  justifie: boolean("justifie").default(false),
  validePar: integer("valide_par").references(() => utilisateurs.id),
  statut: varchar("statut", { length: 50 }).default("en_attente"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sanctions = pgTable("sanctions", {
  id: serial("id").primaryKey(),
  employeId: integer("employe_id").notNull().references(() => employes.id),
  typeSanction: varchar("type_sanction", { length: 50 }).notNull(),
  motif: text("motif").notNull(),
  gravite: varchar("gravite", { length: 20 }).default("MOYENNE"),
  dateSanction: date("date_sanction").notNull(),
  dateDebutEffet: date("date_debut_effet"),
  dateFinEffet: date("date_fin_effet"),
  dureeJours: numeric("duree_jours", { precision: 5, scale: 1 }),
  detailsFinanciers: numeric("details_financiers", { precision: 12, scale: 2 }),
  appliquee: boolean("appliquee").default(false),
  validePar: integer("valide_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contrats = pgTable("contrats", {
  id: serial("id").primaryKey(),
  employeId: integer("employe_id").notNull().references(() => employes.id),
  typeContrat: varchar("type_contrat", { length: 50 }).notNull(),
  dateDebut: date("date_debut").notNull(),
  dateFin: date("date_fin"),
  dureeMois: integer("duree_mois"),
  salaireBase: numeric("salaire_base", { precision: 12, scale: 2 }),
  poste: varchar("poste", { length: 255 }),
  statut: varchar("statut", { length: 50 }).default("actif"),
  fichierUrl: text("fichier_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documentsEmployes = pgTable("documents_employes", {
  id: serial("id").primaryKey(),
  employeId: integer("employe_id").notNull().references(() => employes.id),
  typeDocument: varchar("type_document", { length: 50 }).notNull(),
  titre: varchar("titre", { length: 255 }),
  fichierUrl: text("fichier_url").notNull(),
  dateEmission: date("date_emission"),
  dateExpiration: date("date_expiration"),
  statut: varchar("statut", { length: 50 }).default("actif"),
  createdAt: timestamp("created_at").defaultNow(),
});
