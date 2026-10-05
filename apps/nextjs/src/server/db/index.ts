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
  clientInstance = postgres(connectionString);
  return clientInstance;
}

function getDb(): Database {
  if (!dbInstance) dbInstance = drizzle(getClient(), { schema });
  return dbInstance;
}

// Proxy paresseux : ce module est importé par des routes API, donc lu au build
// Next (`collecting page data`). Aucune connexion ni DATABASE_URL exigée avant
// le premier usage réel.
export const db = new Proxy({} as Database, {
  get: (_target, prop) => {
    const instance = getDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has: (_target, prop) => Reflect.has(getDb(), prop),
  ownKeys: () => Reflect.ownKeys(getDb()),
  getOwnPropertyDescriptor: (_target, prop) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(getDb(), prop);
    return descriptor ? { ...descriptor, configurable: true } : undefined;
  },
});
