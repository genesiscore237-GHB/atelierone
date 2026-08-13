import { pgTable, uuid, varchar, timestamp, text } from "drizzle-orm/pg-core";

export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  nom: varchar("nom", { length: 255 }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});
