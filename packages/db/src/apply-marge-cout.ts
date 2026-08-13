import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false } });
  try {
    console.log("=== MIGRATION: marge (ventes_lignes.cout_unitaire, lignes_retour.cout_unitaire) ===\n");

    await sql`ALTER TABLE ventes_lignes ADD COLUMN IF NOT EXISTS cout_unitaire NUMERIC(12,2)`;
    console.log("  ✓ Colonne cout_unitaire ajoutée à ventes_lignes");

    await sql`ALTER TABLE lignes_retour ADD COLUMN IF NOT EXISTS cout_unitaire NUMERIC(12,2)`;
    console.log("  ✓ Colonne cout_unitaire ajoutée à lignes_retour");

    await sql`ALTER TABLE lignes_retour ADD COLUMN IF NOT EXISTS vente_ligne_id INTEGER`;
    await sql`ALTER TABLE lignes_retour ADD COLUMN IF NOT EXISTS unite_id UUID`;
    await sql`ALTER TABLE lignes_retour ADD COLUMN IF NOT EXISTS facteur_conversion INTEGER NOT NULL DEFAULT 1`;
    console.log("  ✓ Colonnes manquantes alignées sur le schéma (vente_ligne_id, unite_id, facteur_conversion)");

    const backfilled = await sql`
      UPDATE ventes_lignes vl
      SET cout_unitaire = ROUND(
        COALESCE(
          (SELECT s.cout_unitaire_moyen FROM stocks s
            WHERE s.produit_id = vl.produit_id AND s.agence_id = v.agence_id AND s.emplacement_id IS NULL
            LIMIT 1),
          (SELECT p.prix_achat FROM produits p WHERE p.id = vl.produit_id),
          0
        ) * COALESCE(vl.facteur_conversion, 1),
        2
      )
      FROM ventes v
      WHERE vl.cout_unitaire IS NULL
        AND v.id = vl.vente_id
    `;
    console.log(`  ✓ Backfill ventes_lignes: ${backfilled.count} lignes (CUMP actuel x facteur, fallback prix_achat)`);

    const backfilledRetours = await sql`
      UPDATE lignes_retour lr
      SET cout_unitaire = vl.cout_unitaire
      FROM ventes_lignes vl
      WHERE lr.vente_ligne_id = vl.id
        AND lr.cout_unitaire IS NULL
    `;
    console.log(`  ✓ Backfill lignes_retour: ${backfilledRetours.count} lignes (depuis la ligne de vente d'origine)`);

    const restants = await sql`
      SELECT count(*)::int AS restants FROM ventes_lignes WHERE cout_unitaire IS NULL
    `;
    console.log(`\n  Lignes de vente sans coût restantes: ${restants[0]?.restants ?? 0}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
