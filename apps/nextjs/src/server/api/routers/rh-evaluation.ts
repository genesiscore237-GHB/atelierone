import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  employes,
  evaluationGrids,
  evaluationCriteria,
  evaluationCampaigns,
  evaluations,
  evaluationScores,
  performanceBonusRules,
} from "@atelierone/db";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { weightedScore, bonusForScore } from "~/server/lib/evaluation-engine";

/** RH-05 — Évaluation & performance */
export const rhEvaluationRouter = createTRPCRouter({
  // ─── Grilles & critères ───
  listGrids: rhProcedure.query(async ({ ctx }) => {
    const grids = await db
      .select()
      .from(evaluationGrids)
      .where(eq(evaluationGrids.agenceId, ctx.user.agenceId))
      .orderBy(desc(evaluationGrids.id));
    const ids = grids.map((g) => g.id);
    const criteria = ids.length
      ? await db
          .select()
          .from(evaluationCriteria)
          .where(ids.length === 1 ? eq(evaluationCriteria.gridId, ids[0]) : undefined)
          .orderBy(evaluationCriteria.sortOrder)
      : [];
    return grids.map((g) => ({
      ...g,
      criteria: criteria.filter((c) => c.gridId === g.id),
    }));
  }),

  createGrid: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        name: z.string().min(1),
        positionId: z.number().int().optional(),
        scale: z.string().default("1-5"),
        criteria: z.array(
          z.object({
            name: z.string().min(1),
            weight: z.number().min(1).max(100),
            maxScore: z.number().min(1).max(10).default(5),
          })
        ).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const totalWeight = input.criteria.reduce((s, c) => s + c.weight, 0);
      if (totalWeight !== 100) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `La somme des pondérations doit être 100 (actuellement ${totalWeight}).` });
      }
      const [grid] = await db
        .insert(evaluationGrids)
        .values({
          name: input.name,
          positionId: input.positionId ?? null,
          scale: input.scale,
          agenceId: ctx.user.agenceId,
        } as any)
        .returning();
      for (const [i, c] of input.criteria.entries()) {
        await db.insert(evaluationCriteria).values({
          gridId: grid.id,
          name: c.name,
          weight: String(c.weight),
          maxScore: String(c.maxScore),
          sortOrder: i,
        } as any);
      }
      return grid;
    }),

  deleteGrid: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(evaluationGrids)
        .where(and(eq(evaluationGrids.id, input.id), eq(evaluationGrids.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  // ─── Campagnes ───
  listCampaigns: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(evaluationCampaigns)
      .where(eq(evaluationCampaigns.agenceId, ctx.user.agenceId))
      .orderBy(desc(evaluationCampaigns.periodStart));
  }),

  createCampaign: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        name: z.string().min(1),
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(evaluationCampaigns)
        .values({ ...input, status: "ouverte", createdBy: Number(ctx.user.id), agenceId: ctx.user.agenceId } as any)
        .returning();
      return row;
    }),

  closeCampaign: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(evaluationCampaigns)
        .set({ status: "cloturee" } as any)
        .where(and(eq(evaluationCampaigns.id, input.id), eq(evaluationCampaigns.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  // ─── Évaluations ───
  listEvaluations: rhProcedure
    .input(z.object({ campaignId: z.number().int().optional(), employeeId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.campaignId) conditions.push(eq(evaluations.campaignId, safe.campaignId));
      if (safe.employeeId) conditions.push(eq(evaluations.employeeId, safe.employeeId));
      return db
        .select({
          id: evaluations.id,
          campaignId: evaluations.campaignId,
          employeeId: evaluations.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          matricule: employes.matricule,
          globalScore: evaluations.globalScore,
          appreciation: evaluations.appreciation,
          objectives: evaluations.objectives,
          status: evaluations.status,
          evaluatedAt: evaluations.evaluatedAt,
        })
        .from(evaluations)
        .innerJoin(employes, eq(evaluations.employeeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(evaluations.evaluatedAt));
    }),

  getEvaluation: rhProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [evalRow] = await db
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, input.id))
        .limit(1);
      if (!evalRow) throw new TRPCError({ code: "NOT_FOUND", message: "Évaluation introuvable." });
      const scores = await db
        .select()
        .from(evaluationScores)
        .where(eq(evaluationScores.evaluationId, evalRow.id));
      return { ...evalRow, scores };
    }),

  saveEvaluation: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        campaignId: z.number().int(),
        employeeId: z.number().int(),
        gridId: z.number().int(),
        scores: z.array(
          z.object({
            criterionId: z.number().int(),
            score: z.number().min(0).max(10),
            comment: z.string().optional(),
          })
        ).min(1),
        appreciation: z.string().optional(),
        objectives: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Critères de la grille pour le calcul pondéré
      const criteria = await db
        .select()
        .from(evaluationCriteria)
        .where(eq(evaluationCriteria.gridId, input.gridId));

      const scoresById = new Map(input.scores.map((s) => [s.criterionId, s]));
      const weighted = criteria
        .filter((c) => scoresById.has(c.id))
        .map((c) => ({
          weight: Number(c.weight),
          score: Number(scoresById.get(c.id)?.score ?? 0),
          maxScore: Number(c.maxScore ?? 5),
        }));
      const globalScore = weightedScore(weighted);

      // Upsert de l'évaluation
      const [existing] = await db
        .select({ id: evaluations.id })
        .from(evaluations)
        .where(
          and(
            eq(evaluations.campaignId, input.campaignId),
            eq(evaluations.employeeId, input.employeeId),
          )
        )
        .limit(1);

      let evalId: number;
      if (existing) {
        await db
          .update(evaluations)
          .set({
            gridId: input.gridId,
            globalScore: String(globalScore),
            appreciation: input.appreciation ?? null,
            objectives: input.objectives ?? null,
            evaluatorId: Number(ctx.user.id),
            evaluatedAt: new Date(),
          } as any)
          .where(eq(evaluations.id, existing.id));
        evalId = existing.id;
        await db.delete(evaluationScores).where(eq(evaluationScores.evaluationId, evalId));
      } else {
        const [row] = await db
          .insert(evaluations)
          .values({
            campaignId: input.campaignId,
            employeeId: input.employeeId,
            evaluatorId: Number(ctx.user.id),
            gridId: input.gridId,
            globalScore: String(globalScore),
            appreciation: input.appreciation ?? null,
            objectives: input.objectives ?? null,
            status: "finalisee",
            evaluatedAt: new Date(),
          } as any)
          .returning();
        evalId = row.id;
      }

      for (const s of input.scores) {
        await db.insert(evaluationScores).values({
          evaluationId: evalId,
          criterionId: s.criterionId,
          score: String(s.score),
          comment: s.comment ?? null,
        } as any);
      }

      return { id: evalId, globalScore };
    }),

  // ─── Barème de prime ───
  listBonusRules: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(performanceBonusRules)
      .where(eq(performanceBonusRules.agenceId, ctx.user.agenceId))
      .orderBy(desc(performanceBonusRules.minScore));
  }),

  updateBonusRule: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        id: z.number().int(),
        minScore: z.number().min(0).max(10),
        maxScore: z.number().min(0).max(10),
        bonusAmount: z.number().min(0),
        active: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...values } = input;
      await db
        .update(performanceBonusRules)
        .set({
          minScore: String(values.minScore),
          maxScore: String(values.maxScore),
          bonusAmount: String(values.bonusAmount),
          active: values.active,
        } as any)
        .where(and(eq(performanceBonusRules.id, id), eq(performanceBonusRules.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  getSuggestedBonus: rhProcedure
    .input(z.object({ score: z.number().min(0).max(10) }))
    .query(async ({ ctx, input }) => {
      const rules = await db
        .select()
        .from(performanceBonusRules)
        .where(and(eq(performanceBonusRules.agenceId, ctx.user.agenceId), eq(performanceBonusRules.active, true)));
      return {
        score: input.score,
        suggestedBonus: bonusForScore(
          input.score,
          rules.map((r) => ({
            minScore: Number(r.minScore),
            maxScore: Number(r.maxScore),
            bonusAmount: Number(r.bonusAmount ?? 0),
          }))
        ),
      };
    }),
});
