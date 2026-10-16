import "dotenv/config";
import { requireLocalOrForced, sslPourUrl } from "./env-guard";
import { db } from "./client";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { ensureSecuritySocle } from "./security-socle";
import { KEEP } from "./reset-keep";

requireLocalOrForced("db:reset (reset-db.ts)");

// Liste de survie documentée dans `reset-keep.ts` : socle de sécurité,
// référentiel et configuration. Tout le reste — véhicules, dossiers, ventes,
// dossiers RH, lignes parking — est vid�� à dessein.
(async () => {
  // `ssl: false` en dur faisait échouer ce script sur Neon (`connection is
  // insecure`). Le calcul est centralisé et aligné sur `client.ts`.
  const raw = postgres(process.env.DATABASE_URL!, {
    ssl: sslPourUrl(process.env.DATABASE_URL!),
    prepare: false,
  });
  console.log("=== RESET: purge des donnees metier (socle + referentiel conserves) ===");
  console.log(`Tables preservees (${KEEP.length}) : ${KEEP.join(", ")}`);

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

  // TRUNCATE ne déclenche PAS les déclencheurs de ligne. Le contrôle de
  // gouvernance `trg_append_only_mouvements_stock`, qui interdit de modifier
  // un mouvement de stock une fois écrit, est donc contourné SANS ERREUR et
  // SANS MESSAGE. C'est le comportement attendu d'un reset — mais il ne faut
  // pas le découvrir en production en cherchant pourquoi la piste d'audit a un
  // trou. D'où l'affichage explicite.
  console.log(
    `\nATTENTION : TRUNCATE ne declenche pas les triggers de ligne — ` +
    `trg_append_only_mouvements_stock est ignore, sans erreur.`,
  );

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