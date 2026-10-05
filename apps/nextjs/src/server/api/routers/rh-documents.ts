import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  hrDocumentTypes,
  documentsEmployes,
  employes,
  utilisateurs,
} from "@atelierone/db";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { expiryAlerts, expiryStatus } from "~/server/lib/documents-engine";
import { assertEmployeEnAgence } from "~/server/lib/rh-scope";

/** RH-08 — Documents RH (types paramétrables, upload, alertes expiration) */
export const rhDocumentsRouter = createTRPCRouter({
  // ─── Types de documents (paramétrables) ───
  listDocumentTypes: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(hrDocumentTypes)
      .where(eq(hrDocumentTypes.agenceId, ctx.user.agenceId))
      .orderBy(hrDocumentTypes.name);
  }),

  createDocumentType: requirePermissionProcedure("rh.document.modifier")
    .input(z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      hasExpiration: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select({ id: hrDocumentTypes.id })
        .from(hrDocumentTypes)
        .where(and(eq(hrDocumentTypes.agenceId, ctx.user.agenceId), eq(hrDocumentTypes.code, input.code)))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Le type « ${input.code} » existe déjà.` });
      }
      const [row] = await db
        .insert(hrDocumentTypes)
        .values({ ...input, agenceId: ctx.user.agenceId } as any)
        .returning();
      return row;
    }),

  updateDocumentType: requirePermissionProcedure("rh.document.modifier")
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).optional(),
      hasExpiration: z.boolean().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await db.update(hrDocumentTypes).set(rest as any).where(eq(hrDocumentTypes.id, id));
      return { success: true };
    }),

  deleteDocumentType: requirePermissionProcedure("rh.document.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(hrDocumentTypes).where(eq(hrDocumentTypes.id, input.id));
      return { success: true };
    }),

  // ─── Documents employés ───
  listDocuments: rhProcedure
    .input(z.object({
      employeId: z.number().int().optional(),
      documentTypeId: z.number().int().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.employeId) conditions.push(eq(documentsEmployes.employeId, safe.employeId));
      if (safe.documentTypeId) conditions.push(eq(documentsEmployes.documentTypeId, safe.documentTypeId));
      const rows = await db
        .select({
          id: documentsEmployes.id,
          employeId: documentsEmployes.employeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          documentTypeId: documentsEmployes.documentTypeId,
          typeDocument: documentsEmployes.typeDocument,
          typeName: hrDocumentTypes.name,
          typeHasExpiration: hrDocumentTypes.hasExpiration,
          titre: documentsEmployes.titre,
          fichierUrl: documentsEmployes.fichierUrl,
          dateEmission: documentsEmployes.dateEmission,
          dateExpiration: documentsEmployes.dateExpiration,
          statut: documentsEmployes.statut,
          uploadedBy: documentsEmployes.uploadedBy,
          uploaderName: utilisateurs.nom,
          uploaderPrenom: utilisateurs.prenom,
          notes: documentsEmployes.notes,
          createdAt: documentsEmployes.createdAt,
        })
        .from(documentsEmployes)
        .innerJoin(employes, eq(documentsEmployes.employeId, employes.id))
        .leftJoin(hrDocumentTypes, eq(documentsEmployes.documentTypeId, hrDocumentTypes.id))
        .leftJoin(utilisateurs, eq(documentsEmployes.uploadedBy, utilisateurs.id))
        .where(and(...conditions))
        .orderBy(desc(documentsEmployes.createdAt));

      const filtered = safe.search
        ? rows.filter(
            (r) =>
              `${r.employePrenom} ${r.employeNom}`.toLowerCase().includes(safe.search!.toLowerCase()) ||
              (r.titre ?? "").toLowerCase().includes(safe.search!.toLowerCase()) ||
              (r.typeName ?? r.typeDocument ?? "").toLowerCase().includes(safe.search!.toLowerCase())
          )
        : rows;

      const today = new Date();
      return filtered.map((r) => {
        const status = expiryStatus(
          r.dateExpiration ? String(r.dateExpiration) : null,
          !!r.typeHasExpiration,
          today
        );
        return { ...r, dateExpiration: r.dateExpiration ? String(r.dateExpiration) : null, expiryStatus: status };
      });
    }),

  createDocument: requirePermissionProcedure("rh.document.modifier")
    .input(z.object({
      employeId: z.number().int(),
      documentTypeId: z.number().int(),
      titre: z.string().optional(),
      fichierUrl: z.string().min(1),
      dateEmission: z.string().optional(),
      dateExpiration: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeId, ctx.user.agenceId);
      const [type] = await db
        .select()
        .from(hrDocumentTypes)
        .where(and(eq(hrDocumentTypes.id, input.documentTypeId), eq(hrDocumentTypes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!type) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Type de document introuvable." });
      }
      const [row] = await db
        .insert(documentsEmployes)
        .values({
          employeId: input.employeId,
          documentTypeId: type.id,
          typeDocument: type.code,
          titre: input.titre ?? type.name,
          fichierUrl: input.fichierUrl,
          dateEmission: input.dateEmission ?? null,
          dateExpiration: input.dateExpiration ?? null,
          uploadedBy: ctx.user.id,
          notes: input.notes ?? null,
        } as any)
        .returning();
      return row;
    }),

  updateDocument: requirePermissionProcedure("rh.document.modifier")
    .input(z.object({
      id: z.number().int(),
      titre: z.string().optional(),
      fichierUrl: z.string().optional(),
      dateEmission: z.string().nullable().optional(),
      dateExpiration: z.string().nullable().optional(),
      statut: z.string().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [doc] = await db
        .select({ id: documentsEmployes.id })
        .from(documentsEmployes)
        .innerJoin(employes, eq(documentsEmployes.employeId, employes.id))
        .where(and(eq(documentsEmployes.id, input.id), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document introuvable." });
      const { id, ...rest } = input;
      const values: any = { ...rest, updatedAt: new Date() };
      await db.update(documentsEmployes).set(values).where(eq(documentsEmployes.id, id));
      return { success: true };
    }),

  deleteDocument: requirePermissionProcedure("rh.document.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [doc] = await db
        .select({ id: documentsEmployes.id })
        .from(documentsEmployes)
        .innerJoin(employes, eq(documentsEmployes.employeId, employes.id))
        .where(and(eq(documentsEmployes.id, input.id), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document introuvable." });
      await db.delete(documentsEmployes).where(eq(documentsEmployes.id, input.id));
      return { success: true };
    }),

  // ─── Alertes d'expiration ───
  getExpirationAlerts: rhProcedure
    .input(z.object({ alertDays: z.number().int().min(1).max(180).default(30) }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: documentsEmployes.id,
          employeId: documentsEmployes.employeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          documentTypeId: documentsEmployes.documentTypeId,
          typeName: hrDocumentTypes.name,
          typeHasExpiration: hrDocumentTypes.hasExpiration,
          titre: documentsEmployes.titre,
          dateExpiration: documentsEmployes.dateExpiration,
          statut: documentsEmployes.statut,
          fichierUrl: documentsEmployes.fichierUrl,
        })
        .from(documentsEmployes)
        .innerJoin(employes, eq(documentsEmployes.employeId, employes.id))
        .leftJoin(hrDocumentTypes, eq(documentsEmployes.documentTypeId, hrDocumentTypes.id))
        .where(and(eq(documentsEmployes.statut, "actif"), eq(employes.agenceId, ctx.user.agenceId)));

      const today = new Date();
      const alerts = expiryAlerts(
        rows.map((r) => ({
          id: r.id,
          documentTypeId: r.documentTypeId,
          titre: r.titre,
          dateExpiration: r.dateExpiration ? String(r.dateExpiration) : null,
          hasExpiration: !!r.typeHasExpiration,
          statut: r.statut,
        })),
        today,
        input.alertDays
      );

      const byId = new Map(rows.map((r) => [r.id, r]));
      return alerts.map((a) => ({
        ...a,
        employeNom: byId.get(a.documentId)?.employeNom,
        employePrenom: byId.get(a.documentId)?.employePrenom,
        typeName: byId.get(a.documentId)?.typeName,
        fichierUrl: byId.get(a.documentId)?.fichierUrl,
      }));
    }),
});
