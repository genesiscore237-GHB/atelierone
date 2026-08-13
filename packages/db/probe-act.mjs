import postgres from "postgres";
const s = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/atelierone_erp";
const sql = postgres(s, { ssl: false, prepare: false });
(async () => {
  try {
    const act = await sql`select pid, state, wait_event_type, wait_event, left(query, 80) as q from pg_stat_activity where datname='atelierone_erp' and state is not null`;
    for (const r of act) console.log(`${r.pid} ${r.state} wait=${r.wait_event_type}/${r.wait_event} :: ${r.q}`);
    const locks = await sql`select count(*) n from pg_locks where not granted`;
    console.log("locks not granted:", locks[0].n);
  } catch (e) {
    console.log("ERR:", e.message);
  } finally {
    await sql.end();
  }
})();
