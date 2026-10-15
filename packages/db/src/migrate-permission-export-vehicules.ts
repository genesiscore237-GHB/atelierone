/**
 * Migration idempotente pour ajouter la permission parking.vehicule.exporter
 * À exécuter en production via : pnpm -F @atelierone/db migrate:permissions
 */

import { inArray, and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as schema from "./schema";
import { SOCLE_MATRICE, SOCLE_PERMISSIONS } from "./security-socle";

const PERMISSION = "parking.vehicule.exporter";

/**
 * Ajoute la permission parking.vehicule.exporter et l'associe aux rôles autorisés.
 * Idempotente : peut être relancée sans effet de bord.
 */
export async function migratePermissionExportVehicules(db: PostgresJsDatabase<typeof schema>) {
  // 1. Créer la permission si elle n'existe pas
  const [permissionExistante] = await db
    .select()
    .from(schema.permissions)
    .where(eq(schema.permissions.code, "parking.vehicule.exporter"))
    .limit(1);

  let permissionId: string;
  if (permissionExistante) {
    permissionId = permissionExistante.id;
    console.log("✓ Permission parking.vehicule.exporter déjà existante");
  } else {
    // Le libellé vient lui aussi du socle : le recopier ici avait produit une
    // permission « Exporter les vehicules » (sans accent) sur les bases
    // amorcées par un autre script, et « Exporter les véhicules » sur celles
    // migrées par celui-ci — deux libellés pour une seule permission, donc une
    // dérive de contenu invisible à la simple comparaison de volumétrie.
    const def = SOCLE_PERMISSIONS.find((p) => p.code === PERMISSION);
    const [created] = await db
      .insert(schema.permissions)
      .values({
        code: PERMISSION,
        nom: def?.nom ?? "Exporter les véhicules du registre",
        module: def?.module ?? "parking",
      })
      .returning({ id: schema.permissions.id });
    permissionId = created.id;
    console.log(`✓ Permission ${PERMISSION} créée`);
  }

  // 2. Rôles autorisés.
  //
  //    La liste était HARD-CODÉE ici alors que `security-socle.ts` définit
  //    déjà, dans SOCLE_MATRICE, quels rôles ont quelles permissions — sans
  //    `directeur`. Deux listes concurrentes pour la même règle : une base
  //    selon laquelle on a lancé ce script différait d'une base où l'on a
  //    lancé `seed:socle`, sans qu'aucune des deux ne soit fausse. On lit
  //    désormais la source de vérité. Toute modification de la matrice se
  //    fait dans security-socle.ts, et ce script suit.
  const rolesAutorises = Object.entries(SOCLE_MATRICE)
    .filter(([, perms]) => perms.includes(PERMISSION))
    .map(([role]) => role);

  // 3. Récupérer les IDs des rôles
  const roles = await db
    .select()
    .from(schema.roles)
    .where(inArray(schema.roles.code, rolesAutorises));

  const rolesMap = new Map(roles.map((r) => [r.code, r.id]));

  // 4. Associer la permission à chaque rôle (idempotent)
  let associationsCrees = 0;
  for (const role of roles) {
    const existing = await db
      .select()
      .from(schema.rolePermissions)
      .where(
        and(
          eq(schema.rolePermissions.roleId, role.id),
          eq(schema.rolePermissions.permissionId, permissionId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.rolePermissions).values({
        roleId: role.id,
        permissionId,
      });
      associationsCrees++;
      console.log(`✓ Permission ajoutée au rôle ${role.code}`);
    } else {
      console.log(`✓ Rôle ${role.code} avait déjà la permission`);
    }
  }

  console.log(`\n✅ Migration terminée : ${associationsCrees} association(s) créée(s)`);
  return { permissionId, associationsCrees };
}

/**
 * Script standalone pour exécution directe
 *
 * `import.meta.url === \`file://${process.argv[1]}\`` est un piège sous
 * Windows : `process.argv[1]` contient des antislashs et `import.meta.url` des
 * forward-slash percent-encodés. Les deux ne sont jamais égales, donc le bloc
 * ci-dessous ne s'exécutait pas et la migration ne se lançait silencieusement,
 * sans la moindre erreur. `pathToFileURL` + `realpathSync` compare des URLs
 * normalisées, quelle que soit la plateforme.
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? "")).href) {
  const { db } = await import("./index");
  await migratePermissionExportVehicules(db);
  process.exit(0);
}