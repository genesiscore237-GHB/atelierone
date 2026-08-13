import { pgTable, uuid, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { utilisateurs } from "./utilisateurs";

export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: integer("user_id").notNull().references(() => utilisateurs.id),
  token: varchar("token", { length: 255 }).notNull().unique(),
  type: varchar("type", { length: 50 }).notNull().default("account_activation"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  isUsed: boolean("is_used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
