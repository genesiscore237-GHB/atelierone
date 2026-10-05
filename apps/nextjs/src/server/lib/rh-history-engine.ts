/**
 * RH — Moteur d'état historique (Phase R7 — HISTORIQUES / TRACABILITÉ / SNAPSHOTS).
 *
 * Fonctions pures de reconstruction à date (aucun accès DB — les lignes sont passées en
 * argument). Elles répondent à trois questions :
 *  - `getEtatEmploye`      : état « paie » de l'employé au jour D (source unique de vérité) ;
 *  - `getEmployeeStateAt`  : état complet à une date (état paie + aggrégats optionnels) ;
 *  - `getEmployeeSegments` : découpage de [from, to] en segments de constance maximale.
 *
 * Principe de vérité (§26) : la fiche `employes` est la PROJECTION, les historiques sont la
 * SOURCE. Quand un intervalle existe à D, il prime ; sinon la fiche (source « fiche ») ;
 * jamais une valeur inventée.
 */
import { normaliserModePaie, type PayMode } from "./payroll-engine";

// ─── Types de lignes (structurels — compatibles avec les lignes drizzle) ───

export interface StatusHistRow {
  statut: string | null;
  startDate: string;
  endDate: string | null;
  reason: string | null;
  changedBy: number | null;
  reembauchable?: boolean | null;
}

export interface SalaryHistRow {
  baseSalary: string | number | null;
  modePaie: string | null;
  forfaitHebdomadaire: string | number | null;
  startDate: string;
  endDate: string | null;
  reason: string | null;
  changedBy: number | null;
}

export interface PositionHistRow {
  positionId: number | null;
  departmentId: number | null;
  startDate: string;
  endDate: string | null;
  reason: string | null;
  changedBy: number | null;
}

export interface ContractCurrentRow {
  id: number;
  typeContrat: string | null;
  poste: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  dureeMois: number | null;
  salaireBase: string | null;
  statut: string | null;
  fichierUrl: string | null;
  notes: string | null;
  finPeriodeEssai: string | null;
  avantages: string | null;
  renouvellement: string | null;
}

export interface ContractVersionRow {
  id: number;
  contractId: number;
  version: number;
  typeContrat: string | null;
  poste: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  dureeMois: number | null;
  salaireBase: string | null;
  statut: string | null;
  finPeriodeEssai: string | null;
  avantages: string | null;
  renouvellement: string | null;
  reason: string | null;
  changedBy: number | null;
  createdAt?: string | Date | null;
}

export interface SituationActRow {
  id: number;
  dateDebut: string;
  dateFin: string | null;
  type: string | null;
  name: string | null;
  impactContrat: string | null;
  impactPresence: string | null;
  impactPlanning: string | null;
  impactPaie: string | null;
  modeCalculPaie: string | null;
  baseCalculPaie: string | null;
}

export interface EmpFicheRow {
  id: number;
  matricule: string | null;
  fonction: string | null;
  departmentId: number | null;
  positionId: number | null;
  statut: string | null;
  dateEmbauche: string | null;
  dateSortie: string | null;
  motifSortie: string | null;
  salaireBase: string | number | null;
  modePaie: string | null;
  forfaitHebdomadaire: string | number | null;
}

export interface HistoryEngineInput {
  employe: EmpFicheRow;
  statusHistory: StatusHistRow[];
  salaryHistory: SalaryHistRow[];
  positionHistory: PositionHistRow[];
  contractVersions: ContractVersionRow[];
  contratsCourants: ContractCurrentRow[];
  situations: SituationActRow[];
}

// ─── Sorties ───

export interface EtatPiece {
  id: number;
  matricule: string | null;
  fonction: string | null;
  dateEmbauche: string | null;
  dateSortie: string | null;
  motifSortie: string | null;
}

export interface EtatPoste {
  positionId: number | null;
  departmentId: number | null;
  source: "historique" | "fiche";
  reason: string | null;
  changedBy: number | null;
}

export interface EtatSalaire {
  baseSalary: number | null;
  modePaie: PayMode;
  forfaitHebdomadaire: number | null;
  source: "historique" | "fiche";
  debutSegment: string;
  reason: string | null;
  changedBy: number | null;
}

export interface EtatContrat {
  version: number | null;
  typeContrat: string | null;
  poste: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  dureeMois: number | null;
  salaireBase: number | null;
  statut: string | null;
  finPeriodeEssai: string | null;
  avantages: string | null;
  renouvellement: string | null;
  source: "historique" | "fiche";
}

export interface EtatEmployePaie {
  employeId: number;
  date: string;
  etat: EtatPiece;
  emploiActif: boolean;
  statut: string | null;
  sourceStatut: "historique" | "fiche" | "inexistant";
  statutReason: string | null;
  statutChangedBy: number | null;
  dateSortieEffective: string | null;
  poste: EtatPoste | null;
  salaire: EtatSalaire | null;
  contrat: EtatContrat | null;
  situationsActives: SituationActRow[];
  ancienneteJours: number | null;
}

export interface SegmentDuree extends EtatEmployePaie {
  from: string;
  to: string;
  horsPeriodeEmploi: boolean;
}

export interface EmployeeStateAtDate extends EtatEmployePaie {
  /** Agrégeats fournis par l'appelant (router) — pass-through, jamais calculés ici. */
  agregats: Record<string, unknown>;
}

// ─── Helpers ───

const iso = (d: string | Date | null): string | null => {
  if (!d) return null;
  return String(d).slice(0, 10);
};

const num = (v: string | number | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Intervalle [start,end] contenant la date D (end null = intervalle encore ouvert). */
const couvre = (start: string, end: string | null, d: string): boolean => {
  return start <= d && (end === null || end >= d);
};

/** Dernier intervalle gouvernant : start <= D, intervalle encore ouvert à D, start max. */
function gouvernant<T extends { startDate: string; endDate: string | null }>(
  rows: T[],
  d: string
): T | null {
  const candidats = rows
    .filter((r) => {
      const s = iso(r.startDate);
      const e = iso(r.endDate);
      if (!s) return false;
      return couvre(s, e, d);
    })
    .sort((a, b) => (String(a.startDate) < String(b.startDate) ? 1 : -1));
  return candidats[0] ?? null;
}

export function prochaineVersionContrat(versions: readonly ContractVersionRow[]): number {
  if (!versions || versions.length === 0) return 1;
  return Math.max(...versions.map((v) => v.version)) + 1;
}

/** Ancienneté en jours pleins au jour D (bornée à >= 0). */
function ancienneteJours(dateEmbauche: string | null, d: string): number | null {
  if (!dateEmbauche) return null;
  const emb = new Date(`${dateEmbauche}T12:00:00`).getTime();
  const ref = new Date(`${d}T12:00:00`).getTime();
  if (ref < emb) return null;
  return Math.floor((ref - emb) / 86400000);
}

// ─── Moteur ───

/**
 * getEtatEmploye(employeeId via inputs) — état « paie » au jour D.
 * Source(s) : historiques (primauté) puis fiche. Jamais de valeur déduite.
 * `sorti` avant D : statut lu dans l'historique, emboîton dateSortieEffective.
 */
export function getEtatEmploye(input: HistoryEngineInput, d: string): EtatEmployePaie {
  const jour = iso(d)!;
  const { employe } = input;
  const dateEmbauche = iso(employe.dateEmbauche);
  const dateSortie = iso(employe.dateSortie);

  // Statut : intervalle gouvernant sinon fiche sinon inexistant.
  const s = gouvernant(input.statusHistory, jour);
  const statutResolu: {
    statut: string | null;
    source: "historique" | "fiche" | "inexistant";
    reason: string | null;
    changedBy: number | null;
  } = s
    ? { statut: s.statut ?? employe.statut, source: "historique", reason: s.reason, changedBy: s.changedBy }
    : { statut: employe.statut ?? null, source: "fiche", reason: null, changedBy: null };
  if (!s && dateEmbauche && jour < dateEmbauche) {
    statutResolu.source = "inexistant";
  }

  // Poste.
  const p = gouvernant(input.positionHistory, jour);
  const poste: EtatPoste | null = p
    ? {
        positionId: p.positionId,
        departmentId: p.departmentId,
        source: "historique",
        reason: p.reason,
        changedBy: p.changedBy,
      }
    : employe.positionId || employe.departmentId
      ? {
          positionId: employe.positionId,
          departmentId: employe.departmentId,
          source: "fiche",
          reason: null,
          changedBy: null,
        }
      : null;

  // Salaire : intervalle gouvernant sinon fiche.
  const sal = gouvernant(input.salaryHistory, jour);
  const salaire: EtatSalaire | null = sal
    ? {
        baseSalary: num(sal.baseSalary),
        modePaie: normaliserModePaie(sal.modePaie ?? employe.modePaie),
        forfaitHebdomadaire: num(sal.forfaitHebdomadaire ?? employe.forfaitHebdomadaire),
        source: "historique",
        debutSegment: iso(sal.startDate)!,
        reason: sal.reason,
        changedBy: sal.changedBy,
      }
    : employe.salaireBase !== null && employe.salaireBase !== undefined
      ? {
          baseSalary: num(employe.salaireBase),
          modePaie: normaliserModePaie(employe.modePaie),
          forfaitHebdomadaire: num(employe.forfaitHebdomadaire),
          source: "fiche",
          debutSegment: jour,
          reason: null,
          changedBy: null,
        }
      : null;

  // Contrat : version historique gouvernante sinon contrat courant (projection).
  const versionsActives = input.contractVersions.filter((v) => {
    const dDebut = iso(v.dateDebut);
    const dFin = iso(v.dateFin);
    if (!dDebut) return false;
    return couvre(dDebut, dFin, jour);
  });
  const v = versionsActives.sort((a, b) => b.version - a.version)[0] ?? null;
  const c = input.contratsCourants[0] ?? null;
  const contrat: EtatContrat | null = v
    ? {
        version: v.version,
        typeContrat: v.typeContrat,
        poste: v.poste,
        dateDebut: iso(v.dateDebut),
        dateFin: iso(v.dateFin),
        dureeMois: v.dureeMois,
        salaireBase: num(v.salaireBase),
        statut: v.statut,
        finPeriodeEssai: iso(v.finPeriodeEssai),
        avantages: v.avantages,
        renouvellement: v.renouvellement,
        source: "historique",
      }
    : c
      ? {
          version: null,
          typeContrat: c.typeContrat,
          poste: c.poste,
          dateDebut: iso(c.dateDebut),
          dateFin: iso(c.dateFin),
          dureeMois: c.dureeMois,
          salaireBase: num(c.salaireBase),
          statut: c.statut,
          finPeriodeEssai: iso(c.finPeriodeEssai),
          avantages: c.avantages,
          renouvellement: c.renouvellement,
          source: "fiche",
        }
      : null;

  // Situations actives à la date.
  const situationsActives = input.situations
    .filter((x) => couvre(iso(x.dateDebut)!, iso(x.dateFin), jour))
    .sort((a, b) => (String(a.dateDebut) < String(b.dateDebut) ? -1 : 1));

  const emploiActif = !dateEmbauche || dateEmbauche <= jour
    ? !dateSortie || jour <= dateSortie
    : false;
  const dateSortieEffective = dateSortie && jour >= dateSortie ? dateSortie : null;

  return {
    employeId: employe.id,
    date: jour,
    etat: {
      id: employe.id,
      matricule: employe.matricule,
      fonction: employe.fonction,
      dateEmbauche,
      dateSortie,
      motifSortie: employe.motifSortie,
    },
    emploiActif: !dateSortieEffective && emploiActif,
    statut: statutResolu.statut,
    sourceStatut: statutResolu.source,
    statutReason: statutResolu.reason,
    statutChangedBy: statutResolu.changedBy,
    dateSortieEffective,
    poste,
    salaire,
    contrat,
    situationsActives,
    ancienneteJours: ancienneteJours(dateEmbauche, jour),
  };
}

/**
 * getEmployeeStateAt — état complet à une date : état « paie » + aggrégats fournis
 * par la couche appelante (solde congés, avances rejouées, verrou de mois, dernier
 * bulletin, sanctions en vigueur). Lecture seule.
 */
export function getEmployeeStateAt(
  input: HistoryEngineInput,
  date: string,
  agregats: Record<string, unknown> = {}
): EmployeeStateAtDate {
  return { ...getEtatEmploye(input, date), agregats };
}

/**
 * getEmployeeSegments — découpe [from, to] en segments de constance maximale.
 * Borne = `from` + chaque startDate/dateDebut (statut/salaire/poste/contrat/situation)
 * strictement dans (from, to], + la date d'embauche si elle tombe dans cet intervalle.
 * Un changement sur N'IMPORTE QUELLE dimension ouvre un segment. `[]` si from>to.
 */
export function getEmployeeSegments(
  input: HistoryEngineInput,
  from: string,
  to: string
): SegmentDuree[] {
  const f = iso(from)!;
  const t = iso(to)!;
  if (!f || !t || t < f) return [];

  const bornes = new Set<string>([f]);
  const capture = (rows: Array<{ startDate?: string; dateDebut?: string }>) => {
    for (const r of rows) {
      const d = iso(r.startDate ?? r.dateDebut ?? null);
      if (d && d > f && d <= t) bornes.add(d);
    }
  };
  capture(input.statusHistory);
  capture(input.salaryHistory);
  capture(input.positionHistory);
  capture(input.contractVersions);
  capture(input.situations);
  if (input.employe.dateEmbauche) {
    const emb = iso(input.employe.dateEmbauche);
    if (emb && emb > f && emb <= t) bornes.add(emb);
  }

  const dates = [...bornes].sort();
  const segments: SegmentDuree[] = [];
  for (let i = 0; i < dates.length; i++) {
    const debut = dates[i];
    const prochaine = dates[i + 1];
    const fin = prochaine ? new Date(new Date(`${prochaine}T12:00:00`).getTime() - 86400000).toISOString().slice(0, 10) : t;
    if (fin < debut) continue;
    const etat = getEtatEmploye(input, debut);
    const horsEmploi =
      !etat.etat.dateEmbauche || debut < etat.etat.dateEmbauche ||
      (etat.etat.dateSortie !== null && debut > etat.etat.dateSortie);
    segments.push({ ...etat, from: debut, to: fin, horsPeriodeEmploi: horsEmploi });
  }
  return segments;
}