import { NextResponse } from "next/server";
import { db } from "@atelierone/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Endpoint de supervision : uptime + état de la base. */
export async function GET() {
  const uptime = Math.round(process.uptime());
  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch { /* base indisponible */ }
  return NextResponse.json(
    { status: dbOk ? "ok" : "degraded", uptimeSec: uptime, role: process.env.APP_ROLE ?? "garage", version: process.env.npm_package_version ?? "dev", db: dbOk, ts: new Date().toISOString() },
    { status: dbOk ? 200 : 503 }
  );
}