import { pgTable, uuid, integer, varchar, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { organisations } from "./platform";
import { utilisateurs } from "./utilisateurs";

export const travauxExport = pgTable("travaux_export", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisations.id),
  demandeParUserId: integer("demande_par_user_id").notNull().references(() => utilisateurs.id),
  type: varchar("type", { length: 50 }).notNull(),
  filtresJson: jsonb("filtres_json"),
  statut: varchar("statut", { length: 50 }).default("en_attente"),
  fichierUrl: text("fichier_url"),
  createdAt: timestamp("created_at").defaultNow(),
  termineLe: timestamp("termine_le"),
});


