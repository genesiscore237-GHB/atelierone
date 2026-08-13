import { pgTable, serial, integer, varchar, numeric, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { fournisseurs } from "./fournisseurs";
import { utilisateurs } from "./utilisateurs";
import { ventes } from "./ventes";
import { agences } from "./agences";

export const achatsPartenaires = pgTable("achats_partenaires", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 100 }).notNull().unique(),
  partenaireId: integer("partenaire_id").notNull().references(() => fournisseurs.id),
  produitDesignation: varchar("produit_designation", { length: 500 }).notNull(),
  prixAchatPartenaire: numeric("prix_achat_partenaire", { precision: 12, scale: 2 }).notNull(),
  prixVenteClient: numeric("prix_vente_client", { precision: 12, scale: 2 }).notNull(),
  margeBrute: numeric("marge_brute", { precision: 12, scale: 2 }).notNull(),
  commissionPourcent: numeric("commission_pourcent", { precision: 5, scale: 2 }).notNull(),
  commissionAgent: numeric("commission_agent", { precision: 12, scale: 2 }).notNull(),
  montantCaisse: numeric("montant_caisse", { precision: 12, scale: 2 }).notNull(),
  agentId: integer("agent_id").notNull().references(() => utilisateurs.id),
  venteId: integer("vente_id").references(() => ventes.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  statut: varchar("statut", { length: 50 }).default("termine"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});
