import { pgTable, serial, integer, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { ordresReparation } from "./ordres_reparation";
import { utilisateurs } from "./utilisateurs";
import { agences } from "./agences";

/**
 * HISTORIQUE DU CYCLE DE VIE D'UN OR (module Véhicules & Atelier).
 * Chaque changement de statut / priorité / responsable / blocage est tracé :
 * qui, quand, ancienne → nouvelle valeur, commentaire.
 */
export const orHistorique = pgTable("or_historique", {
  id: serial("id").primaryKey(),
  orId: integer("or_id").notNull().references(() => ordresReparation.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull(), // STATUT | PRIORITE | RESPONSABLE | BLOCAGE | NOTE | CREATION | VALIDATION_DIAGNOSTIC | VALIDATION_DEVIS | DEMANDE_PIECES | COMMANDE_FOURNISSEUR | RETOUR_FOURNISSEUR
  ancienneValeur: varchar("ancienne_valeur", { length: 255 }),
  nouvelleValeur: varchar("nouvelle_valeur", { length: 255 }),
  commentaire: text("commentaire"),
  changePar: integer("change_par").references(() => utilisateurs.id),
  changeLe: timestamp("change_le").defaultNow(),
});

/** Photos / vidéos jointes à l'OR (consignes d'entrée, état des lieux). */
export const orPhotos = pgTable("or_photos", {
  id: serial("id").primaryKey(),
  /**
   * LOT R1bis — PIÈCES À CONVICTION : `onDelete: "restrict"`, plus `cascade`.
   *
   * Les photos d'état des lieux sont la preuve de l'état du véhicule à l'entrée
   * et à la sortie. En `cascade`, un simple `DELETE FROM ordres_reparation`
   * — en SQL direct, en script de maintenance, ou via un futur endpoint —
   * effaçait ces preuves sans laisser de trace et sans lever d'erreur : le
   * dossier disparaissait, la preuve avec.
   *
   * `restrict` déplace la décision là où elle doit être : la base refuse la
   * suppression tant qu'une photo existe. C'est aussi le seul point qui protège
   * TOUS les accès, y compris ceux qui n'existent pas encore — aucune route
   * applicative ne supprime d'OR aujourd'hui, mais rien ne l'interdisait.
   *
   * Pour supprimer un dossier ayant des photos, il faut d'abord les supprimer
   * explicitement : geste visible et volontaire, pas un effet de bord.
   */
  orId: integer("or_id").notNull().references(() => ordresReparation.id, { onDelete: "restrict" }),
  url: text("url").notNull(),
  type: varchar("type", { length: 10 }).default("PHOTO"), // PHOTO | VIDEO
  creePar: integer("cree_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
  /**
   * LOT U0c — État des lieux photographique VERSIONNÉ PAR VISITE.
   *
   * Le registre parking écrase (une photo par catégorie portée par le
   * véhicule). L'atelier a besoin de l'inverse : chaque intervention conserve
   * SON jeu de photos, d'où la portée par `orId`. `categorie` désigne la face
   * photographiée, `visite` l'étape (entrée / restitution) et `repriseDe`
   * trace une photo recopiée d'une visite antérieure — elle ne se substitue
   * jamais à une prise réelle.
   */
  categorie: varchar("categorie", { length: 50 }).notNull().default("AUTRE"),
  visite: varchar("visite", { length: 10 }).notNull().default("ENTREE"),
  repriseDe: integer("reprise_de"),
  photoPresente: boolean("photo_presente").notNull().default(false),
});

/** Paramètres du module (seuils d'alerte, listes, texte accusé de réception). */
export const atelierParametres = pgTable("atelier_parametres", {
  id: serial("id").primaryKey(),
  agenceId: integer("agence_id").notNull().unique().references(() => agences.id),
  seuilPromesseJours: integer("seuil_promesse_jours").default(1), // alerte PROCHE
  seuilImmobilisationJours: integer("seuil_immobilisation_jours").default(5), // alerte LONG
  seuilBloqueJours: integer("seuil_bloque_jours").default(3), // escalade direction
  seuilSavJours: integer("seuil_sav_jours").default(30), // fenêtre détection retour SAV (specs V2)
  emplacements: text("emplacements").default('["Réception","Parc A","Parc B","Pont 1","Pont 2","Carrosserie","Diagnostic"]'),
  raisonsBlocage: text("raisons_blocage").default('["Pièces manquantes","Validation client","Diagnostic incomplet","Attente expertise","Manque technicien","Outillage","Autre"]'),
  texteAccuseReception: text("texte_accuse_reception").default("Nous accusons réception de votre véhicule {IMMATRICULATION} sous l'ordre {OR}. Restitution promise : {PROMESSE}."),
  updatedAt: timestamp("updated_at").defaultNow(),
});