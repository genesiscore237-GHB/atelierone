import { bigserial, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { utilisateurs } from "./utilisateurs";

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: integer("user_id").references(() => utilisateurs.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: integer("entity_id"),
  details: text("details"),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
});
