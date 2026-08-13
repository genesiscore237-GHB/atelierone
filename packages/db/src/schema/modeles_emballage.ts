import { pgTable, uuid, varchar, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { unitesMesure } from "./unites_mesure";

export const modelesEmballage = pgTable("modeles_emballage", {
  id: uuid("id").defaultRandom().primaryKey(),
  nom: varchar("nom", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const modeleEmballageNiveaux = pgTable("modele_emballage_niveaux", {
  id: uuid("id").defaultRandom().primaryKey(),
  modeleId: uuid("modele_id").notNull().references(() => modelesEmballage.id, { onDelete: "cascade" }),
  uniteId: uuid("unite_id").notNull().references(() => unitesMesure.id),
  parentNiveauId: uuid("parent_niveau_id").references(() => modeleEmballageNiveaux.id),
  quantiteDansParent: numeric("quantite_dans_parent", { precision: 14, scale: 4 }),
  estUniteBase: boolean("est_unite_base").default(false),
  ordreAffichage: integer("ordre_affichage").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
