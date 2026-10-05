/**
 * RH-04 — MOTEUR DE CALCUL DE PAIE (pur, sans DB).
 * Aucune formule en dur : chaque élément vient de la configuration.
 * Structure conforme au bulletin camerounais :
 * Brut → cotisations salariales (CNPS) → Net imposable → IRPP (barème) → Net à payer.
 *
 * Modes de rémunération supportés :
 * - NON_REMUNERE : net = 0 (stagiaire non rémunéré, essai non rémunéré)
 * - FORFAIT_HEBDOMADAIRE : calcul à partir du forfait réellement applicable à la semaine
 * - SALAIRE_MENSUEL : salaire de base + éléments positifs - retenues - avances récupérées = net
 * - SALAIRE_HORAIRE : calcul sur heures réelles (HN × taux + HS × taux majoré + primes de tâche)
 * - JOURNALIER : paie à la journée (taux journalier × jours présents)
 * - COMMISSION : base fixe contractuelle, jamais proratisée (partie variable : P14 — backlog)
 */

export const PAY_MODES = [
  "NON_REMUNERE",
  "FORFAIT_HEBDOMADAIRE",
  "SALAIRE_MENSUEL",
  "SALAIRE_HORAIRE",
  "JOURNALIER",
  "COMMISSION",
] as const;
export type PayMode = (typeof PAY_MODES)[number];

/** Heures standard mensuelles par défaut (specs MVP : 225,3 h) — fallback du moteur (N09). */
export const STD_MONTHLY_HOURS = 225.3;

/** Table de correspondance canonique des modes (P14/N20) : normalise toute valeur
 *  (léguée ou canonique, casse ignorée) vers un PayMode. Valeur inconnue → SALAIRE_MENSUEL (rétro). */
const MODE_PAIE_ALIASES: Record<string, PayMode> = {
  "non_remunere": "NON_REMUNERE",
  "essai": "NON_REMUNERE",
  "non remunere": "NON_REMUNERE",
  "forfait_hebdomadaire": "FORFAIT_HEBDOMADAIRE",
  "forfait": "FORFAIT_HEBDOMADAIRE",
  "salaire_mensuel": "SALAIRE_MENSUEL",
  "mensuel": "SALAIRE_MENSUEL",
  "salaire_horaire": "SALAIRE_HORAIRE",
  "horaire": "SALAIRE_HORAIRE",
  "journalier": "JOURNALIER",
  "commission": "COMMISSION",
};

export function normaliserModePaie(raw: string | null | undefined): PayMode {
  const v = (raw ?? "").trim().toLowerCase();
  const alias = MODE_PAIE_ALIASES[v];
  if (alias) return alias;
  const canon = v.toUpperCase();
  if ((PAY_MODES as readonly string[]).includes(canon)) return canon as PayMode;
  return "SALAIRE_MENSUEL";
}

export interface PayrollConfigItem {
  code: string;
  name: string;
  type: "earning" | "deduction";
  method: "percent" | "fixed" | "manual" | "hours_x_rate" | "absent_days" | "scale" | "advance_recovery" | "late_deduction";
  params: Record<string, unknown> | null;
}

export interface AdvanceInfo {
  id: number;
  montant: number;
  dateVersement: string;
  motif: string | null;
  moyenPaiement: string | null;
  periodeConcerneeDebut: string | null;
  periodeConcerneeFin: string | null;
  montantRecupere: number;
  soldeRestant: number;
  statut: string;
}

export interface PayrollInput {
  /** Mode de rémunération de l'employé pour cette période */
  modePaie: PayMode;
  /** Salaire de base mensuel (pour SALAIRE_MENSUEL) */
  baseSalary: number;
  /** Forfait hebdomadaire (pour FORFAIT_HEBDOMADAIRE) */
  forfaitHebdomadaire?: number | null;
  /** Heures supplémentaires (heures) */
  overtimeHours: number;
  /** Jours présents */
  daysPresent: number;
  /** Jours absents */
  daysAbsent: number;
  /** Jours ouvrables théoriques de la période */
  expectedWorkingDays: number;
  /** Prime de performance manuelle */
  performanceBonus: number;
  /** Ajustements manuels (ex: avances = négatif) */
  manualAdjustments: Array<{ code: string; amount: number }>;
  /** Configuration des rubriques de paie */
  items: PayrollConfigItem[];
  /** Avances à récupérer sur cette période */
  advancesToRecover?: Array<{ advanceId: number; amount: number }>;
  /** Total des retenues retard de la période (calculé par presence-engine) */
  lateDeductionAmount?: number;
  /** Total impact financier absences de la période */
  absenceFinancialImpact?: number;
  // specs MVP — calcul sur heures réelles (Gestion_Personnel_GPJ.xlsx 03_Paie) :
  normalHours?: number;
  taskBonus?: number;
  standardMonthlyHours?: number;
  overtimeMultiplier?: number;
  payOnHours?: boolean;
  /** Semaines dans la période (pour forfait hebdomadaire) */
  weeksInPeriod?: number;
  /** Forfaits hebdomadaires détaillés semaine par semaine (si renseigné, prioritaire sur forfaitHebdomadaire × semaines) */
  weeklyForfaits?: number[];
}

export interface PayrollLine {
  itemCode: string;
  label: string;
  amount: number;
  direction: "gain" | "retenue";
}

export interface PayrollResult {
  lines: PayrollLine[];
  grossPay: number;
  totalEarnings: number;
  totalDeductions: number;
  cnpsEmployee: number;
  cnpsEmployer: number;
  netImposable: number;
  irpp: number;
  netPay: number;
  /** Détail des avances récupérées sur cette période */
  advanceRecoveries: Array<{ advanceId: number; amount: number; label: string }>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Jours ouvrés (hors dimanche ET hors jours fériés listés) entre deux dates incluses. Dates au format YYYY-MM-DD. */
/**
 * RPT-02 §3 — Une date doit etre REELLE avant d'etre traitee.
 * `new Date("2026-02-31")` ne renvoie pas NaN : JavaScript bascule au 3 mars,
 * ce qui faisait d'une date impossible un jour ouvre. On exige donc le format
 * `YYYY-MM-DD` ET un aller-retour exact sur le calendrier.
 */
export function estIsoDateValide(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, j] = iso.split("-").map(Number);
  if (m < 1 || m > 12 || j < 1 || j > 31) return false;
  const d = new Date(a, m - 1, j);
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j;
}

export function joursOuvres(debut: string, fin: string, holidays: string[] = []): number {
  if (!estIsoDateValide(debut) || !estIsoDateValide(fin)) return 0;
  const start = new Date(`${debut}T00:00:00`);
  const end = new Date(`${fin}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const feries = new Set(holidays);
  let n = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const finEff = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= finEff) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (cur.getDay() !== 0 && !feries.has(iso)) n += 1; // dimanche/férié = jour non ouvré
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

/** Nombre de semaines (fraction réellement présente, sans ceil abusif) dans [debut, fin] inclus (N08). */
export function semainesDansPeriode(debut: string, fin: string): number {
  if (!estIsoDateValide(debut) || !estIsoDateValide(fin)) return 0;
  const j = Math.round((new Date(`${fin}T00:00:00`).getTime() - new Date(`${debut}T00:00:00`).getTime()) / 86400000) + 1;
  if (!Number.isFinite(j) || j <= 0) return 0;
  return Math.round((j / 7) * 100) / 100;
}

export interface ProrataPeriode {
  debutEffectif: string;
  finEffective: string;
  joursEffectifs: number;
  ratio: number;
}

/** Bornes de travail effectif d'un employé sur une période (prorata par date d'effet, CDC §11). */
export function calculerProrata(opts: {
  dateDebutPeriode: string;
  dateFinPeriode: string;
  dateEmbauche?: string | null;
  dateSortie?: string | null;
  /** Jours fériés (YYYY-MM-DD) à exclure du dénominateur (N07, cohérent workingDaysInMonth). */
  holidays?: string[];
}): ProrataPeriode {
  const { dateDebutPeriode, dateFinPeriode, dateEmbauche, dateSortie, holidays = [] } = opts;
  const debutEffectif = dateEmbauche && dateEmbauche > dateDebutPeriode ? dateEmbauche : dateDebutPeriode;
  const finEffective = dateSortie && dateSortie < dateFinPeriode ? dateSortie : dateFinPeriode;
  const joursEffectifs = Math.max(0, joursOuvres(debutEffectif, finEffective, holidays));
  const joursPleinePeriode = joursOuvres(dateDebutPeriode, dateFinPeriode, holidays);
  const ratio = joursPleinePeriode > 0 ? Math.min(1, joursEffectifs / joursPleinePeriode) : 1;
  return { debutEffectif, finEffective, joursEffectifs, ratio };
}

/**
 * N11 — Règle « jours suspendus non payés » (décision utilisateur Phase 3).
 * Détermine le comportement d'un employé suspendu sur une période de paie :
 *  - "aucun"  : employé non suspendu → paie normale
 *  - "total"  : suspension couvrant toute la période (ou non tracée) → pas de bulletin
 *  - "partiel": suspension débutant en cours de mois → prorata (jours avant la suspension payés)
 */
export type RegimeSuspension = "aucun" | "total" | "partiel";

export function regimeSuspensionEnPeriode(opts: {
  statut: string;
  suspensionStart?: string | null;
  debutPeriode: string;
}): RegimeSuspension {
  if (opts.statut !== "suspendu") return "aucun";
  const start = opts.suspensionStart ? String(opts.suspensionStart).slice(0, 10) : null;
  if (!start || start <= opts.debutPeriode) return "total";
  return "partiel";
}

/** Veille d'une date ISO (YYYY-MM-DD) — borne de paie d'une suspension partielle. */
export function veilleDe(iso: string): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Base salariale proratisée : seul le salaire fixe mensuel est réduit au prorata. */
export function baseProratise(baseSalary: number, modePaie: string | null | undefined, ratio: number): number {
  if (modePaie === "SALAIRE_MENSUEL" && ratio < 1) return Math.round(baseSalary * ratio);
  return baseSalary;
}

/**
 * Base mensuelle ÉQUIVALENTE d'un employé sur une période, reconstruite depuis
 * l'historique salarial daté (employee_salary_history) G10.
 * Pour chaque jour ouvré de la période réellement travaillée (bornée par
 * embauche/sortie), on applique le dernier salaire dont la date d'effet est <=
 * ce jour ; le résultat est la moyenne journalière × jours ouvrables de la
 * période brute. Cas particuliers couverts sans exception :
 *  - aucune ligne historique                    → base courante (comportement legacy)
 *  - changement de salaire en cours de mois     → proratisation linéaire (§19)
 *  - embauche / sortie en cours de mois         → prorata (équivalent ratio)
 *  - SALAIRE_HORAIRE / NON_REMUNERE / FORFAIT   → base courante (non proratisée)
 */
export function baseEffectifPeriode(opts: {
  baseCourante: number;
  modePaie: string | null | undefined;
  periode: { debut: string; fin: string };
  emploi?: { dateEmbauche?: string | null; dateSortie?: string | null };
  salaries: Array<{ baseSalary: string | number | null; startDate: string }>;
  /** Jours fériés (YYYY-MM-DD) à exclure du dénominateur (N07). */
  holidays?: string[];
}): number {
  const { baseCourante, modePaie, periode, emploi, salaries, holidays = [] } = opts;
  if (
    modePaie === "SALAIRE_HORAIRE" ||
    modePaie === "NON_REMUNERE" ||
    modePaie === "FORFAIT_HEBDOMADAIRE" ||
    modePaie === "JOURNALIER" ||
    modePaie === "COMMISSION"
  ) {
    return baseCourante;
  }
  const total = joursOuvres(periode.debut, periode.fin, holidays);
  if (total <= 0) return 0;

  const debutEff = emploi?.dateEmbauche && emploi.dateEmbauche > periode.debut ? emploi.dateEmbauche : periode.debut;
  const finEff = emploi?.dateSortie && emploi.dateSortie < periode.fin ? emploi.dateSortie : periode.fin;

  const histo = salaries
    .map((s) => ({ salaire: Number(s.baseSalary ?? 0), dateEffet: s.startDate }))
    .sort((a, b) => (a.dateEffet < b.dateEffet ? -1 : a.dateEffet > b.dateEffet ? 1 : 0));

  let cumul = 0;
  const feries = new Set(holidays);
  const cur = new Date(`${debutEff}T00:00:00`);
  const fin = new Date(`${finEff}T00:00:00`);
  while (cur <= fin) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (cur.getDay() !== 0 && !feries.has(iso)) {
      let salaire = baseCourante;
      for (const h of histo) if (h.dateEffet <= iso) salaire = h.salaire;
      cumul += salaire;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return Math.round((cumul / total) * 100) / 100;
}

/** Calcule le forfait applicable pour une période donnée (somme des forfaits hebdo) */
export function calculerForfaitPeriode(
  forfaitHebdomadaire: number | null,
  semaines: number,
  weeklyForfaits?: number[]
): number {
  if (weeklyForfaits && weeklyForfaits.length > 0) {
    return round2(weeklyForfaits.reduce((s, f) => s + (f > 0 ? f : 0), 0));
  }
  if (!forfaitHebdomadaire || semaines <= 0) return 0;
  return forfaitHebdomadaire * semaines;
}

// ─── Machine d'état de l'ordre des opérations paie (N10) ───
// Clôture présence (RH-02) → préparation (prepareMonth) → paiement (markPaid).
// Chaque fonction retourne `null` si l'action est autorisée, sinon le message de refus.

/** Peut-on préparer la paie ? (présence du mois clôturée + période ouverte) */
export function peutPreparer(opts: { statutPeriode: string; presenceMoisCloture: boolean }): string | null {
  if (!opts.presenceMoisCloture) {
    return "Clôturez d'abord les présences de ce mois (RH-02) avant de calculer la paie.";
  }
  if (opts.statutPeriode === "closed") {
    return "La période est clôturée : la préparation de la paie est verrouillée.";
  }
  return null;
}

/** Peut-on clôturer la période ? (une période fermée ne se referme pas) */
export function peutCloturer(opts: { statutPeriode: string }): string | null {
  if (opts.statutPeriode === "closed") {
    return "Cette période est déjà clôturée.";
  }
  return null;
}

/** Peut-on ajuster un bulletin ? (jamais payé, jamais post-clôture) */
export function peutAjuster(opts: { statutPeriode: string; statutBulletin: string }): string | null {
  if (opts.statutBulletin === "paye") {
    return "Ce bulletin est payé, il ne peut plus être modifié.";
  }
  if (opts.statutPeriode === "closed") {
    return "La période est clôturée : les ajustements sont verrouillés.";
  }
  return null;
}

/** Peut-on marquer payé ? (période fermée obligatoire, jamais deux fois) */
export function peutPayer(opts: { statutPeriode: string; statutBulletin: string }): string | null {
  if (opts.statutPeriode !== "closed") {
    return "La période doit être clôturée avant tout paiement.";
  }
  if (opts.statutBulletin === "paye") {
    return "Ce bulletin est déjà payé.";
  }
  return null;
}

/** Barème progressif par tranches : [{max, rate}, …] (max null = illimité) */
export function progressiveTax(
  amount: number,
  scale: Array<{ max: number | null; rate: number }>
): number {
  if (amount <= 0 || !scale.length) return 0;
  let tax = 0;
  let previousMax = 0;
  for (const bracket of scale) {
    const upper = bracket.max ?? Number.POSITIVE_INFINITY;
    if (amount <= previousMax) break;
    const taxableInBracket = Math.min(amount, upper) - previousMax;
    if (taxableInBracket > 0) {
      tax += taxableInBracket * (bracket.rate / 100);
    }
    previousMax = upper;
  }
  return round2(tax);
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const {
    modePaie,
    baseSalary,
    forfaitHebdomadaire,
    overtimeHours,
    daysPresent,
    daysAbsent,
    expectedWorkingDays,
    performanceBonus,
    manualAdjustments,
    items,
    advancesToRecover = [],
    lateDeductionAmount = 0,
    absenceFinancialImpact = 0,
    normalHours = 0,
    taskBonus = 0,
    standardMonthlyHours,
    overtimeMultiplier,
    payOnHours = false,
    weeksInPeriod = 0,
    weeklyForfaits,
  } = input;

  const lines: PayrollLine[] = [];
  const advanceRecoveries: Array<{ advanceId: number; amount: number; label: string }> = [];

  // Taux horaire : salaire ÷ heures standard mensuelles (specs MVP : 225,3 h)
  const stdHours = standardMonthlyHours && standardMonthlyHours > 0 ? standardMonthlyHours : STD_MONTHLY_HOURS;
  const hourlyRate = stdHours > 0 ? baseSalary / stdHours : 0;
  const attendancePct = expectedWorkingDays > 0 ? (daysPresent / expectedWorkingDays) * 100 : 0;

  const push = (itemCode: string, label: string, amount: number, direction: "gain" | "retenue") => {
    if (amount === 0) return;
    lines.push({ itemCode, label, amount: round2(amount), direction });
  };

  // Cas A : employé à l'essai / stagiaire non rémunéré — net à 0, pas de cotisations.
  // Le bulletin est créé pour traçabilité mais tout gain serait une erreur métier.
  if (modePaie === "NON_REMUNERE") {
    push("BASE", "Non rémunéré (essai)", 0, "gain");
    return {
      lines,
      grossPay: 0,
      totalEarnings: 0,
      totalDeductions: 0,
      cnpsEmployee: 0,
      cnpsEmployer: 0,
      netImposable: 0,
      irpp: 0,
      netPay: 0,
      advanceRecoveries: [],
    };
  }

  // --- CALCUL DU BRUT SELON LE MODE DE RÉMUNÉRATION ---

  if (modePaie === "FORFAIT_HEBDOMADAIRE") {
    // Cas B : Forfait hebdomadaire
    const forfaitPeriode = calculerForfaitPeriode(forfaitHebdomadaire, weeksInPeriod, weeklyForfaits);
    push("FORFAIT", `Forfait hebdomadaire (${weeksInPeriod} sem × ${forfaitHebdomadaire} F)`, forfaitPeriode, "gain");
  } else if (modePaie === "SALAIRE_HORAIRE" || payOnHours) {
    // Cas : Salaire horaire ou paie sur heures réelles
    push("HN", `Heures normales (${round2(normalHours)} h × ${round2(hourlyRate)} F)`, normalHours * hourlyRate, "gain");
  } else if (modePaie === "JOURNALIER") {
    // Cas : paie à la journée (P14/N20) — taux journalier × jours réellement présents
    push("BASE_JOURNALIER", `Taux journalier (${daysPresent} j × ${round2(baseSalary)} F)`, daysPresent * baseSalary, "gain");
  } else {
    // Cas C : Salaire mensuel (défaut) + COMMISSION — N20 : la base fixe contrat
    // est versée intégralement (jamais proratisée sur les jours présents) ;
    // la partie variable n'existe pas encore (P14 — backlog, aucune donnée taux).
    push("BASE", "Salaire de base", baseSalary, "gain");
  }

  let absentDeduction = 0;
  let manualDeduction = 0;
  let advanceRecoveryTotal = 0;

  for (const item of items) {
    if (!item.code || item.code === "BASE") continue;
    switch (item.method) {
      case "percent": {
        const percent = num(item.params?.percent);
        if (item.code === "PRIME_PRESENCE") {
          const minPct = num(item.params?.minAttendancePct, 95);
          if (attendancePct >= minPct) {
            const baseForPercent = modePaie === "FORFAIT_HEBDOMADAIRE" ? calculerForfaitPeriode(forfaitHebdomadaire, weeksInPeriod, weeklyForfaits) : baseSalary;
            push(item.code, item.name, (baseForPercent * percent) / 100, "gain");
          }
        }
        // CNPS et IRPP sont calculés à la fin sur le brut / net imposable
        break;
      }
      case "fixed": {
        const amount = num(item.params?.amount);
        push(item.code, item.name, amount, item.type === "earning" ? "gain" : "retenue");
        break;
      }
      case "hours_x_rate": {
        if (overtimeHours > 0 && (modePaie === "SALAIRE_HORAIRE" || payOnHours || modePaie === "SALAIRE_MENSUEL" || modePaie === "JOURNALIER")) {
          const rate = overtimeMultiplier && overtimeMultiplier > 0
            ? overtimeMultiplier
            : num(item.params?.rate, 1.5);
          push(item.code, item.name, overtimeHours * hourlyRate * rate, "gain");
        }
        break;
      }
      case "absent_days": {
        // R4-D2 : la retenue d'absence s'applique UNIQUEMENT aux modes à salaire fixe
        // (mensuel, forfait hebdomadaire) où le brut est versé à temps plein : une
        // absence hors de ce mode est déjà pénalisée comptablement (0 h / 0 j = 0 brut).
        // SALAIRE_HORAIRE / JOURNALIER / COMMISSION / NON_REMUNERE → aucune retenue
        // ABSENCE (new) sinon net négatif artificiel (réf bulletin 52, phase R4).
        const absenceAssiseFixee = modePaie === "SALAIRE_MENSUEL" || modePaie === "FORFAIT_HEBDOMADAIRE";
        if (daysAbsent > 0 && absenceAssiseFixee) {
          const daysPerMonth = num(item.params?.daysPerMonth, 26);
          const salaryBaseForAbsence = modePaie === "FORFAIT_HEBDOMADAIRE" ? calculerForfaitPeriode(forfaitHebdomadaire, weeksInPeriod, weeklyForfaits) : baseSalary;
          absentDeduction = daysAbsent * (salaryBaseForAbsence / (daysPerMonth || 26));
          push(item.code, item.name, absentDeduction, "retenue");
        }
        break;
      }
      case "manual": {
        const adj = manualAdjustments.find((a) => a.code === item.code);
        if (adj && adj.amount !== 0) {
          if (adj.amount > 0) {
            push(item.code, item.name, adj.amount, "gain");
          } else {
            manualDeduction += Math.abs(adj.amount);
            push(item.code, item.name, Math.abs(adj.amount), "retenue");
          }
        }
        break;
      }
      case "advance_recovery": {
        // Récupération d'avances : gérée de façon transactionnelle ci-dessous.
        // Cet item sert de gabarit/paramétrage optionnel (label, activation).
        break;
      }
      case "late_deduction": {
        // Retenue retard : gérée de façon transactionnelle ci-dessous
        break;
      }
      case "scale": {
        // IRPP : calculé à la fin sur le net imposable
        break;
      }
    }
  }

  // Récupération transactionnelle des avances (toujours appliquée si des avances sont dues)
  for (const adv of advancesToRecover) {
    push("AVANCE_RECUP", `Récupération avance #${adv.advanceId}`, adv.amount, "retenue");
    advanceRecoveries.push({ advanceId: adv.advanceId, amount: adv.amount, label: `Récupération avance #${adv.advanceId}` });
    advanceRecoveryTotal += adv.amount;
  }

  // Retenue retard (calculée par le moteur de présence — toujours appliquée)
  if (lateDeductionAmount > 0) {
    push("RETARD_DED", "Retenue retards", lateDeductionAmount, "retenue");
  }

  // Ajout impact financier absences (toujours appliqué si impact > 0)
  if (absenceFinancialImpact > 0) {
    push("ABSENCE_IMPACT", "Impact absences", absenceFinancialImpact, "retenue");
  }

  if (performanceBonus > 0) {
    push("PRIME_PERFORMANCE", "Prime de performance", performanceBonus, "gain");
  }

  // specs MVP — primes de tâche (saisies jour par jour dans le pointage)
  if (taskBonus > 0) {
    push("PRIME_TACHE", "Primes de tâche", taskBonus, "gain");
  }

  // Brut imposable = base/HN/forfait + toutes les primes/HS (hors absences/avances)
  const grossPay = round2(lines.filter((l) => l.direction === "gain").reduce((s, l) => s + l.amount, 0));

  // Cotisations CNPS sur le brut (part salariale déductible + part patronale hors net)
  const cnpsPctEmp = num(items.find((i) => i.code === "CNPS_EMPLOYE")?.params?.percent, 4.5);
  const cnpsPctEmployer = num(items.find((i) => i.code === "CNPS_EMPLOYEUR")?.params?.percent, 5.6);
  const cnpsEmployee = round2((grossPay * cnpsPctEmp) / 100);
  const cnpsEmployer = round2((grossPay * cnpsPctEmployer) / 100);
  push("CNPS_EMPLOYE", "CNPS — part salariale (4,5 %)", cnpsEmployee, "retenue");

  // Net imposable = brut − absences non justifiées − CNPS salariale − retenues retard
  const netImposable = round2(grossPay - absentDeduction - cnpsEmployee - lateDeductionAmount - absenceFinancialImpact);

  // IRPP au barème progressif (paramétrable)
  const irppItem = items.find((i) => i.code === "IRPP");
  const scale = ((irppItem?.params?.scale as Array<{ max: number | null; rate: number }>) ?? []);
  const irpp = progressiveTax(netImposable, scale);
  push("IRPP", "IRPP — retenue à la source", irpp, "retenue");

  // Net à payer = brut − absences − CNPS − IRPP − avances récupérées − retenues manuelles − retenues retard − impact absences
  const netPay = round2(grossPay - absentDeduction - cnpsEmployee - irpp - manualDeduction - advanceRecoveryTotal - lateDeductionAmount - absenceFinancialImpact);

  const totalEarnings = round2(grossPay);
  const totalDeductions = round2(lines.filter((l) => l.direction === "retenue").reduce((s, l) => s + l.amount, 0));

  return {
    lines,
    grossPay,
    totalEarnings,
    totalDeductions,
    cnpsEmployee,
    cnpsEmployer,
    netImposable,
    irpp,
    netPay,
    advanceRecoveries,
  };
}