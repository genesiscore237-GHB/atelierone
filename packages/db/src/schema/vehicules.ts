import { pgTable, serial, integer, varchar, text, uniqueIndex, index, date, timestamp, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { doublePrecision } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { clients } from "./clients";

/**
 * VÉHICULES & PARC — fiche véhicule et suivi d'immobilisation.
 * Statuts d'immobilisation (statutImmobilisation) :
 * en_reception, en_diagnostic, en_reparation, attente_validation_client,
 * attente_piece_locale, piece_commandee_import, terminee_attente_paiement,
 * terminee_client_non_venu, transfere_site2, abandonne_contentieux, sorti
 *
 * LOT R1 — `immatNorm` = plaque normalisée (trim + suppression espaces +
 * majuscules), colonne dérivée MAINTENUE PAR DÉCLENCHEUR (migration 0010),
 * plus par les points d'écriture. Porte l'unicité (agence, immat_norm) via
 * index partiel : les véhicules sans plaque (NULL) restent hors contrainte
 * (D3 — aucune invention).
 *
 * `immatriculation` est NULLABLE : le registre parking compte 12 véhicules
 * réels sans plaque (arrivés sans immatriculation, ou plaque non relevée).
 * Tant que la colonne était NOT NULL, ces véhicules ne pouvaient exister que
 * comme lignes de registre — l'Atelier ne pouvait donc ni les lister, ni les
 * recevoir, alors qu'ils sont physiquement au garage. Le modèle parking
 * (`parking.ts`) les portait déjà en `varchar` nullable : l'incohérence
 * venait de `vehicules`, pas du métier.
 */
export const vehicules = pgTable("vehicules", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  clientId: integer("client_id").references(() => clients.id),
  // NULLABLE : voir l'en-tête du schéma. Un véhicule réel peut être au garage
  // sans plaque relevée ; on refuse d'inventer une immatriculation, mais on
  // refuse aussi de rendre le véhicule invisible à l'atelier.
  immatriculation: varchar("immatriculation", { length: 50 }),
  immatNorm: varchar("immat_norm", { length: 50 }),
  marque: varchar("marque", { length: 100 }),
  modele: varchar("modele", { length: 100 }),
  version: varchar("version", { length: 100 }), // version / finition (fiche de réception)
  annee: integer("annee"),
  couleur: varchar("couleur", { length: 50 }),
  numeroChassis: varchar("numero_chassis", { length: 100 }),
  kilometrage: integer("kilometrage"),
  carburant: varchar("carburant", { length: 30 }),
  chauffeurNom: varchar("chauffeur_nom", { length: 100 }),
  chauffeurTelephone: varchar("chauffeur_telephone", { length: 30 }),
  typeVehicule: varchar("type_vehicule", { length: 30 }).default("voiture"),
  // LOT U0d — Empreinte physique du véhicule. Reprise du registre parking
  // (U0d) car l'atelier l'ignore : sans elle, impossible de placer un poids
  // lourd sur le plan d'occupation sans le deviner. `dimensionsEstimees`
  // distingue une mesure d'une estimation — la qualité de la donnée reste
  // visible au lieu d'être écrasée dans la même colonne.
  longueur: doublePrecision("longueur"),
  largeur: doublePrecision("largeur"),
  hauteur: doublePrecision("hauteur"),
  poids: doublePrecision("poids"),
  dimensionsEstimees: boolean("dimensions_estimees").notNull().default(false),
  statutImmobilisation: varchar("statut_immobilisation", { length: 50 }).default("en_reception"),
  siteId: integer("site_id").references(() => agences.id),
  emplacementId: integer("emplacement_id"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // LOT R1 — unicité de la plaque par agence (uniquement si plaque renseignée).
  uqImmatNorm: uniqueIndex("uq_vehicules_agence_immat_norm")
    .on(t.agenceId, t.immatNorm)
    .where(sql`immat_norm IS NOT NULL`),
  // Index de recherche, PAS une contrainte métier : la même plaque peut
  // exister dans deux agences. L'unicité est portée par `uqImmatNorm`.
  idxImmatNorm: index("idx_vehicules_immat_norm").on(t.immatNorm),
}));
