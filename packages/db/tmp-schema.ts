import { pgTable, integer, varchar } from "drizzle-orm/pg-core";

export const testTable = pgTable("test_table", {
  id: integer("id").primaryKey(),
  name: varchar("name", { length: 100 }),
});
