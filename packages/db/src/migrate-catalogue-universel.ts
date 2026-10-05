import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

requireLocalOrForced("catalogue-universel (migrate-catalogue-universel.ts)");

/**
 * APPLICATION ADDITIVE du « schéma catalogue universel » (P0) sur une base
 * EXISTANTE — jamais destructive, idempotent (exécutable plusieurs fois).
 * Tables nouvelles : attribut_definitions, unites_domaines, unites_conversions.
 * Colonnes nouvelles (nullable) : categories, article_attributs, variante_attributs.
 * Seeds unités physiques + domaines + conversions (ON CONFLICT DO NOTHING).
 */
(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false });
  const sql = fs.readFileSync(path.resolve(__dirname, "schema-catalogue-universel.sql"), "utf-8");
  console.log("=== CATALOGUE UNIVERSEL (P0) — application additive ===");
  await raw.unsafe(sql);
  console.log("Schéma catalogue universel : OK (attribut_definitions, unites_domaines, unites_conversions, colonnes, seeds).");
  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});