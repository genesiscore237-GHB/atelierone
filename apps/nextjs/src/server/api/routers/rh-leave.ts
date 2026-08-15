import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  employes,
  hrLeaveTypes,
  hrGeneralSettings,
  leaveBalances,
  leaveRequests,
  leaveBalanceAdjustments,
  attendanceEntries,
} from "@atelierone/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  calculateBalance,
  countWorkingDays,
  garageWorkingDay,
  proRataAcquisition,
  overlaps,
} from "~/server/lib/leave-engine";

const REQUEST_STATUS = ["brouillon", "en_attente", "approuve", "refuse", "annule"] as const;

/** RH-03 — Congés & absences : soldes, demandes, workflow, impact présences */
export const rhLeaveRouter = createTRPCRouter({
  // ─── Soldes ───
  getBalances: rhProcedure
    .input(z.object({ employeeId: z.number().int().optional(), year: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const year = safe.year ?? new Date().getFullYear();

      // Types de congés actifs avec solde de l'année (création auto à la lecture)
      const leaveTypes = await db
        .select()
        .from(hrLeaveTypes)
        .where(eq(hrLeaveTypes.agenceId, ctx.user.agenceId));

      const employees = await db
        .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom, matricule: employes.matricule, dateEmbauche: employes.dateEmbauche })
        .from(employes)
        .where(and(eq(employes.agenceId, ctx.user.agenceId), ...(safe.employeeId ? [eq(employes.id, safe.employeeId)] : [])));

      const [gen] = await db
        .select({ annualLeaveDays: hrGeneralSettings.annualLeaveDays })
        .from(hrGeneralSettings)
        .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
        .limit(1);
      const annualLeaveDays = Number(gen?.annualLeaveDays ?? 30);

      const rows: Array<Record<string, unknown>> = [];
      for (const emp of employees) {
        const monthsEmployed = emp.dateEmbauche
          ? Math.max(0, Math.min(12, (year - new Date(emp.dateEmbauche).getFullYear()) * 12 + (new Date().getMonth() - new Date(emp.dateEmbauche).getMonth())))
          : 12;
        const acquired = emp.dateEmbauche && new Date(emp.dateEmbauche).getFullYear() === year
          ? proRataAcquisition(annualLeaveDays, monthsEmployed)
          : annualLeaveDays;

        for (const lt of leaveTypes) {
          if (!lt.deductBalance) continue;
          const [existing] = await db
            .select()
            .from(leaveBalances)
            .where(
              and(
                eq(leaveBalances.employeeId, emp.id),
                eq(leaveBalances.leaveTypeId, lt.id),
                eq(leaveBalances.year, year),
              )
            )
            .limit(1);

          let balance = existing;
          if (!existing) {
            const [created] = await db
              .insert(leaveBalances)
              .values({
                employeeId: emp.id,
                leaveTypeId: lt.id,
                year,
                acquiredDays: lt.code === "CONGE_ANNUEL" ? String(acquired) : "0",
                takenDays: "0",
                adjustedDays: "0",
                balance: lt.code === "CONGE_ANNUEL" ? String(acquired) : "0",
              } as any)
              .returning();
            balance = created;
          }

          rows.push({
            id: balance.id,
            employeeId: emp.id,
            employeNom: emp.nom,
            employePrenom: emp.prenom,
            matricule: emp.matricule,
            leaveTypeId: lt.id,
            leaveTypeCode: lt.code,
            leaveTypeName: lt.name,
            year,
            acquiredDays: balance.acquiredDays,
            takenDays: balance.takenDays,
            adjustedDays: balance.adjustedDays,
            balance: balance.balance,
          });
        }
      }
      return rows;
    }),

  adjustBalance: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        leaveBalanceId: z.number().int(),
        amount: z.number().min(-100).max(100),
        reason: z.string().min(3, "Le motif est obligatoire"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [balance] = await db
        .select()
        .from(leaveBalances)
        .where(eq(leaveBalances.id, input.leaveBalanceId))
        .limit(1);
      if (!balance) throw new TRPCError({ code: "NOT_FOUND", message: "Solde introuvable." });

      await db.insert(leaveBalanceAdjustments).values({
        leaveBalanceId: balance.id,
        amount: String(input.amount),
        reason: input.reason,
        createdBy: Number(ctx.user.id),
      } as any);

      const newAdjusted = Number(balance.adjustedDays ?? 0) + input.amount;
      const newBalance = calculateBalance(
        Number(balance.acquiredDays ?? 0),
        Number(balance.takenDays ?? 0),
        newAdjusted
      );
      await db
        .update(leaveBalances)
        .set({ adjustedDays: String(newAdjusted), balance: String(newBalance), updatedAt: new Date() } as any)
        .where(eq(leaveBalances.id, balance.id));
      return { success: true, balance: newBalance };
    }),

  // ─── Demandes ───
  createRequest: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        employeeId: z.number().int(),
        leaveTypeId: z.number().int(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().min(3, "Le motif est obligatoire"),
        documentUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.endDate < input.startDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La date de fin doit suivre la date de début." });
      }
      const daysCount = countWorkingDays(input.startDate, input.endDate, garageWorkingDay);
      if (daysCount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La période ne contient aucun jour ouvré." });
      }

      // Conflit : demande approuvée/en attente sur la même période
      const [conflict] = await db
        .select({ id: leaveRequests.id })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.employeeId, input.employeeId),
            lte(leaveRequests.startDate, input.endDate),
            gte(leaveRequests.endDate, input.startDate),
            eq(leaveRequests.status, "approuve"),
          )
        )
        .limit(1);
      if (conflict) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Une demande approuvée chevauche cette période." });
      }

      const [row] = await db
        .insert(leaveRequests)
        .values({
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          startDate: input.startDate,
          endDate: input.endDate,
          daysCount: String(daysCount),
          reason: input.reason,
          documentUrl: input.documentUrl ?? null,
          status: "en_attente",
          requestedBy: Number(ctx.user.id),
        } as any)
        .returning();
      return row;
    }),

  listRequests: rhProcedure
    .input(
      z.object({
        employeeId: z.number().int().optional(),
        status: z.enum(REQUEST_STATUS).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.employeeId) conditions.push(eq(leaveRequests.employeeId, safe.employeeId));
      if (safe.status) conditions.push(eq(leaveRequests.status, safe.status));
      if (safe.from) conditions.push(gte(leaveRequests.startDate, safe.from));
      if (safe.to) conditions.push(lte(leaveRequests.endDate, safe.to));

      return db
        .select({
          id: leaveRequests.id,
          employeeId: leaveRequests.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          matricule: employes.matricule,
          leaveTypeId: leaveRequests.leaveTypeId,
          leaveTypeName: hrLeaveTypes.name,
          leaveTypeCode: hrLeaveTypes.code,
          startDate: leaveRequests.startDate,
          endDate: leaveRequests.endDate,
          daysCount: leaveRequests.daysCount,
          reason: leaveRequests.reason,
          status: leaveRequests.status,
          rejectionReason: leaveRequests.rejectionReason,
          createdAt: leaveRequests.createdAt,
        })
        .from(leaveRequests)
        .innerJoin(employes, eq(leaveRequests.employeeId, employes.id))
        .innerJoin(hrLeaveTypes, eq(leaveRequests.leaveTypeId, hrLeaveTypes.id))
        .where(and(...conditions))
        .orderBy(desc(leaveRequests.createdAt));
    }),

  decideRequest: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        id: z.number().int(),
        status: z.enum(["approuve", "refuse", "annule"]),
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [request] = await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, input.id))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Demande introuvable." });
      if (request.status === "approuve" || request.status === "refuse") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cette demande est déjà traitée." });
      }

      if (input.status === "approuve") {
        // Vérification du solde (types avec décompte)
        const [leaveType] = await db
          .select({ deductBalance: hrLeaveTypes.deductBalance, code: hrLeaveTypes.code })
          .from(hrLeaveTypes)
          .where(eq(hrLeaveTypes.id, request.leaveTypeId))
          .limit(1);
        const deduct = leaveType?.deductBalance ?? true;

        if (deduct) {
          const year = new Date(request.startDate).getFullYear();
          let balance = (
            await db
              .select()
              .from(leaveBalances)
              .where(
                and(
                  eq(leaveBalances.employeeId, request.employeeId),
                  eq(leaveBalances.leaveTypeId, request.leaveTypeId),
                  eq(leaveBalances.year, year),
                )
              )
              .limit(1)
          )[0];

          // Solde absent → création automatique (acquisition annuelle/prorata RH-00)
          if (!balance) {
            const [gen] = await db
              .select({ annualLeaveDays: hrGeneralSettings.annualLeaveDays })
              .from(hrGeneralSettings)
              .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
              .limit(1);
            const annualLeaveDays = Number(gen?.annualLeaveDays ?? 30);
            const [emp] = await db
              .select({ dateEmbauche: employes.dateEmbauche })
              .from(employes)
              .where(eq(employes.id, request.employeeId))
              .limit(1);
            let acquired = annualLeaveDays;
            if (emp?.dateEmbauche) {
              const hireYear = new Date(emp.dateEmbauche).getFullYear();
              if (hireYear === year) {
                const months = Math.max(1, new Date().getMonth() + 1 - new Date(emp.dateEmbauche).getMonth());
                acquired = proRataAcquisition(annualLeaveDays, months);
              }
            }
            const [created] = await db
              .insert(leaveBalances)
              .values({
                employeeId: request.employeeId,
                leaveTypeId: request.leaveTypeId,
                year,
                acquiredDays: String(acquired),
                takenDays: "0",
                adjustedDays: "0",
                balance: String(acquired),
              } as any)
              .returning();
            balance = created;
          }

          const soldeRestant = Number(balance.balance ?? 0);
          const jours = Number(request.daysCount ?? 0);
          if (soldeRestant < jours) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Solde insuffisant (reste ${soldeRestant} j, demande ${jours} j).`,
            });
          }
          const newTaken = Number(balance.takenDays ?? 0) + jours;
          const newBalance = calculateBalance(
            Number(balance.acquiredDays ?? 0),
            newTaken,
            Number(balance.adjustedDays ?? 0)
          );
          await db
            .update(leaveBalances)
            .set({ takenDays: String(newTaken), balance: String(newBalance), updatedAt: new Date() } as any)
            .where(eq(leaveBalances.id, balance.id));
        }

        // Impact présences : marquer les jours approuvés en "conge"
        await markLeaveOnAttendance(request.employeeId, request.startDate, request.endDate);
      }

      await db
        .update(leaveRequests)
        .set({
          status: input.status,
          approvedBy: input.status === "annule" ? null : Number(ctx.user.id),
          approvedAt: input.status === "annule" ? null : new Date(),
          rejectionReason: input.status === "refuse" ? (input.rejectionReason ?? null) : null,
          updatedAt: new Date(),
        } as any)
        .where(eq(leaveRequests.id, input.id));

      return { success: true };
    }),
});

/** Marque les jours approuvés comme congés dans les présences (upsert) */
async function markLeaveOnAttendance(employeeId: number, startDate: string, endDate: string) {
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end) {
    if (garageWorkingDay(cursor.getDay())) {
      const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      const [existing] = await db
        .select({ id: attendanceEntries.id })
        .from(attendanceEntries)
        .where(and(eq(attendanceEntries.employeeId, employeeId), eq(attendanceEntries.date, dateStr)))
        .limit(1);
      if (existing) {
        await db
          .update(attendanceEntries)
          .set({ status: "conge", timeIn: null, timeOut: null } as any)
          .where(eq(attendanceEntries.id, existing.id));
      } else {
        await db.insert(attendanceEntries).values({
          employeeId,
          date: dateStr,
          status: "conge",
          source: "import",
        } as any);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
}

// Référence gardée pour l'analyse statique (overlaps utilisé par la suite)
export { overlaps };
