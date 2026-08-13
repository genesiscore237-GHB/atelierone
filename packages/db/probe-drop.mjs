import postgres from "postgres";
const s = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/atelierone_erp";
const sql = postgres(s, { ssl: false, prepare: false });
(async () => {
  try {
    const r = await sql`select count(*) n from archives`;
    console.log("lignes archives:", r[0].n);
    await sql`drop table archives`;
    console.log("archives droppée");
  } catch (e) {
    console.log("ERR:", e.message);
  } finally {
    await sql.end();
  }
})();
