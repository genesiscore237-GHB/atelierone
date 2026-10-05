/**
 * R6 — Cycle de vie RH : moteur des situations (conception V2 §11-§16, §20, §23).
 * Extract — AUCUN accès DB : fonctions pures, testables unitairement (obligatoire §30).
 * Source de vérité temporelle : `date_effet` (défaut = date_debut). Jamais le seul `statut`.
 */

export const STATUT_ADMIN = ["actif", "suspendu", "sorti", "archive"] as const;
export type StatutAdmin = (typeof STATUT_ADMIN)[number];

export const WORKFLOW_ETATS = [
  "BROUILLON",
  "SOUMIS",
  "EN_ATTENTE",
  "APPROUVE",
  "REFUSE",
  "ACTIF",
  "TERMINE",
  "ANNULE",
] as const;
export type WorkflowEtat = (typeof WORKFLOW_ETATS)[number];

export const IMPACTS_CONTRAT = ["ACTIVE", "SUSPENDU", "TERMINE"] as const;
export const IMPACTS_PRESENCE = ["POINTAGE_AUTORISE", "POINTAGE_INTERDIT", "PRESENCE", "ABSENCE", "CONGE", "SUSPENSION", "NON_COMPTABLE"] as const;
export const IMPACTS_PLANNING = ["PLANIFIE", "NON_PLANIFIABLE", "ABSENT", "BLOQUE", "AUTRE"] as const;
export const IMPACTS_PAIE = [
  "NORMAL",
  "MAINTIEN_REMUNERATION",
  "RETENUE",
  "NON_REMUNERE",
  "PARTIEL",
  "INDEMNISATION_EXTERNE",
  "A_DETERMINER",
  "MANUEL",
] as const;
export const MODES_CALCUL_PAIE = ["PRORATA_JOURS", "PRORATA_HEURES", "FIXE", "SANS"] as const;

export const SITUATION_CATEGORIES = [
  "ABSENCE",
  "CONGE",
  "MALADIE",
  "ACCIDENT_TRAVAIL",
  "MATERNITE",
  "DISCIPLINAIRE",
  "SUSPENSION",
  "SORTIE",
  "AUTRE",
] as const;

/** État runtime qui produit des effets : ACTIF (approbation + dates, §12 ; ABSENCE saisie immédiate). */
export const STATUTS_EFFECTIFS = ["ACTIF"] as const;

export interface SituationLike {
  id?: number | null;
  category: string;
  type: string;
  subType?: string | null;
  dateDebut: string; // YYYY-MM-DD
  dateFin?: string | null; // NULL = ouverte
  dateEffet?: string | null; // défaut = dateDebut
  dureeJours?: number | null;
  impactContrat: string;
  impactPresence: string;
  impactPlanning: string;
  impactPaie: string;
  modeCalculPaie?: string | null;
  validationRequise?: boolean;
  statutWorkflow?: string | null;
  notificationEcrite?: boolean;
  communicationInspection?: boolean;
  montantRetenue?: number | string | null;
  anomalie?: string | null;
}

/** Veille d'une date ISO (YYYY-MM-DD). */
export function veilleDe(iso: string): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lendemain d'une date ISO (YYYY-MM-DD). */
export function lendemainDe(iso: string): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Date d'effet effective d'une situation (source de vérité temporelle §13). */
export function effet(s: SituationLike): string {
  return s.dateEffet && s.dateEffet >= s.dateDebut ? s.dateEffet.slice(0, 10) : s.dateDebut.slice(0, 10);
}

/** Une situation (ACTIF) couvre-t-elle une date ? Range bornes incluses, dateFin NULL = ouverte. */
export function couvre(s: SituationLike, date: string): boolean {
  if (s.statutWorkflow && !STATUTS_EFFECTIFS.includes(s.statutWorkflow as any)) return false;
  const eff = effet(s);
  if (date < eff) return false;
  if (s.dateFin) return date <= s.dateFin.slice(0, 10);
  return true;
}

/** Situations ACTIF couvrant une date (triées par date d'effet puis id). */
export function situationsActivesEnDate(situations: SituationLike[], date: string): SituationLike[] {
  return situations
    .filter((s) => couvre(s, date))
    .sort((a, b) => (effet(a) < effet(b) ? -1 : effet(a) > effet(b) ? 1 : (a.id ?? 0) - (b.id ?? 0)));
}

export interface StatutAdministratif {
  statut: StatutAdmin;
  /** Situation à l'origine d'un statut `suspendu` dérivé (D-R6-01). */
  situationDerivante?: SituationLike | null;
}

/**
 * D-R6-01 §3 : statut administratif = {actif, suspendu, sorti, archive}.
 *  - `suspendu` est DÉRIVÉ : une situation ACTIF à impact_contrat = SUSPENDU couvre la date.
 *  - `sorti` / `archive` sont terminaux (posés par transitions dédiées).
 *  - `conge` (legacy) n'est plus produit : un employé en congé reste `actif`.
 */
export function statutAdministratif(opts: {
  statutCourant: string | null | undefined;
  situations: SituationLike[];
  date: string;
}): StatutAdministratif {
  const courant = opts.statutCourant ?? "actif";
  if (courant === "sorti" || courant === "archive") return { statut: courant };
  const derivate = situationsActivesEnDate(opts.situations, opts.date).find((s) => s.impactContrat === "SUSPENDU");
  if (derivate) return { statut: "suspendu", situationDerivante: derivate };
  return { statut: "actif" };
}

/** En congé à une date : situation ACTIF catégorie CONGE couvrant la date (rh-stats-engine). */
export function enCongeEnDate(situations: SituationLike[], date: string): boolean {
  return situationsActivesEnDate(situations, date).some((s) => s.category === "CONGE");
}

/** En suspension (contrat suspendu) à une date. */
export function enSuspensionEnDate(situations: SituationLike[], date: string): boolean {
  return situationsActivesEnDate(situations, date).some((s) => s.impactContrat === "SUSPENDU");
}

/* ─── Conflits (§14 : REFUS / PRIORITE / ANOMALIE, jamais de résolution silencieuse) ─── */

export interface Conflit {
  type: "REFUS" | "PRIORITE" | "ANOMALIE";
  code: string;
  message: string;
}

/** Intervalle [debut, fin] (fin NULL = +∞). */
function chevauche(a: { debut: string; fin?: string | null }, b: { debut: string; fin?: string | null }): boolean {
  if (a.fin && b.debut && a.fin < b.debut) return false;
  if (b.fin && a.debut && b.fin < a.debut) return false;
  return true;
}

/** Paire d'impacts paie compatible sur un même intervalle (ex. maladie + complément POL). */
export function impactsPaieCompatibles(a: string, b: string): boolean {
  if (a === "NORMAL" || b === "NORMAL") return true;
  if (a === b) return false;
  const complementaires = new Set([
    "MAINTIEN_REMUNERATION+INDEMNISATION_EXTERNE",
    "INDEMNISATION_EXTERNE+MAINTIEN_REMUNERATION",
  ]);
  return complementaires.has(`${a}+${b}`);
}

/**
 * Détection des conflits entre une situation candidate et l'existant (tous états
 * ACTIF/APPROUVE confondus pour la détection de chevauchement).
 */
export function conflits(opts: { candidate: SituationLike; existantes: SituationLike[] }): Conflit[] {
  const { candidate, existantes } = opts;
  const out: Conflit[] = [];
  const cand = { debut: effet(candidate), fin: candidate.dateFin ?? null };
  const candContratSuspensif = candidate.impactContrat === "SUSPENDU";
  const candConge = candidate.category === "CONGE";
  const candDisciplinaire = candidate.category === "DISCIPLINAIRE";
  const candSuspension = candidate.category === "SUSPENSION" || candDisciplinaire;
  const candSortie = candidate.category === "SORTIE";

  for (const e of existantes) {
    const debitEffectif = effet(e);
    if (!chevauche(cand, { debut: debitEffectif, fin: e.dateFin ?? null })) continue;

    const estExistante = Boolean(e.statutWorkflow && e.statutWorkflow !== "REFUSE" && e.statutWorkflow !== "ANNULE" && e.statutWorkflow !== "TERMINE");

    // MAP + congé → REFUS (chevauchement d'intervalles d'impact)
    if (estExistante && candDisciplinaire && e.category === "CONGE") {
      out.push({ type: "REFUS", code: "MAP_CONGE", message: "Une mise à pied ne peut pas chevaucher un congé approuvé sur le même intervalle." });
      continue;
    }
    if (estExistante && candConge && e.category === "DISCIPLINAIRE") {
      out.push({ type: "REFUS", code: "CONGE_MAP", message: "Un congé ne peut pas chevaucher une mise à pied sur le même intervalle." });
      continue;
    }
    // Sortie prioritaire : clôt les situations temporaires, ne provoque pas de refus
    if (estExistante && candSortie && (e.impactContrat === "SUSPENDU" || e.impactContrat === "TERMINE" || e.category === "DISCIPLINAIRE")) {
      out.push({ type: "PRIORITE", code: "SORTIE_PRIORITAIRE", message: "La sortie est prioritaire : la situation en cours sera close à la date de sortie." });
      continue;
    }
    // Deux situations suspensives (contrat SUSPENDU) simultanées → REFUS
    if (estExistante && candContratSuspensif && e.impactContrat === "SUSPENDU") {
      out.push({ type: "REFUS", code: "SUSPENSION_DOUBLE", message: "Deux situations suspensives ne peuvent pas se chevaucher (contrat déjà suspendu sur cet intervalle)." });
      continue;
    }
    // Deux impacts paie incompatibles sur le même intervalle → REFUS (ou ANOMALIE si déjà posé)
    if (estExistante && !impactsPaieCompatibles(e.impactPaie, candidate.impactPaie)) {
      out.push({
        type: e.anomalie ? "ANOMALIE" : "REFUS",
        code: "IMPACT_PAIE_INCOMPATIBLE",
        message: `Impacts paie incompatibles sur le même intervalle : « ${e.impactPaie} » vs « ${candidate.impactPaie} ».`,
      });
      continue;
    }
    // Suspicieux : doublon de même catégorie/type sur le même intervalle
    if (estExistante && e.category === candidate.category && e.type === candidate.type) {
      out.push({ type: "ANOMALIE", code: "DOUBLON_TYPE", message: `Une situation « ${e.type} » existe déjà sur la même période.` });
    }
  }
  return out;
}

/* ─── Garde-fous mise à pied (art. 30, D-R6-03, §5) ─── */

export interface GardeFousMap {
  dureeMaxJours?: number | null;
  notificationEcriteRequise?: boolean;
  communicationInspectionRequise?: boolean;
}

/** Retourne les violations dures (art. 30) d'une mise à pied. Vide = conforme. */
export function verifierGardeFousMap(situation: SituationLike, type?: GardeFousMap | null): string[] {
  const viols: string[] = [];
  const max = type?.dureeMaxJours ?? 8;
  if (situation.dureeJours != null) {
    const dur = Number(situation.dureeJours);
    if (!Number.isFinite(dur) || dur <= 0) viols.push("La durée de mise à pied doit être un nombre de jours positif.");
    // art. 30-3-a : ≤ 8 jours ouvrables, fixée au prononcé
    if (dur > max) viols.push(`Mise à pied de ${dur} jours : supérieure au maximum légal de ${max} jours ouvrables (art. 30).`);
  }
  // art. 30-3-b : notification écrite avec motifs obligatoire
  if ((type?.notificationEcriteRequise ?? false) && !situation.notificationEcrite) {
    viols.push("Notification écrite obligatoire avant activation (art. 30-3-b).");
  }
  // art. 30-3-c : communication à l'inspection du travail dans les 48 h
  if ((type?.communicationInspectionRequise ?? false) && !situation.communicationInspection) {
    viols.push("Communication à l'inspection du travail obligatoire (art. 30-3-c, 48 h).");
  }
  // art. 30-1 : interdiction des amendes — une retenue négative n'a aucun sens
  if (situation.montantRetenue != null) {
    const montant = Number(situation.montantRetenue);
    if (Number.isFinite(montant) && montant < 0) {
      viols.push("Interdiction des amendes (art. 30-1) : une retenue ne peut pas être négative.");
    }
  }
  return viols;
}

/* ─── R6 fournit les événements, R4 calcule (D-R6-17, §20, §22) ─── */

export type RegimePaie = "aucun" | "partiel" | "total";

export interface RegimeSituationPeriode {
  regime: RegimePaie;
  impactPaie: string;
  modeCalcul?: string | null;
  /** Effet de la situation dominante (prorata avant cette date si `partiel`). */
  dateDebut?: string | null;
  /** NULL : situation ouverte (couvre la fin de période). */
  dateFin?: string | null;
  validationRequise?: boolean;
  anomalie?: string | null;
  situationId?: number | null;
  /** A_DETERMINER non tranché : bloquant à la clôture. */
  doitBloquerCloture?: boolean;
}

const POIDS_IMPACT: Record<string, number> = {
  NORMAL: 0,
  MAINTIEN_REMUNERATION: 1,
  PARTIEL: 1,
  MANUEL: 2,
  INDEMNISATION_EXTERNE: 3,
  RETENUE: 4,
  NON_REMUNERE: 5,
  A_DETERMINER: 6,
};

/**
 * Régime de paie d'un employé sur une période, projeté depuis les situations ACTIF
 * (remplace le binaire `statut="suspendu"` + `suspensionStart` des phases précédentes).
 *  - `aucun`  : aucune situation à effet paie sur la période → paie normale.
 *  - `partiel`: situation à effet commençant en cours de période → prorata avant.
 *  - `total`  : situation couvrant toute la période (ou sans fin) → politique totale
 *               de l'impact (ex. aucune rémunération, retenue, prestation externe…).
 */
export function regimeSituationPeriode(opts: {
  situations: SituationLike[];
  debutPeriode: string;
  finPeriode: string;
}): RegimeSituationPeriode {
  const { situations, debutPeriode, finPeriode } = opts;
  const pertinentes = situations.filter((s) => {
    if (!couvreComptabilite(s, debutPeriode, finPeriode)) return false;
    return (POIDS_IMPACT[s.impactPaie ?? "NORMAL"] ?? 0) > 0 || s.impactContrat === "SUSPENDU";
  });
  if (pertinentes.length === 0) return { regime: "aucun", impactPaie: "NORMAL" };

  const dominante = pertinentes
    .slice()
    .sort((a, b) => (POIDS_IMPACT[b.impactPaie ?? "NORMAL"] ?? 0) - (POIDS_IMPACT[a.impactPaie ?? "NORMAL"] ?? 0))[0];

  const dateEff = effet(dominante);
  const regime: RegimePaie = dateEff <= debutPeriode ? "total" : "partiel";
  return {
    regime,
    impactPaie: dominante.impactPaie,
    modeCalcul: dominante.modeCalculPaie ?? null,
    dateDebut: dateEff,
    dateFin: dominante.dateFin ?? null,
    validationRequise: dominante.validationRequise,
    anomalie: dominante.anomalie ?? null,
    situationId: dominante.id ?? null,
    doitBloquerCloture: dominante.impactPaie === "A_DETERMINER" && (dominante.validationRequise ?? true),
  };
}

function couvreComptabilite(s: SituationLike, debutPeriode: string, finPeriode: string): boolean {
  if (s.statutWorkflow && !STATUTS_EFFECTIFS.includes(s.statutWorkflow as any)) return false;
  const eff = effet(s);
  if (eff > finPeriode) return false;
  if (s.dateFin && s.dateFin < debutPeriode) return false;
  return true;
}

/* ─── Timeline / segmentation (§13, §27) ─── */

export interface EvenementTimeline {
  dateEffet: string;
  category: string;
  type: string;
  dateDebut: string;
  dateFin: string | null;
  impactContrat: string;
  impactPaie: string;
  situationId?: number | null;
}

/** Événements datés d'un employé, triés par date d'effet (frise §27). */
export function timelineEvenements(situations: SituationLike[]): EvenementTimeline[] {
  return situations
    .filter((s) => s.statutWorkflow && s.statutWorkflow !== "REFUSE" && s.statutWorkflow !== "ANNULE")
    .map((s) => ({
      dateEffet: effet(s),
      category: s.category,
      type: s.type,
      dateDebut: s.dateDebut,
      dateFin: s.dateFin ?? null,
      impactContrat: s.impactContrat,
      impactPaie: s.impactPaie,
      situationId: s.id ?? null,
    }))
    .sort((a, b) => (a.dateEffet < b.dateEffet ? -1 : a.dateEffet > b.dateEffet ? 1 : 0));
}

/* ─── Pont de lecture : congés (rh-leave) → situation CONGE (provenance leave_requests) ─── */

export interface MapperCongee {
  category: string;
  type: string;
}

/** Mappe un code de type de congé (hr_leave_types.code) vers une situation du catalogue. */
export function mapperTypeCongeeVersSituation(code: string | null | undefined): MapperCongee {
  switch (code) {
    case "CONGE_ANNUEL":
      return { category: "CONGE", type: "CONGE_ANNUEL" };
    case "SANS_SOLDE":
      return { category: "CONGE", type: "CONGE_SANS_SOLDE" };
    case "MALADIE":
      return { category: "MALADIE", type: "MALADIE" };
    case "MATERNITE":
      return { category: "MATERNITE", type: "MATERNITE" };
    case "PERMISSION":
      return { category: "ABSENCE", type: "PERMISSION_EXCEPTIONNELLE" };
    case "FORMATION":
      return { category: "CONGE", type: "CONGE_FORMATION" };
    default:
      return { category: "AUTRE", type: "AUTRE" };
  }
}