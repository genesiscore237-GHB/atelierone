import "dotenv/config";
import postgres from "postgres";
import fs from "fs";
import path from "path";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

try {
  const migrationPath = path.join(import.meta.dirname, "..", "drizzle", "0005_futuristic_fabian_cortez.sql");
  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

  const statements = migrationSQL
    .split("--> statement-breakpoint")
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .filter(s => !s.toLowerCase().includes("alter column") || s.toLowerCase().includes("add column"));

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (
      stmt.toLowerCase().includes("alter table") &&
      (stmt.toLowerCase().includes("set data type") || stmt.toLowerCase().includes("drop default"))
    ) {
      console.log(`SKIP (type change): ${stmt.slice(0, 80)}...`);
      continue;
    }
    try {
      await sql.unsafe(stmt);
      console.log(`OK [${i}]: ${stmt.slice(0, 80)}...`);
    } catch (err) {
      if (err.message?.includes("already exists")) {
        console.log(`SKIP (exists): ${stmt.slice(0, 80)}...`);
      } else {
        console.error(`FAIL [${i}]: ${stmt.slice(0, 80)}...`);
        console.error(err.message);
      }
    }
  }

  console.log("\nMigration complete!");
} catch (err) {
  console.error("Migration failed:", err);
} finally {
  await sql.end();
}
