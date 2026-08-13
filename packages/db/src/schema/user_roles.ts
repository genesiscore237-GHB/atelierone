import { pgTable, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { utilisateurs } from "./utilisateurs";
import { roles } from "./roles";

export const userRoles = pgTable("user_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: integer("user_id").notNull().references(() => utilisateurs.id),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  createdAt: timestamp("created_at").defaultNow(),
});
