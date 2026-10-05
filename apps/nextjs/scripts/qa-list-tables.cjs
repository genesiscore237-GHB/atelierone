const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await c.connect();
  const r = await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log(r.rows.map(x => x.tablename).join("\n"));
  await c.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });