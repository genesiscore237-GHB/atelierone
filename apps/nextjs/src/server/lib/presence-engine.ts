/**
 * RH-02 — MOTEUR DE CALCUL DES PRÉSENCES (pur, sans DB).
 *
 * L'humain saisit les heures brutes ; le moteur applique exclusivement les
 * paramètres RH-00 (cycle, tolérance, pause, plafonds) et les autorisations HS.
 * Aucune constante métier ici — tout est injecté.
 */

export interface DaySchedule {
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  expectedHours: string | null;
  isWorkingDay: boolean;
}

export interface PresenceSettings {
  lateToleranceMinutes: number | null;
  roundToMinutes: number | null;
  autoDeductBreak: boolean | null;
  countEarlyArrival: boolean | null;
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

export function calculateAttendance(input: CalcInput): CalcResult {
  const { timeIn, timeOut, schedule, settings, overtimeAuth, isPublicHoliday } = input;

  const isWorkingDay = schedule?.isWorkingDay !== false && !isPublicHoliday;
  const start = toMinutes(schedule?.startTime ?? null);
  const end = toMinutes(schedule?.endTime ?? null);
  const breakStart = toMinutes(schedule?.breakStart ?? null);
  const breakEnd = toMinutes(schedule?.breakEnd ?? null);
  const tolerance = settings.lateToleranceMinutes ?? 0;
  const countEarly = settings.countEarlyArrival ?? false;
  const autoDeductBreak = settings.autoDeductBreak ?? true;

  // Plafond d'heures normales : maxNormalHoursPerDay, sinon heures attendues du jour
  const capNormalRaw =
    settings.maxNormalHoursPerDay ?? schedule?.expectedHours ?? null;
  const capNormal = capNormalRaw ? Number(capNormalRaw) * 60 : null;

  const inMin = toMinutes(timeIn);
  const outMin = toMinutes(timeOut);

  // Absent : aucun pointage sur une journée ouvrée (non fériée)
  if ((inMin === null || outMin === null) && isWorkingDay) {
    return {
      rawMinutes: 0,
      breakMinutes: 0,
      workedMinutes: 0,
      normalMinutes: 0,
      overtimeMinutes: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      isAbsent: true,
      details: { reason: "pointage incomplet sur journée ouvrée" },
    };
  }

  // Jour non ouvrée (dimanche ou férié) : pas d'absence, pas de calcul de retard
  if (!isWorkingDay || inMin === null || outMin === null) {
    return {
      rawMinutes: 0,
      breakMinutes: 0,
      workedMinutes: 0,
      normalMinutes: 0,
      overtimeMinutes: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      isAbsent: false,
      details: { reason: "jour non ouvre", isPublicHoliday: !!isPublicHoliday },
    };
  }

  // Arrivée anticipée non comptée : le temps avant start_time est ignoré
  const effectiveIn = countEarly || start === null ? inMin : Math.max(inMin, start);

  // 1. Durée brute
  let rawMinutes = outMin - effectiveIn;
  if (rawMinutes < 0) rawMinutes = 0;

  // 2. Pause déduite = recouvrement avec la plage de pause
  let breakMinutes = 0;
  if (autoDeductBreak && breakStart !== null && breakEnd !== null) {
    breakMinutes = overlapMinutes(effectiveIn, outMin, breakStart, breakEnd);
  }

  // 3. Temps de présence (arrondi selon paramètre)
  const workedMinutes = Math.max(0, roundMinutes(rawMinutes - breakMinutes, settings.roundToMinutes));

  // 4. Retard = max(0, time_in - start - tolérance)
  const lateMinutes =
    start !== null ? Math.max(0, inMin - start - tolerance) : 0;

  // 5. Départ anticipé = max(0, end - time_out)
  const earlyDepartureMinutes =
    end !== null ? Math.max(0, end - outMin) : 0;

  // 6. HS potentielles = max(0, time_out - end)
  const potentialOT = end !== null ? Math.max(0, outMin - end) : 0;

  // 7. HS validées : uniquement si autorisation approuvée, plafonnées à l'autorisation
  const authApproved =
    overtimeAuth !== null &&
    overtimeAuth.status !== null &&
    AUTH_APPROVED.has(overtimeAuth.status.toLowerCase());
  const authCapMinutes = authApproved
    ? Math.max(0, Math.round(Number(overtimeAuth?.maxHours ?? 0) * 60))
    : 0;
  const overtimeMinutes = authApproved ? Math.min(potentialOT, authCapMinutes) : 0;

  // 8. Temps normal = min(présence - HS, plafond du jour)
  const normalMinutes =
    capNormal !== null
      ? Math.max(0, Math.min(workedMinutes - overtimeMinutes, capNormal))
      : Math.max(0, workedMinutes - overtimeMinutes);

  return {
    rawMinutes,
    breakMinutes,
    workedMinutes,
    normalMinutes,
    overtimeMinutes,
    lateMinutes,
    earlyDepartureMinutes,
    isAbsent: false,
    details: {
      effectiveIn,
      start,
      end,
      tolerance,
      capNormalMinutes: capNormal,
      potentialOT,
      authApproved,
      authCapMinutes,
    },
  };
}
