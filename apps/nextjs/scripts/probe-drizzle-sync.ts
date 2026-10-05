process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";
import { db } from "../src/server/db";
import { sql } from "drizzle-orm";

(async () => {
  const table = "clients";
  const col = "updated_at";
  const depuis = new Date(Date.now() - 90 * 86400000);
  try {
    const result = await db.execute(sql`SELECT * FROM ${sql.identifier(table)} WHERE ${sql.identifier(col)} > ${depuis} ORDER BY ${sql.identifier(col)} LIMIT 500`);
    const lignes = Array.isArray(result) ? result : (result as any).rows ?? [];
    console.log("OK lignes:", lignes.length);
  } catch (e: any) {
    console.log("ECHEC:", e.message);
    console.log("DETAIL:", JSON.stringify(e).slice(0, 400));
  }
  process.exit(0);
})();