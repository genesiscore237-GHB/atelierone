import { pgTable, serial, integer, varchar, text, numeric, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { clients } from "./clients";
import { vehicules } from "./vehicules";
import { produits } from "./produits";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";

/**
 * ORDRE DE RÉPARATION — cycle complet plainte → diagnostic → devis → travaux → facture.
 * Statuts : ouvert, en_cours, attente_piece, termine, facture, annule
 */
export const ordresReparation = pgTable("ordres_reparation", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  numero: varchar("numero", { length: 50 }).notNull().unique(),
  vehiculeId: integer("vehicule_id").notNull().references(() => vehicules.id),
  clientId: integer("client_id").references(() => clients.id),
  statut: varchar("statut", { length: 30 }).default("ouvert"),
  plainte: text("plainte"),
  diagnostic: text("diagnostic"),
  devisAccepte: boolean("devis_accepte").default(false),
  dateOuverture: timestamp("date_ouverture").defaultNow(),
  dateFinPrevue: date("date_fin_prevue"),
  dateCloture: timestamp("date_cloture"),
  totalPieces: numeric("total_pieces", { precision: 12, scale: 2 }).default("0"),
  totalMainOeuvre: numeric("total_main_oeuvre", { precision: 12, scale: 2 }).default("0"),
  totalTTC: numeric("total_ttc", { precision: 12, scale: 2 }).default("0"),
  venteId: integer("vente_id"),
  contratId: integer("contrat_id"), // contrat de maintenance couvrant le véhicule (facturation groupée)
  creePar: integer("cree_par").references(() => utilisateurs.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * LIGNES D'ORDRE DE RÉPARATION — pièces détachées et interventions (main d'œuvre).
 */
export const lignesOrdreReparation = pgTable("lignes_ordre_reparation", {
  id: serial("id").primaryKey(),
  ordreId: integer("ordre_id").notNull().references(() => ordresReparation.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull().default("PIECE"), // PIECE | SERVICE
  produitId: integer("produit_id").references(() => produits.id),
  libelle: varchar("libelle", { length: 255 }).notNull(),
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull().default("1"),
  prixUnitaire: numeric("prix_unitaire", { precision: 12, scale: 2 }).notNull().default("0"),
  tva: numeric("tva", { precision: 5, scale: 2 }).default("0"),
  totalLigne: numeric("total_ligne", { precision: 12, scale: 2 }).default("0"),
  technicienId: integer("technicien_id").references(() => employes.id),
  dureeHeures: numeric("duree_heures", { precision: 6, scale: 2 }),
  statut: varchar("statut", { length: 30 }).default("a_faire"), // a_faire | en_cours | fait | valide
  // specs V2 §04 processus 8 — pièces fournies par le client : traçabilité sans impact stock
  fournieParClient: boolean("fournie_par_client").default(false),
  remiseAuClient: boolean("remise_au_client").default(false),
  motifClient: text("motif_client"),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * INTERVENTIONS TECHNICIENS — pointage temps réel par technicien / OR / ligne.
 */
export const interventionsTechniciens = pgTable("interventions_techniciens", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  ordreId: integer("ordre_id").notNull().references(() => ordresReparation.id, { onDelete: "cascade" }),
  ligneId: integer("ligne_id").references(() => lignesOrdreReparation.id),
  technicienId: integer("technicien_id").notNull().references(() => employes.id),
  dateIntervention: date("date_intervention").notNull(),
  heureDebut: timestamp("heure_debut"),
  heureFin: timestamp("heure_fin"),
  dureeHeures: numeric("duree_heures", { precision: 6, scale: 2 }),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});
