import { pgTable, uuid, varchar, timestamp, boolean, date } from "drizzle-orm/pg-core";

export const anneesScolaires = pgTable("annees_scolaires", {
  id: uuid("id").defaultRandom().primaryKey(),
  libelle: varchar("libelle", { length: 20 }).notNull().unique(),
  dateDebut: date("date_debut"),
  dateFin: date("date_fin"),
  isActive: boolean("is_active").default(true),
  isCurrent: boolean("is_current").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
