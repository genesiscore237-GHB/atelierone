import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  employes,
  payrollPeriods,
  payrollItemsConfig,
  payrollItemConfigHistory,
  payrollEntries,
  payrollEntryLines,
  attendanceMonthlySummaries,
  attendanceCalculations,
  attendanceEntries,
  hrGeneralSettings,
  hrPublicHolidays,
  employeeAdvances,
  advanceRecoveries,
  advanceTransitions,
  employeeSalaryHistory,
  employeeStatusHistory,
  auditLogs,
  payrollEntrySnapshots,
  utilisateurs,
} from "@atelierone/db";
import { eq, and, desc, gte, lte, inArray, or, isNull, sql, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  calculatePayroll,
  calculerProrata,
  baseEffectifPeriode,
  calculerForfaitPeriode,
  normaliserModePaie,
  semainesDansPeriode,
  joursOuvres,
  regimeSuspensionEnPeriode,
  veilleDe,
  peutPreparer,
  peutCloturer,
  peutAjuster,
  peutPayer,
  type PayrollConfigItem,
} from "~/server/lib/payroll-engine";
import { apresRecuperation, estEligibleRecuperationPaie, montantRecuperationPaie } from "~/server/lib/avances-engine";
import { prochaineVersion } from "~/server/lib/rh-snapshots";
import { regimeSituationPeriode } from "~/server/lib/situations-engine";
import { chargerSituationsActives } from "~/server/lib/situations-db";

/**
 * P13 — Archive l'état courant d'un bulletin (entité + lignes) avant toute
 * régénération : l'historique antérieur reste rejouable (tableau versionné).
 * DELETE+INSERT conservé sur l'état actif mais non destructif.
 */
async function archiverBulletin(agenceId: number, entryId: number, raison: "recalcul" | "adjustment", userId: number) {
  const [entry] = await db
    .select()
    .from(payrollEntries)
    .where(eq(payrollEntries.id, entryId))
    .limit(1);
  if (!entry) return;
  const lines = await db
    .select()
    .from(payrollEntryLines)
    .where(eq(payrollEntryLines.payrollEntryId, entryId))
    .orderBy(payrollEntryLines.sortOrder);
  const versions = (await db
    .select({ v: payrollEntrySnapshots.version })
    .from(payrollEntrySnapshots)
    .where(eq(payrollEntrySnapshots.payrollEntryId, entryId))).map((r) => r.v);
  await db.insert(payrollEntrySnapshots).values({
    agenceId,
    payrollEntryId: entryId,
    version: prochaineVersion(versions),
    periodId: entry.periodId,
    employeeId: entry.employeeId,
    baseSalary: entry.baseSalary,
    netPay: entry.netPay,
    status: entry.status,
    entityJson: entry,
    linesJson: lines,
    raison,
    createdBy: userId,
  } as any);
}

/** Agrégation des présences d'un seul employé sur un intervalle (prorata de sortie : bornée à la période effective). */
async function agregerPresencesEmploye(employeeId: number, debut: string, fin: string) {
  const rows = await db
    .select({
      normalMinutes: sql<number>`COALESCE(SUM(${attendanceCalculations.normalMinutes}), 0)`,
      overtimeMinutes: sql<number>`COALESCE(SUM(${attendanceCalculations.overtimeMinutes}), 0)`,
      taskBonus: sql<number>`COALESCE(SUM(${attendanceEntries.taskBonus}), 0)`,
      daysPresent: sql<number>`COUNT(*) FILTER (WHERE ${attendanceCalculations.isAbsent} = false)`,
      daysAbsent: sql<number>`COUNT(*) FILTER (WHERE ${attendanceCalculations.isAbsent} = true)`,
      totalLateDeductionAmount: sql<number>`COALESCE(SUM(${attendanceCalculations.lateDeductionAmount}), 0)`,
      totalAbsenceFinancialImpact: sql<number>`COALESCE(SUM(${attendanceCalculations.absenceFinancialImpact}), 0)`,
    })
    .from(attendanceCalculations)
    .innerJoin(attendanceEntries, eq(attendanceCalculations.attendanceEntryId, attendanceEntries.id))
    .where(and(eq(attendanceEntries.employeeId, employeeId), gte(attendanceEntries.date, debut), lte(attendanceEntries.date, fin)))
    .limit(1);
  return rows[0];
}

/** Paie : périodes, préparation, bulletins, configuration (RH-04). */
export const rhPayrollRouter = createTRPCRouter({
  // ─── Périodes ───
  listPeriods: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(payrollPeriods)
      .where(eq(payrollPeriods.agenceId, ctx.user.agenceId))
      .orderBy(desc(payrollPeriods.startDate));
  }),

  /** F27 — Historique versionné des bulletins (lecture seule, même perm que l'écriture). */
  listBulletinSnapshots: requirePermissionProcedure("rh.paie.modifier")
    .input(
      z
        .object({
          payrollEntryId: z.number().int().optional(),
          periodId: z.number().int().optional(),
          employeeId: z.number().int().optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(payrollEntrySnapshots.agenceId, ctx.user.agenceId)];
      if (safe.payrollEntryId) conditions.push(eq(payrollEntrySnapshots.payrollEntryId, safe.payrollEntryId));
      if (safe.periodId) conditions.push(eq(payrollEntrySnapshots.periodId, safe.periodId));
      if (safe.employeeId) conditions.push(eq(payrollEntrySnapshots.employeeId, safe.employeeId));
      const rows = await db
        .select({
          id: payrollEntrySnapshots.id,
          payrollEntryId: payrollEntrySnapshots.payrollEntryId,
          version: payrollEntrySnapshots.version,
          periodId: payrollEntrySnapshots.periodId,
          employeeId: payrollEntrySnapshots.employeeId,
          baseSalary: payrollEntrySnapshots.baseSalary,
          netPay: payrollEntrySnapshots.netPay,
          status: payrollEntrySnapshots.status,
          entityJson: payrollEntrySnapshots.entityJson,
          linesJson: payrollEntrySnapshots.linesJson,
          raison: payrollEntrySnapshots.raison,
          createdBy: payrollEntrySnapshots.createdBy,
          creatorName: utilisateurs.nom,
          creatorPrenom: utilisateurs.prenom,
          createdAt: payrollEntrySnapshots.createdAt,
        })
        .from(payrollEntrySnapshots)
        .leftJoin(utilisateurs, eq(payrollEntrySnapshots.createdBy, utilisateurs.id))
        .where(and(...conditions))
        .orderBy(desc(payrollEntrySnapshots.version), desc(payrollEntrySnapshots.id))
        .limit(safe.limit ?? 50);
      return rows;
    }),

  openPeriod: requirePermissionProcedure("rh.paie.modifier")
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.endDate < input.startDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La date de fin doit suivre la date de début." });
      }
      // R4-D4 : bornes mensuelles imposées (mission §22) — 01 → dernier jour du mois.
      // Une période de paie est mensuelle ; refus des bornes hors mois complet.
      const monthDay = Number(input.startDate.slice(8, 10));
      const [yy, mm] = input.startDate.split("-").map(Number);
      const lastDay = new Date(yy, mm, 0).getDate();
      const expectedEnd = `${input.startDate.slice(0, 8)}${String(lastDay).padStart(2, "0")}`;
      if (monthDay !== 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Une période de paie mensuelle doit débuter le 1er du mois (YYYY-MM-01)." });
      }
      if (input.endDate !== expectedEnd) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `La période de paie doit couvrir tout le mois : fin attendue le ${expectedEnd} (dernier jour du mois), reçue ${input.endDate}.`,
        });
      }
      // N10 : une seule période ouverte à la fois + pas de chevauchement pour l'agence
      const [ouverte] = await db
        .select({ id: payrollPeriods.id })
        .from(payrollPeriods)
        .where(and(eq(payrollPeriods.agenceId, ctx.user.agenceId), eq(payrollPeriods.status, "open")))
        .limit(1);
      if (ouverte) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Une période est déjà ouverte : fermez-la avant d'en ouvrir une autre." });
      }
      const [chevauchante] = await db
        .select({ id: payrollPeriods.id })
        .from(payrollPeriods)
        .where(
          and(
            eq(payrollPeriods.agenceId, ctx.user.agenceId),
            lt(payrollPeriods.startDate, input.endDate),
            gte(payrollPeriods.endDate, input.startDate),
          )
        )
        .limit(1);
      if (chevauchante) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La période demandée chevauche une période existante." });
      }
      const [existing] = await db
        .select({ id: payrollPeriods.id, status: payrollPeriods.status })
        .from(payrollPeriods)
        .where(
          and(
            eq(payrollPeriods.agenceId, ctx.user.agenceId),
            eq(payrollPeriods.startDate, input.startDate),
            eq(payrollPeriods.endDate, input.endDate),
          )
        )
        .limit(1);
      if (existing) return existing;
      const [row] = await db
        .insert(payrollPeriods)
        .values({ startDate: input.startDate, endDate: input.endDate, status: "open", agenceId: ctx.user.agenceId } as any)
        .returning();
      return row;
    }),

  closePeriod: requirePermissionProcedure("rh.paie.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      // N10 : la clôture est scopée agence et n'est possible qu'une seule fois
      const [period] = await db
        .select()
        .from(payrollPeriods)
        .where(and(eq(payrollPeriods.id, input.id), eq(payrollPeriods.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Période introuvable." });
      const refus = peutCloturer({ statutPeriode: period.status });
      if (refus) throw new TRPCError({ code: "BAD_REQUEST", message: refus });
      const [row] = await db
        .update(payrollPeriods)
        .set({ status: "closed", closedAt: new Date(), closedBy: Number(ctx.user.id) } as any)
        .where(eq(payrollPeriods.id, input.id))
        .returning();
      return row;
    }),

  // ─── Préparation de la paie ───
  prepareMonth: requirePermissionProcedure("rh.paie.modifier")
    .input(z.object({ periodId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [period] = await db
        .select()
        .from(payrollPeriods)
        .where(and(eq(payrollPeriods.id, input.periodId), eq(payrollPeriods.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Période introuvable." });

      // N10 : ordre des opérations — présence du mois clôturée (RH-02) + période ouverte
      const endMonth = Number(period.endDate?.slice(5, 7) ?? "0");
      const endYear = Number(period.endDate?.slice(0, 4) ?? "0");
      const [summaryCheck] = await db
        .select({ locked: attendanceMonthlySummaries.locked })
        .from(attendanceMonthlySummaries)
        .where(
          and(
            eq(attendanceMonthlySummaries.year, endYear),
            eq(attendanceMonthlySummaries.month, endMonth),
            eq(attendanceMonthlySummaries.locked, true),
          )
        )
        .limit(1);
      const refus = peutPreparer({ statutPeriode: period.status, presenceMoisCloture: !!summaryCheck });
      if (refus) {
        throw new TRPCError({ code: "BAD_REQUEST", message: refus });
      }

      // N07 : fériés de l'agence sur la période → dénominateur unifié (cohérent KPI dashboard)
      const holidays = (await db
        .select({ date: hrPublicHolidays.date })
        .from(hrPublicHolidays)
        .where(
          and(
            eq(hrPublicHolidays.agenceId, ctx.user.agenceId),
            gte(hrPublicHolidays.date, period.startDate ?? ""),
            lte(hrPublicHolidays.date, period.endDate ?? ""),
          )
        )).map((h) => String(h.date));

      const items = (await db
        .select()
        .from(payrollItemsConfig)
        .where(and(eq(payrollItemsConfig.agenceId, ctx.user.agenceId), eq(payrollItemsConfig.active, true)))
        .orderBy(payrollItemsConfig.sortOrder)) as unknown as PayrollConfigItem[];

      // specs MVP : heures standard mensuelles (225,3) + majoration HS (1,5)
      const [general] = await db
        .select({ standardMonthlyHours: hrGeneralSettings.standardMonthlyHours, overtimeMultiplier: hrGeneralSettings.overtimeMultiplier })
        .from(hrGeneralSettings)
        .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
        .limit(1);
      const standardMonthlyHours = Number(general?.standardMonthlyHours ?? 225.3) || 225.3;
      const overtimeMultiplier = Number(general?.overtimeMultiplier ?? 1.5) || 1.5;

      const employees = await db
        .select({
          id: employes.id,
          salaireBase: employes.salaireBase,
          modePaie: employes.modePaie,
          forfaitHebdomadaire: employes.forfaitHebdomadaire,
          dateEmbauche: employes.dateEmbauche,
          dateSortie: employes.dateSortie,
          statut: employes.statut,
        })
        .from(employes)
        .where(eq(employes.agenceId, ctx.user.agenceId));

      // N11 — suspensions en cours (intervalle encore ouvert) : date de début de la
      // suspension → jours à payer = avant la suspension (prorata) ou rien.
      const suspensions = await db
        .select({
          employeeId: employeeStatusHistory.employeeId,
          startDate: employeeStatusHistory.startDate,
        })
        .from(employeeStatusHistory)
        .innerJoin(employes, eq(employeeStatusHistory.employeeId, employes.id))
        .where(
          and(
            eq(employes.agenceId, ctx.user.agenceId),
            eq(employeeStatusHistory.statut, "suspendu"),
            sql`${employeeStatusHistory.endDate} IS NULL`
          )
        );
      const suspensionParEmploye = new Map(suspensions.map((s) => [s.employeeId, String(s.startDate).slice(0, 10)]));

      // Agrégation des présences sur l'intervalle de la période (incluant retards et impact absences)
      const aggregates = await db
        .select({
          employeeId: attendanceEntries.employeeId,
          normalMinutes: sql<number>`COALESCE(SUM(${attendanceCalculations.normalMinutes}), 0)`,
          overtimeMinutes: sql<number>`COALESCE(SUM(${attendanceCalculations.overtimeMinutes}), 0)`,
          taskBonus: sql<number>`COALESCE(SUM(${attendanceEntries.taskBonus}), 0)`,
          daysPresent: sql<number>`COUNT(*) FILTER (WHERE ${attendanceCalculations.isAbsent} = false)`,
          daysAbsent: sql<number>`COUNT(*) FILTER (WHERE ${attendanceCalculations.isAbsent} = true)`,
          totalLateDeductionAmount: sql<number>`COALESCE(SUM(${attendanceCalculations.lateDeductionAmount}), 0)`,
          totalAbsenceFinancialImpact: sql<number>`COALESCE(SUM(${attendanceCalculations.absenceFinancialImpact}), 0)`,
        })
        .from(attendanceCalculations)
        .innerJoin(attendanceEntries, eq(attendanceCalculations.attendanceEntryId, attendanceEntries.id))
        .where(
          and(
            gte(attendanceEntries.date, period.startDate),
            lte(attendanceEntries.date, period.endDate),
          )
        )
        .groupBy(attendanceEntries.employeeId);

      // Historique salarial daté (G10) : changements dont l'intervalle d'effet croise la période
      const salaryHistory = await db
        .select({
          employeeId: employeeSalaryHistory.employeeId,
          baseSalary: employeeSalaryHistory.baseSalary,
          startDate: employeeSalaryHistory.startDate,
          modePaie: employeeSalaryHistory.modePaie,
        })
        .from(employeeSalaryHistory)
        .innerJoin(employes, eq(employeeSalaryHistory.employeeId, employes.id))
        .where(
          and(
            eq(employes.agenceId, ctx.user.agenceId),
            lte(employeeSalaryHistory.startDate, period.endDate ?? ""),
            sql`(${employeeSalaryHistory.endDate} IS NULL OR ${employeeSalaryHistory.endDate} >= ${period.startDate})`,
          )
        );

      const debutPeriodeQuery = period.startDate ?? "";
      const finDePeriodeQuery = period.endDate ?? "";

      // Récupération des avances actives à récupérer sur cette période.
      // Éligibilité : VERSÉE ou PARTIELLEMENT_RÉCUPÉRÉE, solde restant > 0, et fenêtre
      // de récupération NULL-safe (non renseignée = toujours en cours de recouvrement).
      const advances = await db
        .select({
          id: employeeAdvances.id,
          employeeId: employeeAdvances.employeeId,
          montant: employeeAdvances.montant,
          dateVersement: employeeAdvances.dateVersement,
          motif: employeeAdvances.motif,
          moyenPaiement: employeeAdvances.moyenPaiement,
          periodeConcerneeDebut: employeeAdvances.periodeConcerneeDebut,
          periodeConcerneeFin: employeeAdvances.periodeConcerneeFin,
          periodeRecuperationDebut: employeeAdvances.periodeRecuperationDebut,
          periodeRecuperationFin: employeeAdvances.periodeRecuperationFin,
          montantRecupere: employeeAdvances.montantRecupere,
          soldeRestant: employeeAdvances.soldeRestant,
          statut: employeeAdvances.statut,
        })
        .from(employeeAdvances)
        .innerJoin(employes, eq(employeeAdvances.employeeId, employes.id))
        .where(
          and(
            eq(employes.agenceId, ctx.user.agenceId),
            inArray(employeeAdvances.statut, ["VERSÉE", "PARTIELLEMENT_RÉCUPÉRÉE"]),
            sql`${employeeAdvances.soldeRestant} > 0`,
            or(
              isNull(employeeAdvances.periodeRecuperationDebut),
              lte(employeeAdvances.periodeRecuperationDebut, finDePeriodeQuery)
            ),
            or(
              isNull(employeeAdvances.periodeRecuperationFin),
              gte(employeeAdvances.periodeRecuperationFin, debutPeriodeQuery)
            ),
          )
        );

      let created = 0;
      const skipped: { employeeId: number; raison: string }[] = [];
      const errors: { employeeId: number; raison: string }[] = [];

      const debutPeriode = period.startDate ?? "";
      const finPeriode = period.endDate ?? "";

      // R6 — situations ACTIF (source de vérité paie §22) : dès qu'un employé en
      // possède, elles pilotent le régime (sinon repli sur la donnée legacy N11).
      const situationsParEmploye = await chargerSituationsActives(ctx.user.agenceId, debutPeriode, finPeriode);

      for (const emp of employees) {
        // R4-D3 : inclusion bornée — les employés archivés ne sont jamais payés.
        if (emp.statut === "archive") {
          skipped.push({ employeeId: emp.id, raison: "employé archivé (période non rémunérée)" });
          continue;
        }
        // Cas A — sorti avant la période : pas de bulletin
        if (emp.statut === "sorti" && emp.dateSortie && emp.dateSortie < debutPeriode) {
          skipped.push({ employeeId: emp.id, raison: `sorti le ${emp.dateSortie} (avant la période)` });
          continue;
        }

        // Suspension : le régime est piloté par les situations R6 si présentes.
        // MAINTIEN_RÉMUNÉRATION / INDEMNISATION_EXTERNE → paie normale (l'impact est
        // ailleurs : présences/projection). NON_REMUNERE / RETENUE / A_DETERMINER →
        // jours non payés (total = pas de bulletin, partiel = prorata jusqu'à la veille).
        const situationsEmp = situationsParEmploye.get(emp.id) ?? [];
        let dateSortiePaie = emp.dateSortie;
        if (situationsEmp.length > 0) {
          const r6 = regimeSituationPeriode({ situations: situationsEmp, debutPeriode, finPeriode });
          if (r6.regime !== "aucun" && r6.impactPaie !== "MAINTIEN_REMUNERATION" && r6.impactPaie !== "INDEMNISATION_EXTERNE") {
            if (r6.regime === "total") {
              skipped.push({ employeeId: emp.id, raison: `situation « ${r6.impactPaie} » couvrant toute la période (non rémunérée)` });
              continue;
            }
            dateSortiePaie = veilleDe(r6.dateDebut ?? debutPeriode);
          }
        } else {
          const caduc = regimeSuspensionEnPeriode({
            statut: emp.statut,
            suspensionStart: suspensionParEmploye.get(emp.id) ?? null,
            debutPeriode,
          });
          if (caduc === "total") {
            skipped.push({ employeeId: emp.id, raison: `suspendu depuis le ${suspensionParEmploye.get(emp.id) ?? "?"} (période non rémunérée)` });
            continue;
          }
          if (caduc === "partiel") dateSortiePaie = veilleDe(suspensionParEmploye.get(emp.id) ?? "");
        }

        const base = Number(emp.salaireBase ?? 0);
        const forfaitHebdomadaire = Number(emp.forfaitHebdomadaire ?? 0);
        const modePaie = normaliserModePaie(emp.modePaie);

        // Cas NON_REMUNERE : on crée quand même le bulletin (net = 0) pour traçabilité
        if (modePaie !== "NON_REMUNERE" && base <= 0 && forfaitHebdomadaire <= 0) {
          skipped.push({ employeeId: emp.id, raison: "salaire et forfait nuls" });
          continue;
        }

        // Cas A/B/C/D — prorata par date d'effet (CDC §11), fériés exclus du dénominateur (N07)
        const prorata = calculerProrata({
          dateDebutPeriode: debutPeriode,
          dateFinPeriode: finPeriode,
          dateEmbauche: emp.dateEmbauche,
          dateSortie: dateSortiePaie,
          holidays,
        });
        const { debutEffectif, finEffective, joursEffectifs, ratio } = prorata;

        // Semaines de forfait : bornées à la période réellement travaillée (G10)
        // Fraction réelle (30 j → 4,29 semaines, plus de ceil abusif — N08)
        const weeksForfait = semainesDansPeriode(debutEffectif, finEffective);

        // Base fixe « mensuel » reconstruite depuis l'historique daté (G10) :
        // moyenne journalière sur les jours réellement travaillés × jours de la période
        const baseEffective = baseEffectifPeriode({
          baseCourante: base,
          modePaie,
          periode: { debut: debutPeriode, fin: finPeriode },
          emploi: { dateEmbauche: emp.dateEmbauche, dateSortie: dateSortiePaie },
          salaries: salaryHistory.filter((h) => h.employeeId === emp.id).map((h) => ({ baseSalary: h.baseSalary, startDate: h.startDate })),
          holidays,
        });
        const forfaitEffective = modePaie === "FORFAIT_HEBDOMADAIRE" ? forfaitHebdomadaire : 0;

        // Agregats bornés à la période réellement travaillée (sorti / embauche en cours de mois)
        const aEtePartiel = debutEffectif > debutPeriode || finEffective < finPeriode;
        const agg = aEtePartiel
          ? await agregerPresencesEmploye(emp.id, debutEffectif, finEffective)
          : aggregates.find((a) => a.employeeId === emp.id);
        const normalHours = Math.round(((agg?.normalMinutes ?? 0) / 60) * 100) / 100;
        const overtimeHours = Math.round(((agg?.overtimeMinutes ?? 0) / 60) * 100) / 100;
        const taskBonus = Math.round(Number(agg?.taskBonus ?? 0) * 100) / 100;
        const daysPresent = Number(agg?.daysPresent ?? 0);
        const daysAbsent = Number(agg?.daysAbsent ?? 0);
        const lateDeductionAmount = Number(agg?.totalLateDeductionAmount ?? 0);
        const absenceFinancialImpact = Number(agg?.totalAbsenceFinancialImpact ?? 0);

        // Filtrer les avances concernées pour cet employé sur cette période
        const employeeAdvancesList = advances
          .filter(
            (a) =>
              a.employeeId === emp.id &&
              estEligibleRecuperationPaie({
                statut: a.statut,
                soldeRestant: Number(a.soldeRestant),
                debut: a.periodeRecuperationDebut,
                fin: a.periodeRecuperationFin,
                periodeDebut: debutPeriode,
                periodeFin: finPeriode,
              })
          )
          .map((a) => ({
            advanceId: a.id,
            // P02 : seule la part restante du solde est déduite (jamais le montant initial)
            amount: montantRecuperationPaie({
              montant: Number(a.montant),
              montantRecupere: Number(a.montantRecupere ?? 0),
              soldeRestant: Number(a.soldeRestant),
            }),
          }))
          .filter((a) => a.amount > 0);

        const payOnHours = modePaie === "SALAIRE_HORAIRE" || modePaie === "NON_REMUNERE";

        const result = calculatePayroll({
          modePaie,
          baseSalary: baseEffective,
          forfaitHebdomadaire: forfaitEffective,
          overtimeHours,
          daysPresent,
          daysAbsent,
          expectedWorkingDays: joursOuvres(period.startDate ?? "", period.endDate ?? "", holidays),
          performanceBonus: 0,
          manualAdjustments: [],
          items,
          advancesToRecover: employeeAdvancesList,
          lateDeductionAmount,
          absenceFinancialImpact,
          normalHours,
          taskBonus,
          standardMonthlyHours,
          overtimeMultiplier,
          payOnHours,
          weeksInPeriod: weeksForfait,
        });

        // Contrôle automatique (mission §18) : net négatif → on refuse le bulletin
        if (result.netPay < 0) {
          errors.push({
            employeeId: emp.id,
            raison: `net négatif (${result.netPay} F) : retenues supérieures au brut (avances, retards, absences)`,
          });
          continue;
        }

        // Upsert du bulletin
        const [existing] = await db
          .select({ id: payrollEntries.id })
          .from(payrollEntries)
          .where(
            and(
              eq(payrollEntries.periodId, period.id),
              eq(payrollEntries.employeeId, emp.id),
            )
          )
          .limit(1);

        const values = {
          periodId: period.id,
          employeeId: emp.id,
          baseSalary: String(baseEffective),
          normalHours: String(normalHours),
          overtimeHours: String(overtimeHours),
          daysPresent,
          daysAbsent,
          presenceBonus: String(result.lines.find((l) => l.itemCode === "PRIME_PRESENCE")?.amount ?? 0),
          performanceBonus: String(result.lines.find((l) => l.itemCode === "PRIME_PERFORMANCE")?.amount ?? 0),
          otherEarnings: String(result.lines.find((l) => l.itemCode === "PRIME_TACHE")?.amount ?? 0), // primes de tâche (specs MVP)
          totalEarnings: String(result.totalEarnings),
          deductions: String(result.totalDeductions),
          cnpsEmployee: String(result.cnpsEmployee),
          cnpsEmployer: String(result.cnpsEmployer),
          netImposable: String(result.netImposable),
          irpp: String(result.irpp),
          netPay: String(result.netPay),
          status: "prepare",
          generatedAt: new Date(),
          updatedAt: new Date(),
        };

        let entryId: number;
if (existing) {
          // P13 : archive l'état courant avant toute régénération du bulletin existant
          await archiverBulletin(ctx.user.agenceId, existing.id, "recalcul", Number(ctx.user.id));
          await db
            .update(payrollEntries)
            .set(values as any)
            .where(eq(payrollEntries.id, existing.id));
          entryId = existing.id;
          await db.delete(payrollEntryLines).where(eq(payrollEntryLines.payrollEntryId, entryId));
        } else {
          const [row] = await db.insert(payrollEntries).values(values as any).returning();
          entryId = row.id;
        }

        // Lignes détaillées
        let order = 0;
        for (const line of result.lines) {
          await db.insert(payrollEntryLines).values({
            payrollEntryId: entryId,
            itemCode: line.itemCode,
            label: line.label,
            amount: String(line.amount),
            direction: line.direction,
            sortOrder: order++,
          } as any);
        }

        // P02 — Persistance idempotente des récupérations d'avances pour ce bulletin :
        // on n'écrit la ligne + la mise à jour de l'avance qu'au premier passage ;
        // un re-run du même appel retrouve la ligne liée au bulletin → aucune re-déduction.
        for (const ar of employeeAdvancesList) {
          const [existingRecovery] = await db
            .select({ id: advanceRecoveries.id })
            .from(advanceRecoveries)
            .where(and(eq(advanceRecoveries.advanceId, ar.advanceId), eq(advanceRecoveries.payrollEntryId, entryId)))
            .limit(1);
          if (existingRecovery) continue;

          await db.insert(advanceRecoveries).values({
            advanceId: ar.advanceId,
            dateRecuperation: finPeriode,
            montant: String(ar.amount),
            periodeConcerneeDebut: period.startDate,
            periodeConcerneeFin: period.endDate,
            payrollEntryId: entryId,
            createdBy: ctx.user.id,
          } as any);

          const [adv] = await db
            .select({ montant: employeeAdvances.montant, montantRecupere: employeeAdvances.montantRecupere, statut: employeeAdvances.statut })
            .from(employeeAdvances)
            .where(eq(employeeAdvances.id, ar.advanceId))
            .limit(1);
          if (!adv) continue;
          const montantInitial = Number(adv.montant);
          const nouveauCumul = Number(adv.montantRecupere ?? 0) + ar.amount;
          const { soldeRestant, statut } = apresRecuperation(montantInitial, nouveauCumul);
          await db
            .update(employeeAdvances)
            .set({
              montantRecupere: String(nouveauCumul),
              soldeRestant: String(soldeRestant),
              statut,
              updatedAt: new Date(),
            } as any)
            .where(eq(employeeAdvances.id, ar.advanceId));
          // R6-D6 (B7) : la récupération via la paie est JOURNALISÉE dans
          // advance_transitions (AVANT→APRÈS, acteur, période concernée).
          await db.insert(advanceTransitions).values({
            advanceId: ar.advanceId,
            fromStatus: adv.statut,
            toStatus: statut,
            acteurId: Number(ctx.user.id),
            justification: `Récupération via paie période ${period.startDate} → ${period.endDate} (bulletin #${entryId})`,
          } as any);
        }

        created++;
      }
      return { created, skipped, errors };
    }),

  // ─── Bulletins ───
  listEntries: rhProcedure
    .input(z.object({ periodId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.periodId) conditions.push(eq(payrollEntries.periodId, safe.periodId));
      return db
        .select({
          id: payrollEntries.id,
          periodId: payrollEntries.periodId,
          employeeId: payrollEntries.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          matricule: employes.matricule,
          baseSalary: payrollEntries.baseSalary,
          normalHours: payrollEntries.normalHours,
          overtimeHours: payrollEntries.overtimeHours,
          daysPresent: payrollEntries.daysPresent,
          daysAbsent: payrollEntries.daysAbsent,
          otherEarnings: payrollEntries.otherEarnings, // primes de tâche (specs MVP)
          totalEarnings: payrollEntries.totalEarnings,
          deductions: payrollEntries.deductions,
          cnpsEmployee: payrollEntries.cnpsEmployee,
          netPay: payrollEntries.netPay,
          paymentMethod: payrollEntries.paymentMethod,
          status: payrollEntries.status,
        })
        .from(payrollEntries)
        .innerJoin(employes, eq(payrollEntries.employeeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(payrollEntries.createdAt));
    }),

  getEntry: rhProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [entry] = await db
        .select()
        .from(payrollEntries)
        .where(eq(payrollEntries.id, input.id))
        .limit(1);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Bulletin introuvable." });
      // N01 : le bulletin n'est lisible que si sa période appartient à l'agence courante
      const [period] = await db
        .select({ id: payrollPeriods.id })
        .from(payrollPeriods)
        .where(and(eq(payrollPeriods.id, entry.periodId), eq(payrollPeriods.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Bulletin introuvable." });
      const lines = await db
        .select()
        .from(payrollEntryLines)
        .where(eq(payrollEntryLines.payrollEntryId, entry.id))
        .orderBy(payrollEntryLines.sortOrder);
      return { ...entry, lines };
    }),

  // Ajustements manuels → recalcul
  adjustEntry: requirePermissionProcedure("rh.paie.modifier")
    .input(
      z.object({
        id: z.number().int(),
        performanceBonus: z.number().min(0).optional(),
        manualAdjustments: z.array(z.object({ code: z.string(), amount: z.number() })).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [entry] = await db
        .select()
        .from(payrollEntries)
        .where(eq(payrollEntries.id, input.id))
        .limit(1);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Bulletin introuvable." });

      // N10 : ajustement scopé agence + verrou post-clôture / post-paiement
      const [period] = await db
        .select()
        .from(payrollPeriods)
        .where(and(eq(payrollPeriods.id, entry.periodId), eq(payrollPeriods.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Bulletin introuvable." });
      const refusAjuster = peutAjuster({ statutPeriode: period.status, statutBulletin: entry.status });
      if (refusAjuster) throw new TRPCError({ code: "BAD_REQUEST", message: refusAjuster });

      // N07 : dénominateur prime présence = jours ouvrés réels (fériés exclus), cohérent prime du prepareMonth
      const holidays = (await db
        .select({ date: hrPublicHolidays.date })
        .from(hrPublicHolidays)
        .where(
          and(
            eq(hrPublicHolidays.agenceId, ctx.user.agenceId),
            gte(hrPublicHolidays.date, period.startDate ?? ""),
            lte(hrPublicHolidays.date, period.endDate ?? ""),
          )
        )).map((h) => String(h.date));
      const expectedWorkingDays = Math.max(1, joursOuvres(period.startDate ?? "", period.endDate ?? "", holidays));

      const items = (await db
        .select()
        .from(payrollItemsConfig)
        .where(and(eq(payrollItemsConfig.agenceId, ctx.user.agenceId), eq(payrollItemsConfig.active, true)))
        .orderBy(payrollItemsConfig.sortOrder)) as unknown as PayrollConfigItem[];

      const [general] = await db
        .select({ standardMonthlyHours: hrGeneralSettings.standardMonthlyHours, overtimeMultiplier: hrGeneralSettings.overtimeMultiplier })
        .from(hrGeneralSettings)
        .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
        .limit(1);
      const [emp] = await db
        .select({ modePaie: employes.modePaie, forfaitHebdomadaire: employes.forfaitHebdomadaire })
        .from(employes)
        .where(eq(employes.id, entry.employeeId))
        .limit(1);
      // P14/N20 : table canonique unique (normaliserModePaie) — journalier/commission jamais mensuel
      const modePaie = normaliserModePaie(emp?.modePaie);

      const result = calculatePayroll({
        modePaie,
        baseSalary: Number(entry.baseSalary),
        forfaitHebdomadaire: Number(emp?.forfaitHebdomadaire ?? 0) || undefined,
        overtimeHours: Number(entry.overtimeHours ?? 0),
        daysPresent: entry.daysPresent ?? 0,
        daysAbsent: entry.daysAbsent ?? 0,
        expectedWorkingDays,
        performanceBonus: input.performanceBonus ?? 0,
        manualAdjustments: (input.manualAdjustments ?? []) as { code: string; amount: number }[],
        items,
        normalHours: Number(entry.normalHours ?? 0),
        taskBonus: Number(entry.otherEarnings ?? 0),
        standardMonthlyHours: Number(general?.standardMonthlyHours ?? 225.3) || 225.3,
        overtimeMultiplier: Number(general?.overtimeMultiplier ?? 1.5) || 1.5,
        payOnHours: modePaie === "SALAIRE_HORAIRE",
      });

      // P13 : archive l'état courant avant le recalcul manuel (adjustment)
      await archiverBulletin(ctx.user.agenceId, entry.id, "adjustment", Number(ctx.user.id));

      await db
        .update(payrollEntries)
        .set({
          performanceBonus: String(result.lines.find((l) => l.itemCode === "PRIME_PERFORMANCE")?.amount ?? 0),
          totalEarnings: String(result.totalEarnings),
          deductions: String(result.totalDeductions),
          netImposable: String(result.netImposable),
          irpp: String(result.irpp),
          netPay: String(result.netPay),
          notes: input.notes ?? null,
          updatedAt: new Date(),
        } as any)
        .where(eq(payrollEntries.id, entry.id));

      await db.delete(payrollEntryLines).where(eq(payrollEntryLines.payrollEntryId, entry.id));
      let order = 0;
      for (const line of result.lines) {
        await db.insert(payrollEntryLines).values({
          payrollEntryId: entry.id,
          itemCode: line.itemCode,
          label: line.label,
          amount: String(line.amount),
          direction: line.direction,
          sortOrder: order++,
        } as any);
      }
      return { success: true, netPay: result.netPay };
    }),

  markPaid: requirePermissionProcedure("rh.paie.modifier")
    .input(z.object({ id: z.number().int(), paymentMethod: z.enum(["especes", "om", "momo", "virement"]) }))
    .mutation(async ({ ctx, input }) => {
      // N03/N10 : paiement uniquement post-clôture, même agence, jamais deux fois
      const [entry] = await db
        .select({
          id: payrollEntries.id,
          employeeId: payrollEntries.employeeId,
          periodId: payrollEntries.periodId,
          netPay: payrollEntries.netPay,
          status: payrollEntries.status,
        })
        .from(payrollEntries)
        .where(eq(payrollEntries.id, input.id))
        .limit(1);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Bulletin introuvable." });
      const [period] = await db
        .select({ id: payrollPeriods.id, status: payrollPeriods.status, startDate: payrollPeriods.startDate, endDate: payrollPeriods.endDate })
        .from(payrollPeriods)
        .where(and(eq(payrollPeriods.id, entry.periodId), eq(payrollPeriods.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!period) throw new TRPCError({ code: "NOT_FOUND", message: "Bulletin introuvable." });
      const refus = peutPayer({ statutPeriode: period.status, statutBulletin: entry.status });
      if (refus) throw new TRPCError({ code: "BAD_REQUEST", message: refus });

      const [row] = await db
        .update(payrollEntries)
        .set({ status: "paye", paymentMethod: input.paymentMethod, paidAt: new Date(), updatedAt: new Date() } as any)
        .where(eq(payrollEntries.id, input.id))
        .returning();

      // N03 : traçage du paiement (audit) — verrou élève à « paye » impossible à contourner
      await db.insert(auditLogs).values({
        userId: Number(ctx.user.id),
        action: "PAIE_MARQUEE_PAYE",
        entityType: "payroll_entry",
        entityId: input.id,
        details: JSON.stringify({
          employeeId: entry.employeeId,
          periodId: entry.periodId,
          periode: `${period.startDate} → ${period.endDate}`,
          montant: Number(entry.netPay ?? 0),
          paymentMethod: input.paymentMethod,
          ancienStatut: entry.status,
        }),
      } as any);

      return row;
    }),

  // ─── Configuration des éléments ───
  listItemsConfig: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(payrollItemsConfig)
      .where(eq(payrollItemsConfig.agenceId, ctx.user.agenceId))
      .orderBy(payrollItemsConfig.sortOrder);
  }),

  updateItemConfig: requirePermissionProcedure("rh.paie.modifier")
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1),
        params: z.record(z.unknown()),
        active: z.boolean(),
        sortOrder: z.number().int().optional(),
        // R6-D4 : raison de modification obligatoire → chaque changement de la
        // config paie est tracé (AVANT/APRÈS/QUI/QUAND/MOTIF).
        reason: z.string().min(3, "Le motif de modification est obligatoire"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, reason, ...values } = input;
      // AVANT : capture de l'état courant avant toute écriture (R6-D4)
      const [before] = await db
        .select()
        .from(payrollItemsConfig)
        .where(and(eq(payrollItemsConfig.id, id), eq(payrollItemsConfig.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Elément de paie introuvable." });
      }

      await db
        .update(payrollItemsConfig)
        .set(values as any)
        .where(and(eq(payrollItemsConfig.id, id), eq(payrollItemsConfig.agenceId, ctx.user.agenceId)));

      // APRÈS : archivage de la nouvelle version + motif, acteur, date
      await db.insert(payrollItemConfigHistory).values({
        itemId: before.id,
        name: values.name ?? before.name,
        type: before.type,
        method: before.method,
        params: (values.params as any) ?? before.params,
        isTaxable: before.isTaxable,
        active: values.active ?? before.active,
        sortOrder: values.sortOrder ?? before.sortOrder,
        agenceId: ctx.user.agenceId,
        reason,
        changedBy: Number(ctx.user.id),
      } as any);

      return { success: true };
    }),
});
