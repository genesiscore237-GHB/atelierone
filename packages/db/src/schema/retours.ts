import { integer, numeric, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { ventes } from "./ventes";
import { ventesLignes } from "./ventes";
import { clients } from "./clients";
import { produits } from "./produits";
import { unitesMesure } from "./unites_mesure";
import { utilisateurs } from "./utilisateurs";

export const retours = pgTable("retours", {
  id: serial("id").primaryKey(),
  venteId: integer("vente_id").notNull().references(() => ventes.id),
  clientId: integer("client_id").references(() => clients.id),
  montantTotal: numeric("montant_total", { precision: 12, scale: 2 }).notNull(),
  typeRetour: varchar("type_retour", { length: 50 }).notNull(),
  statut: varchar("statut", { length: 50 }).default("en_attente"),
  motif: text("motif"),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lignesRetour = pgTable("lignes_retour", {
  id: serial("id").primaryKey(),
  retourId: integer("retour_id").notNull().references(() => retours.id),
  venteLigneId: integer("vente_ligne_id").references(() => ventesLignes.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  quantite: integer("quantite").notNull(),
  uniteId: uuid("unite_id").references(() => unitesMesure.id),
  facteurConversion: integer("facteur_conversion").notNull().default(1),
  prixUnitaire: numeric("prix_unitaire", { precision: 12, scale: 2 }).notNull(),
  totalLigne: numeric("total_ligne", { precision: 12, scale: 2 }),
  coutUnitaire: numeric("cout_unitaire", { precision: 12, scale: 2 }),
});

export const avoirs = pgTable("avoirs", {
  id: serial("id").primaryKey(),
  retourId: integer("retour_id").references(() => retours.id),
  venteId: integer("vente_id").notNull().references(() => ventes.id),
  clientId: integer("client_id").references(() => clients.id),
  montantInitial: numeric("montant_initial", { precision: 12, scale: 2 }).notNull(),
  montantRestant: numeric("montant_restant", { precision: 12, scale: 2 }).notNull(),
  statut: varchar("statut", { length: 50 }).default("actif"),
  expireLe: timestamp("expire_le"),
  createdAt: timestamp("created_at").defaultNow(),
});
