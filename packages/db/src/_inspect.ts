import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: { rejectUnauthorized: false } });
try {
  for (const t of ["sales", "sale_items", "products"]) {
    const exists = await sql`SELECT to_regclass(${t}) AS r`;
    if (exists[0]?.r) {
      const c = await sql.unsafe(`SELECT count(*)::int AS n FROM ${t}`);
      console.log(`${t}: EXISTS (${c[0]?.n ?? 0} rows)`);
    } else {
      console.log(`${t}: MISSING`);
    }
  }
} finally {
  await sql.end();
}
