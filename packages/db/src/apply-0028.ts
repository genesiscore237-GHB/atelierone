import "dotenv/config";
import postgres from "postgres";
import fs from "fs";
import path from "path";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

try {
  const migrationPath = path.join(import.meta.dirname, "..", "drizzle", "0028_achats_facteur_numeric.sql");
  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

  await sql.unsafe(migrationSQL);
  console.log("SQL appliqué (fichier entier).");

  const check = await sql.unsafe(`
    SELECT column_name, data_type, numeric_precision, numeric_scale, column_default
    FROM information_schema.columns
    WHERE table_name = 'achats_lignes' AND column_name = 'facteur_conversion'
  `);
  console.log("\nVérification :", check[0]);

  console.log("\nMigration 0028 complete!");
} catch (err) {
  console.error("Migration failed:", err);
} finally {
  await sql.end();
}
