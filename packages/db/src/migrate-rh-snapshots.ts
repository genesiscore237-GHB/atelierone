import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("RH-17 snapshots métier (migrate-rh-snapshots.ts)");

/**
 * Phase 6 — P13/N13 : tables snapshot d'historique métier.
 * Additif et idempotent : 4 tables CREATE TABLE IF NOT EXISTS + index.
 * Non destructif (aucune donnée existante touchée) ; rollback = DROP TABLE.
 * 1) payroll_entry_snapshots     — bulletins avant régénération/ajustement (P13)
 * 2) planning_snapshots          — planning hebdo avant réécriture (N13)
 * 3) evaluation_snapshots        — évaluations avant recalcul (P13)
 * 4) leave_balance_snapshots     — soldes de congés avant décision (P13)
 */
(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  console.log("=== Phase 6 — Snapshots métier RH ===");

  await raw.unsafe(`
    CREATE TABLE IF NOT EXISTS payroll_entry_snapshots (
      id                serial PRIMARY KEY,
      agence_id         integer NOT NULL REFERENCES agences(id),
      payroll_entry_id  integer NOT NULL REFERENCES payroll_entries(id),
      version           integer NOT NULL,
      period_id         integer REFERENCES payroll_periods(id),
      employee_id       integer REFERENCES employes(id),
      base_salary       varchar(40),
      net_pay           varchar(40),
      status            varchar(20),
      entity_json       jsonb NOT NULL,
      lines_json        jsonb NOT NULL,
      raison            varchar(30) NOT NULL,
      created_by        integer REFERENCES utilisateurs(id),
      created_at        timestamp DEFAULT now(),
      UNIQUE (payroll_entry_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_entry_snapshots_entry ON payroll_entry_snapshots (payroll_entry_id, version);
  `);
  console.log("payroll_entry_snapshots : OK.");

  await raw.unsafe(`
    CREATE TABLE IF NOT EXISTS planning_snapshots (
      id               serial PRIMARY KEY,
      agence_id        integer NOT NULL REFERENCES agences(id),
      employe_ids_json jsonb NOT NULL,
      dates_json       jsonb NOT NULL,
      rows_json        jsonb NOT NULL,
      raison           varchar(30) NOT NULL,
      created_by       integer REFERENCES utilisateurs(id),
      created_at       timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_planning_snapshots_agence ON planning_snapshots (agence_id, created_at);
  `);
  console.log("planning_snapshots : OK.");

  await raw.unsafe(`
    CREATE TABLE IF NOT EXISTS evaluation_snapshots (
      id             serial PRIMARY KEY,
      agence_id      integer NOT NULL REFERENCES agences(id),
      evaluation_id  integer NOT NULL REFERENCES evaluations(id),
      version        integer NOT NULL,
      entity_json    jsonb NOT NULL,
      scores_json    jsonb NOT NULL,
      raison         varchar(30) NOT NULL,
      created_by     integer REFERENCES utilisateurs(id),
      created_at     timestamp DEFAULT now(),
      UNIQUE (evaluation_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_evaluation_snapshots_eval ON evaluation_snapshots (evaluation_id, version);
  `);
  console.log("evaluation_snapshots : OK.");

  await raw.unsafe(`
    CREATE TABLE IF NOT EXISTS leave_balance_snapshots (
      id                serial PRIMARY KEY,
      agence_id         integer NOT NULL REFERENCES agences(id),
      leave_balance_id  integer NOT NULL REFERENCES leave_balances(id),
      version           integer NOT NULL,
      entity_json       jsonb NOT NULL,
      raison            varchar(30) NOT NULL,
      created_by        integer REFERENCES utilisateurs(id),
      created_at        timestamp DEFAULT now(),
      UNIQUE (leave_balance_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_leave_balance_snapshots_balance ON leave_balance_snapshots (leave_balance_id, version);
  `);
  console.log("leave_balance_snapshots : OK.");

  console.log("=== Migration snapshots terminée (rollback : DROP TABLE des 4 tables).");
  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});