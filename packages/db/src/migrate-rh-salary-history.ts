import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("MISSION G10 — historique salarial daté (migrate-rh-salary-history.ts)");

/**
 * MISSION « REFONTE CONTRÔLÉE » G10 —
 * historique salarial daté : le mode de rémunération et le forfait hebdomadaire
 * deviennent reconstructibles par date d'effet (employee_salary_history).
 *  - ajoute mode_paie + forfait_hebdomadaire (null, rétro-compatible)
 *  - backfill depuis l'employé courant (reconstruction, aucune suppression)
 * Additif et idempotent.
 */
(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  console.log("=== G10 — Historique salarial daté ===");

  await raw.unsafe(`
    ALTER TABLE employee_salary_history ADD COLUMN IF NOT EXISTS mode_paie varchar(30);
    ALTER TABLE employee_salary_history ADD COLUMN IF NOT EXISTS forfait_hebdomadaire numeric(12, 2);
  `);
  console.log("employee_salary_history (mode_paie + forfait_hebdomadaire) : OK.");

  const backfill = await raw.unsafe(`
    UPDATE employee_salary_history h
      SET mode_paie = COALESCE(e.mode_paie, h.mode_paie, 'SALAIRE_MENSUEL'),
          forfait_hebdomadaire = COALESCE(e.forfait_hebdomadaire, h.forfait_hebdomadaire)
      FROM employes e
      WHERE h.employee_id = e.id
        AND (h.mode_paie IS NULL OR h.forfait_hebdomadaire IS NULL);
  `);
  console.log("Backfill historique : OK.", backfill.count);

  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});