/**
 * RPT-05 — Synchronisation du socle de securite (permissions RH manquantes).
 *
 * CONSTAT REPRODUIT (2026-10-01) : `rh.absence.justifier` et
 * `rh.absence.valider` sont declares dans `SOCLE_PERMISSIONS` et accordees au
 * role `rh` par `SOCLE_MATRICE`, mais ABSENTES de la table `permissions` de la
 * base. Consequence : `RBACService.hasPermission` renvoie `false` pour tout le
 * monde, donc les mutations RPT-04 (`submitJustificatif`,
 * `validateJustificatif`, `rejectJustificatif`) sont inaccessibles a tout
 * non-superadmin. Le module etait livre, mais inutilisable.
 *
 * Cette migration appelle `ensureSecuritySocle`, qui est idempotente :
 *   · permissions absentes  -> inserees ;
 *   · associations absentes -> creees ;
 *   · permissions revoquees -> JAMAIS retirees (aucune perte de droit).
 *
 * Aucun CHECK n'est pose ici : aucune contrainte nouvelle n'est introduite.
 * Aucune donnee metier n'est lue ni modifiee.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema/index.js";
import { ensureSecuritySocle, SOCLE_PERMISSIONS, SOCLE_MATRICE } from "./security-socle.js";

const DRY_RUN = !!process.env.DRY_RUN;

/** Permissions RH declarees au socle : sert de reference d'ecart. */
const CODES_RH = SOCLE_PERMISSIONS.filter((p) => p.module === "rh").map((p) => p.code);

(async () => {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error(
      "DATABASE_URL absent. Migration volontairement bloquee (pas de repli silencieux sur une base par defaut)."
    );
    process.exit(1);
  }

  const sql = postgres(url, { onnotice: () => {} });

  try {
    // La table `permissions` tient en quelques centaines de lignes : on la lit
    // en entier plutot que de jongler avec des tableaux de parametres.
    const avant = await sql<{ code: string }[]>`SELECT code FROM permissions`;
    const avantRh = CODES_RH.filter((c) => avant.some((r) => r.code === c));
    const manquantes = CODES_RH.filter((c) => !avantRh.includes(c));

    if (DRY_RUN) {
      console.log(`DRY_RUN — permissions rh.* en base : ${avantRh.length}/${CODES_RH.length}`);
      console.log(`DRY_RUN — a installer : ${manquantes.join(", ") || "aucune"}`);
      return;
    }

    const db = drizzle(sql, { schema });
    const resume = await ensureSecuritySocle(db);

    const apres = await sql<{ code: string }[]>`SELECT code FROM permissions`;
    const apresRh = CODES_RH.filter((c) => apres.some((r) => r.code === c));
    const restantes = CODES_RH.filter((c) => !apresRh.includes(c));

    console.log(
      `APPLY — socle : ${resume.rolesCrees} role(s), ${resume.permissionsCrees} permission(s), ${resume.associationsCrees} association(s) cree(s)`
    );
    console.log(`APPLY — permissions rh.* : ${apresRh.length}/${CODES_RH.length}`);
    if (restantes.length > 0) {
      console.error(`ECHEC — toujours absentes : ${restantes.join(", ")}`);
      process.exitCode = 1;
    }

    // Verifie que les droits du workflow de justificatif sont bien portes par
    // le role RH, sinon la feature reste fermee.
    const droits = await sql<{ role: string; code: string }[]>`
      SELECT r.code AS role, p.code
        FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        JOIN permissions p ON p.id = rp.permission_id
       WHERE p.code IN ('rh.absence.justifier','rh.absence.valider')
       ORDER BY r.code, p.code
    `;
    for (const d of droits) console.log(`  ${d.role} -> ${d.code}`);

    const rolesSansJustif = Object.keys(SOCLE_MATRICE).filter(
      (role) =>
        SOCLE_MATRICE[role].includes("rh.absence.justifier") &&
        !droits.some((d) => d.role === role && d.code === "rh.absence.justifier")
    );
    if (rolesSansJustif.length > 0) {
      console.error(`ECHEC — roles sans droit de depot : ${rolesSansJustif.join(", ")}`);
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("ECHEC —", (e as Error).message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
})();
