import { pgTable, uuid, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { sousSystemes } from "./sous_systemes";

export const niveaux = pgTable("niveaux", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  libelle: varchar("libelle", { length: 100 }).notNull(),
  ordre: integer("ordre").notNull().default(0),
  sousSystemeId: uuid("sous_systeme_id").references(() => sousSystemes.id),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
