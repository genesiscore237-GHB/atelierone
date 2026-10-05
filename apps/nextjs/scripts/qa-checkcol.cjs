const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await c.connect();
  const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='produits' ORDER BY ordinal_position");
  console.log(r.rows.map(x => x.column_name).join(","));
  await c.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });