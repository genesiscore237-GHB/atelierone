import { inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export const SOCLE_ROLES = [
  { code: "admin_reseau", nom: "Administrateur Réseau", description: "Super administrateur avec tous les droits", niveau: 1 },
  { code: "responsable_agence", nom: "Responsable d'Agence", description: "Gère l'agence et supervise les opérations", niveau: 2 },
  { code: "operateur_pos", nom: "Opérateur POS", description: "Effectue les ventes au point de vente", niveau: 3 },
  { code: "caissier", nom: "Caissier", description: "Gère la caisse et les encaissements", niveau: 4 },
  { code: "magasinier", nom: "Magasinier", description: "Gère les stocks et inventaires", niveau: 5 },
  { code: "gestionnaire_achats", nom: "Gestionnaire Achats", description: "Gère les commandes fournisseurs", niveau: 6 },
  { code: "comptable", nom: "Comptable", description: "Gère la comptabilité", niveau: 7 },
  { code: "rh", nom: "Ressources Humaines", description: "Gère le personnel", niveau: 8 },
  { code: "consultation", nom: "Consultation", description: "Accès en lecture seule", niveau: 9 },
];

export const SOCLE_PERMISSIONS = [
  { code: "pos.vente.creer", nom: "Créer une vente", module: "pos" },
  { code: "pos.vente.lire", nom: "Consulter les ventes", module: "pos" },
  { code: "pos.vente.annuler", nom: "Annuler une vente", module: "pos" },
  { code: "pos.vente.rembourser", nom: "Rembourser une vente", module: "pos" },
  { code: "stock.consulter", nom: "Consulter le stock", module: "stock" },
  { code: "stock.modifier", nom: "Modifier le stock", module: "stock" },
  { code: "stock.inventaire", nom: "Effectuer un inventaire", module: "stock" },
  { code: "caisse.ouvrir", nom: "Ouvrir la caisse", module: "caisse" },
  { code: "caisse.fermer", nom: "Fermer la caisse", module: "caisse" },
  { code: "caisse.mouvement", nom: "Enregistrer un mouvement", module: "caisse" },
  { code: "caisse.consulter", nom: "Consulter la caisse", module: "caisse" },
  { code: "achats.commander", nom: "Créer une commande", module: "achats" },
  { code: "achats.recevoir", nom: "Réceptionner une commande", module: "achats" },
  { code: "achats.consulter", nom: "Consulter les achats", module: "achats" },
  { code: "fournisseur.consulter", nom: "Consulter les fournisseurs", module: "achats" },
  { code: "fournisseur.gerer", nom: "Gérer les fournisseurs", module: "achats" },
  { code: "rh.utilisateur.creer", nom: "Créer un utilisateur", module: "rh" },
  { code: "rh.utilisateur.modifier", nom: "Modifier un utilisateur", module: "rh" },
  { code: "rh.utilisateur.lire", nom: "Consulter les utilisateurs", module: "rh" },
  { code: "comptabilite.depense.creer", nom: "Enregistrer une dépense", module: "comptabilite" },
  { code: "comptabilite.depense.lire", nom: "Consulter les dépenses", module: "comptabilite" },
  { code: "comptabilite.rapport", nom: "Générer des rapports", module: "comptabilite" },
  { code: "admin.parametres", nom: "Configurer les paramètres", module: "admin" },
  { code: "admin.agence.gerer", nom: "Gérer les agences", module: "admin" },
  { code: "admin.roles.gerer", nom: "Gérer les rôles", module: "admin" },
  { code: "admin.permissions.gerer", nom: "Gérer les permissions", module: "admin" },
  { code: "admin.logs.consulter", nom: "Consulter les logs", module: "admin" },
];

export const SOCLE_MATRICE: Record<string, string[]> = {
  admin_reseau: SOCLE_PERMISSIONS.map((p) => p.code),
  responsable_agence: [
    "pos.vente.lire", "stock.consulter", "stock.inventaire", "caisse.ouvrir", "caisse.fermer",
    "caisse.consulter", "caisse.mouvement", "achats.consulter", "achats.commander", "achats.recevoir",
    "rh.utilisateur.lire", "comptabilite.depense.lire", "comptabilite.rapport",
    "admin.parametres", "admin.logs.consulter",
  ],
  operateur_pos: ["pos.vente.creer", "pos.vente.lire", "pos.vente.annuler", "stock.consulter", "caisse.consulter", "caisse.ouvrir", "caisse.fermer", "caisse.mouvement"],
  caissier: ["caisse.ouvrir", "caisse.fermer", "caisse.mouvement", "caisse.consulter", "pos.vente.lire", "pos.vente.creer"],
  magasinier: ["stock.consulter", "stock.modifier", "stock.inventaire", "achats.recevoir"],
  gestionnaire_achats: ["achats.commander", "achats.recevoir", "achats.consulter", "stock.consulter", "fournisseur.consulter"],
  comptable: ["comptabilite.depense.creer", "comptabilite.depense.lire", "comptabilite.rapport", "pos.vente.lire", "achats.consulter", "caisse.consulter"],
  rh: ["rh.utilisateur.creer", "rh.utilisateur.modifier", "rh.utilisateur.lire"],
  consultation: ["pos.vente.lire", "stock.consulter", "achats.consulter", "caisse.consulter", "comptabilite.depense.lire", "rh.utilisateur.lire"],
};

type Db = PostgresJsDatabase<typeof schema>;

export async function ensureSecuritySocle(db: Db) {
  const rolesCrees = await db
    .insert(schema.roles)
    .values(SOCLE_ROLES)
    .onConflictDoNothing({ target: schema.roles.code })
    .returning({ code: schema.roles.code });

  const allRoles = await db
    .select()
    .from(schema.roles)
    .where(inArray(schema.roles.code, SOCLE_ROLES.map((r) => r.code)));

  const permissionsCrees = await db
    .insert(schema.permissions)
    .values(SOCLE_PERMISSIONS)
    .onConflictDoNothing({ target: schema.permissions.code })
    .returning({ code: schema.permissions.code });

  const allPermissions = await db
    .select()
    .from(schema.permissions)
    .where(inArray(schema.permissions.code, SOCLE_PERMISSIONS.map((p) => p.code)));

  const permByCode = new Map(allPermissions.map((p) => [p.code, p]));

  let associationsCrees = 0;
  for (const role of allRoles) {
    const codes = SOCLE_MATRICE[role.code];
    if (!codes) continue;
    // Filtre défensif : une permission référencée mais absente du socle ne doit
    // jamais produire d'uuid vide dans une requête (crash "uuid : « »").
    const permIds = codes
      .map((c) => permByCode.get(c)?.id)
      .filter((id): id is string => Boolean(id));
    if (permIds.length === 0) continue;
    const existing = await db
      .select()
      .from(schema.rolePermissions)
      .where(inArray(schema.rolePermissions.permissionId, permIds));
    const existingPermIds = new Set(existing.map((rp) => rp.permissionId));
    const toAdd: { roleId: string; permissionId: string }[] = [];
    for (const id of permIds) {
      if (!existingPermIds.has(id)) toAdd.push({ roleId: role.id, permissionId: id });
    }
    if (toAdd.length > 0) {
      await db.insert(schema.rolePermissions).values(toAdd);
      associationsCrees += toAdd.length;
    }
  }

  return {
    roles: allRoles,
    permissions: allPermissions,
    rolesCrees: rolesCrees.length,
    permissionsCrees: permissionsCrees.length,
    associationsCrees,
  };
}