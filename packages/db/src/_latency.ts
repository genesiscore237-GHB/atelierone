import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./client";

async function main() {
  console.log("warmup...");
  await db.execute(sql`SELECT 1`);
  console.log("--- 10 sequential SELECT 1 (warm) ---");
  for (let i = 0; i < 10; i++) {
    const t0 = Date.now();
    await db.execute(sql`SELECT 1`);
    console.log(`q${i + 1}: ${Date.now() - t0}ms`);
  }
  console.log("--- 5 parallel SELECT 1 (warm) ---");
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 5 }, () => db.execute(sql`SELECT 1`)));
  console.log(`all 5: ${Date.now() - t0}ms`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
