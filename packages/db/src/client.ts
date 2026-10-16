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
    /**
     * `search_path` explicite — le point de correction unique pour toute la
     * famille de pannes « relation "X" does not exist ».
     *
     * Les sessions n'ouvrent pas toutes avec le même schéma :
     *   - local      → `"$user", public`      (ne fonctionne que par chance)
     *   - Neon direct→ `"$user", public`      (idem)
     *   - Neon POOLER→ **VIDE**               (c'est le Behavior documenté de l'endpoint)
     *
     * Sur le pooler, un nom de table non qualifié ne se résout donc pas : le
     * socle sécurité échouait sur `relation "roles" does not exist` alors que la
     * table existe bel et bien en production — et bloquait le push via le
     * verrou de cohérence.
     *
     * On fixe le chemin ici, à la source, plutôt que de qualifier `public.`
     * dans chaque requête : il y a des centaines de requêtes, et le jour où
     * quelqu'un en ajoute une sans qualifier, elle échoue en production
     * uniquement. Ici, une seule ligne couvre l'application ET tous les
     * scripts d'exploitation, passés et à venir.
     */
    connection: { search_path: "public" },
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
