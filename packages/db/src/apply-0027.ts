import "dotenv/config";
import postgres from "postgres";
import fs from "fs";
import path from "path";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

try {
  const migrationPath = path.join(import.meta.dirname, "..", "drizzle", "0027_produit_process.sql");
  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

  await sql.unsafe(migrationSQL);
  console.log("SQL appliqué (fichier entier).");

  const check = await sql.unsafe(`
    SELECT
      (SELECT COUNT(*) FROM manuel_scolaire_detail) AS manuel_detail,
      (SELECT COUNT(*) FROM fourniture_detail) AS fourniture_detail,
      (SELECT COUNT(*) FROM categories WHERE type_branche IS NOT NULL) AS categories_typees
  `);
  console.log("\nVérification :", check[0]);

  console.log("\nMigration 0027 complete!");
} catch (err) {
  console.error("Migration failed:", err);
} finally {
  await sql.end();
}
