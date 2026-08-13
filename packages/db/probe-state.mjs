import postgres from "postgres";
const s = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/atelierone_erp";
const sql = postgres(s, { ssl: false, prepare: false });
(async () => {
  try {
    const t = await sql`select tablename from pg_tables where schemaname='public' order by tablename`;
    console.log("tables:", t.length);
    const manquantes = ["achats_partenaires","alertes","approbations","cles_api","factures_partenaires","notifications","promotions","regles_automatisation","regles_tarification","travaux_export","utilisations_avoir"];
    for (const m of manquantes) {
      const r = await sql`select to_regclass(${m}) as t`;
      console.log(`  ${m}: ${r[0].t ? "OK" : "ABSENTE"}`);
    }
    const c = await sql`select column_name from information_schema.columns where table_name='inventaires' and column_name='unite_id'`;
    console.log("inventaires.unite_id:", c.length ? "OK" : "ABSENT");
    const u = await sql`select conname from pg_constraint where conname='caisse_operateurs_caisse_id_user_id_unique'`;
    console.log("constraint caisse_operateurs unique:", u.length ? "OK" : "ABSENTE");
  } catch (e) {
    console.log("ERR:", e.message);
  } finally {
    await sql.end();
  }
})();
