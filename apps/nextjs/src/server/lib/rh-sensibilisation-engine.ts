import { baseEffectifPeriode } from "./payroll-engine";
import { calculateAbsenceImpact, calculateLateDeduction } from "./presence-engine";
import { tauxHoraire } from "./rh-posture-engine";
import type { SegmentSalaire } from "./rh-situation-engine";
import type { PeriodeAnalyse, JourAnalyseInput } from "./rh-stats-engine";
import type { AbsenceTableRow, CalcBrut, DonneesSituation, EmployeBrut } from "./rh-centre-rapports";

/**
 * RPT-03 — MOTEUR DE SENSIBILISATION RH ET D'IMPACTS FINANCIERS ESTIMÉS
 *
 * RÈGLE ABSOLUE (§0, §26) : ce moteur ESTIME, il ne RETIENT rien.
 *
 *   estimatedImpact         = heures non faites × taux horaire du segment
 *   actualPayrollDeduction  = retenue RÉELLE déjà persistée par la paie
 *
 * Les deux montants ne sont jamais mélangés ni comparés comme s'ils
 * désignaient la même chose, et aucun n'écrit en base. Le moteur est PUR : il ne
 * reçoit que des données déjà chargées et ne déclenche aucune requête.
 *
 * Interdits respectés : aucun « 9,5 » figé (les heures viennent de la journée
 * réelle), aucun « 225,3 » figé (le diviseur vient de `standardMonthlyHours`),
 * aucun calcul React, aucun second moteur de présence.
 */

/** §29 — on calcule en pleine précision, on arrondit UNE fois à la restitution. */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
export function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Codes de présence (§3) ────────────────────────────────────────────────

export type CodeJourSensibilisation = "P" | "R" | "HS" | "A" | "MUET" | "C" | "M" | "O" | "F";

/**
 * §3 — « somme des `heuresTheoriques` des jours ouvrés, sans présence
 * comptabilisée, classés MUET ».
 *
 * Extension documentée : un jour coded A ou PAID (C/M/O/F) n'est pas « frais »
 * non plus — §27 exige qu'une absence payée, qui ne génère AUCUNE retenue,
 * génère TOUT DE MÊME un indicateur de sensibilisation. Les codes de présence
 * réelle (P, R, HS) sont donc les seuls exclus.
 *
 * Le détail `absenceHoursMUET` / `absenceHoursJustifiees` est conservé pour que
 * rien ne soit sommé à l'aveugle (§4).
 */
export const CODES_HORAIRES_NON_FAITES: ReadonlySet<string> = new Set(["A", "MUET", "C", "M", "O", "F"]);

/**
 * §21 — Seuls les jours d'absence DÉCLARÉE (code A) peuvent être signalés
 * « non justifiés ».
 *
 * Un jour MUET (aucun pointage) est un défaut de SAISIE, pas une absence
 * constatée : l'accuser de non-justification sur une absence de données serait
 * une faute. Le jour MUET reste compté dans `absenceHours` — c'est un coût
 * financier réel — mais il ne déclenche jamais un signal disciplinaire.
 */
export const CODES_NON_JUSTIFIES: ReadonlySet<string> = new Set(["A"]);

// ── Règles et messages (§17-§21) ──────────────────────────────────────────

export type NiveauSensibilisation = "INFO" | "WARNING" | "CRITICAL";
export type ConditionSensibilisation = "GE" | "GT" | "LE" | "LT" | "EQ";

/** Ligne de `hr_sensibilisation_rules` (§18), normalisée côté moteur. */
export interface RegleSensibilisation {
  code: string;
  label: string;
  niveau: NiveauSensibilisation;
  priorite: number;
  condition: ConditionSensibilisation;
  metrique: string;
  seuil: number;
  message: string;
  actionRecommandee: string;
  active: boolean;
}

/** Les 7 règles exigées par §19. */
export const CODES_REGLES_EXIGEES = [
  "PRESENCE_SATISFAISANTE_RETARDS_ELEVES",
  "ABSENCES_RETARDS_SIGNIFICATIFS",
  "IMPACT_IMPORTANT",
  "IMPACT_TRES_ELEVE",
  "RETARDS_CHRONIQUES",
  "SALAIRE_REFERENCE_INCOHERENT",
  "ABSENCE_NON_JUSTIFIEE",
] as const;

export interface IndicateurMessage {
  valeur: number;
  seuil: number;
  unite: string;
}

export interface AwarenessMessage {
  code: string;
  niveau: NiveauSensibilisation;
  titre: string;
  message: string;
  raison: string;
  indicateurs: Record<string, IndicateurMessage>;
  actionRecommandee: string;
  seuilApplique: number;
}

/** Métriques observables par une règle (§18) : toute règle référence l'une d'elles. */
export const METRIQUES_SENSIBILISATION = [
  "retardMinutes",
  "joursAvecRetard",
  "absenceHours",
  "totalNotWorkedHours",
  "impactPercent",
  "salaireBaseReference",
  "salaireReferenceManquant",
  "joursAbsenceNonJustifiee",
] as const;

export type MetriqueSensibilisation = (typeof METRIQUES_SENSIBILISATION)[number];

const ORDRE_NIVEAU: Record<NiveauSensibilisation, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

function unite(metrique: string): string {
  if (metrique.endsWith("Minutes")) return "min";
  if (metrique.endsWith("Hours")) return "h";
  if (metrique.endsWith("Percent")) return "%";
  if (metrique.startsWith("jours")) return "jours";
  return "XAF";
}

// ── Explications de valeur (§24/§25) ──────────────────────────────────────

export interface EvenementImpact {
  date: string;
  code: string;
  heures: number | null;
  minutes: number | null;
  salaireApplicable: number | null;
}

export interface OrigineValeur {
  valeur: number | null;
  source: string;
  regle: string;
  evenements: EvenementImpact[];
  salaireApplicable: number | null;
  baseCalcul: string;
}

export interface AnomalieSensibilisation {
  code: string;
  niveau: NiveauSensibilisation;
  message: string;
  employeeId: number | null;
}

// ── Résultat par employé ──────────────────────────────────────────────────

export interface SegmentImpact {
  segmentDebut: string;
  segmentFin: string;
  baseSalary: number | null;
  tauxHoraire: number;
  absenceHours: number;
  lateHours: number;
  estimatedImpactAbsence: number;
  estimatedImpactRetard: number;
  estimatedImpact: number;
  source: "historique" | "fiche";
}

export interface IndicateurSensibilisation {
  employeeId: number;
  matricule: string;
  nom: string;
  prenom: string | null;
  departement: string | null;
  periode: { from: string; to: string };

  // Indicateurs de présence — NON sensibles, toujours restitués
  joursOuvres: number;
  joursPresence: number;
  joursAbsence: number;
  joursConges: number;
  joursMuets: number;
  heuresTheoriques: number;
  heuresTravaillees: number;
  absenceHours: number;
  absenceHoursMUET: number;
  absenceHoursJustifiees: number;
  retardMinutes: number;
  retardHours: number;
  joursAvecRetard: number;
  totalNotWorkedHours: number;
  tauxPresenceHeures: number | null;
  joursAbsenceNonJustifiee: number;

  // Estimation (§8-§13) — masquée sans permission salaire
  salaireBaseReference: number | null;
  tauxHoraireMoyen: number | null;
  estimatedImpact: number;
  estimatedImpactAbsence: number;
  estimatedImpactRetard: number;
  impactPercent: number | null;
  segments: SegmentImpact[];

  // Retenue RÉELLE, lue telle quelle (§26)
  actualPayrollDeduction: number;

  // Traçabilité
  explications: OrigineValeur[];
  anomalies: AnomalieSensibilisation[];
  messages: AwarenessMessage[];
}

export interface IndicateursEquipe {
  effectif: number;
  joursOuvres: number;
  heuresTheoriques: number;
  heuresTravaillees: number;
  absenceHours: number;
  retardMinutes: number;
  totalNotWorkedHours: number;
  estimatedImpact: number;
  actualPayrollDeduction: number;
  impactPercent: number | null;
  tauxPresenceHeures: number | null;
  joursAbsenceNonJustifiee: number;
}

/** Ligne restituée au client : masque tout ce qui dépend du salaire. */
export type LigneSensibilisation = Omit<
  IndicateurSensibilisation,
  "salaireBaseReference" | "tauxHoraireMoyen" | "estimatedImpact" | "estimatedImpactAbsence" | "estimatedImpactRetard" | "impactPercent" | "segments" | "explications" | "messages"
> & {
  salaireBaseReference: number | null;
  tauxHoraireMoyen: number | null;
  estimatedImpact: number | null;
  estimatedImpactAbsence: number | null;
  estimatedImpactRetard: number | null;
  impactPercent: number | null;
  segments: SegmentImpact[] | null;
  explications: OrigineValeur[] | null;
  messages: AwarenessMessage[] | null;
  salariesVisible: boolean;
};

// ── Normalisation des entrées (§28) ───────────────────────────────────────

/** §28 — une valeur nulle, négative, NaN ou infinie est normalisée, jamais propagée. */
function nonNegatif(v: number | null | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function comparer(condition: ConditionSensibilisation, valeur: number, seuil: number): boolean {
  switch (condition) {
    case "GE":
      return valeur >= seuil;
    case "GT":
      return valeur > seuil;
    case "LE":
      return valeur <= seuil;
    case "LT":
      return valeur < seuil;
    case "EQ":
      return valeur === seuil;
    default:
      return false;
  }
}

// ── Justification des absences (§21) ──────────────────────────────────────

const STATUTS_VALIDES = new Set(["approuve", "approuvé", "valide", "validé", "justifie", "justifié"]);

/**
 * §21 — un jour coded A/MUET est « non justifié » UNIQUEMENT si on peut le
 * démontrer :
 *
 *   - aucune absence enregistrée ne couvre ce jour  -> NON JUSTIFIÉ ;
 *   - une absence le couvre, mais aucune n'est validée -> NON JUSTIFIÉ ;
 *   - au moins une absence couvrant ce jour est validée -> justifié (0).
 *
 * Un jour couvert par une absence JUSTIFIÉE n'est donc jamais compté. On ne
 * suppose jamais : le doute profite au justifiable, pas à la sanction.
 */
export function compterJoursAbsenceNonJustifies(
  jours: JourAnalyseInput[],
  absences: AbsenceTableRow[]
): number {
  const candidats = jours.filter(
    (j) => j.isWorkingDay && CODES_NON_JUSTIFIES.has(j.code) && j.heuresTheoriques > 0
  );
  if (candidats.length === 0) return 0;
  if (absences.length === 0) return candidats.length;

  let nonJustifies = 0;
  for (const j of candidats) {
    const couvertes = absences.filter((a) => a.dateDebut <= j.date && (!a.dateFin || a.dateFin >= j.date));
    if (couvertes.length === 0) {
      nonJustifies += 1;
      continue;
    }
    const justifiee = couvertes.some(
      (a) => a.justifie === true || STATUTS_VALIDES.has(String(a.statut ?? "").toLowerCase())
    );
    if (!justifiee) nonJustifies += 1;
  }
  return nonJustifies;
}

// ── Moteur (§8-§13) ───────────────────────────────────────────────────────

export interface EntreeSensibilisation {
  employe: EmployeBrut;
  jours: JourAnalyseInput[];
  analyse: PeriodeAnalyse;
  calcs: CalcBrut[];
  segments: SegmentSalaire[];
  absences: AbsenceTableRow[];
  donnees: DonneesSituation;
  regles: RegleSensibilisation[];
}

/** Heures théoriques non faites comprises dans `[debut, fin]` (bornes incluses). */
function heuresNonFaitesDans(jours: JourAnalyseInput[], debut: string, fin: string): number {
  return jours
    .filter((j) => CODES_HORAIRES_NON_FAITES.has(j.code) && j.date >= debut && j.date <= fin)
    .reduce((acc, j) => acc + nonNegatif(j.heuresTheoriques), 0);
}

/** Minutes de retard comprises dans `[debut, fin]` (bornes incluses). */
function minutesDans(jours: JourAnalyseInput[], debut: string, fin: string): number {
  return jours
    .filter((j) => j.date >= debut && j.date <= fin)
    .reduce((acc, j) => acc + nonNegatif(j.lateMinutes), 0);
}

/**
 * §8 — RÈGLE UNIQUE, documentée : le taux horaire d'un segment est
 * `baseSalary / standardMonthlyHours` du segment, en pleine précision. Le
 * diviseur vient TOUJOURS du paramétrage, jamais d'une constante.
 *
 * Le même taux est ensuite passé par `calculateAbsenceImpact` et
 * `calculateLateDeduction` en mode `TAUX_HORAIRE_SENSIBILISATION` : une seule
 * règle de valorisation, appliquée par le moteur de présence lui-même.
 */
export function calculerImpactSegment(
  segment: SegmentSalaire,
  heures: { absenceHours: number; lateMinutes: number },
  standardMonthlyHours: number
): { tauxHoraire: number; estimatedImpact: number; absence: number; retard: number } {
  const base = Number(segment.baseSalary);
  if (!Number.isFinite(base) || base <= 0) {
    return { tauxHoraire: 0, estimatedImpact: 0, absence: 0, retard: 0 };
  }
  const taux = tauxHoraire(base, standardMonthlyHours, { precision: 10 });

  const a = calculateAbsenceImpact("INJUSTIFIEE", segment.modePaie, base, segment.forfaitHebdomadaire, null, null, {
    mode: "TAUX_HORAIRE_SENSIBILISATION",
    heuresSensibilisation: heures.absenceHours,
    tauxHoraireSensibilisation: taux,
  });
  const r = calculateLateDeduction(heures.lateMinutes, null, base, null, {
    mode: "TAUX_HORAIRE_SENSIBILISATION",
    tauxHoraireSensibilisation: taux,
  });

  const absence = a.estimationMontant ?? 0;
  const retard = r.estimationMontant ?? 0;
  return { tauxHoraire: taux, estimatedImpact: absence + retard, absence, retard };
}

/**
 * §12 — Salaire de référence : on réutilise EXPLICITEMENT la règle canonique R7
 * (`baseEffectifPeriode`), qui prorate le salaire de la période sur les jours
 * travaillés, les jours fériés et la date d'embauche. Aucune règle RPT-03 n'est
 * inventée en doublon.
 */
export function salaireBaseReference(opts: {
  employe: EmployeBrut;
  segments: SegmentSalaire[];
  periode: { debut: string; fin: string };
  holidays: string[];
}): number | null {
  const salaries = opts.segments.map((s) => ({ baseSalary: s.baseSalary, startDate: s.startDate }));
  const v = baseEffectifPeriode({
    baseCourante: Number(opts.employe.salaireBase),
    modePaie: opts.employe.modePaie,
    periode: opts.periode,
    emploi: {
      dateEmbauche: opts.employe.dateEmbauche ?? null,
      dateSortie: opts.employe.dateSortie ?? null,
    },
    salaries,
    holidays: opts.holidays,
  });
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

/**
 * §9/§10/§11 — Indicateurs, impacts ESTIMÉS et messages d'un employé sur une
 * période. Fonction PURE : aucune écriture, aucune requête, aucun effet de bord.
 */
export function calculerIndicateursSensibilisation(e: EntreeSensibilisation): IndicateurSensibilisation {
  const anomalies: AnomalieSensibilisation[] = [];
  const explications: OrigineValeur[] = [];
  const empId = e.employe.id;

  // §3 — heures d'absence : jours OUVRÉS dont les heures théoriques n'ont pas
  // été faites. Le détail MUET / justifiées évite toute somme à l'aveugle.
  const joursNonFaits = e.jours.filter(
    (j) => j.isWorkingDay && CODES_HORAIRES_NON_FAITES.has(j.code) && j.heuresTheoriques > 0
  );
  const absenceHoursMUET = joursNonFaits
    .filter((j) => j.code === "MUET" || j.code === "A")
    .reduce((acc, j) => acc + nonNegatif(j.heuresTheoriques), 0);
  const absenceHoursJustifiees = joursNonFaits
    .filter((j) => j.code !== "MUET" && j.code !== "A")
    .reduce((acc, j) => acc + nonNegatif(j.heuresTheoriques), 0);
  const absenceHours = absenceHoursMUET + absenceHoursJustifiees;

  // §5 — les MINUTES réelles sont conservées ; la conversion en heures a lieu ici.
  const retardMinutes = nonNegatif(e.analyse.retardTotalMinutes);
  const retardHours = retardMinutes / 60;
  const joursAvecRetard = e.jours.filter((j) => j.isWorkingDay && nonNegatif(j.lateMinutes) > 0).length;

  // §6 — le total exclut les départs anticipés et les heures supplémentaires.
  const totalNotWorkedHours = absenceHours + retardHours;

  // §14 — ratio, jamais une moyenne de ratios.
  const heuresTheoriques = nonNegatif(e.analyse.heuresTheoriques);
  const heuresTravaillees = nonNegatif(e.analyse.heuresTravaillees);
  const tauxPresenceHeures =
    heuresTheoriques > 0 ? r2((heuresTravaillees / heuresTheoriques) * 100) : null;

  const joursAbsenceNonJustifiee = compterJoursAbsenceNonJustifies(e.jours, e.absences);

  // §28 — données négatives : normalisées à 0, anomalie explicite.
  if (
    e.analyse.heuresTheoriques < 0 ||
    e.analyse.heuresTravaillees < 0 ||
    e.analyse.retardTotalMinutes < 0
  ) {
    anomalies.push({
      code: "DONNEES_NEGATIVES_NORMALISEES",
      niveau: "WARNING",
      message: "Agrégats de présence négatifs : valeurs normalisées à 0 avant estimation.",
      employeeId: empId,
    });
  }
  if (heuresTheoriques === 0) {
    anomalies.push({
      code: "AUCUNE_HEURE_THEORIQUE",
      niveau: "INFO",
      message: "Aucune heure théorique sur la période : le taux de présence est indéfini (N/A).",
      employeeId: empId,
    });
  }

  // §8/§9 — impacts ESTIMÉS par segment salarial HISTORIQUE : jamais le salaire
  // du dernier jour, jamais `employee.currentSalary` en aveugle.
  const segmentsImpact: SegmentImpact[] = e.segments.map((s) => {
    const hAbs = heuresNonFaitesDans(e.jours, s.dateDebut, s.dateFin);
    const lateMin = minutesDans(e.jours, s.dateDebut, s.dateFin);
    const c = calculerImpactSegment(s, { absenceHours: hAbs, lateMinutes: lateMin }, e.donnees.standardMonthlyHours);
    return {
      segmentDebut: s.dateDebut,
      segmentFin: s.dateFin,
      baseSalary: s.baseSalary,
      tauxHoraire: c.tauxHoraire,
      absenceHours: hAbs,
      lateHours: lateMin / 60,
      estimatedImpactAbsence: c.absence,
      estimatedImpactRetard: c.retard,
      estimatedImpact: c.estimatedImpact,
      source: s.source,
    };
  });

  const estimatedImpactAbsence = segmentsImpact.reduce((acc, s) => acc + s.estimatedImpactAbsence, 0);
  const estimatedImpactRetard = segmentsImpact.reduce((acc, s) => acc + s.estimatedImpactRetard, 0);
  const estimatedImpact = estimatedImpactAbsence + estimatedImpactRetard;

  const tauxHoraireMoyen =
    segmentsImpact.length > 0
      ? segmentsImpact.reduce((acc, s) => acc + s.tauxHoraire, 0) / segmentsImpact.length
      : null;

  // §12 — salaire de référence R7.
  const reference = salaireBaseReference({
    employe: e.employe,
    segments: e.segments,
    periode: { debut: e.donnees.from, fin: e.donnees.to },
    holidays: e.donnees.holidays,
  });

  // §13 — salaire de référence incohérent -> pourcentage N/A, jamais 0 ni NaN.
  let impactPercent: number | null = null;
  if (reference === null) {
    anomalies.push({
      code: "SALAIRE_REFERENCE_INCOHERENT",
      niveau: "WARNING",
      message:
        "Salaire de référence absent, nul ou négatif : le pourcentage d'impact ne peut pas être calculé (N/A).",
      employeeId: empId,
    });
  } else {
    impactPercent = r2((estimatedImpact / reference) * 100);
  }

  // §26 — retenue RÉELLE, lue telle quelle, jamais recalculée ni confondue.
  const actualPayrollDeduction = e.calcs.reduce(
    (acc, c) => acc + nonNegatif(c.absenceFinancialImpact) + nonNegatif(c.lateDeductionAmount),
    0
  );

  // §24/§25 — explications de valeur, y compris « aucune donnée exploitable ».
  const joursOuvres = e.jours.filter((j) => j.isWorkingDay).length;
  explications.push({
    valeur: r2(absenceHours),
    source: "presence.jours.heuresTheoriques",
    regle: "somme des heures theoriques des jours ouvres non faits (A, MUET, C, M, O, F)",
    evenements: joursNonFaits.map((j) => ({
      date: j.date,
      code: j.code,
      heures: r2(nonNegatif(j.heuresTheoriques)),
      minutes: null,
      salaireApplicable: null,
    })),
    salaireApplicable: reference,
    baseCalcul: `${joursNonFaits.length} jour(s) non fait(s) / ${joursOuvres} jour(s) ouvre(s)`,
  });
  explications.push({
    valeur: r2(retardHours),
    source: "attendance_calculations.late_minutes",
    regle: "somme des minutes de retard reelles divisees par 60",
    evenements: e.jours
      .filter((j) => nonNegatif(j.lateMinutes) > 0)
      .map((j) => ({
        date: j.date,
        code: j.code,
        heures: null,
        minutes: nonNegatif(j.lateMinutes),
        salaireApplicable: null,
      })),
    salaireApplicable: reference,
    baseCalcul: `${retardMinutes} min / 60`,
  });
  explications.push({
    valeur: r2(estimatedImpact),
    source: "historique_salaire x standardMonthlyHours",
    regle: "somme des (heures d'absence x taux segment) + (heures de retard x taux segment)",
    evenements: segmentsImpact.map((s) => ({
      date: s.segmentDebut,
      code: s.source,
      heures: r2(s.absenceHours + s.lateHours),
      minutes: null,
      salaireApplicable: s.baseSalary,
    })),
    salaireApplicable: reference,
    baseCalcul:
      e.segments.length > 0
        ? `${e.segments.length} segment(s) salarial(aux), diviseur standardMonthlyHours=${e.donnees.standardMonthlyHours}`
        : "aucun segment salarial exploitable",
  });
  explications.push({
    valeur: r2(actualPayrollDeduction),
    source: "attendance_calculations.absence_financial_impact + late_deduction_amount",
    regle: "somme des retenues deja persistees par la paie (lecture seule)",
    evenements: e.calcs
      .filter((c) => nonNegatif(c.absenceFinancialImpact) > 0 || nonNegatif(c.lateDeductionAmount) > 0)
      .map((c) => ({
        date: c.date,
        code: String(c.codePresence ?? "?"),
        heures: null,
        minutes: null,
        salaireApplicable: null,
      })),
    salaireApplicable: null,
    baseCalcul: "retenues deja persistees par la paie : NON MODIFIEES par la sensibilisation",
  });

  const indicateur: IndicateurSensibilisation = {
    employeeId: empId,
    matricule: e.employe.matricule,
    nom: e.employe.nom,
    prenom: e.employe.prenom,
    departement: e.employe.departement,
    periode: { from: e.donnees.from, to: e.donnees.to },

    joursOuvres,
    joursPresence: e.analyse.joursPresence,
    joursAbsence: e.analyse.joursAbsence,
    joursConges: e.analyse.joursConges,
    joursMuets: e.analyse.joursMuets,
    heuresTheoriques: r2(heuresTheoriques),
    heuresTravaillees: r2(heuresTravaillees),
    absenceHours: r2(absenceHours),
    absenceHoursMUET: r2(absenceHoursMUET),
    absenceHoursJustifiees: r2(absenceHoursJustifiees),
    retardMinutes: r2(retardMinutes),
    retardHours: r2(retardHours),
    joursAvecRetard,
    totalNotWorkedHours: r2(totalNotWorkedHours),
    tauxPresenceHeures,
    joursAbsenceNonJustifiee,

    salaireBaseReference: reference === null ? null : r2(reference),
    tauxHoraireMoyen: tauxHoraireMoyen === null ? null : r2(tauxHoraireMoyen),
    estimatedImpact: r2(estimatedImpact),
    estimatedImpactAbsence: r2(estimatedImpactAbsence),
    estimatedImpactRetard: r2(estimatedImpactRetard),
    impactPercent,
    segments: segmentsImpact.map((s) => ({
      ...s,
      tauxHoraire: r2(s.tauxHoraire),
      absenceHours: r2(s.absenceHours),
      lateHours: r2(s.lateHours),
      estimatedImpactAbsence: r2(s.estimatedImpactAbsence),
      estimatedImpactRetard: r2(s.estimatedImpactRetard),
      estimatedImpact: r2(s.estimatedImpact),
    })),

    actualPayrollDeduction: r2(actualPayrollDeduction),

    explications,
    anomalies,
    messages: [],
  };

  indicateur.messages = construireMessagesSensibilisation(indicateur, e.regles);
  return indicateur;
}

// ── Agrégation équipe (§15/§33) ───────────────────────────────────────────

/**
 * §15 — « le ratio équipe est un ratio de SOMMES, jamais une moyenne de taux
 * individuels ». Le total n'est mesuré que si un dénominateur est mesurable.
 */
export function calculerIndicateursEquipe(rows: IndicateurSensibilisation[]): IndicateursEquipe {
  const somme = (sel: (r: IndicateurSensibilisation) => number): number =>
    rows.reduce((acc, r) => acc + nonNegatif(sel(r)), 0);

  const heuresTheoriques = somme((r) => r.heuresTheoriques);
  const heuresTravaillees = somme((r) => r.heuresTravaillees);
  const estimatedImpact = somme((r) => r.estimatedImpact);
  const salaireReferenceTotal = somme((r) => r.salaireBaseReference);

  return {
    effectif: rows.length,
    joursOuvres: somme((r) => r.joursOuvres),
    heuresTheoriques: r2(heuresTheoriques),
    heuresTravaillees: r2(heuresTravaillees),
    absenceHours: somme((r) => r.absenceHours),
    retardMinutes: somme((r) => r.retardMinutes),
    totalNotWorkedHours: r2(somme((r) => r.totalNotWorkedHours)),
    estimatedImpact: r2(estimatedImpact),
    actualPayrollDeduction: r2(somme((r) => r.actualPayrollDeduction)),
    impactPercent: salaireReferenceTotal > 0 ? r2((estimatedImpact / salaireReferenceTotal) * 100) : null,
    tauxPresenceHeures: heuresTheoriques > 0 ? r2((heuresTravaillees / heuresTheoriques) * 100) : null,
    joursAbsenceNonJustifiee: somme((r) => r.joursAbsenceNonJustifiee),
  };
}

// ── Évaluation des règles (§17-§21) ───────────────────────────────────────

export function valeursMetriques(r: IndicateurSensibilisation): Record<string, number | null> {
  return {
    retardMinutes: r.retardMinutes,
    joursAvecRetard: r.joursAvecRetard,
    absenceHours: r.absenceHours,
    totalNotWorkedHours: r.totalNotWorkedHours,
    impactPercent: r.impactPercent,
    salaireBaseReference: r.salaireBaseReference,
    // §13 : `impactPercent` vaut `null` quand le salaire de référence manque, et
    // une métrique `null` ne déclenche aucune règle. Cette métrique binaire
    // permet donc à `SALAIRE_REFERENCE_INCOHERENT` de se déclencher SANS
    // inventer un salaire de 0 qui serait un mensonge.
    salaireReferenceManquant: r.salaireBaseReference === null ? 1 : 0,
    joursAbsenceNonJustifiee: r.joursAbsenceNonJustifiee,
  };
}

/**
 * §20 — pas de normalisation silencieuse : si une règle EXIGÉE n'est pas
 * chargée, l'absence est signalée explicitement par l'appelant.
 */
export function reglesManquantes(regles: RegleSensibilisation[]): string[] {
  const connues = new Set(regles.filter((r) => r.active).map((r) => r.code));
  return CODES_REGLES_EXIGEES.filter((code) => !connues.has(code));
}

/**
 * §17/§18/§19/§21 — Évaluation des règles pour UN employé.
 *
 * Une règle dont la métrique vaut `null` (ex. `impactPercent` sans salaire de
 * référence) est SKIPPEE : elle ne déclenche pas et ne ment pas sur un
 * indicateur absent. `SALAIRE_REFERENCE_INCOHERENT` porte précisément ce `null`
 * via la métrique `salaireBaseReference`.
 */
export function construireMessagesSensibilisation(
  r: IndicateurSensibilisation,
  regles: RegleSensibilisation[]
): AwarenessMessage[] {
  const valeurs = valeursMetriques(r);
  const messages: AwarenessMessage[] = [];

  for (const regle of regles) {
    if (!regle.active) continue;
    const valeur = valeurs[regle.metrique];
    if (valeur === null || valeur === undefined) continue;
    if (!comparer(regle.condition, valeur, regle.seuil)) continue;

    messages.push({
      code: regle.code,
      niveau: regle.niveau,
      titre: regle.label,
      message: regle.message,
      raison: `${regle.metrique} = ${r2(valeur)} ${unite(regle.metrique)} (${regle.condition} ${regle.seuil})`,
      indicateurs: {
        [regle.metrique]: { valeur: r2(valeur), seuil: regle.seuil, unite: unite(regle.metrique) },
      },
      actionRecommandee: regle.actionRecommandee,
      seuilApplique: regle.seuil,
    });
  }

  // §17 — plusieurs messages coexistent, ordre déterministe :
  // criticité, puis priorité de règle, puis code.
  const priorite = new Map(regles.map((reg) => [reg.code, reg.priorite]));
  messages.sort(
    (a, b) =>
      ORDRE_NIVEAU[a.niveau] - ORDRE_NIVEAU[b.niveau] ||
      (priorite.get(a.code) ?? 999) - (priorite.get(b.code) ?? 999) ||
      a.code.localeCompare(b.code)
  );
  return messages;
}

// ── Masquage des données sensibles (§36) ──────────────────────────────────

/**
 * §36 — sans `rh.salaire.consulter`, les indicateurs NON sensibles restent
 * disponibles ; salaire, taux, impacts et messages financiers sont absents.
 * On ne renvoie pas 0, qui serait un mensonge : on signale l'absence de donnée.
 */
export function appliquerMasquageSalaire(r: IndicateurSensibilisation, canSeeSalary: boolean): LigneSensibilisation {
  const base = {
    employeeId: r.employeeId,
    matricule: r.matricule,
    nom: r.nom,
    prenom: r.prenom,
    departement: r.departement,
    periode: r.periode,
    joursOuvres: r.joursOuvres,
    joursPresence: r.joursPresence,
    joursAbsence: r.joursAbsence,
    joursConges: r.joursConges,
    joursMuets: r.joursMuets,
    heuresTheoriques: r.heuresTheoriques,
    heuresTravaillees: r.heuresTravaillees,
    absenceHours: r.absenceHours,
    absenceHoursMUET: r.absenceHoursMUET,
    absenceHoursJustifiees: r.absenceHoursJustifiees,
    retardMinutes: r.retardMinutes,
    retardHours: r.retardHours,
    joursAvecRetard: r.joursAvecRetard,
    totalNotWorkedHours: r.totalNotWorkedHours,
    tauxPresenceHeures: r.tauxPresenceHeures,
    joursAbsenceNonJustifiee: r.joursAbsenceNonJustifiee,
    actualPayrollDeduction: r.actualPayrollDeduction,
    anomalies: r.anomalies,
  };

  if (!canSeeSalary) {
    return {
      ...base,
      salaireBaseReference: null,
      tauxHoraireMoyen: null,
      estimatedImpact: null,
      estimatedImpactAbsence: null,
      estimatedImpactRetard: null,
      impactPercent: null,
      segments: null,
      explications: null,
      messages: null,
      salariesVisible: false,
    };
  }

  return {
    ...base,
    salaireBaseReference: r.salaireBaseReference,
    tauxHoraireMoyen: r.tauxHoraireMoyen,
    estimatedImpact: r.estimatedImpact,
    estimatedImpactAbsence: r.estimatedImpactAbsence,
    estimatedImpactRetard: r.estimatedImpactRetard,
    impactPercent: r.impactPercent,
    segments: r.segments,
    explications: r.explications,
    messages: r.messages,
    salariesVisible: true,
  };
}
