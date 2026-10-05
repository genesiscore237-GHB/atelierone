import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  advanceTransitions,
  employes,
  payrollEntries,
} from "@atelierone/db";

import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  agregerLignes,
  calculerEtatPeriode,
  classifierJourDetail,
  construireOrigine,
  modeNormaliseSegments,
  resumerAnomalies,
  SORT_SITUATION_WHITELIST,
  trierLignes,
  type JourDetail,
  type LigneSituation,
  type OrigineValeur,
} from "~/server/lib/rh-situation-engine";
import { toCsv } from "~/server/lib/rh-stats-engine";
import type { projeterPaie } from "~/server/lib/rh-situation-engine";
import { normaliserModePaie, type PayMode } from "~/server/lib/payroll-engine";
import {
  analyserPresenceEmploye,
  canSeeSalary,
  chargerSituation,
  construireLigne,
  dateStr,
  jourOuvrePour,
  projectionEmploye,
  validerPeriode,
  type SaisieBrute,
} from "~/server/lib/rh-centre-rapports";

// ─── Router ───

export const rhPeriodeRouter = createTRPCRouter({
  situation: rhProcedure
    .input(
      z.object({
        from: dateStr(),
        to: dateStr(),
        employeId: z.number().int().optional(),
        departementId: z.number().int().optional(),
        statut: z.string().optional(),
        modePaie: z.string().optional(),
        search: z.string().max(120).optional(),
        sort: z.enum(SORT_SITUATION_WHITELIST).optional(),
        dir: z.enum(["asc", "desc"]).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(10).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      validerPeriode(input.from, input.to);
      const canSee = await canSeeSalary({ user: ctx.user });
      if (input.sort === "net" && !canSee) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le tri par net est réservé aux profils habilités (rh.salaire.consulter)." });
      }

      const d = await chargerSituation(ctx, input.from, input.to, {
        employeId: input.employeId,
        departementId: input.departementId,
        statut: input.statut,
        modePaie: input.modePaie,
        search: input.search,
      });

      const lignes: LigneSituation[] = d.employees.map((emp) => construireLigne(emp, d, canSee));
      const triees = trierLignes(lignes, input.sort ?? "nom", input.dir ?? "asc");

      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 50;
      const debut = (page - 1) * pageSize;

      return {
        rows: triees.slice(debut, debut + pageSize),
        total: triees.length,
        page,
        pageSize,
        aggregates: agregerLignes(lignes, canSee),
        anomaliesSummary: resumerAnomalies(lignes),
        periodState: calculerEtatPeriode({ from: input.from, to: input.to, payrollPeriods: d.payrollPeriods, summaries: d.summaries }),
      };
    }),

  employe: rhProcedure
    .input(z.object({ employeId: z.number().int(), from: dateStr(), to: dateStr() }))
    .query(async ({ ctx, input }) => {
      validerPeriode(input.from, input.to);
      const canSee = await canSeeSalary({ user: ctx.user });

      const [empCheck] = await db
        .select({ id: employes.id })
        .from(employes)
        .where(and(eq(employes.id, input.employeId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!empCheck) throw new TRPCError({ code: "NOT_FOUND", message: "Employé introuvable dans cette agence." });

      const d = await chargerSituation(ctx, input.from, input.to, { employeId: input.employeId });
      const employe = d.employees[0];
      if (!employe) throw new TRPCError({ code: "NOT_FOUND", message: "Employé absent du jeu de la période." });

      const ligne = construireLigne(employe, d, canSee);
      const analyse = analyserPresenceEmploye(employe, d);
      const saisies = d.saisiesByEmploye.get(employe.id) ?? new Map<string, SaisieBrute>();

      const timeline: JourDetail[] = [];
      const cursor = new Date(`${d.from}T12:00:00`);
      const fin = new Date(`${d.to}T12:00:00`);
      const calcByDate = new Map((d.calcsByEmploye.get(employe.id) ?? []).map((c) => [c.date, c]));
      while (cursor <= fin) {
        const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        const c = calcByDate.get(iso) ?? null;
        const saisie = saisies.get(iso) ?? null;
        timeline.push(
          classifierJourDetail({
            date: iso,
            isWorkingDay: jourOuvrePour(employe, iso, d),
            calc: c
              ? {
                  codePresence: c.codePresence,
                  isAbsent: c.isAbsent,
                  workedMinutes: c.workedMinutes,
                  normalMinutes: c.normalMinutes,
                  overtimeMinutes: c.overtimeMinutes,
                  lateMinutes: c.lateMinutes,
                  earlyDepartureMinutes: c.earlyDepartureMinutes,
                }
              : null,
            saisie,
            today: d.today,
          })
        );
        cursor.setDate(cursor.getDate() + 1);
      }

      const avancesLectures = d.advancesByEmploye.get(employe.id) ?? [];
      const avanceIds = avancesLectures.map((a) => a.id);
      const transitions = avanceIds.length
        ? await db
            .select({
              advanceId: advanceTransitions.advanceId,
              fromStatus: advanceTransitions.fromStatus,
              toStatus: advanceTransitions.toStatus,
              createdAt: advanceTransitions.createdAt,
            })
            .from(advanceTransitions)
            .where(inArray(advanceTransitions.advanceId, avanceIds))
        : [];

      const journal: Array<{ date: string; type: "VERSEMENT" | "RECUPERATION" | "TRANSITION"; montant: number | null; libelle: string; statut: string }> = [
        ...avancesLectures
          .filter((a) => a.dateVersement >= d.from && a.dateVersement <= d.to)
          .map((a) => ({ date: a.dateVersement, type: "VERSEMENT" as const, montant: a.montant, libelle: `Versement avance #${a.id}`, statut: a.statut ?? "VERSÉE" })),
        ...(d.recoveriesByEmp.get(employe.id) ?? [])
          .filter((r) => r.dateRecuperation >= d.from && r.dateRecuperation <= d.to)
          .map((r) => ({ date: r.dateRecuperation, type: "RECUPERATION" as const, montant: r.montant, libelle: `Récupération avance #${r.advanceId}`, statut: "RÉCUPÉRÉE" })),
        ...transitions
          .filter((t) => {
            const j = t.createdAt ? String(t.createdAt).slice(0, 10) : "";
            return j >= d.from && j <= d.to;
          })
          .map((t) => ({ date: t.createdAt ? String(t.createdAt).slice(0, 10) : "", type: "TRANSITION" as const, montant: null as number | null, libelle: `${t.fromStatus ?? "?"} → ${t.toStatus}`, statut: t.toStatus })),
      ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      let desc: ReturnType<typeof projeterPaie>["result"] | null = null;
      let origine: OrigineValeur[] = [];
      let bulletinRow: { id: number; periodeDebut: string; periodeFin: string; brut: number; net: number; statut: string } | null = null;

      if (canSee && ligne.salaires) {
        const mode = (ligne.salaires.segments.length ? modeNormaliseSegments(ligne.salaires.segments) : null) ?? normaliserModePaie(employe.modePaie);
        const { projection, baseEffective } = projectionEmploye(employe, d, mode as PayMode);
        desc = projection.result;

        const evenementsParCode: Record<string, string[]> = {};
        for (const item of d.items) {
          if (item.method === "absent_days") {
            evenementsParCode[item.code] = (d.calcsByEmploye.get(employe.id) ?? [])
              .filter((c) => c.isAbsent && c.date >= d.from && c.date <= d.to)
              .map((c) => c.date);
          }
          if (item.method === "advance_recovery") {
            evenementsParCode[item.code] = (d.recoveriesByEmp.get(employe.id) ?? [])
              .filter((r) => r.dateRecuperation >= d.from && r.dateRecuperation <= d.to)
              .map((r) => r.dateRecuperation);
          }
        }
        origine = construireOrigine(projection.result, { baseSalary: baseEffective, evenementsParCode });

        const bb = d.bulletinByEmp.get(employe.id) ?? null;
        if (bb) {
          const p = d.payrollPeriods.find((x) => x.id === bb.periodId);
          const [e] = await db
            .select({ id: payrollEntries.id, netPay: payrollEntries.netPay, totalEarnings: payrollEntries.totalEarnings, status: payrollEntries.status })
            .from(payrollEntries)
            .where(and(eq(payrollEntries.employeeId, employe.id), eq(payrollEntries.periodId, bb.periodId)))
            .limit(1);
          if (e && p) {
            bulletinRow = {
              id: e.id,
              periodeDebut: p.startDate,
              periodeFin: p.endDate,
              brut: Number(e.totalEarnings ?? 0),
              net: Number(e.netPay ?? 0),
              statut: e.status ?? "prepare",
            };
          }
        }
      }

      return {
        employe: {
          employeeId: employe.id,
          matricule: employe.matricule,
          prenom: employe.prenom,
          nom: employe.nom,
          statut: employe.statut,
          dateEmbauche: employe.dateEmbauche,
          dateSortie: employe.dateSortie,
          departement: employe.departement,
          contrat: {
            type: employe.dateFinContrat ? "CDD" : "permanent",
            dateDebut: employe.dateEmbauche,
            dateFin: employe.dateFinContrat,
            statut: employe.statut,
          },
        },
        segmentsSalaires: ligne.salaires?.segments ?? [],
        presence: analyse,
        timeline,
        avances: {
          row: ligne.avances ?? { avancePeriode: 0, recuperePeriode: 0, soldeFinPeriode: 0, soldeActuel: 0, nbAvances: 0 },
          journal,
        },
        paie: {
          baseContractuelle: ligne.salaires?.baseContractuelle ?? null,
          gains: ligne.salaires?.gains ?? null,
          retenues: ligne.salaires?.retenues ?? null,
          net: ligne.salaires?.net ?? null,
          netLabel: ligne.salaires?.netLabel ?? "ESTIME",
          description: desc,
          bulletin: bulletinRow,
          origine,
        },
        anomalies: ligne.anomalies,
      };
    }),

  export: requirePermissionProcedure("rh.presence.consulter")
    .input(
      z.object({
        from: dateStr(),
        to: dateStr(),
        employeId: z.number().int().optional(),
        departementId: z.number().int().optional(),
        statut: z.string().optional(),
        modePaie: z.string().optional(),
        search: z.string().max(120).optional(),
        sort: z.enum(SORT_SITUATION_WHITELIST).optional(),
        dir: z.enum(["asc", "desc"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      validerPeriode(input.from, input.to);
      const canSee = await canSeeSalary({ user: ctx.user });

      const d = await chargerSituation(ctx, input.from, input.to, {
        employeId: input.employeId,
        departementId: input.departementId,
        statut: input.statut,
        modePaie: input.modePaie,
        search: input.search,
      });
      const lignes = trierLignes(d.employees.map((emp) => construireLigne(emp, d, canSee)), input.sort ?? "nom", input.dir ?? "asc");

      const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(Math.round(n * 100) / 100));
      const header = [
        "Matricule",
        "Nom",
        "Prénom",
        "Département",
        "Statut",
        "Mode",
        "Jours théoriques",
        "Jours présents",
        "Jours absents",
        "Jours congés",
        "Heures théoriques",
        "Heures travaillées",
        "Heures sup",
        "Retard (min)",
        "Taux présence",
        "Base contractuelle",
        "Gains",
        "Retenues",
        "Net",
        "Avances versées",
        "Récupéré",
        "Solde fin période",
        "Solde actuel",
      ];
      const rows = lignes.map((l) => [
        l.matricule,
        l.nom,
        l.prenom ?? "",
        l.departement ?? "",
        l.statut ?? "",
        l.mode ?? "",
        l.joursTheoriques,
        l.joursPresence,
        l.joursAbsence,
        l.joursConges,
        l.heuresTheoriques,
        l.heuresTravaillees,
        l.heuresSupp,
        l.retardTotalMinutes,
        l.tauxPresence ?? "",
        canSee ? fmt(l.salaires?.baseContractuelle) : "",
        canSee ? fmt(l.salaires?.gains) : "",
        canSee ? fmt(l.salaires?.retenues) : "",
        canSee ? fmt(l.salaires?.net) : "",
        canSee ? fmt(l.avances?.avancePeriode) : "",
        canSee ? fmt(l.avances?.recuperePeriode) : "",
        canSee ? fmt(l.avances?.soldeFinPeriode) : "",
        canSee ? fmt(l.avances?.soldeActuel) : "",
      ]);
      return toCsv(header, rows as Array<Array<string | number | null>>);
    }),
});