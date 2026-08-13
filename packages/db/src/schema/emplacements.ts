import { pgTable, integer, varchar, uuid, timestamp, boolean, serial } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { categories } from "./categories";
import { sousSystemes } from "./sous_systemes";
import { niveaux } from "./niveaux";
import { classes } from "./classes";
import { filieres } from "./filieres";

export const emplacements = pgTable("emplacements", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  type: varchar("type", { length: 20 }).notNull().default("RAYON"),
  code: varchar("code", { length: 50 }).notNull(),
  libelle: varchar("libelle", { length: 255 }),
  parentId: integer("parent_id").references(() => emplacements.id),
  profondeur: integer("profondeur").notNull().default(0),
  categorieId: integer("categorie_id").references(() => categories.id),
  sousSystemeId: uuid("sous_systeme_id").references(() => sousSystemes.id),
  niveauId: uuid("niveau_id").references(() => niveaux.id),
  classeId: uuid("classe_id").references(() => classes.id),
  filiereId: uuid("filiere_id").references(() => filieres.id),
  ordre: integer("ordre").notNull().default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const postesVente = pgTable("postes_vente", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  emplacementId: integer("emplacement_id").notNull().references(() => emplacements.id),
  code: varchar("code", { length: 50 }).notNull(),
  libelle: varchar("libelle", { length: 255 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
