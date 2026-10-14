import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { hrSensibilisationRules } from "@atelierone/db";
import {
  chargerDonneesRapport,
  canSeeSalary,
  trierRowsRapport,
  type EmployeeReportRow,
  type FiltresRapport,
  construireJoursEmploye,
} from "~/server/lib/rh-centre-rapports";
import { analyserPeriode } from "~/server/lib/rh-stats-engine";
import { segmenterSalaires } from "~/server/lib/rh-situation-engine";
import {
  normaliserRegles,
  calculerIndicateursEquipe,
  calculerIndicateursSensibilisation,
  reglesManquantes,
  appliquerMasquageSalaire,
  type IndicateurSensibilisation,
  type RegleSensibilisation,
} from "~/server/lib/rh-sensibilisation-engine";
import {
  EVENT_PAGE_SIZE_MAX,
  normaliserColumns,
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

  const COLONNES_RAPPORT = [
    "employeeId", "matricule", "nom", "prenom", "departement", "fonction", "posteSegments", "statut", "mode",
    "dateEmbauche", "dateFinContrat", "dateSortie",
    "joursTheoriques", "joursPresence", "joursAbsence", "joursAbsents", "joursConges", "joursMuets",
    "heuresTheoriques", "heuresAttendues", "heuresTravaillees", "heuresNormales", "heuresSupp",
    "retardTotalMinutes", "departAnticipeTotalMinutes", "tauxPresence", "tauxPresenceHeures",
    "masseAcquise", "baseContractuelle", "gains", "retenues", "totalNet", "netLabel", "tauxHoraire",
    "bulletinExiste", "segmentsSalaires", "avancePeriode", "recuperePeriode", "soldeFinPeriode",
    "soldeActuel", "nbAvances", "anomalieCount", "anomalies", "salariesVisible",
  ] as const;

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
        columns: z.array(z.enum(COLONNES_RAPPORT)).optional(),
        sort: z.enum(SORT_RAPPORT).optional(),
        dir: z.enum(["asc", "desc"]).optional(),
        page: z.number().int().optional(),
        pageSize: z.number().int().optional(),
        eventPage: z.number().int().optional(),
        eventPageSize: z.number().int().optional(),
        includeSensibilisation: z.boolean().optional(),
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
        columns: input.columns,
      };

      const { sort, dir } = normaliserTri(input.sort, input.dir, canSee, SORT_RAPPORT);
      const columns = normaliserColumns(input.columns, canSee);
      const rowPage = normaliserPagination(input.page, input.pageSize, 50, PAGE_SIZE_MAX);
      const evPage = normaliserPagination(
        input.eventPage,
        input.eventPageSize,
        200,
        EVENT_PAGE_SIZE_MAX
      );

      const charge = await chargerDonneesRapport(ctx, input.from, input.to, {
        ...filtres,
        columns,
      });

      const triees = trierRowsRapport(charge.rows, sort, dir);
      const debutRow = (rowPage.page - 1) * rowPage.pageSize;
      const rows = triees.slice(debutRow, debutRow + rowPage.pageSize);

      // Appliquer le filtre de colonnes si demandé
      const rowsFiltrees = columns
        ? rows.map((row) => {
            const filtered: Record<string, unknown> = {};
            const rowObj = row as unknown as Record<string, unknown>;
            for (const col of columns) {
              if (col in rowObj) {
                filtered[col] = rowObj[col];
              }
            }
            return filtered as unknown as EmployeeReportRow;
          })
        : rows;

      const debutEvent = (evPage.page - 1) * evPage.pageSize;

      // ── 4. Sensibilisation (optionnel, meme lecture batch) ──
      let sensibilisation: {
        equipe: ReturnType<typeof calculerIndicateursEquipe>;
        salariesVisible: boolean;
        reglesManquantes: string[];
        regles: RegleSensibilisation[];
        rows: IndicateurSensibilisation[];
      } | null = null;

      if (input.includeSensibilisation) {
        const reglesBrutes = await db
          .select()
          .from(hrSensibilisationRules)
          .where(eq(hrSensibilisationRules.agenceId, ctx.user.agenceId));
        const regles = normaliserRegles(reglesBrutes);

        const indicateurs: IndicateurSensibilisation[] = charge.situation.employees.map((emp) => {
          const jours = construireJoursEmploye(emp, charge.situation);
          const segments = segmenterSalaires({
            fiche: {
              baseSalary: emp.salaireBase,
              modePaie: emp.modePaie,
              forfaitHebdomadaire: emp.forfaitHebdomadaire,
            },
            historique: charge.situation.histoByEmploye.get(emp.id) ?? [],
            from: charge.situation.from,
            to: charge.situation.to,
          });
          return calculerIndicateursSensibilisation({
            employe: emp,
            jours,
            analyse: analyserPeriode(jours),
            calcs: charge.situation.calcsByEmploye.get(emp.id) ?? [],
            segments,
            absences: charge.situation.absencesByEmploye.get(emp.id) ?? [],
            donnees: charge.situation,
            regles,
          });
        });

        sensibilisation = {
          equipe: calculerIndicateursEquipe(indicateurs),
          salariesVisible: canSee,
          reglesManquantes: reglesManquantes(regles),
          regles,
          rows: indicateurs.map((r) => appliquerMasquageSalaire(r, canSee)),
        };
      }

      return {
        rows: rowsFiltrees as EmployeeReportRow[],
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
        sensibilisation,
      };
    }),
});