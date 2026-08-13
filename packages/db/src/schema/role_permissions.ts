import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
import { roles } from "./roles";
import { permissions } from "./permissions";

export const rolePermissions = pgTable("role_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id),
  createdAt: timestamp("created_at").defaultNow(),
});
