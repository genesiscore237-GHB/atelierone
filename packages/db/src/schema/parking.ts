import {
  pgTable, serial, integer, varchar, timestamp, boolean, text, jsonb, doublePrecision, uuid,
} from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { utilisateurs } from "./utilisateurs";

// ─── MODULE PARKING & VÉHICULES IMMOBILISÉS (GPJ) ────────────────────────────
// Modèle spatial : Site → Zone → Emplacement logique → Véhicule (empreinte + rotation).
// Apporté de libracore tel quel, adapté sans PostGIS : pas de colonnes geometry()
// (geom / footprint). La détection de collision est purement applicative
// (packages/geo + server/lib/parking-spatial).

// Type de zone — reflet du plan réel GPJ (extensible).
export type ParkingZoneType =
  | "GRAND_PARKING"
  | "HANGAR"
  | "PARKING_INTERMEDIAIRE"
  | "PARKING_SECONDAIRE"
  | "PONT_ELEVATEUR"
  | "LAVAGE_GRAISSAGE"
  | "ZONE_TECHNIQUE"
  | "BATIMENT"
  | "VOIE"
  | "CIRCULATION"
  | "RESSOURCE_TRAVAIL"
  | "AIRE_LIBRE";

// Géométrie : rectangle {x,y,w,h} ou polygone {points:[{x,y}...]} (unités = mètres).
export type ParkingGeometry =
  | { type: "rectangle"; x: number; y: number; w: number; h: number }
  | { type: "polygon"; points: { x: number; y: number }[] };

export type ParkingSpotStatus = "LIBRE" | "OCCUPE" | "BLOQUE" | "RESERVE";

export const parkingSites = pgTable("parking_sites", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  code: varchar("code", { length: 50 }).notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  description: text("description"),
  // Plan : dimensions nominales en mètres (à calibrer sur site).
  planLargeur: doublePrecision("plan_largeur").default(100),
  planHauteur: doublePrecision("plan_hauteur").default(75),
  isPrimary: boolean("is_primary").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const parkingZones = pgTable("parking_zones", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  siteId: integer("site_id").notNull().references(() => parkingSites.id),
  code: varchar("code", { length: 50 }).notNull(),
  nom: varchar("nom", { length: 255 }).notNull(),
  type: varchar("type", { length: 40 }).notNull().default("AIRE_LIBRE"),
  geometrie: jsonb("geometrie").$type<ParkingGeometry>().notNull(),
  // Capacité logique (nombre de véhicules théorique en rangement simple).
  capaciteTheorique: integer("capacite_theorique").default(0),
  // Surface stationnable dérivée de la géométrie (corrige D7).
  surfaceStationnable: doublePrecision("surface_stationnable").default(0),
  orientationAutorisee: doublePrecision("orientation_autorisee"), // NULL = libre (au lieu de 0° imposé)
  margeSecurite: doublePrecision("marge_securite").default(0.3),
  stationnable: boolean("stationnable").default(true),
  placeParking: boolean("place_parking").default(false),
  ressourceTravail: boolean("ressource_travail").default(false),
  // Configuration libre (grille : cols/rows, restrictions véhicules lourds…).
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  ordre: integer("ordre").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const parkingSpots = pgTable("parking_spots", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  siteId: integer("site_id").notNull().references(() => parkingSites.id),
  zoneId: integer("zone_id").notNull().references(() => parkingZones.id),
  code: varchar("code", { length: 50 }).notNull(),
  geometrie: jsonb("geometrie").$type<ParkingGeometry>().notNull(),
  // Statut historique volatil : dérivé par la vue parking_spots_v
  // (BLOQUE/OCCUPE/RESERVE/LIBRE) car non stockable de façon fiable.
  statut: varchar("statut", { length: 20 }).notNull().default("LIBRE"),
  // Colonnes sources non dérivables :
  bloque: boolean("bloque").notNull().default(false),
  reservePour: integer("reserve_pour"),
  // Empreinte et rotation de l'emplacement (pour alignement véhicule).
  longueur: doublePrecision("longueur"),
  largeur: doublePrecision("largeur"),
  rotation: doublePrecision("rotation").default(0),
  ordre: integer("ordre").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ParkingVehicleStatus =
  | "EN_PARKING"
  | "EN_ATTENTE_DEVIS"
  | "EN_ATTENTE_DIAGNOSTIC"
  | "EN_ATTENTE_PIECE"
  | "EN_TRAVAUX"
  | "TERMINE_A_RECUPERER"
  | "EN_VENTE"
  | "ACCIDENTE"
  | "A_TRANSFERER"
  | "SORTI"
  | "DONNEES_INCOMPLETES";

export const parkingVehicles = pgTable("parking_vehicles", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  // Numéro historique du registre (1-48, le 33 n'existe pas).
  numRegistre: integer("num_registre").notNull(),
  marque: varchar("marque", { length: 100 }),
  modele: varchar("modele", { length: 255 }),
  version: varchar("version", { length: 255 }),
  couleur: varchar("couleur", { length: 50 }),
  immatriculation: varchar("immatriculation", { length: 50 }),
  vin: varchar("vin", { length: 100 }),
  clientNom: varchar("client_nom", { length: 255 }),
  clientTelephone: varchar("client_telephone", { length: 50 }),
  statut: varchar("statut", { length: 40 }).notNull().default("EN_PARKING"),
  motif: text("motif"),
  // Dates — volontairement NULLs tant que non renseignées (aucune invention).
  dateEntree: timestamp("date_entree"),
  dateDerniereAction: timestamp("date_derniere_action"),
  dateDevis: timestamp("date_devis"),
  dateCommande: timestamp("date_commande"),
  dateFinTravaux: timestamp("date_fin_travaux"),
  dateDerniereRelance: timestamp("date_derniere_relance"),
  // Localisation spatiale (NULL = véhicule non positionné).
  siteId: integer("site_id").references(() => parkingSites.id),
  zoneId: integer("zone_id").references(() => parkingZones.id),
  spotId: integer("spot_id").references(() => parkingSpots.id),
  // Position = CENTRE géométrique de l'empreinte (convention centre, unités = mètres).
  centreX: doublePrecision("centre_x"),
  centreY: doublePrecision("centre_y"),
  rotation: doublePrecision("rotation").default(0),
  // Marge de sécurité appliquée au véhicule (copiée depuis la zone au placement).
  margeAppliquee: doublePrecision("marge_appliquee").notNull().default(0.3),
  // Dimensions réelles de l'empreinte (NULL = inconnues tant que non mesurées).
  longueur: doublePrecision("longueur"),
  largeur: doublePrecision("largeur"),
  hauteur: doublePrecision("hauteur"),
  poids: doublePrecision("poids"),
  dimensionsEstimees: boolean("dimensions_estimees").default(false),
  // Provenance : trace du registre d'origine (verbatim) — ne pas inventer.
  provenance: text("provenance"),
  photos: jsonb("photos").$type<{ url: string; categorie: string; date: string; auteur: string }[]>().default([]),
  // Métadonnées photos dénormalisées : évite de detoaster le jsonb (18 Mo) pour lister.
  photoPresente: boolean("photo_presente").default(false).notNull(),
  photoCategorie: varchar("photo_categorie", { length: 50 }),
  photoDate: varchar("photo_date", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ParkingMovementType = "ENTREE" | "DEPLACEMENT" | "SORTIE" | "TRANSFERT" | "ROTATION" | "PLACEMENT";

export const parkingMovements = pgTable("parking_movements", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  vehicleId: integer("vehicle_id").notNull().references(() => parkingVehicles.id),
  horodatage: timestamp("horodatage").notNull().defaultNow(),
  userId: integer("user_id").references(() => utilisateurs.id),
  type: varchar("type", { length: 30 }).notNull(),
  siteOrigineId: integer("site_origine_id").references(() => parkingSites.id),
  zoneOrigineId: integer("zone_origine_id").references(() => parkingZones.id),
  positionOrigineX: doublePrecision("position_origine_x"),
  positionOrigineY: doublePrecision("position_origine_y"),
  siteDestinationId: integer("site_destination_id").references(() => parkingSites.id),
  zoneDestinationId: integer("zone_destination_id").references(() => parkingZones.id),
  positionDestinationX: doublePrecision("position_destination_x"),
  positionDestinationY: doublePrecision("position_destination_y"),
  rotation: doublePrecision("rotation"),
  motif: text("motif"),
  commentaire: text("commentaire"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ParkingAlertCode =
  | "PRET_POUR_SORTIE"
  | "ATTENTE_CLIENT"
  | "ATTENTE_PIECE"
  | "SANS_EVOLUTION"
  | "IMMOBILISATION_LONGUE"
  | "DOSSIER_INCOMPLET"
  | "TRANSFERT_A_ETUDIER";

export const parkingAlerts = pgTable("parking_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  vehicleId: integer("vehicle_id").notNull().references(() => parkingVehicles.id),
  code: varchar("code", { length: 50 }).notNull(),
  niveau: varchar("niveau", { length: 20 }).default("INFO"),
  message: text("message").notNull(),
  // Critères ayant déclenché la règle — explicabilité.
  criteres: jsonb("criteres").$type<Record<string, unknown>>().default({}),
  statut: varchar("statut", { length: 20 }).default("OUVERTE"),
  declencheeLe: timestamp("declenchee_le").defaultNow(),
  clotureeLe: timestamp("cloturee_le"),
  clotureePar: integer("cloturee_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const parkingTasks = pgTable("parking_tasks", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  vehicleId: integer("vehicle_id").references(() => parkingVehicles.id),
  type: varchar("type", { length: 30 }).default("ACTIONS"),
  titre: varchar("titre", { length: 255 }).notNull(),
  description: text("description"),
  responsable: varchar("responsable", { length: 255 }),
  echeance: timestamp("echeance"),
  statut: varchar("statut", { length: 20 }).default("A_FAIRE"),
  creePar: integer("cree_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Paramétrage global du moteur de règles (seuils configurables, un seul par agence).
export const parkingConfigs = pgTable("parking_configs", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id).unique(),
  seuilSansEvolutionJours: integer("seuil_sans_evolution_jours").default(15),
  seuilImmobilisationLongueJours: integer("seuil_immobilisation_longue_jours").default(90),
  seuilAttenteClientJours: integer("seuil_attente_client_jours").default(15),
  seuilAttentePieceJours: integer("seuil_attente_piece_jours").default(15),
  seuilPretSortieJour: integer("seuil_pret_sortie_jour").default(3),
  seuilTransfertJours: integer("seuil_transfert_jours").default(60),
  margeSecuriteDefaut: doublePrecision("marge_securite_defaut").default(0.3),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Photos déportées hors jsonb (stockage objet S3/R2/Supabase Storage).
export const parkingVehiclePhotos = pgTable("parking_vehicle_photos", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => parkingVehicles.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  categorie: varchar("categorie", { length: 50 }).notNull(),
  priseLe: timestamp("prise_le").notNull().defaultNow(),
  auteurId: integer("auteur_id").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});