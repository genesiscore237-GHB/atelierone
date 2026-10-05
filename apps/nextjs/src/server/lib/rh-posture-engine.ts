/**
 * RH — POSTURE & SALAIRE TEMPS RÉEL (pur, sans DB).
 * Taux horaire = salaire de base ÷ heures standard paramétrées (225,3 h par défaut).
 * Salaire sur intervalle : agrége les présences (heures normales, HS, primes,
 * absences) et calcule le brut sur la base du temps réellement travaillé.
 */

export interface EntrySalaire {
  workedMinutes: number; // heures normales travaillées (déjà déduites de la pause)
  overtimeMinutes: number; // heures supplémentaires
  taskBonus: number; // prime de tâche (FCFA)
  isAbsent: boolean; // journée d'absence comptée
}

export interface SalaireIntervalleInput {
  salaireBase: number;
  standardMonthlyHours: number; // défaut 225,3
  overtimeMultiplier: number; // défaut 1,5
  joursOuvresMois: number; // base de retenue par absence (défaut 26)
  entries: EntrySalaire[];
}

export interface SalaireIntervalleResult {
  tauxHoraire: number;
  heuresNormales: number; // heures décimales
  heuresSupplementaires: number;
  primesTache: number;
  joursAbsents: number;
  brutBase: number; // tauxHoraire × heures normales
  brutHS: number; // tauxHoraire × HS × multiplicateur
  retenuesAbsences: number; // salaire/26 × jours absents
  brut: number; // brutBase + brutHS + primes − retenues absences
  detailsParJour: { heures: number; hs: number; primes: number; absent: boolean }[];
}

/**
 * Taux horaire de référence.
 *
 * RPT-03 §29 : `precision` permet de conserver la précision native pour une
 * ESTIMATION. Sans `precision`, l'arrondi historique à 2 décimales est
 * conservé à l'identique (non-régression).
 */
export function tauxHoraire(
  salaireBase: number,
  standardMonthlyHours: number,
  options: { precision?: number } = {}
): number {
  const h = standardMonthlyHours > 0 ? standardMonthlyHours : 225.3;
  const rate = salaireBase / h;
  const p = options.precision;
  if (p === undefined) return Math.round(rate * 100) / 100;
  const f = 10 ** p;
  return Math.round(rate * f) / f;
}

export function calculerSalaireIntervalle(input: SalaireIntervalleInput): SalaireIntervalleResult {
  const rate = tauxHoraire(input.salaireBase, input.standardMonthlyHours);
  const mult = input.overtimeMultiplier > 0 ? input.overtimeMultiplier : 1.5;
  const joursBase = input.joursOuvresMois > 0 ? input.joursOuvresMois : 26;

  let heuresNormales = 0, heuresSup = 0, primes = 0, absents = 0;
  const details = input.entries.map((e) => {
    const h = Math.round((e.workedMinutes / 60) * 100) / 100;
    const hs = Math.round((e.overtimeMinutes / 60) * 100) / 100;
    heuresNormales += h;
    heuresSup += hs;
    primes += e.taskBonus;
    if (e.isAbsent) absents++;
    return { heures: h, hs, primes: e.taskBonus, absent: e.isAbsent };
  });

  const brutBase = Math.round(rate * heuresNormales * 100) / 100;
  const brutHS = Math.round(rate * heuresSup * mult * 100) / 100;
  const retenuesAbsences = Math.round(((input.salaireBase / joursBase) * absents) * 100) / 100;
  const brut = Math.round((brutBase + brutHS + primes - retenuesAbsences) * 100) / 100;

  return {
    tauxHoraire: rate,
    heuresNormales: Math.round(heuresNormales * 100) / 100,
    heuresSupplementaires: Math.round(heuresSup * 100) / 100,
    primesTache: Math.round(primes * 100) / 100,
    joursAbsents: absents,
    brutBase,
    brutHS,
    retenuesAbsences,
    brut,
    detailsParJour: details,
  };
}

/** Gain estimé d'une seule journée (affichage temps réel). */
export function gainJour(rate: number, workedMinutes: number, overtimeMinutes: number, taskBonus: number, overtimeMultiplier: number): number {
  const h = workedMinutes / 60;
  const hs = overtimeMinutes / 60;
  return Math.round((rate * h + rate * hs * (overtimeMultiplier > 0 ? overtimeMultiplier : 1.5) + taskBonus) * 100) / 100;
}