import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  requirePermissionProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import { profiles } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { ExportService } from "~/server/lib/export-service";
import { TRPCError } from "@trpc/server";

// Simple in-memory queue for background exports
interface ExportJob {
  id: string;
  options: any;
  // RPT-05 : proprietaire du job. Sans ce champ, `export_...` etait devinable et
  // n'importe quel utilisateur authentifie de n'importe quelle agence pouvait
  // telecharger les donnees d'autrui : le tenant etait rompu sur ces deux
  // procedures, pas seulement l'ownership.
  userId: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: Buffer;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Recuperation d'un job avec controle d'ownership ET de tenant.
 *
 * NOT_FOUND (et non FORBIDDEN) quand le job appartient a quelqu'un d'autre :
 * repondre "interdit" confirmerait l'existence du job et son identifiant.
 */
function exigerJobProprietaire(jobId: string, ctx: { user: { id: string; agenceId: number | null } }): ExportJob {
  const job = exportQueue.get(jobId);
  if (
    !job ||
    job.userId !== ctx.user.id ||
    job.options?.organizationId !== ctx.user.agenceId
  ) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Export job not found" });
  }
  return job;
}

const exportQueue: Map<string, ExportJob> = new Map();

export const exportRouter = createTRPCRouter({
  // RPT-05 : `requestExport` n'exigeait AUCUNE permission — n'importe quel profil
  // authentifie declenchait des exports ventes/stock/analytics. Le socle
  // definit deja `export.consulter`.
  requestExport: requirePermissionProcedure("export.consulter")
    .input(z.object({
      type: z.enum(["sales", "inventory", "analytics"]),
      format: z.enum(["csv", "pdf", "xlsx"]),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      posId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await db.select({ agenceId: profiles.agenceId })
        .from(profiles)
        .where(eq(profiles.id, Number(ctx.user.id)))
        .limit(1);

      if (!profile.length || !profile[0]!.agenceId) {
        throw new Error("Organization not found");
      }

      const jobId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const job: ExportJob = {
        id: jobId,
        options: {
          ...input,
          organizationId: profile[0]!.agenceId,
        },
        userId: String(ctx.user.id),
        status: "pending",
        createdAt: new Date(),
      };

      exportQueue.set(jobId, job);

      // Process the job asynchronously
      setTimeout(() => processExportJob(jobId), 100);

      return { jobId, status: "pending" };
    }),

  getExportStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ ctx, input }) => {
      const job = exigerJobProprietaire(input.jobId, ctx);

      return {
        jobId: job.id,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        error: job.error,
      };
    }),

  downloadExport: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ ctx, input }) => {
      const job = exigerJobProprietaire(input.jobId, ctx);

      if (job.status !== "completed") {
        throw new Error("Export not ready yet");
      }

      if (!job.result) {
        throw new Error("Export data not available");
      }

      // Return the file data
      return {
        data: job.result.toString("base64"),
        filename: `export_${job.options.type}_${job.id}.${job.options.format}`,
        mimeType: getMimeType(job.options.format),
      };
    }),
});

async function processExportJob(jobId: string) {
  const job = exportQueue.get(jobId);
  if (!job) return;

  job.status = "processing";

  try {
    const result = await ExportService.generateExport(job.options);
    job.result = result;
    job.status = "completed";
    job.completedAt = new Date();
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Unknown error";
    job.completedAt = new Date();
  }
}

function getMimeType(format: string): string {
  switch (format) {
    case "csv":
      return "text/csv";
    case "pdf":
      return "application/pdf";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}