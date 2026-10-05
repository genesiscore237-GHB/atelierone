/* Nettoyage des données laissées par les probes catalogue UI (récentes).
 * Reverse-order safe + trigger append-only géré. Cible : articles dont la
 * désignation correspond aux patterns de probe, créés dans les 6 dernières heures.
 */
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

(async () => {
  const db = new Client({ connectionString: DSN });
  await db.connect();

  const patterns = ["Validation %", "Bad %", "AttrINT %", "Prix %", "Doublon %", "Composant %", "Bad outil %", "Bad piece %", "Bad equip %", "Bad service %", "Bad type %"];
  const ids = (await db.query(
    `SELECT id FROM produit_articles
     WHERE created_at > NOW() - INTERVAL '6 hours'
       AND (${patterns.map((_, i) => `designation ILIKE $${i + 1}`).join(" OR ")})
     ORDER BY id`, patterns,
  )).rows.map((r) => r.id);

  console.log("articles probe à nettoyer : " + ids.length);
  await db.query(`ALTER TABLE mouvements_stock DISABLE TRIGGER trg_append_only_mouvements_stock`);
  let total = 0;
  for (const aid of ids) {
    const prods = (await db.query(`SELECT id FROM produits WHERE article_id=$1`, [aid])).rows;
    const pids = prods.map((r) => r.id);
    for (const pid of pids) {
      await db.query(`DELETE FROM kits_lignes WHERE kit_id=$1 OR composant_id=$1`, [pid]);
      await db.query(`DELETE FROM stocks_lots WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM lots WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM mouvements_stock WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM stocks_unites WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM stocks WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM produit_unites WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM produits_fournisseurs WHERE produit_id=$1`, [pid]);
      await db.query(`DELETE FROM variante_attributs WHERE variante_id=$1`, [pid]);
      await db.query(`DELETE FROM prets_outils WHERE outil_id=$1`, [pid]);
      total += 1;
    }
    for (const pid of pids) await db.query(`DELETE FROM produits WHERE id=$1`, [pid]);
    await db.query(`DELETE FROM article_attributs WHERE article_id=$1`, [aid]);
    await db.query(`DELETE FROM compatibilites_produits WHERE article_id=$1`, [aid]);
    await db.query(`DELETE FROM produit_references_equiv WHERE article_id=$1`, [aid]);
    await db.query(`DELETE FROM produit_articles WHERE id=$1`, [aid]);
  }
  await db.query(`ALTER TABLE mouvements_stock ENABLE TRIGGER trg_append_only_mouvements_stock`);

  const emps = (await db.query(
    `SELECT id FROM emplacements WHERE created_at > NOW() - INTERVAL '6 hours' AND code LIKE '___-S%' ORDER BY id DESC`,
    [],
  )).rows;
  for (const e of emps) await db.query(`DELETE FROM emplacements WHERE id=$1`, [e.id]);
  console.log("emplacements probe nettoyés : " + emps.length);

  const uns = (await db.query(
    `SELECT id FROM unites_mesure WHERE created_at > NOW() - INTERVAL '6 hours' AND (code LIKE 'BIDON%' OR code LIKE 'CARTON%')`, [],
  )).rows;
  for (const u of uns) await db.query(`DELETE FROM unites_mesure WHERE id=$1`, [u.id]);
  console.log("unités probe nettoyées : " + uns.length);

  const check = (await db.query(`SELECT COUNT(*)::int AS n FROM produit_articles WHERE id = ANY($1::int[])`, [ids.length ? ids : [0]])).rows[0];
  console.log("Résiduel articles : " + check.n + " (produits nettoyés: " + total + ")");
  await db.end();
  process.exit(check.n === 0 ? 0 : 1);
})().catch((e) => { console.error("CLEANUP FATAL: " + e.message); process.exit(1); });