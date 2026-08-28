import { pgTable, serial, integer, varchar, numeric, timestamp, date, text } from "drizzle-orm/pg-core";
import { fournisseurs } from "./fournisseurs";
import { achats } from "./achats";
import { agences } from "./agences";
import { utilisateurs } from "./utilisateurs";

export const facturesFournisseur = pgTable("factures_fournisseur", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 100 }).notNull(),
  fournisseurId: integer("fournisseur_id").notNull().references(() => fournisseurs.id),
  achatId: integer("achat_id").references(() => achats.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  // Module Fournisseurs & Factures : libellé/objet + catégorie + circuit
  libelle: varchar("libelle", { length: 255 }), // objet de la facture (mots-clés recherchables)
  categorieDepense: varchar("categorie_depense", { length: 60 }), // ELECTRICITE|NETTOYAGE|EXPERTISE|COMPTABILITE|OUTILLAGE|PUBLICITE|SOUS_TRAITANCE|LOYER|AUTRE
  circuit: varchar("circuit", { length: 20 }).default("PIECES"), // PIECES (lié OR/stock) | CHARGES (service général)
  modePaiement: varchar("mode_paiement", { length: 50 }).default("especes"),
  montantHT: numeric("montant_ht", { precision: 12, scale: 2 }).default("0"),
  montantTVA: numeric("montant_tva", { precision: 12, scale: 2 }).default("0"),
  montantTTC: numeric("montant_ttc", { precision: 12, scale: 2 }).default("0"),
  montantPaye: numeric("montant_paye", { precision: 12, scale: 2 }).default("0"),
  montantRestant: numeric("montant_restant", { precision: 12, scale: 2 }).default("0"),
  statut: varchar("statut", { length: 50 }).default("impayee"),
  dateFacture: date("date_facture"),
  dateEcheance: date("date_echeance"),
  numeroFactureFournisseur: varchar("numero_facture_fournisseur", { length: 100 }),
  fichierUrl: text("fichier_url"),
  notes: text("notes"),
  creePar: integer("cree_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
