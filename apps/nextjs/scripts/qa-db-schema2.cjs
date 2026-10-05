const { Client } = require("pg");
const tables = [
  "article_documents", "article_equivalences", "produit_references_equiv",
  "compatibilites_produits", "attribut_templates", "produits_fournisseurs",
  "kits_lignes", "transferts_stock", "stocks_unites", "unites_mesure_produits",
  "codes_barres", "outillage_calibration", "outillage_maintenance", "prets_outils",
];
(async () => {
  const c = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await c.connect();
  for (const t of tables) {
    const exists = await c.query(`SELECT to_regclass('public.${t}') AS r`);
    if (!exists.rows[0].r) { console.log(`\n[u] ABSENTE: ${t}`); continue; }
    const cols = await c.query(`SELECT column_name, data_type, is_nullable, character_maximum_length FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t]);
    const pk = await c.query(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid='public.${t}'::regclass AND i.indisprimary`, []);
    const fks = await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.${t}'::regclass AND contype='f'`, []);
    const unq = await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.${t}'::regclass AND contype='u'`, []);
    console.log(`\n### ${t}`);
    console.log("  PK:", pk.rows.map(r => r.attname).join(",") || "(none)");
    console.log("  COL:" + cols.rows.map(r => ` ${r.column_name}:${r.data_type}${r.character_maximum_length ? "("+r.character_maximum_length+")" : ""}${r.is_nullable === "NO" ? " NOT NULL" : ""}`).join(" |"));
    if (unq.rows.length) console.log("  UNIQUE:", unq.rows.map(r => r.def).join(" | "));
    if (fks.rows.length) console.log("  FK:", fks.rows.map(r => r.def).join(" | "));
  }
  // count of templates
  const n = await c.query(`SELECT COUNT(*) AS n FROM attribut_templates`);
  console.log("\n attribut_templates count:", n.rows[0].n);
  const kit = await c.query(`SELECT DISTINCT type_produit FROM produit_articles ORDER BY 1`);
  console.log(" type_produit values:", kit.rows.map(r => r.type_produit).join(", "));
  const kitsLignes = await c.query(`SELECT kit_article_id, article_id, quantite, stock_securite FROM kits_lignes LIMIT 5`);
  console.log(" kits_lignes sample:", JSON.stringify(kitsLignes.rows));
  await c.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });