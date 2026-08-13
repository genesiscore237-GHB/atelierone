import { pgTable, uuid, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { niveaux } from "./niveaux";
import { filieres } from "./filieres";

export const classes = pgTable("classes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  libelle: varchar("libelle", { length: 100 }).notNull(),
  niveauId: uuid("niveau_id").notNull().references(() => niveaux.id),
  filiereId: uuid("filiere_id").references(() => filieres.id),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
