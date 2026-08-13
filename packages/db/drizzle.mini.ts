import { pgTable, integer, varchar } from "drizzle-orm/pg-core";

const test = pgTable("_drizzle_test", {
  id: integer("id").primaryKey(),
  name: varchar("name", { length: 100 }),
});

export { test };
