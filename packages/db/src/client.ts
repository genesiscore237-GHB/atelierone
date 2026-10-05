// dotenv/config is loaded by the consuming app (Next.js) or by the seed script
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;
type Client = ReturnType<typeof postgres>;

let clientInstance: Client | undefined;
let dbInstance: Database | undefined;

function getClient(): Client {
  if (clientInstance) return clientInstance;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const ssl = !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1")
    ? "require"
    : false;
  clientInstance = postgres(connectionString, {
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
  return clientInstance;
}

function getDb(): Database {
  if (!dbInstance) dbInstance = drizzle(getClient(), { schema });
  return dbInstance;
}

// Proxy paresseux : importer ce module (build Next qui collecte les pages/api,
// scripts, tests) ne doit ni ouvrir de connexion ni exiger DATABASE_URL.
// La connexion n'est créée qu'au premier usage réel, côté requête.
function lazy<T extends object>(resolve: () => T): T {
  const target = function () {} as unknown as T;
  return new Proxy(target, {
    get: (_target, prop) => {
      const instance = resolve();
      const value = Reflect.get(instance, prop, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },
    has: (_target, prop) => Reflect.has(resolve(), prop),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_target, prop) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), prop);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    // postgres-js expose un callable (tagged template) : on préserve l'appel.
    apply: (_target, thisArg, args) =>
      Reflect.apply(resolve() as unknown as (...a: unknown[]) => unknown, thisArg, args),
  });
}

export const db = lazy(getDb);
export const client = lazy(getClient); // pour fermer la connexion dans les scripts CLI (import, seed, migrations)
