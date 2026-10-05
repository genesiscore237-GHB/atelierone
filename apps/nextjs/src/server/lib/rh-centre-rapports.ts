/**
 * RH — SITUATION RH & PAIE — ANALYSE DE PÉRIODE (lecture seule).
 * Router tRPC `rhPeriode` : situation (tableau paginé + agrégats + état période),
 * employe (volet investigation), export (CSV). Aucune mutation : aucune écriture,
 * aucune préparation de paie, aucune clôture. Les lectures reproduisent les
 * données de R3 (présence) et R4 (paie) sans jamais modifier le moteur.
 * Contrat : DOC/RH/SITUATION_RH_PAIE_API_CONTRACT.md (VERROUILLÉ 2026-09-28).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { db } from "~/server/db";
import {
  employes,
  departments,
  attendanceEntries,
  attendanceCalculations,
  attendanceMonthlySummaries,
  hrPublicHolidays,
  hrWorkSchedules,
  hrGeneralSettings,
  employeeSalaryHistory,
  employeeStatusHistory,
  employeeAdvances,
  advanceRecoveries,
  payrollPeriods,
  payrollEntries,
  payrollItemsConfig,
  absences,
  positions,
  employeePositions,
  hrAttendanceSettings,
  utilisateurs,
} from "@atelierone/db";
import { eq, and, gte, lte, inArray, or, ilike, isNull, isNotNull, ne } from "drizzle-orm";

import { canSeeSalary as peutVoirSalaryRH } from "~/server/lib/rh-secrets";
import { analyserPeriode, type JourAnalyseInput } from "~/server/lib/rh-stats-engine";
import {
  baseEffectifPeriode,
  calculerProrata,
  joursOuvres,
  normaliserModePaie,
  regimeSuspensionEnPeriode,
  veilleDe,
  semainesDansPeriode,
  estIsoDateValide,
  type PayMode,
  type PayrollConfigItem,
} from "~/server/lib/payroll-engine";
import { estEligibleRecuperationPaie, montantRecuperationPaie } from "~/server/lib/avances-engine";
import { regimeSituationPeriode, type SituationLike } from "~/server/lib/situations-engine";
import { chargerSituationsActives } from "~/server/lib/situations-db";
import {
  calculerAvancesRow,
  construireAnomalies,
  filtrerAnomaliesParPermission,
  modeNormaliseSegments,
  projeterPaie,
  segmenterSalaires,
  couvertureBulletin,
  type AvancesRow,
  type SalairesRow,
  type LigneSituation,
  type Anomalie,
  type HistoSalaire,
  type AvanceLecture,
  type RecuperationLecture,
  type SegmentSalaire,
} from "~/server/lib/rh-situation-engine";

export const dateStr = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const MAX_SPAN_MOIS = 13;

export function validerPeriode(from: string, to: string): void {
  // RPT-02 §3 : format ET realite. Une date impossible (2026-02-31) passerait
  // le controle de format et decalerait silencieusement toutes les bornes.
  if (!estIsoDateValide(from) || !estIsoDateValide(to)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Dates invalides : format attendu AAAA-MM-JJ sur une date réelle." });
  }
  if (to < from) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "La date de fin doit suivre la date de début." });
  }
  const debut = new Date(`${from}T12:00:00`);
  const fin = new Date(`${to}T12:00:00`);
  const spanMonths = (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth());
  if (spanMonths >= MAX_SPAN_MOIS) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Période trop longue : max 13 mois civils. Réduisez la plage [Du, Au]." });
  }
}

export async function canSeeSalary(ctx: { user: { id: string; agenceId: number } }): Promise<boolean> {
  return peutVoirSalaryRH(ctx);
}

// ─── Structures intermédiaires (lecture batch, jamais persistées) ───

export interface CalcBrut {
  date: string;
  employeeId: number;
  codePresence: string | null;
  isAbsent: boolean | null;
  workedMinutes: number | null;
  normalMinutes: number | null;
  overtimeMinutes: number | null;
  lateMinutes: number | null;
  earlyDepartureMinutes: number | null;
  lateDeductionAmount: number | null;
  absenceFinancialImpact: number | null;
  taskBonus: number | null;
}

export interface EmployeBrut {
  id: number;
  matricule: string;
  prenom: string | null;
  nom: string;
  departement: string | null;
  statut: string | null;
  salaireBase: number;
  modePaie: string | null;
  forfaitHebdomadaire: number;
  dateEmbauche: string | null;
  dateSortie: string | null;
  workCycleId: number | null;
  dateFinContrat: string | null;
  fonction: string | null;
  departmentId: number | null;
}

export interface SaisieBrute {
  timeIn: string | null;
  timeInBreak: string | null;
  timeOutBreak: string | null;
  timeOut: string | null;
  validated: boolean;
  id: number;
  status: string | null;
  source: string | null;
  absenceType: string | null;
  absenceMotif: string | null;
  absenceJustificatif: string | null;
  notes: string | null;
  validatedBy: number | null;
  validatedAt: string | null;
  createdBy: number | null;
  createdAt: string | null;
}

export interface AbsenceTableRow {
  id: number;
  employeId: number;
  typeAbsence: string;
  dateDebut: string;
  dateFin: string | null;
  dureeJours: number | null;
  motif: string | null;
  justifie: boolean | null;
  statut: string | null;
  validePar: number | null;
  createdAt: string | null;
}

export interface PosteSegment {
  positionId: number | null;
  poste: string | null;
  code: string | null;
  departmentId: number | null;
  departement: string | null;
  dateDebut: string;
  dateFin: string | null;
  motif: string | null;
}

export interface DonneesSituation {
  from: string;
  to: string;
  today: string;
  holidays: string[];
  items: PayrollConfigItem[];
  standardMonthlyHours: number;
  overtimeMultiplier: number;
  seuilDefaut: number;
  employees: EmployeBrut[];
  calcsByEmploye: Map<number, CalcBrut[]>;
  saisiesByEmploye: Map<number, Map<string, SaisieBrute>>;
  histoByEmploye: Map<number, HistoSalaire[]>;
  advancesByEmploye: Map<number, AvanceLecture[]>;
  recoveriesByEmp: Map<number, RecuperationLecture[]>;
  suspensions: Map<string, string>;
  situationsByEmploye: Map<string, SituationLike[]>;
  payrollPeriods: Array<{ id: number; startDate: string; endDate: string; status: string }>;
  summaries: Array<{ year: number; month: number; locked: boolean }>;
  bulletinByEmp: Map<number, { periodId: number; net: number }>;
  nonWorkingByCycle: Map<number, Set<number>>;
  schedByCycleDay: Map<string, { expectedHours: string | null; startTime: string | null; endTime: string | null; breakStart: string | null; breakEnd: string | null }>;
  absencesByEmploye: Map<number, AbsenceTableRow[]>;
  posteSegmentsByEmploye: Map<number, PosteSegment[]>;
  parametresPresence: {
    lateToleranceMinutes: number | null;
    /** RPT-02 §7 B — seuil métier de classement, distinct de la tolérance technique. */
    businessLateThresholdMinutes?: number | null;
    roundToMinutes: number | null;
    autoDeductLate: boolean | null;
    countEarlyArrival: boolean | null;
    countLateDeparture: boolean | null;
  };
  nomsUtilisateurs: Map<number, string>;
}

export interface FiltresSituation {
  employeId?: number;
  employeIds?: number[];
  departementId?: number;
  statut?: string;
  modePaie?: string;
  contrat?: string;
  fonction?: string;
  search?: string;
}

export function heuresTheoriquesDuJour(
  s: { expectedHours: string | null; startTime: string | null; endTime: string | null; breakStart: string | null; breakEnd: string | null } | null | undefined,
  fallback: number
): number {
  if (s?.expectedHours != null) {
    const n = Number(s.expectedHours);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (s?.startTime && s?.endTime) {
    const toMin = (t: string): number | null => {
      const a = parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3, 5), 10);
      return Number.isFinite(a) ? a : null;
    };
    const a = toMin(s.startTime);
    const b = toMin(s.endTime);
    if (a != null && b != null) {
      let h = (b - a) / 60;
      const bs = s.breakStart ? toMin(s.breakStart) : null;
      const be = s.breakEnd ? toMin(s.breakEnd) : null;
      if (bs != null && be != null) h -= (be - bs) / 60;
      if (h > 0) return Math.round(h * 10) / 10;
    }
  }
  return fallback;
}

// ─── Chargement commun (batch, zéro N+1) ───

export async function chargerSituation(
  ctx: { user: { id: string; agenceId: number } },
  from: string,
  to: string,
  filtres: FiltresSituation
): Promise<DonneesSituation> {
  const agenceId = ctx.user.agenceId;

  const condEmployes = [
    eq(employes.agenceId, agenceId),
    ...(filtres.statut ? [eq(employes.statut, filtres.statut)] : [ne(employes.statut, "archive")]),
    ...(filtres.departementId ? [eq(employes.departmentId, filtres.departementId)] : []),
    ...(filtres.employeId ? [eq(employes.id, filtres.employeId)] : []),
    ...(filtres.employeIds && filtres.employeIds.length
      ? [inArray(employes.id, filtres.employeIds)]
      : []),
    ...(filtres.fonction ? [ilike(employes.fonction, `%${filtres.fonction}%`)] : []),
    ...(filtres.contrat === "CDD" ? [isNotNull(employes.dateFinContrat)] : []),
    ...(filtres.contrat === "permanent" ? [isNull(employes.dateFinContrat)] : []),
    ...(filtres.search
      ? [
          or(
            ilike(employes.nom, `%${filtres.search}%`),
            ilike(employes.prenom, `%${filtres.search}%`),
            ilike(employes.matricule, `%${filtres.search}%`)
          ),
        ]
      : []),
  ];

  const empRows = await db
    .select({
      id: employes.id,
      matricule: employes.matricule,
      prenom: employes.prenom,
      nom: employes.nom,
      departement: departments.name,
      statut: employes.statut,
      salaireBase: employes.salaireBase,
      modePaie: employes.modePaie,
      forfaitHebdomadaire: employes.forfaitHebdomadaire,
      dateEmbauche: employes.dateEmbauche,
      dateSortie: employes.dateSortie,
      workCycleId: employes.workCycleId,
      dateFinContrat: employes.dateFinContrat,
      fonction: employes.fonction,
      departmentId: employes.departmentId,
    })
    .from(employes)
    .leftJoin(departments, eq(employes.departmentId, departments.id))
    .where(and(...condEmployes));

  const employees: EmployeBrut[] = empRows.map((e) => ({
    id: e.id,
    matricule: e.matricule,
    prenom: e.prenom,
    nom: e.nom,
    departement: e.departement,
    statut: e.statut,
    salaireBase: Number(e.salaireBase ?? 0),
    modePaie: e.modePaie,
    forfaitHebdomadaire: Number(e.forfaitHebdomadaire ?? 0),
    dateEmbauche: e.dateEmbauche ? String(e.dateEmbauche).slice(0, 10) : null,
    dateSortie: e.dateSortie ? String(e.dateSortie).slice(0, 10) : null,
    workCycleId: e.workCycleId,
    dateFinContrat: e.dateFinContrat ? String(e.dateFinContrat).slice(0, 10) : null,
    fonction: e.fonction,
    departmentId: e.departmentId,
  }));

  if (filtres.modePaie) {
    const attendu = normaliserModePaie(filtres.modePaie);
    const gardes = employees.filter((e) => normaliserModePaie(e.modePaie) === attendu);
    employees.splice(0, employees.length, ...gardes);
  }

  const employeIds = employees.map((e) => e.id);

  // Présence : calculs journaliers (miroir rh-presence.analysePeriode + agrégats R4)
  const calcs = await db
    .select({
      employeeId: attendanceEntries.employeeId,
      date: attendanceEntries.date,
      codePresence: attendanceCalculations.codePresence,
      isAbsent: attendanceCalculations.isAbsent,
      workedMinutes: attendanceCalculations.workedMinutes,
      normalMinutes: attendanceCalculations.normalMinutes,
      overtimeMinutes: attendanceCalculations.overtimeMinutes,
      lateMinutes: attendanceCalculations.lateMinutes,
      earlyDepartureMinutes: attendanceCalculations.earlyDepartureMinutes,
      lateDeductionAmount: attendanceCalculations.lateDeductionAmount,
      absenceFinancialImpact: attendanceCalculations.absenceFinancialImpact,
      taskBonus: attendanceEntries.taskBonus,
    })
    .from(attendanceCalculations)
    .innerJoin(attendanceEntries, eq(attendanceCalculations.attendanceEntryId, attendanceEntries.id))
    .innerJoin(employes, eq(attendanceEntries.employeeId, employes.id))
    .where(
      and(
        gte(attendanceEntries.date, from),
        lte(attendanceEntries.date, to),
        eq(employes.agenceId, agenceId),
        ...(employeIds.length
          ? [inArray(attendanceEntries.employeeId, employeIds)]
          : [eq(attendanceEntries.employeeId, -1)])
      )
    );

  const calcsByEmploye = new Map<number, CalcBrut[]>();
  for (const c of calcs) {
    const liste = calcsByEmploye.get(c.employeeId) ?? [];
    liste.push({
      date: String(c.date),
      employeeId: c.employeeId,
      codePresence: c.codePresence,
      isAbsent: c.isAbsent,
      workedMinutes: c.workedMinutes,
      normalMinutes: c.normalMinutes,
      overtimeMinutes: c.overtimeMinutes,
      lateMinutes: c.lateMinutes,
      earlyDepartureMinutes: c.earlyDepartureMinutes,
      lateDeductionAmount: c.lateDeductionAmount === null ? null : Number(c.lateDeductionAmount),
      absenceFinancialImpact: c.absenceFinancialImpact === null ? null : Number(c.absenceFinancialImpact),
      taskBonus: c.taskBonus === null ? null : Number(c.taskBonus),
    });
    calcsByEmploye.set(c.employeeId, liste);
  }

  const saisiesAll = await db
    .select({
      id: attendanceEntries.id,
      employeeId: attendanceEntries.employeeId,
      date: attendanceEntries.date,
      timeIn: attendanceEntries.timeIn,
      timeInBreak: attendanceEntries.timeInBreak,
      timeOutBreak: attendanceEntries.timeOutBreak,
      timeOut: attendanceEntries.timeOut,
      validated: attendanceEntries.validated,
      status: attendanceEntries.status,
      source: attendanceEntries.source,
      absenceType: attendanceEntries.absenceType,
      absenceMotif: attendanceEntries.absenceMotif,
      absenceJustificatif: attendanceEntries.absenceJustificatif,
      notes: attendanceEntries.notes,
      validatedBy: attendanceEntries.validatedBy,
      validatedAt: attendanceEntries.validatedAt,
      createdBy: attendanceEntries.createdBy,
      createdAt: attendanceEntries.createdAt,
    })
    .from(attendanceEntries)
    .innerJoin(employes, eq(attendanceEntries.employeeId, employes.id))
    .where(
      and(
        gte(attendanceEntries.date, from),
        lte(attendanceEntries.date, to),
        ...(employeIds.length
          ? [inArray(attendanceEntries.employeeId, employeIds)]
          : [eq(attendanceEntries.employeeId, -1)])
      )
    );
  const saisiesByEmploye = new Map<number, Map<string, SaisieBrute>>();
  const utilisateurIds = new Set<number>();
  for (const s of saisiesAll) {
    const jours = saisiesByEmploye.get(s.employeeId) ?? new Map<string, SaisieBrute>();
    jours.set(String(s.date), {
      id: s.id,
      timeIn: s.timeIn,
      timeInBreak: s.timeInBreak,
      timeOutBreak: s.timeOutBreak,
      timeOut: s.timeOut,
      validated: !!s.validated,
      status: s.status,
      source: s.source,
      absenceType: s.absenceType,
      absenceMotif: s.absenceMotif,
      absenceJustificatif: s.absenceJustificatif,
      notes: s.notes,
      validatedBy: s.validatedBy,
      validatedAt: s.validatedAt ? String(s.validatedAt) : null,
      createdBy: s.createdBy,
      createdAt: s.createdAt ? String(s.createdAt) : null,
    });
    if (s.validatedBy) utilisateurIds.add(s.validatedBy);
    if (s.createdBy) utilisateurIds.add(s.createdBy);
    saisiesByEmploye.set(s.employeeId, jours);
  }

  // Absences déclaratives (période ouverte comprise) : supplements du journal, jamais une addition.
  const absencesAll = await db
    .select({
      id: absences.id,
      employeId: absences.employeId,
      typeAbsence: absences.typeAbsence,
      dateDebut: absences.dateDebut,
      dateFin: absences.dateFin,
      dureeJours: absences.dureeJours,
      motif: absences.motif,
      justifie: absences.justifie,
      statut: absences.statut,
      validePar: absences.validePar,
      createdAt: absences.createdAt,
    })
    .from(absences)
    .innerJoin(employes, eq(absences.employeId, employes.id))
    .where(
      and(
        eq(employes.agenceId, agenceId),
        lte(absences.dateDebut, to),
        or(isNull(absences.dateFin), gte(absences.dateFin, from)),
        ...(employeIds.length
          ? [inArray(absences.employeId, employeIds)]
          : [eq(absences.employeId, -1)])
      )
    );
  const absencesByEmploye = new Map<number, AbsenceTableRow[]>();
  for (const a of absencesAll) {
    const liste = absencesByEmploye.get(a.employeId) ?? [];
    liste.push({
      id: a.id,
      employeId: a.employeId,
      typeAbsence: a.typeAbsence,
      dateDebut: String(a.dateDebut).slice(0, 10),
      dateFin: a.dateFin ? String(a.dateFin).slice(0, 10) : null,
      dureeJours: a.dureeJours === null ? null : Number(a.dureeJours),
      motif: a.motif,
      justifie: a.justifie,
      statut: a.statut,
      validePar: a.validePar,
      createdAt: a.createdAt ? String(a.createdAt) : null,
    });
    if (a.validePar) utilisateurIds.add(a.validePar);
    absencesByEmploye.set(a.employeId, liste);
  }

  const idsUtilisateurs = [...utilisateurIds];
  const nomsUtilisateurs = new Map<number, string>();
  if (idsUtilisateurs.length) {
    const utilRows = await db
      .select({ id: utilisateurs.id, nom: utilisateurs.nom, prenom: utilisateurs.prenom })
      .from(utilisateurs)
      .where(inArray(utilisateurs.id, idsUtilisateurs));
    for (const u of utilRows) {
      nomsUtilisateurs.set(u.id, [u.prenom, u.nom].filter(Boolean).join(" ").trim());
    }
  }

  // Historique des postes (segments, jamais d'écrasement par l'actuel)
  const posteSegmentsByEmploye = new Map<number, PosteSegment[]>();
  if (employeIds.length) {
    const posteRows = await db
      .select({
        employeeId: employeePositions.employeeId,
        positionId: employeePositions.positionId,
        poste: positions.name,
        code: positions.code,
        departmentId: employeePositions.departmentId,
        departement: departments.name,
        startDate: employeePositions.startDate,
        endDate: employeePositions.endDate,
        reason: employeePositions.reason,
      })
      .from(employeePositions)
      .leftJoin(positions, eq(employeePositions.positionId, positions.id))
      .leftJoin(departments, eq(employeePositions.departmentId, departments.id))
      .where(
        and(
          inArray(employeePositions.employeeId, employeIds),
          lte(employeePositions.startDate, to),
          or(isNull(employeePositions.endDate), gte(employeePositions.endDate, from))
        )
      );
    for (const p of posteRows) {
      const liste = posteSegmentsByEmploye.get(p.employeeId) ?? [];
      liste.push({
        positionId: p.positionId,
        poste: p.poste,
        code: p.code,
        departmentId: p.departmentId,
        departement: p.departement,
        dateDebut: String(p.startDate).slice(0, 10),
        dateFin: p.endDate ? String(p.endDate).slice(0, 10) : null,
        motif: p.reason,
      });
      posteSegmentsByEmploye.set(p.employeeId, liste);
    }
    for (const liste of posteSegmentsByEmploye.values()) {
      liste.sort((a, b) => (a.dateDebut < b.dateDebut ? -1 : a.dateDebut > b.dateDebut ? 1 : 0));
    }
  }

  const [settingsRow] = await db
    .select({
      lateToleranceMinutes: hrAttendanceSettings.lateToleranceMinutes,
      roundToMinutes: hrAttendanceSettings.roundToMinutes,
      autoDeductLate: hrAttendanceSettings.autoDeductLate,
      countEarlyArrival: hrAttendanceSettings.countEarlyArrival,
      countLateDeparture: hrAttendanceSettings.countLateDeparture,
    })
    .from(hrAttendanceSettings)
    .where(eq(hrAttendanceSettings.agenceId, agenceId))
    .limit(1);
  const parametresPresence = {
    lateToleranceMinutes: settingsRow?.lateToleranceMinutes ?? null,
    roundToMinutes: settingsRow?.roundToMinutes ?? null,
    autoDeductLate: settingsRow?.autoDeductLate ?? null,
    countEarlyArrival: settingsRow?.countEarlyArrival ?? null,
    countLateDeparture: settingsRow?.countLateDeparture ?? null,
  };

  const feries = await db
    .select({ date: hrPublicHolidays.date })
    .from(hrPublicHolidays)
    .where(
      and(
        eq(hrPublicHolidays.agenceId, agenceId),
        gte(hrPublicHolidays.date, from),
        lte(hrPublicHolidays.date, to)
      )
    );
  const holidays = feries.map((f) => String(f.date));

  const cycleIds = [...new Set(employees.map((e) => e.workCycleId).filter(Boolean))] as number[];
  const schedules = cycleIds.length
    ? await db.select().from(hrWorkSchedules).where(inArray(hrWorkSchedules.cycleId, cycleIds))
    : [];
  const schedByCycleDay = new Map<string, { expectedHours: string | null; startTime: string | null; endTime: string | null; breakStart: string | null; breakEnd: string | null }>();
  const nonWorkingByCycle = new Map<number, Set<number>>();
  for (const s of schedules) {
    schedByCycleDay.set(`${s.cycleId}:${s.dayOfWeek}`, {
      expectedHours: s.expectedHours,
      startTime: s.startTime,
      endTime: s.endTime,
      breakStart: s.breakStart,
      breakEnd: s.breakEnd,
    });
    if (s.isWorkingDay === false) {
      const set = nonWorkingByCycle.get(s.cycleId) ?? new Set<number>();
      set.add(s.dayOfWeek);
      nonWorkingByCycle.set(s.cycleId, set);
    }
  }

  const [generalRow] = await db
    .select({
      standardMonthlyHours: hrGeneralSettings.standardMonthlyHours,
      overtimeMultiplier: hrGeneralSettings.overtimeMultiplier,
      defaultOvertimeThreshold: hrGeneralSettings.defaultOvertimeThreshold,
    })
    .from(hrGeneralSettings)
    .where(eq(hrGeneralSettings.agenceId, agenceId))
    .limit(1);
  const standardMonthlyHours = Number(generalRow?.standardMonthlyHours ?? 225.3) || 225.3;
  const overtimeMultiplier = Number(generalRow?.overtimeMultiplier ?? 1.5) || 1.5;
  const seuilDefaut = Number(generalRow?.defaultOvertimeThreshold ?? 9.5) || 9.5;

  const items = (await db
    .select()
    .from(payrollItemsConfig)
    .where(and(eq(payrollItemsConfig.agenceId, agenceId), eq(payrollItemsConfig.active, true)))
    .orderBy(payrollItemsConfig.sortOrder)) as unknown as PayrollConfigItem[];

  // Historique salarial daté croisant la période
  const histo = await db
    .select({
      employeeId: employeeSalaryHistory.employeeId,
      baseSalary: employeeSalaryHistory.baseSalary,
      startDate: employeeSalaryHistory.startDate,
      endDate: employeeSalaryHistory.endDate,
      modePaie: employeeSalaryHistory.modePaie,
      forfaitHebdomadaire: employeeSalaryHistory.forfaitHebdomadaire,
    })
    .from(employeeSalaryHistory)
    .innerJoin(employes, eq(employeeSalaryHistory.employeeId, employes.id))
    .where(
      and(
        eq(employes.agenceId, agenceId),
        lte(employeeSalaryHistory.startDate, to),
        or(isNull(employeeSalaryHistory.endDate), gte(employeeSalaryHistory.endDate, from)),
        ...(employeIds.length
          ? [inArray(employeeSalaryHistory.employeeId, employeIds)]
          : [eq(employeeSalaryHistory.employeeId, -1)])
      )
    );
  const histoByEmploye = new Map<number, HistoSalaire[]>();
  for (const h of histo) {
    const liste = histoByEmploye.get(h.employeeId) ?? [];
    liste.push({
      startDate: String(h.startDate),
      endDate: h.endDate ? String(h.endDate) : null,
      baseSalary: h.baseSalary,
      modePaie: h.modePaie,
      forfaitHebdomadaire: h.forfaitHebdomadaire,
    });
    histoByEmploye.set(h.employeeId, liste);
  }

  // Avances (versées <= to, non annulées) + récupérations
  const advances = await db
    .select({
      id: employeeAdvances.id,
      employeeId: employeeAdvances.employeeId,
      montant: employeeAdvances.montant,
      dateVersement: employeeAdvances.dateVersement,
      statut: employeeAdvances.statut,
      soldeRestant: employeeAdvances.soldeRestant,
      periodeRecuperationDebut: employeeAdvances.periodeRecuperationDebut,
      periodeRecuperationFin: employeeAdvances.periodeRecuperationFin,
    })
    .from(employeeAdvances)
    .innerJoin(employes, eq(employeeAdvances.employeeId, employes.id))
    .where(
      and(
        eq(employes.agenceId, agenceId),
        lte(employeeAdvances.dateVersement, to),
        ne(employeeAdvances.statut, "ANNULÉE"),
        ...(employeIds.length
          ? [inArray(employeeAdvances.employeeId, employeIds)]
          : [eq(employeeAdvances.employeeId, -1)])
      )
    );
  const advancesByEmploye = new Map<number, AvanceLecture[]>();
  const advanceIds: number[] = [];
  for (const a of advances) {
    const liste = advancesByEmploye.get(a.employeeId) ?? [];
    liste.push({
      id: a.id,
      montant: Number(a.montant ?? 0),
      dateVersement: String(a.dateVersement).slice(0, 10),
      statut: a.statut,
      soldeRestant: Number(a.soldeRestant ?? 0),
      recuperationDebut: a.periodeRecuperationDebut ? String(a.periodeRecuperationDebut).slice(0, 10) : null,
      recuperationFin: a.periodeRecuperationFin ? String(a.periodeRecuperationFin).slice(0, 10) : null,
    });
    advancesByEmploye.set(a.employeeId, liste);
    advanceIds.push(a.id);
  }
  const recoveries = advanceIds.length
    ? await db
        .select({ advanceId: advanceRecoveries.advanceId, dateRecuperation: advanceRecoveries.dateRecuperation, montant: advanceRecoveries.montant })
        .from(advanceRecoveries)
        .where(and(inArray(advanceRecoveries.advanceId, advanceIds), lte(advanceRecoveries.dateRecuperation, to)))
    : [];
  const recoveriesByEmp = new Map<number, RecuperationLecture[]>();
  for (const a of advances) {
    const liste = recoveriesByEmp.get(a.employeeId) ?? [];
    for (const r of recoveries) {
      if (r.advanceId !== a.id) continue;
      liste.push({ advanceId: r.advanceId, dateRecuperation: String(r.dateRecuperation).slice(0, 10), montant: Number(r.montant ?? 0) });
    }
    if (liste.length) recoveriesByEmp.set(a.employeeId, liste);
  }

  // Suspensions en cours (intervalle ouvert)
  const suspensions = await db
    .select({
      employeeId: employeeStatusHistory.employeeId,
      startDate: employeeStatusHistory.startDate,
    })
    .from(employeeStatusHistory)
    .innerJoin(employes, eq(employeeStatusHistory.employeeId, employes.id))
    .where(
      and(
        eq(employes.agenceId, agenceId),
        eq(employeeStatusHistory.statut, "suspendu"),
        isNull(employeeStatusHistory.endDate)
      )
    );
  const suspensionsPar = new Map<string, string>(
    suspensions.map((s) => [String(s.employeeId), String(s.startDate).slice(0, 10)])
  );

  // R6 — situations ACTIF : la paie projetée est pilotée par le régime (repli legacy sinon)
  const situationsByEmploye = new Map<string, SituationLike[]>();
  const situationsBrut = await chargerSituationsActives(agenceId, from, to);
  for (const [empId, arr] of situationsBrut) situationsByEmploye.set(String(empId), arr);

  const periodesPaie = await db
    .select({ id: payrollPeriods.id, startDate: payrollPeriods.startDate, endDate: payrollPeriods.endDate, status: payrollPeriods.status })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.agenceId, agenceId));
  const summaries = await db
    .select({ year: attendanceMonthlySummaries.year, month: attendanceMonthlySummaries.month, locked: attendanceMonthlySummaries.locked })
    .from(attendanceMonthlySummaries)
    .innerJoin(employes, eq(attendanceMonthlySummaries.employeeId, employes.id))
    .where(
      and(
        eq(employes.agenceId, agenceId),
        ...(employeIds.length
          ? [inArray(attendanceMonthlySummaries.employeeId, employeIds)]
          : [eq(attendanceMonthlySummaries.employeeId, -1)])
      )
    );

  const entries = await db
    .select({ employeeId: payrollEntries.employeeId, periodId: payrollEntries.periodId, netPay: payrollEntries.netPay })
    .from(payrollEntries)
    .innerJoin(payrollPeriods, eq(payrollEntries.periodId, payrollPeriods.id))
    .where(eq(payrollPeriods.agenceId, agenceId));

  const bulletinByEmp = new Map<number, { periodId: number; net: number }>();
  for (const e of employees) {
    const b = couvertureBulletin({ periods: periodesPaie, entries, employeeId: e.id, from, to });
    if (b) bulletinByEmp.set(e.id, b);
  }

  return {
    from,
    to,
    today: new Date().toISOString().slice(0, 10),
    holidays,
    items,
    standardMonthlyHours,
    overtimeMultiplier,
    seuilDefaut,
    employees,
    calcsByEmploye,
    saisiesByEmploye,
    histoByEmploye,
    advancesByEmploye,
    recoveriesByEmp,
    suspensions: suspensionsPar,
    situationsByEmploye,
    payrollPeriods: periodesPaie,
    summaries,
    bulletinByEmp,
    nonWorkingByCycle,
    schedByCycleDay,
    absencesByEmploye,
    posteSegmentsByEmploye,
    parametresPresence,
    nomsUtilisateurs,
  };
}

// ─── Construction des lignes ───

export function jourOuvrePour(emp: EmployeBrut, iso: string, d: DonneesSituation): boolean {
  const dow = new Date(`${iso}T12:00:00`).getDay();
  if (dow === 0) return false;
  if (d.holidays.includes(iso)) return false;
  if (emp.dateEmbauche && iso < emp.dateEmbauche) return false;
  if (emp.dateSortie && iso > emp.dateSortie) return false;
  if (emp.workCycleId) {
    const nonWorking = d.nonWorkingByCycle.get(emp.workCycleId) ?? new Set<number>();
    if (nonWorking.has(dow)) return false;
  }
  return true;
}

export function construireJoursEmploye(emp: EmployeBrut, d: DonneesSituation): JourAnalyseInput[] {
  const calcByDate = new Map((d.calcsByEmploye.get(emp.id) ?? []).map((c) => [c.date, c]));
  const jours: JourAnalyseInput[] = [];
  const cursor = new Date(`${d.from}T12:00:00`);
  const fin = new Date(`${d.to}T12:00:00`);
  while (cursor <= fin) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const isWorking = jourOuvrePour(emp, iso, d);
    const sched = emp.workCycleId ? d.schedByCycleDay.get(`${emp.workCycleId}:${cursor.getDay()}`) : undefined;
    const c = calcByDate.get(iso);
    // RPT-02 : un jour non ouvert (dimanche, ferie, jour hors planning, jour
    // hors periode d'emploi) porte ZERO heure theorique. `analyserPeriode`
    // ignore deja ces lignes, mais la valeur doit rester coherente pour tout
    // consommateur qui lit le jour isole (sinon un dimanche affiche 9,5 h).
    const baseHeures = isWorking
      ? sched
        ? heuresTheoriquesDuJour(sched, d.seuilDefaut)
        : d.seuilDefaut
      : 0;
    jours.push(
      c
        ? {
            date: iso,
            code: (c.codePresence ?? "P") as JourAnalyseInput["code"],
            isWorkingDay: isWorking,
            heuresTheoriques: baseHeures,
            workedMinutes: c.workedMinutes ?? 0,
            normalMinutes: c.normalMinutes ?? 0,
            overtimeMinutes: c.overtimeMinutes ?? 0,
            lateMinutes: c.lateMinutes ?? 0,
            earlyDepartureMinutes: c.earlyDepartureMinutes ?? 0,
          }
        : {
            date: iso,
            code: "MUET",
            isWorkingDay: isWorking,
            heuresTheoriques: baseHeures,
            workedMinutes: 0,
            normalMinutes: 0,
            overtimeMinutes: 0,
            lateMinutes: 0,
            earlyDepartureMinutes: 0,
          }
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return jours;
}

export function analyserPresenceEmploye(emp: EmployeBrut, d: DonneesSituation): ReturnType<typeof analyserPeriode> {
  return analyserPeriode(construireJoursEmploye(emp, d));
}

export function agregerPresencesPaie(emp: EmployeBrut, d: DonneesSituation, debutEffectif: string, finEffective: string) {
  const calcs = (d.calcsByEmploye.get(emp.id) ?? []).filter((c) => c.date >= debutEffectif && c.date <= finEffective);
  let normal = 0, overtime = 0, taskBonus = 0, daysPresent = 0, daysAbsent = 0, lateDeduction = 0, absenceImpact = 0;
  for (const c of calcs) {
    normal += c.normalMinutes ?? 0;
    overtime += c.overtimeMinutes ?? 0;
    taskBonus += Number(c.taskBonus ?? 0);
    if (c.isAbsent === true) daysAbsent += 1;
    else if (c.isAbsent === false) daysPresent += 1;
    lateDeduction += Number(c.lateDeductionAmount ?? 0);
    absenceImpact += Number(c.absenceFinancialImpact ?? 0);
  }
  return {
    normalHours: Math.round((normal / 60) * 100) / 100,
    overtimeHours: Math.round((overtime / 60) * 100) / 100,
    taskBonus: Math.round(taskBonus * 100) / 100,
    daysPresent,
    daysAbsent,
    lateDeductionAmount: Math.round(lateDeduction * 100) / 100,
    absenceFinancialImpact: Math.round(absenceImpact * 100) / 100,
  };
}

export function projectionEmploye(emp: EmployeBrut, d: DonneesSituation, mode: PayMode) {
  // R6 — régime paie piloté par les situations ACTIF ; repli legacy N11 quand aucune.
  // MAINTIEN_RÉMUNÉRATION / INDEMNISATION_EXTERNE → paie normale ; partiel non payé
  // → prorata jusqu'à la veille de l'effet de la situation dominante.
  const situationsEmp = d.situationsByEmploye.get(String(emp.id)) ?? [];
  let dateSortiePaie = emp.dateSortie;
  if (situationsEmp.length > 0) {
    const r6 = regimeSituationPeriode({ situations: situationsEmp, debutPeriode: d.from, finPeriode: d.to });
    if (
      r6.regime === "partiel" &&
      r6.impactPaie !== "MAINTIEN_REMUNERATION" &&
      r6.impactPaie !== "INDEMNISATION_EXTERNE"
    ) {
      dateSortiePaie = veilleDe(r6.dateDebut ?? d.from);
    }
  } else {
    const regimeLegacy = regimeSuspensionEnPeriode({
      statut: emp.statut,
      suspensionStart: d.suspensions.get(String(emp.id)) ?? null,
      debutPeriode: d.from,
    });
    if (regimeLegacy === "partiel") dateSortiePaie = veilleDe(d.suspensions.get(String(emp.id)) ?? "");
  }

  const prorata = calculerProrata({
    dateDebutPeriode: d.from,
    dateFinPeriode: d.to,
    dateEmbauche: emp.dateEmbauche,
    dateSortie: dateSortiePaie,
    holidays: d.holidays,
  });

  const baseEffective = baseEffectifPeriode({
    baseCourante: emp.salaireBase,
    modePaie: mode,
    periode: { debut: d.from, fin: d.to },
    emploi: { dateEmbauche: emp.dateEmbauche, dateSortie: dateSortiePaie },
    salaries: (d.histoByEmploye.get(emp.id) ?? []).map((h) => ({ baseSalary: h.baseSalary, startDate: h.startDate })),
    holidays: d.holidays,
  });

  const agg = agregerPresencesPaie(emp, d, prorata.debutEffectif, prorata.finEffective);

  const advancesReco = (d.advancesByEmploye.get(emp.id) ?? [])
    .filter((a) =>
      estEligibleRecuperationPaie({
        statut: a.statut ?? "",
        soldeRestant: a.soldeRestant,
        debut: a.recuperationDebut ?? null,
        fin: a.recuperationFin ?? null,
        periodeDebut: d.from,
        periodeFin: d.to,
      })
    )
    .map((a) => ({
      advanceId: a.id,
      amount: montantRecuperationPaie({ montant: a.montant, montantRecupere: 0, soldeRestant: a.soldeRestant }),
    }))
    .filter((a) => a.amount > 0);

  const projection = projeterPaie({
    modePaie: mode,
    baseSalary: baseEffective,
    forfaitHebdomadaire: mode === "FORFAIT_HEBDOMADAIRE" ? emp.forfaitHebdomadaire : 0,
    overtimeHours: agg.overtimeHours,
    daysPresent: agg.daysPresent,
    daysAbsent: agg.daysAbsent,
    expectedWorkingDays: joursOuvres(d.from, d.to, d.holidays),
    normalHours: agg.normalHours,
    taskBonus: agg.taskBonus,
    lateDeductionAmount: agg.lateDeductionAmount,
    absenceFinancialImpact: agg.absenceFinancialImpact,
    items: d.items,
    advancesToRecover: advancesReco,
    standardMonthlyHours: d.standardMonthlyHours,
    overtimeMultiplier: d.overtimeMultiplier,
    weeksInPeriod: semainesDansPeriode(prorata.debutEffectif, prorata.finEffective),
  });

  return { projection, baseEffective, prorata, agg };
}

export function construireLigne(emp: EmployeBrut, d: DonneesSituation, canSee: boolean): LigneSituation {
  const analyse = analyserPresenceEmploye(emp, d);

  const fiche = { baseSalary: emp.salaireBase, modePaie: emp.modePaie, forfaitHebdomadaire: emp.forfaitHebdomadaire };
  const segments: SegmentSalaire[] = segmenterSalaires({ fiche, historique: d.histoByEmploye.get(emp.id) ?? [], from: d.from, to: d.to });
  const modeSegments = modeNormaliseSegments(segments);
  const mode = modeSegments ?? normaliserModePaie(emp.modePaie);

  const avancesLectures = d.advancesByEmploye.get(emp.id) ?? [];
  const avancesRow: AvancesRow = calculerAvancesRow({
    advances: avancesLectures,
    recoveries: d.recoveriesByEmp.get(emp.id) ?? [],
    from: d.from,
    to: d.to,
  });

  let salaires: SalairesRow | null = null;
  let projectionNet: number | null = null;
  const bulletin = d.bulletinByEmp.get(emp.id) ?? null;

  if (canSee) {
    const { projection, baseEffective } = projectionEmploye(emp, d, mode as PayMode);
    projectionNet = bulletin ? null : projection.net;
    const net = bulletin ? bulletin.net : projection.net;
    salaires = {
      baseContractuelle: baseEffective,
      gains: projection.gains,
      retenues: projection.retenues,
      net,
      netLabel: bulletin ? "REEL" : "ESTIME",
      segments,
      tauxHoraire: projection.tauxHoraire,
      bulletinExiste: !!bulletin,
    };
  }

  const contratExiste = Boolean(emp.dateEmbauche || emp.dateFinContrat);
  const anomalies: Anomalie[] = construireAnomalies({
    periode: { from: d.from, to: d.to },
    employe: {
      employeeId: emp.id,
      matricule: emp.matricule,
      nom: emp.nom,
      prenom: emp.prenom,
      statut: emp.statut,
      departement: emp.departement,
      mode,
      contratExiste,
      dateEmbauche: emp.dateEmbauche,
      dateSortie: emp.dateSortie,
    },
    presence: analyse,
    salaires,
    avances: canSee ? avancesRow : null,
    projectionNet,
    bulletinNet: bulletin?.net ?? null,
    today: d.today,
  });

  return {
    employeeId: emp.id,
    matricule: emp.matricule,
    prenom: emp.prenom,
    nom: emp.nom,
    departement: emp.departement,
    statut: emp.statut,
    mode,
    joursTheoriques: analyse.joursTheoriques,
    joursPresence: analyse.joursPresence,
    joursAbsence: analyse.joursAbsence,
    joursConges: analyse.joursConges,
    joursMuets: analyse.joursMuets,
    heuresTheoriques: analyse.heuresTheoriques,
    heuresTravaillees: analyse.heuresTravaillees,
    heuresNormales: analyse.heuresNormales,
    heuresSupp: analyse.heuresSupp,
    retardTotalMinutes: analyse.retardTotalMinutes,
    departAnticipeTotalMinutes: analyse.departAnticipeTotalMinutes,
    tauxPresence: analyse.tauxPresence,
    salaires: canSee ? salaires : null,
    avances: canSee ? avancesRow : null,
    anomalies: filtrerAnomaliesParPermission(anomalies, canSee),
  };
}

// ═══ RPT-01 : couche source unique read-only pour le Centre Rapports ═══

export type TypeEvenementRapport =
  | "ABSENCE"
  | "RETARD"
  | "CONGE"
  | "MALADIE"
  | "ACCIDENT"
  | "SITUATION_RH"
  | "AUTRE";

export type SourceEvenement = "attendance_entries" | "attendance_calculations" | "absences" | "situations_rh";

/**
 * RPT-02 §9 — POURQUOI UN ÉVÉNEMENT D'ABSENCE N'EST-IL PAS UN JOUR COMPTABILISÉ ?
 *
 * Un `ReportEvent` d'absence est une TRACE (une saisie, une déclaration). Un
 * `joursAbsence` est un JOUR OUVRÉ EFFECTIVEMENT DÉCOMPTE. Les deux ne peuvent
 * pas être confondus : la différence est légalement explicable et doit être
 * justifiée ligne à ligne, jamais masquée.
 */
export type MotifNonComptabilisation =
  /** Jour de dimanche : jamais un jour ouvré. */
  | "DIMANCHE"
  /** Jour férié de l'agence. */
  | "JOUR_FERIE"
  /** Le planning du cycle pose ce jour comme non travaillé (ex. samedi off). */
  | "NON_OUVRE_PLANNING"
  /** Date antérieure à l'embauche ou postérieure à la sortie. */
  | "HORS_PERIODE_EMPLOI"
  /** Trace déclarée (table `absences`) sans calcul R3 correspondant ce jour-là. */
  | "DECLARATION_SEULE"
  /** Le calcul R3 du jour porte un autre code que « A » (congé, maladie…). */
  | "CODE_CALCULE_DIFFERENT";

export interface ReportEvent {
  id: string;
  employeeId: number;
  matricule: string;
  date: string;
  type: TypeEvenementRapport;
  libelle: string;
  presenceCode: string | null;
  justificatif: string | null;
  motif: string | null;
  presenceValidee: boolean | null;
  validePar: string | null;
  auteur: string | null;
  lateMinutes: number | null;
  earlyDepartureMinutes: number | null;
  payrollImpact: number | null;
  source: SourceEvenement;
  /**
   * Cet événement d'absence est-il compté dans `joursAbsence` ?
   * `null` pour les événements qui ne sont pas des absences (retard, RH).
   */
  comptabilise: boolean | null;
  /** Raison de non-comptabilisation (`null` si comptabilisé ou sans objet). */
  motifNonComptabilisation: MotifNonComptabilisation | null;
}

export interface EmployeeReportRow {
  employeeId: number;
  matricule: string;
  nom: string;
  prenom: string | null;
  departement: string | null;
  fonction: string | null;
  posteSegments: PosteSegment[];
  statut: string | null;
  mode: string | null;
  dateEmbauche: string | null;
  dateFinContrat: string | null;
  dateSortie: string | null;

  joursTheoriques: number;
  joursPresence: number;
  joursAbsence: number;
  joursAbsents: number;
  joursConges: number;
  joursMuets: number;

  heuresTheoriques: number;
  heuresAttendues: number;
  heuresTravaillees: number;
  heuresNormales: number;
  heuresSupp: number;

  retardTotalMinutes: number;
  departAnticipeTotalMinutes: number;
  tauxPresence: number | null;
  tauxPresenceHeures: number | null;

  masseAcquise: number | null;
  baseContractuelle: number | null;
  gains: number | null;
  retenues: number | null;
  totalNet: number | null;
  netLabel: string | null;
  tauxHoraire: number | null;
  bulletinExiste: boolean | null;
  segmentsSalaires: SegmentSalaire[];

  avancePeriode: number | null;
  recuperePeriode: number | null;
  soldeFinPeriode: number | null;
  soldeActuel: number | null;
  nbAvances: number | null;

  anomalieCount: number;
  anomalies: Anomalie[];
  salariesVisible: boolean;
}

export interface ReportSummary {
  employes: number;
  joursTheoriques: number;
  joursPresence: number;
  joursAbsence: number;
  joursConges: number;
  heuresTheoriques: number;
  heuresAttendues: number;
  heuresTravaillees: number;
  heuresNormales: number;
  heuresSupp: number;
  retardTotalMinutes: number;
  masseAcquise: number | null;
  gains: number | null;
  retenues: number | null;
  totalNet: number | null;
  avancePeriode: number | null;
  recuperePeriode: number | null;
  soldeFinPeriode: number | null;
  soldeActuel: number | null;
  nbEvenements: number;
  evenementsParType: Record<string, number>;
  employesAvecAlerte: number;
  salariesVisible: boolean;
}

export interface ReportMethodology {
  periode: { from: string; to: string };
  joursOuvres: number;
  joursOuvresHorsFeries: number;
  feries: string[];
  standardMonthlyHours: number;
  overtimeMultiplier: number;
  seuilJournalierHeures: number;
  lateToleranceMinutes: number | null;
  /** RPT-02 §7 B — seuil MÉTIER de classement, distinct de la tolérance. */
  businessLateThresholdMinutes: number | null;
  regleRetard: string;
  arrondiMinutes: number | null;
  deductionRetardAutomatique: boolean | null;
  sourceAbsences: string;
  sourceSalaires: string;
  sourceAvances: string;
  /** RPT-02 §9 — l'écartévénement / jour comptabilisé est explicable ligne à ligne. */
  reconciliationAbsences: ReconciliationAbsences;
  notePeriodeCloturee: string;
  salariesVisible: boolean;
}

/** RPT-02 §9 — état de la réconciliation « événement d'absence » vs « jour comptabilisé ». */
export interface ReconciliationAbsences {
  /** Nombre de traces d'absence (ReportEvent de type ABSENCE) sur la période. */
  evenementsAbsence: number;
  /** Nombre de ces traces qui BECOMMENT un jour d'absence ouvré. */
  evenementsComptabilises: number;
  /** Somme des `joursAbsence` du résumé : doit égaler `evenementsComptabilises`. */
  joursComptabilises: number;
  /** Écart résiduel (doit valoir 0). Jamais masqué. */
  ecart: number;
  /** Répartition des traces non comptabilisées par motif. */
  parMotifNonComptabilisation: Record<string, number>;
  /** Traces supprimées par la réconciliation (doublons) — non émises. */
  doublonsSupprimes: number;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

const CODES_ABSENCE = ["A", "AJ", "AC", "NJ", "INJ", "INJUSTIFIEE", "ABSENT", "ABSENCE", "NON_POINT", "JOUR_INCOMPLET", "MUET"];
const CODES_CONGE = ["C", "CO", "CONGE", "CP"];
const CODES_MALADIE = ["M", "MAL", "MALADIE", "CM", "AT"];
const CODES_ACCIDENT = ["AT_A", "ACC", "ACCIDENT"];

function typeDepuisListe(valeurs: Array<string | null | undefined>): TypeEvenementRapport | null {
  for (const v of valeurs) {
    const c = (v ?? "").toUpperCase().trim();
    if (!c) continue;
    if (CODES_ACCIDENT.includes(c) || c.includes("ACCIDENT")) return "ACCIDENT";
    if (CODES_MALADIE.includes(c) || c.includes("MALADIE")) return "MALADIE";
    if (CODES_CONGE.includes(c) || c.includes("CONGE")) return "CONGE";
    if (CODES_ABSENCE.includes(c) || c.includes("ABSENT")) return "ABSENCE";
  }
  return null;
}

export function typeEvenementDepuisCode(code: string | null | undefined): TypeEvenementRapport {
  return typeDepuisListe([code]) ?? "AUTRE";
}

/**
 * Classification semantique : le statut de saisie est plus fiable que le code court,
 * et `isAbsent` du calcul est l'autorite finale.
 */
export function classerEvenement(opts: {
  status?: string | null;
  codePresence?: string | null;
  absenceType?: string | null;
  isAbsent?: boolean | null;
}): TypeEvenementRapport {
  const type = typeDepuisListe([opts.status, opts.absenceType, opts.codePresence]);
  if (type) return type;
  if (opts.isAbsent === true) return "ABSENCE";
  return "AUTRE";
}

/**
 * RPT-02 §9/§10 — DÉCIDE SI UN ÉVÉNEMENT D'ABSENCE EST UN JOUR OUVRÉ COMPTABILISÉ.
 *
 * SOURCE UNIQUE DE VÉRITÉ : la même règle que `analyserPeriode()` (rh-stats-engine)
 * et `jourOuvrePour()`. Un jour n'est compté dans `joursAbsence` que si
 *   1. c'est un jour ouvré pour CET employé (planning + calendrier + emploi) ; et
 *   2. le calcul R3 du jour porte le code « A ».
 * Toute absence de ces deux conditions doit être namedée.
 */
export function decisionComptabilisationAbsence(
  emp: EmployeBrut,
  iso: string,
  d: DonneesSituation,
  source: SourceEvenement,
  codePresenceDuJour: string | null
): { comptabilise: boolean; motif: MotifNonComptabilisation | null } {
  // 1. Pourquoi ce jour n'est-il pas ouvré ? (dimanche, férié, planning, emploi)
  const dow = new Date(`${iso}T12:00:00`).getDay();
  if (dow === 0) return { comptabilise: false, motif: "DIMANCHE" };
  if (d.holidays.includes(iso)) return { comptabilise: false, motif: "JOUR_FERIE" };
  if (emp.dateEmbauche && iso < emp.dateEmbauche) return { comptabilise: false, motif: "HORS_PERIODE_EMPLOI" };
  if (emp.dateSortie && iso > emp.dateSortie) return { comptabilise: false, motif: "HORS_PERIODE_EMPLOI" };
  if (emp.workCycleId) {
    const nonWorking = d.nonWorkingByCycle.get(emp.workCycleId) ?? new Set<number>();
    if (nonWorking.has(dow)) return { comptabilise: false, motif: "NON_OUVRE_PLANNING" };
  }

  // 2. Jour ouvré : seul un calcul R3 en code « A » devient un jour d'absence.
  if (source === "absences") {
    // Trace déclarative sans ligne de calcul : jamais un jour comptabilisé.
    return { comptabilise: false, motif: "DECLARATION_SEULE" };
  }
  if (codePresenceDuJour === null) {
    return { comptabilise: false, motif: "DECLARATION_SEULE" };
  }
  if (codePresenceDuJour !== "A") {
    return { comptabilise: false, motif: "CODE_CALCULE_DIFFERENT" };
  }
  return { comptabilise: true, motif: null };
}

function trancheSurPeriode(debut: string, fin: string | null, from: string, to: string): string[] {
  const d0 = debut > from ? debut : from;
  const d1 = !fin ? to : fin < to ? fin : to;
  if (d0 > d1) return [];
  const out: string[] = [];
  const cursor = new Date(`${d0}T12:00:00`);
  const finCursor = new Date(`${d1}T12:00:00`);
  while (cursor <= finCursor) {
    out.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export interface StatsEvenements {
  /** Jours d'absence de la table `absences` deja couverts par le journal RPT-01. */
  doublonsSupprimes: number;
}

export function construireEvenementsRapport(
  emp: EmployeBrut,
  ligne: LigneSituation,
  d: DonneesSituation,
  canSeeSalary: boolean,
  stats?: StatsEvenements
): ReportEvent[] {
  const events: ReportEvent[] = [];
  const calcByDate = new Map((d.calcsByEmploye.get(emp.id) ?? []).map((c) => [c.date, c]));
  const saisieByDate = d.saisiesByEmploye.get(emp.id) ?? new Map<string, SaisieBrute>();
  const nomAuteur = (id: number | null | undefined) => (id ? d.nomsUtilisateurs.get(id) ?? null : null);

  // 1) Journal canonique : attendance_entries + attendance_calculations
  for (const [iso, saisie] of saisieByDate) {
    if (iso < d.from || iso > d.to) continue;
    const calc = calcByDate.get(iso) ?? null;
    const presenceCode = calc?.codePresence ?? saisie.status ?? null;
    const estAbsence = calc?.isAbsent === true || (saisie.status !== null && /ABSENT|NON_POINT|JOUR_INCOMPLET/i.test(saisie.status));
    if (estAbsence) {
      const decision = decisionComptabilisationAbsence(emp, iso, d, "attendance_entries", calc?.codePresence ?? null);
      events.push({
        id: `ATT:${emp.id}:${iso}`,
        employeeId: emp.id,
        matricule: emp.matricule,
        date: iso,
        type: classerEvenement({
          status: saisie.status,
          codePresence: calc?.codePresence ?? null,
          absenceType: saisie.absenceType,
          isAbsent: calc?.isAbsent ?? null,
        }),
        libelle: presenceCode ?? saisie.absenceType ?? "Absence",
        presenceCode,
        justificatif: saisie.absenceJustificatif,
        motif: saisie.absenceMotif,
        presenceValidee: saisie.validated,
        validePar: nomAuteur(saisie.validatedBy),
        auteur: nomAuteur(saisie.createdBy),
        lateMinutes: null,
        earlyDepartureMinutes: null,
        payrollImpact: calc?.absenceFinancialImpact ?? null,
        source: "attendance_entries",
        comptabilise: decision.comptabilise,
        motifNonComptabilisation: decision.motif,
      });
    }
    const late = calc?.lateMinutes ?? 0;
    const early = calc?.earlyDepartureMinutes ?? 0;
    if (late > 0 || early > 0) {
      const impact = Number(calc?.lateDeductionAmount ?? 0);
      events.push({
        id: `RET:${emp.id}:${iso}`,
        employeeId: emp.id,
        matricule: emp.matricule,
        date: iso,
        type: "RETARD",
        libelle: late > 0 && early > 0 ? "Retard et depart anticipe" : late > 0 ? "Retard" : "Depart anticipe",
        presenceCode,
        justificatif: saisie.absenceJustificatif,
        motif: saisie.notes,
        presenceValidee: saisie.validated,
        validePar: nomAuteur(saisie.validatedBy),
        auteur: nomAuteur(saisie.createdBy),
        lateMinutes: late > 0 ? late : null,
        earlyDepartureMinutes: early > 0 ? early : null,
        payrollImpact: impact > 0 ? impact : null,
        source: "attendance_calculations",
        comptabilise: null,
        motifNonComptabilisation: null,
      });
    }
  }

  // 2) Table absences : supplements ou synthetisation, jamais une addition.
  //    Cle de reconciliation canonique = (employeeId, date) deja couverte par le journal.
  const datesCouvertes = new Set(events.filter((e) => e.type !== "RETARD").map((e) => e.date));
  for (const abs of d.absencesByEmploye.get(emp.id) ?? []) {
    for (const iso of trancheSurPeriode(abs.dateDebut, abs.dateFin, d.from, d.to)) {
      if (datesCouvertes.has(iso)) {
        // RPT-02 §10 : un doublon est neutralise, jamais silencieux.
        if (stats) stats.doublonsSupprimes += 1;
        continue;
      }
      datesCouvertes.add(iso);
      const decision = decisionComptabilisationAbsence(emp, iso, d, "absences", calcByDate.get(iso)?.codePresence ?? null);
      events.push({
        id: `ABS:${abs.id}:${iso}`,
        employeeId: emp.id,
        matricule: emp.matricule,
        date: iso,
        type: classerEvenement({
          status: abs.typeAbsence,
          codePresence: abs.typeAbsence,
          isAbsent: true,
        }),
        libelle: abs.typeAbsence,
        presenceCode: abs.typeAbsence,
        justificatif: abs.justifie ? "Absence declaree justifiee" : null,
        motif: abs.motif,
        presenceValidee: abs.validePar ? true : null,
        validePar: nomAuteur(abs.validePar),
        auteur: null,
        lateMinutes: null,
        earlyDepartureMinutes: null,
        payrollImpact: null,
        source: "absences",
        comptabilise: decision.comptabilise,
        motifNonComptabilisation: decision.motif,
      });
    }
  }

  // 3) Situations RH actives.
  //    La cle du map est l'identifiant employe (voir chargerSituation), pas le
  //    matricule : lire par matricule rendait ce bloc silencieusement vide.
  for (const sit of d.situationsByEmploye.get(String(emp.id)) ?? []) {
    const debut = sit.dateEffet ?? sit.dateDebut;
    if (debut > d.to) continue;
    if (sit.dateFin && sit.dateFin < d.from) continue;
    events.push({
      id: `SIT:${sit.id ?? `${sit.category}:${sit.type}:${debut}`}`,
      employeeId: emp.id,
      matricule: emp.matricule,
      date: debut,
      type: "SITUATION_RH",
      libelle: [sit.category, sit.type, sit.subType].filter(Boolean).join(" - "),
      presenceCode: null,
      justificatif: null,
      motif: sit.anomalie,
      presenceValidee: sit.validationRequise ?? null,
      validePar: null,
      auteur: null,
      lateMinutes: null,
      earlyDepartureMinutes: null,
      payrollImpact: sit.montantRetenue === null || sit.montantRetenue === undefined ? null : Number(sit.montantRetenue),
      source: "situations_rh",
      comptabilise: null,
      motifNonComptabilisation: null,
    });
  }

  // RPT-05 : `payrollImpact` est un montant. Sans `rh.salaire.consulter` la cle
  // est SUPPRIMEE du payload, pas mise a null (meme contrat que les rows).
  if (!canSeeSalary) {
    for (const e of events) delete (e as { payrollImpact?: number | null }).payrollImpact;
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.employeeId - b.employeeId));
  return events;
}

/**
 * Champs de remuneration retires du payload, et non mis a null, quand
 * `rh.salaire.consulter` est refusee (permission non Nullable dans le contrat).
 */
export const CHAMPS_SENSIBLES_REMUNERATION = [
  "masseAcquise",
  "baseContractuelle",
  "gains",
  "retenues",
  "totalNet",
  "netLabel",
  "tauxHoraire",
  "bulletinExiste",
  "segmentsSalaires",
  "avancePeriode",
  "recuperePeriode",
  "soldeFinPeriode",
  "soldeActuel",
  "nbAvances",
] as const;

export function construireLigneRapport(
  emp: EmployeBrut,
  ligne: LigneSituation,
  d: DonneesSituation,
  canSee: boolean
): EmployeeReportRow {
  const posteSegments = (d.posteSegmentsByEmploye.get(emp.id) ?? []).map((s) => ({ ...s }));
  const tauxPresenceHeures =
    ligne.heuresTheoriques > 0 ? r2((ligne.heuresTravaillees / ligne.heuresTheoriques) * 100) : null;

  const row = {
    employeeId: ligne.employeeId,
    matricule: ligne.matricule,
    nom: ligne.nom,
    prenom: ligne.prenom,
    departement: ligne.departement,
    fonction: emp.fonction,
    posteSegments,
    statut: ligne.statut,
    mode: ligne.mode,
    dateEmbauche: emp.dateEmbauche,
    dateFinContrat: emp.dateFinContrat,
    dateSortie: emp.dateSortie,

    joursTheoriques: ligne.joursTheoriques,
    joursPresence: ligne.joursPresence,
    joursAbsence: ligne.joursAbsence,
    joursAbsents: ligne.joursAbsence,
    joursConges: ligne.joursConges,
    joursMuets: ligne.joursMuets,

    heuresTheoriques: ligne.heuresTheoriques,
    heuresAttendues: ligne.heuresTheoriques,
    heuresTravaillees: ligne.heuresTravaillees,
    heuresNormales: ligne.heuresNormales,
    heuresSupp: ligne.heuresSupp,

    retardTotalMinutes: ligne.retardTotalMinutes,
    departAnticipeTotalMinutes: ligne.departAnticipeTotalMinutes,
    tauxPresence: ligne.tauxPresence,
    tauxPresenceHeures,

    anomalieCount: ligne.anomalies.length,
    anomalies: ligne.anomalies,
    salariesVisible: canSee,

    masseAcquise: ligne.salaires?.gains ?? null,
    baseContractuelle: ligne.salaires?.baseContractuelle ?? null,
    gains: ligne.salaires?.gains ?? null,
    retenues: ligne.salaires?.retenues ?? null,
    totalNet: ligne.salaires?.net ?? null,
    netLabel: ligne.salaires?.netLabel ?? null,
    tauxHoraire: ligne.salaires?.tauxHoraire ?? null,
    bulletinExiste: ligne.salaires?.bulletinExiste ?? null,
    segmentsSalaires: ligne.salaires?.segments ?? [],

    avancePeriode: ligne.avances?.avancePeriode ?? null,
    recuperePeriode: ligne.avances?.recuperePeriode ?? null,
    soldeFinPeriode: ligne.avances?.soldeFinPeriode ?? null,
    soldeActuel: ligne.avances?.soldeActuel ?? null,
    nbAvances: ligne.avances?.nbAvances ?? null,
  } as EmployeeReportRow & Record<string, unknown>;

  if (!canSee) {
    for (const champ of CHAMPS_SENSIBLES_REMUNERATION) delete row[champ];
  }
  return row;
}

/** Champs financiers du RESUME : meme contrat d'absence que les rows (§RPT-05). */
export const CHAMPS_SENSIBLES_RESUME = [
  "masseAcquise",
  "gains",
  "retenues",
  "totalNet",
  "avancePeriode",
  "recuperePeriode",
  "soldeFinPeriode",
  "soldeActuel",
] as const;

export function construireResumeRapport(
  rows: EmployeeReportRow[],
  events: ReportEvent[],
  canSee: boolean
): ReportSummary {
  const sum = (sel: (r: EmployeeReportRow) => number | null) => {
    let total = 0;
    for (const r of rows) total += sel(r) ?? 0;
    return r2(total);
  };
  const evenementsParType: Record<string, number> = {};
  for (const e of events) evenementsParType[e.type] = (evenementsParType[e.type] ?? 0) + 1;

  const resume = {
    employes: rows.length,
    joursTheoriques: sum((r) => r.joursTheoriques),
    joursPresence: sum((r) => r.joursPresence),
    joursAbsence: sum((r) => r.joursAbsence),
    joursConges: sum((r) => r.joursConges),
    heuresTheoriques: sum((r) => r.heuresTheoriques),
    heuresAttendues: sum((r) => r.heuresAttendues),
    heuresTravaillees: sum((r) => r.heuresTravaillees),
    heuresNormales: sum((r) => r.heuresNormales),
    heuresSupp: sum((r) => r.heuresSupp),
    retardTotalMinutes: sum((r) => r.retardTotalMinutes),
    masseAcquise: canSee ? sum((r) => r.masseAcquise) : null,
    gains: canSee ? sum((r) => r.gains) : null,
    retenues: canSee ? sum((r) => r.retenues) : null,
    totalNet: canSee ? sum((r) => r.totalNet) : null,
    avancePeriode: canSee ? sum((r) => r.avancePeriode) : null,
    recuperePeriode: canSee ? sum((r) => r.recuperePeriode) : null,
    soldeFinPeriode: canSee ? sum((r) => r.soldeFinPeriode) : null,
    soldeActuel: canSee ? sum((r) => r.soldeActuel) : null,
    nbEvenements: events.length,
    evenementsParType,
    employesAvecAlerte: rows.filter((r) => r.anomalieCount > 0).length,
    salariesVisible: canSee,
  } as ReportSummary & Record<string, unknown>;

  // Sans droit salaire, un agregat a `null` resterait PRESENT dans le payload :
  // c'est la cle qui part, pas la valeur.
  if (!canSee) {
    for (const champ of CHAMPS_SENSIBLES_RESUME) delete resume[champ];
  }
  return resume;
}

/**
 * RPT-02 §9 — Réconciliation « trace d'absence » vs « jour ouvré comptabilisé ».
 *
 * La différence entre les deux populations est LÉGITIME (week-end, férié, jour
 * non planifié, trace déclarative non calculée). Elle doit être expliquée, donc
 * on publie le détail par motif et l'écart résiduel, jamais une simple
 * soustraction muette.
 */
export function construireReconciliationAbsences(
  events: ReportEvent[],
  rows: EmployeeReportRow[],
  stats?: StatsEvenements
): ReconciliationAbsences {
  const absences = events.filter((e) => e.type === "ABSENCE");
  const comptabilises = absences.filter((e) => e.comptabilise === true);
  const joursComptabilises = rows.reduce((a, r) => a + (r.joursAbsence ?? 0), 0);
  const parMotif: Record<string, number> = {};
  for (const e of absences) {
    if (e.comptabilise === true) continue;
    const motif = e.motifNonComptabilisation ?? "MOTIF_INCONNU";
    parMotif[motif] = (parMotif[motif] ?? 0) + 1;
  }
  return {
    evenementsAbsence: absences.length,
    evenementsComptabilises: comptabilises.length,
    joursComptabilises,
    ecart: comptabilises.length - joursComptabilises,
    parMotifNonComptabilisation: parMotif,
    doublonsSupprimes: stats?.doublonsSupprimes ?? 0,
  };
}

export function construireMethodologie(
  d: DonneesSituation,
  canSee: boolean,
  reconciliationAbsences: ReconciliationAbsences
): ReportMethodology {
  let joursOuvres = 0;
  let joursOuvresHorsFeries = 0;
  const cursor = new Date(`${d.from}T12:00:00`);
  const fin = new Date(`${d.to}T12:00:00`);
  while (cursor <= fin) {
    joursOuvres += 1;
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const dow = cursor.getDay();
    if (dow !== 0 && !d.holidays.includes(iso)) joursOuvresHorsFeries += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  const tolerance = d.parametresPresence.lateToleranceMinutes ?? 0;
  const seuilBusiness = d.parametresPresence.businessLateThresholdMinutes ?? 0;
  return {
    periode: { from: d.from, to: d.to },
    joursOuvres,
    joursOuvresHorsFeries,
    feries: d.holidays,
    standardMonthlyHours: d.standardMonthlyHours,
    overtimeMultiplier: d.overtimeMultiplier,
    seuilJournalierHeures: d.seuilDefaut,
    lateToleranceMinutes: d.parametresPresence.lateToleranceMinutes,
    businessLateThresholdMinutes: d.parametresPresence.businessLateThresholdMinutes ?? 0,
    arrondiMinutes: d.parametresPresence.roundToMinutes,
    deductionRetardAutomatique: d.parametresPresence.autoDeductLate,
    regleRetard:
      `Tolerance technique de pointage : ${tolerance} min (soustraite avant constat). ` +
      `Seuil metier de classement : ${seuilBusiness} min. ` +
      `Retard constate = max(0, arrivee - heure theorique - ${tolerance}). ` +
      `Retard classe = max(0, constate - ${seuilBusiness}). ` +
      `Les deux reglages sont distincts et ne doivent pas etre confondus.`,
    sourceAbsences: "attendance_entries (journal canonique) completee par la table absences pour les journees non saisies",
    sourceSalaires: "employee_salary_history segmente sur la periode, projete par le moteur de paie",
    sourceAvances: "employee_advances et advance_recoveries",
    reconciliationAbsences,
    notePeriodeCloturee: "Les projections non bulletin sont des estimations ; un bulletin cloture remplace la projection.",
    salariesVisible: canSee,
  };
}

export interface FiltresRapport extends FiltresSituation {
  typesEvenement?: TypeEvenementRapport[];
  includeEvenements?: boolean;
}

export interface ChargeRapport {
  rows: EmployeeReportRow[];
  events: ReportEvent[];
  summary: ReportSummary;
  methodology: ReportMethodology;
  employees: EmployeBrut[];
  situation: DonneesSituation;
}

/**
 * Point d'entree unique du Centre Rapports (RPT-01).
 * Reutilise `chargerSituation` : une seule lecture batch, aucun N+1, aucune ecriture.
 */
export async function chargerDonneesRapport(
  ctx: { user: { id: string; agenceId: number } },
  from: string,
  to: string,
  filtres: FiltresRapport = {}
): Promise<ChargeRapport> {
  validerPeriode(from, to);
  const canSee = await canSeeSalary({ user: ctx.user });
  const d = await chargerSituation(ctx, from, to, filtres);

const rows: EmployeeReportRow[] = [];
  const events: ReportEvent[] = [];
  const statsEvenements: StatsEvenements = { doublonsSupprimes: 0 };
  for (const emp of d.employees) {
    const ligne = construireLigne(emp, d, canSee);
    rows.push(construireLigneRapport(emp, ligne, d, canSee));
    if (filtres.includeEvenements !== false) {
      events.push(...construireEvenementsRapport(emp, ligne, d, canSee, statsEvenements));
    }
  }

const eventsFiltres = filtres.typesEvenement?.length
    ? events.filter((e) => filtres.typesEvenement?.includes(e.type))
    : events;

  // RPT-02 §9 : la réconciliation se calcule sur la population COMPLÈTE
  // (avant filtre de type), sinon un filtre « RETARD » masquerait l'écart.
  const reconciliationAbsences = construireReconciliationAbsences(events, rows, statsEvenements);

  return {
    rows,
    events: eventsFiltres,
    summary: construireResumeRapport(rows, eventsFiltres, canSee),
    methodology: construireMethodologie(d, canSee, reconciliationAbsences),
    employees: d.employees,
    situation: d,
  };
}

export function trierRowsRapport(
  rows: EmployeeReportRow[],
  sort: keyof EmployeeReportRow | string,
  dir: "asc" | "desc"
): EmployeeReportRow[] {
  const signe = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = (a as unknown as Record<string, unknown>)[sort as string];
    const vb = (b as unknown as Record<string, unknown>)[sort as string];
    if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * signe;
    return String(va).localeCompare(String(vb), "fr") * signe;
  });
}