import { pgTable, uuid, integer, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { produits } from "./produits";

export const listesScolaires = pgTable("listes_scolaires", {
  id: uuid("id").defaultRandom().primaryKey(),
  nom: varchar("nom", { length: 255 }).notNull(),
  anneeScolaire: varchar("annee_scolaire", { length: 20 }).default("2026-2027"),
  ministere: varchar("ministere", { length: 20 }).default("MINESEC"),
  agenceId: integer("agence_id").references(() => agences.id),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const listeScolaireItems = pgTable("liste_scolaire_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  listeId: uuid("liste_id").notNull().references(() => listesScolaires.id, { onDelete: "cascade" }),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  quantiteRequise: integer("quantite_requise").default(1),
  priorite: varchar("priorite", { length: 20 }).default("obligatoire"),
  createdAt: timestamp("created_at").defaultNow(),
});
