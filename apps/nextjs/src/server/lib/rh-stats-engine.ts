/**
 * RH-09 — MOTEUR STATISTIQUES RH (pur, sans DB).
 * KPI agrégés, taux de présence, répartitions, exports CSV.
 */

export interface PresenceStat {
  presentDays: number;
  paidDays: number; // jours ouvrés du mois (hors fériés)
  rate: number; // 0-100
}

/** Taux de présence d'un mois (jours présents / jours ouvrés) */
export function presenceRate(
  presentDays: number,
  workingDays: number
): PresenceStat {
  if (workingDays <= 0) return { presentDays, paidDays: workingDays, rate: 0 };
  return {
    presentDays,
    paidDays: workingDays,
    rate: Math.round((presentDays / workingDays) * 1000) / 10,
  };
}

/**
 * P07 — Taux de présence mensuel avec dénominateur « jours ouvrés × effectif ».
 * Le KPI dashboard agrège tous les résumés du mois (Σ jours présents de tous les
 * employés) : le dénominateur doit donc être le nombre total de jours ouvrables
 * de l'effectif (workingDays × headcount), sinon le taux peut dépasser 100 %.
 */
export function presenceRateForHeadcount(
  presentDays: number,
  workingDays: number,
  headcount: number
): PresenceStat {
  if (workingDays <= 0) return presenceRate(presentDays, 0);
  const denominator = Math.max(Math.round(workingDays * headcount), 1);
  return presenceRate(presentDays, denominator);
}

export interface RepartitionItem {
  label: string;
  count: number;
}

/** Répartition des effectifs par critère (département, poste, statut) */
export function repartition(
  items: Array<{ key: string | null; label: string | null }>
): RepartitionItem[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const label = i.label ?? "Non défini";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/** Masse salariale mensuelle (somme des salaires de base) */
export function payrollMass(salaries: Array<number | string | null>): number {
  return salaries.reduce((s, v) => s + (Number(v) || 0), 0);
}

export interface EffectifStats {
  effectif: number;
  actifs: number;
  enConge: number;
  suspendus: number;
  inactifs: number;
}

/**
 * N11/P19 — Découpage de l'effectif par statut RH.
 * Seuls les statuts vivants comptent : actif, congé, suspendu.
 * `sorti`/`archive` sont exclus de l'effectif de travail (P19).
 * `inactifs` = congé + suspendu (présents au contrat, absents du travail).
 */
export function effectifParStatut(statuts: Array<string | null | undefined>): EffectifStats {
  const actifs = statuts.filter((s) => s === "actif").length;
  const enConge = statuts.filter((s) => s === "conge").length;
  const suspendus = statuts.filter((s) => s === "suspendu").length;
  return {
    effectif: actifs + enConge + suspendus,
    actifs,
    enConge,
    suspendus,
    inactifs: enConge + suspendus,
  };
}

/** Export CSV générique (échappement RFC 4180) */
export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const esc = (v: string | number | null) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\r\n");
}

/** Nombre de jours ouvrés (lun-sam, hors fériés) d'un mois — cohérent RH-02 */
export function workingDaysInMonth(year: number, month: number, holidays: string[] = []): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0) continue; // dimanche
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (holidays.includes(iso)) continue;
    count++;
  }
  return count;
}

// ─── N06/P06/P08 — classification d'un jour + analyse de période ───

export type JourClassification = "PRESENCE" | "ABSENCE" | "CONGE";

/**
 * N06/P06/P08 — Classification canonique d'un jour calculé.
 * Congé = code C/M/O/F (ni présent, ni absent — joursOnLeave).
 * Absence = code A ou isAbsent. Sinon présence (P/HS/R).
 */
export function classifierJour(
  code: string | null | undefined,
  isAbsent: boolean | null | undefined
): JourClassification {
  const c = (code ?? "").toUpperCase();
  if (c === "C" || c === "M" || c === "O" || c === "F") return "CONGE";
  if (c === "A" || isAbsent) return "ABSENCE";
  return "PRESENCE";
}

export interface EmployePourJoursComptables {
  workCycleId: number | null;
  dateEmbauche: string | Date | null;
  dateSortie: string | Date | null;
}

/**
 * P07/P08 — Jours comptables d'un employé sur un mois civil (bornes P05).
 * Règles IDENTIQUES à closeMonth (rh-presence) et analysePeriode :
 *  - dimanche non compté ; férié de l'agence non compté ;
 *  - hors période d'emploi (embauche/sortie) non compté ;
 *  - pas de cycle ni de journée ouvrée du cycle → non compté
 *    (un employé sans cycle ne peut être ni présent ni absent).
 * C'est le dénominateur correct des KPI de présence (bug C).
 */
export function joursComptablesEmployeMois(
  year: number,
  month: number,
  emp: EmployePourJoursComptables,
  nonWorkingByCycle: ReadonlyMap<number, ReadonlySet<number>>,
  feries: Iterable<string>
): number {
  if (!emp.workCycleId) return 0;
  const feriesSet = new Set<string>(feries);
  const nonWorking = nonWorkingByCycle.get(emp.workCycleId) ?? new Set<number>();
  const nbJours = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= nbJours; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(`${iso}T12:00:00`).getDay();
    if (dow === 0) continue;
    if (feriesSet.has(iso)) continue;
    if (emp.dateEmbauche && iso < String(emp.dateEmbauche)) continue;
    if (emp.dateSortie && iso > String(emp.dateSortie)) continue;
    if (nonWorking.has(dow)) continue;
    count++;
  }
  return count;
}

export type CodeJourAnalyse = "P" | "HS" | "R" | "A" | "C" | "M" | "O" | "F" | "MUET";

/** Ligne journalière en entrée de l'analyse de période. */
export interface JourAnalyseInput {
  date: string; // YYYY-MM-DD
  code: CodeJourAnalyse;
  isWorkingDay: boolean; // dimanche / férié / non ouvré → hors périmètre
  heuresTheoriques: number; // heures décimales attendues du jour
  workedMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
}

export interface AnomalieAnalyse {
  date: string;
  code: CodeJourAnalyse;
  detail: string;
}

export interface PeriodeAnalyse {
  joursTheoriques: number;
  joursPresence: number; // P / HS / R
  joursAbsence: number; // A
  joursConges: number; // C / M / O / F
  joursMuets: number; // NON POINTÉ (jour comptable sans saisie)
  heuresTheoriques: number;
  heuresTravaillees: number;
  heuresNormales: number;
  heuresSupp: number;
  retardTotalMinutes: number;
  departAnticipeTotalMinutes: number;
  tauxPresence: number; // 0-100
  anomalies: AnomalieAnalyse[];
}

const arrondi1 = (n: number): number => Math.round(n * 10) / 10;

const CODES_CONGE = new Set<CodeJourAnalyse>(["C", "M", "O", "F"]);

/**
 * Analyse de période (Phase 4) : agrége un ensemble de jours comptables en un
 * état périodique (théorique, réel, retards, HS, anomalies). Fonction PURE.
 */
export function analyserPeriode(jours: JourAnalyseInput[]): PeriodeAnalyse {
  const analyse: PeriodeAnalyse = {
    joursTheoriques: 0,
    joursPresence: 0,
    joursAbsence: 0,
    joursConges: 0,
    joursMuets: 0,
    heuresTheoriques: 0,
    heuresTravaillees: 0,
    heuresNormales: 0,
    heuresSupp: 0,
    retardTotalMinutes: 0,
    departAnticipeTotalMinutes: 0,
    tauxPresence: 0,
    anomalies: [],
  };

  for (const j of jours) {
    if (!j.isWorkingDay) continue; // dimanche/férié/non ouvré : hors périmètre
    analyse.joursTheoriques++;
    analyse.heuresTheoriques += j.heuresTheoriques || 0;
    analyse.heuresTravaillees += (j.workedMinutes || 0) / 60;
    analyse.heuresNormales += (j.normalMinutes || 0) / 60;
    analyse.heuresSupp += (j.overtimeMinutes || 0) / 60;
    analyse.retardTotalMinutes += j.lateMinutes || 0;
    analyse.departAnticipeTotalMinutes += j.earlyDepartureMinutes || 0;

    const code = j.code ?? "MUET";
    if (CODES_CONGE.has(code)) {
      analyse.joursConges++;
      continue;
    }
    if (code === "A") {
      analyse.joursAbsence++;
      analyse.anomalies.push({ date: j.date, code, detail: "Jour d'absence" });
      continue;
    }
    if (code === "MUET") {
      analyse.joursMuets++;
      analyse.anomalies.push({ date: j.date, code, detail: "Non pointé — aucune saisie du jour" });
      continue;
    }
    analyse.joursPresence++;
    if (code === "R") {
      analyse.anomalies.push({ date: j.date, code, detail: `Retard ${j.lateMinutes ?? 0} min` });
    }
  }

  analyse.heuresTheoriques = arrondi1(analyse.heuresTheoriques);
  analyse.heuresTravaillees = arrondi1(analyse.heuresTravaillees);
  analyse.heuresNormales = arrondi1(analyse.heuresNormales);
  analyse.heuresSupp = arrondi1(analyse.heuresSupp);
  analyse.tauxPresence =
    analyse.joursTheoriques > 0
      ? Math.round((analyse.joursPresence / analyse.joursTheoriques) * 1000) / 10
      : 0;
  return analyse;
}
