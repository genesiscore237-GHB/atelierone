import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("RH-01 historique des statuts (migrate-rh-status-history.ts)");

/**
 * RH-01 — Historique des statuts employés.
 * Additif et idempotent : crée la table employee_status_history si absente.
 */
(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  console.log("=== RH-01 — Historique des statuts (employee_status_history) ===");
  await raw.unsafe(`
    CREATE TABLE IF NOT EXISTS employee_status_history (
      id           serial PRIMARY KEY,
      employee_id  integer NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
      statut       varchar(30) NOT NULL,
      start_date   date NOT NULL,
      end_date     date,
      reason       text,
      changed_by   integer REFERENCES utilisateurs(id),
      created_at   timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS emp_status_history_employee_idx ON employee_status_history(employee_id);
  `);
  console.log("Table employee_status_history : OK.");
  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});
