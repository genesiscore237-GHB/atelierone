import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const indexes = [
  `CREATE INDEX IF NOT EXISTS idx_achats_lignes_unite ON achats_lignes(unite_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ventes_lignes_unite ON ventes_lignes(unite_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mouvements_stock_unite ON mouvements_stock(unite_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mouvements_stock_type ON mouvements_stock(type)`,
  `CREATE INDEX IF NOT EXISTS idx_mouvements_stock_date ON mouvements_stock(date_mouvement)`,
  `CREATE INDEX IF NOT EXISTS idx_deconditionnements_produit ON deconditionnements(produit_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deconditionnements_date ON deconditionnements(date_deconditionnement)`,
  `CREATE INDEX IF NOT EXISTS idx_inventaires_session ON inventaires(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inventaires_sessions_agence ON inventaires_sessions(agence_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inventaires_sessions_statut ON inventaires_sessions(statut)`,
  `CREATE INDEX IF NOT EXISTS idx_ventes_reference ON ventes(reference)`,
];

for (const idx of indexes) {
  try {
    await sql.unsafe(idx);
    console.log(`OK: ${idx}`);
  } catch (err) {
    console.error(`FAIL: ${idx} - ${err.message}`);
  }
}

await sql.end();
console.log("\nAll indexes created.");
