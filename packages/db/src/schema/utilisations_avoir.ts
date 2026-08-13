import { integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { avoirs } from "./retours";
import { ventes } from "./ventes";
import { utilisateurs } from "./utilisateurs";

export const utilisationsAvoir = pgTable("utilisations_avoir", {
  id: serial("id").primaryKey(),
  avoirId: integer("avoir_id").notNull().references(() => avoirs.id),
  venteId: integer("vente_id").references(() => ventes.id),
  montantUtilise: numeric("montant_utilise", { precision: 12, scale: 2 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("deduction"),
  reference: varchar("reference", { length: 255 }),
  notes: text("notes"),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});
