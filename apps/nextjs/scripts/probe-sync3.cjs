const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await c.connect();
  const etats = (await c.query("SELECT * FROM sync_etat ORDER BY \"table\"")).rows;
  for (const e of etats) {
    const col = ["ventes", "paiements"].includes(e.table) ? "created_at" : "updated_at";
    try {
      const r = await c.query(`SELECT count(*) FROM ${e.table} WHERE ${col} > $1`, [e.dernier_sync]);
      console.log(e.table, "| curseur:", e.dernier_sync.toISOString(), "| à envoyer:", r.rows[0].count);
    } catch (err) {
      console.log(e.table, "| ERREUR:", err.message);
    }
  }
  await c.end();
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });