import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  employes,
  departments,
  positions,
  hrSanctionTypes,
  sanctions,
  contrats,
  attendanceMonthlySummaries,
  payrollEntries,
  evaluations,
  trainings,
  trainingSessions,
  trainingParticipations,
  skills,
  positionSkills,
  employeeSkills,
  hrDocumentTypes,
  documentsEmployes,
  hrPublicHolidays,
  hrWorkSchedules,
  leaveBalances,
} from "@atelierone/db";
import { eq, and, inArray, desc, gte, lte, type SQL } from "drizzle-orm";
import {
  presenceRate,
  presenceRateForHeadcount,
  joursComptablesEmployeMois,
  repartition,
  payrollMass,
  toCsv,
  workingDaysInMonth,
  effectifParStatut,
} from "~/server/lib/rh-stats-engine";
import { RBACService } from "~/server/lib/rbac-service";
import { TRPCError } from "@trpc/server";
import { buildPersonnelRows } from "~/server/lib/rh-reports-engine";

/** RH-09 — Tableau de bord & reporting RH */
export const rhDashboardRouter = createTRPCRouter({
  // ─── KPI globaux ───
  getKpis: rhProcedure
    .input(z.object({ year: z.number().int().optional(), month: z.number().int().min(1).max(12).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const now = new Date();
      const year = safe.year ?? now.getFullYear();
      const month = safe.month ?? now.getMonth() + 1;

      const employees = await db
        .select({
          id: employes.id,
          statut: employes.statut,
          workCycleId: employes.workCycleId,
          dateEmbauche: employes.dateEmbauche,
          dateSortie: employes.dateSortie,
          salaireBase: employes.salaireBase,
          departmentId: employes.departmentId,
          positionId: employes.positionId,
          typeEmploye: employes.typeEmploye,
        })
        .from(employes)
        // P19 : sortis/archivés exclus de l'effectif vivant ; N11 : suspendus distingués
        .where(and(eq(employes.agenceId, ctx.user.agenceId), inArray(employes.statut, ["actif", "conge", "suspendu"])));

      const eff = effectifParStatut(employees.map((e) => e.statut));
      const effectif = eff.effectif;
      const actifs = eff.actifs;
      const inactifs = eff.inactifs;

      // Confidentialité visuelle (RH-01 §6) : la masse salariale n'est exposée
      // que si l'utilisateur détient rh.salaire.consulter.
      const canSeeSalary = await RBACService.hasPermission(
        ctx.user.id,
        "rh.salaire.consulter",
        String(ctx.user.agenceId ?? "")
      );

      const employeeIds = employees.map((e) => e.id);

      // specs MVP — répartition par type de contrat (CDI / CDD / Apprentissage…)
      const CONTRAT_LABELS: Record<string, string> = {
        permanent: "CDI",
        contractuel: "CDD",
        apprenti: "Apprentissage",
        stagiaire: "Stage",
        temporaire: "Journalier",
        prestataire: "Prestataire",
      };
      const byContractType = repartition(employees.map((e) => ({ key: e.typeEmploye, label: CONTRAT_LABELS[e.typeEmploye] ?? e.typeEmploye })));
      const effectifCDI = employees.filter((e) => e.typeEmploye === "permanent").length;
      const effectifApprentissage = employees.filter((e) => e.typeEmploye === "apprenti").length;

      // Répartitions
      const deptIds = [...new Set(employees.map((e) => e.departmentId).filter(Boolean))];
      const depts = deptIds.length
        ? await db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, deptIds))
        : [];
      const deptName = new Map(depts.map((d) => [d.id, d.name]));
      const posIds = [...new Set(employees.map((e) => e.positionId).filter(Boolean))];
      const poss = posIds.length
        ? await db.select({ id: positions.id, name: positions.name }).from(positions).where(inArray(positions.id, posIds))
        : [];
      const posName = new Map(poss.map((p) => [p.id, p.name]));
      const byDepartment = repartition(employees.map((e) => ({ key: String(e.departmentId), label: e.departmentId ? deptName.get(e.departmentId) ?? null : null })));
      const byPosition = repartition(employees.map((e) => ({ key: String(e.positionId), label: e.positionId ? posName.get(e.positionId) ?? null : null })));
      const byStatus = repartition(employees.map((e) => ({ key: e.statut, label: e.statut })));

      // Masse salariale (specs MVP) = Σ des salaires de base des employés
      // de la seule agence courante, et masquée sans rh.salaire.consulter.
      // `null` serait indiscernable d'une masse salariale reellement nulle
      // (agence vide). On omet donc la CLE : c'est le contrat de projection.
      const masseSalariale = canSeeSalary ? payrollMass(employees.map((e) => e.salaireBase)) : undefined;

      const holidays = await db
        .select({ date: hrPublicHolidays.date })
        .from(hrPublicHolidays)
        .where(eq(hrPublicHolidays.agenceId, ctx.user.agenceId));
      const holidayDates = holidays.map((h) => String(h.date));
      const workingDays = workingDaysInMonth(year, month, holidayDates);

      // Dénominateur P07/P08 : Σ des jours comptables par employé vivant
      // (cycle présent + période d'emploi + jours ouvrés du cycle, fériés déduits).
      // Un employé sans cycle ne peut être ni présent ni absent → 0 jour au dénominateur.
      const cycleIds = [...new Set(employees.map((e) => e.workCycleId).filter(Boolean))] as number[];
      const schedules = cycleIds.length
        ? await db
            .select({ cycleId: hrWorkSchedules.cycleId, dayOfWeek: hrWorkSchedules.dayOfWeek, isWorkingDay: hrWorkSchedules.isWorkingDay })
            .from(hrWorkSchedules)
            .where(inArray(hrWorkSchedules.cycleId, cycleIds))
        : [];
      const nonWorkingByCycle = new Map<number, Set<number>>();
      for (const s of schedules) {
        if (s.isWorkingDay === false) {
          const set = nonWorkingByCycle.get(s.cycleId) ?? new Set<number>();
          set.add(s.dayOfWeek);
          nonWorkingByCycle.set(s.cycleId, set);
        }
      }
      const joursComptablesTotal = employees.reduce(
        (s, e) => s + joursComptablesEmployeMois(year, month, e, nonWorkingByCycle, holidayDates),
        0
      );

      const summaries = await db
        .select({
          daysPresent: attendanceMonthlySummaries.daysPresent,
          daysAbsent: attendanceMonthlySummaries.daysAbsent,
          totalOvertimeMinutes: attendanceMonthlySummaries.totalOvertimeMinutes,
          locked: attendanceMonthlySummaries.locked,
        })
        .from(attendanceMonthlySummaries)
        .where(
          and(
            eq(attendanceMonthlySummaries.year, year),
            eq(attendanceMonthlySummaries.month, month),
            inArray(attendanceMonthlySummaries.employeeId, employeeIds)
          )
        );

      const presentTotal = summaries.reduce((s, r) => s + (r.daysPresent ?? 0), 0);
      const absentTotal = summaries.reduce((s, r) => s + (r.daysAbsent ?? 0), 0);
      // P07 : dénominateur = jours comptables réels de l'effectif (sinon taux < réel
      // quand des employés n'ont ni cycle ni résumé du mois — bug C). Le numérateur
      // (Σ jours présents des résumés) ne dépasse jamais ce dénominateur.
      const presence = joursComptablesTotal > 0 ? presenceRate(presentTotal, joursComptablesTotal) : presenceRateForHeadcount(presentTotal, workingDays, employees.length);

      // Évaluations en retard (aucune évaluation sur l'année) — agence courante
      const evals = await db
        .select({ employeeId: evaluations.employeeId })
        .from(evaluations)
        .where(
          and(
            gte(evaluations.evaluatedAt, new Date(year, 0, 1)),
            inArray(evaluations.employeeId, employeeIds)
          )
        );
      const evaluatedIds = new Set(evals.map((e) => e.employeeId));
      const evaluationsEnRetard = employees.filter((e) => e.statut === "actif" && !evaluatedIds.has(e.id)).length;

      // Formations réalisées / planifiées
      const sessions = await db
        .select({ status: trainingSessions.status })
        .from(trainingSessions)
        .where(eq(trainingSessions.agenceId, ctx.user.agenceId));
      const formationsRealisees = sessions.filter((s) => s.status === "terminee").length;
      const formationsPlanifiees = sessions.filter((s) => s.status === "planifiee" || s.status === "en_cours").length;

      // Alertes — contrats des employés de l'agence courante
      const alertContracts = await db
        .select({ dateFin: contrats.dateFin })
        .from(contrats)
        .where(and(eq(contrats.statut, "actif"), inArray(contrats.employeId, employeeIds)));
      const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const contratsExpirants = alertContracts.filter((c) => c.dateFin && String(c.dateFin) >= now.toISOString().slice(0, 10) && String(c.dateFin) <= in30).length;

      const docs = await db
        .select({ dateExpiration: documentsEmployes.dateExpiration, statut: documentsEmployes.statut })
        .from(documentsEmployes)
        .where(inArray(documentsEmployes.employeId, employeeIds));
      const docsExpires = docs.filter((d) => d.statut === "actif" && d.dateExpiration && String(d.dateExpiration) < now.toISOString().slice(0, 10)).length;

      const balances = await db
        .select({ balance: leaveBalances.balance })
        .from(leaveBalances)
        .where(inArray(leaveBalances.employeeId, employeeIds));
      const soldesNegatifs = balances.filter((b) => Number(b.balance) < 0).length;

      return {
        kpis: {
          effectif,
          actifs,
          inactifs,
          // N11 : distingués pour le pilotage
          enConge: eff.enConge,
          suspendus: eff.suspendus,
          // specs MVP — compteurs par type de contrat
          effectifCDI,
          effectifApprentissage,
          presence: presence.rate,
          presenceDays: presence.presentDays,
          workingDays: workingDays,
          absentTotal,
          // Propagation conditionnelle : la cle disparait sans le droit.
          ...(masseSalariale !== undefined ? { masseSalariale } : {}),
          evaluationsEnRetard,
          formationsRealisees,
          formationsPlanifiees,
        },
        repartitions: { byDepartment, byPosition, byStatus, byContractType },
        alertes: {
          contratsExpirants,
          docsExpires,
          soldesNegatifs,
        },
      };
    }),

  // ─── Centre de rapports (exports CSV) ───
  exportEmployes: requirePermissionProcedure("rh.employe.consulter")
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
    .query(async ({ ctx, input }) => {
      // R9 : consommé via la sous-couche commune buildPersonnelRows (même population, même masquage)
      // que rhReports.personnel → fidélité UI/export garantie à la source.
      const { rows, canSeeSalary } = await buildPersonnelRows(ctx.user.id, ctx.user.agenceId, { ...(input ?? {}), role: ctx.user.role });
      // RPT-05 : on retire la COLONNE, pas seulement sa valeur. Un CSV garde une
      // colonne "Salaire base" remplie de "***" annonce au lecteur qu'il existe
      // une donnee qu'on lui refuse — et `***` reste un masque fragile : il
      // depend d'une convention, alors que l'absence de colonne est absolue.
      const entetes = ["Matricule", "Nom", "Prénom", "Fonction", "Département", "Statut"];
      if (canSeeSalary) entetes.push("Salaire base");
      return toCsv(
        entetes,
        rows.map((r) => {
          const base = [
            r.matricule,
            r.nom,
            r.prenom ?? "",
            r.fonction ?? "",
            r.departement ?? "",
            r.statut ?? "",
          ];
          return canSeeSalary ? [...base, r.salaireBase] : base;
        })
      );
    }),

  exportPresences: requirePermissionProcedure("rh.presence.consulter")
    .input(
      z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        employeIds: z.array(z.number().int()).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conds: SQL[] = [
        eq(attendanceMonthlySummaries.year, input.year),
        eq(attendanceMonthlySummaries.month, input.month),
        eq(employes.agenceId, ctx.user.agenceId),
      ];
      if (input.employeIds?.length) conds.push(inArray(attendanceMonthlySummaries.employeeId, input.employeIds));
      const rows = await db
        .select({
          nom: employes.nom,
          prenom: employes.prenom,
          daysPresent: attendanceMonthlySummaries.daysPresent,
          daysAbsent: attendanceMonthlySummaries.daysAbsent,
          daysOnLeave: attendanceMonthlySummaries.daysOnLeave,
          totalNormalMinutes: attendanceMonthlySummaries.totalNormalMinutes,
          totalOvertimeMinutes: attendanceMonthlySummaries.totalOvertimeMinutes,
          totalLateMinutes: attendanceMonthlySummaries.totalLateMinutes,
          locked: attendanceMonthlySummaries.locked,
        })
        .from(attendanceMonthlySummaries)
        .innerJoin(employes, eq(attendanceMonthlySummaries.employeeId, employes.id))
        .where(and(...conds))
        .orderBy(employes.nom);
      const min2h = (m: number | null) => (m ? (m / 60).toFixed(2) : "0.00");
      return toCsv(
        ["Nom", "Prénom", "Jours présents", "Jours absents", "Jours congé", "Heures normales", "Heures sup.", "Retards (min)", "Verrouillé"],
        rows.map((r) => [r.nom, r.prenom, r.daysPresent ?? 0, r.daysAbsent ?? 0, r.daysOnLeave ?? 0, min2h(r.totalNormalMinutes), min2h(r.totalOvertimeMinutes), r.totalLateMinutes ?? 0, r.locked ? "Oui" : "Non"])
      );
    }),

  exportMatrice: requirePermissionProcedure("rh.competence.consulter")
    .input(z.object({ statut: z.string().optional(), employeIds: z.array(z.number().int()).max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const f = input ?? {};
      const conds: SQL[] = [eq(employes.agenceId, ctx.user.agenceId)];
      if (f.employeIds?.length) conds.push(inArray(employes.id, f.employeIds));
      else if (f.statut) conds.push(eq(employes.statut, f.statut));
      const rows = await db
        .select({
          nom: employes.nom,
          prenom: employes.prenom,
          skillName: skills.name,
          currentLevel: employeeSkills.currentLevel,
          requiredLevel: positionSkills.requiredLevel,
        })
        .from(employeeSkills)
        .innerJoin(employes, eq(employeeSkills.employeeId, employes.id))
        .innerJoin(skills, eq(employeeSkills.skillId, skills.id))
        .leftJoin(positionSkills, and(eq(positionSkills.skillId, skills.id), eq(positionSkills.positionId, employes.positionId)))
        .where(and(...conds))
        .orderBy(employes.nom, skills.name);
      return toCsv(
        ["Nom", "Prénom", "Compétence", "Niveau actuel", "Niveau requis (poste)"],
        rows.map((r) => [r.nom, r.prenom, r.skillName, r.currentLevel, r.requiredLevel ?? ""])
      );
    }),

  exportDisciplinaire: requirePermissionProcedure("rh.discipline.consulter")
    .input(z.object({ statut: z.string().optional(), employeIds: z.array(z.number().int()).max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const f = input ?? {};
      const conds: SQL[] = [eq(employes.agenceId, ctx.user.agenceId)];
      if (f.employeIds?.length) conds.push(inArray(employes.id, f.employeIds));
      else if (f.statut) conds.push(eq(employes.statut, f.statut));
      const rows = await db
        .select({
          nom: employes.nom,
          prenom: employes.prenom,
          typeName: hrSanctionTypes.name,
          motif: sanctions.motif,
          dateSanction: sanctions.dateSanction,
          decision: sanctions.decision,
        })
        .from(sanctions)
        .innerJoin(employes, eq(sanctions.employeId, employes.id))
        .leftJoin(hrSanctionTypes, eq(sanctions.sanctionTypeId, hrSanctionTypes.id))
        .where(and(...conds))
        .orderBy(desc(sanctions.dateSanction));
      return toCsv(
      ["Nom", "Prénom", "Type", "Motif", "Date", "Décision"],
      rows.map((r) => [r.nom, r.prenom, r.typeName ?? "", r.motif, String(r.dateSanction), r.decision ?? ""])
    );
  }),
});
