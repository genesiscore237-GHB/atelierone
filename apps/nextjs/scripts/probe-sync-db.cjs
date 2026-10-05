const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await c.connect();
  const depuis = new Date(Date.now() - 90 * 86400000);
  for (const t of [
    { table: "clients", col: "updated_at" },
    { table: "ventes", col: "updated_at" },
    { table: "ordres_reparation", col: "updated_at" },
    { table: "paiements", col: "created_at" },
  ]) {
    const r = await c.query(`SELECT count(*) FROM ${t.table} WHERE ${t.col} > $1`, [depuis]);
    const r2 = await c.query(`SELECT count(*) FROM ${t.table}`);
    const r3 = await c.query(`SELECT count(*) FROM ${t.table} WHERE ${t.col} IS NULL`);
    console.log(t.table, "| total:", r2.rows[0].count, "| >90j:", r.rows[0].count, "| NULL:", r3.rows[0].count);
  }
  await c.end();
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });