import { boolean, integer, pgTable, serial, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { roles } from "./roles";

export const utilisateurs = pgTable("utilisateurs", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  loginEmail: varchar("login_email", { length: 255 }),
  motDePasse: varchar("mot_de_passe", { length: 255 }),
  nom: varchar("nom", { length: 255 }).notNull(),
  prenom: varchar("prenom", { length: 255 }),
  telephone: varchar("telephone", { length: 50 }),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  roleId: uuid("role_id").references(() => roles.id),
  employeId: integer("employe_id"),
  isActive: boolean("is_active").default(true),
  status: varchar("status", { length: 50 }).default("invited"),
  emailVerified: timestamp("email_verified"),
  derniereConnexion: timestamp("derniere_connexion"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
