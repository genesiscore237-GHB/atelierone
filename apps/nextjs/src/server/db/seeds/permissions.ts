import { db } from "~/server/db";
import { permissions } from "~/server/db/schema";

/**
 * Liste des permissions de base conformément au CDC §8
 * Ces permissions sont créées automatiquement lors de l'installation
 */
export const basePermissions = [
  { code: "catalog.read", nom: "Consulter le catalogue", module: "catalog" },
  { code: "catalog.write", nom: "Modifier le catalogue", module: "catalog" },
  { code: "catalog.delete", nom: "Supprimer des produits", module: "catalog" },
  { code: "catalog.import", nom: "Importer des produits en masse", module: "catalog" },
  { code: "inventory.read", nom: "Consulter les stocks", module: "inventory" },
  { code: "inventory.adjust", nom: "Ajuster le stock", module: "inventory" },
  { code: "inventory.transfer", nom: "Transférer du stock", module: "inventory" },
  { code: "inventory.receive", nom: "Réceptionner des commandes", module: "inventory" },
  { code: "pos.sale", nom: "Réaliser une vente", module: "pos" },
  { code: "pos.discount", nom: "Appliquer des remises", module: "pos" },
  { code: "pos.suspend", nom: "Suspendre/reprendre un panier", module: "pos" },
  { code: "pos.cancel", nom: "Annuler une vente", module: "pos" },
  { code: "pos.refund", nom: "Rembourser/retourner", module: "pos" },
  { code: "cash.open", nom: "Ouvrir une session de caisse", module: "cash" },
  { code: "cash.close", nom: "Clôturer une session de caisse", module: "cash" },
  { code: "cash.expense", nom: "Réaliser un décaissement", module: "cash" },
  { code: "procurement.read", nom: "Consulter les fournisseurs", module: "procurement" },
  { code: "procurement.write", nom: "Créer des commandes fournisseur", module: "procurement" },
  { code: "procurement.approve", nom: "Approuver des commandes", module: "procurement" },
  { code: "customers.read", nom: "Consulter les clients", module: "customers" },
  { code: "customers.write", nom: "Modifier les clients", module: "customers" },
  { code: "reports.read", nom: "Consulter les rapports", module: "reports" },
  { code: "reports.export", nom: "Exporter les rapports", module: "reports" },
  { code: "audit.read", nom: "Consulter le journal d'audit", module: "audit" },
  { code: "users.read", nom: "Consulter les utilisateurs", module: "admin" },
  { code: "users.write", nom: "Gérer les utilisateurs", module: "admin" },
  { code: "roles.manage", nom: "Gérer les rôles et permissions", module: "admin" },
  { code: "settings.manage", nom: "Gérer les paramètres", module: "admin" },
];

export async function seedPermissions() {
  console.log("🌱 Seeding base permissions...");
  
  for (const perm of basePermissions) {
    await db.insert(permissions)
      .values(perm)
      .onConflictDoNothing({ target: permissions.code });
  }

  console.log(`✅ ${basePermissions.length} permissions seeded`);
}

if (require.main === module) {
  seedPermissions()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
