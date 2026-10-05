import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  skills,
  positionSkills,
  employeeSkills,
  trainings,
  trainingSessions,
  trainingParticipations,
  employes,
  positions,
} from "@atelierone/db";
import { eq, and, desc, like, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { skillGaps, suggestTrainings, monthsSinceLastTraining } from "~/server/lib/skills-engine";
import { assertEmployeEnAgence } from "~/server/lib/rh-scope";

/** RH-06 — Compétences & formations */
export const rhCompetencesRouter = createTRPCRouter({
  // ─── Référentiel de compétences ───
  listSkills: rhProcedure
    .input(z.object({ category: z.string().optional(), search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(skills.agenceId, ctx.user.agenceId)];
      if (safe.category) conditions.push(eq(skills.category, safe.category));
      if (safe.search) conditions.push(like(skills.name, `%${safe.search}%`));
      const rows = await db
        .select()
        .from(skills)
        .where(and(...conditions))
        .orderBy(skills.category, skills.name);
      return rows;
    }),

  createSkill: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      category: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select({ id: skills.id })
        .from(skills)
        .where(and(eq(skills.agenceId, ctx.user.agenceId), eq(skills.code, input.code)))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `La compétence « ${input.code} » existe déjà.` });
      }
      const [row] = await db
        .insert(skills)
        .values({ ...input, agenceId: ctx.user.agenceId } as any)
        .returning();
      return row;
    }),

  updateSkill: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).optional(),
      category: z.string().min(1).optional(),
      description: z.string().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await db.update(skills).set(rest as any).where(and(eq(skills.id, id), eq(skills.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  deleteSkill: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(skills).where(and(eq(skills.id, input.id), eq(skills.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  // ─── Compétences requises par poste ───
  listPositionSkills: rhProcedure
    .input(z.object({ positionId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(positions.agenceId, ctx.user.agenceId)];
      if (safe.positionId) conditions.push(eq(positionSkills.positionId, safe.positionId));
      const rows = await db
        .select({
          id: positionSkills.id,
          positionId: positionSkills.positionId,
          skillId: positionSkills.skillId,
          requiredLevel: positionSkills.requiredLevel,
          skillName: skills.name,
          skillCode: skills.code,
          skillCategory: skills.category,
          positionName: positions.name,
        })
        .from(positionSkills)
        .innerJoin(skills, eq(positionSkills.skillId, skills.id))
        .innerJoin(positions, eq(positionSkills.positionId, positions.id))
        .where(and(...conditions))
        .orderBy(positions.name, skills.name);
      return rows;
    }),

  setPositionSkill: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({
      positionId: z.number().int(),
      skillId: z.number().int(),
      requiredLevel: z.number().int().min(1).max(5),
    }))
    .mutation(async ({ ctx, input }) => {
      const [pos] = await db
        .select({ id: positions.id })
        .from(positions)
        .where(and(eq(positions.id, input.positionId), eq(positions.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!pos) throw new TRPCError({ code: "NOT_FOUND", message: "Poste introuvable." });
      const [existing] = await db
        .select({ id: positionSkills.id })
        .from(positionSkills)
        .where(and(eq(positionSkills.positionId, input.positionId), eq(positionSkills.skillId, input.skillId)))
        .limit(1);
      if (existing) {
        await db.update(positionSkills).set({ requiredLevel: input.requiredLevel }).where(eq(positionSkills.id, existing.id));
        return { upserted: false };
      }
      await db.insert(positionSkills).values(input as any);
      return { upserted: true };
    }),

  removePositionSkill: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({ positionId: z.number().int(), skillId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [pos] = await db
        .select({ id: positions.id })
        .from(positions)
        .where(and(eq(positions.id, input.positionId), eq(positions.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!pos) throw new TRPCError({ code: "NOT_FOUND", message: "Poste introuvable." });
      await db
        .delete(positionSkills)
        .where(and(eq(positionSkills.positionId, input.positionId), eq(positionSkills.skillId, input.skillId)));
      return { success: true };
    }),

  // ─── Matrice employé × compétences ───
  listEmployeeSkills: rhProcedure
    .input(z.object({ employeeId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.employeeId) conditions.push(eq(employeeSkills.employeeId, safe.employeeId));
      const rows = await db
        .select({
          id: employeeSkills.id,
          employeeId: employeeSkills.employeeId,
          skillId: employeeSkills.skillId,
          currentLevel: employeeSkills.currentLevel,
          assessedAt: employeeSkills.assessedAt,
          skillName: skills.name,
          skillCode: skills.code,
          skillCategory: skills.category,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
        })
        .from(employeeSkills)
        .innerJoin(skills, eq(employeeSkills.skillId, skills.id))
        .innerJoin(employes, eq(employeeSkills.employeeId, employes.id))
        .where(and(...conditions))
        .orderBy(employes.nom, skills.name);
      return rows;
    }),

  setEmployeeSkill: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({
      employeeId: z.number().int(),
      skillId: z.number().int(),
      currentLevel: z.number().int().min(1).max(5),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeeId, ctx.user.agenceId);
      const [existing] = await db
        .select({ id: employeeSkills.id })
        .from(employeeSkills)
        .where(and(eq(employeeSkills.employeeId, input.employeeId), eq(employeeSkills.skillId, input.skillId)))
        .limit(1);
      if (existing) {
        await db
          .update(employeeSkills)
          .set({ currentLevel: input.currentLevel, assessedAt: new Date(), assessedBy: ctx.user.id } as any)
          .where(eq(employeeSkills.id, existing.id));
        return { upserted: false };
      }
      await db.insert(employeeSkills).values({
        ...input,
        assessedBy: ctx.user.id,
      } as any);
      return { upserted: true };
    }),

  removeEmployeeSkill: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({ employeeId: z.number().int(), skillId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeeId, ctx.user.agenceId);
      await db
        .delete(employeeSkills)
        .where(and(eq(employeeSkills.employeeId, input.employeeId), eq(employeeSkills.skillId, input.skillId)));
      return { success: true };
    }),

  // ─── Écarts & suggestions (moteur) ───
  getGaps: rhProcedure
    .input(z.object({ employeeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [emp] = await db
        .select({ id: employes.id, positionId: employes.positionId })
        .from(employes)
        .where(and(eq(employes.id, input.employeeId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!emp || !emp.positionId) {
        return { gaps: [], suggestions: [], positionName: null };
      }
      const [pos] = await db
        .select({ id: positions.id, name: positions.name })
        .from(positions)
        .where(eq(positions.id, emp.positionId))
        .limit(1);

      const reqs = await db
        .select({ skillId: positionSkills.skillId, skillName: skills.name, requiredLevel: positionSkills.requiredLevel })
        .from(positionSkills)
        .innerJoin(skills, eq(positionSkills.skillId, skills.id))
        .where(eq(positionSkills.positionId, emp.positionId));

      const currents = await db
        .select({ skillId: employeeSkills.skillId, currentLevel: employeeSkills.currentLevel })
        .from(employeeSkills)
        .where(eq(employeeSkills.employeeId, input.employeeId));

      const gaps = skillGaps(
        reqs as any,
        currents as any
      );

      const trainingsAll = await db
        .select({ trainingId: trainings.id, title: trainings.title, skillIds: trainings.skillIds })
        .from(trainings)
        .where(eq(trainings.agenceId, ctx.user.agenceId));

      const suggestions = suggestTrainings(gaps, trainingsAll as any);

      return { gaps, suggestions, positionName: pos?.name ?? null };
    }),

  // ─── Catalogue de formations ───
  listTrainings: rhProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(trainings.agenceId, ctx.user.agenceId)];
      const rows = await db
        .select()
        .from(trainings)
        .where(and(...conditions))
        .orderBy(trainings.title);
      return rows;
    }),

  createTraining: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      provider: z.string().optional(),
      durationHours: z.number().min(0.5).optional(),
      skillIds: z.array(z.number().int()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(trainings)
        .values({
          title: input.title,
          description: input.description ?? null,
          provider: input.provider ?? "interne",
          durationHours: input.durationHours ? String(input.durationHours) : null,
          skillIds: input.skillIds,
          agenceId: ctx.user.agenceId,
        } as any)
        .returning();
      return row;
    }),

  updateTraining: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({
      id: z.number().int(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      provider: z.string().optional(),
      durationHours: z.number().min(0.5).optional(),
      skillIds: z.array(z.number().int()).optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const values: any = { ...rest };
      if (rest.durationHours !== undefined) values.durationHours = String(rest.durationHours);
      await db.update(trainings).set(values).where(and(eq(trainings.id, id), eq(trainings.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  deleteTraining: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(trainings).where(and(eq(trainings.id, input.id), eq(trainings.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  // ─── Sessions & participants (plan de formation) ───
  listSessions: rhProcedure
    .input(z.object({ trainingId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(trainingSessions.agenceId, ctx.user.agenceId)];
      if (safe.trainingId) conditions.push(eq(trainingSessions.trainingId, safe.trainingId));
      const rows = await db
        .select({
          id: trainingSessions.id,
          trainingId: trainingSessions.trainingId,
          startDate: trainingSessions.startDate,
          endDate: trainingSessions.endDate,
          location: trainingSessions.location,
          status: trainingSessions.status,
          trainingTitle: trainings.title,
        })
        .from(trainingSessions)
        .innerJoin(trainings, eq(trainingSessions.trainingId, trainings.id))
        .where(and(...conditions))
        .orderBy(desc(trainingSessions.startDate));
      return rows;
    }),

  createSession: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({
      trainingId: z.number().int(),
      startDate: z.string().min(1),
      endDate: z.string().optional(),
      location: z.string().optional(),
      status: z.string().default("planifiee"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [training] = await db
        .select({ id: trainings.id })
        .from(trainings)
        .where(and(eq(trainings.id, input.trainingId), eq(trainings.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!training) throw new TRPCError({ code: "NOT_FOUND", message: "Formation introuvable." });
      const [row] = await db
        .insert(trainingSessions)
        .values({
          trainingId: input.trainingId,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          location: input.location ?? null,
          status: input.status,
          createdBy: ctx.user.id,
          agenceId: ctx.user.agenceId,
        } as any)
        .returning();
      return row;
    }),

  updateSession: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({
      id: z.number().int(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      location: z.string().optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await db.update(trainingSessions).set(rest as any).where(and(eq(trainingSessions.id, id), eq(trainingSessions.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  deleteSession: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(trainingSessions).where(and(eq(trainingSessions.id, input.id), eq(trainingSessions.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  listParticipations: rhProcedure
    .input(z.object({ sessionId: z.number().int().optional(), employeeId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(trainingSessions.agenceId, ctx.user.agenceId)];
      if (safe.sessionId) conditions.push(eq(trainingParticipations.sessionId, safe.sessionId));
      if (safe.employeeId) conditions.push(eq(trainingParticipations.employeeId, safe.employeeId));
      const rows = await db
        .select({
          id: trainingParticipations.id,
          sessionId: trainingParticipations.sessionId,
          employeeId: trainingParticipations.employeeId,
          status: trainingParticipations.status,
          certificateUrl: trainingParticipations.certificateUrl,
          score: trainingParticipations.score,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          trainingTitle: trainings.title,
        })
        .from(trainingParticipations)
        .innerJoin(employes, eq(trainingParticipations.employeeId, employes.id))
        .innerJoin(trainingSessions, eq(trainingParticipations.sessionId, trainingSessions.id))
        .innerJoin(trainings, eq(trainingSessions.trainingId, trainings.id))
        .where(and(...conditions))
        .orderBy(desc(trainingSessions.startDate));
      return rows;
    }),

  addParticipation: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({
      sessionId: z.number().int(),
      employeeId: z.number().int(),
      status: z.string().default("inscrit"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await db
        .select({ id: trainingSessions.id })
        .from(trainingSessions)
        .where(and(eq(trainingSessions.id, input.sessionId), eq(trainingSessions.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session introuvable." });
      await assertEmployeEnAgence(input.employeeId, ctx.user.agenceId);
      const [existing] = await db
        .select({ id: trainingParticipations.id })
        .from(trainingParticipations)
        .where(and(eq(trainingParticipations.sessionId, input.sessionId), eq(trainingParticipations.employeeId, input.employeeId)))
        .limit(1);
      if (existing) {
        await db
          .update(trainingParticipations)
          .set({ status: input.status } as any)
          .where(eq(trainingParticipations.id, existing.id));
        return { upserted: false };
      }
      const [row] = await db
        .insert(trainingParticipations)
        .values({
          sessionId: input.sessionId,
          employeeId: input.employeeId,
          status: input.status,
        } as any)
        .returning();
      return { id: row.id, upserted: true };
    }),

  updateParticipation: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({
      id: z.number().int(),
      status: z.string().optional(),
      score: z.number().min(0).max(20).optional(),
      certificateUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [participation] = await db
        .select({ id: trainingParticipations.id })
        .from(trainingParticipations)
        .innerJoin(trainingSessions, eq(trainingParticipations.sessionId, trainingSessions.id))
        .where(and(eq(trainingParticipations.id, input.id), eq(trainingSessions.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!participation) throw new TRPCError({ code: "NOT_FOUND", message: "Participation introuvable." });
      const { id, ...rest } = input;
      const values: any = { ...rest };
      if (rest.score !== undefined) values.score = String(rest.score);
      await db.update(trainingParticipations).set(values).where(eq(trainingParticipations.id, id));
      return { success: true };
    }),

  removeParticipation: requirePermissionProcedure("rh.competence.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [participation] = await db
        .select({ id: trainingParticipations.id })
        .from(trainingParticipations)
        .innerJoin(trainingSessions, eq(trainingParticipations.sessionId, trainingSessions.id))
        .where(and(eq(trainingParticipations.id, input.id), eq(trainingSessions.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!participation) throw new TRPCError({ code: "NOT_FOUND", message: "Participation introuvable." });
      await db.delete(trainingParticipations).where(eq(trainingParticipations.id, input.id));
      return { success: true };
    }),

  // ─── Alerte : employés sans formation depuis X mois ───
  getTrainingLapse: rhProcedure
    .input(z.object({ months: z.number().int().min(1).max(60).default(6) }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          employeeId: employes.id,
          nom: employes.nom,
          prenom: employes.prenom,
          positionName: positions.name,
        })
        .from(employes)
        .leftJoin(positions, eq(employes.positionId, positions.id))
        .where(eq(employes.agenceId, ctx.user.agenceId));
      const employeeIds = rows.map((r) => r.employeeId);
      const lastTrainings = employeeIds.length
        ? await db
            .select({
              employeeId: trainingParticipations.employeeId,
              date: trainingSessions.startDate,
            })
            .from(trainingParticipations)
            .innerJoin(trainingSessions, eq(trainingParticipations.sessionId, trainingSessions.id))
            .where(inArray(trainingParticipations.employeeId, employeeIds))
            .orderBy(desc(trainingSessions.startDate))
        : [];
      const lastByEmployee = new Map<number, string>();
      for (const t of lastTrainings) {
        if (!lastByEmployee.has(t.employeeId)) lastByEmployee.set(t.employeeId, t.date);
      }
      const today = new Date();
      return rows
        .map((r) => {
          const lastTraining = lastByEmployee.get(r.employeeId) ?? null;
          const monthsSince = lastTraining ? monthsSinceLastTraining(lastTraining, today) : 0;
          return {
            employeeId: r.employeeId,
            nom: r.nom,
            prenom: r.prenom,
            positionName: r.positionName,
            lastTraining,
            monthsSince,
            neverTrained: !lastTraining,
            alert: !lastTraining || monthsSince >= input.months,
          };
        })
        .filter((r) => r.alert);
    }),
});
