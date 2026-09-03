import { pgTable, serial, integer, varchar, text, numeric, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { ordresReparation, lignesOrdreReparation } from "./ordres_reparation";
import { utilisateurs } from "./utilisateurs";

/**
 * CYCLE DE VIE COMPLET DU VÉHICULE (normes DMS 2026) :
 * DVI (inspection digitale), versions de devis + autorisation ligne par ligne,
 * contrôle qualité, restitution. Tables dédiées rattachées à l'OR central.
 */

/** DVI — Digital Vehicle Inspection (multi-points, sévérité, photos). */
export const orInspections = pgTable("or_inspections", {
  id: serial("id").primaryKey(),
  orId: integer("or_id").notNull().references(() => ordresReparation.id, { onDelete: "cascade" }),
  template: varchar("template", { length: 60 }).default("MULTI_POINTS"), // MULTI_POINTS | FREINS | SUSPENSION | DISTRIBUTION | CLIM | PRE_ACHAT | CONTROLE | DEPANNAGE
  titre: varchar("titre", { length: 160 }).notNull().default("Inspection multi-points"),
  statut: varchar("statut", { length: 20 }).default("BROUILLON"), // BROUILLON | ENVOYE (figée une fois envoyée)
  technicienId: integer("technicien_id").references(() => utilisateurs.id),
  envoyeeLe: timestamp("envoyee_le"),
  envoyeePar: integer("envoyee_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Points d'inspection du DVI (un par ligne). */
export const orInspectionPoints = pgTable("or_inspection_points", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspection_id").notNull().references(() => orInspections.id, { onDelete: "cascade" }),
  groupe: varchar("groupe", { length: 80 }).notNull(), // Extérieur, Moteur, Habitacle, Freinage…
  libelle: varchar("libelle", { length: 200 }).notNull(),
  statut: varchar("statut", { length: 20 }).default("NON_INSPECTE"), // OK | SURVEILLER | DEFECTUEUX | URGENT | NON_INSPECTE
  mesure: varchar("mesure", { length: 40 }), // ex. épaisseur plaquette 2.1 mm
  notes: text("notes"),
  photo: text("photo"), // data:image (photo annotée)
  annotation: text("annotation"),
  recommandation: text("recommandation"),
  priorite: varchar("priorite", { length: 30 }).default("CONSEIL"), // IMMEDIATE | PROCHE_VISITE | CONSEIL
  createdAt: timestamp("created_at").defaultNow(),
});

/** Versions de devis (v1, v2… — jamais écrasées). */
export const orDevisVersions = pgTable("or_devis_versions", {
  id: serial("id").primaryKey(),
  orId: integer("or_id").notNull().references(() => ordresReparation.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  montantHT: numeric("montant_ht", { precision: 12, scale: 2 }).default("0"),
  montantTTC: numeric("montant_ttc", { precision: 12, scale: 2 }).default("0"),
  statut: varchar("statut", { length: 25 }).default("BROUILLON"), // BROUILLON | ENVOYE | AUTORISE_PARTIEL | AUTORISE_TOTAL | REFUSE
  validiteJours: integer("validite_jours").default(15),
  envoyeLe: timestamp("envoye_le"),
  envoyePar: integer("envoye_par").references(() => utilisateurs.id),
  dateAutorisation: timestamp("date_autorisation"),
  methodeAutorisation: varchar("methode_autorisation", { length: 30 }), // WEB | SMS | SIGNATURE | ORAL | EMAIL
  creePar: integer("cree_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Autorisation ligne par ligne (chaque ligne de devis : Autorisé / Décliné / Reporté). */
export const orAutorisations = pgTable("or_autorisations", {
  id: serial("id").primaryKey(),
  orId: integer("or_id").notNull().references(() => ordresReparation.id, { onDelete: "cascade" }),
  devisVersionId: integer("devis_version_id").references(() => orDevisVersions.id, { onDelete: "cascade" }),
  ligneId: integer("ligne_id").notNull().references(() => lignesOrdreReparation.id, { onDelete: "cascade" }),
  statut: varchar("statut", { length: 20 }).notNull(), // AUTORISE | DECLINE | REPORTE
  methode: varchar("methode", { length: 30 }).default("ORAL"), // WEB | SMS | SIGNATURE | ORAL | EMAIL
  qui: varchar("qui", { length: 160 }), // qui a autorisé (client, nom)
  commentaire: text("commentaire"),
  dateAutorisation: timestamp("date_autorisation").defaultNow(),
});

/** Contrôle qualité (checklist + essai routier + résultat). */
export const orControlesQualite = pgTable("or_controles_qualite", {
  id: serial("id").primaryKey(),
  orId: integer("or_id").notNull().references(() => ordresReparation.id, { onDelete: "cascade" }),
  checklist: jsonb("checklist"), // [{libelle, ok}]
  essaiRoutier: boolean("essai_routier").default(false),
  distanceEssai: varchar("distance_essai", { length: 40 }),
  observations: text("observations"),
  resultat: varchar("resultat", { length: 20 }).notNull(), // VALIDE | REJETE
  controlePar: integer("controle_par").references(() => utilisateurs.id),
  dateControle: timestamp("date_controle").defaultNow(),
});

/** Restitution du véhicule (handover) — check-list de sortie + signature. */
export const orRestitutions = pgTable("or_restitutions", {
  id: serial("id").primaryKey(),
  orId: integer("or_id").notNull().references(() => ordresReparation.id, { onDelete: "cascade" }),
  kilometrageSortie: integer("kilometrage_sortie"),
  niveauCarburantSortie: varchar("niveau_carburant_sortie", { length: 20 }),
  checklist: jsonb("checklist"), // [{libelle, ok, observation}] — outillage rendu, clés, documents, anciennes pièces, propreté, objets
  recuperateurNom: varchar("recuperateur_nom", { length: 255 }), // peut différer du propriétaire
  signatureClient: varchar("signature_client", { length: 255 }), // nom tapé (signature)
  observations: text("observations"),
  motifNonRepare: varchar("motif_non_repare", { length: 200 }), // REFUS_CLIENT | PIECES_INDISPONIBLES | ABANDON | AUTRE — véhicule non/partiellement réparé
  travauxNonRealises: text("travaux_non_realises"),
  restituePar: integer("restitue_par").references(() => utilisateurs.id),
  dateRestitution: timestamp("date_restitution").defaultNow(),
});