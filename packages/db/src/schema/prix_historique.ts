import { bigserial, integer, numeric, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { fournisseurs } from "./fournisseurs";
import { unitesMesure } from "./unites_mesure";
import { utilisateurs } from "./utilisateurs";
import { agences } from "./agences";

export const prixHistorique = pgTable("prix_historique", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  fournisseurId: integer("fournisseur_id").references(() => fournisseurs.id),
  uniteId: uuid("unite_id").references(() => unitesMesure.id),
  typePrix: varchar("type_prix", { length: 50 }).notNull(),
  ancienPrix: numeric("ancien_prix", { precision: 12, scale: 2 }),
  nouveauPrix: numeric("nouveau_prix", { precision: 12, scale: 2 }).notNull(),
  source: varchar("source", { length: 50 }).notNull(),
  reference: varchar("reference", { length: 100 }),
  referenceType: varchar("reference_type", { length: 50 }),
  motif: text("motif"),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  agenceId: integer("agence_id").references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});