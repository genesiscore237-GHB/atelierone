/**
 * RH — SITUATION RH & PAIE — ANALYSE DE PÉRIODE (pur, sans DB).
 * Moteur de lecture agrégée : segmentation salariale (§E0), reconstruction des
 * solides d'avances (§14), état de période (MIXTE §15), projection pure de paie
 * (déléguée à calculatePayroll — seule source de formule), anomalies
 * permission-aware (§20/§21), origine des valeurs (§22), timeline journalière
 * (§23). Aucune écriture : rien ici ne prépare ni ne clôture quoi que ce soit.
 * Contrat : DOC/RH/SITUATION_RH_PAIE_API_CONTRACT.md (VERROUILLÉ 2026-09-28).
 */

import {
  calculatePayroll,
  joursOuvres,
  normaliserModePaie,
  type PayMode,
  type PayrollConfigItem,
  type PayrollInput,
  type PayrollResult,
} from "./payroll-engine";
import { analyserPeriode, type PeriodeAnalyse } from "./rh-stats-engine";
import { tauxHoraire } from "./rh-posture-engine";

export type { PeriodeAnalyse } from "./rh-stats-engine";
export type { PayrollConfigItem } from "./payroll-engine";

// ─── Types partagés du contrat (§G) — définitions uniques ───

export type SortSituation = "nom" | "matricule" | "joursAbsence" | "heures" | "retardTotalMinutes" | "net";
export const SORT_SITUATION_WHITELIST = [
  "nom",
  "matricule",
  "joursAbsence",
  "heures",
  "retardTotalMinutes",
  "net",
] as const satisfies readonly SortSituation[];

export type TypeAnomalie = "ANOMALIE_DONNEE" | "ALERTE_METIER" | "INFORMATION";
export type Gravite = "CRITIQUE" | "ATTENTION" | "INFO";

export interface Anomalie {
  code: string;
  type: TypeAnomalie;
  gravite: Gravite;
  titre: string;
  description: string;
  employeeId: number;
  periode: { from: string; to: string };
  valeurObservee: string | number | null;
  seuil: string | number | null;
  source: string;
  actionsDisponibles: Array<{ label: string; href: string }>;
}

export interface SegmentSalaire {
  dateDebut: string;
  dateFin: string;
  baseSalary: number | null;
  modePaie: string | null;
  forfaitHebdomadaire: number | null;
  source: "historique" | "fiche";
  startDate: string;
}

export interface SalairesRow {
  baseContractuelle: number | null;
  gains: number | null;
  retenues: number | null;
  net: number | null;
  netLabel: "REEL" | "ESTIME";
  segments: SegmentSalaire[];
  tauxHoraire: number | null;
  bulletinExiste: boolean;
}

export interface AvancesRow {
  avancePeriode: number;
  recuperePeriode: number;
  soldeFinPeriode: number;
  soldeActuel: number;
  nbAvances: number;
}

export interface LigneSituation {
  employeeId: number;
  matricule: string;
  prenom: string | null;
  nom: string;
  departement: string | null;
  statut: string | null;
  mode: string | null;
  joursTheoriques: number;
  joursPresence: number;
  joursAbsence: number;
  joursConges: number;
  joursMuets: number;
  heuresTheoriques: number;
  heuresTravaillees: number;
  heuresNormales: number;
  heuresSupp: number;
  retardTotalMinutes: number;
  departAnticipeTotalMinutes: number;
  tauxPresence: number | null;
  salaires: SalairesRow | null;
  avances: AvancesRow | null;
  anomalies: Anomalie[];
}

export interface AgregatsSituation {
  employes: number;
  joursTheoriques: number;
  joursPresence: number;
  joursAbsence: number;
  joursConges: number;
  heuresTravaillees: number;
  retardTotalMinutes: number;
  masseAcquise: number | null;
  avancePeriode: number | null;
  recuperePeriode: number | null;
  soldeFinPeriode: number | null;
  soldeActuel: number | null;
}

export interface EtatMois {
  mois: string;
  label: string;
  etat: "CLOTURE" | "EN_COURS";
  source: Array<"payroll_periods" | "attendance_monthly_summaries">;
}

export interface EtatPeriode {
  global: "EN_COURS" | "PARTIELLEMENT_CLOTUREE" | "CLOTUREE" | "MIXTE";
  mois: EtatMois[];
}

export type EtatJourDetail =
  | "PRESENT"
  | "ABSENT"
  | "CONGE"
  | "MUET"
  | "JOURNEE_EN_COURS"
  | "NON_COMPTABILISE";

export interface JourDetail {
  date: string;
  jour: string;
  arrivee: string | null;
  pauseSortie: string | null;
  retour: string | null;
  depart: string | null;
  travailMinutes: number | null;
  retardMinutes: number | null;
  heuresSuppMinutes: number | null;
  etat: EtatJourDetail;
  provisoire: boolean;
}

export interface OrigineValeur {
  valeur: string;
  montant: number;
  source: string;
  regle: string;
  evenements: string[];
  salaireApplicable: number | null;
  baseCalcul: string;
}

// ─── Segmentation salariale (§E0) ───

export interface EmpFicheSalaire {
  baseSalary: number | null;
  modePaie: string | null;
  forfaitHebdomadaire: number | null;
}

export interface HistoSalaire {
  startDate: string;
  endDate?: string | null;
  baseSalary: string | number | null;
  modePaie?: string | null;
  forfaitHebdomadaire?: string | number | null;
}

const numOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * §E0 — Segmentation des salaires sur [from, to].
 * Bornes = `from` + chaque employee_salary_history.startDate strictement dans
 * (from, to]. Pour chaque borne, la valeur applicable est le dernier historique
 * dont startDate <= borne et dont endDate couvre encore la borne ; à défaut,
 * la fiche employé (source "fiche"). Jamais de « dernier startDate unique »
 * (règle rhPosture.salaireIntervalle interdite pour cette capacité).
 */
export function segmenterSalaires(opts: {
  fiche: EmpFicheSalaire;
  historique: HistoSalaire[];
  from: string;
  to: string;
}): SegmentSalaire[] {
  const { fiche, historique, from, to } = opts;
  if (!from || !to || to < from) return [];

  const bornes = new Set<string>([from]);
  for (const h of historique) {
    const d = String(h.startDate).slice(0, 10);
    if (d > from && d <= to) bornes.add(d);
  }
  const dates = [...bornes].sort();

  const segments: SegmentSalaire[] = [];
  for (let i = 0; i < dates.length; i++) {
    const dateDebut = dates[i];
    const prochaine = dates[i + 1];
    const finExclusive = prochaine ?? null;
    const dateFin = finExclusive
      ? new Date(new Date(`${finExclusive}T12:00:00`).getTime() - 86400000).toISOString().slice(0, 10)
      : to;
    if (dateFin < dateDebut || dateDebut > to) continue;

    const gouvernants = historique
      .filter((h) => {
        const d = String(h.startDate).slice(0, 10);
        const end = h.endDate ? String(h.endDate).slice(0, 10) : null;
        return d <= dateDebut && (!end || end >= dateDebut);
      })
      .sort((a, b) => (String(a.startDate) < String(b.startDate) ? 1 : -1));

    const g = gouvernants[0];
    if (g) {
      segments.push({
        dateDebut,
        dateFin,
        baseSalary: numOrNull(g.baseSalary),
        modePaie: normaliserModePaie(g.modePaie),
        forfaitHebdomadaire: numOrNull(g.forfaitHebdomadaire),
        source: "historique",
        startDate: String(g.startDate).slice(0, 10),
      });
    } else {
      segments.push({
        dateDebut,
        dateFin,
        baseSalary: numOrNull(fiche.baseSalary),
        modePaie: normaliserModePaie(fiche.modePaie),
        forfaitHebdomadaire: numOrNull(fiche.forfaitHebdomadaire),
        source: "fiche",
        startDate: dateDebut,
      });
    }
  }
  return segments;
}

export function modeNormaliseSegments(segments: SegmentSalaire[]): PayMode | null {
  if (!segments.length) return null;
  const modes = segments.map((s) => s.modePaie);
  const unique = [...new Set(modes)];
  return unique.length === 1 ? (unique[0] as PayMode) : null;
}

// ─── Avances — reconstruction déterministe des soldes (§14) ───

export interface AvanceLecture {
  id: number;
  montant: number;
  dateVersement: string;
  statut: string | null | undefined;
  soldeRestant: number;
  recuperationDebut?: string | null;
  recuperationFin?: string | null;
}

export interface RecuperationLecture {
  advanceId: number;
  dateRecuperation: string;
  montant: number;
}

/** Solde livre d'une avance à une date : montant − Σ récupérations <= date, jamais négatif. */
export function soldeAvanceAFin(avance: { id: number; montant: number }, recoveries: RecuperationLecture[], au: string): number {
  const recup = recoveries
    .filter((r) => r.advanceId === avance.id && String(r.dateRecuperation).slice(0, 10) <= au)
    .reduce((s, r) => s + Number(r.montant || 0), 0);
  const solde = avance.montant - recup;
  return Math.max(0, solde);
}

/**
 * §14 — Quatre indicateurs d'avances pour la période.
 * avancePeriode   : Σ montants versés dans [from,to]
 * recuperePeriode : Σ récupérations dont dateRecuperation ∈ [from,to]
 * soldeFinPeriode : Σ (montant − Σ récup <= to), borne ≥ 0 — RECONSTRUIT
 * soldeActuel     : Σ solde_restant courant (DB) — jamais mélangé
 * Le solde reconstruit ne lit JAMAIS employee_advances.solde_restant (ordre des
 * opérations avances ≠ paie) : garantie d'indépendance vis-à-vis du moteur avances.
 */
export function calculerAvancesRow(opts: {
  advances: AvanceLecture[];
  recoveries: RecuperationLecture[];
  from: string;
  to: string;
}): AvancesRow {
  const { advances, recoveries, from, to } = opts;
  const versees = advances.filter((a) => {
    const d = String(a.dateVersement).slice(0, 10);
    return d >= from && d <= to;
  });
  const avancePeriode = versees.reduce((s, a) => s + a.montant, 0);
  const recuperePeriode = recoveries
    .filter((r) => {
      const d = String(r.dateRecuperation).slice(0, 10);
      return d >= from && d <= to;
    })
    .reduce((s, r) => s + Number(r.montant || 0), 0);
  const soldeFinPeriode = advances.reduce(
    (s, a) => s + soldeAvanceAFin(a, recoveries, to),
    0
  );
  const soldeActuel = advances.reduce((s, a) => s + (Number(a.soldeRestant) || 0), 0);
  return {
    avancePeriode: Math.round(avancePeriode * 100) / 100,
    recuperePeriode: Math.round(recuperePeriode * 100) / 100,
    soldeFinPeriode: Math.round(soldeFinPeriode * 100) / 100,
    soldeActuel: Math.round(soldeActuel * 100) / 100,
    nbAvances: versees.length,
  };
}

// ─── État de période (MIXTE, §15) ───

export interface PerioPaieLecture {
  startDate: string;
  endDate: string;
  status: string;
}

export interface ResuMoisLecture {
  year: number;
  month: number;
  locked: boolean;
}

const JOURS_SEMAINE = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function listeMoisCivils(from: string, to: string): string[] {
  const mois: string[] = [];
  const cur = new Date(`${from}T12:00:00`);
  cur.setDate(1);
  const fin = new Date(`${to}T12:00:00`);
  while (cur <= fin) {
    mois.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
    cur.setDate(1);
  }
  return mois;
}

export function libelleMois(mois: string): string {
  const [y, m] = mois.split("-").map(Number);
  return `${MOIS_FR[m - 1] ?? ""} ${y}`.trim();
}

/**
 * §15 — État de chaque mois civil couvert et état global.
 * Un mois est CLOTURÉ si la période de paie close couvre TOUT le mois OU le
 * résumé présence est locked. CLOTUREE = tous closes par les deux sources ;
 * PARTIELLEMENT_CLOTUREE = tous closes mais pas par les deux sources (paie
 * close sans présence verrouillée, ou inverse) ; MIXTE si au moins un mois
 * clos + un mois encore en cours ; sinon EN_COURS.
 */
export function calculerEtatPeriode(opts: {
  from: string;
  to: string;
  payrollPeriods: PerioPaieLecture[];
  summaries: ResuMoisLecture[];
}): EtatPeriode {
  const { from, to, payrollPeriods, summaries } = opts;
  const moisList = listeMoisCivils(from, to);
  const moisCivils: EtatMois[] = moisList.map((mois) => {
    const [y, m] = mois.split("-").map(Number);
    const debutM = `${mois}-01`;
    const finM = `${mois}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const paieClose = payrollPeriods.some(
      (p) => p.status === "closed" && p.startDate <= debutM && p.endDate >= finM
    );
    const presenceLocked = summaries.some((s) => s.year === y && s.month === m && s.locked);
    const source: EtatMois["source"] = [];
    if (paieClose) source.push("payroll_periods");
    if (presenceLocked) source.push("attendance_monthly_summaries");
    return {
      mois,
      label: libelleMois(mois),
      etat: paieClose || presenceLocked ? "CLOTURE" : "EN_COURS",
      source,
    };
  });

  const closes = moisCivils.filter((m) => m.etat === "CLOTURE").length;
  const enCours = moisCivils.length - closes;
  let global: EtatPeriode["global"];
  if (closes > 0 && enCours > 0) {
    global = "MIXTE";
  } else if (closes > 0 && moisCivils.every((m) => m.source.length === 2)) {
    global = "CLOTUREE";
  } else if (closes > 0) {
    global = "PARTIELLEMENT_CLOTUREE";
  } else {
    global = "EN_COURS";
  }
  return { global, mois: moisCivils };
}

// ─── Projection pure de paie (calculatePayroll = seule source) ───

export interface ContextProjection {
  modePaie: PayMode;
  baseSalary: number;
  forfaitHebdomadaire: number;
  overtimeHours: number;
  daysPresent: number;
  daysAbsent: number;
  expectedWorkingDays: number;
  normalHours: number;
  taskBonus: number;
  lateDeductionAmount: number;
  absenceFinancialImpact: number;
  items: PayrollConfigItem[];
  advancesToRecover: Array<{ advanceId: number; amount: number }>;
  standardMonthlyHours: number;
  overtimeMultiplier: number;
  weeksInPeriod: number;
}

/** Construction de l'entrée du moteur de paie (délégué — aucune formule ici). */
export function construireInputPaie(c: ContextProjection): PayrollInput {
  const payOnHours = c.modePaie === "SALAIRE_HORAIRE" || c.modePaie === "NON_REMUNERE";
  return {
    modePaie: c.modePaie,
    baseSalary: c.baseSalary,
    forfaitHebdomadaire: c.forfaitHebdomadaire,
    overtimeHours: c.overtimeHours,
    daysPresent: c.daysPresent,
    daysAbsent: c.daysAbsent,
    expectedWorkingDays: c.expectedWorkingDays,
    performanceBonus: 0,
    manualAdjustments: [],
    items: c.items,
    advancesToRecover: c.advancesToRecover,
    lateDeductionAmount: c.lateDeductionAmount,
    absenceFinancialImpact: c.absenceFinancialImpact,
    normalHours: c.normalHours,
    taskBonus: c.taskBonus,
    standardMonthlyHours: c.standardMonthlyHours,
    overtimeMultiplier: c.overtimeMultiplier,
    payOnHours,
    weeksInPeriod: c.weeksInPeriod,
  };
}

export interface ProjectionResult {
  result: PayrollResult;
  gains: number;
  retenues: number;
  net: number;
  tauxHoraire: number;
}

/** Projection d'une période (lecture) — mêmes entrées que prepareMonth, zéro écriture. */
export function projeterPaie(c: ContextProjection): ProjectionResult {
  const result = calculatePayroll(construireInputPaie(c));
  return {
    result,
    gains: result.totalEarnings,
    retenues: result.totalDeductions,
    net: result.netPay,
    tauxHoraire: tauxHoraire(c.baseSalary, c.standardMonthlyHours || 225.3),
  };
}

/** Une période de paie close couvre-t-elle intégralement [from, to] ? */
export function couvertureBulletin(opts: {
  periods: Array<{ id: number; startDate: string; endDate: string; status: string }>;
  entries: Array<{ employeeId: number; periodId: number; netPay: number | string | null }>;
  employeeId: number;
  from: string;
  to: string;
}): { periodId: number; net: number } | null {
  for (const p of opts.periods) {
    if (p.status !== "closed") continue;
    if (!(p.startDate <= opts.from && p.endDate >= opts.to)) continue;
    const e = opts.entries.find((x) => x.employeeId === opts.employeeId && x.periodId === p.id);
    if (e && e.netPay !== null && e.netPay !== undefined) {
      return { periodId: p.id, net: Number(e.netPay) };
    }
  }
  return null;
}

// ─── Anomalies (recalculées à chaque lecture, jamais persistées) ───

export const SEUILS_ANOMALIE_DEFAUT = {
  absenceTaux: 0.5,          // part d'absent × jours théoriques au-delà de laquelle absence élevée
  retardMinutes: 60,         // cumul de retard min considéré important
  salaireMultiple: 3,        // gains > base × 3 → salaire inhabituel
  soldeAvanceMultiple: 1.5,  // solde d'avances > base × 1,5 → important
  avancePeriodeMultiple: 1,  // avances versées > base × 1 → supérieure au salaire
  ecartBulletin: 1,          // écart budget réel/projection (FCFA) tolérable
} as const;

export type SeuilsAnomalie = Partial<typeof SEUILS_ANOMALIE_DEFAUT>;

/** Familles d'anomalies révélant des données protégées (masquées sans rh.salaire.consulter). */
export const FAMILLES_SENSIBLES_SALAIRE = new Set<string>([
  "SALAIRE_INHABITUEL",
  "AVANCE_SUPERIEURE_SALAIRE",
  "SOLDE_AVANCE_IMPORTANT",
  "NET_NEGATIF",
  "BULLETIN_DIFFERENT_PROJECTION",
  "SALAIRE_SANS_CONTRAT",
  "RECUPERATION_IMPOSSIBLE",
]);

export interface ContexteAnomalie {
  periode: { from: string; to: string };
  employe: {
    employeeId: number;
    matricule: string;
    nom: string;
    prenom: string | null;
    statut: string | null;
    departement: string | null;
    mode: PayMode | null;
    contratExiste: boolean;
    dateEmbauche: string | null;
    dateSortie: string | null;
  };
  presence: PeriodeAnalyse;
  salaires: SalairesRow | null;
  avances: AvancesRow | null;
  projectionNet: number | null;
  bulletinNet: number | null;
  today: string;
  seuils?: SeuilsAnomalie;
}

/** Format monétaire FR avec espaces normales (stable pour tests et CSV). */
function fmtMontant(n: number): string {
  return n.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
}

const fmtF = (n: number | null | undefined): string =>
  n === null || n === undefined ? "" : `${fmtMontant(n)} F`;

function routeEmploye(id: number): string {
  return `/dashboard/rh/employes/${id}`;
}

/**
 * §20/§21 — Moteur d'anomalies de période (déterministe, rejoué à chaque lecture).
 * Retourne la liste triée par gravité (CRITIQUE > ATTENTION > INFO) puis code.
 * Les montants protégés n'apparaissent QUE dans les familles sensibles, qui sont
 * supprimées par filtrerAnomaliesParPermission lorsque l'utilisateur n'a pas
 * rh.salaire.consulter — aucune anomalie « générique montrant un € ».
 */
export function construireAnomalies(c: ContexteAnomalie): Anomalie[] {
  const s = { ...SEUILS_ANOMALIE_DEFAUT, ...(c.seuils ?? {}) };
  const { from, to } = c.periode;
  const out: Anomalie[] = [];
  const base = {
    employeeId: c.employe.employeeId,
    periode: { from, to },
  };

  const p = c.presence;
  const sal = c.salaires;
  const av = c.avances;

  // ANOMALIE_DONNEE — qualité des données
  if (!c.employe.contratExiste) {
    out.push({
      ...base,
      code: "CONTRAT_MANQUANT",
      type: "ANOMALIE_DONNEE",
      gravite: "CRITIQUE",
      titre: "Contrat introuvable",
      description: `${c.employe.prenom ?? ""} ${c.employe.nom}`.trim() + ", employé sans contrat renseigné : la cohérence contrat/paie est non vérifiable.",
      valeurObservee: null,
      seuil: "contrat obligatoire",
      source: "employe_contrat",
      actionsDisponibles: [{ label: "Voir la fiche", href: routeEmploye(c.employe.employeeId) }],
    });
  }
  if (!c.employe.statut) {
    out.push({
      ...base,
      code: "STATUT_MANQUANT",
      type: "ANOMALIE_DONNEE",
      gravite: "ATTENTION",
      titre: "Statut employé manquant",
      description: "Aucun statut renseigné pour cet employé : présence et paie reposent sur une donnée absente.",
      valeurObservee: null,
      seuil: "statut renseigné",
      source: "employes.statut",
      actionsDisponibles: [{ label: "Voir la fiche", href: routeEmploye(c.employe.employeeId) }],
    });
  }
  const mode = c.employe.mode;
  if (!mode) {
    out.push({
      ...base,
      code: "MODE_REMUNERATION_MANQUANT",
      type: "ANOMALIE_DONNEE",
      gravite: "ATTENTION",
      titre: "Mode de rémunération manquant",
      description: "Mode de rémunération absent : la projection de paie utilise la valeur héritée par défaut.",
      valeurObservee: null,
      seuil: "mode renseigné",
      source: "employes.mode_paie",
      actionsDisponibles: [{ label: "Voir la fiche", href: routeEmploye(c.employe.employeeId) }],
    });
  }

  // INFORMATION — pointages
  if (p.joursMuets > 0 && p.joursTheoriques > 0) {
    out.push({
      ...base,
      code: "JOURNEE_INCOMPLETE",
      type: "INFORMATION",
      gravite: "INFO",
      titre: "Journées non pointées",
      description: `${p.joursMuets} jour(s) comptable(s) sans saisie de pointage sur la période.`,
      valeurObservee: p.joursMuets,
      seuil: "0 journée muette",
      source: "attendance_calculations",
      actionsDisponibles: [{ label: "Ouvrir les présences", href: "/dashboard/rh/presences" }],
    });
  }
  if (p.heuresNormales > 0 && p.joursPresence === 0) {
    out.push({
      ...base,
      code: "POINTAGE_INCOHERENT",
      type: "INFORMATION",
      gravite: "ATTENTION",
      titre: "Pointage incohérent",
      description: `${p.heuresNormales} h comptées alors qu'aucun jour de présence n'est compté sur la période.`,
      valeurObservee: `${p.heuresNormales} h`,
      seuil: "présence > 0 si heures > 0",
      source: "attendance_calculations",
      actionsDisponibles: [{ label: "Ouvrir les présences", href: "/dashboard/rh/presences" }],
    });
  }
  if (p.retardTotalMinutes >= s.retardMinutes) {
    out.push({
      ...base,
      code: "RETARDS_IMPORTANTS",
      type: "ALERTE_METIER",
      gravite: "ATTENTION",
      titre: "Retards cumulés importants",
      description: `${p.retardTotalMinutes} min de retard cumulées sur la période (≥ ${s.retardMinutes} min).`,
      valeurObservee: `${p.retardTotalMinutes} min`,
      seuil: `${s.retardMinutes} min`,
      source: "attendance_calculations.late_minutes",
      actionsDisponibles: [{ label: "Ouvrir les présences", href: "/dashboard/rh/presences" }],
    });
  }
  if (p.tauxPresence !== null && p.joursTheoriques > 0 && p.joursAbsence / p.joursTheoriques > s.absenceTaux) {
    out.push({
      ...base,
      code: "ABSENCE_ELEVEE",
      type: "ALERTE_METIER",
      gravite: "ATTENTION",
      titre: "Taux d'absence élevé",
      description: `${p.joursAbsence} jour(s) d'absence sur ${p.joursTheoriques} jour(s) comptable(s) (${Math.round((p.joursAbsence / p.joursTheoriques) * 100)} %).`,
      valeurObservee: `${p.joursAbsence} sur ${p.joursTheoriques}`,
      seuil: `> ${s.absenceTaux * 100} %`,
      source: "attendance_calculations.is_absent",
      actionsDisponibles: [{ label: "Ouvrir les présences", href: "/dashboard/rh/presences" }],
    });
  }

  if (!sal) {
    return trierAnomalies(out);
  }

  // ALERTE_METIER — rémunération (protégée)
  if (c.employe.mode === "SALAIRE_MENSUEL" || c.employe.mode === "FORFAIT_HEBDOMADAIRE") {
    const baseC = sal.baseContractuelle ?? 0;
    if (baseC > 0 && (sal.gains ?? 0) > baseC * s.salaireMultiple) {
      out.push({
        ...base,
        code: "SALAIRE_INHABITUEL",
        type: "ALERTE_METIER",
        gravite: "ATTENTION",
        titre: "Salaires inhabituellement élevés",
        description: `Gains projetés ${fmtF(sal.gains)} pour une base contractuelle de ${fmtF(baseC)} (> ×3).`,
        valeurObservee: sal.gains ?? 0,
        seuil: `base × ${s.salaireMultiple}`,
        source: "employee_salary_history / calculatePayroll",
        actionsDisponibles: [{ label: "Voir la fiche", href: routeEmploye(c.employe.employeeId) }],
      });
    }
  }
  if (sal.net !== null && sal.net < 0) {
    out.push({
      ...base,
      code: "NET_NEGATIF",
      type: "ALERTE_METIER",
      gravite: "CRITIQUE",
      titre: "Net projeté négatif",
      description: "La projection de paie aboutit à un net négatif (retenues supérieures au brut) : le bulletin serait refusé à la préparation.",
      valeurObservee: sal.net ?? 0,
      seuil: "net ≥ 0",
      source: "calculatePayroll.netPay",
      actionsDisponibles: [{ label: "Ouvrir la paie", href: "/dashboard/rh/paie" }],
    });
  }
  if (sal.bulletinExiste && c.bulletinNet !== null && c.projectionNet !== null) {
    const ecart = Math.abs(c.bulletinNet - c.projectionNet);
    if (ecart > s.ecartBulletin) {
      out.push({
        ...base,
        code: "BULLETIN_DIFFERENT_PROJECTION",
        type: "ALERTE_METIER",
        gravite: "ATTENTION",
        titre: "Bulletin différent de la projection",
        description: `Écart de ${fmtF(ecart)} entre le bulletin réel (${fmtF(c.bulletinNet)}) et la projection de lecture (${fmtF(c.projectionNet)}).`,
        valeurObservee: ecart,
        seuil: `≤ ${s.ecartBulletin} F`,
        source: "payroll_entries.net_pay vs calculatePayroll",
        actionsDisponibles: [{ label: "Ouvrir la paie", href: "/dashboard/rh/paie" }],
      });
    }
  }
  if (!c.employe.contratExiste && sal.baseContractuelle) {
    out.push({
      ...base,
      code: "SALAIRE_SANS_CONTRAT",
      type: "ALERTE_METIER",
      gravite: "ATTENTION",
      titre: "Salaire sans contrat",
      description: "Une base de rémunération existe mais aucun contrat n'est référencé.",
      valeurObservee: null,
      seuil: "contrat présent si base > 0",
      source: "employee_salary_history",
      actionsDisponibles: [{ label: "Voir la fiche", href: routeEmploye(c.employe.employeeId) }],
    });
  }

  if (av) {
    const baseC = sal.baseContractuelle ?? 0;
    if (av.avancePeriode > 0 && baseC > 0 && av.avancePeriode > baseC * s.avancePeriodeMultiple) {
      out.push({
        ...base,
        code: "AVANCE_SUPERIEURE_SALAIRE",
        type: "ALERTE_METIER",
        gravite: "ATTENTION",
        titre: "Avances supérieures au salaire",
        description: `Avances versées sur la période ${fmtF(av.avancePeriode)} > base ${fmtF(baseC)} : le plafond de versement (salaire mensuel) est dépassé.`,
        valeurObservee: av.avancePeriode,
        seuil: `base × ${s.avancePeriodeMultiple}`,
        source: "employee_advances",
        actionsDisponibles: [{ label: "Voir la fiche", href: routeEmploye(c.employe.employeeId) }],
      });
    }
    if (baseC > 0 && av.soldeFinPeriode > baseC * s.soldeAvanceMultiple) {
      out.push({
        ...base,
        code: "SOLDE_AVANCE_IMPORTANT",
        type: "ALERTE_METIER",
        gravite: "ATTENTION",
        titre: "Solde d'avances important",
        description: `Solde d'avances reconstruit ${fmtF(av.soldeFinPeriode)} (> base × ${s.soldeAvanceMultiple}).`,
        valeurObservee: av.soldeFinPeriode,
        seuil: `base × ${s.soldeAvanceMultiple}`,
        source: "advance_recoveries (reconstruit)",
        actionsDisponibles: [{ label: "Voir la fiche", href: routeEmploye(c.employe.employeeId) }],
      });
    }
    if (av.soldeActuel > 0 && (c.employe.statut === "sorti" || c.employe.statut === "archivé")) {
      out.push({
        ...base,
        code: "RECUPERATION_IMPOSSIBLE",
        type: "ALERTE_METIER",
        gravite: "CRITIQUE",
        titre: "Récupération impossible",
        description: `Solde d'avances de ${fmtF(av.soldeActuel)} pour un employé ${c.employe.statut === "sorti" ? "sorti" : "archivé"} : aucune récupération par la paie possible.`,
        valeurObservee: av.soldeActuel,
        seuil: "0 F",
        source: "employee_advances.solde_restant",
        actionsDisponibles: [{ label: "Voir la fiche", href: routeEmploye(c.employe.employeeId) }],
      });
    }
  }

  return trierAnomalies(out);
}

const GRAVITE_ORDRE: Record<Gravite, number> = { CRITIQUE: 0, ATTENTION: 1, INFO: 2 };

function trierAnomalies(anomalies: Anomalie[]): Anomalie[] {
  return [...anomalies].sort((a, b) => {
    const g = GRAVITE_ORDRE[a.gravite] - GRAVITE_ORDRE[b.gravite];
    return g !== 0 ? g : a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
}

/** §20 — Retire les anomalies révélant des montants protégés sans la permission. */
export function filtrerAnomaliesParPermission(anomalies: Anomalie[], canSeeSalary: boolean): Anomalie[] {
  if (canSeeSalary) return anomalies;
  return anomalies.filter((a) => !FAMILLES_SENSIBLES_SALAIRE.has(a.code));
}

export function resumerAnomalies(rows: LigneSituation[]): {
  total: number;
  parType: Record<TypeAnomalie, number>;
  parGravite: Record<Gravite, number>;
} {
  const parType: Record<TypeAnomalie, number> = { ANOMALIE_DONNEE: 0, ALERTE_METIER: 0, INFORMATION: 0 };
  const parGravite: Record<Gravite, number> = { CRITIQUE: 0, ATTENTION: 0, INFO: 0 };
  for (const r of rows) {
    for (const a of r.anomalies) {
      parType[a.type] += 1;
      parGravite[a.gravite] += 1;
    }
  }
  return { total: rows.reduce((s, r) => s + r.anomalies.length, 0), parType, parGravite };
}

// ─── Agrégats carte (même jeu filtré que les lignes) ───

export function agregerLignes(rows: LigneSituation[], canSeeSalary: boolean): AgregatsSituation {
  const out: AgregatsSituation = {
    employes: rows.length,
    joursTheoriques: 0,
    joursPresence: 0,
    joursAbsence: 0,
    joursConges: 0,
    heuresTravaillees: 0,
    retardTotalMinutes: 0,
    masseAcquise: null,
    avancePeriode: null,
    recuperePeriode: null,
    soldeFinPeriode: null,
    soldeActuel: null,
  };
  for (const r of rows) {
    out.joursTheoriques += r.joursTheoriques;
    out.joursPresence += r.joursPresence;
    out.joursAbsence += r.joursAbsence;
    out.joursConges += r.joursConges;
    out.heuresTravaillees = Math.round((out.heuresTravaillees + r.heuresTravaillees) * 100) / 100;
    out.retardTotalMinutes += r.retardTotalMinutes;
  }
  if (canSeeSalary) {
    let masse = 0, avP = 0, recP = 0, solFin = 0, solAct = 0;
    for (const r of rows) {
      masse += r.salaires?.gains ?? 0;
      avP += r.avances?.avancePeriode ?? 0;
      recP += r.avances?.recuperePeriode ?? 0;
      solFin += r.avances?.soldeFinPeriode ?? 0;
      solAct += r.avances?.soldeActuel ?? 0;
    }
    out.masseAcquise = Math.round(masse * 100) / 100;
    out.avancePeriode = Math.round(avP * 100) / 100;
    out.recuperePeriode = Math.round(recP * 100) / 100;
    out.soldeFinPeriode = Math.round(solFin * 100) / 100;
    out.soldeActuel = Math.round(solAct * 100) / 100;
  }
  return out;
}

// ─── Tri serveur (whitelist — jamais de tri client sur la page courante) ───

export function trierLignes(
  rows: LigneSituation[],
  sort: SortSituation,
  dir: "asc" | "desc"
): LigneSituation[] {
  const mult = dir === "asc" ? 1 : -1;
  const val = (r: LigneSituation): string | number => {
    switch (sort) {
      case "nom":
        return `${r.nom} ${r.prenom ?? ""}`.trim().toLocaleLowerCase("fr");
      case "matricule":
        return r.matricule.toLocaleLowerCase("fr");
      case "joursAbsence":
        return r.joursAbsence;
      case "heures":
        return r.heuresTravaillees;
      case "retardTotalMinutes":
        return r.retardTotalMinutes;
      case "net":
        return r.salaires?.net ?? Number.NEGATIVE_INFINITY;
    }
  };
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * mult;
    }
    return String(va).localeCompare(String(vb), "fr") * mult;
  });
}

// ─── Timeline journalière (§23 BLOC 3) ───

export interface CalcJour {
  codePresence: string | null;
  isAbsent: boolean | null;
  workedMinutes: number | null;
  normalMinutes: number | null;
  overtimeMinutes: number | null;
  lateMinutes: number | null;
  earlyDepartureMinutes: number | null;
}

export interface SaisieJour {
  timeIn: string | null;
  timeInBreak: string | null;
  timeOutBreak: string | null;
  timeOut: string | null;
  validated: boolean;
}

const CODES_CONGE_TIMELINE = new Set(["C", "M", "O", "F"]);

/**
 * §23 — Classification quotidienne (miroir de classifierJour + état du jour).
 * NON_COMPTABILISE : dimanche/férié/hors période d'emploi/jour non ouvré/futur.
 * JOURNEE_EN_COURS : date = aujourd'hui sans départ pointé — provisoire.
 * MUET : jour comptable sans saisie (avant aujourd'hui).
 */
export function classifierJourDetail(opts: {
  date: string;
  isWorkingDay: boolean;
  calc: CalcJour | null;
  saisie: SaisieJour | null;
  today: string;
}): JourDetail {
  const { date, isWorkingDay, calc, saisie, today } = opts;
  const jour = JOURS_SEMAINE[new Date(`${date}T12:00:00`).getDay()] ?? "";
  const times = {
    date,
    jour,
    arrivee: saisie?.timeIn ?? null,
    pauseSortie: saisie?.timeInBreak ?? null,
    retour: saisie?.timeOutBreak ?? null,
    depart: saisie?.timeOut ?? null,
    travailMinutes: calc?.workedMinutes ?? null,
    retardMinutes: calc?.lateMinutes ?? null,
    heuresSuppMinutes: calc?.overtimeMinutes ?? null,
  };

  if (!isWorkingDay || date > today) {
    return { ...times, etat: "NON_COMPTABILISE", provisoire: false };
  }
  const code = calc?.codePresence ?? (saisie ? "P" : null);
  if (code && CODES_CONGE_TIMELINE.has(code)) {
    return { ...times, etat: "CONGE", provisoire: false };
  }
  if (calc?.isAbsent || code === "A") {
    return { ...times, etat: "ABSENT", provisoire: false };
  }
  if (date === today && !(saisie?.timeOut)) {
    return { ...times, etat: "JOURNEE_EN_COURS", provisoire: true };
  }
  if (saisie || (calc && code)) {
    return { ...times, etat: "PRESENT", provisoire: !!saisie && !saisie.validated || date === today };
  }
  return { ...times, etat: "MUET", provisoire: false };
}

// ─── Origine des valeurs (§22) ───

/** Coquille du règle/regle par code de ligne (déterministe pour l'affichage). */
const REGLE_PAR_CODE: Record<string, { regle: string; source: string }> = {
  BASE: { regle: "base_param", source: "Payroll R4" },
  BASE_JOURNALIER: { regle: "taux_journalier_jours_presents", source: "Payroll R4" },
  HN: { regle: "heures_normales_taux", source: "Payroll R4" },
  FORFAIT: { regle: "forfait_semaines", source: "Payroll R4" },
  CNPS_EMPLOYE: { regle: "percent_salaire", source: "Payroll R4" },
  IRPP: { regle: "bareme_progressif", source: "Payroll R4" },
  AVANCE_RECUP: { regle: "recovery", source: "Avances" },
  RETARD_DED: { regle: "late_deduction", source: "Payroll R4" },
  ABSENCE_IMPACT: { regle: "absence_impact", source: "Payroll R4" },
  PRIME_TACHE: { regle: "task_bonus", source: "Presences" },
  PRIME_PRESENCE: { regle: "percent_assiduite", source: "Payroll R4" },
  PRIME_PERFORMANCE: { regle: "manual", source: "Paie" },
};

/**
 * §22 — Origine détaillée de chaque valeur de la projection.
 * `evenementsParCode` (ex. dates d'absences ou de récupérations) est fourni par
 * le routeur (lecture des journaux réels) — le moteur reste pur.
 */
export function construireOrigine(
  result: PayrollResult,
  ctx: { baseSalary: number; evenementsParCode: Record<string, string[]> }
): OrigineValeur[] {
  const dejaVus = new Set<string>();
  const out: OrigineValeur[] = [];
  for (const l of result.lines) {
    if (dejaVus.has(l.itemCode)) continue;
    dejaVus.add(l.itemCode);
    const meta = REGLE_PAR_CODE[l.itemCode] ?? {
      regle: l.itemCode.toLowerCase(),
      source: "Payroll R4",
    };
    let baseCalcul = "";
    let salaireApplicable: number | null = null;
    if (l.itemCode === "BASE" || l.itemCode === "HN" || l.itemCode === "CNPS_EMPLOYE" || l.itemCode === "FORFAIT") {
      salaireApplicable = ctx.baseSalary;
      baseCalcul = ctx.baseSalary > 0 ? `base ${fmtMontant(ctx.baseSalary)} F` : "";
    } else if (l.itemCode === "BASE_JOURNALIER") {
      salaireApplicable = ctx.baseSalary;
      baseCalcul = ctx.baseSalary > 0 ? `taux journalier ${fmtMontant(ctx.baseSalary)} F × jours présents` : "";
    } else if (l.itemCode === "ABSENCE_IMPACT" || /\bABSENCE\b/.test(l.itemCode)) {
      baseCalcul = ctx.baseSalary > 0 ? `base ${fmtMontant(ctx.baseSalary)} F / jours` : "";
    }
    out.push({
      valeur: l.label,
      montant: l.amount,
      source: meta.source,
      regle: meta.regle,
      evenements: ctx.evenementsParCode[l.itemCode] ?? [],
      salaireApplicable,
      baseCalcul,
    });
  }
  return out;
}