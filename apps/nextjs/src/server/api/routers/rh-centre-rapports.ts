import { z } from "zod";

import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import {
  chargerDonneesRapport,
  canSeeSalary,
  trierRowsRapport,
  type EmployeeReportRow,
  type FiltresRapport,
} from "~/server/lib/rh-centre-rapports";
import {
  EVENT_PAGE_SIZE_MAX,
  normaliserEmployeeIds,
  normaliserListe,
  normaliserPagination,
  normaliserSearch,
  normaliserTri,
  PAGE_SIZE_MAX,
  validerPeriodeRapport,
} from "~/server/lib/rh-centre-rapports-input";

const SORT_RAPPORT = [
  "nom",
  "matricule",
  "departement",
  "fonction",
  "statut",
  "joursTheoriques",
  "joursPresence",
  "joursAbsence",
  "heuresTheoriques",
  "heuresTravaillees",
  "heuresSupp",
  "retardTotalMinutes",
  "tauxPresence",
  "masseAcquise",
  "totalNet",
  "avancePeriode",
  "soldeActuel",
] as const;

const TYPES_EVENEMENT = [
  "ABSENCE",
  "RETARD",
  "CONGE",
  "MALADIE",
  "ACCIDENT",
  "SITUATION_RH",
  "AUTRE",
] as const;

/**
 * Le schéma borne la forme ; la normalisation métier (plafonds reels, tri
 * salarial, population) est faite par `rh-centre-rapports-input`, jamais ici.
 */
const ListeEvenements = z.array(z.enum(TYPES_EVENEMENT)).max(TYPES_EVENEMENT.length);

export const rhCentreRapportsRouter = createTRPCRouter({
  rapport: requirePermissionProcedure("rh.presence.consulter")
    .input(
      z.object({
        from: z.string(),
        to: z.string(),
        employeId: z.number().int().optional(),
        employeIds: z.array(z.number().int()).optional(),
        departementId: z.number().int().optional(),
        statut: z.string().max(50).optional(),
        modePaie: z.string().max(50).optional(),
        contrat: z.enum(["CDD", "permanent"]).optional(),
        fonction: z.string().max(120).optional(),
        search: z.string().optional(),
        typesEvenement: ListeEvenements.optional(),
        sort: z.enum(SORT_RAPPORT).optional(),
        dir: z.enum(["asc", "desc"]).optional(),
        page: z.number().int().optional(),
        pageSize: z.number().int().optional(),
        eventPage: z.number().int().optional(),
        eventPageSize: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // ── 1. Periode : date reelle, ordre coherent, borne de charge ──
      validerPeriodeRapport(input.from, input.to);

      // ── 2. Droits : decides avant de lire quoi que ce soit ──
      const canSee = await canSeeSalary({ user: ctx.user });

      // ── 3. Population et filtres : revalides, jamais pris pour acquis ──
      const filtres: FiltresRapport = {
        employeId: input.employeId,
        employeIds: normaliserEmployeeIds(input.employeIds),
        departementId: input.departementId,
        statut: input.statut,
        modePaie: input.modePaie,
        contrat: input.contrat,
        fonction: input.fonction,
        search: normaliserSearch(input.search),
        typesEvenement: normaliserListe(input.typesEvenement, TYPES_EVENEMENT.length),
      };

      const { sort, dir } = normaliserTri(input.sort, input.dir, canSee, SORT_RAPPORT);
      const rowPage = normaliserPagination(input.page, input.pageSize, 50, PAGE_SIZE_MAX);
      const evPage = normaliserPagination(
        input.eventPage,
        input.eventPageSize,
        200,
        EVENT_PAGE_SIZE_MAX
      );

      const charge = await chargerDonneesRapport(ctx, input.from, input.to, filtres);

      const triees = trierRowsRapport(charge.rows, sort, dir);
      const debutRow = (rowPage.page - 1) * rowPage.pageSize;
      const rows = triees.slice(debutRow, debutRow + rowPage.pageSize);

      const debutEvent = (evPage.page - 1) * evPage.pageSize;

      return {
        rows: rows as EmployeeReportRow[],
        rowPagination: {
          page: rowPage.page,
          pageSize: rowPage.pageSize,
          total: triees.length,
          totalPages: Math.max(1, Math.ceil(triees.length / rowPage.pageSize)),
        },
        events: charge.events.slice(debutEvent, debutEvent + evPage.pageSize),
        eventPagination: {
          page: evPage.page,
          pageSize: evPage.pageSize,
          total: charge.events.length,
          totalPages: Math.max(1, Math.ceil(charge.events.length / evPage.pageSize)),
        },
        summary: charge.summary,
        methodology: charge.methodology,
        permissions: {
          salariesVisible: charge.methodology.salariesVisible,
          canConsultSalary: charge.summary.salariesVisible,
        },
      };
    }),
});