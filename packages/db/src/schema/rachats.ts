import { boolean, integer, numeric, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { ventes, ventesLignes } from "./ventes";
import { lots } from "./lots";

export const rachats = pgTable("rachats", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 100 }).notNull().unique(),
  clientNom: varchar("client_nom", { length: 255 }),
  clientContact: varchar("client_contact", { length: 100 }),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  operateurId: integer("operateur_id").notNull(),
  montantTotal: numeric("montant_total", { precision: 12, scale: 2 }).default("0"),
  type: varchar("type", { length: 50 }).default("rachat_simple"),
  venteId: integer("vente_id").references(() => ventes.id),
  montantEchange: numeric("montant_echange", { precision: 12, scale: 2 }),
  difference: numeric("difference", { precision: 12, scale: 2 }),
  stocke: boolean("stocke").default(false),
  statut: varchar("statut", { length: 50 }).default("termine"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const rachatsLignes = pgTable("rachats_lignes", {
  id: serial("id").primaryKey(),
  rachatId: integer("rachat_id").notNull().references(() => rachats.id, { onDelete: "cascade" }),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  quantite: integer("quantite").notNull().default(1),
  prixUnitaire: numeric("prix_unitaire", { precision: 12, scale: 2 }).notNull(),
  etat: varchar("etat", { length: 50 }).default("usage"),
  totalLigne: numeric("total_ligne", { precision: 12, scale: 2 }),
  prixReseal: numeric("prix_reseal", { precision: 12, scale: 2 }),
  lotId: integer("lot_id").references(() => lots.id),
  vendu: boolean("vendu").default(false),
  venteLigneId: integer("vente_ligne_id").references(() => ventesLignes.id),
  createdAt: timestamp("created_at").defaultNow(),
});
