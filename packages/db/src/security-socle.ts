import { inArray, and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * SOCLE ATELIERONE — rôles & permissions métier garage.
 * 10 rôles : superadmin, directeur, admin, chef_atelier, secretaire,
 * magasinier, technicien, comptable, rh, consultation.
 */
export const SOCLE_ROLES = [
  { code: "superadmin", nom: "Super Administrateur", description: "Accès total technique + paramétrage", niveau: 1 },
  { code: "directeur", nom: "Directeur / Patron", description: "Pilotage, validation, vision globale, finances", niveau: 2 },
  { code: "admin", nom: "Administrateur système", description: "Gestion utilisateurs, paramètres, sauvegardes", niveau: 2 },
  { code: "chef_atelier", nom: "Chef des ateliers", description: "Planning, OR, assignation techniciens, validation travaux", niveau: 3 },
  { code: "secretaire", nom: "Secrétaire / Accueil", description: "Réception client, devis, factures, suivi dossiers", niveau: 4 },
  { code: "magasinier", nom: "Magasinier", description: "Stock, sorties pièces, réceptions, inventaires", niveau: 5 },
  { code: "technicien", nom: "Technicien / Mécanicien", description: "Consultation OR, saisie interventions, temps passé", niveau: 5 },
  { code: "comptable", nom: "Comptable", description: "Facturation, créances, encaissements, exports", niveau: 4 },
  { code: "rh", nom: "Responsable RH", description: "Employés, présences, congés, paie de base", niveau: 5 },
  { code: "consultation", nom: "Consultation seule", description: "Lecture seule (tableaux de bord, historiques)", niveau: 9 },
];

export const SOCLE_PERMISSIONS = [
  // Ventes / facturation
  { code: "pos.vente.creer", nom: "Créer une vente / facture", module: "pos" },
  { code: "pos.vente.lire", nom: "Consulter les ventes", module: "pos" },
  { code: "pos.vente.annuler", nom: "Annuler une vente", module: "pos" },
  { code: "pos.vente.rembourser", nom: "Rembourser une vente", module: "pos" },
  // Stock
  { code: "stock.consulter", nom: "Consulter le stock", module: "stock" },
  { code: "stock.modifier", nom: "Modifier le stock", module: "stock" },
  { code: "stock.inventaire", nom: "Effectuer un inventaire", module: "stock" },
  { code: "stock.utiliser", nom: "Prêter / retourner les outils et doter les consommables", module: "stock" },
  // Caisse
  { code: "caisse.ouvrir", nom: "Ouvrir la caisse", module: "caisse" },
  { code: "caisse.fermer", nom: "Fermer la caisse", module: "caisse" },
  { code: "caisse.mouvement", nom: "Enregistrer un mouvement", module: "caisse" },
  { code: "caisse.consulter", nom: "Consulter la caisse", module: "caisse" },
  // Achats & fournisseurs
  { code: "achats.commander", nom: "Créer une commande", module: "achats" },
  { code: "achats.recevoir", nom: "Réceptionner une commande", module: "achats" },
  { code: "achats.consulter", nom: "Consulter les achats", module: "achats" },
  { code: "fournisseur.consulter", nom: "Consulter les fournisseurs", module: "achats" },
  { code: "fournisseur.gerer", nom: "Gérer les fournisseurs", module: "achats" },
  // Véhicules & parc
  { code: "vehicules.consulter", nom: "Consulter les véhicules", module: "vehicules" },
  { code: "vehicules.creer", nom: "Créer une fiche véhicule", module: "vehicules" },
  { code: "vehicules.modifier", nom: "Modifier une fiche véhicule", module: "vehicules" },
  // Ordres de réparation
  { code: "or.consulter", nom: "Consulter les OR", module: "or" },
  { code: "or.creer", nom: "Créer un OR", module: "or" },
  { code: "or.modifier", nom: "Modifier un OR / interventions", module: "or" },
  { code: "or.valider", nom: "Valider les travaux (clôture)", module: "or" },
  { code: "or.facturer", nom: "Facturer un OR", module: "or" },
  { code: "or.pieces.servir", nom: "Servir les demandes de pièces des OR (magasin)", module: "or" },
  // Module parking / garage (GPJ)
  { code: "parking.consulter", nom: "Consulter le plan du parc et les véhicules en attente", module: "parking" },
  { code: "parking.vehicule.creer", nom: "Créer un véhicule du registre parking", module: "parking" },
  { code: "parking.vehicule.modifier", nom: "Modifier un véhicule du registre parking", module: "parking" },
  { code: "parking.vehicule.exporter", nom: "Exporter les véhicules du registre", module: "parking" },
  { code: "parking.alertes.gerer", nom: "Gérer les alertes du parking", module: "parking" },
  // Contrats flottes
  { code: "contrats.consulter", nom: "Consulter les contrats", module: "contrats" },
  { code: "contrats.creer", nom: "Créer un contrat flotte", module: "contrats" },
  { code: "contrats.modifier", nom: "Modifier un contrat", module: "contrats" },
  // Clients
  { code: "clients.consulter", nom: "Consulter les clients", module: "clients" },
  { code: "clients.creer", nom: "Créer un client", module: "clients" },
  { code: "clients.modifier", nom: "Modifier un client", module: "clients" },
  // Créances & relances
  { code: "creances.consulter", nom: "Consulter les créances", module: "creances" },
  { code: "creances.encaisser", nom: "Encaisser une créance", module: "creances" },
  { code: "creances.relancer", nom: "Relancer les clients", module: "creances" },
  // Planning atelier
  { code: "planning.consulter", nom: "Consulter le planning", module: "planning" },
  { code: "planning.assigner", nom: "Assigner les techniciens", module: "planning" },
  // RH
  { code: "rh.utilisateur.creer", nom: "Créer un utilisateur", module: "rh" },
  { code: "rh.utilisateur.modifier", nom: "Modifier un utilisateur", module: "rh" },
  { code: "rh.utilisateur.lire", nom: "Consulter les utilisateurs", module: "rh" },
  { code: "rh.employe.consulter", nom: "Consulter la fiche employé", module: "rh" },
  { code: "rh.salaire.consulter", nom: "Consulter les salaires (RH strict/Direction)", module: "rh" },
  { code: "rh.presence.consulter", nom: "Consulter les présences", module: "rh" },
  { code: "rh.conge.consulter", nom: "Consulter les congés & absences", module: "rh" },
  { code: "rh.evaluation.consulter", nom: "Consulter les évaluations", module: "rh" },
  { code: "rh.competence.consulter", nom: "Consulter compétences & formations", module: "rh" },
  { code: "rh.document.consulter", nom: "Consulter les documents RH", module: "rh" },
  { code: "rh.historique.consulter", nom: "Consulter l'historique de carrière", module: "rh" },
  { code: "rh.note.consulter", nom: "Consulter les notes internes", module: "rh" },
  { code: "rh.employe.modifier", nom: "Créer / modifier les fiches employés (y c. sortie)", module: "rh" },
  { code: "rh.presence.modifier", nom: "Saisir les présences, valider les HS, clôturer le mois", module: "rh" },
  { code: "rh.conge.modifier", nom: "Gérer congés, absences et soldes", module: "rh" },
  { code: "rh.paie.modifier", nom: "Préparer et régler la paie", module: "rh" },
  { code: "rh.evaluation.modifier", nom: "Mener les évaluations et leurs campagnes", module: "rh" },
  { code: "rh.competence.modifier", nom: "Gérer compétences, formations et sessions", module: "rh" },
  { code: "rh.discipline.modifier", nom: "Gérer les sanctions disciplinaires", module: "rh" },
  { code: "rh.discipline.consulter", nom: "Consulter le registre disciplinaire", module: "rh" },
  { code: "rh.document.modifier", nom: "Gérer les documents et types de documents RH", module: "rh" },
  { code: "rh.parametrage.modifier", nom: "Configurer le paramétrage RH (cycles, types, jours fériés)", module: "rh" },
  // RPT-04 — workflow du justificatif d'absence / retard (séparation des pouvoirs)
  { code: "rh.absence.justifier", nom: "Déposer un justificatif d'absence ou de retard", module: "rh" },
  { code: "rh.absence.valider", nom: "Valider ou refuser un justificatif d'absence", module: "rh" },
  // R6 cycle de vie — situations RH, sortie/réembauche (permissions dédiées, D-R6-16)
  { code: "rh.situation.consulter", nom: "Consulter les situations RH (cycle de vie)", module: "rh" },
  { code: "rh.situation.modifier", nom: "Créer / gérer les situations RH (workflow, conflits)", module: "rh" },
  { code: "rh.employe.sortie", nom: "Sortie définitive d'un employé (transition formelle)", module: "rh" },
  { code: "rh.employe.reembauche", nom: "Réembaucher un employé sorti", module: "rh" },
  // Comptabilité
  { code: "comptabilite.depense.creer", nom: "Enregistrer une dépense", module: "comptabilite" },
  { code: "comptabilite.depense.lire", nom: "Consulter les dépenses", module: "comptabilite" },
  { code: "comptabilite.rapport", nom: "Générer des rapports", module: "comptabilite" },
  // Administration
  { code: "admin.parametres", nom: "Configurer les paramètres", module: "admin" },
  { code: "admin.agence.gerer", nom: "Gérer les agences/sites", module: "admin" },
  { code: "admin.roles.gerer", nom: "Gérer les rôles", module: "admin" },
  { code: "admin.permissions.gerer", nom: "Gérer les permissions", module: "admin" },
  { code: "admin.logs.consulter", nom: "Consulter les logs", module: "admin" },
  // Audit, direction, export
  { code: "audit.consulter", nom: "Consulter le journal d'audit", module: "audit" },
  { code: "direction.tableau_bord", nom: "Accès au tableau de bord direction", module: "direction" },
  { code: "export.consulter", nom: "Exporter les données", module: "export" },
];

const TOUTES = SOCLE_PERMISSIONS.map((p) => p.code);

/** Activités RH de consultation fine (confidentialité visuelle, RH-01 §6) */
const RH_CONSULTATION = [
  "rh.employe.consulter", "rh.salaire.consulter", "rh.presence.consulter",
  "rh.conge.consulter", "rh.evaluation.consulter", "rh.competence.consulter",
  "rh.document.consulter", "rh.historique.consulter", "rh.note.consulter",
  "rh.discipline.consulter", "rh.situation.consulter",
];

/** Activités RH d'écriture par sous-module (grain fin, E7) */
const RH_ECRITURE = [
  "rh.employe.modifier", "rh.presence.modifier", "rh.conge.modifier",
  "rh.paie.modifier", "rh.evaluation.modifier", "rh.competence.modifier",
  "rh.discipline.modifier", "rh.document.modifier", "rh.parametrage.modifier",
  "rh.situation.modifier", "rh.employe.sortie", "rh.employe.reembauche",
];

/**
 * RPT-04 — dépôt et validation d'un justificatif. Volontairement HORS de
 * `RH_ECRITURE` : ces deux droits ne sont pas accordés à tous les rôles, et le
 * rôle `rh` les reçoit explicitement. L'auto-validation est par ailleurs
 * refusée à l'API : le déposant ne peut pas valider son propre justificatif.
 */
const RH_JUSTIFICATION = ["rh.absence.justifier", "rh.absence.valider"];

export const SOCLE_MATRICE: Record<string, string[]> = {
  superadmin: TOUTES,
  directeur: [
    "direction.tableau_bord", "pos.vente.lire", "stock.consulter", "caisse.consulter",
    "achats.consulter", "fournisseur.consulter", "vehicules.consulter", "or.consulter",
    "or.valider", "contrats.consulter", "clients.consulter", "creances.consulter",
    "creances.encaisser", "creances.relancer", "planning.consulter", "comptabilite.rapport",
    "audit.consulter", "export.consulter", "rh.utilisateur.lire", "parking.consulter",
    ...RH_CONSULTATION,
  ],
  admin: [
    "admin.parametres", "admin.agence.gerer", "admin.roles.gerer", "admin.permissions.gerer",
    "admin.logs.consulter", "rh.utilisateur.creer", "rh.utilisateur.modifier", "rh.utilisateur.lire",
"audit.consulter", "export.consulter", "parking.vehicule.exporter",
  ],
  chef_atelier: [
    "vehicules.consulter", "vehicules.creer", "vehicules.modifier",
    "or.consulter", "or.creer", "or.modifier", "or.valider",
    "planning.consulter", "planning.assigner",
    "stock.consulter", "stock.modifier", "contrats.consulter", "clients.consulter", "pos.vente.lire",
    "parking.consulter", "parking.vehicule.creer", "parking.vehicule.modifier", "parking.vehicule.exporter", "parking.alertes.gerer",
  ],
  secretaire: [
    "clients.consulter", "clients.creer", "clients.modifier",
    "vehicules.consulter", "vehicules.creer",
    "or.consulter", "or.creer",
    "pos.vente.creer", "pos.vente.lire", "pos.vente.annuler",
    "caisse.consulter", "caisse.ouvrir", "caisse.fermer", "caisse.mouvement",
    "creances.consulter", "contrats.consulter", "planning.consulter",
"parking.consulter", "parking.vehicule.creer", "parking.vehicule.modifier", "parking.vehicule.exporter",
  ],
  magasinier: [
    "stock.consulter", "stock.modifier", "stock.inventaire", "stock.utiliser",
    "achats.commander", "achats.recevoir", "achats.consulter",
    "fournisseur.consulter", "fournisseur.gerer", "or.consulter", "or.pieces.servir",
  ],
  technicien: [
    "or.consulter", "or.modifier", "vehicules.consulter", "stock.consulter", "stock.utiliser", "planning.consulter",
    "parking.consulter",
  ],
  comptable: [
    "pos.vente.creer", "pos.vente.lire", "pos.vente.rembourser", "or.facturer",
    "caisse.consulter", "caisse.mouvement", "creances.consulter", "creances.encaisser",
    "comptabilite.depense.creer", "comptabilite.depense.lire", "comptabilite.rapport",
    "clients.consulter", "fournisseur.consulter", "achats.consulter", "export.consulter", "parking.vehicule.exporter",
  ],
  rh: [
    "rh.utilisateur.creer", "rh.utilisateur.modifier", "rh.utilisateur.lire", "audit.consulter",
    ...RH_CONSULTATION,
    ...RH_ECRITURE,
    ...RH_JUSTIFICATION,
  ],
  consultation: [
    "pos.vente.lire", "stock.consulter", "caisse.consulter", "achats.consulter",
    "vehicules.consulter", "or.consulter", "contrats.consulter", "creances.consulter",
    "planning.consulter", "direction.tableau_bord", "comptabilite.rapport", "rh.utilisateur.lire",
    "audit.consulter", "parking.consulter", "parking.vehicule.exporter",
  ],
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
      .where(and(inArray(schema.rolePermissions.permissionId, permIds), eq(schema.rolePermissions.roleId, role.id)));
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
