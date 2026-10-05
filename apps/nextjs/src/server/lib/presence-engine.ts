/**
 * RH-02 — MOTEUR DE CALCUL DES PRÉSENCES (pur, sans DB).
 *
 * Logique conforme aux specs MVP (Gestion_Personnel_GPJ.xlsx — 02_Pointage) :
 *  1. Arrivée avant l'heure de début → considérée à l'heure, SAUF si le
 *     flag « valider arrivée anticipée » (ligne) ou le paramètre
 *     « compter les arrivées anticipées » (global) est activé.
 *  2. Départ après l'heure de fin → considéré à l'heure, SAUF si le flag
 *     « valider départ tardif » (ligne) ou le paramètre global est activé.
 *  3. Arrivée en retard → les minutes de retard sont déduites du temps
 *     de travail (la journée démarre à l'heure réelle) + indicateur.
 *  4. Départ anticipé → les minutes manquantes sont déduites + indicateur.
 *  5. Calculs d'abord en minutes, puis conversion en heures décimales.
 *  6. Pause réglementaire déduite si la présence couvre la plage complète.
 *  Heures normales = MIN(heures travaillées, seuil HS du jour).
 *  Heures supp.    = MAX(0, heures travaillées − seuil HS).
 *  Code présence : A (absent) | HS (journée avec HS) | R (retard) | P (présent).
 *
 *  RÈGLE HS (CDC 02_Presences §2.3 — « règle HS non négociable ») :
 *  Les minutes au-delà de l'heure de fin ne sont comptabilisées en HS QUE SI
 *  une autorisation approuvée existe pour ce jour. Sinon elles sont ignorées.
 *  - autorisation approuvée → HS = MIN(HS potentielles, plafond autorisé)
 *  - autorisation refusée ou absente → HS = 0.
 *
 *  RETARD CONSTATÉ vs RETARD DÉDUCTIBLE :
 *  - Retard constaté = minutes brutes au-delà de l'heure de début + tolérance
 *  - Retard déductible = application de la règle paramétrable (taux horaire, journalier, forfait/minute, etc.)
 *  - L'impact financier est calculé séparément et ne modifie pas le temps de présence.
 */

export type AbsenceType =
  | "JUSTIFIEE_REMUNEREE"
  | "JUSTIFIEE_NON_REMUNEREE"
  | "INJUSTIFIEE"
  | "CONGE"
  | "MALADIE"
  | "MISSION"
  | "FORMATION";

import type { PayMode } from "~/server/lib/payroll-engine";

export type PresenceStatus =
  | "PRESENT"
  | "ABSENCE_JUSTIFIEE"
  | "ABSENCE_INJUSTIFIEE"
  | "CONGE"
  | "MALADIE"
  | "MISSION"
  | "FORMATION"
  | "NON_POINTÉ"
  | "JOUR_INCOMPLET"
  | "HORS_PERIODE_EMPLOI";

export interface DaySchedule {
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  expectedHours: string | null;
  overtimeThreshold: string | null;
  isWorkingDay: boolean;
}

export interface PresenceSettings {
  lateToleranceMinutes: number | null;
  roundToMinutes: number | null;
  autoDeductBreak: boolean | null;
  countEarlyArrival: boolean | null;
  countLateDeparture: boolean | null;
  autoDeductLate: boolean | null;
  autoDeductEarlyDeparture: boolean | null;
  maxNormalHoursPerDay: string | null;
  defaultOvertimeThreshold?: string | null;
  /**
   * Seuil MÉTIER de classement d'un retard (RPT-02 §7 B). Volontairement sans
   * colonne en base : aucune valeur n'est paramétrée, donc aucun comportement
   * n'est inventé. `null`/absent => 0, c'est-à-dire « tout écart au-delà de la
   * tolérance technique est un retard » (règle historique).
   */
  businessLateThresholdMinutes?: number | null;
}

export interface LateDeductionRule {
  method: "TAUX_HORAIRE" | "TAUX_JOURNALIER" | "POURCENTAGE_SALAIRE" | "FORFAIT_MINUTE" | "AUTRE";
  params: {
    tauxHoraire?: number;
    tauxJournalier?: number;
    pourcentage?: number;
    forfaitParMinute?: number;
    regleInterne?: string;
  };
}

export interface OvertimeAuthInput {
  maxHours: string | number | null;
  status: string | null;
}

export interface CalcInput {
  timeIn: string | null;
  timeOut: string | null;
  timeInBreak?: string | null;
  timeOutBreak?: string | null;
  schedule: DaySchedule | null;
  settings: PresenceSettings;
  overtimeAuth: OvertimeAuthInput | null;
  isPublicHoliday?: boolean;
  validateEarlyArrival?: boolean;
  validateLateDeparture?: boolean;
  /** Type d'absence si le jour n'est pas travaillé normalement */
  absenceType?: AbsenceType | null;
  /** Salaire de base pour calcul impact financier absence/retard */
  baseSalary?: number | null;
  /** Jours ouvrables du mois pour calcul taux journalier */
  workingDaysInMonth?: number | null;
  /** Règle de retenue retard (si fournie, calcule retard déductible) */
  lateDeductionRule?: LateDeductionRule | null;
  /** Mode de rémunération pour calculs spécifiques */
  modePaie?: PayMode | null;
  /** Forfait hebdomadaire applicable (si mode FORFAIT_HEBDOMADAIRE) */
  forfaitHebdomadaire?: number | null;
  /** Entrées supplémentaires pour calculs (hors période d'emploi, etc.) */
  details?: Record<string, unknown>;
}

export interface CalcResult {
  rawMinutes: number;
  breakMinutes: number;
  workedMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number; // retard CONSTATÉ (après tolérance technique)
  lateBusinessMinutes: number; // retard CLASSÉ (après seuil métier) — RPT-02 §7 B
  isLate: boolean; // retard classé comme retard ? (base du code "R")
  lateDeductibleMinutes: number; // retard DÉDUCTIBLE (après règle)
  lateDeductionAmount: number; // impact financier du retard
  earlyDepartureMinutes: number;
  isAbsent: boolean;
  codePresence: "A" | "HS" | "R" | "P" | "C" | "M" | "F" | "O"; // A=absent, HS=heures sup, R=retard, P=présent, C=congé, M=maladie, F=formation, O=mission
  absenceFinancialImpact: number; // impact salarial de l'absence
  details: Record<string, unknown>;
}

export function toMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Intervalle de référence d'un mois : [debut, finExclusive[ — le 1er du mois suivant est EXCLU (P05). */
export function intervalleMois(year: number, month: number): { debut: string; finExclusive: string } {
  const debut = `${year}-${String(month).padStart(2, "0")}-01`;
  const annee = month === 12 ? year + 1 : year;
  const mois = month === 12 ? 1 : month + 1;
  const finExclusive = `${annee}-${String(mois).padStart(2, "0")}-01`;
  return { debut, finExclusive };
}

function roundMinutes(value: number, roundTo: number | null): number {
  if (!roundTo || roundTo <= 0) return value;
  return Math.round(value / roundTo) * roundTo;
}

function overlapMinutes(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

const AUTH_APPROVED = new Set(["approuvee", "approved", "validee", "valide"]);
const AUTH_REJECTED = new Set(["refusee", "rejected", "refuse"]);

/**
 * RPT-02 §7 — LES DEUX RÉGLAGES DE RETARD, JAMAIS CONFONDUS.
 *
 * A. `technicalToleranceMinutes` — issu de `hr_attendance_settings.late_tolerance_minutes`.
 *    Tolérance TECHNIQUE de pointage : battement d'ouverture du badge. Elle est
 *    SOUSTRAITE avant de constater le retard. Arriver 10 min après l'heure
 *   planned avec 15 min de tolérance ne produit aucun retard.
 *
 * B. `businessThresholdMinutes` — seuil MÉTIER de classement. Il est soustrait du
 *    retard constaté pour décider si l'écart devient un "retard" classé.
 *    0 = tout écart est un retard. Non paramétré en base à ce jour : on
 *    n'introduit pas de seuil sans preuve de la règle retenue.
 *
 * Invariant de compatibilité : avec `businessThresholdMinutes = 0`,
 * `lateBusinessMinutes === lateMinutes` et `isLate === (lateMinutes > 0)`,
 * donc `lateMinutes` et `codePresence === "R"` restent inchangés.
 */
export interface LatenessPolicy {
  /** A. Tolérance technique de pointage (minutes). */
  technicalToleranceMinutes: number;
  /** B. Seuil métier de classement (minutes). */
  businessThresholdMinutes: number;
}

/** Tolérance technique par défaut : stricte (historique agence 1). */
export const TOLERANCE_TECHNIQUE_DEFAUT = 0;
/** Seuil métier par défaut : aucun (tout écart constaté est classé). */
export const SEUIL_BUSINESS_DEFAUT = 0;

export function latenessPolicy(settings: PresenceSettings): LatenessPolicy {
  const t = Number(settings.lateToleranceMinutes ?? TOLERANCE_TECHNIQUE_DEFAUT);
  const b = Number(settings.businessLateThresholdMinutes ?? SEUIL_BUSINESS_DEFAUT);
  return {
    technicalToleranceMinutes: Number.isFinite(t) && t >= 0 ? t : TOLERANCE_TECHNIQUE_DEFAUT,
    businessThresholdMinutes: Number.isFinite(b) && b >= 0 ? b : SEUIL_BUSINESS_DEFAUT,
  };
}

export interface RetardClasse {
  /** Heure théorique de début, en minutes depuis minuit. */
  heureTheoriqueMin: number | null;
  /** Heure d'arrivée réelle, en minutes depuis minuit. */
  heureArriveeMin: number | null;
  /** A. Tolérance technique appliquée avant constat. */
  toleranceTechniqueMin: number;
  /** B. Seuil métier appliqué pour le classement. */
  seuilBusinessMin: number;
  /** Retard CONSTATÉ = arrivée − théorique − tolérance. */
  retardConstateMin: number;
  /** Retard CLASSÉ = constat − seuil métier. */
  retardClasseMin: number;
  /** Le retard est-il classed comme retard ? */
  classe: boolean;
}

/**
 * Calcule le retard en distinguant les deux réglages. Fonction PURE : c'est
 * elle qui doit être réutilisée par les rapports pour expliquer un retard.
 */
export function analyserRetard(
  heureTheorique: string | number | null,
  heureArrivee: string | number | null,
  policy: LatenessPolicy
): RetardClasse {
  const toMin = (v: string | number | null): number | null => {
    if (v === null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    return toMinutes(v);
  };
  const theo = toMin(heureTheorique);
  const arr = toMin(heureArrivee);
  const tolerance = policy.technicalToleranceMinutes;
  const seuil = policy.businessThresholdMinutes;
  if (theo === null || arr === null) {
    return {
      heureTheoriqueMin: theo,
      heureArriveeMin: arr,
      toleranceTechniqueMin: tolerance,
      seuilBusinessMin: seuil,
      retardConstateMin: 0,
      retardClasseMin: 0,
      classe: false,
    };
  }
  const retardConstateMin = Math.max(0, arr - theo - tolerance);
  const retardClasseMin = Math.max(0, retardConstateMin - seuil);
  return {
    heureTheoriqueMin: theo,
    heureArriveeMin: arr,
    toleranceTechniqueMin: tolerance,
    seuilBusinessMin: seuil,
    retardConstateMin,
    retardClasseMin,
    classe: retardClasseMin > 0,
  };
}

/** Seuil HS du jour : overtimeThreshold du cycle → plafond normal → heures attendues → paramètre global → défaut 9,5h */
export function dayThreshold(schedule: DaySchedule | null, settings: PresenceSettings): number {
  const raw =
    schedule?.overtimeThreshold ??
    settings.maxNormalHoursPerDay ??
    schedule?.expectedHours ??
    settings.defaultOvertimeThreshold ??
    "9.5";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n * 60 : 570;
}

/**
 * RPT-03 §9 — MODE D'IMPACT.
 *
 * `RETENUE_PAIE` : comportement historique, verrouillé par la non-régression R4.
 *                  Ces montants sont soustraits de `netImposable` / `netPay`.
 * `TAUX_HORAIRE_SENSIBILISATION` : ESTIMATION. Aucun montant n'est retenu, aucun
 *                  montant n'est persisté dans `attendance_calculations`.
 *
 * La séparation est portée par le TYPE DE RETOURNE, pas par une convention :
 * une retenue vit dans `retenueReelle` / `deductionAmount`, une estimation dans
 * `estimationMontant`. Les additionner par erreur exigerait de l'écrire.
 */
export type ModeImpact = "RETENUE_PAIE" | "TAUX_HORAIRE_SENSIBILISATION";

export interface OptionsSensibilisation {
  mode?: ModeImpact;
  /** RPT-03 §3 : heures théoriques non faites imputables à l'absence. */
  heuresSensibilisation?: number | null;
  /** RPT-03 §8 : taux horaire du segment salarial applicable. */
  tauxHoraireSensibilisation?: number | null;
}

export interface ResultatImpactAbsence {
  /** Retenue RÉELLE de paie. Non nulle que si une règle de paie l'exige. */
  retenueReelle: number;
  /** Montant ESTIMÉ de sensibilisation. `null` = non calculable (données absentes). */
  estimationMontant: number | null;
  /** Heures ayant servi à l'estimation (traçabilité). */
  heuresEstimees: number;
  mode: ModeImpact;
}

export interface ResultatImpactRetard {
  /** Minutes DÉDUITES de la paie (0 en sensibilisation, par construction). */
  deductibleMinutes: number;
  /** Montant RETENU de la paie (0 en sensibilisation, par construction). */
  deductionAmount: number;
  /** Heures de retard ESTIMÉES (retard réel / 60, §5). */
  estimationHeures: number | null;
  /** Montant ESTIMÉ de sensibilisation. `null` = non calculable. */
  estimationMontant: number | null;
}

/** RPT-03 §28 : une valeur nulle, négative, NaN ou infinie n'est jamais propagée. */
function valeurSaine(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Calcule le retard déductible et son impact financier selon la règle paramétrée */
function calculateLateDeductionBase(
  lateMinutes: number,
  rule: LateDeductionRule | null | undefined,
  baseSalary: number | null | undefined,
  workingDaysInMonth: number | null | undefined
): { deductibleMinutes: number; deductionAmount: number } {
  if (!rule || lateMinutes <= 0) return { deductibleMinutes: 0, deductionAmount: 0 };

  const { method, params } = rule;

  switch (method) {
    case "TAUX_HORAIRE": {
      const taux = params.tauxHoraire ?? (baseSalary && workingDaysInMonth ? baseSalary / (workingDaysInMonth * 8) : 0);
      return { deductibleMinutes: lateMinutes, deductionAmount: (lateMinutes / 60) * taux };
    }
    case "TAUX_JOURNALIER": {
      const taux = params.tauxJournalier ?? (baseSalary && workingDaysInMonth ? baseSalary / workingDaysInMonth : 0);
      const joursRetard = lateMinutes / (workingDaysInMonth ? 8 * 60 : 480); // approximation
      return { deductibleMinutes: lateMinutes, deductionAmount: joursRetard * taux };
    }
    case "POURCENTAGE_SALAIRE": {
      const pct = params.pourcentage ?? 0;
      const amount = baseSalary ? (baseSalary * pct) / 100 : 0;
      return { deductibleMinutes: lateMinutes, deductionAmount: amount };
    }
    case "FORFAIT_MINUTE": {
      const forfait = params.forfaitParMinute ?? 0;
      return { deductibleMinutes: lateMinutes, deductionAmount: lateMinutes * forfait };
    }
    case "AUTRE": {
      // Règle interne personnalisée - à implémenter selon besoin
      return { deductibleMinutes: lateMinutes, deductionAmount: 0 };
    }
    default:
      return { deductibleMinutes: 0, deductionAmount: 0 };
  }
}

/**
 * RPT-03 §9/§33 — Impact d'une absence, dans l'un des DEUX modes.
 *
 * `RETENUE_PAIE` (défaut, inchangé) : l'impact de paie est nul pour toute
 * absence rémunérée, le salaire étant maintenu. Ce « zéro » est un contrat R4 :
 * il ne doit JAMAIS changer.
 *
 * `TAUX_HORAIRE_SENSIBILISATION` : produit une ESTIMATION du coût des heures non
 * faites, y compris pour une absence PAYÉE (RPT-03 §27) : une absence peut ne
 * générer aucune retenue tout en générant un indicateur de sensibilisation.
 */
export function calculateAbsenceImpact(
  absenceType: AbsenceType | null | undefined,
  modePaie: string | null | undefined,
  baseSalary: number | null | undefined,
  forfaitHebdomadaire: number | null | undefined,
  workingDaysInMonth: number | null | undefined,
  schedule: DaySchedule | null | undefined,
  options: OptionsSensibilisation = {}
): ResultatImpactAbsence {
  const mode: ModeImpact = options.mode ?? "RETENUE_PAIE";

  if (mode === "TAUX_HORAIRE_SENSIBILISATION") {
    const heures = valeurSaine(options.heuresSensibilisation);
    const taux = valeurSaine(options.tauxHoraireSensibilisation);
    if (heures === null || taux === null) {
      return { retenueReelle: 0, estimationMontant: null, heuresEstimees: 0, mode };
    }
    return { retenueReelle: 0, estimationMontant: heures * taux, heuresEstimees: heures, mode };
  }

  if (!absenceType || !baseSalary) {
    return { retenueReelle: 0, estimationMontant: null, heuresEstimees: 0, mode };
  }

  const isPaidAbsence = ["JUSTIFIEE_REMUNEREE", "CONGE", "MALADIE", "MISSION", "FORMATION"].includes(absenceType);
  if (!isPaidAbsence) return { retenueReelle: 0, estimationMontant: null, heuresEstimees: 0, mode }; // Absence non rémunérée = pas d'impact (salaire déjà proratisé ailleurs)

  // Pour les absences rémunérées, l'impact de paie est nul (le salaire est maintenu).
  // Le coût employeur estimé relève du mode TAUX_HORAIRE_SENSIBILISATION, jamais d'ici.
  void modePaie;
  void forfaitHebdomadaire;
  void workingDaysInMonth;
  void schedule;
  return { retenueReelle: 0, estimationMontant: null, heuresEstimees: 0, mode };
}

/**
 * RPT-03 §9/§33 — Impact d'un retard, dans l'un des DEUX modes.
 *
 * `TAUX_HORAIRE_SENSIBILISATION` ne réutilise PAS `late_deduction_rules` : ces
 * règles produisent des RETENUES. L'estimation applique le taux horaire du
 * segment sur `lateMinutes / 60` et laisse `deductionAmount` à 0.
 */
export function calculateLateDeduction(
  lateMinutes: number,
  rule: LateDeductionRule | null | undefined,
  baseSalary: number | null | undefined,
  workingDaysInMonth: number | null | undefined,
  options: OptionsSensibilisation = {}
): ResultatImpactRetard {
  const mode: ModeImpact = options.mode ?? "RETENUE_PAIE";
  const minutes = Number.isFinite(lateMinutes) && lateMinutes > 0 ? lateMinutes : 0;

  if (mode === "TAUX_HORAIRE_SENSIBILISATION") {
    const taux = valeurSaine(options.tauxHoraireSensibilisation);
    if (minutes === 0 || taux === null) {
      return { deductibleMinutes: 0, deductionAmount: 0, estimationHeures: null, estimationMontant: null };
    }
    return {
      deductibleMinutes: 0,
      deductionAmount: 0,
      estimationHeures: minutes / 60,
      estimationMontant: (minutes / 60) * taux,
    };
  }

  const base = calculateLateDeductionBase(minutes, rule, baseSalary, workingDaysInMonth);
  return { ...base, estimationHeures: null, estimationMontant: null };
}

export function calculateAttendance(input: CalcInput): CalcResult {
  const {
    timeIn,
    timeOut,
    schedule,
    settings,
    overtimeAuth,
    isPublicHoliday,
    absenceType,
    baseSalary,
    workingDaysInMonth,
    lateDeductionRule,
    modePaie,
    forfaitHebdomadaire,
  } = input;

  const isWorkingDay = schedule?.isWorkingDay !== false && !isPublicHoliday;
  const start = toMinutes(schedule?.startTime ?? null);
  const end = toMinutes(schedule?.endTime ?? null);
  const breakStart = toMinutes(schedule?.breakStart ?? null);
  const breakEnd = toMinutes(schedule?.breakEnd ?? null);
  // RPT-02 §7 : les deux réglages sont lus UNE fois, puis propagés dans details.
  const policy = latenessPolicy(settings);
  const tolerance = policy.technicalToleranceMinutes;
  const countEarly = settings.countEarlyArrival ?? false;
  const countLate = settings.countLateDeparture ?? false;
  const validateEarly = input.validateEarlyArrival ?? false;
  const validateLate = input.validateLateDeparture ?? false;
  const autoDeductBreak = settings.autoDeductBreak ?? true;

  const inMin = toMinutes(timeIn);
  const outMin = toMinutes(timeOut);

  const empty: CalcResult = {
    rawMinutes: 0,
    breakMinutes: 0,
    workedMinutes: 0,
    normalMinutes: 0,
    overtimeMinutes: 0,
    lateMinutes: 0,
    lateBusinessMinutes: 0,
    isLate: false,
    lateDeductibleMinutes: 0,
    lateDeductionAmount: 0,
    earlyDepartureMinutes: 0,
    isAbsent: false,
    codePresence: "P",
    absenceFinancialImpact: 0,
    details: {},
  };

  // Jour hors période d'emploi (avant embauche ou après sortie)
  if (input.details?.["horsPeriodeEmploi"]) {
    return {
      ...empty,
      codePresence: "A",
      isAbsent: true,
      details: { reason: "hors période d'emploi" },
    };
  }

  // Absence planifiee (conge, maladie, mission, formation).
  // RPT-02 §14 : le POINTAGE fait foi. Si l'entree porte a la fois un type
  // d'absence planifiee ET un pointage complet (arrivee + depart), le conge ne
  // peut pas ecraser des heures reellement faites : on poursuit le calcul
  // normal de presence et le code reste celui du pointage. Un pointage
  // incomplet ou absent suit la branche conge habituelle.
  const absencePlanifiee = absenceType && ["CONGE", "MALADIE", "MISSION", "FORMATION"].includes(absenceType);
  const pointageComplet = inMin !== null && outMin !== null;
  if (absencePlanifiee && !(pointageComplet && isWorkingDay)) {
    const absenceImpact = calculateAbsenceImpact(absenceType, modePaie, baseSalary, forfaitHebdomadaire, workingDaysInMonth, schedule);
    const codeMap: Record<AbsenceType, CalcResult["codePresence"]> = {
      CONGE: "C",
      MALADIE: "M",
      MISSION: "O",
      FORMATION: "F",
      JUSTIFIEE_REMUNEREE: "P",
      JUSTIFIEE_NON_REMUNEREE: "A",
      INJUSTIFIEE: "A",
    };
    return {
      ...empty,
      isAbsent: !["CONGE", "MALADIE", "MISSION", "FORMATION", "JUSTIFIEE_REMUNEREE"].includes(absenceType),
      codePresence: codeMap[absenceType] ?? "A",
      absenceFinancialImpact: absenceImpact.retenueReelle,
      details: { reason: `absence: ${absenceType}`, isPublicHoliday: !!isPublicHoliday },
    };
  }

  // Absence justifiée/non justifiée sans pointage
  if ((inMin === null || outMin === null) && isWorkingDay) {
    const absenceImpact = calculateAbsenceImpact(absenceType ?? "INJUSTIFIEE", modePaie, baseSalary, forfaitHebdomadaire, workingDaysInMonth, schedule);
    return {
      ...empty,
      isAbsent: true,
      codePresence: "A",
      absenceFinancialImpact: absenceImpact.retenueReelle,
      details: { reason: `absence: ${absenceType ?? "INJUSTIFIEE"}`, absenceType: absenceType ?? "INJUSTIFIEE" },
    };
  }

  // Jour non ouvré (dimanche ou férié) : pas d'absence, pas de calcul
  if (!isWorkingDay || inMin === null || outMin === null) {
    return {
      ...empty,
      details: { reason: "jour non ouvre", isPublicHoliday: !!isPublicHoliday },
    };
  }

  // 1. Heures effectives : anticipation/tardivité plafonnées sauf validation (règles 1 et 2)
  const effectiveIn = countEarly || validateEarly || start === null ? inMin : Math.max(inMin, start);
  const effectiveOut = countLate || validateLate || end === null ? outMin : Math.min(outMin, end);

  // Durée brute (règle 5 : minutes d'abord)
  const rawMinutes = Math.max(0, effectiveOut - effectiveIn);

  // 2. Pause déduite = pause RÉELLE pointée (timeInBreak/timeOutBreak) si disponible,
  //    sinon recouvrement avec la plage de pause théorique (règle 6)
  let breakMinutes = 0;
  const inBreak = toMinutes(input.timeInBreak ?? null);
  const outBreak = toMinutes(input.timeOutBreak ?? null);
  if (inBreak !== null && outBreak !== null && outBreak > inBreak) {
    breakMinutes = outBreak - inBreak;
  } else if (autoDeductBreak && breakStart !== null && breakEnd !== null) {
    breakMinutes = overlapMinutes(effectiveIn, effectiveOut, breakStart, breakEnd);
  }

  // 3. Temps de présence (arrondi selon paramètre)
  const workedMinutes = Math.max(0, roundMinutes(rawMinutes - breakMinutes, settings.roundToMinutes));

  // 4. Retard CONSTATÉ = max(0, arrivée réelle − début théorique − tolérance technique)
  //    puis retard CLASSÉ = max(0, constaté − seuil métier). Les deux réglages
  //    sont distincts et tracés (règle 3, RPT-02 §7).
  const retard = analyserRetard(
    schedule?.startTime ?? null,
    timeIn,
    policy
  );
  const lateMinutes = retard.retardConstateMin;
  const lateBusinessMinutes = retard.retardClasseMin;
  const isLate = retard.classe;

  // 5. Départ anticipé = max(0, fin théorique − départ réel) — indicateur (règle 4)
  const earlyDepartureMinutes = end !== null ? Math.max(0, end - outMin) : 0;

  // 6. Retard DÉDUCTIBLE + impact financier selon règle paramétrée
  // RPT-03 : `deductionAmount` reste la RETENUE de paie ; l'estimation de
  // sensibilisation vit dans des champs distincts et n'est jamais persistée ici.
  const { deductibleMinutes: lateDeductibleMinutes, deductionAmount: lateDeductionAmount } = calculateLateDeduction(
    lateMinutes,
    lateDeductionRule,
    baseSalary,
    workingDaysInMonth
  );

  // 7. Seuil HS journalier (specs MVP) → HS automatiques
  const threshold = dayThreshold(schedule, settings);
  const automaticOT = Math.max(0, workedMinutes - threshold);

  // 8. Autorisation HS (règle CDC) : approuvée = plafond, sinon 0
  const authStatus = overtimeAuth?.status?.toLowerCase() ?? "";
  const authApproved = AUTH_APPROVED.has(authStatus);
  const authRejected = AUTH_REJECTED.has(authStatus);
  const authCapMinutes = authApproved
    ? Math.max(0, Math.round(Number(overtimeAuth?.maxHours ?? 0) * 60))
    : 0;
  const overtimeMinutes = authApproved
    ? Math.min(automaticOT, authCapMinutes)
    : 0;

  // 9. Heures normales = MIN(heures travaillées, seuil) (specs MVP)
  const normalMinutes = Math.max(0, Math.min(workedMinutes, threshold));

  // 10. Code présence : A | HS | R | P | C | M | F | O
  let codePresence: CalcResult["codePresence"] = "P";
  if (overtimeMinutes > 0) codePresence = "HS";
  else if (isLate) codePresence = "R";
  else if (absencePlanifiee && !pointageComplet) {
    const codeMap: Record<string, CalcResult["codePresence"]> = { CONGE: "C", MALADIE: "M", MISSION: "O", FORMATION: "F" };
    codePresence = codeMap[absenceType!] ?? "P";
  }

  // 11. Impact financier absence (si applicable)
  const absenceFinancialImpact = calculateAbsenceImpact(
    absenceType ?? null,
    modePaie,
    baseSalary,
    forfaitHebdomadaire,
    workingDaysInMonth,
    schedule
  ).retenueReelle;

  return {
    rawMinutes,
    breakMinutes,
    workedMinutes,
    normalMinutes,
    overtimeMinutes,
    lateMinutes,
    lateBusinessMinutes,
    isLate,
    lateDeductibleMinutes,
    lateDeductionAmount,
    earlyDepartureMinutes,
    isAbsent: false,
    codePresence,
    absenceFinancialImpact,
    details: {
      effectiveIn,
      effectiveOut,
      start,
      end,
      tolerance,
      businessThreshold: policy.businessThresholdMinutes,
      lateBusinessMinutes,
      isLate,
      retardExplication: {
        heureTheoriqueMin: retard.heureTheoriqueMin,
        heureArriveeMin: retard.heureArriveeMin,
        toleranceTechniqueMin: retard.toleranceTechniqueMin,
        seuilBusinessMin: retard.seuilBusinessMin,
        retardConstateMin: retard.retardConstateMin,
        retardClasseMin: retard.retardClasseMin,
      },
      thresholdMinutes: threshold,
      automaticOT,
      authApproved,
      authRejected,
      authCapMinutes,
      absenceType: absenceType ?? null,
      modePaie: modePaie ?? null,
      lateDeductionMethod: lateDeductionRule?.method ?? null,
    },
  };
}