import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { eq, and, gte, lt, inArray } from "drizzle-orm";
import {
  agences,
  employes,
  hrWorkCycles,
  hrWorkSchedules,
  hrAttendanceSettings,
  hrGeneralSettings,
  hrPublicHolidays,
  overtimeAuthorizations,
  attendanceEntries,
  attendanceCalculations,
  attendanceMonthlySummaries,
  leaveRequests,
} from "./schema";
import { GPJ_EMPLOYES, GPJ_POINTAGE } from "./data/gpj-v31-data";
import { calculateAttendance } from "../../../apps/nextjs/src/server/lib/presence-engine.ts";
import { classifierJour } from "../../../apps/nextjs/src/server/lib/rh-stats-engine.ts";

requireLocalOrForced("db:r3:realign-presences (r3-realign-presences.ts)");

/**
 * R3 — RÉALIGNEMENT DES PRÉSENCES DE DÉMO (entries + calculs + résumés).
 *
 * Restaure la cohérence Analyse / Mensuel / Dashboard sur AOÛT + SEPTEMBRE 2026.
 *
 * Pourquoi : les 45 résumés mensuels existent (issus du pointage de démo), mais
 * les attendance_entries + attendance_calculations ont disparu → l'analyse de
 * période (qui lit les calculs) affiche 0 alors que le mensuel affiche les jours.
 *
 * Périmètre STRICT :
 *  - aucune écriture sur employes / contrats / rémunérations / cycles ;
 *  - mapping GPJ_EMPLOYES (EMP001→EMP015) → employés existants PAR NOM
 *    (les matricules actuels GPJ-2026-90xx ne correspondent pas à EMP… : un
 *    rejeu de l'import complet créerait 15 doublons) ;
 *  - upsert idempotent : entrées (employeeId, date), calculs (attendanceEntryId),
 *    résumés (employeeId, year, month).
 *
 * Corrections appliquées (alignées sur le code) :
 *  - borne P05 du mois : [1er du mois, 1er du mois suivant[ (lt, pas lte) ;
 *  - classification canonique des jours (classifierJour) : codés C/M/O/F → jours
 *    de congé (daysOnLeave), A/isAbsent → absents, sinon présents ;
 *  - les jours de congé approuvés (leave_requests.approuve) sont projetés en
 *    présences (entrée statut 'conge' + calcul code C) — bug B.
 */

const clean = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "");

/** Mapping EMPxxx → employé existant par nom (ambiguité → erreur). */
async function buildMapping(agenceId: number): Promise<Map<string, number>> {
  const employees = await db
    .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom })
    .from(employes)
    .where(eq(employes.agenceId, agenceId));
  const byNom = new Map<string, number[]>();
  for (const e of employees) {
    const key = clean(e.nom);
    const list = byNom.get(key) ?? [];
    if (!list.includes(e.id)) list.push(e.id);
    byNom.set(key, list);
  }
  const mapping = new Map<string, number>();
  let matched = 0;
  for (const g of GPJ_EMPLOYES) {
    const byKey = byNom.get(clean(g.nom)) ?? [];
    const candidates = byKey.filter((id) => {
      const emp = employees.find((e) => e.id === id)!;
      return clean(g.prenom) === clean(emp.prenom) || clean(g.prenom) === "" || clean(emp.prenom) === "";
    });
    const target = candidates.length === 1 ? candidates[0] : candidates.length > 1 ? null : byKey.length === 1 ? byKey[0] : null;
    if (!target) {
      console.warn(`  ! mapping introuvable/ambigü pour ${g.matricule} (${g.nom} ${g.prenom}) — pointages ignorés`);
      continue;
    }
    mapping.set(g.matricule, target);
    matched++;
  }
  console.log(`Mapping GPJ→employés : ${matched}/${GPJ_EMPLOYES.length} correspondances par nom.`);
  return mapping;
}

const n = (v: unknown) => Number(v ?? 0);

/** Recalcule et persiste le calcul d'une journée (miroir de runCalculation). */
async function computeAndSaveCalc(entryId: number, employeeId: number, date: string) {
  const [entry] = await db.select().from(attendanceEntries).where(eq(attendanceEntries.id, entryId)).limit(1);
  if (!entry) return;
  const [emp] = await db
    .select({ workCycleId: employes.workCycleId, agenceId: employes.agenceId, dateEmbauche: employes.dateEmbauche, dateSortie: employes.dateSortie })
    .from(employes)
    .where(eq(employes.id, employeeId))
    .limit(1);
  if (!emp?.workCycleId) return;
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
  const [schedule] = await db
    .select()
    .from(hrWorkSchedules)
    .where(and(eq(hrWorkSchedules.cycleId, emp.workCycleId), eq(hrWorkSchedules.dayOfWeek, dayOfWeek)))
    .limit(1);
  const [settingsRow] = await db.select().from(hrAttendanceSettings).where(eq(hrAttendanceSettings.agenceId, emp.agenceId ?? 0)).limit(1);
  const [holiday] = await db.select({ id: hrPublicHolidays.id }).from(hrPublicHolidays).where(eq(hrPublicHolidays.date, date)).limit(1);
  const [ot] = await db
    .select({ maxHours: overtimeAuthorizations.maxHours, status: overtimeAuthorizations.status })
    .from(overtimeAuthorizations)
    .where(and(eq(overtimeAuthorizations.employeeId, employeeId), eq(overtimeAuthorizations.date, date), eq(overtimeAuthorizations.status, "approuvee")))
    .limit(1);
  const [generalRow] = await db.select({ defaultOvertimeThreshold: hrGeneralSettings.defaultOvertimeThreshold }).from(hrGeneralSettings).where(eq(hrGeneralSettings.agenceId, emp.agenceId ?? 0)).limit(1);

  const statutNorm = (entry.status ?? "").toLowerCase();
  const horsPeriode = (emp.dateEmbauche && date < String(emp.dateEmbauche)) || (emp.dateSortie && date > String(emp.dateSortie));

  const result = calculateAttendance({
    timeIn: entry.timeIn,
    timeInBreak: entry.timeInBreak ?? null,
    timeOutBreak: entry.timeOutBreak ?? null,
    timeOut: entry.timeOut,
    schedule: schedule
      ? {
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          breakStart: schedule.breakStart ?? null,
          breakEnd: schedule.breakEnd ?? null,
          expectedHours: schedule.expectedHours ?? null,
          overtimeThreshold: schedule.overtimeThreshold ?? null,
          isWorkingDay: schedule.isWorkingDay ?? true,
        }
      : null,
    settings: {
      lateToleranceMinutes: settingsRow?.lateToleranceMinutes ?? 0,
      roundToMinutes: settingsRow?.roundToMinutes ?? 0,
      autoDeductBreak: settingsRow?.autoDeductBreak ?? true,
      countEarlyArrival: settingsRow?.countEarlyArrival ?? false,
      countLateDeparture: settingsRow?.countLateDeparture ?? false,
      autoDeductLate: settingsRow?.autoDeductLate ?? true,
      autoDeductEarlyDeparture: settingsRow?.autoDeductEarlyDeparture ?? true,
      maxNormalHoursPerDay: settingsRow?.maxNormalHoursPerDay ?? null,
      defaultOvertimeThreshold: generalRow?.defaultOvertimeThreshold ?? null,
    },
    overtimeAuth: ot ? { maxHours: ot.maxHours, status: ot.status } : null,
    isPublicHoliday: !!holiday,
    validateEarlyArrival: entry.validateEarlyArrival ?? false,
    validateLateDeparture: entry.validateLateDeparture ?? false,
    absenceType: statutNorm === "present" ? null : statutNorm === "conge" ? ("CONGE" as const) : statutNorm === "maladie" ? ("MALADIE" as const) : statutNorm === "mission" ? ("MISSION" as const) : null,
    ...(horsPeriode ? { details: { horsPeriodeEmploi: true } } : {}),
  });

  const values = {
    employeeId,
    date,
    rawMinutes: result.rawMinutes,
    breakMinutes: result.breakMinutes,
    workedMinutes: result.workedMinutes,
    normalMinutes: result.normalMinutes,
    overtimeMinutes: result.overtimeMinutes,
    lateMinutes: result.lateMinutes,
    lateDeductibleMinutes: result.lateDeductibleMinutes,
    lateDeductionAmount: result.lateDeductionAmount,
    earlyDepartureMinutes: result.earlyDepartureMinutes,
    isAbsent: result.isAbsent,
    codePresence: result.codePresence,
    absenceFinancialImpact: result.absenceFinancialImpact,
    calculationDetails: result.details,
    calculatedAt: new Date(),
  };
  const [existingCalc] = await db
    .select({ id: attendanceCalculations.id })
    .from(attendanceCalculations)
    .where(eq(attendanceCalculations.attendanceEntryId, entryId))
    .limit(1);
  if (existingCalc) {
    await db.update(attendanceCalculations).set(values as any).where(eq(attendanceCalculations.id, existingCalc.id));
  } else {
    await db.insert(attendanceCalculations).values({ attendanceEntryId: entryId, ...values } as any);
  }
}

async function main() {
  const [agence] = await db.select({ id: agences.id }).from(agences).where(eq(agences.isActive, true)).limit(1);
  if (!agence) throw new Error("Aucune agence active.");
  const agenceId = agence.id;
  const [cycle] = await db.select({ id: hrWorkCycles.id }).from(hrWorkCycles)
    .where(and(eq(hrWorkCycles.agenceId, agenceId), eq(hrWorkCycles.isDefault, true))).limit(1);
  if (!cycle) throw new Error("Cycle par défaut absent.");
  console.log(`Agence ${agenceId} / cycle ${cycle.id}`);

  const mapping = await buildMapping(agenceId);

  // ── 1. Pointage de démo → entrées + calculs (24/08 → 30/09/2026) ──
  const journees = GPJ_POINTAGE.filter((p) => p.ti || p.to);
  let entries = 0;
  let calcs = 0;
  for (const p of journees) {
    const employeeId = mapping.get(p.matricule);
    if (!employeeId) continue;
    const [existingEntry] = await db.select({ id: attendanceEntries.id }).from(attendanceEntries)
      .where(and(eq(attendanceEntries.employeeId, employeeId), eq(attendanceEntries.date, p.date))).limit(1);
    let entryId = existingEntry?.id;
    const entryValues = {
      employeeId,
      date: p.date,
      timeIn: p.ti,
      timeInBreak: null,
      timeOutBreak: null,
      timeOut: p.to,
      source: "import" as const,
      status: "present" as const,
      notes: p.notes ?? null,
      validateEarlyArrival: p.vAnt,
      validateLateDeparture: p.vTard,
      taskBonus: String(p.prime ?? 0),
      updatedAt: new Date(),
    };
    if (entryId) {
      await db.update(attendanceEntries).set(entryValues as any).where(eq(attendanceEntries.id, entryId));
    } else {
      const [row] = await db.insert(attendanceEntries).values(entryValues as any).returning();
      entryId = row.id;
      entries++;
    }
    if (entryId) {
      await computeAndSaveCalc(entryId, employeeId, p.date);
      calcs++;
    }
  }
  console.log(`Pointage rejoué : ${entries} entrées créées, ${calcs} journées recalées.`);

  // ── 2. Congés approuvés → projection présences (entrée 'conge' + calc C) ──
  const leaves = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.status, "approuve"), gte(leaveRequests.startDate, "2026-08-01"), lt(leaveRequests.endDate, "2026-10-01")));
  let leaveDays = 0;
  const localDate = (v: unknown): string => {
    const d = new Date(String(v));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  for (const lreq of leaves) {
    // start/end sont stockés en UTC (minuit locale = 23:00Z la veille) → on
    // convertit en date locale pour éviter le décalage d'un jour.
    const startIso = localDate(lreq.startDate);
    const endIso = localDate(lreq.endDate);
    const start = new Date(`${startIso}T12:00:00`);
    const end = new Date(`${endIso}T12:00:00`);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow === 0 || dow === 7) continue; // repose hebdomadaire
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const [existing] = await db.select({ id: attendanceEntries.id }).from(attendanceEntries)
        .where(and(eq(attendanceEntries.employeeId, lreq.employeeId), eq(attendanceEntries.date, iso))).limit(1);
      let entryId = existing?.id;
      if (existing) {
        await db.update(attendanceEntries).set({ status: "conge", timeIn: null, timeOut: null, updatedAt: new Date() } as any).where(eq(attendanceEntries.id, existing.id));
      } else {
        const [row] = await db.insert(attendanceEntries).values({
          employeeId: lreq.employeeId,
          date: iso,
          status: "conge",
          source: "import",
        } as any).returning();
        entryId = row.id;
      }
      if (entryId) {
        await computeAndSaveCalc(entryId, lreq.employeeId, iso);
        leaveDays++;
      }
    }
  }
  console.log(`Congés projetés : ${leaveDays} jour(s) en 'conge' + calc.`);

  // ── 3. Résumés mensuels AOÛT + SEPTEMBRE (bornes P05 + jours de congé) ──
  const resume = async (year: number, month: number) => {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const aggs = await db
      .select({ employeeId: attendanceCalculations.employeeId, id: attendanceCalculations.id })
      .from(attendanceCalculations)
      .where(and(gte(attendanceCalculations.date, start), lt(attendanceCalculations.date, end)));
    let written = 0;
    for (const empId of [...new Set(aggs.map((a) => a.employeeId))]) {
      const rows = await db
        .select({
          employeeId: attendanceCalculations.employeeId,
          isAbsent: attendanceCalculations.isAbsent,
          codePresence: attendanceCalculations.codePresence,
          normalMinutes: attendanceCalculations.normalMinutes,
          overtimeMinutes: attendanceCalculations.overtimeMinutes,
          lateMinutes: attendanceCalculations.lateMinutes,
          taskBonus: attendanceEntries.taskBonus,
        })
        .from(attendanceCalculations)
        .innerJoin(attendanceEntries, eq(attendanceCalculations.attendanceEntryId, attendanceEntries.id))
        .where(and(eq(attendanceCalculations.employeeId, empId), gte(attendanceCalculations.date, start), lt(attendanceCalculations.date, end)))
      let present = 0, absent = 0, onLeave = 0;
      for (const r of rows) {
        const cls = classifierJour(r.codePresence, r.isAbsent);
        if (cls === "CONGE") onLeave++;
        else if (cls === "ABSENCE") absent++;
        else present++;
      }
      const [existing] = await db
        .select({ id: attendanceMonthlySummaries.id })
        .from(attendanceMonthlySummaries)
        .where(and(eq(attendanceMonthlySummaries.employeeId, empId), eq(attendanceMonthlySummaries.year, year), eq(attendanceMonthlySummaries.month, month)))
        .limit(1);
      const values = {
        totalNormalMinutes: rows.reduce((s, r) => s + Math.round(n(r.normalMinutes)), 0),
        totalOvertimeMinutes: rows.reduce((s, r) => s + Math.round(n(r.overtimeMinutes)), 0),
        totalLateMinutes: rows.reduce((s, r) => s + Math.round(n(r.lateMinutes)), 0),
        totalTaskBonus: String(rows.reduce((s, r) => s + Math.round(n(r.taskBonus)), 0)),
        daysPresent: present,
        daysAbsent: absent,
        daysOnLeave: onLeave,
        locked: false,
        updatedAt: new Date(),
      };
      if (existing) {
        await db.update(attendanceMonthlySummaries).set(values as any).where(eq(attendanceMonthlySummaries.id, existing.id));
      } else {
        await db.insert(attendanceMonthlySummaries).values({ employeeId: empId, year, month, ...values } as any);
      }
      written++;
    }
    return written;
  };
  const rAout = await resume(2026, 8);
  const rSept = await resume(2026, 9);
  console.log(`Résumés recomputés : août = ${rAout}, septembre = ${rSept}.`);

  const totals = await db
    .select({ employeeId: attendanceMonthlySummaries.employeeId })
    .from(attendanceMonthlySummaries)
    .where(and(eq(attendanceMonthlySummaries.year, 2026), inArray(attendanceMonthlySummaries.month, [8, 9])));
  console.log(`Total résumés août+sept : ${totals.length}.`);
  console.log("=== RÉALIGNEMENT R3 TERMINÉ ===");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});