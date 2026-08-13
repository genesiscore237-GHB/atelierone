// dotenv/config is loaded by the consuming app (Next.js) or by the seed script
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const ssl = !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1")
  ? "require"
  : false;
const client = postgres(connectionString, {
  prepare: false,
  ssl,
  // Keep connections warm across requests: postgres-js default idle_timeout (5s)
  // closes connections after a short idle, and re-connecting costs 2-3s (TLS
  // handshake to a remote host), making every page visit / live search take
  // 10-25s instead of ~300ms.
  idle_timeout: 300,
  // max 8: absorbs parallel tRPC batches (catalog page = 8 procedures) with
  // fewer waves. Supabase pooler caps ~10 conns per IP — stay under it.
  max: 8,
});
export const db = drizzle(client, { schema });
export { client }; // exposé pour fermer la connexion dans les scripts CLI (import, seed, migrations)
