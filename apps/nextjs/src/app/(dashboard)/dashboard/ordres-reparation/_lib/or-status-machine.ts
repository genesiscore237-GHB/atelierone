/**
 * MACHINE D'ÉTATS & PARCOURS GUIDÉ — Module Ordres de Réparation.
 *
 * Couche pure (sans DB, sans UI) :
 *  - 7 étapes du parcours guidé ;
 *  - état réel de chaque étape, calculé sur SES données (pas sur l'index du
 *    statut global) ;
 *  - étape réellement bloquée quand l'OR est en BLOQUE ;
 *  - prochaine action cliquable ;
 *  - permissions fines et vue par rôle.
 *
 * Les transitions de statut restent pilotées par `atelier-service`
 * (TRANSITIONS_ATELIER) côté backend. Ce fichier ne déclare QUE le parcours UI.
 */

import { transitionStatutAtelierValide } from "~/server/lib/atelier-service";

// ── Les 7 étapes du parcours guidé ────────────────────────────────────────────
export const OR_STEPS = [
  { id: "reception", label: "Réception", shortLabel: "Réception", step: 1 },
  { id: "diagnostic", label: "Diagnostic", shortLabel: "Diagnostic", step: 2 },
  { id: "devis", label: "Devis & Autorisation", shortLabel: "Devis", step: 3 },
  { id: "pieces", label: "Pièces", shortLabel: "Pièces", step: 4 },
  { id: "travaux", label: "Travaux & Pointage", shortLabel: "Travaux", step: 5 },
  { id: "qualite", label: "Contrôle Qualité", shortLabel: "Qualité", step: 6 },
  { id: "facture-restitution", label: "Facture & Restitution", shortLabel: "Facture / Sortie", step: 7 },
] as const;

export type OrStepId = (typeof OR_STEPS)[number]["id"];

export const OR_DEFAULT_TAB: OrStepId = "reception";

// ── Mapping statut réel → étape dominante ─────────────────────────────────────
// BLOQUE, ANNULE et ferme_definitif n'ont PAS d'étape fixe : leur étape est
// déduite de l'historique (ou de la raison de blocage) par `orCurrentStep`.
const STATUT_ETAPE: Record<string, OrStepId> = {
  OUVERT: "reception",
  EN_ATTENTE_DIAGNOSTIC: "diagnostic",
  EN_ATTENTE_VALIDATION_DIAGNOSTIC: "diagnostic",
  EN_ATTENTE_VALIDATION: "devis",
  EN_ATTENTE_PIECES: "pieces",
  EN_COURS: "travaux",
  CONTROLE_QUALITE: "qualite",
  PRET_A_LIVRER: "facture-restitution",
  LIVRE: "facture-restitution",
};

/** Étape dominante d'un statut « simple ». `null` pour BLOQUE / ANNULE / ferme. */
export function orStepForStatus(statut: string | null | undefined): OrStepId | null {
  if (!statut) return null;
  return STATUT_ETAPE[statut] ?? null;
}

// ── États réels d'une étape ───────────────────────────────────────────────────
export type OrStepVisualState =
  | "todo"
  | "in_progress"
  | "waiting"
  | "done"
  | "blocked"
  | "not_applicable";

export interface OrStepStatus {
  state: OrStepVisualState;
  label: string;
  detail?: string;
}

export type OrCycleFlag = "normal" | "bloque" | "annule" | "cloture";

export interface OrHistoriqueEntry {
  type?: string | null;
  ancienneValeur?: string | null;
  nouvelleValeur?: string | null;
  changeLe?: string | Date | null;
}

export interface OrLigneSnapshot {
  type?: string | null;
  statut?: string | null;
  statutAutorisation?: string | null;
  bloque?: boolean | null;
  raisonBlocageLigne?: string | null;
}

export interface OrStepSnapshot {
  statut?: string | null;
  historique?: OrHistoriqueEntry[] | null;
  raisonBlocage?: string | null;
  dateReception?: string | Date | null;
  dateOuverture?: string | Date | null;
  kilometrageEntree?: number | string | null;
  pannesDeclarees?: string | null;
  observationsReception?: string | null;
  signatureDeposant?: string | null;
  diagnostic?: string | null;
  rapportDiagnostic?: { statut?: string | null } | null;
  devisAccepte?: boolean | null;
  devisVersions?: Array<{ statut?: string | null; version?: number | null }> | null;
  lignes?: OrLigneSnapshot[] | null;
  demandesPieces?: Array<{ statut?: string | null }> | null;
  pointages?: Array<{
    dureeHeures?: string | number | null;
    duree?: number | null;
    heureFin?: string | Date | null;
    enCours?: boolean | null;
  }> | null;
  controlesQualite?: Array<{
    resultat?: string | null;
    observations?: string | null;
    dateControle?: string | Date | null;
  }> | null;
  restitutions?: Array<{ dateRestitution?: string | Date | null }> | null;
  venteId?: number | null;
  totalFacture?: string | number | null;
  totalTTC?: string | number | null;
  dateCloture?: string | Date | null;
  dateFermeture?: string | Date | null;
}

// ── Helpers de lecture (tolérants aux données absentes) ──────────────────────
const texte = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
const nombre = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const aDate = (v: unknown): boolean => {
  if (!v) return false;
  return !Number.isNaN(new Date(v as string | Date).getTime());
};
// `ferme_definitif` est volontairement absent : une clôture forcée peut
// arriver sans que les étapes antérieures aient laissé une trace. On ne les
// déclare donc pas « terminées » par déduction.
const APRES_DIAGNOSTIC = new Set([
  "EN_ATTENTE_VALIDATION",
  "EN_ATTENTE_PIECES",
  "EN_COURS",
  "CONTROLE_QUALITE",
  "PRET_A_LIVRER",
  "LIVRE",
]);

const APRES_DEVIS = new Set([
  "EN_ATTENTE_PIECES",
  "EN_COURS",
  "CONTROLE_QUALITE",
  "PRET_A_LIVRER",
  "LIVRE",
]);

const APRES_TRAVAUX = new Set([
  "CONTROLE_QUALITE",
  "PRET_A_LIVRER",
  "LIVRE",
]);

const statutPrecedent = (s: OrStepSnapshot): string | null => {
  const entries = (s.historique ?? [])
    .filter((h) => h.type === "STATUT" && h.nouvelleValeur)
    .sort(
      (a, b) =>
        new Date(a.changeLe ?? 0).getTime() - new Date(b.changeLe ?? 0).getTime(),
    );

  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]?.nouvelleValeur === s.statut) {
      return entries[i]?.ancienneValeur ?? null;
    }
  }

  // Historique incomplet : on reprend le dernier statut connu hors états
  // terminaux, plutôt que de fabriquer une étape.
  const dernier = [...entries]
    .reverse()
    .find((e) => e.nouvelleValeur !== "BLOQUE" && e.nouvelleValeur !== "ANNULE");
  return dernier?.nouvelleValeur ?? null;
};

const etapeBloqueeParRaison = (raison: string | null | undefined): OrStepId | null => {
  const r = (raison ?? "").toLowerCase();
  if (!r) return null;
  if (/pi[eè]ce|stock|appro|rupture/.test(r)) return "pieces";
  if (/devis|autorisation|client|accord/.test(r)) return "devis";
  if (/diagnostic|expert/.test(r)) return "diagnostic";
  if (/qualit|contr[oô]le/.test(r)) return "qualite";
  if (/factur|paiement|r[eè]glement|cr[eé]ance/.test(r)) return "facture-restitution";
  if (/travaux|r[eé]paration|atelier|technicien/.test(r)) return "travaux";
  return null;
};

/**
 * Étape réellement courante.
 *
 * Pour BLOQUE / ANNULE, on ne déplace plus artificiellement l'étape vers
 * Pièces : on reprend le statut précédent enregistré dans l'historique. Si
 * l'historique manque, la raison de blocage donne un indice ; en dernier
 * recours seulement, on retombe sur Travaux.
 */
export function orCurrentStep(s: OrStepSnapshot | null | undefined): OrStepId {
  const snapshot = s ?? {};
  const statut = snapshot.statut ?? null;

  if (statut === "BLOQUE" || statut === "ANNULE") {
    const precedent = statutPrecedent(snapshot);
    const etape = orStepForStatus(precedent);
    if (etape) return etape;
    if (statut === "BLOQUE") {
      return etapeBloqueeParRaison(snapshot.raisonBlocage) ?? "travaux";
    }
    return OR_DEFAULT_TAB;
  }

  if (statut === "ferme_definitif") return "facture-restitution";
  return orStepForStatus(statut) ?? OR_DEFAULT_TAB;
}

const done = (label: string, detail?: string): OrStepStatus => ({
  state: "done",
  label,
  detail,
});
const todo = (label: string, detail?: string): OrStepStatus => ({
  state: "todo",
  label,
  detail,
});
const inProgress = (label: string, detail?: string): OrStepStatus => ({
  state: "in_progress",
  label,
  detail,
});
const waiting = (label: string, detail?: string): OrStepStatus => ({
  state: "waiting",
  label,
  detail,
});
const blocked = (label: string, detail?: string): OrStepStatus => ({
  state: "blocked",
  label,
  detail,
});
const notApplicable = (label: string, detail?: string): OrStepStatus => ({
  state: "not_applicable",
  label,
  detail,
});

// ── État de chaque étape ─────────────────────────────────────────────────────
function etatReception(s: OrStepSnapshot): OrStepStatus {
  const rapportStatut = s.rapportDiagnostic?.statut ?? null;
  if (rapportStatut === "SOUMIS" || rapportStatut === "VALIDE") {
    return done("Réception figée", "Le diagnostic a démarré : les données d'entrée sont verrouillées.");
  }

  const aDesDonnees =
    aDate(s.dateReception) ||
    s.kilometrageEntree != null ||
    texte(s.pannesDeclarees) ||
    texte(s.observationsReception) ||
    texte(s.signatureDeposant);

  if (aDesDonnees) {
    return done(
      "Réception enregistrée",
      s.statut === "EN_ATTENTE_DIAGNOSTIC"
        ? "Encore modifiable jusqu'à la soumission du diagnostic."
        : undefined,
    );
  }

  if (s.statut === "EN_ATTENTE_DIAGNOSTIC" || s.statut === "OUVERT") {
    return inProgress("Réception à compléter");
  }

  if (
    s.statut &&
    s.statut !== "ANNULE" &&
    s.statut !== "BLOQUE" &&
    s.statut !== "ferme_definitif"
  ) {
    return done("Réception enregistrée", "Trace de réception non détaillée.");
  }

  return todo("À réceptionner");
}

function etatDiagnostic(s: OrStepSnapshot): OrStepStatus {
  const rapportStatut = s.rapportDiagnostic?.statut ?? null;

  if (rapportStatut === "VALIDE") return done("Diagnostic validé");
  if (rapportStatut === "SOUMIS") return waiting("En attente de validation");
  if (rapportStatut === "BROUILLON" || rapportStatut === "RENVOYE") {
    return inProgress("Diagnostic en cours");
  }

  if (texte(s.diagnostic)) return done("Diagnostic saisi");
  if (s.statut === "EN_ATTENTE_VALIDATION_DIAGNOSTIC") return waiting("Rapport à valider");
  if (s.statut === "EN_ATTENTE_DIAGNOSTIC") return todo("À diagnostiquer");

  if (APRES_DIAGNOSTIC.has(s.statut ?? "")) {
    return done("Diagnostic", "Trace de diagnostic non détaillée.");
  }

  return todo("À diagnostiquer");
}

function etatDevis(s: OrStepSnapshot): OrStepStatus {
  if (s.devisAccepte) return done("Devis accepté");

  const latest = (s.devisVersions ?? [])[0] ?? null;
  if (latest?.statut) {
    switch (latest.statut) {
      case "BROUILLON":
        return inProgress("Devis en brouillon");
      case "ENVOYE":
        return waiting("Devis envoyé au client");
      case "AUTORISE_TOTAL":
        return done("Devis autorisé");
      case "AUTORISE_PARTIEL":
        return done("Autorisation partielle", "Une partie seulement des lignes est autorisée.");
      case "REFUSE":
        return blocked("Devis refusé", "Le client a refusé le devis.");
      default:
        break;
    }
  }

  const lignes = s.lignes ?? [];
  if (lignes.length === 0) {
    if (APRES_DEVIS.has(s.statut ?? "")) {
      return done("Devis", "Trace de devis non détaillée.");
    }
    if (s.statut === "EN_ATTENTE_VALIDATION") {
      return inProgress("Devis à préparer", "Aucune version de devis n'est encore créée.");
    }
    return todo("Aucun devis");
  }

  const autorisees = lignes.filter((l) => l.statutAutorisation === "AUTORISE");
  const declinees = lignes.filter((l) => l.statutAutorisation === "DECLINE");

  if (autorisees.length === lignes.length) return done("Devis autorisé");
  if (autorisees.length > 0) {
    return done(
      "Autorisation partielle",
      `${autorisees.length}/${lignes.length} ligne(s) autorisée(s).`,
    );
  }
  if (declinees.length === lignes.length) {
    return blocked("Devis refusé", "Toutes les lignes sont déclinées.");
  }
  if (s.statut === "EN_ATTENTE_VALIDATION") {
    return waiting("En attente d'autorisation");
  }
  return inProgress("Devis à préparer");
}

function etatPieces(s: OrStepSnapshot): OrStepStatus {
  const pieceLines = (s.lignes ?? []).filter((l) => l.type === "PIECE");
  const demandes = s.demandesPieces ?? [];

  const lignesBloquees = pieceLines.filter((l) => l.bloque);
  if (lignesBloquees.length > 0) {
    return blocked(
      "Pièce bloquée",
      lignesBloquees[0]?.raisonBlocageLigne ?? "Une ligne de pièce est bloquée.",
    );
  }

  const manquantes = demandes.filter((d) => d.statut === "MANQUANTE");
  if (manquantes.length > 0) {
    return blocked("Pièce manquante", `${manquantes.length} demande(s) en rupture.`);
  }

  const enAttente = demandes.filter(
    (d) => d.statut === "EN_ATTENTE" || d.statut === "PARTIELLE",
  );
  if (enAttente.length > 0) {
    return waiting("En attente de pièces", `${enAttente.length} demande(s) ouverte(s).`);
  }

  if (
    demandes.length > 0 &&
    demandes.every((d) => d.statut === "SERVIE" || d.statut === "ANNULEE")
  ) {
    return done("Pièces servies");
  }

  if (pieceLines.length === 0) return notApplicable("Aucune pièce");

  if (pieceLines.every((l) => l.statut === "fait" || l.statut === "valide")) {
    return done("Pièces posées");
  }
  if (pieceLines.some((l) => l.statut === "en_cours")) {
    return inProgress("Pièces en cours");
  }
  if (s.statut === "EN_ATTENTE_PIECES") return waiting("En attente de pièces");
  if (APRES_TRAVAUX.has(s.statut ?? "")) return done("Pièces disponibles");

  return todo("Aucune demande de pièces");
}

function etatTravaux(s: OrStepSnapshot): OrStepStatus {
  const lignes = s.lignes ?? [];
  const autorisees = lignes.filter((l) => l.statutAutorisation === "AUTORISE");
  const bloquees = autorisees.filter((l) => l.bloque);

  if (bloquees.length > 0) {
    return blocked(
      "Travaux bloqués",
      bloquees[0]?.raisonBlocageLigne ?? "Une ligne de travaux est bloquée.",
    );
  }

  if (autorisees.length === 0) {
    if (lignes.length === 0) {
      if (APRES_TRAVAUX.has(s.statut ?? "")) {
        return done("Travaux", "Trace de travaux non détaillée.");
      }
      return todo("Aucune ligne autorisée");
    }
    return waiting("En attente d'autorisation");
  }

  const faites = autorisees.filter(
    (l) => l.statut === "fait" || l.statut === "valide",
  );
  if (faites.length === autorisees.length) {
    return done(
      "Travaux terminés",
      `${faites.length}/${autorisees.length} ligne(s) terminée(s).`,
    );
  }

  const pointageActif = (s.pointages ?? []).some(
    (p) => p.enCours || p.heureFin != null || nombre(p.duree) > 0 || nombre(p.dureeHeures) > 0,
  );
  const ligneEnCours = autorisees.some((l) => l.statut === "en_cours");

  if (faites.length > 0 || pointageActif || ligneEnCours) {
    return inProgress(
      "Travaux en cours",
      `${faites.length}/${autorisees.length} ligne(s) terminée(s).`,
    );
  }

  return todo("Travaux à démarrer");
}

function etatQualite(s: OrStepSnapshot): OrStepStatus {
  const dernier = (s.controlesQualite ?? [])[0] ?? null;

  if (dernier?.resultat === "VALIDE") return done("Contrôle validé");
  if (dernier?.resultat === "REJETE") {
    return blocked(
      "Retour en travaux",
      dernier.observations?.trim() || "Le contrôle qualité a été rejeté.",
    );
  }

  if (s.statut === "CONTROLE_QUALITE") return inProgress("Contrôle à réaliser");
  if (s.statut === "PRET_A_LIVRER" || s.statut === "LIVRE") {
    return done("Contrôle validé", "Trace de contrôle non détaillée.");
  }

  return todo("À contrôler");
}

function etatFacture(s: OrStepSnapshot): OrStepStatus {
  const aVente = Boolean(s.venteId) || nombre(s.totalFacture) > 0;
  const aRestitution = (s.restitutions ?? []).length > 0;

  // `dateCloture` est la date de restitution / sortie (statut LIVRE), pas la
  // fermeture définitive. Seul `dateFermeture` (ou `ferme_definitif`) clôture
  // réellement le dossier.
  if (aDate(s.dateFermeture) || s.statut === "ferme_definitif") {
    return done("Dossier clôturé");
  }
  if (aVente && aRestitution) return done("Facturé et restitué");
  if (aVente) return inProgress("Facturé, restitution à faire");
  if (aRestitution) return inProgress("Restitué, facture à faire");
  if (s.statut === "PRET_A_LIVRER") return waiting("À facturer et restituer");
  if (s.statut === "LIVRE") return done("Livré");

  return todo("À facturer");
}

/** État réel des 7 étapes, calculé sur les données du dossier. */
export function orStepStates(
  s: OrStepSnapshot | null | undefined,
): Record<OrStepId, OrStepStatus> {
  const snapshot = s ?? {};
  const states: Record<OrStepId, OrStepStatus> = {
    reception: etatReception(snapshot),
    diagnostic: etatDiagnostic(snapshot),
    devis: etatDevis(snapshot),
    pieces: etatPieces(snapshot),
    travaux: etatTravaux(snapshot),
    qualite: etatQualite(snapshot),
    "facture-restitution": etatFacture(snapshot),
  };

  const current = orCurrentStep(snapshot);

  if (snapshot.statut === "BLOQUE") {
    states[current] = blocked(
      "Bloqué",
      snapshot.raisonBlocage?.trim() ||
        states[current].detail ||
        "Un blocage empêche la progression.",
    );
  }

  if (snapshot.statut === "ANNULE") {
    states[current] = blocked(
      "Cycle arrêté",
      "OR annulé : aucune progression n'est possible.",
    );
  }

  return states;
}

/** Indicateur global du cycle, distinct des états par étape. */
export function orCycleFlag(s: OrStepSnapshot | null | undefined): OrCycleFlag {
  const snapshot = s ?? {};
  if (snapshot.statut === "BLOQUE") return "bloque";
  if (snapshot.statut === "ANNULE") return "annule";
  if (snapshot.statut === "ferme_definitif" || aDate(snapshot.dateFermeture)) {
    return "cloture";
  }
  return "normal";
}

// ── Prochaine action cliquable ────────────────────────────────────────────────
export interface OrNextAction {
  label: string;
  tab: OrStepId;
  cta: string;
}

export function orNextAction(
  s: OrStepSnapshot | null | undefined,
): OrNextAction | null {
  const snapshot = s ?? {};
  const cycle = orCycleFlag(snapshot);
  if (cycle === "annule" || cycle === "cloture") return null;

  if (snapshot.statut === "BLOQUE") {
    return {
      label: snapshot.raisonBlocage?.trim()
        ? `OR bloqué : ${snapshot.raisonBlocage.trim()}.`
        : "OR bloqué : levez le blocage pour reprendre le cycle.",
      tab: orCurrentStep(snapshot),
      cta: "Ouvrir l'étape bloquée",
    };
  }

  switch (snapshot.statut) {
    case "EN_ATTENTE_DIAGNOSTIC":
      return {
        label: "Réaliser le diagnostic et soumettre le rapport pour validation.",
        tab: "diagnostic",
        cta: "Ouvrir le diagnostic",
      };
    case "EN_ATTENTE_VALIDATION_DIAGNOSTIC":
      return {
        label: "Valider (ou renvoyer) le diagnostic soumis par le technicien.",
        tab: "diagnostic",
        cta: "Valider le diagnostic",
      };
    case "EN_ATTENTE_VALIDATION":
      return {
        label: "Créer et envoyer une version de devis, puis recueillir l'autorisation ligne par ligne.",
        tab: "devis",
        cta: "Ouvrir le devis",
      };
    case "EN_ATTENTE_PIECES":
      return {
        label: "Traiter la demande de pièces : servir au magasin ou commander au fournisseur.",
        tab: "pieces",
        cta: "Traiter les pièces",
      };
    case "EN_COURS":
      return {
        label: "Démarrer les travaux, pointer le temps et renseigner les lignes main-d'œuvre.",
        tab: "travaux",
        cta: "Ouvrir les travaux",
      };
    case "CONTROLE_QUALITE":
      return {
        label: "Réaliser le contrôle qualité puis valider (ou renvoyer en travaux).",
        tab: "qualite",
        cta: "Contrôler le véhicule",
      };
    case "PRET_A_LIVRER":
      return {
        label: "Facturer l'intervention puis restituer le véhicule au client.",
        tab: "facture-restitution",
        cta: "Facturer / restituer",
      };
    case "LIVRE":
      return {
        label: "Véhicule restitué. Clôturer définitivement le dossier si applicable.",
        tab: "facture-restitution",
        cta: "Clôturer le dossier",
      };
    default:
      return null;
  }
}

// ── Permissions fines dérivées des permissions serveur réelles ────────────────
// Les permissions réellement présentes dans la matrice DB (role_permissions) sont :
//   or.consulter · or.creer · or.modifier · or.valider · or.facturer · or.pieces.servir
// On les dérive ici en flags fins par étape / action pour le guidage UI, SANS
// inventer de permission inexistante côté serveur (principe de sincérité).

export interface OrPermissionFlags {
  consult: boolean;
  creer: boolean;
  modifier: boolean;
  valider: boolean;
  facturer: boolean;
  servirPieces: boolean;
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
    // La réception est une écriture métier : le serveur exige `or.modifier`.
    canReception: modifier,
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

// ── Onglets accessibles et vue par rôle ───────────────────────────────────────
export interface OrTabDef {
  id: OrStepId;
  label: string;
  shortLabel: string;
  accessor: (p: OrPermissionFlags) => boolean;
}

export const OR_TABS: OrTabDef[] = OR_STEPS.map((s) => ({
  id: s.id,
  label: s.label,
  shortLabel: s.shortLabel,
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

export const OR_ROLE_LABELS: Record<string, string> = {
  superadmin: "Super administrateur",
  directeur: "Direction",
  admin: "Administration",
  chef_atelier: "Chef d'atelier",
  secretaire: "Secrétariat / accueil",
  magasinier: "Magasin",
  technicien: "Technicien",
  comptable: "Comptabilité",
  rh: "RH",
  consultation: "Consultation",
};

const TOUS_LES_ONGLETS: OrStepId[] = OR_STEPS.map((s) => s.id);

/**
 * Onglets prioritaires selon le rôle. Ce n'est PAS une permission : les
 * onglets restent filtrés par `OR_TABS`. C'est un focus de travail pour éviter
 * qu'un technicien ou un comptable voie les sept onglets par défaut.
 */
export const OR_ROLE_TABS: Record<string, OrStepId[]> = {
  superadmin: TOUS_LES_ONGLETS,
  directeur: TOUS_LES_ONGLETS,
  admin: TOUS_LES_ONGLETS,
  chef_atelier: TOUS_LES_ONGLETS,
  consultation: TOUS_LES_ONGLETS,
  rh: TOUS_LES_ONGLETS,
  secretaire: ["reception", "diagnostic", "devis", "facture-restitution"],
  technicien: ["diagnostic", "pieces", "travaux"],
  magasinier: ["pieces"],
  comptable: ["facture-restitution"],
};

/** Onglets prioritaires du rôle, restreints aux onglets réellement accessibles. */
export function orTabsForRole(
  role: string | null | undefined,
  accessibleTabs: OrStepId[],
): OrStepId[] {
  const focus = OR_ROLE_TABS[role ?? ""] ?? TOUS_LES_ONGLETS;
  const set = new Set(focus);
  return accessibleTabs.filter((id) => set.has(id));
}

/**
 * Onglet d'atterrissage d'une vue rôle.
 *
 * On garde l'étape du statut si elle fait partie du focus du rôle. Sinon, on
 * prend la dernière étape du rôle déjà atteinte (un technicien sur un OR prêt à
 * livrer atterrit sur Travaux, pas sur Diagnostic). À défaut, la première.
 */
export function orRoleDefaultTab(
  statusTab: OrStepId,
  roleTabs: OrStepId[],
): OrStepId {
  if (roleTabs.length === 0) return statusTab;
  if (roleTabs.includes(statusTab)) return statusTab;

  const statusIdx = OR_STEPS.findIndex((s) => s.id === statusTab);
  const atteintes = roleTabs.filter(
    (id) => OR_STEPS.findIndex((s) => s.id === id) <= statusIdx,
  );
  return atteintes[atteintes.length - 1] ?? roleTabs[0] ?? statusTab;
}

export { transitionStatutAtelierValide };
