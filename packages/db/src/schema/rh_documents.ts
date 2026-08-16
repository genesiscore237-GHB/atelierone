import {
  boolean,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { agences } from "./agences";

// ─── RH-08 : types de documents paramétrables ───

/** Types de documents RH (paramétrables) */
export const hrDocumentTypes = pgTable("hr_document_types", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  hasExpiration: boolean("has_expiration").default(false), // le type requiert une date d'expiration
  active: boolean("active").default(true),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  createdAt: timestamp("created_at").defaultNow(),
});
