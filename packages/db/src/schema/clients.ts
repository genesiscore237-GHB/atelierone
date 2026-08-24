import { boolean, integer, numeric, pgTable, serial, text, timestamp, varchar, date } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { utilisateurs } from "./utilisateurs";

/**
 * CLIENTS — source unique de vérité (module Clients & Contrats).
 * Types : PART (particulier) | ENTR (entreprise) | ADMIN (administration/collectivité)
 *        | ASSUR (assurance) | FLOTTE | PROSP (prospect)
 * Statuts : PROSPECT | ACTIF | INACTIF | BLOQUE | ARCHIVE
 */
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 255 }).notNull(),
  prenom: varchar("prenom", { length: 255 }),
  // Specs V2 — types de clients
  typeClient: varchar("type_client", { length: 30 }).default("PART"), // PART|ENTR|ADMIN|ASSUR|FLOTTE|PROSP
  statut: varchar("statut", { length: 30 }).default("ACTIF"), // PROSPECT|ACTIF|INACTIF|BLOQUE|ARCHIVE
  // Particulier
  civilite: varchar("civilite", { length: 10 }),
  // Entreprise / Administration / Assurance / Flotte
  raisonSociale: varchar("raison_sociale", { length: 255 }),
  sigle: varchar("sigle", { length: 50 }),
  niuNif: varchar("niu_nif", { length: 50 }),
  rccm: varchar("rccm", { length: 50 }),
  numeroContribuable: varchar("numero_contribuable", { length: 50 }),
  // Assurance (ASSUR)
  compagnieAssurance: varchar("compagnie_assurance", { length: 255 }),
  numeroPolice: varchar("numero_police", { length: 100 }),
  numeroSinistre: varchar("numero_sinistre", { length: 100 }),
  expertAssurance: varchar("expert_assurance", { length: 255 }),
  montantPriseEnCharge: numeric("montant_pris_en_charge", { precision: 12, scale: 2 }),
  franchiseClient: numeric("franchise_client", { precision: 12, scale: 2 }),
  // Contact
  telephone: varchar("telephone", { length: 50 }),
  telephoneSecondaire: varchar("telephone_secondaire", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 50 }),
  email: varchar("email", { length: 255 }),
  adresse: text("adresse"),
  ville: varchar("ville", { length: 100 }),
  // Commercial / paiement
  modePaiementPrefere: varchar("mode_paiement_prefere", { length: 30 }).default("especes"),
  delaiPaiementJours: integer("delai_paiement_jours").default(0),
  plafondCredit: numeric("plafond_credit", { precision: 12, scale: 2 }).default("0"),
  remiseDefautPct: numeric("remise_defaut_pct", { precision: 5, scale: 2 }).default("0"),
  exigeBonDeCommande: boolean("exige_bon_de_commande").default(false),
  codeClient: varchar("code_client", { length: 50 }).unique(),
  categoriePrix: varchar("categorie_prix", { length: 50 }).default("public"),
  notes: text("notes"),
  notesInternes: text("notes_internes"),
  isActive: boolean("is_active").default(true),
  deletedAt: timestamp("deleted_at"),
  createdBy: integer("created_by").references(() => utilisateurs.id),
  agenceId: integer("agence_id").references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});