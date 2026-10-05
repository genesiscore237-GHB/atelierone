import { spawnSync } from "node:child_process";

// Scénarios E2E R4 attendent une période 4 SEPTEMBRE OUVERTE.
// Le test de clôture (R4-UI-03) ferme réellement la période via closePeriod :
// cette routine SQL ré-ouvre idempotemment la période d'entrée du scénario
// (comportement de test uniquement — les devs ne réouvrent pas une période close).
const PSQL = "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
const DSN = "postgresql://postgres:postgres@localhost:5432/atelierone_erp";

function runPsql(sql: string): boolean {
  const r = spawnSync(PSQL, ["-U", "postgres", "-d", "atelierone_erp", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: "postgres" },
    timeout: 30_000,
  });
  if (r.status !== 0) {
    console.error("[global-setup] psql failed:", r.stderr ?? r.stdout);
    return false;
  }
  console.log("[global-setup] psql ok:", r.stdout?.replace(/\s+/g, " ").slice(0, 120));
  return true;
}

export default async function globalSetup() {
  const res = runPsql(
    "UPDATE payroll_periods SET status='open', closed_by=NULL, closed_at=NULL WHERE id=4;"
  );
  if (!res) throw new Error("Réouverture période 4 impossible — scénario bloqué.");
  const count = runPsql("SELECT id, status FROM payroll_periods ORDER BY id;");
  if (!count) throw new Error("Vérification périodes impossible.");
}