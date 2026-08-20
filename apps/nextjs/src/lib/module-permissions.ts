// Mapping module → permissions requises, aligné sur la matrice DB (role_permissions).
// Politique : deny-by-default — tout module non listé est INACCESSIBLE
// (aucune permission ne lui est associée dans la matrice).

export const MODULE_PERMISSIONS: Record<string, string[]> = {
  pos: ["pos.vente.creer", "pos.vente.lire", "pos.vente.annuler", "pos.vente.rembourser"],
  cash: ["caisse.consulter", "caisse.ouvrir", "caisse.fermer", "caisse.mouvement"],
  stock: ["stock.consulter", "stock.modifier", "stock.inventaire"],
  inventory: ["stock.consulter", "stock.inventaire"],
  catalog: ["stock.consulter", "stock.modifier"],
  procurement: ["achats.commander", "achats.recevoir", "achats.consulter"],
  suppliers: ["achats.consulter", "achats.commander"],
  partner: ["achats.commander", "achats.consulter"],
  customers: ["pos.vente.lire", "pos.vente.creer"],
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
  rh: ["rh.utilisateur.lire", "rh.utilisateur.creer", "rh.utilisateur.modifier"],
  governance: ["admin.roles.gerer", "admin.permissions.gerer", "admin.logs.consulter", "rh.utilisateur.lire"],
  audit: ["admin.logs.consulter"],
  settings: ["admin.parametres", "admin.agence.gerer", "admin.roles.gerer", "admin.permissions.gerer"],
  vehicules: ["vehicules.consulter", "vehicules.creer", "vehicules.modifier"],
  or: ["or.consulter", "or.creer", "or.modifier", "or.valider"],
  "ordres-reparation": ["or.consulter", "or.creer", "or.modifier", "or.valider"],
  "ordres-reparation/": ["or.consulter", "or.creer", "or.modifier", "or.valider"],
  contrats: ["contrats.consulter", "contrats.creer"],
  creances: ["creances.consulter", "creances.encaisser"],
  planning: ["planning.consulter", "planning.assigner"],
  admin: ["admin.parametres", "admin.roles.gerer", "admin.permissions.gerer"],
  // Domaines AtelierOne (cartographie GPJ)
  administration: ["admin.parametres", "admin.roles.gerer", "admin.logs.consulter"],
  clients: ["pos.vente.lire", "contrats.consulter"],
  atelier: ["vehicules.consulter", "or.consulter", "planning.consulter"],
  pilotage: ["comptabilite.rapport", "admin.parametres"],
  sites: ["vehicules.consulter", "stock.consulter"],
  interventions: ["or.consulter", "or.creer"],
  factures: ["creances.consulter", "caisse.consulter"],
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
