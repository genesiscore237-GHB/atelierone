import { integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { achats } from "./achats";
import { fournisseurs } from "./fournisseurs";
import { agences } from "./agences";
import { produits } from "./produits";
import { utilisateurs } from "./utilisateurs";

export const bonsReception = pgTable("bons_reception", {
  id: serial("id").primaryKey(),
  achatId: integer("achat_id").references(() => achats.id),
  fournisseurId: integer("fournisseur_id").notNull().references(() => fournisseurs.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  reference: varchar("reference", { length: 100 }).notNull().unique(),
  statut: varchar("statut", { length: 50 }).default("brouillon"),
  notes: text("notes"),
  receptionnePar: integer("receptionne_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lignesBonReception = pgTable("lignes_bon_reception", {
  id: serial("id").primaryKey(),
  bonReceptionId: integer("bon_reception_id").notNull().references(() => bonsReception.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  quantiteCommandee: integer("quantite_commandee").notNull(),
  quantiteRecue: integer("quantite_recue").notNull(),
  prixUnitaire: numeric("prix_unitaire", { precision: 12, scale: 2 }).notNull(),
  prixUnitaireBC: numeric("prix_unitaire_bc", { precision: 12, scale: 2 }),
  motifEcart: text("motif_ecart"),
});
