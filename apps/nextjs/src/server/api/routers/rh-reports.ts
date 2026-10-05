import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { buildPersonnelRows, type PersonnelReportRow } from "~/server/lib/rh-reports-engine";
import { TRPCError } from "@trpc/server";

/**
 * R9 — Rapports RH.
 * La seule procédure nouvelle de la phase : `personnel` (rapport structuré, colonnes configurables).
 * Elle partage EXACTEMENT la source de données de `rhDashboard.exportEmployes` via
 * `buildPersonnelRows` (périmètre agence + masquage salaire identiques).
 * Tous les autres rapports (Présences / Paie / Avances / Historique) consomment les
 * procédures existantes : `rhPeriode.situation`, `rhHistory.etatDate`, `rh.list`.
 */

export const rhReportsRouter = createTRPCRouter({
  personnel: requirePermissionProcedure("rh.employe.consulter")
    .input(
      z
        .object({
          search: z.string().optional(),
          statut: z.string().optional(),
          departmentId: z.string().optional(),
          employeIds: z.array(z.number().int()).max(200).optional(),
          exclureArchives: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }): Promise<{ rows: PersonnelReportRow[]; canSeeSalary: boolean; total: number }> => {
      const { rows, canSeeSalary } = await buildPersonnelRows(ctx.user.id, ctx.user.agenceId, { ...(input ?? {}), role: ctx.user.role });
      if (rows.length > 1000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Trop de résultats (plus de 1000). Affinez les filtres." });
      }
      return { rows, canSeeSalary, total: rows.length };
    }),
});