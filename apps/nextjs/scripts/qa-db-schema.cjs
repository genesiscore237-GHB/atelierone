const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";
(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();
  const tables = [
    "produit_articles", "produits", "produit_references", "produit_unites",
    "produit_fournisseurs", "produit_compatibilites", "produit_substitutions",
    "produit_supersessions", "variante_attributs", "article_attributs",
    "categories", "templates_produits", "unites_mesure", "stocks", "stocks_lots",
    "lots", "mouvements_stock", "emplacements", "produit_equivalences", "kits",
    "kit_components", "produit_documents", "acheteurs", "fournisseurs",
  ];
  for (const t of tables) {
    const exists = await c.query(`SELECT to_regclass('public.${t}') AS r`);
    if (!exists.rows[0].r) { console.log(`\n[u] TABLE ABSENTE: ${t}`); continue; }
    const cols = await c.query(`SELECT column_name, data_type, is_nullable, character_maximum_length, column_default FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t]);
    const pk = await c.query(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid='public.${t}'::regclass AND i.indisprimary`, []);
    const fks = await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.${t}'::regclass AND contype='f'`, []);
    const unq = await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.${t}'::regclass AND contype='u' AND conname NOT LIKE '%_pkey'`, []);
    const idx = await c.query(`SELECT indexname FROM pg_indexes WHERE tablename=$1 AND indexname NOT LIKE '%_pkey'`, [t]);
    console.log(`\n### ${t}`);
    console.log("  PK:", pk.rows.map(r => r.attname).join(",") || "(none)");
    console.log("  COL:" + cols.rows.map(r => ` ${r.column_name}:${r.data_type}${r.character_column ? "("+r.character_maximum_length+")" : ""}${r.is_nullable === "NO" ? " NOT NULL" : ""}`).join(" |"));
    if (unq.rows.length) console.log("  UNIQUE:", unq.rows.map(r => r.def).join(" | "));
    if (fks.rows.length) console.log("  FK:", fks.rows.map(r => r.def).join(" | "));
    if (idx.rows.length) console.log("  INDEX:", idx.rows.map(r => r.indexname).join(", "));
  }
  const enums = await c.query(`SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname`);
  console.log("\n### ENUMS");
  for (const e of enums.rows) console.log(`  ${e.typname}: ${e.labels.join(", ")}`);
  const pe = await c.query(`SELECT pg_get_triggerdef(oid) AS d FROM pg_trigger WHERE tgrelid='public.mouvements_stock'::regclass AND NOT tgisinternal`);
  console.log("\n### TRIGGERS mouvements_stock");
  for (const r of pe.rows) console.log("  " + r.d);
  const cats = await c.query(`SELECT id, nom, parent_id, type_branche FROM categories ORDER BY type_branche, nom LIMIT 40`);
  console.log("\n### CATEGORIES (40)");
  for (const r of cats.rows) console.log(`  ${r.id} [${r.type_branche}] ${r.nom} parent=${r.parent_id ?? "-"}`);
  await c.end();
})().catch((e) => { console.error("ERREUR", e.message); process.exit(1); });