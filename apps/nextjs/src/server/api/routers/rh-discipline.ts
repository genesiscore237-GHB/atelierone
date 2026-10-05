import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  sanctions,
  employes,
  hrSanctionTypes,
  hrGeneralSettings,
  utilisateurs,
  positions,
} from "@atelierone/db";
import { eq, and, desc, like, inArray, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { detectRecidivism, severityLabel } from "~/server/lib/disciplinary-engine";
import { assertEmployeEnAgence } from "~/server/lib/rh-scope";

/** RH-07 — Disciplinaire (records, dossier employé, récidive) */
export const rhDisciplineRouter = createTRPCRouter({
  // ─── Types de sanctions (RH-00, lecture) ───
  listSanctionTypes: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(hrSanctionTypes)
      .where(eq(hrSanctionTypes.agenceId, ctx.user.agenceId))
      .orderBy(hrSanctionTypes.severityLevel);
  }),

  // ─── Paramètre de période glissante ───
  getSettings: rhProcedure.query(async ({ ctx }) => {
    const [settings] = await db
      .select({ disciplinaryWindowMonths: hrGeneralSettings.disciplinaryWindowMonths })
      .from(hrGeneralSettings)
      .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
      .limit(1);
    return { disciplinaryWindowMonths: settings?.disciplinaryWindowMonths ?? 12 };
  }),

  updateSettings: requirePermissionProcedure("rh.discipline.modifier")
    .input(z.object({ disciplinaryWindowMonths: z.number().int().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(hrGeneralSettings)
        .set({ disciplinaryWindowMonths: input.disciplinaryWindowMonths, updatedBy: ctx.user.id } as any)
        .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId));
      return { success: true };
    }),

  // ─── Records disciplinaires ───
  listRecords: rhProcedure
    .input(z.object({
      employeId: z.number().int().optional(),
      typeSanction: z.string().optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.employeId) conditions.push(eq(sanctions.employeId, safe.employeId));
      if (safe.typeSanction) conditions.push(eq(sanctions.typeSanction, safe.typeSanction));
      if (safe.dateDebut) conditions.push(gte(sanctions.dateSanction, safe.dateDebut));
      if (safe.dateFin) conditions.push(lte(sanctions.dateSanction, safe.dateFin));
      const rows = await db
        .select({
          id: sanctions.id,
          employeId: sanctions.employeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          typeSanction: sanctions.typeSanction,
          sanctionTypeId: sanctions.sanctionTypeId,
          sanctionTypeName: hrSanctionTypes.name,
          severityLevel: hrSanctionTypes.severityLevel,
          motif: sanctions.motif,
          gravite: sanctions.gravite,
          dateSanction: sanctions.dateSanction,
          dateDebutEffet: sanctions.dateDebutEffet,
          dateFinEffet: sanctions.dateFinEffet,
          dureeJours: sanctions.dureeJours,
          detailsFinanciers: sanctions.detailsFinanciers,
          decision: sanctions.decision,
          notifiedAt: sanctions.notifiedAt,
          documentUrl: sanctions.documentUrl,
          appliquee: sanctions.appliquee,
          validePar: sanctions.validePar,
          createdBy: sanctions.createdBy,
          createdAt: sanctions.createdAt,
        })
        .from(sanctions)
        .innerJoin(employes, eq(sanctions.employeId, employes.id))
        .leftJoin(hrSanctionTypes, eq(sanctions.sanctionTypeId, hrSanctionTypes.id))
        .where(and(...conditions))
        .orderBy(desc(sanctions.dateSanction));
      const filtered = safe.search
        ? rows.filter(
            (r) =>
              r.employeNom.toLowerCase().includes(safe.search!.toLowerCase()) ||
              r.employePrenom.toLowerCase().includes(safe.search!.toLowerCase()) ||
              (r.sanctionTypeName ?? r.typeSanction).toLowerCase().includes(safe.search!.toLowerCase())
          )
        : rows;
      return filtered.map((r) => ({
        ...r,
        severityLabel: r.severityLevel != null ? severityLabel(r.severityLevel) : null,
      }));
    }),

  createRecord: requirePermissionProcedure("rh.discipline.modifier")
    .input(z.object({
      employeId: z.number().int(),
      sanctionTypeId: z.number().int(), // lien RH-00
      motif: z.string().min(1),
      dateSanction: z.string().min(1),
      dateDebutEffet: z.string().optional(),
      dateFinEffet: z.string().optional(),
      dureeJours: z.number().optional(),
      detailsFinanciers: z.number().optional(),
      decision: z.string().default("notifiee"),
      notifiedAt: z.string().optional(),
      documentUrl: z.string().optional(),
      appliquee: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeId, ctx.user.agenceId);
      const [type] = await db
        .select()
        .from(hrSanctionTypes)
        .where(and(eq(hrSanctionTypes.id, input.sanctionTypeId), eq(hrSanctionTypes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!type) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Type de sanction introuvable (RH-00)." });
      }
      const [row] = await db
        .insert(sanctions)
        .values({
          employeId: input.employeId,
          sanctionTypeId: type.id,
          typeSanction: type.code,
          motif: input.motif,
          gravite: severityLabel(type.severityLevel ?? 1),
          dateSanction: input.dateSanction,
          dateDebutEffet: input.dateDebutEffet ?? null,
          dateFinEffet: input.dateFinEffet ?? null,
          dureeJours: input.dureeJours ? String(input.dureeJours) : null,
          detailsFinanciers: input.detailsFinanciers ? String(input.detailsFinanciers) : null,
          decision: input.decision,
          notifiedAt: input.notifiedAt ? new Date(input.notifiedAt) : input.decision === "notifiee" ? new Date() : null,
          documentUrl: input.documentUrl ?? null,
          appliquee: input.appliquee,
          createdBy: ctx.user.id,
        } as any)
        .returning();
      return row;
    }),

  updateRecord: requirePermissionProcedure("rh.discipline.modifier")
    .input(z.object({
      id: z.number().int(),
      motif: z.string().optional(),
      decision: z.string().optional(),
      notifiedAt: z.string().nullable().optional(),
      documentUrl: z.string().nullable().optional(),
      appliquee: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // N01 : la sanction doit appartenir à un employé de l'agence courante
      const [sanction] = await db
        .select({ id: sanctions.id })
        .from(sanctions)
        .innerJoin(employes, eq(sanctions.employeId, employes.id))
        .where(and(eq(sanctions.id, input.id), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!sanction) throw new TRPCError({ code: "NOT_FOUND", message: "Sanction introuvable." });
      const { id, ...rest } = input;
      const values: any = { ...rest, updatedAt: new Date() };
      if (rest.notifiedAt !== undefined) values.notifiedAt = rest.notifiedAt ? new Date(rest.notifiedAt) : null;
      if (rest.documentUrl !== undefined) values.documentUrl = rest.documentUrl;
      await db.update(sanctions).set(values).where(eq(sanctions.id, id));
      return { success: true };
    }),

  deleteRecord: requirePermissionProcedure("rh.discipline.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [sanction] = await db
        .select({ id: sanctions.id })
        .from(sanctions)
        .innerJoin(employes, eq(sanctions.employeId, employes.id))
        .where(and(eq(sanctions.id, input.id), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!sanction) throw new TRPCError({ code: "NOT_FOUND", message: "Sanction introuvable." });
      await db.delete(sanctions).where(eq(sanctions.id, input.id));
      return { success: true };
    }),

  // ─── Dossier disciplinaire d'un employé ───
  getEmployeeDossier: rhProcedure
    .input(z.object({ employeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [emp] = await db
        .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom, statut: employes.statut })
        .from(employes)
        .where(and(eq(employes.id, input.employeId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employé introuvable." });

      const records = await db
        .select({
          id: sanctions.id,
          employeId: sanctions.employeId,
          typeSanction: sanctions.typeSanction,
          sanctionTypeId: sanctions.sanctionTypeId,
          sanctionTypeName: hrSanctionTypes.name,
          severityLevel: hrSanctionTypes.severityLevel,
          motif: sanctions.motif,
          dateSanction: sanctions.dateSanction,
          decision: sanctions.decision,
          notifiedAt: sanctions.notifiedAt,
          documentUrl: sanctions.documentUrl,
          appliquee: sanctions.appliquee,
          createdBy: sanctions.createdBy,
          creatorName: utilisateurs.nom,
          creatorPrenom: utilisateurs.prenom,
          createdAt: sanctions.createdAt,
        })
        .from(sanctions)
        .leftJoin(hrSanctionTypes, eq(sanctions.sanctionTypeId, hrSanctionTypes.id))
        .leftJoin(utilisateurs, eq(sanctions.createdBy, utilisateurs.id))
        .where(eq(sanctions.employeId, input.employeId))
        .orderBy(desc(sanctions.dateSanction));

      const [settings] = await db
        .select({ disciplinaryWindowMonths: hrGeneralSettings.disciplinaryWindowMonths })
        .from(hrGeneralSettings)
        .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
        .limit(1);
      const months = settings?.disciplinaryWindowMonths ?? 12;

      const recidivism = detectRecidivism(
        records.map((r) => ({
          id: r.id,
          employeId: r.employeId,
          typeSanction: r.typeSanction,
          severityLevel: r.severityLevel ?? 1,
          dateSanction: String(r.dateSanction),
          decision: r.decision ?? "notifiee",
          appliquee: !!r.appliquee,
        })),
        new Date(),
        { months, minCount: 2 }
      );

      return {
        employe: { ...emp, fullName: `${emp.prenom} ${emp.nom}` },
        records: records.map((r) => ({
          ...r,
          dateSanction: String(r.dateSanction),
          severityLabel: r.severityLevel != null ? severityLabel(r.severityLevel) : null,
        })),
        recidivism,
        settings: { disciplinaryWindowMonths: months },
      };
    }),

  // ─── Vue d'ensemble (tous les dossiers) ───
  getOverview: rhProcedure.query(async ({ ctx }) => {
    const employees = await db
      .select({
        employeId: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
        statut: employes.statut,
        positionId: employes.positionId,
      })
      .from(employes)
      .where(eq(employes.agenceId, ctx.user.agenceId));

    const employeeIds = employees.map((e) => e.employeId);
    const countRows = employeeIds.length
      ? await db
          .select({
            employeId: sanctions.employeId,
            count: db.$count(sanctions, inArray(sanctions.employeId, employeeIds)).as("count"),
          })
          .from(sanctions)
          .where(inArray(sanctions.employeId, employeeIds))
          .groupBy(sanctions.employeId)
      : [];
    const countByEmp = new Map(countRows.map((r) => [r.employeId, Number(r.count)]));

    const positionIds = [...new Set(employees.map((e) => e.positionId).filter(Boolean))];
    const positionRows = positionIds.length
      ? await db
          .select({ id: positions.id, name: positions.name })
          .from(positions)
          .where(inArray(positions.id, positionIds))
      : [];
    const posByName = new Map(positionRows.map((p) => [p.id, p.name]));

    return employees.map((e) => ({
      employeId: e.employeId,
      nom: e.nom,
      prenom: e.prenom,
      statut: e.statut,
      positionName: e.positionId != null ? posByName.get(e.positionId) ?? null : null,
      recordsCount: countByEmp.get(e.employeId) ?? 0,
    }));
  }),
});
