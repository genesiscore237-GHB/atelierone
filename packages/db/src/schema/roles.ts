import { pgTable, uuid, varchar, timestamp, text, integer, boolean } from "drizzle-orm/pg-core";

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  nom: varchar("nom", { length: 255 }).notNull(),
  description: text("description"),
  niveau: integer("niveau").default(0),
  remiseMaximum: integer("remise_maximum").default(15),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
