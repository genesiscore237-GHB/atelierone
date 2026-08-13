import { boolean, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { agences } from "./agences";

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 255 }).notNull(),
  prenom: varchar("prenom", { length: 255 }),
  telephone: varchar("telephone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  adresse: text("adresse"),
  codeClient: varchar("code_client", { length: 50 }).unique(),
  agenceId: integer("agence_id").references(() => agences.id),
  categoriePrix: varchar("categorie_prix", { length: 50 }).default("public"),
  plafondCredit: numeric("plafond_credit", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
