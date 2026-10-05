import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("RH-11 statut de sortie (migrate-rh-sortie.ts)");

/**
 * RH-11 — Statut de sortie définitive (CDC §11).
 * Additif et idempotent : ajoute les colonnes de sortie sur employes
 * et le traçage reembauchable sur employee_status_history.
 */
(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  console.log("=== RH-11 — Colonnes de sortie définitive ===");
  await raw.unsafe(`
    ALTER TABLE employes
      ADD COLUMN IF NOT EXISTS date_sortie date,
      ADD COLUMN IF NOT EXISTS motif_sortie varchar(40),
      ADD COLUMN IF NOT EXISTS detail_motif_sortie text,
      ADD COLUMN IF NOT EXISTS reembauchable boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS sortie_changed_by integer,
      ADD COLUMN IF NOT EXISTS sortie_changed_at timestamp;
    ALTER TABLE employee_status_history
      ADD COLUMN IF NOT EXISTS reembauchable boolean;
  `);
  console.log("Colonnes de sortie : OK.");
  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});