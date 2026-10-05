/**
 * RPT-04 — Journal des absences & retards : moteur de constitution.
 *
 * MOTEUR PUR : aucune base de donnees, aucune ecriture, aucun import de `db`.
 * Il CONSOMME la sortie de RPT-01 (`ChargeRapport.events` + `ChargeRapport.situation`)
 * et n'enrichit que ce que RPT-01 ne fournit pas :
 *
 *  · la fusion des evenements RPT-01 d'une meme journee en UNE ligne de journal ;
 *  · le statut de justificatif (workflow FOURNI / VALIDE / REFUSE) ;
 *  · les horaires et heures theoriques du jour ;
 *  · les anomalies de reconciliation et de validation ;
 *  · le masque des donnees sensibles.
 *
 * PRINCIPE ABSOLU : un evenement metier = UNE occurrence = UNE source
 * canonique = UNE trace = UNE incidence.
 *  · `attendance_entries` reste la source canonique (RPT-01) ; RPT-04 ne la
 *    reecrit jamais et ne la recalcule pas.
 *  · La reconciliation des absences est deja decidee par RPT-01/RPT-02
 *    (`comptabilise` / `motifNonComptabilisation`) : on la consomme.
 *  · Les montants de paie sont REELS et proviennent des evenements RPT-01
 *    (`absenceFinancialImpact`, `lateDeductionAmount`, `montantRetenue`) ;
 *    RPT-04 ne les estime jamais.
 *
 * Les references de sensibilisation (§21) ne sont PAS portees par les lignes :
 * RPT-03 ne publie `estimatedImpact` / `impactPercent` que par employe et par
 * periode. Elles sont donc restituees dans un bloc dedie
 * (`construireReferenceSensibilisation`), jamais reparties ni recalculees.
 */

import { heuresTheoriquesDuJour, jourOuvrePour } from "./rh-centre-rapports";
import type {
  AbsenceTableRow,
  CalcBrut,
  DonneesSituation,
  EmployeBrut,
  ReportEvent,
  SourceEvenement,
  TypeEvenementRapport,
} from "./rh-centre-rapports";

// ─── Types ────────────────────────────────────────────────────────────────

export type { SourceEvenement, TypeEvenementRapport };

export type StatutJustificatif = "AUCUN" | "FOURNI" | "VALIDE" | "REFUSE";

export type CodeAnomalie =
  /** Les sources se contredisent sur la meme journee. */
  | "ANOMALIE_RECONCILIATION"
  /** Plusieurs saisies de presence pour le meme (employe, date). */
  | "ANOMALIE_CONFLIT_EVENT"
  /** Un statut « valide » sans auteur : impossible a prouver. */
  | "ANOMALIE_VALIDATION_SANS_AUTEUR"
  /** Evenement porte sur un jour non travaille : incidence de presence nulle. */
  | "ANOMALIE_HORS_PERIODE_EMPLOI";

export interface Anomalie {
  code: CodeAnomalie;
  message: string;
  details?: Record<string, unknown>;
}

export type CasReconciliation = "A" | "B" | "C" | "D";

/** Etat de justification lu dans `rh_absence_justifications` (lecture seule). */
export interface JustificationSource {
  id: number;
  employeeId: number;
  date: string;
  statut: StatutJustificatif;
  motifCode: string | null;
  motifLibelle: string | null;
  justificatifUrl: string | null;
  justificatifReference: string | null;
  justificatifType: string | null;
  deposePar: number | null;
  deposeAt: string | null;
  decisionPar: number | null;
  decisionAt: string | null;
  refusMotif: string | null;
}

/**
 * Conflit de saisie : plusieurs `attendance_entries` pour le meme
 * (employe, date). RPT-01 charge une seule ligne par jour dans
 * `saisiesByEmploye` : l'information est PERDUE au chargement, donc RPT-04 la
 * reconstitue par une requete dediee et refuse de trancher.
 */
export interface ConflitPresence {
  employeeId: number;
  date: string;
  entryIds: number[];
}

export interface OptionsJournal {
  /** `charge.events` : les evenements RPT-01, source canonique. */
  events: ReportEvent[];
  /** `charge.situation` : donnees batch deja chargees par RPT-01 (zero N+1). */
  situation: DonneesSituation;
  justifications?: JustificationSource[];
  conflits?: ConflitPresence[];
}

export interface EvenementJournal {
  /** Identifiant STABLE (§5) : derive de la cle (employe, date), jamais d'une position. */
  eventId: string;
  employeeId: number;
  matricule: string;
  nom: string;
  prenom: string | null;
  departement: string | null;
  departementId: number | null;
  fonction: string | null;
  date: string;

  type: TypeEvenementRapport;
  libelle: string | null;
  presenceCode: string | null;

  /** Identifiants RPT-01 consommes : tracabilite vers la source. */
  rapportEventIds: string[];
  sources: SourceEvenement[];
  casReconciliation: CasReconciliation;
  /** `attendance_entries.source` brut (jamais invente, jamais normalise). */
  saisieSource: string | null;

  estJourTravaille: boolean;
  heuresTheoriques: number;
  heureTheorique: string | null;
  heureArrivee: string | null;
  toleranceMinutes: number | null;

  lateMinutes: number;
  lateHours: number;
  earlyDepartureMinutes: number;

  journeeEntiere: boolean;
  dureeHeures: number;

  motif: string | null;
  motifCode: string | null;
  justificatifStatut: StatutJustificatif;
  justificatifUrl: string | null;
  justificatifReference: string | null;
  justificatifType: string | null;
  /** Trace d'import : `attendance_entries.absence_justificatif` (R7). */
  justificatifLegacy: string | null;

  presenceValidee: boolean | null;
  validePar: string | null;
  auteur: string | null;
  validatedBy: number | null;
  validatedAt: string | null;
  createdBy: number | null;

  deposePar: number | null;
  deposeAt: string | null;
  decisionPar: number | null;
  decisionAt: string | null;
  refusMotif: string | null;

  /** Decision RPT-01 §9 : l'evenement est-il un jour d'absence comptabilise ? */
  comptabilise: boolean | null;
  motifNonComptabilisation: string | null;

  presenceImpactHours: number;
  payrollImpact: number;
  payrollImpactAbsence: number;
  payrollImpactRetard: number;
  payrollImpactSituationRH: number;

  anomalies: Anomalie[];
}

/**
 * §21 — Reference de sensibilisation RPT-03, par EMPLOYE et par PERIODE.
 * Jamais par ligne, jamais recalculee, jamais repartie.
 */
export interface ReferenceSensibilisation {
  employeeId: number;
  matricule: string;
  nom: string;
  estimatedImpact: number | null;
  impactPercent: number | null;
  actualPayrollDeduction: number | null;
  salariesVisible: boolean;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function jourSemaine(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay();
}

/** Couvre la journee ? (controle de plage, pas une regle metier dupliquee) */
function couvreJournee(a: { dateDebut: string; dateFin: string | null }, iso: string): boolean {
  const debut = a.dateDebut.slice(0, 10);
  const fin = a.dateFin ? a.dateFin.slice(0, 10) : null;
  return iso >= debut && (!fin || iso <= fin);
}

/** Identifiant stable (§5) : derive de la cle (employe, date). */
export function eventIdStable(employeeId: number, date: string): string {
  return `journal:${employeeId}:${date.slice(0, 10)}`;
}

/**
 * §5 — Inverse de `eventIdStable` : `journal:<employeeId>:<date>`.
 *
 * Le separateur utile est le SECOND deux-points (le premier appartient au
 * prefixe). L'aller-retour est verifie : un identifiant qui ne se re/compose
 * pas exactement est rejete, jamais reinterpreté.
 */
export function analyserEventIdStable(
  eventId: string
): { employeeId: number; date: string } | null {
  const prefixe = "journal:";
  if (!eventId.startsWith(prefixe)) return null;

  const separateur = eventId.indexOf(":", prefixe.length);
  if (separateur <= 0) return null;

  const employeeId = Number(eventId.slice(prefixe.length, separateur));
  const date = eventId.slice(separateur + 1);
  if (!Number.isInteger(employeeId) || employeeId <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (eventIdStable(employeeId, date) !== eventId) return null;

  return { employeeId, date };
}

/** §8 — `lateHours = lateMinutes / 60`. Formule RPT-03. */
export function lateHoursDepuisMinutes(lateMinutes: number): number {
  return round2(num(lateMinutes) / 60);
}

const TYPES_ABSENCE_LIKE: TypeEvenementRapport[] = ["ABSENCE", "CONGE", "MALADIE", "ACCIDENT"];

/**
 * Priorite de classification quand plusieurs evenements RPT-01 couvrent la meme
 * journee. Une situation RH reste une SITUATION_RH : elle n'est jamais degradee
 * en absence classique (§6).
 */
const PRIORITE_TYPE: Record<TypeEvenementRapport, number> = {
  SITUATION_RH: 0,
  ACCIDENT: 1,
  MALADIE: 2,
  CONGE: 3,
  ABSENCE: 4,
  RETARD: 5,
  AUTRE: 6,
};

function typePrincipal(evs: ReportEvent[]): TypeEvenementRapport {
  return evs
    .map((e) => e.type)
    .sort((a, b) => PRIORITE_TYPE[a] - PRIORITE_TYPE[b])[0] ?? "AUTRE";
}

// ─── Construction du journal ──────────────────────────────────────────────

export function construireJournal(opts: OptionsJournal): EvenementJournal[] {
  const situation = opts.situation;
  const employes = new Map<number, EmployeBrut>(situation.employees.map((e) => [e.id, e]));

  // Index batch : zero N+1, toute la lecture vient de RPT-01.
  const calcParJour = new Map<number, Map<string, CalcBrut>>();
  for (const [empId, calcs] of situation.calcsByEmploye) {
    calcParJour.set(empId, new Map(calcs.map((c) => [c.date, c])));
  }

  const justifParCle = new Map<string, JustificationSource>();
  for (const j of opts.justifications ?? []) {
    justifParCle.set(`${j.employeeId}|${j.date.slice(0, 10)}`, j);
  }

  const conflitsParCle = new Map<string, ConflitPresence>();
  for (const c of opts.conflits ?? []) conflitsParCle.set(`${c.employeeId}|${c.date}`, c);

  // Regroupement par la cle de reconciliation RPT-01 : (employe, date).
  const groupes = new Map<string, ReportEvent[]>();
  for (const ev of opts.events ?? []) {
    const cle = `${ev.employeeId}|${ev.date.slice(0, 10)}`;
    const liste = groupes.get(cle) ?? [];
    liste.push(ev);
    groupes.set(cle, liste);
  }

  const cles = [...groupes.keys()].sort();
  const lignes: EvenementJournal[] = [];

  for (const cle of cles) {
    const evs = (groupes.get(cle) ?? []).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const ev0 = evs[0];
    if (!ev0) continue;
    const emp = employes.get(ev0.employeeId);
    if (!emp) continue;

    const employeeId = ev0.employeeId;
    const iso = ev0.date.slice(0, 10);
    const anomalies: Anomalie[] = [];

    const saisie = situation.saisiesByEmploye.get(employeeId)?.get(iso) ?? null;
    const calc = calcParJour.get(employeeId)?.get(iso) ?? null;
    const absRow: AbsenceTableRow | null =
      (situation.absencesByEmploye.get(employeeId) ?? []).find((a) => couvreJournee(a, iso)) ?? null;
    const justif = justifParCle.get(cle) ?? null;
    const conflit = conflitsParCle.get(cle) ?? null;

    // ── Reconciliation (§10) ──
    const sources = [...new Set(evs.map((e) => e.source))];
    const aSaisie = sources.includes("attendance_entries");
    const aAbsenceDeclaree = sources.includes("absences") || absRow !== null;
    const casReconciliation: CasReconciliation = conflit
      ? "D"
      : aSaisie && aAbsenceDeclaree
        ? "C"
        : aSaisie
          ? "A"
          : "B";

    if (conflit) {
      anomalies.push({
        code: "ANOMALIE_CONFLIT_EVENT",
        message: `${conflit.entryIds.length} saisies de presence pour le meme employe le meme jour : conflit non resolu.`,
        details: { employeeId, date: iso, entryIds: conflit.entryIds },
      });
    }

    // ── Classification : la situation RH n'est jamais degradee (§6) ──
    const type = typePrincipal(evs);

    // ── Planning et heures du jour ──
    const dow = jourSemaine(iso);
    const estJourTravaille = jourOuvrePour(emp, iso, situation);
    const sched = emp.workCycleId ? situation.schedByCycleDay.get(`${emp.workCycleId}:${dow}`) : undefined;
    const heuresTheoriques = estJourTravaille
      ? sched
        ? heuresTheoriquesDuJour(sched, situation.seuilDefaut)
        : situation.seuilDefaut
      : 0;

    // ── Retard (§8) ──
    const evRetard = evs.find((e) => e.source === "attendance_calculations" && e.type === "RETARD");
    const lateMinutes = conflit ? 0 : num(evRetard?.lateMinutes ?? calc?.lateMinutes);
    const earlyDepartureMinutes = conflit ? 0 : num(evRetard?.earlyDepartureMinutes ?? calc?.earlyDepartureMinutes);

    // ── Journee entiere (§9) : uniquement si RPT-01 a decide la comptabilisation ──
    const evComptabilise = evs.find((e) => e.comptabilise !== null);
    const comptabilise = evComptabilise?.comptabilise ?? null;
    const motifNonComptabilisation = evComptabilise?.motifNonComptabilisation ?? null;
    const journeeEntiere =
      comptabilise === true && TYPES_ABSENCE_LIKE.includes(type) && heuresTheoriques > 0;

    const absenceHeures = num(calc?.normalMinutes) / 60;
    const dureeHeures = conflit
      ? 0
      : journeeEntiere
        ? round2(heuresTheoriques)
        : TYPES_ABSENCE_LIKE.includes(type)
          ? round2(absenceHeures)
          : round2(lateHoursDepuisMinutes(lateMinutes) + earlyDepartureMinutes / 60);

    // ── Anomalie : contradiction entre la declaration et la source canonique ──
    if (absRow && saisie) {
      const typeSaisie = (saisie.absenceType ?? "").toUpperCase();
      if (typeSaisie && absRow.typeAbsence.toUpperCase() !== typeSaisie) {
        anomalies.push({
          code: "ANOMALIE_RECONCILIATION",
          message: "Le type d'absence declare et le type saisi sur la presence se contredisent.",
          details: {
            employeeId,
            date: iso,
            typeDeclare: absRow.typeAbsence,
            typeSaisi: saisie.absenceType,
            absenceId: absRow.id,
            entryId: saisie.id,
          },
        });
      }
    }

    // ── Anomalie : validation fantome (§14) ──
    if (saisie?.validated === true && saisie.validatedBy === null) {
      anomalies.push({
        code: "ANOMALIE_VALIDATION_SANS_AUTEUR",
        message: "Saisie marquee validee sans validateur : statut de justificatif inconnu.",
        details: { employeeId, date: iso, entryId: saisie.id, validatedAt: saisie.validatedAt },
      });
    }
    if (absRow?.justifie === true && absRow.validePar === null) {
      anomalies.push({
        code: "ANOMALIE_VALIDATION_SANS_AUTEUR",
        message: "Absence declaree justifiee sans validateur : validation fantome.",
        details: { employeeId, date: iso, absenceId: absRow.id },
      });
    }
    if (justif?.statut === "VALIDE" && (justif.decisionPar === null || justif.decisionAt === null)) {
      anomalies.push({
        code: "ANOMALIE_VALIDATION_SANS_AUTEUR",
        message: "Justificatif marque VALIDE sans validateur ni date : impossible a prouver.",
        details: { employeeId, date: iso, justificationId: justif.id },
      });
    }

    // ── Anomalie : jour non travaille ──
    if (!estJourTravaille && (TYPES_ABSENCE_LIKE.includes(type) || aAbsenceDeclaree)) {
      anomalies.push({
        code: "ANOMALIE_HORS_PERIODE_EMPLOI",
        message: "Evenement journalise un jour non travaille : incidence de presence nulle.",
        details: {
          employeeId,
          date: iso,
          motif: motifNonComptabilisation,
          jourSemaine: dow,
          horsPeriode:
            (!!emp.dateEmbauche && iso < emp.dateEmbauche.slice(0, 10)) ||
            (!!emp.dateSortie && iso > emp.dateSortie.slice(0, 10)),
        },
      });
    }

    // ── Impacts : montants REELS lus dans les evenements RPT-01 (§20) ──
    const sommeImpact = (pred: (e: ReportEvent) => boolean): number =>
      conflit ? 0 : round2(evs.filter(pred).reduce((acc, e) => acc + num(e.payrollImpact), 0));
    const payrollImpactAbsence = sommeImpact((e) => e.source !== "attendance_calculations" && e.source !== "situations_rh");
    const payrollImpactRetard = sommeImpact((e) => e.source === "attendance_calculations");
    const payrollImpactSituationRH = sommeImpact((e) => e.source === "situations_rh");

    const presenceImpactHours =
      conflit || !estJourTravaille || heuresTheoriques <= 0
        ? 0
        : journeeEntiere || lateMinutes > 0 || earlyDepartureMinutes > 0
          ? round2(heuresTheoriques)
          : 0;

    lignes.push({
      eventId: eventIdStable(employeeId, iso),
      employeeId,
      matricule: emp.matricule,
      nom: emp.nom,
      prenom: emp.prenom,
      departement: emp.departement,
      departementId: emp.departmentId,
      fonction: emp.fonction,
      date: iso,

      type,
      libelle: ev0.libelle,
      presenceCode: ev0.presenceCode ?? null,

      rapportEventIds: evs.map((e) => e.id),
      sources,
      casReconciliation,
      saisieSource: saisie?.source ?? null,

      estJourTravaille,
      heuresTheoriques: round2(heuresTheoriques),
      heureTheorique: sched?.startTime ?? null,
      heureArrivee: saisie?.timeIn ?? null,
      toleranceMinutes: situation.parametresPresence.lateToleranceMinutes ?? null,

      lateMinutes,
      lateHours: lateHoursDepuisMinutes(lateMinutes),
      earlyDepartureMinutes,

      journeeEntiere,
      dureeHeures,

      motif: justif?.motifLibelle ?? absRow?.motif ?? saisie?.absenceMotif ?? ev0.motif ?? null,
      motifCode: justif?.motifCode ?? null,
      justificatifStatut: justif?.statut ?? "AUCUN",
      justificatifUrl: justif?.justificatifUrl ?? null,
      justificatifReference: justif?.justificatifReference ?? null,
      justificatifType: justif?.justificatifType ?? null,
      justificatifLegacy: saisie?.absenceJustificatif ?? null,

      presenceValidee: evs.find((e) => e.presenceValidee !== null)?.presenceValidee ?? null,
      validePar: evs.find((e) => e.validePar !== null)?.validePar ?? null,
      auteur: evs.find((e) => e.auteur !== null)?.auteur ?? null,
      validatedBy: saisie?.validatedBy ?? null,
      validatedAt: saisie?.validatedAt ?? null,
      createdBy: saisie?.createdBy ?? null,

      deposePar: justif?.deposePar ?? null,
      deposeAt: justif?.deposeAt ?? null,
      decisionPar: justif?.decisionPar ?? null,
      decisionAt: justif?.decisionAt ?? null,
      refusMotif: justif?.refusMotif ?? null,

      comptabilise,
      motifNonComptabilisation,

      presenceImpactHours,
      payrollImpact: round2(payrollImpactAbsence + payrollImpactRetard + payrollImpactSituationRH),
      payrollImpactAbsence,
      payrollImpactRetard,
      payrollImpactSituationRH,

      anomalies,
    });
  }

  return lignes;
}

// ─── Reference de sensibilisation RPT-03 (§21) ───────────────────────────

/**
 * Bloc de REFERENCE par employe et par periode. Les lignes du journal ne
 * portent aucun montant RPT-03 : une repartition par jour serait une valeur
 * fabriquee.
 */
export function construireReferenceSensibilisation(
  rows: ReadonlyArray<{
    employeeId: number;
    matricule: string;
    nom: string;
    estimatedImpact?: number | null;
    impactPercent?: number | null;
    actualPayrollDeduction?: number | null;
    salariesVisible: boolean;
  }>
): ReferenceSensibilisation[] {
  return rows.map((r) => ({
    employeeId: r.employeeId,
    matricule: r.matricule,
    nom: r.nom,
    estimatedImpact: r.salariesVisible ? (r.estimatedImpact ?? null) : null,
    impactPercent: r.salariesVisible ? (r.impactPercent ?? null) : null,
    actualPayrollDeduction: r.salariesVisible ? (r.actualPayrollDeduction ?? null) : null,
    salariesVisible: r.salariesVisible,
  }));
}

// ─── Filtres, recherche, tri, pagination (§24, §26, §27, §25) ─────────────

export interface FiltresJournal {
  recherche?: string | null;
  employeeIds?: number[] | null;
  types?: TypeEvenementRapport[] | null;
  statutsJustificatif?: StatutJustificatif[] | null;
  valide?: boolean | null;
  sources?: SourceEvenement[] | null;
  departementId?: number | null;
  fonction?: string | null;
  anomalies?: CodeAnomalie[] | null;
}

export type TriJournal = "date" | "employe" | "retard" | "type" | "statut_justificatif";

export interface OptionsTri {
  tri: TriJournal;
  sens?: "asc" | "desc";
}

/** Le filtre RETARD trouve aussi un jour d'absence qui PORTE un retard. */
export function correspondType(ev: EvenementJournal, type: TypeEvenementRapport): boolean {
  if (ev.type === type) return true;
  return type === "RETARD" && ev.lateMinutes > 0;
}

export function appliquerFiltres(
  evenements: EvenementJournal[],
  filtres: FiltresJournal
): EvenementJournal[] {
  const q = (filtres.recherche ?? "").trim().toLowerCase();

  return evenements.filter((ev) => {
    if (filtres.employeeIds?.length && !filtres.employeeIds.includes(ev.employeeId)) return false;
    if (filtres.types?.length && !filtres.types.some((t) => correspondType(ev, t))) return false;
    if (filtres.sources?.length && !filtres.sources.some((s) => ev.sources.includes(s))) return false;
    if (filtres.departementId != null && ev.departementId !== filtres.departementId) return false;
    if (filtres.fonction && ev.fonction !== filtres.fonction) return false;

    if (filtres.statutsJustificatif?.length && !filtres.statutsJustificatif.includes(ev.justificatifStatut)) {
      return false;
    }
    if (filtres.valide === true && ev.justificatifStatut !== "VALIDE") return false;
    if (filtres.valide === false && ev.justificatifStatut === "VALIDE") return false;

    if (filtres.anomalies?.length && !ev.anomalies.some((a) => filtres.anomalies!.includes(a.code))) return false;

    if (q) {
      const cible = [
        ev.matricule,
        ev.nom,
        ev.prenom,
        ev.date,
        ev.type,
        ev.libelle,
        ev.motif,
        ev.motifCode,
        ev.presenceCode,
        ev.justificatifReference,
        ev.justificatifLegacy,
        ev.saisieSource,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!cible.includes(q)) return false;
    }
    return true;
  });
}

const RANG_STATUT: Record<StatutJustificatif, number> = { VALIDE: 0, FOURNI: 1, REFUSE: 2, AUCUN: 3 };

/**
 * Tri DETERMINISTE (§27) sur la liste filtree ENTIERE, jamais sur la page
 * courante. `eventId` sert de cle de rupture finale.
 */
export function trierEvenements(evenements: EvenementJournal[], options: OptionsTri): EvenementJournal[] {
  const sens = options.sens === "asc" ? 1 : -1;

  return [...evenements].sort((a, b) => {
    let r = 0;
    switch (options.tri) {
      case "employe":
        r = a.employeeId - b.employeeId;
        break;
      case "retard":
        r = a.lateMinutes - b.lateMinutes;
        break;
      case "type":
        r = a.type.localeCompare(b.type);
        break;
      case "statut_justificatif":
        r = RANG_STATUT[a.justificatifStatut] - RANG_STATUT[b.justificatifStatut];
        break;
      case "date":
      default:
        break;
    }
    if (r !== 0) return r * sens;
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.employeeId !== b.employeeId) return a.employeeId - b.employeeId;
    return a.eventId.localeCompare(b.eventId);
  });
}

export interface PageResultat<T> {
  lignes: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const PAGE_SIZE_MAX = 200;

/** Pagination serveur (§25) : aucune ligne perdue au-dela du plafond. */
export function paginer<T>(lignes: T[], page: number, pageSize: number): PageResultat<T> {
  const pageSizeEff = Math.max(1, Math.min(pageSize || 50, PAGE_SIZE_MAX));
  const pageEff = Math.max(1, page || 1);
  const total = lignes.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSizeEff));
  const debut = (pageEff - 1) * pageSizeEff;
  return {
    lignes: lignes.slice(debut, debut + pageSizeEff),
    total,
    page: pageEff,
    pageSize: pageSizeEff,
    pageCount,
  };
}

// ─── Masquage des donnees sensibles (§30) ─────────────────────────────────

export type LigneMasquee = Omit<EvenementJournal, "justificatifMasque"> & {
  /** `true` quand les pieces ont ete masquees : l'UI doit le signaler. */
  justificatifMasque: boolean;
};

/**
 * L'existence d'un justificatif n'autorise pas son affichage. Le statut reste
 * visible (on sait qu'un justificatif existe), les pieces non.
 */
export function masquerJustificatif(lignes: EvenementJournal[], autorise: boolean): LigneMasquee[] {
  if (autorise) {
    return lignes.map((l) => ({ ...l, justificatifMasque: false }));
  }
  return lignes.map((l) => ({
    ...l,
    justificatifUrl: null,
    justificatifReference: null,
    justificatifType: null,
    justificatifLegacy: null,
    motif: null,
    refusMotif: null,
    justificatifMasque: true,
  }));
}

/**
 * RPT-05 — Les impacts de paie sont des MONTANTS. Sans
 * `rh.salaire.consulter`, les cles sont SUPPRIMEES du payload : pas de `null`,
 * pas de `0`, qui serait indistinguishable d'une retenue reelle.
 */
export const CHAMPS_SENSIBLES_IMPACT = [
  "payrollImpact",
  "payrollImpactAbsence",
  "payrollImpactRetard",
  "payrollImpactSituationRH",
] as const;

export function masquerImpacts<T extends Record<string, unknown>>(
  lignes: readonly T[],
  autorise: boolean
): (T | Omit<T, (typeof CHAMPS_SENSIBLES_IMPACT)[number]>)[] {
  if (autorise) return lignes.map((l) => ({ ...l }));
  return lignes.map((l) => {
    const copie = { ...l };
    for (const champ of CHAMPS_SENSIBLES_IMPACT) delete copie[champ];
    return copie;
  });
}
