import { pgTable, uuid, varchar, timestamp, boolean } from "drizzle-orm/pg-core";

export const unitesMesure = pgTable("unites_mesure", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  libelle: varchar("libelle", { length: 50 }).notNull(),
  symbole: varchar("symbole", { length: 10 }),
  type: varchar("type", { length: 20 }).default("QUANTITE"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
