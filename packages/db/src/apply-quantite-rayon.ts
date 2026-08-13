import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false } });
  try {
    console.log("=== MIGRATION: stocks.quantite_rayon ===\n");
    await sql`ALTER TABLE stocks ADD COLUMN IF NOT EXISTS quantite_rayon NUMERIC(12,2) NOT NULL DEFAULT '0'`;
    console.log("  ✓ Colonne quantite_rayon ajoutée à stocks");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
