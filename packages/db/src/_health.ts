import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  ssl: "require",
  max: 2,
  idle_timeout: 60,
});
const db = drizzle(client, { schema: {} as never });

async function main() {
  console.log("--- pg_stat_activity (top 15 by state, no pg_sleep, no our own) ---");
  const rows = await db.execute<{
    pid: number;
    usename: string;
    state: string;
    wait_event_type: string | null;
    wait_event: string | null;
    query: string;
    duration_ms: number;
  }>(sql`
    SELECT pid, usename, state, wait_event_type, wait_event,
           left(query, 90) AS query,
           round(extract(epoch from (now() - query_start)) * 1000) AS duration_ms
    FROM pg_stat_activity
    WHERE datname = 'postgres'
      AND pid <> pg_backend_pid()
    ORDER BY duration_ms DESC NULLS LAST
    LIMIT 15
  `);
  if (!rows.length) {
    console.log("(aucune requête active)");
  }
  for (const r of rows) {
    console.log(`pid=${r.pid} state=${r.state ?? "?"} wait=${r.wait_event ?? "none"} dur=${r.duration_ms ?? "?"}ms :: ${r.query}`);
  }

  console.log("--- locks bloquants (bloqueur -> bloque) ---");
  const locks = await db.execute<{ blocked_pid: number; blocking_pid: number; blocked_state: string; blocking_state: string; blocked_dur_ms: number; blocked_query: string; blocking_query: string }>(sql`
    SELECT a.pid AS blocked_pid, b.pid AS blocking_pid,
           a.state AS blocked_state, b.state AS blocking_state,
           round(extract(epoch from (now() - a.query_start)) * 1000) AS blocked_dur_ms,
           left(a.query, 60) AS blocked_query, left(b.query, 60) AS blocking_query
    FROM pg_stat_activity a
    JOIN pg_stat_activity b ON a.pid <> b.pid
    JOIN pg_locks l1 ON l1.pid = a.pid
    JOIN pg_locks l2 ON l2.pid = b.pid
      AND l2.locktype = l1.locktype AND l2.database = l1.database
      AND l2.relation = l1.relation AND l2.mode = 'ExclusiveLock'
    WHERE NOT a.waiting AND b.waiting AND a.state = 'active'
    LIMIT 5
  `);
  if (!locks.length) console.log("(aucun lock bloquant)");
  for (const l of locks) console.log(`blocked pid=${l.blocked_pid} [${l.blocked_query}] <- blocking pid=${l.blocking_pid} [${l.blocking_query}] dur=${l.blocked_dur_ms}ms`);

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
