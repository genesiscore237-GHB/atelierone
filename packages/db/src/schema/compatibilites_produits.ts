import { pgTable, serial, integer, varchar, unique } from "drizzle-orm/pg-core";
import { produits } from "./produits";

/**
 * COMPATIBILITÉ VÉHICULE (wireframe produit) — très important pour un garage :
 * un produit peut être compatible avec plusieurs véhicules (marque, modèle,
 * année de → à, motorisation).
 */
export const compatibilitesProduits = pgTable(
  "compatibilites_produits",
  {
    id: serial("id").primaryKey(),
    produitId: integer("produit_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
    marque: varchar("marque", { length: 80 }).notNull(),
    modele: varchar("modele", { length: 120 }).notNull(),
    anneeDe: integer("annee_de"),
    anneeA: integer("annee_a"),
    motorisation: varchar("motorisation", { length: 80 }),
  },
  (t) => [unique("unq_compat_produit").on(t.produitId, t.marque, t.modele, t.motorisation)]
);