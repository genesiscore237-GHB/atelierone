import { pgTable, serial, integer, varchar, text, timestamp, date, numeric, boolean } from "drizzle-orm/pg-core";
import { ordresReparation, lignesOrdreReparation } from "./ordres_reparation";
import { employes } from "./employes";
import { utilisateurs } from "./utilisateurs";
import { produits } from "./produits";
import { fournisseurs } from "./fournisseurs";
import { achats, achatsLignes } from "./achats";
import { bonsReception } from "./bons_reception";
import { vehicules } from "./vehicules";
import { agences } from "./agences";

/** N2 — Temps standards par famille de service (compétitivité délais — specs V2). */
export const servicesStandards = pgTable("services_standards", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  famille: varchar("famille", { length: 40 }).notNull(),
  libelle: varchar("libelle", { length: 120 }).notNull(),
  tempsStandardHeures: numeric("temps_standard_heures", { precision: 6, scale: 2 }).notNull(),
  delaiCibleJours: integer("delai_cible_jours").default(1),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

/** N4 — Cibles des indicateurs de santé du garage (paramétrables par la Direction). */
export const kpiCibles = pgTable("kpi_cibles", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  code: varchar("code", { length: 50 }).notNull(), // PONCTUALITE | FTQ | TAUX_RETOUR_SAV | RAPIDITE_DIAG_JOURS | FIABILITE_APPRO
  cible: numeric("cible", { precision: 10, scale: 2 }).notNull(),
  seuilOrange: numeric("seuil_orange", { precision: 10, scale: 2 }),
  seuilRouge: numeric("seuil_rouge", { precision: 10, scale: 2 }),
  unite: varchar("unite", { length: 12 }).default("%"),
  sens: varchar("sens", { length: 8 }).default("HAUT"), // HAUT = plus haut est mieux | BAS = plus bas est mieux
  fenetreJours: integer("fenetre_jours").default(30),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * CYCLE D'ATELIER — rapport de diagnostic, demandes de pièces, retours fournisseur.
 * (diagnostic structuré → validation chef → devis client → magasin → fournisseur → retour)
 */

/** Rapport de diagnostic structuré : constat, cause, préconisations (lignes OR liées). */
export const orRapportsDiagnostic = pgTable("or_rapports_diagnostic", {
  id: serial("id").primaryKey(),
  orId: integer("or_id").notNull().references(() => ordresReparation.id, { onDelete: "cascade" }),
  technicienId: integer("technicien_id").references(() => employes.id),
  constat: text("constat"),
  cause: text("cause"),
  statut: varchar("statut", { length: 20 }).default("BROUILLON"), // BROUILLON | SOUMIS | VALIDE | RETOURNE
  dateSoumission: timestamp("date_soumission"),
  validePar: integer("valide_par").references(() => employes.id),
  valideLe: timestamp("valide_le"),
  commentaireValidateur: text("commentaire_validateur"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Demande de pièces au magasin (liée à l'OR et au véhicule). */
export const orDemandesPieces = pgTable("or_demandes_pieces", {
  id: serial("id").primaryKey(),
  orId: integer("or_id").notNull().references(() => ordresReparation.id, { onDelete: "cascade" }),
  vehiculeId: integer("vehicule_id").references(() => vehicules.id),
  demandeurId: integer("demandeur_id").references(() => employes.id),
  statut: varchar("statut", { length: 20 }).default("EN_ATTENTE"), // EN_ATTENTE | PARTIELLE | SERVIE | MANQUANTE | ANNULEE
  traitePar: integer("traite_par").references(() => utilisateurs.id),
  traiteLe: timestamp("traite_le"),
  motif: text("motif"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orDemandesPiecesLignes = pgTable("or_demandes_pieces_lignes", {
  id: serial("id").primaryKey(),
  demandeId: integer("demande_id").notNull().references(() => orDemandesPieces.id, { onDelete: "cascade" }),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull(),
  quantiteServie: numeric("quantite_servie", { precision: 12, scale: 2 }).default("0"),
  prixEstime: numeric("prix_estime", { precision: 12, scale: 2 }),
  note: text("note"),
  manquant: boolean("manquant").default(false),
  motifManquant: text("motif_manquant"),
});

/** Retour fournisseur (pièce défaillante / non conforme). */
export const retoursFournisseur = pgTable("retours_fournisseur", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  achatId: integer("achat_id").references(() => achats.id),
  bonReceptionId: integer("bon_reception_id").references(() => bonsReception.id),
  fournisseurId: integer("fournisseur_id").references(() => fournisseurs.id),
  orId: integer("or_id").references(() => ordresReparation.id),
  motif: varchar("motif", { length: 30 }).default("DEFAILLANTE"), // DEFAILLANTE | NON_CONFORME | ERREUR_COMMANDE
  statut: varchar("statut", { length: 20 }).default("RETOURNE"), // BROUILLON | RETOURNE | REMPLACE | CLOTURE
  dateRetour: date("date_retour"),
  commentaire: text("commentaire"),
  creePar: integer("cree_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const retoursFournisseurLignes = pgTable("retours_fournisseur_lignes", {
  id: serial("id").primaryKey(),
  retourId: integer("retour_id").notNull().references(() => retoursFournisseur.id, { onDelete: "cascade" }),
  produitId: integer("produit_id").references(() => produits.id),
  libelle: varchar("libelle", { length: 255 }),
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
});

/** Notifications atelier (E1) : diagnostic à valider, pièce arrivée/manquante, commande passée… */
export const atelierNotifications = pgTable("atelier_notifications", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  orId: integer("or_id").references(() => ordresReparation.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull(), // DIAGNOSTIC_A_VALIDER | PIECE_ARRIVEE | PIECE_MANQUANTE | COMMANDE_PASSEE
  titre: varchar("titre", { length: 255 }).notNull(),
  message: text("message"),
  lu: boolean("lu").default(false),
  luePar: integer("lue_par").references(() => utilisateurs.id),
  lueLe: timestamp("lue_le"),
  createdAt: timestamp("created_at").defaultNow(),
});