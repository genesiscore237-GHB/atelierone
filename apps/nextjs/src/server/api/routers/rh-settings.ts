import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  hrWorkCycles,
  hrWorkSchedules,
  hrAttendanceSettings,
  hrLeaveTypes,
  hrSanctionTypes,
  hrPublicHolidays,
  hrGeneralSettings,
} from "@atelierone/db";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const scheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  breakStart: z.string().nullable().optional(),
  breakEnd: z.string().nullable().optional(),
  expectedHours: z.string().nullable().optional(),
  overtimeThreshold: z.string().nullable().optional(), // seuil HS journalier (ex. "9.5")
  isWorkingDay: z.boolean().default(true),
});

const cycleInputSchema = z.object({
  name: z.string().min(1, "Le nom du cycle est requis"),
  description: z.string().optional(),
  isDefault: z.boolean().default(false),
  schedules: z.array(scheduleSchema).max(7),
});

export interface RhSettingsResult {
  cycles: Array<{
    id: number;
    name: string;
    description: string | null;
    isDefault: boolean;
    active: boolean;
    schedules: Array<{
      id: number;
      cycleId: number;
      dayOfWeek: number;
      startTime: string | null;
      endTime: string | null;
      breakStart: string | null;
      breakEnd: string | null;
      expectedHours: string | null;
      isWorkingDay: boolean;
    }>;
  }>;
  attendance: {
    id: number;
    lateToleranceMinutes: number | null;
    roundToMinutes: number | null;
    autoDeductBreak: boolean | null;
    countEarlyArrival: boolean | null;
    maxNormalHoursPerDay: string | null;
  } | null;
  leaveTypes: Array<{
    id: number;
    code: string;
    name: string;
    isPaid: boolean | null;
    deductBalance: boolean | null;
    requiresDocument: boolean | null;
    color: string | null;
    active: boolean | null;
  }>;
  sanctionTypes: Array<{
    id: number;
    code: string;
    name: string;
    severityLevel: number | null;
    active: boolean | null;
  }>;
  holidays: Array<{
    id: number;
    date: string;
    name: string;
    isRecurringYearly: boolean | null;
  }>;
  general: {
    id: number;
    employeeCodePrefix: string | null;
    employeeCodeSequence: number | null;
    timezone: string | null;
    currency: string | null;
    evaluationEnabled: boolean | null;
    evaluationFrequency: string | null;
  } | null;
}

/** Paramétrage RH central — RH-00 (tout est configurable, rien en dur) */
export const rhSettingsRouter = createTRPCRouter({
  // ─── Vue d'ensemble du paramétrage ───
  getAll: rhProcedure.query(async ({ ctx }): Promise<RhSettingsResult> => {
    const agenceId = ctx.user.agenceId;
    const [cycles, attendance, leaveTypes, sanctionTypes, holidays, general] =
      await Promise.all([
        db
          .select()
          .from(hrWorkCycles)
          .where(and(eq(hrWorkCycles.agenceId, agenceId)))
          .orderBy(desc(hrWorkCycles.isDefault)),
        db
          .select()
          .from(hrAttendanceSettings)
          .where(eq(hrAttendanceSettings.agenceId, agenceId))
          .limit(1),
        db
          .select()
          .from(hrLeaveTypes)
          .where(eq(hrLeaveTypes.agenceId, agenceId))
          .orderBy(hrLeaveTypes.id),
        db
          .select()
          .from(hrSanctionTypes)
          .where(eq(hrSanctionTypes.agenceId, agenceId))
          .orderBy(hrSanctionTypes.severityLevel),
        db
          .select()
          .from(hrPublicHolidays)
          .where(eq(hrPublicHolidays.agenceId, agenceId))
          .orderBy(hrPublicHolidays.date),
        db
          .select()
          .from(hrGeneralSettings)
          .where(eq(hrGeneralSettings.agenceId, agenceId))
          .limit(1),
      ]);

    const cycleIds = cycles.map((c) => c.id);
    const schedules = cycleIds.length
      ? await db
          .select()
          .from(hrWorkSchedules)
          .where(cycleIds.length === 1 ? eq(hrWorkSchedules.cycleId, cycleIds[0]) : undefined)
          .orderBy(hrWorkSchedules.dayOfWeek)
      : [];

    return {
      cycles: cycles.map((c) => ({
        ...c,
        schedules: schedules.filter((s) => s.cycleId === c.id),
      })),
      attendance: attendance[0] ?? null,
      leaveTypes,
      sanctionTypes,
      holidays,
      general: general[0] ?? null,
    };
  }),

  // ─── Cycles & horaires ───
  listCycles: rhProcedure.query(async ({ ctx }) => {
    const cycles = await db
      .select()
      .from(hrWorkCycles)
      .where(eq(hrWorkCycles.agenceId, ctx.user.agenceId))
      .orderBy(desc(hrWorkCycles.isDefault));
    const ids = cycles.map((c) => c.id);
    const schedules = ids.length
      ? await db
          .select()
          .from(hrWorkSchedules)
          .where(ids.length === 1 ? eq(hrWorkSchedules.cycleId, ids[0]) : undefined)
          .orderBy(hrWorkSchedules.dayOfWeek)
      : [];
    return cycles.map((c) => ({
      ...c,
      schedules: schedules.filter((s) => s.cycleId === c.id),
    }));
  }),

  createCycle: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(cycleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      if (input.isDefault) {
        await db
          .update(hrWorkCycles)
          .set({ isDefault: false } as any)
          .where(eq(hrWorkCycles.agenceId, agenceId));
      }
      const [cycle] = await db
        .insert(hrWorkCycles)
        .values({
          name: input.name,
          description: input.description ?? null,
          isDefault: input.isDefault,
          active: true,
          agenceId,
        } as any)
        .returning();
      for (const s of input.schedules) {
        await db.insert(hrWorkSchedules).values({ cycleId: cycle.id, ...s } as any);
      }
      return cycle;
    }),

  updateCycle: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number().int(), ...cycleInputSchema.shape }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [existing] = await db
        .select({ id: hrWorkCycles.id })
        .from(hrWorkCycles)
        .where(and(eq(hrWorkCycles.id, input.id), eq(hrWorkCycles.agenceId, agenceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Cycle introuvable." });

      if (input.isDefault) {
        await db
          .update(hrWorkCycles)
          .set({ isDefault: false } as any)
          .where(eq(hrWorkCycles.agenceId, agenceId));
      }
      await db
        .update(hrWorkCycles)
        .set({ name: input.name, description: input.description ?? null, isDefault: input.isDefault } as any)
        .where(eq(hrWorkCycles.id, input.id));

      await db.delete(hrWorkSchedules).where(eq(hrWorkSchedules.cycleId, input.id));
      for (const s of input.schedules) {
        await db.insert(hrWorkSchedules).values({ cycleId: input.id, ...s } as any);
      }
      return { success: true };
    }),

  deleteCycle: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(hrWorkCycles)
        .where(and(eq(hrWorkCycles.id, input.id), eq(hrWorkCycles.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  // ─── Paramètres de présence ───
  getAttendanceSettings: rhProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select()
      .from(hrAttendanceSettings)
      .where(eq(hrAttendanceSettings.agenceId, ctx.user.agenceId))
      .limit(1);
    return row ?? null;
  }),

  updateAttendanceSettings: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        lateToleranceMinutes: z.number().int().min(0),
        roundToMinutes: z.number().int().min(0).max(60),
        autoDeductBreak: z.boolean(),
        countEarlyArrival: z.boolean(),
        maxNormalHoursPerDay: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [existing] = await db
        .select({ id: hrAttendanceSettings.id })
        .from(hrAttendanceSettings)
        .where(eq(hrAttendanceSettings.agenceId, agenceId))
        .limit(1);
      const values = { ...input, updatedBy: Number(ctx.user.id) };
      if (existing) {
        await db
          .update(hrAttendanceSettings)
          .set(values as any)
          .where(eq(hrAttendanceSettings.id, existing.id));
      } else {
        await db.insert(hrAttendanceSettings).values({ agenceId, ...values } as any);
      }
      return { success: true };
    }),

  // ─── Types de congés ───
  listLeaveTypes: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(hrLeaveTypes)
      .where(eq(hrLeaveTypes.agenceId, ctx.user.agenceId))
      .orderBy(hrLeaveTypes.id);
  }),

  createLeaveType: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        isPaid: z.boolean().default(true),
        deductBalance: z.boolean().default(true),
        requiresDocument: z.boolean().default(false),
        color: z.string().default("#6366f1"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(hrLeaveTypes)
        .values({ ...input, agenceId: ctx.user.agenceId } as any)
        .returning();
      return row;
    }),

  updateLeaveType: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        id: z.number().int(),
        code: z.string().min(1),
        name: z.string().min(1),
        isPaid: z.boolean(),
        deductBalance: z.boolean(),
        requiresDocument: z.boolean(),
        color: z.string(),
        active: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...values } = input;
      await db
        .update(hrLeaveTypes)
        .set(values as any)
        .where(and(eq(hrLeaveTypes.id, id), eq(hrLeaveTypes.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  deleteLeaveType: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(hrLeaveTypes)
        .where(and(eq(hrLeaveTypes.id, input.id), eq(hrLeaveTypes.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  // ─── Types de sanctions ───
  listSanctionTypes: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(hrSanctionTypes)
      .where(eq(hrSanctionTypes.agenceId, ctx.user.agenceId))
      .orderBy(hrSanctionTypes.severityLevel);
  }),

  createSanctionType: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        severityLevel: z.number().int().min(1).max(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(hrSanctionTypes)
        .values({ ...input, agenceId: ctx.user.agenceId } as any)
        .returning();
      return row;
    }),

  updateSanctionType: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        id: z.number().int(),
        code: z.string().min(1),
        name: z.string().min(1),
        severityLevel: z.number().int().min(1).max(5),
        active: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...values } = input;
      await db
        .update(hrSanctionTypes)
        .set(values as any)
        .where(and(eq(hrSanctionTypes.id, id), eq(hrSanctionTypes.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  deleteSanctionType: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(hrSanctionTypes)
        .where(and(eq(hrSanctionTypes.id, input.id), eq(hrSanctionTypes.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  // ─── Jours fériés ───
  listHolidays: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(hrPublicHolidays)
      .where(eq(hrPublicHolidays.agenceId, ctx.user.agenceId))
      .orderBy(hrPublicHolidays.date);
  }),

  addHoliday: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : YYYY-MM-DD"),
        name: z.string().min(1),
        isRecurringYearly: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(hrPublicHolidays)
        .values({ ...input, agenceId: ctx.user.agenceId } as any)
        .returning();
      return row;
    }),

  deleteHoliday: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(hrPublicHolidays)
        .where(and(eq(hrPublicHolidays.id, input.id), eq(hrPublicHolidays.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  // ─── Paramètres généraux ───
  getGeneralSettings: rhProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select()
      .from(hrGeneralSettings)
      .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
      .limit(1);
    return row ?? null;
  }),

updateGeneralSettings: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        employeeCodePrefix: z.string().min(1).max(10),
        employeeCodeSequence: z.number().int().min(0),
        timezone: z.string(),
        currency: z.string().min(3).max(3),
        evaluationEnabled: z.boolean(),
        evaluationFrequency: z.string(),
        // specs MVP — calcul paie sur heures réelles
        standardMonthlyHours: z.number().min(1).max(1000).optional(),
        overtimeMultiplier: z.number().min(1).max(3).optional(),
        defaultOvertimeThreshold: z.number().min(1).max(24).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [existing] = await db
        .select({ id: hrGeneralSettings.id })
        .from(hrGeneralSettings)
        .where(eq(hrGeneralSettings.agenceId, agenceId))
        .limit(1);
      const values = { ...input, updatedBy: Number(ctx.user.id) };
      if (existing) {
        await db
          .update(hrGeneralSettings)
          .set(values as any)
          .where(eq(hrGeneralSettings.id, existing.id));
      } else {
        await db.insert(hrGeneralSettings).values({ agenceId, ...values } as any);
      }
      return { success: true };
    }),
});

