import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false } });
  try {
    console.log("=== MIGRATION: contrainte CHECK tarifs.type ===\n");
    const types = [
      "public", "ecole", "grossiste", "revendeur", "partenaire",
      "promotionnel", "minimum_vente", "maximum_rachat",
    ];
    const quoted = types.map(t => `'${t}'`).join(", ");
    await sql`ALTER TABLE tarifs DROP CONSTRAINT IF EXISTS chk_tarifs_type`;
    await sql.unsafe(`ALTER TABLE tarifs ADD CONSTRAINT chk_tarifs_type CHECK (type IN (${quoted}))`);
    console.log(`  ✓ Contrainte chk_tarifs_type ajoutée (${types.join(", ")})`);
    const dirty = await sql.unsafe(`SELECT DISTINCT type FROM tarifs WHERE type NOT IN (${quoted})`);
    if (dirty.length > 0) {
      console.log("  ⚠ Types non standardisés présents en base (à corriger manuellement):", dirty.map(r => r.type).join(", "));
    } else {
      console.log("  ✓ Aucun type non standardisé en base");
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
