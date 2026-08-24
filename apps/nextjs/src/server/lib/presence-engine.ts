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
 * Les autorisations HS restent un supplément : approuvée = plafond,
 * refusée = 0, sinon HS automatique (règle MVP).
 */

export interface DaySchedule {
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  expectedHours: string | null;
  overtimeThreshold: string | null; // seuil HS journalier (9,5 semaine / 4,5 samedi)
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
}

export interface OvertimeAuthInput {
  maxHours: string | number | null;
  status: string | null;
}

export interface CalcInput {
  timeIn: string | null; // "HH:MM"
  timeOut: string | null;
  schedule: DaySchedule | null;
  settings: PresenceSettings;
  overtimeAuth: OvertimeAuthInput | null;
  isPublicHoliday?: boolean;
  /** specs MVP — validation admin par ligne (défaut NON) */
  validateEarlyArrival?: boolean;
  validateLateDeparture?: boolean;
}

export interface CalcResult {
  rawMinutes: number;
  breakMinutes: number;
  workedMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  isAbsent: boolean;
  codePresence: "A" | "HS" | "R" | "P";
  details: Record<string, unknown>;
}

export function toMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
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

/** Seuil HS du jour : overtimeThreshold du cycle → plafond normal → heures attendues → défaut 9,5h */
export function dayThreshold(schedule: DaySchedule | null, settings: PresenceSettings): number {
  const raw =
    schedule?.overtimeThreshold ??
    settings.maxNormalHoursPerDay ??
    schedule?.expectedHours ??
    "9.5";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n * 60 : 570;
}

export function calculateAttendance(input: CalcInput): CalcResult {
  const { timeIn, timeOut, schedule, settings, overtimeAuth, isPublicHoliday } = input;

  const isWorkingDay = schedule?.isWorkingDay !== false && !isPublicHoliday;
  const start = toMinutes(schedule?.startTime ?? null);
  const end = toMinutes(schedule?.endTime ?? null);
  const breakStart = toMinutes(schedule?.breakStart ?? null);
  const breakEnd = toMinutes(schedule?.breakEnd ?? null);
  const tolerance = settings.lateToleranceMinutes ?? 0;
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
    earlyDepartureMinutes: 0,
    isAbsent: false,
    codePresence: "P",
    details: {},
  };

  // Absent : aucun pointage sur une journée ouvrée (non fériée)
  if ((inMin === null || outMin === null) && isWorkingDay) {
    return {
      ...empty,
      isAbsent: true,
      codePresence: "A",
      details: { reason: "pointage incomplet sur journée ouvrée" },
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

  // 2. Pause déduite = recouvrement avec la plage de pause (règle 6)
  let breakMinutes = 0;
  if (autoDeductBreak && breakStart !== null && breakEnd !== null) {
    breakMinutes = overlapMinutes(effectiveIn, effectiveOut, breakStart, breakEnd);
  }

  // 3. Temps de présence (arrondi selon paramètre)
  const workedMinutes = Math.max(0, roundMinutes(rawMinutes - breakMinutes, settings.roundToMinutes));

  // 4. Retard = max(0, arrivée réelle − début théorique − tolérance) — indicateur (règle 3)
  const lateMinutes = start !== null ? Math.max(0, inMin - start - tolerance) : 0;

  // 5. Départ anticipé = max(0, fin théorique − départ réel) — indicateur (règle 4)
  const earlyDepartureMinutes = end !== null ? Math.max(0, end - outMin) : 0;

  // 6. Seuil HS journalier (specs MVP) → HS automatiques
  const threshold = dayThreshold(schedule, settings);
  const automaticOT = Math.max(0, workedMinutes - threshold);

  // 7. Autorisation HS (supplément) : approuvée = plafond, refusée = 0, sinon auto
  const authStatus = overtimeAuth?.status?.toLowerCase() ?? "";
  const authApproved = AUTH_APPROVED.has(authStatus);
  const authRejected = AUTH_REJECTED.has(authStatus);
  const authCapMinutes = authApproved
    ? Math.max(0, Math.round(Number(overtimeAuth?.maxHours ?? 0) * 60))
    : 0;
  const overtimeMinutes = authRejected ? 0 : authApproved ? Math.min(automaticOT, authCapMinutes) : automaticOT;

  // 8. Heures normales = MIN(heures travaillées, seuil) (specs MVP)
  const normalMinutes = Math.max(0, Math.min(workedMinutes, threshold));

  // 9. Code présence : A | HS | R | P
  const codePresence = overtimeMinutes > 0 ? "HS" : lateMinutes > 0 ? "R" : "P";

  return {
    rawMinutes,
    breakMinutes,
    workedMinutes,
    normalMinutes,
    overtimeMinutes,
    lateMinutes,
    earlyDepartureMinutes,
    isAbsent: false,
    codePresence,
    details: {
      effectiveIn,
      effectiveOut,
      start,
      end,
      tolerance,
      thresholdMinutes: threshold,
      automaticOT,
      authApproved,
      authRejected,
      authCapMinutes,
    },
  };
}