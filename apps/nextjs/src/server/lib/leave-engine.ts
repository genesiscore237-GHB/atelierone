/**
 * RH-03 — MOTEUR DE SOLDES DE CONGÉS (pur, sans DB).
 * Acquisition, prorata, solde, jours ouvrés — tout est paramétré.
 */

/** Acquisition mensuelle (ex. 30 j/an → 2,5 j/mois) */
export function monthlyAcquisition(annualLeaveDays: number): number {
  if (annualLeaveDays <= 0) return 0;
  return annualLeaveDays / 12;
}

/** Acquisition proratisée pour une embauche en cours d'année (mois entiers) */
export function proRataAcquisition(
  annualLeaveDays: number,
  monthsEmployed: number
): number {
  if (annualLeaveDays <= 0 || monthsEmployed <= 0) return 0;
  return Math.round((annualLeaveDays / 12) * Math.min(monthsEmployed, 12) * 10) / 10;
}

/** Solde = acquis + ajustements − pris */
export function calculateBalance(
  acquiredDays: number,
  takenDays: number,
  adjustedDays: number
): number {
  return Math.round((acquiredDays + adjustedDays - takenDays) * 10) / 10;
}

/** Nombre de jours ouvrés entre deux dates incluses (prédicat de jour ouvré) */
export function countWorkingDays(
  start: string, // YYYY-MM-DD
  end: string,
  isWorkingDay: (dayOfWeek: number) => boolean
): number {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  let count = 0;
  const cursor = new Date(s);
  while (cursor <= e) {
    if (isWorkingDay(cursor.getDay())) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Détection de chevauchement entre deux périodes */
export function overlaps(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA <= endB && startB <= endA;
}

/** Jours ouvrés du garage GPJ : lundi→samedi (dimanche exclu) */
export const garageWorkingDay = (dayOfWeek: number): boolean => dayOfWeek !== 0;
