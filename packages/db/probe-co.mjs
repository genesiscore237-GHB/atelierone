import postgres from "postgres";
const s = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/atelierone_erp";
const sql = postgres(s, { ssl: false, prepare: false });
(async () => {
  try {
    const rows = await sql`select id, caisse_id, user_id from caisse_operateurs order by caisse_id, user_id`;
    console.log("caisse_operateurs (", rows.length, "):");
    for (const r of rows) console.log(`  id=${r.id} caisse=${r.caisse_id} user=${r.user_id} resp=${r.est_responsable}`);
    const dup = await sql`
      select caisse_id, user_id, count(*) n from caisse_operateurs
      group by caisse_id, user_id having count(*) > 1`;
    console.log("doublons:", dup.length);
  } catch (e) {
    console.log("ERR:", e.message);
  } finally {
    await sql.end();
  }
})();
