import { pgTable, uuid, varchar, timestamp, boolean } from "drizzle-orm/pg-core";

export const sousSystemes = pgTable("sous_systemes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  libelle: varchar("libelle", { length: 100 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
