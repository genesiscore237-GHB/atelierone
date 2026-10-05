// Mapping module → permissions requises, aligné sur la matrice DB (role_permissions).
// Politique : deny-by-default — tout module non listé est INACCESSIBLE
// (aucune permission ne lui est associée dans la matrice).

export const MODULE_PERMISSIONS: Record<string, string[]> = {
  pos: ["pos.vente.creer", "pos.vente.lire", "pos.vente.annuler", "pos.vente.rembourser"],
  cash: ["caisse.consulter", "caisse.ouvrir", "caisse.fermer", "caisse.mouvement"],
  stock: ["stock.consulter", "stock.modifier", "stock.inventaire"],
  inventory: ["stock.consulter", "stock.inventaire"],
  catalog: ["stock.consulter", "stock.modifier"],
  // Domaine "Catalogue" (id de domaine ≠ module "catalog") — requis par
  // AppSidebar + hub Pilotage qui filtrent sur canAccessModule(d.id).
  catalogue: ["stock.consulter", "stock.modifier"],
  procurement: ["achats.commander", "achats.recevoir", "achats.consulter"],
  suppliers: ["achats.consulter", "achats.commander"],
  partner: ["achats.commander", "achats.consulter"],
  customers: ["clients.consulter", "clients.creer", "clients.modifier"],
  clients: ["clients.consulter", "clients.creer", "clients.modifier"],
  sales: ["pos.vente.lire"],
  returns: ["pos.vente.rembourser", "pos.vente.annuler", "pos.vente.lire"],
  transfers: ["stock.consulter", "stock.modifier"],
  alerts: ["stock.consulter", "caisse.consulter"],
  loyalty: ["pos.vente.lire", "pos.vente.creer"],
  pricing: ["admin.parametres", "admin.roles.gerer", "admin.permissions.gerer", "admin.agence.gerer"],
  finance: ["comptabilite.rapport", "comptabilite.depense.lire", "comptabilite.depense.creer"],
  profit: ["comptabilite.rapport"],
  rapports: ["comptabilite.rapport", "comptabilite.depense.lire"],
  analytics: ["comptabilite.rapport"],
  marge: ["comptabilite.rapport"],
  rh: [
    "rh.utilisateur.lire", "rh.utilisateur.creer", "rh.utilisateur.modifier",
    // Activités RH de consultation fine (confidentialité visuelle, RH-01 §6) —
    // un consultant RH restreint accède au module dès qu'il en détient au moins une.
    "rh.employe.consulter", "rh.salaire.consulter", "rh.presence.consulter",
    "rh.conge.consulter", "rh.evaluation.consulter", "rh.competence.consulter",
    "rh.document.consulter", "rh.historique.consulter", "rh.note.consulter",
    "rh.discipline.consulter", "rh.situation.consulter",
    // Activités RH d'écriture par sous-module (grain fin, E7)
    "rh.employe.modifier", "rh.presence.modifier", "rh.conge.modifier",
    "rh.paie.modifier", "rh.evaluation.modifier", "rh.competence.modifier",
    "rh.discipline.modifier", "rh.document.modifier", "rh.parametrage.modifier",
    "rh.situation.modifier", "rh.employe.sortie", "rh.employe.reembauche",
    // RPT-04 — dépôt / validation d'un justificatif d'absence (permissions dédiées)
    "rh.absence.justifier", "rh.absence.valider",
  ],
  governance: ["admin.roles.gerer", "admin.permissions.gerer", "admin.logs.consulter", "rh.utilisateur.lire"],
  audit: ["admin.logs.consulter"],
  settings: ["admin.parametres", "admin.agence.gerer", "admin.roles.gerer", "admin.permissions.gerer"],
  vehicules: ["vehicules.consulter", "vehicules.creer", "vehicules.modifier"],
  or: ["or.consulter", "or.creer", "or.modifier", "or.valider"],
  "ordres-reparation": ["or.consulter", "or.creer", "or.modifier", "or.valider"],
  "ordres-reparation/": ["or.consulter", "or.creer", "or.modifier", "or.valider"],
  contrats: ["contrats.consulter", "contrats.creer", "contrats.modifier"],
  creances: ["creances.consulter", "creances.encaisser"],
  planning: ["planning.consulter", "planning.assigner"],
  admin: ["admin.parametres", "admin.roles.gerer", "admin.permissions.gerer"],
  // Domaines AtelierOne (cartographie GPJ)
  administration: ["admin.parametres", "admin.roles.gerer", "admin.logs.consulter"],
  atelier: ["vehicules.consulter", "or.consulter", "planning.consulter"],
  // Domaine "Garage / Parking" (GPJ) — module porté depuis libracore.
  garage: ["parking.consulter", "parking.vehicule.creer", "parking.vehicule.modifier", "parking.alertes.gerer"],
  parking: ["parking.consulter", "parking.vehicule.creer", "parking.vehicule.modifier", "parking.alertes.gerer"],
  pilotage: ["comptabilite.rapport", "admin.parametres"],
  sites: ["vehicules.consulter", "stock.consulter"],
  interventions: ["or.consulter", "or.creer"],
  factures: ["creances.consulter", "caisse.consulter"],
  performance: ["or.consulter", "or.modifier"],
  saas: ["admin.parametres", "admin.roles.gerer"],
  outillage: ["stock.consulter", "stock.modifier"],
  // Futur : catalog.consulter|creer|modifier|supprimer|admin
  // Futur : stock.consulter|recevoir|modifier|inventorier|transferer
  // Futur : outillage.consulter|preter|retourner|maintenance|calibrer
  equipements: ["stock.consulter", "stock.modifier"], // provisoirement même accès que catalogue
  services: ["stock.consulter", "stock.modifier"],    // provisoirement même accès que catalogue
};

export function canAccessModule(
  permissions: string[] | undefined,
  moduleId: string | undefined
): boolean {
  if (!moduleId) return true;
  const required = MODULE_PERMISSIONS[moduleId];
  if (!required || required.length === 0) return false;
  return (permissions ?? []).some((p) => required.includes(p));
}
