import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { ensureSecuritySocle } from "./security-socle";

requireLocalOrForced("db:reset (reset-db.ts)");

// Tables conservees : socle de reference (structure + unites + referentiel educatif),
// comptes utilisateurs et donnees d'acces. Tout le reste (donnees metier) est vide.
const KEEP = [
  "agences", "organisations", "cles_api",
  "utilisateurs", "user_roles",
  "roles", "permissions", "role_permissions",
  "verification_tokens",
  "unites_mesure",
  "__drizzle_migrations",
];

(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false });
  console.log("=== RESET: purge des donnees metier (comptes + socle conserves) ===");

  // Dissocier les employes avant purge (les dossiers RH sont des donnees metier).
  // Les rôles sont conserves (socle) : on ne remet PAS role_id a NULL.
  await raw`UPDATE utilisateurs SET employe_id = NULL WHERE employe_id IS NOT NULL`;

  const tables = await raw`
    select tablename from pg_tables
    where schemaname = 'public' and tablename not in ${raw(KEEP)}
    order by tablename`;
  const toTruncate = tables.map((t: any) => t.tablename);
  console.log(`Tables a vider (${toTruncate.length}):`);
  for (const t of toTruncate) console.log("  " + t);

  await raw`TRUNCATE TABLE ${raw(toTruncate)} RESTART IDENTITY CASCADE`;
  console.log("Purge OK.");

  const socle = await ensureSecuritySocle(db);
  console.log(
    `Socle securite: ${socle.roles.length} roles, ${socle.permissions.length} permissions, ` +
    `${socle.associationsCrees} associations creees.`,
  );

  const counts = await raw`
    SELECT
      (SELECT count(*) FROM agences)::int as agences,
      (SELECT count(*) FROM utilisateurs)::int as utilisateurs,
      (SELECT count(*) FROM roles)::int as roles,
      (SELECT count(*) FROM permissions)::int as permissions,
      (SELECT count(*) FROM produits)::int as produits,
      (SELECT count(*) FROM ventes)::int as ventes`;
  console.log("Etat final:", counts[0]);

  console.log("OK. Les comptes utilisateurs et le socle sont conserves ; les donnees metier sont a re-inserer.");
  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});