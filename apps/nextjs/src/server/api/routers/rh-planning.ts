import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { planningAffectations, employes } from "@atelierone/db";
import { eq, and, inArray, gte, lte } from "drizzle-orm";

/** RH — PLANNING HEBDOMADAIRE / AFFECTATIONS (specs MVP 07_Planning). */
export const rhPlanningRouter = createTRPCRouter({
  /** Grille d'une semaine (dates [from → to]) : une entrée par employé + jour. */
  listWeek: rhProcedure
    .input(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: planningAffectations.id,
          employeId: planningAffectations.employeId,
          date: planningAffectations.date,
          affectation: planningAffectations.affectation,
          notes: planningAffectations.notes,
        })
        .from(planningAffectations)
        .where(and(
          eq(planningAffectations.agenceId, ctx.user.agenceId),
          gte(planningAffectations.date, input.from),
          lte(planningAffectations.date, input.to),
        ))
        .orderBy(planningAffectations.date);
      return rows;
    }),

  /** Sauvegarde en lot d'une semaine (upsert par employé + date). */
  saveWeek: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({
      rows: z.array(z.object({
        employeId: z.number().int(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        affectation: z.string().min(1).max(120),
        notes: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.rows.length === 0) return { saved: 0 };
      const agenceId = ctx.user.agenceId;
      const dates = [...new Set(input.rows.map((r) => r.date))];
      const employeIds = [...new Set(input.rows.map((r) => r.employeId))];

      // Réécriture simple de la semaine pour les employés concernés
      await db
        .delete(planningAffectations)
        .where(and(
          eq(planningAffectations.agenceId, agenceId),
          inArray(planningAffectations.date, dates),
          inArray(planningAffectations.employeId, employeIds),
        ));
      for (const r of input.rows) {
        await db.insert(planningAffectations).values({
          agenceId,
          employeId: r.employeId,
          date: r.date,
          affectation: r.affectation,
          notes: r.notes ?? null,
          creePar: Number(ctx.user.id),
        } as any);
      }
      return { saved: input.rows.length };
    }),

  /** Liste des employés actifs (grille du planning). */
  listEmployes: rhProcedure.query(async ({ ctx }) => {
    return db
      .select({ id: employes.id, matricule: employes.matricule, nom: employes.nom, prenom: employes.prenom, fonction: employes.fonction })
      .from(employes)
      .where(and(eq(employes.agenceId, ctx.user.agenceId), eq(employes.statut, "actif")))
      .orderBy(employes.matricule);
  }),
});