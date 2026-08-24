import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  employes,
  payrollPeriods,
  payrollItemsConfig,
  payrollEntries,
  payrollEntryLines,
  attendanceMonthlySummaries,
  attendanceCalculations,
  attendanceEntries,
  hrGeneralSettings,
} from "@atelierone/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { calculatePayroll, type PayrollConfigItem } from "~/server/lib/payroll-engine";

/** RH-04 — Paie : périodes, préparation, bulletins, configuration */
export const rhPayrollRouter = createTRPCRouter({
  // ─── Périodes ───
  listPeriods: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(payrollPeriods)
      .where(eq(payrollPeriods.agenceId, ctx.user.agenceId))
      .orderBy(desc(payrollPeriods.startDate));
  }),

  openPeriod: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.endDate < input.startDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La date de fin doit suivre la date de début." });
      }
      const [existing] = await db
        .select({ id: payrollPeriods.id, status: payrollPeriods.status })
        .from(payrollPeriods)
        .where(
          and(
            eq(payrollPeriods.agenceId, ctx.user.agenceId),
            eq(payrollPeriods.startDate, input.startDate),
            eq(payrollPeriods.endDate, input.endDate),
          )
        )
        .limit(1);
      if (existing) return existing;
      const [row] = await db
        .insert(payrollPeriods)
        .values({ startDate: input.startDate, endDate: input.endDate, status: "open", agenceId: ctx.user.agenceId } as any)
        .returning();
      return row;
    }),

  closePeriod: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(payrollPeriods)
        .set({ status: "closed", closedAt: new Date(), closedBy: Number(ctx.user.id) } as any)
        .where(eq(payrollPeriods.id, input.id));
      return { success: true };
    }),

  // ─── Préparation de la paie ───
  prepareMonth: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ periodId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [period] = await db
        .select()
        .from(payrollPeriods)
        .where(and(eq(payrollPeriods.id, input.periodId), eq(payrollPeriods.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Période introuvable." });

      // Clôture des présences requise (RH-02) : le mois de fin de période doit être verrouillé
      const endMonth = Number(period.endDate?.slice(5, 7) ?? "0");
      const endYear = Number(period.endDate?.slice(0, 4) ?? "0");
      const [summaryCheck] = await db
        .select({ locked: attendanceMonthlySummaries.locked })
        .from(attendanceMonthlySummaries)
        .where(
          and(
            eq(attendanceMonthlySummaries.year, endYear),
            eq(attendanceMonthlySummaries.month, endMonth),
            eq(attendanceMonthlySummaries.locked, true),
          )
        )
        .limit(1);
      if (!summaryCheck) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Clôturez d'abord les présences de ce mois (RH-02) avant de calculer la paie.",
        });
      }

      const items = (await db
        .select()
        .from(payrollItemsConfig)
        .where(and(eq(payrollItemsConfig.agenceId, ctx.user.agenceId), eq(payrollItemsConfig.active, true)))
        .orderBy(payrollItemsConfig.sortOrder)) as unknown as PayrollConfigItem[];

      // specs MVP : heures standard mensuelles (225,3) + majoration HS (1,5)
      const [general] = await db
        .select({ standardMonthlyHours: hrGeneralSettings.standardMonthlyHours, overtimeMultiplier: hrGeneralSettings.overtimeMultiplier })
        .from(hrGeneralSettings)
        .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
        .limit(1);
      const standardMonthlyHours = Number(general?.standardMonthlyHours ?? 225.3) || 225.3;
      const overtimeMultiplier = Number(general?.overtimeMultiplier ?? 1.5) || 1.5;

      const employees = await db
        .select({ id: employes.id, salaireBase: employes.salaireBase, modePaie: employes.modePaie })
        .from(employes)
        .where(eq(employes.agenceId, ctx.user.agenceId));

      // Agrégation des présences sur l'intervalle de la période
      const aggregates = await db
        .select({
          employeeId: attendanceEntries.employeeId,
          normalMinutes: sql<number>`COALESCE(SUM(${attendanceCalculations.normalMinutes}), 0)`,
          overtimeMinutes: sql<number>`COALESCE(SUM(${attendanceCalculations.overtimeMinutes}), 0)`,
          taskBonus: sql<number>`COALESCE(SUM(${attendanceEntries.taskBonus}), 0)`,
          daysPresent: sql<number>`COUNT(*) FILTER (WHERE ${attendanceCalculations.isAbsent} = false)`,
          daysAbsent: sql<number>`COUNT(*) FILTER (WHERE ${attendanceCalculations.isAbsent} = true)`,
        })
        .from(attendanceCalculations)
        .innerJoin(attendanceEntries, eq(attendanceCalculations.attendanceEntryId, attendanceEntries.id))
        .where(
          and(
            gte(attendanceEntries.date, period.startDate),
            lte(attendanceEntries.date, period.endDate),
          )
        )
        .groupBy(attendanceEntries.employeeId);

      let created = 0;
      for (const emp of employees) {
        const base = Number(emp.salaireBase ?? 0);
        if (base <= 0) continue; // pas de salaire → pas de bulletin

        const agg = aggregates.find((a) => a.employeeId === emp.id);
        const normalHours = Math.round(((agg?.normalMinutes ?? 0) / 60) * 100) / 100;
        const overtimeHours = Math.round(((agg?.overtimeMinutes ?? 0) / 60) * 100) / 100;
        const taskBonus = Math.round(Number(agg?.taskBonus ?? 0) * 100) / 100;
        const daysPresent = Number(agg?.daysPresent ?? 0);
        const daysAbsent = Number(agg?.daysAbsent ?? 0);

        // specs MVP : paie sur heures réelles (HN × taux + HS × taux majoré + primes de tâche),
        // sauf override « mensuel » (salaire fixe indépendant des heures)
        const payOnHours = (emp.modePaie ?? "horaire") !== "mensuel";

        const result = calculatePayroll({
          baseSalary: base,
          overtimeHours,
          daysPresent,
          daysAbsent,
          expectedWorkingDays: 26,
          performanceBonus: 0,
          manualAdjustments: [],
          items,
          normalHours,
          taskBonus,
          standardMonthlyHours,
          overtimeMultiplier,
          payOnHours,
        });

        // Upsert du bulletin
        const [existing] = await db
          .select({ id: payrollEntries.id })
          .from(payrollEntries)
          .where(
            and(
              eq(payrollEntries.periodId, period.id),
              eq(payrollEntries.employeeId, emp.id),
            )
          )
          .limit(1);

        const values = {
          periodId: period.id,
          employeeId: emp.id,
          baseSalary: String(base),
          normalHours: String(normalHours),
          overtimeHours: String(overtimeHours),
          daysPresent,
          daysAbsent,
          presenceBonus: String(result.lines.find((l) => l.itemCode === "PRIME_PRESENCE")?.amount ?? 0),
          performanceBonus: String(result.lines.find((l) => l.itemCode === "PRIME_PERFORMANCE")?.amount ?? 0),
          otherEarnings: String(result.lines.find((l) => l.itemCode === "PRIME_TACHE")?.amount ?? 0), // primes de tâche (specs MVP)
          totalEarnings: String(result.totalEarnings),
          deductions: String(result.totalDeductions),
          cnpsEmployee: String(result.cnpsEmployee),
          cnpsEmployer: String(result.cnpsEmployer),
          netImposable: String(result.netImposable),
          irpp: String(result.irpp),
          netPay: String(result.netPay),
          status: "prepare",
          generatedAt: new Date(),
          updatedAt: new Date(),
        };

        let entryId: number;
        if (existing) {
          await db
            .update(payrollEntries)
            .set(values as any)
            .where(eq(payrollEntries.id, existing.id));
          entryId = existing.id;
          await db.delete(payrollEntryLines).where(eq(payrollEntryLines.payrollEntryId, entryId));
        } else {
          const [row] = await db.insert(payrollEntries).values(values as any).returning();
          entryId = row.id;
        }

        // Lignes détaillées
        let order = 0;
        for (const line of result.lines) {
          await db.insert(payrollEntryLines).values({
            payrollEntryId: entryId,
            itemCode: line.itemCode,
            label: line.label,
            amount: String(line.amount),
            direction: line.direction,
            sortOrder: order++,
          } as any);
        }

        created++;
      }
      return { created };
    }),

  // ─── Bulletins ───
  listEntries: rhProcedure
    .input(z.object({ periodId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.periodId) conditions.push(eq(payrollEntries.periodId, safe.periodId));
      return db
        .select({
          id: payrollEntries.id,
          periodId: payrollEntries.periodId,
          employeeId: payrollEntries.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          matricule: employes.matricule,
          baseSalary: payrollEntries.baseSalary,
          normalHours: payrollEntries.normalHours,
          overtimeHours: payrollEntries.overtimeHours,
          daysPresent: payrollEntries.daysPresent,
          daysAbsent: payrollEntries.daysAbsent,
          otherEarnings: payrollEntries.otherEarnings, // primes de tâche (specs MVP)
          totalEarnings: payrollEntries.totalEarnings,
          deductions: payrollEntries.deductions,
          cnpsEmployee: payrollEntries.cnpsEmployee,
          netPay: payrollEntries.netPay,
          paymentMethod: payrollEntries.paymentMethod,
          status: payrollEntries.status,
        })
        .from(payrollEntries)
        .innerJoin(employes, eq(payrollEntries.employeeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(payrollEntries.createdAt));
    }),

  getEntry: rhProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [entry] = await db
        .select()
        .from(payrollEntries)
        .where(eq(payrollEntries.id, input.id))
        .limit(1);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Bulletin introuvable." });
      const lines = await db
        .select()
        .from(payrollEntryLines)
        .where(eq(payrollEntryLines.payrollEntryId, entry.id))
        .orderBy(payrollEntryLines.sortOrder);
      return { ...entry, lines };
    }),

  // Ajustements manuels → recalcul
  adjustEntry: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        id: z.number().int(),
        performanceBonus: z.number().min(0).optional(),
        manualAdjustments: z.array(z.object({ code: z.string(), amount: z.number() })).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [entry] = await db
        .select()
        .from(payrollEntries)
        .where(eq(payrollEntries.id, input.id))
        .limit(1);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Bulletin introuvable." });
      if (entry.status === "paye") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce bulletin est payé, il ne peut plus être modifié." });
      }

      const [period] = await db
        .select()
        .from(payrollPeriods)
        .where(eq(payrollPeriods.id, entry.periodId))
        .limit(1);

      const items = (await db
        .select()
        .from(payrollItemsConfig)
        .where(and(eq(payrollItemsConfig.agenceId, ctx.user.agenceId), eq(payrollItemsConfig.active, true)))
        .orderBy(payrollItemsConfig.sortOrder)) as unknown as PayrollConfigItem[];

      const [general] = await db
        .select({ standardMonthlyHours: hrGeneralSettings.standardMonthlyHours, overtimeMultiplier: hrGeneralSettings.overtimeMultiplier })
        .from(hrGeneralSettings)
        .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
        .limit(1);
      const [emp] = await db
        .select({ modePaie: employes.modePaie })
        .from(employes)
        .where(eq(employes.id, entry.employeeId))
        .limit(1);

      const result = calculatePayroll({
        baseSalary: Number(entry.baseSalary),
        overtimeHours: Number(entry.overtimeHours ?? 0),
        daysPresent: entry.daysPresent ?? 0,
        daysAbsent: entry.daysAbsent ?? 0,
        expectedWorkingDays: 26,
        performanceBonus: input.performanceBonus ?? 0,
        manualAdjustments: (input.manualAdjustments ?? []) as { code: string; amount: number }[],
        items,
        normalHours: Number(entry.normalHours ?? 0),
        taskBonus: Number(entry.otherEarnings ?? 0),
        standardMonthlyHours: Number(general?.standardMonthlyHours ?? 225.3) || 225.3,
        overtimeMultiplier: Number(general?.overtimeMultiplier ?? 1.5) || 1.5,
        payOnHours: (emp?.modePaie ?? "horaire") !== "mensuel",
      });

      await db
        .update(payrollEntries)
        .set({
          performanceBonus: String(result.lines.find((l) => l.itemCode === "PRIME_PERFORMANCE")?.amount ?? 0),
          totalEarnings: String(result.totalEarnings),
          deductions: String(result.totalDeductions),
          netImposable: String(result.netImposable),
          irpp: String(result.irpp),
          netPay: String(result.netPay),
          notes: input.notes ?? null,
          updatedAt: new Date(),
        } as any)
        .where(eq(payrollEntries.id, entry.id));

      await db.delete(payrollEntryLines).where(eq(payrollEntryLines.payrollEntryId, entry.id));
      let order = 0;
      for (const line of result.lines) {
        await db.insert(payrollEntryLines).values({
          payrollEntryId: entry.id,
          itemCode: line.itemCode,
          label: line.label,
          amount: String(line.amount),
          direction: line.direction,
          sortOrder: order++,
        } as any);
      }
      return { success: true, netPay: result.netPay };
    }),

  markPaid: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number().int(), paymentMethod: z.enum(["especes", "om", "momo", "virement"]) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .update(payrollEntries)
        .set({ status: "paye", paymentMethod: input.paymentMethod, paidAt: new Date(), updatedAt: new Date() } as any)
        .where(eq(payrollEntries.id, input.id))
        .returning();
      return row;
    }),

  // ─── Configuration des éléments ───
  listItemsConfig: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(payrollItemsConfig)
      .where(eq(payrollItemsConfig.agenceId, ctx.user.agenceId))
      .orderBy(payrollItemsConfig.sortOrder);
  }),

  updateItemConfig: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1),
        params: z.record(z.unknown()),
        active: z.boolean(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...values } = input;
      await db
        .update(payrollItemsConfig)
        .set(values as any)
        .where(and(eq(payrollItemsConfig.id, id), eq(payrollItemsConfig.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),
});
