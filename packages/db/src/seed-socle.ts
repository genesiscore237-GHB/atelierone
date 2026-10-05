import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db, client } from "./client";
import { ensureSecuritySocle } from "./security-socle";

requireLocalOrForced("db:seed:socle (seed-socle.ts)");

/**
 * SOCLE SÉCURITÉ — ré-aligne la base sur SOCLE_ROLES / SOCLE_PERMISSIONS /
 * SOCLE_MATRICE (security-socle.ts). Additif et idempotent : ne supprime rien,
 * ajoute les rôles, permissions et associations manquantes.
 *
 * Utilisé après l'ajout d'un module (ex. parking.*) pour rendre les permissions
 * effectives sans repasser par db:install (qui purge toute la base).
 */
(async () => {
  console.log("=== SOCLE SÉCURITÉ — synchronisation additive ===");
  const socle = await ensureSecuritySocle(db);
  console.log(
    `OK — ${socle.roles.length} rôles, ${socle.permissions.length} permissions ` +
      `(${socle.permissionsCrees} créées), ${socle.associationsCrees} associations créées.`,
  );
  await client.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});
