import { pgTable, serial, integer, varchar, timestamp, boolean, text } from "drizzle-orm/pg-core";
import { agences } from "./agences";

export const fournisseurs = pgTable("fournisseurs", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  contact: varchar("contact", { length: 255 }),
  telephone: varchar("telephone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  adresse: text("adresse"),
  ville: varchar("ville", { length: 100 }),
  pays: varchar("pays", { length: 100 }).default("Bénin"),
  // Module Fournisseurs & Factures — tous prestataires du garage
  typeService: varchar("type_service", { length: 40 }), // PIECES_AUTO|PEINTURE|OUTILLAGE|NETTOYAGE|INFORMATIQUE|ENERGIE|ASSURANCE|SOUS_TRAITANCE|EXPERTISE|COMPTABILITE|PUBLICITE|AUTRE
  circuit: varchar("circuit", { length: 20 }).default("PIECES"), // PIECES (lié OR/véhicule/stock) | CHARGES (services généraux)
  conditionsPaiement: varchar("conditions_paiement", { length: 255 }),
  niuNif: varchar("niu_nif", { length: 50 }),
  rccm: varchar("rccm", { length: 50 }),
  notes: text("notes"),
  agenceId: integer("agence_id").references(() => agences.id),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
