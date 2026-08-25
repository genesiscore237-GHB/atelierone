import { date, integer, numeric, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { fournisseurs } from "./fournisseurs";
import { agences } from "./agences";
import { produits } from "./produits";
import { unitesMesure } from "./unites_mesure";
import { utilisateurs } from "./utilisateurs";
import { caisses } from "./caisses";
import { ordresReparation } from "./ordres_reparation";
import { vehicules } from "./vehicules";

export const achats = pgTable("achats", {
  id: serial("id").primaryKey(),
  fournisseurId: integer("fournisseur_id").notNull().references(() => fournisseurs.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  reference: varchar("reference", { length: 100 }).notNull().unique(),
  statut: varchar("statut", { length: 50 }).notNull().default("brouillon"),
  orId: integer("or_id").references(() => ordresReparation.id), // traçabilité : commande liée à un OR
  vehiculeId: integer("vehicule_id").references(() => vehicules.id),
  totalHT: numeric("total_ht", { precision: 12, scale: 2 }),
  totalTVA: numeric("total_tva", { precision: 12, scale: 2 }),
  totalTTC: numeric("total_ttc", { precision: 12, scale: 2 }),
  notes: text("notes"),
  demandeur: varchar("demandeur", { length: 255 }),
  demandeurId: integer("demandeur_id").references(() => utilisateurs.id),
  dateSouhaitee: date("date_souhaitee"),
  priorite: varchar("priorite", { length: 20 }).notNull().default("normale"),
  motif: text("motif"),
  destinationPosId: integer("destination_pos_id").references(() => caisses.id),
  livraisonAttendue: date("livraison_attendue"),
  creePar: integer("cree_par").references(() => utilisateurs.id),
  montantRecu: numeric("montant_recu", { precision: 12, scale: 2 }).default("0"),
  montantPaye: numeric("montant_paye", { precision: 12, scale: 2 }).default("0"),
  dateCloture: timestamp("date_cloture"),
  cloturePar: integer("cloture_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const achatsLignes = pgTable("achats_lignes", {
  id: serial("id").primaryKey(),
  achatId: integer("achat_id").notNull().references(() => achats.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  orId: integer("or_id").references(() => ordresReparation.id), // traçabilité ligne ↔ OR
  quantite: integer("quantite").notNull(),
  uniteId: uuid("unite_id").references(() => unitesMesure.id),
  facteurConversion: numeric("facteur_conversion", { precision: 12, scale: 6 }).notNull().default("1"),
  quantiteConvertie: numeric("quantite_convertie", { precision: 12, scale: 2 }),
  prixUnitaire: numeric("prix_unitaire", { precision: 12, scale: 2 }).notNull(),
  totalLigne: numeric("total_ligne", { precision: 12, scale: 2 }),
});
