import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL!;
const ssl = !url.includes("localhost") && !url.includes("127.0.0.1")
  ? "require"
  : false;
const connection = postgres(url, {
  max: 1,
  prepare: false,
  ssl,
});
const db = drizzle(connection);

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migration applied successfully");
await connection.end();
