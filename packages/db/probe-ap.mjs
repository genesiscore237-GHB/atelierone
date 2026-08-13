import postgres from "postgres";
const s = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/atelierone_erp";
const sql = postgres(s, { ssl: false, prepare: false });
(async () => {
  try {
    const cols = await sql`
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema='public' and table_name='achats_partenaires'
      order by ordinal_position`;
    console.log("colonnes locales achats_partenaires:");
    for (const c of cols) console.log(`  ${c.column_name} ${c.data_type} null=${c.is_nullable} def=${c.column_default ?? "-"}`);
    const refs = await sql`
      select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
      from pg_constraint where conrelid = 'achats_partenaires'::regclass`;
    for (const r of refs) console.log("  CT:", r.def);
  } catch (e) {
    console.log("ERR:", e.message);
  } finally {
    await sql.end();
  }
})();
