import { z } from "zod";
import { createTRPCRouter, rhProcedure } from "~/server/api/trpc";
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
  leaveBalances,
} from "@atelierone/db";
import { eq, and, inArray, desc, gte, lte, ne } from "drizzle-orm";
import {
  presenceRate,
  repartition,
  payrollMass,
  toCsv,
  workingDaysInMonth,
} from "~/server/lib/rh-stats-engine";

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
          salaireBase: employes.salaireBase,
          departmentId: employes.departmentId,
          positionId: employes.positionId,
          typeEmploye: employes.typeEmploye,
        })
        .from(employes)
        .where(and(eq(employes.agenceId, ctx.user.agenceId), ne(employes.statut, "archive")));

      const effectif = employees.length;
      const actifs = employees.filter((e) => e.statut === "actif").length;
      const inactifs = effectif - actifs;

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
      const masseSalariale = payrollMass(employees.map((e) => e.salaireBase));

      // Présences du mois (résumés RH-02)
      const summaries = await db
        .select({
          daysPresent: attendanceMonthlySummaries.daysPresent,
          daysAbsent: attendanceMonthlySummaries.daysAbsent,
          totalOvertimeMinutes: attendanceMonthlySummaries.totalOvertimeMinutes,
          locked: attendanceMonthlySummaries.locked,
        })
        .from(attendanceMonthlySummaries)
        .where(and(eq(attendanceMonthlySummaries.year, year), eq(attendanceMonthlySummaries.month, month)));

      const holidays = await db
        .select({ date: hrPublicHolidays.date })
        .from(hrPublicHolidays)
        .where(eq(hrPublicHolidays.agenceId, ctx.user.agenceId));
      const workingDays = workingDaysInMonth(year, month, holidays.map((h) => String(h.date)));
      const presentTotal = summaries.reduce((s, r) => s + (r.daysPresent ?? 0), 0);
      const absentTotal = summaries.reduce((s, r) => s + (r.daysAbsent ?? 0), 0);
      const presence = presenceRate(presentTotal, Math.max(workingDays, 1));

      // Évaluations en retard (aucune évaluation sur l'année)
      const evals = await db
        .select({ employeeId: evaluations.employeeId })
        .from(evaluations)
        .where(gte(evaluations.evaluatedAt, new Date(year, 0, 1)));
      const evaluatedIds = new Set(evals.map((e) => e.employeeId));
      const evaluationsEnRetard = employees.filter((e) => e.statut === "actif" && !evaluatedIds.has(e.id)).length;

      // Formations réalisées / planifiées
      const sessions = await db
        .select({ status: trainingSessions.status })
        .from(trainingSessions)
        .where(eq(trainingSessions.agenceId, ctx.user.agenceId));
      const formationsRealisees = sessions.filter((s) => s.status === "terminee").length;
      const formationsPlanifiees = sessions.filter((s) => s.status === "planifiee" || s.status === "en_cours").length;

      // Alertes
      const alertContracts = await db
        .select({ dateFin: contrats.dateFin })
        .from(contrats)
        .where(eq(contrats.statut, "actif"));
      const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const contratsExpirants = alertContracts.filter((c) => c.dateFin && String(c.dateFin) >= now.toISOString().slice(0, 10) && String(c.dateFin) <= in30).length;

      const docs = await db
        .select({ dateExpiration: documentsEmployes.dateExpiration, statut: documentsEmployes.statut })
        .from(documentsEmployes);
      const docsExpires = docs.filter((d) => d.statut === "actif" && d.dateExpiration && String(d.dateExpiration) < now.toISOString().slice(0, 10)).length;

      const balances = await db
        .select({ balance: leaveBalances.balance })
        .from(leaveBalances);
      const soldesNegatifs = balances.filter((b) => Number(b.balance) < 0).length;

      return {
        kpis: {
          effectif,
          actifs,
          inactifs,
          // specs MVP — compteurs par type de contrat
          effectifCDI,
          effectifApprentissage,
          presence: presence.rate,
          presenceDays: presence.presentDays,
          workingDays: workingDays,
          absentTotal,
          masseSalariale,
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
  exportEmployes: rhProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const rows = await db
        .select({
          matricule: employes.matricule,
          nom: employes.nom,
          prenom: employes.prenom,
          fonction: employes.fonction,
          statut: employes.statut,
          salaireBase: employes.salaireBase,
          departmentId: employes.departmentId,
          positionId: employes.positionId,
        })
        .from(employes)
        .where(eq(employes.agenceId, ctx.user.agenceId));
      const deptIds = [...new Set(rows.map((r) => r.departmentId).filter(Boolean))];
      const depts = deptIds.length ? await db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, deptIds)) : [];
      const deptName = new Map(depts.map((d) => [d.id, d.name]));
      return toCsv(
        ["Matricule", "Nom", "Prénom", "Fonction", "Département", "Statut", "Salaire base"],
        rows.map((r) => [r.matricule, r.nom, r.prenom, r.fonction ?? "", deptName.get(r.departmentId) ?? "", r.statut, r.salaireBase])
      );
    }),

  exportPresences: rhProcedure
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
    .query(async ({ ctx, input }) => {
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
        .where(and(eq(attendanceMonthlySummaries.year, input.year), eq(attendanceMonthlySummaries.month, input.month)))
        .orderBy(employes.nom);
      const min2h = (m: number | null) => (m ? (m / 60).toFixed(2) : "0.00");
      return toCsv(
        ["Nom", "Prénom", "Jours présents", "Jours absents", "Jours congé", "Heures normales", "Heures sup.", "Retards (min)", "Verrouillé"],
        rows.map((r) => [r.nom, r.prenom, r.daysPresent ?? 0, r.daysAbsent ?? 0, r.daysOnLeave ?? 0, min2h(r.totalNormalMinutes), min2h(r.totalOvertimeMinutes), r.totalLateMinutes ?? 0, r.locked ? "Oui" : "Non"])
      );
    }),

  exportMatrice: rhProcedure.query(async ({ ctx }) => {
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
      .orderBy(employes.nom, skills.name);
    return toCsv(
      ["Nom", "Prénom", "Compétence", "Niveau actuel", "Niveau requis (poste)"],
      rows.map((r) => [r.nom, r.prenom, r.skillName, r.currentLevel, r.requiredLevel ?? ""])
    );
  }),

  exportDisciplinaire: rhProcedure.query(async ({ ctx }) => {
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
      .orderBy(desc(sanctions.dateSanction));
    return toCsv(
      ["Nom", "Prénom", "Type", "Motif", "Date", "Décision"],
      rows.map((r) => [r.nom, r.prenom, r.typeName ?? "", r.motif, String(r.dateSanction), r.decision ?? ""])
    );
  }),
});
