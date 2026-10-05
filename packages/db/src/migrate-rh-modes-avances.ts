import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("MISSION G9 — modes de rémunération & avances (migrate-rh-modes-avances.ts)");

/**
 * MISSION « REFONTE CONTRÔLÉE » G9 —
 *  - modes de rémunération (mode_paie normalisé + forfait_hebdomadaire)
 *  - avances sur salaire transactionnelles (employee_advances, advance_recoveries)
 *  - retards déductibles (late_deduction_rules, colonnes calculs/summaries)
 *  - absences financièrement impacter (absence_*)
 * Additif et idempotent : aucun remplacement de valeur métier, aucun delete.
 */
(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  console.log("=== G9 — Modes de rémunération, avances, retards déductibles, absences ===");

  // 1. Modes de rémunération (employes)
  await raw.unsafe(`
    ALTER TABLE employes
      ALTER COLUMN mode_paie TYPE varchar(30),
      ALTER COLUMN mode_paie SET DEFAULT 'SALAIRE_MENSUEL';
    ALTER TABLE employes ADD COLUMN IF NOT EXISTS forfait_hebdomadaire numeric(12, 0);
  `);
  console.log("employes.mode_paie varchar(30) + forfait_hebdomadaire : OK.");

  // 2. Avances transactionnelles
  await raw.unsafe(`
    CREATE TABLE IF NOT EXISTS employee_advances (
      id                         serial PRIMARY KEY,
      employee_id                integer NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
      date_demande               date,
      date_approbation           date,
      date_versement             date NOT NULL,
      montant                    numeric(12, 0) NOT NULL,
      motif                      text,
      moyen_paiement             varchar(30),
      periode_concernee_debut    date,
      periode_concernee_fin      date,
      periode_recuperation_debut date,
      periode_recuperation_fin   date,
      montant_recupe             numeric(12, 0) DEFAULT '0',
      solde_restant              numeric(12, 0) NOT NULL,
      statut                     varchar(30) DEFAULT 'VERSÉE',
      responsable_id             integer REFERENCES utilisateurs(id),
      created_at                 timestamp DEFAULT now(),
      updated_at                 timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS employee_advances_employee_idx ON employee_advances(employee_id);
    CREATE INDEX IF NOT EXISTS employee_advances_statut_idx ON employee_advances(statut);

    CREATE TABLE IF NOT EXISTS advance_recoveries (
      id                         serial PRIMARY KEY,
      advance_id                 integer NOT NULL REFERENCES employee_advances(id) ON DELETE CASCADE,
      date_recuperation          date NOT NULL,
      montant                    numeric(12, 0) NOT NULL,
      periode_concernee_debut    date,
      periode_concernee_fin      date,
      payroll_entry_id           integer,
      created_by                 integer REFERENCES utilisateurs(id),
      created_at                 timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS advance_recoveries_advance_idx ON advance_recoveries(advance_id);
  `);
  console.log("employee_advances + advance_recoveries : OK.");

  // 3. Règles de retenue retards (paramétrables)
  await raw.unsafe(`
    CREATE TABLE IF NOT EXISTS late_deduction_rules (
      id         serial PRIMARY KEY,
      agence_id  integer NOT NULL REFERENCES agences(id),
      name       varchar(120) NOT NULL,
      method     varchar(30) NOT NULL,
      params     jsonb DEFAULT '{}',
      is_active  boolean DEFAULT true,
      is_default boolean DEFAULT false,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS late_deduction_rules_agence_idx ON late_deduction_rules(agence_id);
  `);
  console.log("late_deduction_rules : OK.");

  // 4. Colonnes présences (absences détaillées)
  await raw.unsafe(`
    ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS status varchar(30) DEFAULT 'PRESENT';
    ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS absence_type varchar(30);
    ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS absence_motif text;
    ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS absence_justificatif text;
  `);
  console.log("attendance_entries (status, absence_*) : OK.");

  // 5. Colonnes calculs (retard déductible + impact financier absence)
  await raw.unsafe(`
    ALTER TABLE attendance_calculations ADD COLUMN IF NOT EXISTS late_deductible_minutes integer DEFAULT 0;
    ALTER TABLE attendance_calculations ADD COLUMN IF NOT EXISTS late_deduction_amount numeric(12, 2) DEFAULT '0';
    ALTER TABLE attendance_calculations ADD COLUMN IF NOT EXISTS absence_financial_impact numeric(12, 2) DEFAULT '0';
  `);
  console.log("attendance_calculations (late_* + absence_financial_impact) : OK.");

  // 6. Colonnes résumés mensuels
  await raw.unsafe(`
    ALTER TABLE attendance_monthly_summaries ADD COLUMN IF NOT EXISTS total_late_deductible_minutes integer DEFAULT 0;
    ALTER TABLE attendance_monthly_summaries ADD COLUMN IF NOT EXISTS total_late_deduction_amount numeric(12, 2) DEFAULT '0';
    ALTER TABLE attendance_monthly_summaries ADD COLUMN IF NOT EXISTS total_absence_financial_impact numeric(12, 2) DEFAULT '0';
  `);
  console.log("attendance_monthly_summaries (total_late_* + total_absence_*) : OK.");

  // 7. Backfill mode_paie : anciennes valeurs → nouveau vocabulaire (aucune destruction)
  const backfill = await raw.unsafe(`
    UPDATE employes
      SET mode_paie = CASE
        WHEN mode_paie IN ('mensuel', 'MENSUEL', 'Mensuel') THEN 'SALAIRE_MENSUEL'
        WHEN mode_paie IN ('horaire', 'HORAIRE', 'Horaire') THEN 'SALAIRE_HORAIRE'
        WHEN mode_paie = 'forfait' THEN 'FORFAIT_HEBDOMADAIRE'
        WHEN mode_paie = 'non_remunere' THEN 'NON_REMUNERE'
        WHEN mode_paie = 'essai' THEN 'SALAIRE_HORAIRE'
        ELSE mode_paie END
      WHERE mode_paie NOT IN ('SALAIRE_MENSUEL','SALAIRE_HORAIRE','FORFAIT_HEBDOMADAIRE','NON_REMUNERE');
    UPDATE employes SET mode_paie = 'SALAIRE_MENSUEL' WHERE mode_paie IS NULL;
  `);
  console.log("Backfill mode_paie : OK.", backfill.count);

  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});