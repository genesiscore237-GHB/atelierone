/**
 * Migration idempotente pour ajouter la permission parking.vehicule.exporter
 * À exécuter en production via : pnpm -F @atelierone/db migrate:permissions
 */

import { inArray, and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

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
    const [created] = await db
      .insert(schema.permissions)
      .values({
        code: "parking.vehicule.exporter",
        nom: "Exporter les véhicules du registre",
        module: "parking",
      })
      .returning({ id: schema.permissions.id });
    permissionId = created.id;
    console.log("✓ Permission parking.vehicule.exporter créée");
  }

  // 2. Rôles autorisés (selon SOCLE_MATRICE)
  const rolesAutorises = [
    "directeur",
    "admin",
    "chef_atelier",
    "secretaire",
    "comptable",
    "consultation",
  ];

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
 */
if (require.main === module) {
  // Import dynamique pour éviter les problèmes de bundling
  const { db } = await import("./index");
  await migratePermissionExportVehicules(db);
  process.exit(0);
}