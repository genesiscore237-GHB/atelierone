import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

requireLocalOrForced("guide-de-saisie (migrate-guide-saisie.ts)");

/**
 * APPLICATION ADDITIVE du « guide de saisie intelligent » (PHASE 2) sur une base
 * EXISTANTE — jamais destructive, idempotent.
 * Tables nouvelles : guide_categories, guide_steps, guide_rules, guide_examples,
 *                    guide_common_errors, guide_search_aliases.
 * Colonnes nouvelles (nullable) : attribut_definitions.modele_valeur, explication.
 */
(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false });
  const sql = fs.readFileSync(path.resolve(__dirname, "schema-guide-saisie.sql"), "utf-8");
  console.log("=== GUIDE DE SAISIE (PHASE 2) — application additive ===");
  await raw.unsafe(sql);
  console.log("Schéma guide : OK (6 tables + colonnes attribut_definitions).");
  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});