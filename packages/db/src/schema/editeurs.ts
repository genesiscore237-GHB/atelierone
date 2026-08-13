import { pgTable, uuid, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { agences } from "./agences";

export const editeurs = pgTable("editeurs", {
  id: uuid("id").defaultRandom().primaryKey(),
  agenceId: integer("agence_id").references(() => agences.id),
  nom: varchar("nom", { length: 255 }).notNull(),
  emailContact: varchar("email_contact", { length: 255 }),
  telephoneContact: varchar("telephone_contact", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
