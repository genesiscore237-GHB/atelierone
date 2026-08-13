import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

async function test(label: string, url: string) {
  const client = postgres(url, { prepare: false, ssl: "require", idle_timeout: 300, max: 6 });
  const db = drizzle(client, { schema: {} as never });
  console.log(`=== ${label} ===`);
  const t0 = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    console.log(`connect+ping1: ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`connect FAILED: ${(e as Error).message.slice(0, 200)}`);
    await client.end().catch(() => {});
    return;
  }
  const t1 = Date.now();
  await Promise.all(Array.from({ length: 5 }, () => db.execute(sql`SELECT 1`)));
  console.log(`5 parallel (warm): ${Date.now() - t1}ms`);
  const t2 = Date.now();
  for (let i = 0; i < 5; i++) await db.execute(sql`SELECT 1`);
  console.log(`5 sequential (warm): ${Date.now() - t2}ms`);
  await client.end().catch(() => {});
}

const direct = process.env.DIRECT_TEST_URL!;
const pooler = process.env.POOLER_TEST_URL!;

(async () => {
  await test("DIRECT db.<ref>.supabase.co:5432", direct);
  await test("POOLER aws-0-eu-west-1.pooler:6543", pooler);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
