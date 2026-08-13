import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("reset:schema (reset-schema.ts)");

/**
 * RECRÉATION DU SCHÉMA (installation propre) :
 *  1. DROP SCHEMA public CASCADE  → supprime tables + séquences + contraintes
 *  2. CREATE SCHEMA public        → schéma vide
 *  3. GRANT ALL ON SCHEMA public TO public
 *
 * À enchaîner avec : drizzle-kit migrate --config drizzle-clean.config.ts
 * (migration complète du schéma, non interactive — voir scripts/deploy.mjs).
 */
(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false });
  console.log("=== RESET SCHÉMA (DROP + CREATE public) ===");
  // Le schéma "drizzle" (journal des migrations) doit être purgé lui aussi,
  // sinon drizzle-kit considère les migrations déjà appliquées et ne crée rien.
  await raw`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await raw`DROP SCHEMA IF EXISTS public CASCADE`;
  await raw`CREATE SCHEMA IF NOT EXISTS public`;
  await raw`GRANT ALL ON SCHEMA public TO public`;
  console.log("Schéma public recréé (vide).");
  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});
