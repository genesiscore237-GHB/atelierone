import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { planningAffectations, planningSnapshots, employes, utilisateurs } from "@atelierone/db";
import { eq, and, inArray, gte, lte, desc } from "drizzle-orm";

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

  /** F27 — Historique des réécritures du planning (lecture seule). */
  listWeekSnapshots: requirePermissionProcedure("rh.presence.modifier")
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: planningSnapshots.id,
          employeIdsJson: planningSnapshots.employeIdsJson,
          datesJson: planningSnapshots.datesJson,
          rowsJson: planningSnapshots.rowsJson,
          raison: planningSnapshots.raison,
          createdBy: planningSnapshots.createdBy,
          creatorName: utilisateurs.nom,
          creatorPrenom: utilisateurs.prenom,
          createdAt: planningSnapshots.createdAt,
        })
        .from(planningSnapshots)
        .leftJoin(utilisateurs, eq(planningSnapshots.createdBy, utilisateurs.id))
        .where(eq(planningSnapshots.agenceId, ctx.user.agenceId))
        .orderBy(desc(planningSnapshots.id))
        .limit(input?.limit ?? 50);
      return rows;
    }),

  /** Sauvegarde en lot d'une semaine (upsert par employé + date). */
  saveWeek: requirePermissionProcedure("rh.presence.modifier")
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

      // N13/P13 : archive les lignes affectées avant la réécriture (planning antérieur rejouable)
      const priorRows = await db
        .select()
        .from(planningAffectations)
        .where(
          and(
            eq(planningAffectations.agenceId, agenceId),
            inArray(planningAffectations.date, dates),
            inArray(planningAffectations.employeId, employeIds),
          )
        );
      if (priorRows.length > 0) {
        await db.insert(planningSnapshots).values({
          agenceId,
          employeIdsJson: employeIds,
          datesJson: dates,
          rowsJson: priorRows,
          raison: "recalcul",
          createdBy: Number(ctx.user.id),
        } as any);
      }

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

  /** Liste des employés planifiables (actif + congé ; suspendu/sorti exclus — N11). */
  listEmployes: rhProcedure.query(async ({ ctx }) => {
    return db
      .select({ id: employes.id, matricule: employes.matricule, nom: employes.nom, prenom: employes.prenom, fonction: employes.fonction })
      .from(employes)
      .where(and(eq(employes.agenceId, ctx.user.agenceId), inArray(employes.statut, ["actif", "conge"])))
      .orderBy(employes.matricule);
  }),
});