import { pgTable, integer, varchar, uuid, timestamp, boolean, serial } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { categories } from "./categories";

export const emplacements = pgTable("emplacements", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  type: varchar("type", { length: 20 }).notNull().default("RAYON"),
  code: varchar("code", { length: 50 }).notNull(),
  libelle: varchar("libelle", { length: 255 }),
  parentId: integer("parent_id").references(() => emplacements.id),
  profondeur: integer("profondeur").notNull().default(0),
  categorieId: integer("categorie_id").references(() => categories.id),
  ordre: integer("ordre").notNull().default(0),
  // Zone FONCTIONNELLE (Lot 1 étape 4) : NORMAL, RECEPTION, QUARANTAINE,
  // REBUTS, PERIMES — indépendante du type physique (RAYON, BAC…). CHECK
  // posé par `0029_emplacements_stockage.sql`.
  zoneStockage: varchar("zone_stockage", { length: 20 }).notNull().default("NORMAL"),
  // Nombre maximum d'articles supportés ; NULL = pas de limite définie.
  capacite: integer("capacite"),
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
