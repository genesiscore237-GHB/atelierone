import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  employes,
  attendanceEntries,
  overtimeAuthorizations,
  attendanceCalculations,
  attendanceMonthlySummaries,
  hrWorkCycles,
  hrWorkSchedules,
  hrAttendanceSettings,
  hrPublicHolidays,
} from "@atelierone/db";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { calculateAttendance } from "~/server/lib/presence-engine";

const ENTRY_STATUS = ["present", "absent", "conge", "maladie", "mission"] as const;
const OT_STATUS = ["en_attente", "approuvee", "refusee"] as const;

/** RH-02 — Présences & temps de travail */
export const rhPresenceRouter = createTRPCRouter({
  // ─── Saisie quotidienne (simple ou en lot) ───
saveEntry: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        employeeId: z.number().int(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        timeIn: z.string().nullable().optional(),
        timeOut: z.string().nullable().optional(),
        status: z.enum(ENTRY_STATUS).default("present"),
        notes: z.string().optional(),
        // specs MVP — validation admin par ligne + prime de tâche
        validateEarlyArrival: z.boolean().optional(),
        validateLateDeparture: z.boolean().optional(),
        taskBonus: z.number().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [emp] = await db
        .select({ id: employes.id, workCycleId: employes.workCycleId })
        .from(employes)
        .where(and(eq(employes.id, input.employeeId), eq(employes.agenceId, agenceId)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employé introuvable." });
      if (emp.workCycleId === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun cycle de travail affecté à cet employé (voir sa fiche)." });
      }

      // Écrire (upsert) la saisie
      const [existing] = await db
        .select({ id: attendanceEntries.id })
        .from(attendanceEntries)
        .where(and(eq(attendanceEntries.employeeId, input.employeeId), eq(attendanceEntries.date, input.date)))
        .limit(1);

      let entryId: number;
      if (existing) {
        await db
          .update(attendanceEntries)
          .set({
            timeIn: input.timeIn ?? null,
            timeOut: input.timeOut ?? null,
            status: input.status,
            notes: input.notes ?? null,
            validateEarlyArrival: input.validateEarlyArrival ?? false,
            validateLateDeparture: input.validateLateDeparture ?? false,
            taskBonus: input.taskBonus != null ? String(input.taskBonus) : undefined,
            updatedAt: new Date(),
          } as any)
          .where(eq(attendanceEntries.id, existing.id));
        entryId = existing.id;
      } else {
        const [row] = await db
          .insert(attendanceEntries)
          .values({
            employeeId: input.employeeId,
            date: input.date,
            timeIn: input.timeIn ?? null,
            timeOut: input.timeOut ?? null,
            status: input.status,
            notes: input.notes ?? null,
            validateEarlyArrival: input.validateEarlyArrival ?? false,
            validateLateDeparture: input.validateLateDeparture ?? false,
            taskBonus: input.taskBonus != null ? String(input.taskBonus) : "0",
            createdBy: Number(ctx.user.id),
          } as any)
          .returning();
        entryId = row.id;
      }

      // Moteur de calcul
      await runCalculation(entryId, input.employeeId, input.date);
      return { id: entryId };
    }),

  saveBatch: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        rows: z.array(
          z.object({
            employeeId: z.number().int(),
            timeIn: z.string().nullable().optional(),
            timeOut: z.string().nullable().optional(),
            status: z.enum(ENTRY_STATUS).default("present"),
            validateEarlyArrival: z.boolean().optional(),
            validateLateDeparture: z.boolean().optional(),
            taskBonus: z.number().min(0).optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results: { employeeId: number; ok: boolean; error?: string }[] = [];
      for (const row of input.rows) {
        try {
          await saveSingle(ctx.user, input.date, row as any);
          results.push({ employeeId: row.employeeId, ok: true });
        } catch (e) {
          results.push({ employeeId: row.employeeId, ok: false, error: (e as Error).message });
        }
      }
      return results;
    }),

  // ─── Historique ───
  listEntries: rhProcedure
    .input(
      z.object({
        employeeId: z.number().int().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().min(10).max(200).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [
        eq(employes.agenceId, ctx.user.agenceId),
      ];
      if (safe.employeeId) conditions.push(eq(attendanceEntries.employeeId, safe.employeeId));
      if (safe.from) conditions.push(gte(attendanceEntries.date, safe.from));
      if (safe.to) conditions.push(lte(attendanceEntries.date, safe.to));

const rows = await db
        .select({
          id: attendanceEntries.id,
          employeeId: attendanceEntries.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          matricule: employes.matricule,
          date: attendanceEntries.date,
          timeIn: attendanceEntries.timeIn,
          timeOut: attendanceEntries.timeOut,
          status: attendanceEntries.status,
          notes: attendanceEntries.notes,
          validateEarlyArrival: attendanceEntries.validateEarlyArrival,
          validateLateDeparture: attendanceEntries.validateLateDeparture,
          taskBonus: attendanceEntries.taskBonus,
          validated: attendanceEntries.validated,
        })
        .from(attendanceEntries)
        .innerJoin(employes, eq(attendanceEntries.employeeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(attendanceEntries.date))
        .limit((input ?? {}).limit ?? 50);

const ids = rows.map((r) => r.id);
      const calcs = ids.length
        ? await db
            .select()
            .from(attendanceCalculations)
            .where(inArray(attendanceCalculations.attendanceEntryId, ids))
        : [];

      return rows.map((r) => ({
        ...r,
        calculation: calcs.find((c) => c.attendanceEntryId === r.id) ?? null,
      }));
    }),

  // ─── Autorisations HS ───
  listOvertime: rhProcedure
    .input(z.object({ employeeId: z.number().int().optional(), date: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.employeeId) conditions.push(eq(overtimeAuthorizations.employeeId, safe.employeeId));
      if (safe.date) conditions.push(eq(overtimeAuthorizations.date, safe.date));
      return db
        .select({
          id: overtimeAuthorizations.id,
          employeeId: overtimeAuthorizations.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          date: overtimeAuthorizations.date,
          maxHours: overtimeAuthorizations.maxHours,
          reason: overtimeAuthorizations.reason,
          status: overtimeAuthorizations.status,
          createdAt: overtimeAuthorizations.createdAt,
        })
        .from(overtimeAuthorizations)
        .innerJoin(employes, eq(overtimeAuthorizations.employeeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(overtimeAuthorizations.date));
    }),

  requestOvertime: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        employeeId: z.number().int(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        maxHours: z.number().min(0.5).max(12),
        reason: z.string().min(3, "Le motif est obligatoire"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(overtimeAuthorizations)
        .values({ ...input, status: "en_attente" } as any)
        .returning();
      return row;
    }),

  decideOvertime: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number().int(), status: z.enum(["approuvee", "refusee"]) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .update(overtimeAuthorizations)
        .set({ status: input.status, authorizedBy: Number(ctx.user.id), authorizedAt: new Date() } as any)
        .where(eq(overtimeAuthorizations.id, input.id))
        .returning();
      return row;
    }),

  // ─── Clôture mensuelle ───
  closeMonth: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const monthStart = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
      const nextMonth = input.month === 12 ? input.year + 1 : input.year;
      const nextMonthNum = input.month === 12 ? 1 : input.month + 1;
      const monthEnd = `${nextMonth}-${String(nextMonthNum).padStart(2, "0")}-01`;

      const employees = await db
        .select({ id: employes.id })
        .from(employes)
        .where(eq(employes.agenceId, agenceId));

      const calcs = await db
        .select({
          employeeId: attendanceEntries.employeeId,
          isAbsent: attendanceCalculations.isAbsent,
          normalMinutes: attendanceCalculations.normalMinutes,
          overtimeMinutes: attendanceCalculations.overtimeMinutes,
          lateMinutes: attendanceCalculations.lateMinutes,
          taskBonus: attendanceEntries.taskBonus,
        })
        .from(attendanceCalculations)
        .innerJoin(attendanceEntries, eq(attendanceCalculations.attendanceEntryId, attendanceEntries.id))
        .innerJoin(employes, eq(attendanceEntries.employeeId, employes.id))
        .where(
          and(
            gte(attendanceEntries.date, monthStart),
            lte(attendanceEntries.date, monthEnd),
            eq(employes.agenceId, agenceId),
          )
        );

      const byEmployee = new Map<number, typeof calcs>();
      calcs.forEach((c) => {
        const list = byEmployee.get(c.employeeId) ?? [];
        list.push(c);
        byEmployee.set(c.employeeId, list);
      });

      let summaries = 0;
      for (const emp of employees) {
        const list = byEmployee.get(emp.id) ?? [];
        const daysPresent = list.filter((c) => !c.isAbsent).length;
        const daysAbsent = list.filter((c) => c.isAbsent).length;

        const [existing] = await db
          .select({ id: attendanceMonthlySummaries.id })
          .from(attendanceMonthlySummaries)
          .where(
            and(
              eq(attendanceMonthlySummaries.employeeId, emp.id),
              eq(attendanceMonthlySummaries.year, input.year),
              eq(attendanceMonthlySummaries.month, input.month),
            )
          )
          .limit(1);

        const values = {
          totalNormalMinutes: list.reduce((s, c) => s + (c.normalMinutes ?? 0), 0),
          totalOvertimeMinutes: list.reduce((s, c) => s + (c.overtimeMinutes ?? 0), 0),
          totalLateMinutes: list.reduce((s, c) => s + (c.lateMinutes ?? 0), 0),
          totalTaskBonus: String(list.reduce((s, c) => s + Number(c.taskBonus ?? 0), 0)),
          daysPresent,
          daysAbsent,
          locked: true,
          lockedAt: new Date(),
          lockedBy: Number(ctx.user.id),
          updatedAt: new Date(),
        };
        if (existing) {
          await db
            .update(attendanceMonthlySummaries)
            .set(values as any)
            .where(eq(attendanceMonthlySummaries.id, existing.id));
        } else {
          await db.insert(attendanceMonthlySummaries).values({
            employeeId: emp.id,
            year: input.year,
            month: input.month,
            ...values,
          } as any);
        }
        summaries++;
      }
      return { summaries };
    }),

  listSummaries: rhProcedure
    .input(z.object({ year: z.number().int().optional(), month: z.number().int().min(1).max(12).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.year) conditions.push(eq(attendanceMonthlySummaries.year, safe.year));
      if (safe.month) conditions.push(eq(attendanceMonthlySummaries.month, safe.month));
      return db
        .select({
          id: attendanceMonthlySummaries.id,
          employeeId: attendanceMonthlySummaries.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          matricule: employes.matricule,
          year: attendanceMonthlySummaries.year,
          month: attendanceMonthlySummaries.month,
totalNormalMinutes: attendanceMonthlySummaries.totalNormalMinutes,
          totalOvertimeMinutes: attendanceMonthlySummaries.totalOvertimeMinutes,
          totalLateMinutes: attendanceMonthlySummaries.totalLateMinutes,
          totalTaskBonus: attendanceMonthlySummaries.totalTaskBonus,
          daysPresent: attendanceMonthlySummaries.daysPresent,
          daysAbsent: attendanceMonthlySummaries.daysAbsent,
          daysOnLeave: attendanceMonthlySummaries.daysOnLeave,
          locked: attendanceMonthlySummaries.locked,
        })
        .from(attendanceMonthlySummaries)
        .innerJoin(employes, eq(attendanceMonthlySummaries.employeeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(attendanceMonthlySummaries.year), desc(attendanceMonthlySummaries.month));
    }),
});

// ─── Moteur : calcul + persistance du résultat ───
async function runCalculation(entryId: number, employeeId: number, date: string) {
  const [entry] = await db
    .select()
    .from(attendanceEntries)
    .where(eq(attendanceEntries.id, entryId))
    .limit(1);
  if (!entry) return;

  const [emp] = await db
    .select({ workCycleId: employes.workCycleId })
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

  const [settingsRow] = await db
    .select()
    .from(hrAttendanceSettings)
    .where(eq(hrAttendanceSettings.agenceId, (await db.select({ agenceId: employes.agenceId }).from(employes).where(eq(employes.id, employeeId)).limit(1))[0]?.agenceId ?? 0))
    .limit(1);

  const [holiday] = await db
    .select({ id: hrPublicHolidays.id })
    .from(hrPublicHolidays)
    .where(eq(hrPublicHolidays.date, date))
    .limit(1);

  const [ot] = await db
    .select({ maxHours: overtimeAuthorizations.maxHours, status: overtimeAuthorizations.status })
    .from(overtimeAuthorizations)
    .where(
      and(
        eq(overtimeAuthorizations.employeeId, employeeId),
        eq(overtimeAuthorizations.date, date),
        eq(overtimeAuthorizations.status, "approuvee"),
      )
    )
    .limit(1);

const result = calculateAttendance({
    timeIn: entry.timeIn,
    timeOut: entry.timeOut,
    schedule: schedule ?? null,
    settings: {
      lateToleranceMinutes: settingsRow?.lateToleranceMinutes ?? 0,
      roundToMinutes: settingsRow?.roundToMinutes ?? 0,
      autoDeductBreak: settingsRow?.autoDeductBreak ?? true,
      countEarlyArrival: settingsRow?.countEarlyArrival ?? false,
      countLateDeparture: settingsRow?.countLateDeparture ?? false,
      autoDeductLate: settingsRow?.autoDeductLate ?? true,
      autoDeductEarlyDeparture: settingsRow?.autoDeductEarlyDeparture ?? true,
      maxNormalHoursPerDay: settingsRow?.maxNormalHoursPerDay ?? null,
    },
    overtimeAuth: ot ? { maxHours: ot.maxHours, status: ot.status } : null,
    isPublicHoliday: !!holiday,
    // specs MVP — validation admin par ligne (clamps levés si validés)
    validateEarlyArrival: entry.validateEarlyArrival ?? false,
    validateLateDeparture: entry.validateLateDeparture ?? false,
  });

  const [existingCalc] = await db
    .select({ id: attendanceCalculations.id })
    .from(attendanceCalculations)
    .where(eq(attendanceCalculations.attendanceEntryId, entryId))
    .limit(1);

const values = {
    employeeId,
    date,
    rawMinutes: result.rawMinutes,
    breakMinutes: result.breakMinutes,
    workedMinutes: result.workedMinutes,
    normalMinutes: result.normalMinutes,
    overtimeMinutes: result.overtimeMinutes,
    lateMinutes: result.lateMinutes,
    earlyDepartureMinutes: result.earlyDepartureMinutes,
    isAbsent: result.isAbsent,
    codePresence: result.codePresence,
    calculationDetails: result.details,
    calculatedAt: new Date(),
  };

  if (existingCalc) {
    await db
      .update(attendanceCalculations)
      .set(values as any)
      .where(eq(attendanceCalculations.id, existingCalc.id));
  } else {
    await db
      .insert(attendanceCalculations)
      .values({ attendanceEntryId: entryId, ...values } as any);
  }
}

// Réutilisé par saveBatch
async function saveSingle(user: { agenceId: number; id: string }, date: string, row: { employeeId: number; timeIn?: string | null; timeOut?: string | null; status?: string; validateEarlyArrival?: boolean; validateLateDeparture?: boolean; taskBonus?: number }) {
  const [emp] = await db
    .select({ id: employes.id, workCycleId: employes.workCycleId })
    .from(employes)
    .where(and(eq(employes.id, row.employeeId), eq(employes.agenceId, user.agenceId)))
    .limit(1);
  if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employé introuvable." });
  if (emp.workCycleId === null) throw new TRPCError({ code: "BAD_REQUEST", message: `Employé ${row.employeeId} sans cycle de travail.` });

  const [existing] = await db
    .select({ id: attendanceEntries.id })
    .from(attendanceEntries)
    .where(and(eq(attendanceEntries.employeeId, row.employeeId), eq(attendanceEntries.date, date)))
    .limit(1);

  let entryId: number;
  if (existing) {
    await db
      .update(attendanceEntries)
      .set({
        timeIn: row.timeIn ?? null,
        timeOut: row.timeOut ?? null,
        status: row.status ?? "present",
        validateEarlyArrival: row.validateEarlyArrival ?? false,
        validateLateDeparture: row.validateLateDeparture ?? false,
        taskBonus: row.taskBonus != null ? String(row.taskBonus) : undefined,
        updatedAt: new Date(),
      } as any)
      .where(eq(attendanceEntries.id, existing.id));
    entryId = existing.id;
  } else {
    const [created] = await db
      .insert(attendanceEntries)
      .values({
        employeeId: row.employeeId,
        date,
        timeIn: row.timeIn ?? null,
        timeOut: row.timeOut ?? null,
        status: row.status ?? "present",
        validateEarlyArrival: row.validateEarlyArrival ?? false,
        validateLateDeparture: row.validateLateDeparture ?? false,
        taskBonus: row.taskBonus != null ? String(row.taskBonus) : "0",
        createdBy: Number(user.id),
      } as any)
      .returning();
    entryId = created.id;
  }

  await runCalculation(entryId, row.employeeId, date);
}




