import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false } });
  try {
    console.log("=== MIGRATION: produits_fournisseurs.unite_id ===\n");
    await sql`ALTER TABLE produits_fournisseurs ADD COLUMN IF NOT EXISTS unite_id UUID REFERENCES unites_mesure(id)`;
    console.log("  ✓ Colonne unite_id ajoutée à produits_fournisseurs");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
