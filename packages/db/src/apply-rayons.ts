import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false } });
  try {
    console.log("=== MIGRATION: emplacements (rayons, zones, étagères) ===\n");

    await sql`ALTER TABLE emplacements ADD COLUMN IF NOT EXISTS categorie_id INTEGER REFERENCES categories(id)`;
    console.log("  ✓ categorie_id");

    await sql`ALTER TABLE emplacements ADD COLUMN IF NOT EXISTS sous_systeme_id UUID REFERENCES sous_systemes(id)`;
    await sql`ALTER TABLE emplacements ADD COLUMN IF NOT EXISTS niveau_id UUID REFERENCES niveaux(id)`;
    await sql`ALTER TABLE emplacements ADD COLUMN IF NOT EXISTS classe_id UUID REFERENCES classes(id)`;
    await sql`ALTER TABLE emplacements ADD COLUMN IF NOT EXISTS filiere_id UUID REFERENCES filieres(id)`;
    console.log("  ✓ colonnes référentiel éducatif (sous_systeme_id, niveau_id, classe_id, filiere_id)");

    await sql`ALTER TABLE emplacements ADD COLUMN IF NOT EXISTS ordre INTEGER NOT NULL DEFAULT 0`;
    console.log("  ✓ ordre");

    await sql`CREATE SEQUENCE IF NOT EXISTS emplacements_id_seq OWNED BY emplacements.id`;
    await sql`ALTER TABLE emplacements ALTER COLUMN id SET DEFAULT nextval('emplacements_id_seq')`;
    await sql`SELECT setval('emplacements_id_seq', COALESCE((SELECT max(id) FROM emplacements), 0) + 1, false)`;
    console.log("  ✓ séquence id (serial)");

    await sql`CREATE UNIQUE INDEX IF NOT EXISTS emplacements_agence_code_unique ON emplacements (agence_id, code)`;
    console.log("  ✓ index unique (agence_id, code) — base de l'idempotence du seed");

    const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='emplacements' ORDER BY ordinal_position`;
    console.log(`\n  Colonnes finales: ${cols.map((c) => c.column_name).join(", ")}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
