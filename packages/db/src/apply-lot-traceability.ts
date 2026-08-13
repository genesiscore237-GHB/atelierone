import "dotenv/config";
import postgres from "postgres";

// WP-I1.1 — Index pour la traçabilité par lot (flux classique réception → vente).
// Les colonnes lot_id existent déjà sur stocks / mouvements_stock / ventes_lignes.
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const indexes = [
  `CREATE TABLE IF NOT EXISTS stocks_lots (
    id serial PRIMARY KEY,
    produit_id integer NOT NULL REFERENCES produits(id),
    agence_id integer NOT NULL REFERENCES agences(id),
    lot_id integer NOT NULL REFERENCES lots(id),
    quantite numeric(12,2) NOT NULL DEFAULT '0',
    updated_at timestamp DEFAULT now(),
    UNIQUE (produit_id, agence_id, lot_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lots_produit ON lots(produit_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lots_date_entree ON lots(date_entree)`,
  `CREATE INDEX IF NOT EXISTS idx_lots_statut ON lots(statut)`,
  `CREATE INDEX IF NOT EXISTS idx_stocks_lot ON stocks(lot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stocks_produit_agence ON stocks(produit_id, agence_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stocks_lots_produit_agence ON stocks_lots(produit_id, agence_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stocks_lots_lot ON stocks_lots(lot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mouvements_stock_lot ON mouvements_stock(lot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ventes_lignes_lot ON ventes_lignes(lot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ventes_lignes_vente ON ventes_lignes(vente_id)`,
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
console.log("\nAll lot-traceability indexes created.");
