import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { eq, and, gte, lte, lt } from "drizzle-orm";
import {
  agences,
  departments,
  positions,
  employes,
  contrats,
  absences,
  hrWorkCycles,
  hrWorkSchedules,
  hrAttendanceSettings,
  hrGeneralSettings,
  attendanceEntries,
  attendanceCalculations,
  attendanceMonthlySummaries,
  leaveRequests,
  hrLeaveTypes,
} from "./schema";
import { GPJ_EMPLOYES, GPJ_POINTAGE, GPJ_CONGES, GPJ_PARAMS } from "./data/gpj-v31-data";
import { calculateAttendance } from "../../../apps/nextjs/src/server/lib/presence-engine.ts";
import { classifierJour } from "../../../apps/nextjs/src/server/lib/rh-stats-engine.ts";

requireLocalOrForced("db:import:gpj-v31 (import-gpj-v31.ts)");

/**
 * RH — IMPORT DES DONNÉES GPJ v3.1 (fichier officiel corrigé).
 *
 * Source : Gestion_Personnel_GPJ_PRO_v3.1_Corrige.xlsx (13 feuilles).
 * Idempotent : ré-exécutable sans doublons — les matricules EMP001→EMP015
 * sont alignés sur les valeurs du fichier, le pointage est rejoué par le
 * moteur (presence-engine), les calculs sont réécrits.
 *
 * Traitements :
 *  1. Référentiels : départements, postes (créés si absents)
 *  2. Cycle « Atelier Standard » : seuils HS journaliers 9,5 / 4,5 (Sam)
 *  3. Paramètres de présence alignés sur 00_Parametres (tolérance 0, arrondi 0,
 *     plafond 9,5 ; arrivées anticipées/départs tardifs non comptés sans validation)
 *  4. Les 15 employés (mise à jour ou création EMP014/15) + contrats
 *  5. Pointage 24/08→30/09/2026 : saisies + calculs moteur + résumés mensuels
 *  6. Congés / absences du fichier
 */

const typeEmploye = (t: string): string =>
  t === "CDI" ? "permanent" : t === "CDD" ? "contractuel" : "apprenti";

async function findOrCreateDept(agenceId: number, name: string): Promise<number | null> {
  if (!name) return null;
  const [existing] = await db.select({ id: departments.id }).from(departments).where(and(eq(departments.agenceId, agenceId), eq(departments.name, name))).limit(1);
  if (existing) return existing.id;
  const code = "D_" + name.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
  const [row] = await db.insert(departments).values({ agenceId, code, name, active: true } as any).returning();
  return row.id;
}

async function findOrCreatePoste(agenceId: number, name: string, deptId: number | null): Promise<number | null> {
  if (!name) return null;
  const [existing] = await db.select({ id: positions.id }).from(positions).where(and(eq(positions.agenceId, agenceId), eq(positions.name, name))).limit(1);
  if (existing) return existing.id;
  const code = "P_" + name.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
  const [row] = await db.insert(positions).values({ agenceId, code, name, departmentId: deptId ?? null, active: true } as any).returning();
  return row.id;
}

function heureVersMinute(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function minutesVersHeure(n: number): string {
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
const n = (v: unknown) => Number(v ?? 0);

async function main() {
  const [agence] = await db.select({ id: agences.id }).from(agences).where(eq(agences.isActive, true)).limit(1);
  if (!agence) {
    console.error("Aucune agence active — exécutez d'abord db:seed:install.");
    process.exit(1);
  }
  const agenceId = agence.id;
  console.log(`Agence active : id=${agenceId}`);

  // ── 1. Cycle par défaut : seuils HS alignés sur le fichier ──
  const [cycle] = await db.select({ id: hrWorkCycles.id }).from(hrWorkCycles)
    .where(and(eq(hrWorkCycles.agenceId, agenceId), eq(hrWorkCycles.isDefault, true))).limit(1);
  if (!cycle) {
    console.error("Cycle par défaut absent — exécutez d'abord db:seed:rh.");
    process.exit(1);
  }
  for (let day = 1; day <= 6; day++) {
    const threshold = day === 6 ? GPJ_PARAMS.saturdayOvertimeThreshold : GPJ_PARAMS.weeklyOvertimeThreshold;
    const [sched] = await db.select({ id: hrWorkSchedules.id }).from(hrWorkSchedules)
      .where(and(eq(hrWorkSchedules.cycleId, cycle.id), eq(hrWorkSchedules.dayOfWeek, day))).limit(1);
    if (sched) {
      await db.update(hrWorkSchedules).set({ overtimeThreshold: threshold } as any).where(eq(hrWorkSchedules.id, sched.id));
    } else {
      await db.insert(hrWorkSchedules).values({
        cycleId: cycle.id, dayOfWeek: day,
        startTime: day === 6 ? "07:30" : "07:30",
        endTime: day === 6 ? "12:00" : "18:00",
        breakStart: day === 6 ? null : "13:00",
        breakEnd: day === 6 ? null : "14:00",
        expectedHours: day === 6 ? "4.5" : "9.5",
        overtimeThreshold: threshold, isWorkingDay: true,
      } as any);
    }
  }
  console.log("Cycle : seuils HS alignés (9,5 semaine / 4,5 samedi).");

  // ── 2. Paramètres de présence (00_Parametres) ──
  const [settingsRow] = await db.select({ id: hrAttendanceSettings.id }).from(hrAttendanceSettings)
    .where(eq(hrAttendanceSettings.agenceId, agenceId)).limit(1);
  const settingsValues = {
    lateToleranceMinutes: GPJ_PARAMS.lateToleranceMinutes,
    roundToMinutes: GPJ_PARAMS.roundToMinutes,
    autoDeductBreak: true,
    countEarlyArrival: GPJ_PARAMS.countEarlyArrival,
    countLateDeparture: GPJ_PARAMS.countLateDeparture,
    autoDeductLate: GPJ_PARAMS.autoDeductLate,
    autoDeductEarlyDeparture: GPJ_PARAMS.autoDeductEarlyDeparture,
    maxNormalHoursPerDay: GPJ_PARAMS.weeklyOvertimeThreshold,
    updatedAt: new Date(),
  };
  if (settingsRow) {
    await db.update(hrAttendanceSettings).set(settingsValues as any).where(eq(hrAttendanceSettings.id, settingsRow.id));
  } else {
    await db.insert(hrAttendanceSettings).values({ agenceId, ...settingsValues } as any);
  }
  const [generalRow] = await db.select({ id: hrGeneralSettings.id }).from(hrGeneralSettings).where(eq(hrGeneralSettings.agenceId, agenceId)).limit(1);
  const generalValues = {
    standardMonthlyHours: GPJ_PARAMS.standardMonthlyHours,
    overtimeMultiplier: GPJ_PARAMS.overtimeMultiplier,
    defaultOvertimeThreshold: GPJ_PARAMS.weeklyOvertimeThreshold,
    annualLeaveDays: String(GPJ_PARAMS.annualLeaveDays),
    updatedAt: new Date(),
  };
  if (generalRow) {
    await db.update(hrGeneralSettings).set(generalValues as any).where(eq(hrGeneralSettings.id, generalRow.id));
  } else {
    await db.insert(hrGeneralSettings).values({ agenceId, ...generalValues } as any);
  }
  console.log("Paramètres de présence/généraux alignés sur le fichier (225,3 h / majoration 1,5 / seuil 9,5 / congé 30 j).");

  // ── 3. Employés + contrats (source de vérité = 01_Employes) ──
  const deptCache = new Map<string, number | null>();
  const posteCache = new Map<string, number | null>();
  const empIdByMat = new Map<string, number>();
  for (const e of GPJ_EMPLOYES) {
    if (!deptCache.has(e.departement)) deptCache.set(e.departement, await findOrCreateDept(agenceId, e.departement));
    if (!posteCache.has(e.poste)) {
      const deptId = deptCache.get(e.departement) ?? null;
      posteCache.set(e.poste, await findOrCreatePoste(agenceId, e.poste, deptId));
    }
    const [existingEmp] = await db.select({ id: employes.id }).from(employes).where(eq(employes.matricule, e.matricule)).limit(1);
    const values = {
      matricule: e.matricule,
      nom: e.nom,
      prenom: e.prenom || "-",
      fonction: e.poste,
      departmentId: deptCache.get(e.departement) ?? null,
      positionId: posteCache.get(e.poste) ?? null,
      workCycleId: cycle.id,
      telephone: e.telephone,
      telephoneSecondaire: e.telephone2 ?? null,
      emailPersonnel: e.email ?? null,
      typeEmploye: typeEmploye(e.typeContrat),
      modePaie: "horaire",
      salaireBase: String(e.salaire),
      devise: "XAF",
      statut: e.statut || "actif",
      dateEmbauche: e.dateEmbauche,
      numCnss: e.numCnss ?? null,
      adresse: e.adresse ?? null,
      notes: e.notes ?? null,
      agenceId,
      updatedAt: new Date(),
    };
    let empId: number;
    if (existingEmp) {
      await db.update(employes).set(values as any).where(eq(employes.id, existingEmp.id));
      empId = existingEmp.id;
    } else {
      const [row] = await db.insert(employes).values(values as any).returning();
      empId = row.id;
    }
    empIdByMat.set(e.matricule, empId);

    // Contrat
    const premierePresence = GPJ_POINTAGE.find((p) => p.matricule === e.matricule && (p.ti || p.to));
    const dateDebut = e.dateEmbauche ?? premierePresence?.date ?? "2026-08-24";
    const [existingContrat] = await db.select({ id: contrats.id }).from(contrats).where(eq(contrats.employeId, empId)).limit(1);
    const contratValues = {
      typeContrat: e.typeContrat,
      dateDebut,
      salaireBase: String(e.salaire),
      poste: e.poste,
      statut: "actif",
      updatedAt: new Date(),
    };
    if (existingContrat) {
      await db.update(contrats).set(contratValues as any).where(eq(contrats.id, existingContrat.id));
    } else {
      await db.insert(contrats).values({ employeId: empId, ...contratValues } as any);
    }
  }
  console.log(`Employés alignés/importés : ${empIdByMat.size} (EMP001→EMP015).`);

  // ── 4. Pointage : saisies + calculs moteur ──
  const [settings] = await db.select().from(hrAttendanceSettings).where(eq(hrAttendanceSettings.agenceId, agenceId)).limit(1);
  const [general] = await db.select({ defaultOvertimeThreshold: hrGeneralSettings.defaultOvertimeThreshold }).from(hrGeneralSettings).where(eq(hrGeneralSettings.agenceId, agenceId)).limit(1);
  const schedules = await db.select().from(hrWorkSchedules).where(eq(hrWorkSchedules.cycleId, cycle.id));

  const journees = GPJ_POINTAGE.filter((p) => p.ti || p.to);
  let imported = 0;
  for (const p of journees) {
    const employeeId = empIdByMat.get(p.matricule);
    if (!employeeId) { console.warn(`  ! matricule inconnu : ${p.matricule}`); continue; }

    const dayOfWeek = new Date(`${p.date}T12:00:00`).getDay();
    const schedule = schedules.find((s) => s.dayOfWeek === dayOfWeek) ?? null;

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
    }

    const result = calculateAttendance({
      timeIn: p.ti,
      timeOut: p.to,
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
        lateToleranceMinutes: settings?.lateToleranceMinutes ?? 0,
        roundToMinutes: settings?.roundToMinutes ?? 0,
        autoDeductBreak: settings?.autoDeductBreak ?? true,
        countEarlyArrival: settings?.countEarlyArrival ?? false,
        countLateDeparture: settings?.countLateDeparture ?? false,
        autoDeductLate: settings?.autoDeductLate ?? true,
        autoDeductEarlyDeparture: settings?.autoDeductEarlyDeparture ?? true,
        maxNormalHoursPerDay: settings?.maxNormalHoursPerDay ?? null,
        defaultOvertimeThreshold: general?.defaultOvertimeThreshold ?? null,
      },
      overtimeAuth: null,
      isPublicHoliday: false,
      validateEarlyArrival: p.vAnt,
      validateLateDeparture: p.vTard,
    });

    const calcValues = {
      employeeId,
      date: p.date,
      rawMinutes: result.rawMinutes,
      breakMinutes: result.breakMinutes,
      workedMinutes: result.workedMinutes,
      normalMinutes: result.normalMinutes,
      overtimeMinutes: result.overtimeMinutes,
      lateMinutes: result.lateMinutes,
      earlyDepartureMinutes: result.earlyDepartureMinutes,
      isAbsent: result.isAbsent,
      codePresence: result.codePresence,
      calculationDetails: result.details as any,
      calculatedAt: new Date(),
    };
    const [existingCalc] = await db.select({ id: attendanceCalculations.id }).from(attendanceCalculations)
      .where(eq(attendanceCalculations.attendanceEntryId, entryId)).limit(1);
    if (existingCalc) {
      await db.update(attendanceCalculations).set(calcValues as any).where(eq(attendanceCalculations.id, existingCalc.id));
    } else {
      await db.insert(attendanceCalculations).values({ attendanceEntryId: entryId, ...calcValues } as any);
    }
    imported++;
  }
  console.log(`Pointage importé/rejoué : ${imported} journées (ti+to), entrées synchronisées.`);

  // ── 5. Résumés mensuels (août + septembre 2026, non verrouillés) ──
  const resume = async (year: number, month: number) => {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    // P05 : bornes du mois M = [1er du mois, 1er du mois suivant[ — le 1er du
    // mois M+1 est EXCLU (sinon ses pointages fuient dans le résumé de M).
    const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const aggs = await db
      .select({ employeeId: attendanceCalculations.employeeId, id: attendanceCalculations.id })
      .from(attendanceCalculations)
      .where(and(gte(attendanceCalculations.date, start), lt(attendanceCalculations.date, end)));
    for (const empId of [...new Set(aggs.map((a) => a.employeeId))]) {
      const rows = await db
        .select({
          empId: attendanceCalculations.employeeId,
          isAbsent: attendanceCalculations.isAbsent,
          codePresence: attendanceCalculations.codePresence,
          normalMinutes: attendanceCalculations.normalMinutes,
          overtimeMinutes: attendanceCalculations.overtimeMinutes,
          lateMinutes: attendanceCalculations.lateMinutes,
          date: attendanceEntries.date,
          taskBonus: attendanceEntries.taskBonus,
        })
        .from(attendanceCalculations)
        .innerJoin(attendanceEntries, eq(attendanceCalculations.attendanceEntryId, attendanceEntries.id))
        .where(and(eq(attendanceCalculations.employeeId, empId), gte(attendanceCalculations.date, start), lt(attendanceCalculations.date, end)));
      const [existing] = await db.select({ id: attendanceMonthlySummaries.id }).from(attendanceMonthlySummaries)
        .where(and(eq(attendanceMonthlySummaries.employeeId, empId), eq(attendanceMonthlySummaries.year, year), eq(attendanceMonthlySummaries.month, month))).limit(1);
      // P06 : classification canonique — congé = C/M/O/F (daysOnLeave), sinon
      // absent si isAbsent/code A, sinon jour présent (P/HS/R).
      let daysPresent = 0;
      let daysAbsent = 0;
      let daysOnLeave = 0;
      for (const r of rows) {
        const cls = classifierJour(r.codePresence, r.isAbsent);
        if (cls === "CONGE") daysOnLeave++;
        else if (cls === "ABSENCE") daysAbsent++;
        else daysPresent++;
      }
      const values = {
        totalNormalMinutes: rows.reduce((s, r) => s + Math.round(n(r.normalMinutes)), 0),
        totalOvertimeMinutes: rows.reduce((s, r) => s + Math.round(n(r.overtimeMinutes)), 0),
        totalLateMinutes: rows.reduce((s, r) => s + Math.round(n(r.lateMinutes)), 0),
        totalTaskBonus: String(rows.reduce((s, r) => s + Math.round(n(r.taskBonus)), 0)),
        daysPresent,
        daysAbsent,
        daysOnLeave,
        locked: false,
        updatedAt: new Date(),
      };
      if (existing) {
        await db.update(attendanceMonthlySummaries).set(values as any).where(eq(attendanceMonthlySummaries.id, existing.id));
      } else {
        await db.insert(attendanceMonthlySummaries).values({ employeeId: empId, year, month, ...values } as any);
      }
    }
  };
  await resume(2026, 8);
  await resume(2026, 9);
  console.log("Résumés mensuels août + septembre 2026 créés (non verrouillés).");

  // ── 6. Congés / absences du fichier (04_Conges) ──
  for (const c of GPJ_CONGES) {
    const employeeId = empIdByMat.get(c.matricule);
    if (!employeeId || !c.dateDebut) continue;
    const [existing] = await db.select({ id: absences.id }).from(absences)
      .where(and(eq(absences.employeId, employeeId), eq(absences.dateDebut, c.dateDebut))).limit(1);
    const absenceValues = {
      employeId: employeeId,
      typeAbsence: c.typeAbsence,
      dateDebut: c.dateDebut,
      dateFin: c.dateFin ?? c.dateDebut,
      dureeJours: String(c.dureeJours ?? 1),
      motif: c.motif,
      justifie: true,
      statut: c.statut === "Approuvé" ? "approuve" : "en_attente",
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(absences).set(absenceValues as any).where(eq(absences.id, existing.id));
    } else {
      await db.insert(absences).values(absenceValues as any);
    }

    // Demande affichée par la page Congés & Absences (leave_requests)
    const [maladieType] = await db.select({ id: hrLeaveTypes.id }).from(hrLeaveTypes)
      .where(eq(hrLeaveTypes.code, "MALADIE")).limit(1);
    const [existingReq] = await db.select({ id: leaveRequests.id }).from(leaveRequests)
      .where(and(eq(leaveRequests.employeeId, employeeId), eq(leaveRequests.startDate, c.dateDebut))).limit(1);
    const reqValues = {
      employeeId,
      leaveTypeId: maladieType?.id ?? 1,
      startDate: c.dateDebut,
      endDate: c.dateFin ?? c.dateDebut,
      daysCount: String(c.dureeJours ?? 1),
      reason: c.motif,
      status: (c.statut === "Approuvé" ? "approuve" : "en_attente") as const,
      approvedAt: c.statut === "Approuvé" ? new Date() : null,
      updatedAt: new Date(),
    };
    if (existingReq) {
      await db.update(leaveRequests).set({ ...reqValues, status: reqValues.status } as any).where(eq(leaveRequests.id, existingReq.id));
    } else {
      await db.insert(leaveRequests).values(reqValues as any);
    }
  }
  console.log(`Congés / absences importés : ${GPJ_CONGES.length}.`);

  // ── 7. Validation : heures normales de septembre (app vs fichier 03_Paie) ──
  const CIBLE_PAIE: Record<string, number> = {
    EMP001: 121.06, EMP002: 102.44, EMP003: 102.94, EMP004: 116.82, EMP005: 9.5,
    EMP006: 55.8, EMP007: 108.82, EMP008: 99.22, EMP009: 103.01, EMP010: 63.74,
    EMP011: 119.89, EMP012: 112.69, EMP013: 120.19, EMP014: 102.68, EMP015: 66.26,
  };
  console.log("\nHeures normales septembre 2026 — app vs fichier (03_Paie) :");
  console.log("matricule | HN app (h) | HN fichier (h) | delta (h)");
  for (const [mat, target] of Object.entries(CIBLE_PAIE)) {
    const employeeId = empIdByMat.get(mat);
    if (!employeeId) continue;
    const rows = await db
      .select({ normalMinutes: attendanceCalculations.normalMinutes })
      .from(attendanceCalculations)
      .where(and(eq(attendanceCalculations.employeeId, employeeId), gte(attendanceCalculations.date, "2026-09-01"), lte(attendanceCalculations.date, "2026-09-30")));
    const appHN = Math.round(rows.reduce((s, r) => s + Math.round(n(r.normalMinutes)), 0) / 60 * 100) / 100;
    const delta = Math.round((appHN - target) * 100) / 100;
    console.log(`${mat} | ${appHN} | ${target} | ${delta}`);
  }

  console.log("\n=== Import GPJ v3.1 terminé ===");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});