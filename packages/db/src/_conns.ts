import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./client";

async function main() {
  const rows = await db.execute(sql`SELECT pid, usename, application_name, client_addr, state, count(*) OVER () AS total FROM pg_stat_activity`);
  const list = rows as { pid: number; usename: string; application_name: string; client_addr: string | null; state: string; total: number }[];
  console.log("total connections:", list[0]?.total);
  for (const r of list) console.log(`${r.pid} | ${r.usename} | ${r.application_name} | ${r.client_addr ?? "-"} | ${r.state}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
