import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

requireLocalOrForced("concept-article (migrate-guide-concepts.ts)");

/**
 * APPLICATION ADDITIVE « Concept Article » (Guide v2) sur une base EXISTANTE —
 * jamais destructive, idempotent.
 * Tables nouvelles : guide_variant_types, guide_variant_differentiators,
 *                    guide_procedures, guide_procedure_steps,
 *                    guide_field_mappings, guide_modeling_rules,
 *                    guide_relations.
 */
(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false });
  const sql = fs.readFileSync(path.resolve(__dirname, "schema-guide-concepts.sql"), "utf-8");
  console.log("=== OUTIL D'AIDE CONCEPT ARTICLE (Guide v2) — application additive ===");
  await raw.unsafe(sql);
  console.log("Schéma concept article : OK (7 tables guide_v2).");
  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});