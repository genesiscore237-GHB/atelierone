const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await c.connect();
  const cats = await c.query(`SELECT id, nom, code, parent_id, type_branche FROM categories WHERE is_active=true ORDER BY type_branche, parent_id NULLS FIRST, nom LIMIT 40`);
  console.log(JSON.stringify(cats.rows));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });