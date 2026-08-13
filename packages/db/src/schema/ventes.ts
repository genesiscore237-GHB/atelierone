import { integer, numeric, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { clients } from "./clients";
import { produits } from "./produits";
import { unitesMesure } from "./unites_mesure";
import { sessionsCaisse } from "./sessions_caisse";
import { utilisateurs } from "./utilisateurs";
import { lots } from "./lots";

export const ventes = pgTable("ventes", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  reference: varchar("reference", { length: 100 }).notNull().unique(),
  operateurId: integer("operateur_id").notNull().references(() => utilisateurs.id),
  clientId: integer("client_id").references(() => clients.id),
  sessionCaisseId: integer("session_caisse_id").references(() => sessionsCaisse.id),
  venteIdOrigine: integer("vente_id_origine").references(() => ventes.id),
  modePaiement: varchar("mode_paiement", { length: 50 }).notNull().default("especes"),
  montantTotal: numeric("montant_total", { precision: 12, scale: 2 }).notNull(),
  remise: numeric("remise", { precision: 12, scale: 2 }).default("0"),
  montantPaye: numeric("montant_paye", { precision: 12, scale: 2 }),
  statut: varchar("statut", { length: 50 }).notNull().default("termine"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ventesLignes = pgTable("ventes_lignes", {
  id: serial("id").primaryKey(),
  venteId: integer("vente_id").notNull().references(() => ventes.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  quantite: integer("quantite").notNull(),
  uniteId: uuid("unite_id").references(() => unitesMesure.id),
  facteurConversion: integer("facteur_conversion").notNull().default(1),
  quantiteConvertie: numeric("quantite_convertie", { precision: 12, scale: 2 }),
  prixUnitaire: numeric("prix_unitaire", { precision: 12, scale: 2 }).notNull(),
  totalLigne: numeric("total_ligne", { precision: 12, scale: 2 }),
  coutUnitaire: numeric("cout_unitaire", { precision: 12, scale: 2 }),
  lotId: integer("lot_id").references(() => lots.id),
});
