/**
 * MACHINE D'ÉTATS & PARCOURS GUIDÉ — Module Ordres de Réparation.
 *
 * Couche pure (sans DB, sans UI) dérivée de la refonte expert :
 *  - 7 étapes du parcours guidé (stepper)
 *  - Mapping statut OR → étape dominante
 *  - Permissions fines par étape / action (dérivées des permissions serveur réelles)
 *  - Bandeau « prochaine action recommandée »
 *
 * Les transitions de statut elles-mêmes restent pilotées par `atelier-service`
 * (TRANSITIONS_ATELIER) côté backend. Ce fichier ne déclare QUE le parcours UI.
 */

import {
  STATUT_LABELS,
  transitionStatutAtelierValide,
} from "~/server/lib/atelier-service";

// ── Les 7 étapes du parcours guidé ────────────────────────────────────────────
export const OR_STEPS = [
  { id: "reception", label: "Réception", step: 1 },
  { id: "diagnostic", label: "Diagnostic", step: 2 },
  { id: "devis", label: "Devis & Autorisation", step: 3 },
  { id: "pieces", label: "Pièces", step: 4 },
  { id: "travaux", label: "Travaux & Pointage", step: 5 },
  { id: "qualite", label: "Contrôle Qualité", step: 6 },
  { id: "facture-restitution", label: "Facture & Restitution", step: 7 },
] as const;

export type OrStepId = (typeof OR_STEPS)[number]["id"];

export const OR_DEFAULT_TAB = "reception" as const;

// ── Mapping statut réel → étape dominante ─────────────────────────────────────
const STATUT_ETAPE: Record<string, OrStepId> = {
  EN_ATTENTE_DIAGNOSTIC: "diagnostic",
  EN_ATTENTE_VALIDATION_DIAGNOSTIC: "diagnostic",
  EN_COURS: "travaux",
  EN_ATTENTE_PIECES: "pieces",
  EN_ATTENTE_VALIDATION: "devis",
  CONTROLE_QUALITE: "qualite",
  PRET_A_LIVRER: "facture-restitution",
  BLOQUE: "pieces",
  LIVRE: "facture-restitution",
  ANNULE: "facture-restitution",
  ferme_definitif: "facture-restitution",
};

/** Étape dominante (onglet actif par défaut) d'un OR selon son statut. */
export function orStepForStatus(statut: string | null | undefined): OrStepId {
  if (!statut) return OR_DEFAULT_TAB;
  return STATUT_ETAPE[statut] ?? OR_DEFAULT_TAB;
}

// ── État d'une étape dans le stepper ──────────────────────────────────────────
export type OrStepState = "done" | "current" | "todo";

/**
 * État des 7 étapes pour un OR.
 * L'étape courante = étape dominante du statut. Les étapes antérieures sont
 * « done », les suivantes « todo ». En cas de retour en arrière (BLOQUE, ANNULE…)
 * on marque l'étape courante comme la seule "current" et on neutralise le reste.
 */
export function orStepsState(statut: string | null | undefined): Record<OrStepId, OrStepState> {
  const current = orStepForStatus(statut);
  const currentIdx = OR_STEPS.findIndex((s) => s.id === current);
  const result = {} as Record<OrStepId, OrStepState>;
  return OR_STEPS.reduce((acc, s, i) => {
    if (!statut || (statut !== "BLOQUE" && statut !== "ANNULE")) {
      acc[s.id] = i < currentIdx ? "done" : i === currentIdx ? "current" : "todo";
    } else {
      // BLOQUE / ANNULE : considérés comme « terminés/figés », tout en "todo"
      // sauf l'étape atteinte qui est "current" pour signaler où l'on s'est arrêté.
      acc[s.id] = i === currentIdx ? "current" : "done";
    }
    return acc;
  }, result);
}

// ── Permissions fines dérivées des permissions serveur réelles ────────────────
// Les permissions réellement présentes dans la matrice DB (role_permissions) sont :
//   or.consulter · or.creer · or.modifier · or.valider · or.facturer · or.pieces.servir
// On les dérive ici en flags fins par étape / action pour le guidage UI, SANS
// inventer de permission inexistante côté serveur (principe de sincérité).

export interface OrPermissionFlags {
  consult: boolean; // or.consulter
  creer: boolean; // or.creer
  modifier: boolean; // or.modifier
  valider: boolean; // or.valider
  facturer: boolean; // or.facturer
  servirPieces: boolean; // or.pieces.servir
  // Stages d'accès dérivés
  canReception: boolean;
  canDiagnostiquer: boolean;
  canDeviser: boolean;
  canPieces: boolean;
  canTravaux: boolean;
  canQualite: boolean;
  canFacturation: boolean;
  canRestitution: boolean;
  canChangerStatut: boolean;
  canAssignerTechnicien: boolean;
  canPointage: boolean;
}

/** Construit les flags fins à partir de la liste brute des permissions user. */
export function buildOrPermissions(hasPermission: (action: string) => boolean): OrPermissionFlags {
  const consult = hasPermission("or.consulter");
  const creer = hasPermission("or.creer");
  const modifier = hasPermission("or.modifier");
  const valider = hasPermission("or.valider");
  const facturer = hasPermission("or.facturer");
  const servirPieces = hasPermission("or.pieces.servir");

  return {
    consult,
    creer,
    modifier,
    valider,
    facturer,
    servirPieces,
    // Derivation raisonnable : qui peut modifier peut (dans l'UI) gérer réception,
    // travaux, pointage, technicien, statut. La validation fine reste côté serveur.
    canReception: modifier || creer,
    canDiagnostiquer: modifier,
    canDeviser: valider || modifier,
    canPieces: modifier || servirPieces,
    canTravaux: modifier,
    canQualite: modifier || valider,
    canFacturation: facturer,
    canRestitution: modifier,
    canChangerStatut: modifier,
    canAssignerTechnicien: modifier,
    canPointage: modifier,
  };
}

// ── Onglets visibles par étape ────────────────────────────────────────────────
export interface OrTabDef {
  id: OrStepId;
  label: string;
  accessor: (p: OrPermissionFlags) => boolean;
}

export const OR_TABS: OrTabDef[] = OR_STEPS.map((s) => ({
  id: s.id,
  label: s.label,
  accessor: (p) => {
    switch (s.id) {
      case "reception": return p.canReception || p.consult;
      case "diagnostic": return p.canDiagnostiquer || p.consult;
      case "devis": return p.canDeviser || p.consult;
      case "pieces": return p.canPieces || p.consult;
      case "travaux": return p.canTravaux || p.consult;
      case "qualite": return p.canQualite || p.consult;
      case "facture-restitution": return p.canFacturation || p.canRestitution || p.consult;
      default: return p.consult;
    }
  },
}));

// ── Bandeau « Prochaine action recommandée » ──────────────────────────────────
export function orNextAction(statut: string | null | undefined): string | null {
  switch (statut) {
    case "EN_ATTENTE_DIAGNOSTIC":
      return "Réaliser le diagnostic et soumettre le rapport pour validation.";
    case "EN_ATTENTE_VALIDATION_DIAGNOSTIC":
      return "Valider (ou renvoyer) le diagnostic soumis par le technicien.";
    case "EN_ATTENTE_VALIDATION":
      return "Créer et envoyer une version de devis, puis recueillir l'autorisation ligne par ligne.";
    case "EN_ATTENTE_PIECES":
      return "Traiter la demande de pièces : servir au magasin ou commander au fournisseur.";
    case "EN_COURS":
      return "Démarrer les travaux, pointer le temps et renseigner les lignes main-d'œuvre.";
    case "CONTROLE_QUALITE":
      return "Réaliser le contrôle qualité puis valider (ou renvoyer en travaux).";
    case "PRET_A_LIVRER":
      return "Facturer l'intervention puis restituer le véhicule au client.";
    case "BLOQUE":
      return `OR bloqué : ${STATUT_LABELS[statut]}. Lever le blocage pour reprendre le cycle.`;
    case "LIVRE":
      return "Véhicule restitué. Clôturer définitivement l'ordre si applicable.";
    default:
      return null;
  }
}

export { transitionStatutAtelierValide };
