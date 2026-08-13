import { pgTable, serial, integer, varchar, numeric, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { fournisseurs } from "./fournisseurs";
import { produits } from "./produits";
import { ventes } from "./ventes";
import { agences } from "./agences";

export const facturesPartenaires = pgTable("factures_partenaires", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 100 }).notNull().unique(),
  partenaireId: integer("partenaire_id").notNull().references(() => fournisseurs.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  quantite: integer("quantite").notNull(),
  prixCatalogue: numeric("prix_catalogue", { precision: 12, scale: 2 }).notNull(),
  prixFacture: numeric("prix_facture", { precision: 12, scale: 2 }).notNull(),
  ecart: numeric("ecart", { precision: 12, scale: 2 }).notNull(),
  venteId: integer("vente_id").notNull().references(() => ventes.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  statut: varchar("statut", { length: 50 }).default("emise"),
  ecartComptable: boolean("ecart_comptable").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});
