import { pgTable, serial, integer, varchar, text, numeric, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { clients } from "./clients";
import { vehicules } from "./vehicules";
import { produits } from "./produits";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";

/**
 * ORDRE DE RÉPARATION — cycle complet plainte → diagnostic → devis → travaux → facture.
 * Statuts (module Véhicules & Atelier V2) :
 * EN_ATTENTE_DIAGNOSTIC | EN_COURS | EN_ATTENTE_PIECES | EN_ATTENTE_VALIDATION |
 * CONTROLE_QUALITE | PRET_A_LIVRER | BLOQUE | LIVRE | ANNULE
 * Priorités : P1 (critique) | P2 (haute) | P3 (normale) | P4 (basse/en attente)
 */
export const ordresReparation = pgTable("ordres_reparation", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  numero: varchar("numero", { length: 50 }).notNull().unique(),
  vehiculeId: integer("vehicule_id").notNull().references(() => vehicules.id),
  clientId: integer("client_id").references(() => clients.id),
  statut: varchar("statut", { length: 40 }).default("EN_ATTENTE_DIAGNOSTIC"),
  priorite: varchar("priorite", { length: 2 }).default("P3"), // P1 | P2 | P3 | P4
  plainte: text("plainte"),
  motEntree: varchar("mot_entree", { length: 40 }).default("AUTRE"), // PANNE|ENTRETIEN|DIAGNOSTIC|CARROSSERIE|CONTROLE|AUTRE
  diagnostic: text("diagnostic"),
  devisAccepte: boolean("devis_accepte").default(false),
  dateOuverture: timestamp("date_ouverture").defaultNow(),
  datePromesse: date("date_promesse"), // restitution promise au client
  dateFinPrevue: date("date_fin_prevue"),
  dateCloture: timestamp("date_cloture"),
  emplacement: varchar("emplacement", { length: 100 }).default("Réception"), // Parc A, Parc B, Pont 1, Pont 2, Carrosserie…
  responsableTechnicienId: integer("responsable_technicien_id").references(() => employes.id),
  raisonBlocage: text("raison_blocage"), // obligatoire si statut = BLOQUE
  bloquePar: varchar("bloque_par", { length: 120 }), // qui bloque (pièces, client, expertise…)
  clientAttendSurPlace: boolean("client_attend_sur_place").default(false),
  courtoisieDemandee: boolean("courtoisie_demandee").default(false),
  totalPieces: numeric("total_pieces", { precision: 12, scale: 2 }).default("0"),
  totalMainOeuvre: numeric("total_main_oeuvre", { precision: 12, scale: 2 }).default("0"),
  totalTTC: numeric("total_ttc", { precision: 12, scale: 2 }).default("0"),
  venteId: integer("vente_id"),
  // Suivi de facturation client (module Client 360° période) :
  // NON_TRANSMISE → TRANSMISE (facture_transmise_le) → attente BC (attente_bon_commande) → attente paiement → avance → payée
  factureTransmiseLe: timestamp("facture_transmise_le"), // date d'envoi de la facture au client
  attenteBonCommande: boolean("attente_bon_commande").default(false), // facture transmise, attend le bon de commande (entreprises/flottes)
  contratId: integer("contrat_id"), // contrat de maintenance couvrant le véhicule (facturation groupée)
  // Module Performance & Qualité (specs V2 — pilotage)
  savOrigineOrId: integer("sav_origine_or_id"), // lien vers l'OR d'origine si retour SAV
  motifRetourSAV: varchar("motif_retour_sav", { length: 40 }), // CONSIGNE_NON_RESPECTEE | MALFACON | DIAGNOSTIC_ERRONE | PIECE_DEFAILLANTE | AUTRE
  familleService: varchar("famille_service", { length: 40 }), // MECANIQUE_LEGERE | FREINAGE | DIAGNOSTIC | CARROSSERIE | DISTRIBUTION | CLIMATISATION | ELECTRONIQUE | GROSSE_MECA | AUTRE
  satisfactionNote: integer("satisfaction_note"), // 1-5 étoiles (saisie à la livraison)
  satisfactionCommentaire: text("satisfaction_commentaire"),
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
  rapportId: integer("rapport_id"), // lien vers or_rapports_diagnostic (préconisations du diagnostic)
  // specs MVP — validation admin par ligne : l'extra n'est compté que si validé
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
