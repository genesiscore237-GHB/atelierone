import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("db:wipe (seed-wipe.ts)");

const sql = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false });

const KEEP = [
  "agences", "organisations", "cles_api",
  "utilisateurs", "roles", "permissions", "role_permissions", "user_roles",
  "employes", "absences", "sanctions", "contrats", "documents_employes",
  "verification_tokens",
  "sous_systemes", "ministeres", "niveaux", "classes", "matieres", "filieres",
  "annees_scolaires", "unites_mesure",
  "__drizzle_migrations",
];

(async () => {
  const tables = await sql`
    select tablename from pg_tables
    where schemaname = 'public' and tablename not in ${sql(KEEP)}
    order by tablename`;
  const toTruncate = tables.map((t: any) => t.tablename);
  console.log(`Tables à vider (${toTruncate.length}):`);
  for (const t of toTruncate) console.log("  " + t);
  console.log("TRUNCATE RESTART IDENTITY CASCADE...");
  await sql`TRUNCATE TABLE ${sql(toTruncate)} RESTART IDENTITY CASCADE`;
  console.log("OK");
  for (const t of toTruncate) {
    const r = await sql`select count(*)::int as c from ${sql(t)}`;
    console.log(`  ${t}: ${r[0].c}`);
  }
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exitCode = 1;
}).finally(() => sql.end());
