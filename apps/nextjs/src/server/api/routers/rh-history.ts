/**
 * RH — HISTORIQUES / TRACABILITÉ / SNAPSHOTS (Phase 7).
 * Router `rhHistory` — lecture à date + segments + contrat historique + correction
 * salariale rétroactive tracée + journal avant/après (rh_audit_logs).
 * Principes : la fiche `employes` est la projection, les historiques sont la source ;
 * correction rétroactive = INSERT daté (jamais UPDATE d'un intervalle passé) ;
 * `reason` OBLIGATOIRE pour toute mutation ; aucun bulletin clôturé n'est régénéré
 * silencieusement.
 */
import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  employes,
  employeeStatusHistory,
  employeeSalaryHistory,
  employeePositions,
  contrats,
  contractVersions,
  employeeSituations,
  leaveBalances,
  employeeAdvances,
  attendanceMonthlySummaries,
  payrollEntries,
  payrollPeriods,
  payrollEntrySnapshots,
  utilisateurs,
  sanctions,
  rhAuditLogs,
} from "@atelierone/db";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  canSeeSalary as canVoirSalairesRH,
  purgerJsonSensibles,
  sansChampsTypeGenerique,
} from "~/server/lib/rh-secrets";
import { assertEmployeEnAgence } from "~/server/lib/rh-scope";
import { normaliserModePaie } from "~/server/lib/payroll-engine";
import { veilleDe } from "~/server/lib/payroll-engine";
import {
  getEtatEmploye,
  getEmployeeStateAt,
  getEmployeeSegments,
  type HistoryEngineInput,
} from "~/server/lib/rh-history-engine";
import { journaliserAvantApres } from "~/server/lib/rh-audit";

const dateStr = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MAX_SPAN_MOIS = 13;
const STATUTS_SITUATION_EFFECTIFS = ["ACTIF", "CLOTUREE", "ACTIVE", "CLOS", null];

const iso = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  return String(v).slice(0, 10);
};

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// RPT-05 : la definition locale de `canSeeSalary` est SUPPRIMEE. Elle vivait
// en double ici et dans `rh-centre-rapports`, et c'est cette duplication qui
// a permis a des endpoints d'oublier l'appel. Source unique : `rh-secrets`.

/** Charge le « matériel » d'un employé et le projette en HistoryEngineInput (pur). */
async function chargerMaterielEmploye(employeeId: number, agenceId: number): Promise<HistoryEngineInput> {
  const [fiche] = await db
    .select()
    .from(employes)
    .where(and(eq(employes.id, employeeId), eq(employes.agenceId, agenceId)))
    .limit(1);
  if (!fiche) throw new TRPCError({ code: "NOT_FOUND", message: "Employé non trouvé." });

  const [statusHistory, salaryHistory, positionHistory, versionsContrat, contratsCourants, situations] =
    await Promise.all([
      db.select().from(employeeStatusHistory).where(eq(employeeStatusHistory.employeeId, employeeId)),
      db.select().from(employeeSalaryHistory).where(eq(employeeSalaryHistory.employeeId, employeeId)),
      db.select().from(employeePositions).where(eq(employeePositions.employeeId, employeeId)),
      db.select().from(contractVersions).where(eq(contractVersions.employeId, employeeId)),
      db.select().from(contrats).where(eq(contrats.employeId, employeeId)),
      db.select().from(employeeSituations).where(eq(employeeSituations.employeeId, employeeId)),
    ]);

  return {
    employe: {
      id: fiche.id,
      matricule: fiche.matricule,
      fonction: fiche.fonction,
      departmentId: fiche.departmentId,
      positionId: fiche.positionId,
      statut: fiche.statut,
      dateEmbauche: iso(fiche.dateEmbauche),
      dateSortie: iso(fiche.dateSortie),
      motifSortie: fiche.motifSortie,
      salaireBase: fiche.salaireBase,
      modePaie: fiche.modePaie,
      forfaitHebdomadaire: fiche.forfaitHebdomadaire,
    },
    statusHistory: statusHistory.map((r) => ({
      statut: r.statut,
      startDate: iso(r.startDate) as string,
      endDate: iso(r.endDate),
      reason: r.reason,
      changedBy: r.changedBy,
      reembauchable: r.reembauchable,
    })),
    salaryHistory: salaryHistory.map((r) => ({
      baseSalary: r.baseSalary,
      modePaie: r.modePaie,
      forfaitHebdomadaire: r.forfaitHebdomadaire,
      startDate: iso(r.startDate) as string,
      endDate: iso(r.endDate),
      reason: r.reason,
      changedBy: r.changedBy,
    })),
    positionHistory: positionHistory.map((r) => ({
      positionId: r.positionId,
      departmentId: r.departmentId,
      startDate: iso(r.startDate) as string,
      endDate: iso(r.endDate),
      reason: r.reason,
      changedBy: r.changedBy,
    })),
    contractVersions: versionsContrat.map((v) => ({
      id: v.id,
      contractId: v.contractId,
      version: v.version,
      typeContrat: v.typeContrat,
      poste: v.poste,
      dateDebut: iso(v.dateDebut),
      dateFin: iso(v.dateFin),
      dureeMois: v.dureeMois,
      salaireBase: v.salaireBase,
      statut: v.statut,
      finPeriodeEssai: iso(v.finPeriodeEssai),
      avantages: v.avantages,
      renouvellement: v.renouvellement,
      reason: v.reason,
      changedBy: v.changedBy,
      createdAt: v.createdAt,
    })),
    contratsCourants: contratsCourants.map((c) => ({
      id: c.id,
      typeContrat: c.typeContrat,
      poste: c.poste,
      dateDebut: iso(c.dateDebut),
      dateFin: iso(c.dateFin),
      dureeMois: c.dureeMois,
      salaireBase: c.salaireBase,
      statut: c.statut,
      fichierUrl: c.fichierUrl,
      notes: c.notes,
      finPeriodeEssai: iso(c.finPeriodeEssai),
      avantages: c.avantages,
      renouvellement: c.renouvellement ? "OUI" : null,
    })),
    situations: situations
      .filter((s) => (STATUTS_SITUATION_EFFECTIFS as (string | null)[]).includes(s.statutWorkflow))
      .map((s) => ({
        id: s.id,
        dateDebut: iso(s.dateDebut) as string,
        dateFin: iso(s.dateFin),
        type: s.type,
        name: s.name,
        impactContrat: s.impactContrat,
        impactPresence: s.impactPresence,
        impactPlanning: s.impactPlanning,
        impactPaie: s.impactPaie,
        modeCalculPaie: s.modeCalculPaie,
        baseCalculPaie: s.baseCalculPaie,
      })),
  };
}

function prenomNom(acteurPrenom: string | null, acteurNom: string | null): string | null {
  return acteurNom ? `${acteurPrenom ?? ""} ${acteurNom}`.trim() : null;
}

export const rhHistoryRouter = createTRPCRouter({
  /** État « paie » d'un employé à une date (source unique de vérité). */
  etat: rhProcedure
    .input(z.object({ employeeId: z.number().int(), date: dateStr() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      await assertEmployeEnAgence(input.employeeId, agenceId);
      const material = await chargerMaterielEmploye(input.employeeId, agenceId);
      const etat = getEtatEmploye(material, input.date);
      const show = await canVoirSalairesRH(ctx);
      // RPT-05 : le montant ne doit pas survivre sous forme de `null` — le client ne
      // peut pas distinguer « salaire nul » de « salaire masque ». On retire la
      // cle. Le reste de la structure (contrat, dates, statut) reste lisible :
      // c'est le montant qui est sensible, pas le fait qu'un contrat existe.
      if (!show) {
        if (etat.salaire) etat.salaire = sansChampsTypeGenerique(etat.salaire, ["baseSalary", "forfaitHebdomadaire"]);
        if (etat.contrat) etat.contrat = sansChampsTypeGenerique(etat.contrat, ["salaireBase"]);
      }
      return etat;
    }),

  /** État complet à une date (paie + agrégeats : congés, avances, présence verrouillée, dernier bulletin, sanctions). */
  etatDate: rhProcedure
    .input(z.object({ employeeId: z.number().int(), date: dateStr() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      await assertEmployeEnAgence(input.employeeId, agenceId);
      const material = await chargerMaterielEmploye(input.employeeId, agenceId);
      const annee = Number(input.date.slice(0, 4));
      const mois = Number(input.date.slice(5, 7));

      const [balances, avances, presence, sanctionsRows, bulletins, bulletinsSnap] = await Promise.all([
        db.select().from(leaveBalances).where(eq(leaveBalances.employeeId, input.employeeId)),
        db.select().from(employeeAdvances).where(eq(employeeAdvances.employeeId, input.employeeId)),
        db
          .select()
          .from(attendanceMonthlySummaries)
          .where(and(eq(attendanceMonthlySummaries.employeeId, input.employeeId), eq(attendanceMonthlySummaries.year, annee), eq(attendanceMonthlySummaries.month, mois))),
        db
          .select()
          .from(sanctions)
          .where(
            and(
              eq(sanctions.employeId, input.employeeId),
              sql`${sanctions.dateDebutEffet} <= ${input.date}`,
              sql`(COALESCE(${sanctions.dateFinEffet}, '9999-12-31') >= ${input.date})`,
              sql`COALESCE(${sanctions.appliquee}, true) = true`
            )
          ),
        db
          .select({ id: payrollEntries.id, periodId: payrollEntries.periodId, status: payrollEntries.status, netPay: payrollEntries.netPay, baseSalary: payrollEntries.baseSalary, periodStart: payrollPeriods.startDate, periodEnd: payrollPeriods.endDate })
          .from(payrollEntries)
          .innerJoin(payrollPeriods, eq(payrollEntries.periodId, payrollPeriods.id))
          .where(eq(payrollEntries.employeeId, input.employeeId))
          .orderBy(sql`${payrollPeriods.endDate} desc`),
        db
          .select({ snapshot: payrollEntrySnapshots })
          .from(payrollEntrySnapshots)
          .where(and(eq(payrollEntrySnapshots.employeeId, input.employeeId), inArray(payrollEntrySnapshots.status, ["valide", "cloture", "paye"]))),
      ]);

      const show = await canVoirSalairesRH(ctx);
      const latest = bulletins[0] ?? null;

      const etat = getEmployeeStateAt(material, input.date, {
        soldeConges: balances
          .filter((b) => String(b.year) === String(annee))
          .map((b) => ({ leaveTypeId: b.leaveTypeId, balance: num(b.balance) })),
        avances: show
          ? avances
              .filter((a) => iso(a.dateVersement)! <= input.date)
              .map((a) => ({ id: a.id, reference: a.reference, montant: num(a.montant), soldeRestant: num(a.soldeRestant), statut: a.statut }))
          : [],
        presenceMois: presence[0]
          ? {
              locked: presence[0].locked,
              totalNormalMinutes: presence[0].totalNormalMinutes,
              totalOvertimeMinutes: presence[0].totalOvertimeMinutes,
              totalLateMinutes: presence[0].totalLateMinutes,
              daysPresent: presence[0].daysPresent,
              daysAbsent: presence[0].daysAbsent,
              lockedBy: presence[0].lockedBy,
              lockedAt: presence[0].lockedAt,
            }
          : null,
        sanctions: sanctionsRows.map((s) => ({
          id: s.id,
          typeSanction: s.typeSanction,
          dateDebutEffet: iso(s.dateDebutEffet),
          dateFinEffet: iso(s.dateFinEffet),
          motif: s.motif,
        })),
        dernierBulletin: latest
          ? {
              periodId: latest.periodId,
              periodStart: iso(latest.periodStart),
              periodEnd: iso(latest.periodEnd),
              status: latest.status,
              // Le net EST le salaire. La cle disparait, l'existence du bulletin
              // reste visible (elle ne dit rien du montant).
              ...(show ? { netPay: num(latest.netPay) } : {}),
              versionUtilisee: bulletinsSnap.length
                ? Math.max(...bulletinsSnap.map((r) => r.snapshot.version))
                : null,
            }
          : null,
      });

      return etat;
    }),

  /** Segments de constance maximale sur [from, to] — état « paie » par segment. */
  segments: rhProcedure
    .input(z.object({ employeeId: z.number().int(), from: dateStr(), to: dateStr() }))
    .query(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeeId, ctx.user.agenceId);
      if (input.to < input.from) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La date de fin doit suivre la date de début." });
      }
      const debut = new Date(`${input.from}T12:00:00`);
      const fin = new Date(`${input.to}T12:00:00`);
      const spanMonths =
        (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth());
      if (spanMonths >= MAX_SPAN_MOIS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Période trop longue : max 13 mois civils." });
      }
      const material = await chargerMaterielEmploye(input.employeeId, ctx.user.agenceId);
      const show = await canVoirSalairesRH(ctx);
      const segments = getEmployeeSegments(material, input.from, input.to);
      // Meme regle que `etat` : on retire les cles monetaires, on garde la structure
      // du segment (dates, type de contrat) qui ne revele aucun montant.
      if (!show) {
        for (const s of segments) {
          if (s.salaire) s.salaire = sansChampsTypeGenerique(s.salaire, ["baseSalary", "forfaitHebdomadaire"]);
          if (s.contrat) s.contrat = sansChampsTypeGenerique(s.contrat, ["salaireBase"]);
        }
      }
      return segments;
    }),

  /** Historique versionné du (des) contrat(s) d'un employé. */
  historiqueContrat: rhProcedure
    .input(z.object({ employeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeId, ctx.user.agenceId);
      const rows = await db
        .select({
          id: contractVersions.id,
          contractId: contractVersions.contractId,
          version: contractVersions.version,
          typeContrat: contractVersions.typeContrat,
          poste: contractVersions.poste,
          dateDebut: contractVersions.dateDebut,
          dateFin: contractVersions.dateFin,
          dureeMois: contractVersions.dureeMois,
          salaireBase: contractVersions.salaireBase,
          statut: contractVersions.statut,
          finPeriodeEssai: contractVersions.finPeriodeEssai,
          avantages: contractVersions.avantages,
          renouvellement: contractVersions.renouvellement,
          reason: contractVersions.reason,
          changedBy: contractVersions.changedBy,
          acteurNom: utilisateurs.nom,
          acteurPrenom: utilisateurs.prenom,
          createdAt: contractVersions.createdAt,
        })
        .from(contractVersions)
        .leftJoin(utilisateurs, eq(contractVersions.changedBy, utilisateurs.id))
        .where(eq(contractVersions.employeId, input.employeId))
        .orderBy(sql`${contractVersions.version} desc, ${contractVersions.id} desc`);
      const show = await canVoirSalairesRH(ctx);
      // La version du contrat reste lisible : seule la valeur monetee est retiree.
      // Une projection conditionnelle evite defetcher puis de destructurer.
      return rows.map((r) => ({
        ...(show ? { ...r, salaireBase: r.salaireBase } : sansChampsTypeGenerique(r, ["salaireBase"])),
        acteur: prenomNom(r.acteurPrenom, r.acteurNom),
      }));
    }),

  /** Journal avant/après d'un employé (motif, acteur, horodatage). */
  auditEmploye: rhProcedure
    .input(z.object({ employeeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeeId, ctx.user.agenceId);
      const rows = await db
        .select({
          id: rhAuditLogs.id,
          entityType: rhAuditLogs.entityType,
          entityId: rhAuditLogs.entityId,
          action: rhAuditLogs.action,
          avantJson: rhAuditLogs.avantJson,
          apresJson: rhAuditLogs.apresJson,
          motif: rhAuditLogs.motif,
          acteurNom: utilisateurs.nom,
          acteurPrenom: utilisateurs.prenom,
          createdAt: rhAuditLogs.createdAt,
        })
        .from(rhAuditLogs)
        .leftJoin(utilisateurs, eq(rhAuditLogs.userId, utilisateurs.id))
        .where(
          and(
            eq(rhAuditLogs.agenceId, ctx.user.agenceId),
            eq(rhAuditLogs.entityType, "employe"),
            eq(rhAuditLogs.entityId, input.employeeId)
          )
        )
        .orderBy(sql`${rhAuditLogs.createdAt} desc`);
      // RPT-05 : `avantJson`/`apresJson` sont l'image complete de la fiche AVEC et
      // APRES modification. `corrigerSalaireRetroactif` y ecrit `salaireBase`,
      // et `rh.update` aussi : sans nettoyage, cet endpoint d'AUDIT est un canal
      // de fuite des montants qui contourne `rh.salaire.consulter`.
      const salaireOk = await canVoirSalairesRH(ctx);
      return rows.map((r) => ({
        ...r,
        avantJson: purgerJsonSensibles(r.avantJson, salaireOk),
        apresJson: purgerJsonSensibles(r.apresJson, salaireOk),
        acteur: prenomNom(r.acteurPrenom, r.acteurNom),
      }));
    }),

  /**
   * Correction salariale rétroactive TRACÉE (§27/§42).
   * INSERT d'un nouvel intervalle `employee_salary_history` débutant dateEffet, fermeture
   * du précédent à j-1. `reason` OBLIGATOIRE. Jamais d'UPDATE d'un intervalle passé.
   * Renvoie la liste des bulletins CLÔTURÉS calculés avec l'ancienne valeur (avertissements,
   * jamais d'écrasement silencieux).
   */
  corrigerSalaireRetroactif: requirePermissionProcedure("rh.employe.modifier")
    .input(
      z.object({
        employeeId: z.number().int(),
        dateEffet: dateStr(),
        baseSalary: z.number().nonnegative().optional(),
        modePaie: z.string().optional(),
        forfaitHebdomadaire: z.number().nonnegative().optional(),
        reason: z.string().min(5, "Un motif d'au moins 5 caractères est obligatoire."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeeId, ctx.user.agenceId);
      if (input.baseSalary === undefined && input.forfaitHebdomadaire === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Fournissez au moins un salaire de base ou un forfait hebdomadaire." });
      }
      const [before] = await db
        .select()
        .from(employes)
        .where(and(eq(employes.id, input.employeeId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Employé non trouvé." });

      const veille = veilleDe(input.dateEffet);
      const histories = await db.select().from(employeeSalaryHistory).where(eq(employeeSalaryHistory.employeeId, input.employeeId));

      // Ferme l'intervalle encore ouvert qui gouvernerait dateEffet (start < dateEffet).
      const ouvert = histories.find(
        (h) => !h.endDate && String(h.startDate).slice(0, 10) < input.dateEffet
      );
      if (ouvert) {
        await db
          .update(employeeSalaryHistory)
          .set({ endDate: veille } as any)
          .where(eq(employeeSalaryHistory.id, ouvert.id));
      }
      // Si un intervalle a déjà startDate == dateEffet (correction antérieure même jour), on le
      // clos à j-1 : il devient dégénéré et la nouvelle version gouverne (jamais d'UPDATE de valeur).
      const memeJour = histories.find(
        (h) => String(h.startDate).slice(0, 10) === input.dateEffet
      );
      if (memeJour) {
        await db
          .update(employeeSalaryHistory)
          .set({ endDate: veille } as any)
          .where(eq(employeeSalaryHistory.id, memeJour.id));
      }

      const nouveauMode = input.modePaie ? normaliserModePaie(input.modePaie) : before.modePaie;
      const [insere] = await db
        .insert(employeeSalaryHistory)
        .values({
          employeeId: input.employeeId,
          baseSalary: input.baseSalary !== undefined ? String(input.baseSalary) : null,
          startDate: input.dateEffet,
          modePaie: nouveauMode,
          forfaitHebdomadaire: input.forfaitHebdomadaire !== undefined ? String(input.forfaitHebdomadaire) : null,
          reason: `CORRECTION_RETROACTIVE: ${input.reason.trim()}`,
          changedBy: Number(ctx.user.id),
        } as any)
        .returning() as any;

      // Projection fiche (§26) : le nouveau intervalle est le plus récent → la fiche suit.
      const cmp = (ds: string) => Number(ds.replaceAll("-", ""));
      const maxStart = Math.max(
        ...histories.map((h) => cmp(String(h.startDate).slice(0, 10))),
        cmp(input.dateEffet)
      );
      const estLePlusRecent = cmp(input.dateEffet) >= maxStart;
      if (estLePlusRecent) {
        await db
          .update(employes)
          .set({
            salaireBase: input.baseSalary !== undefined ? String(input.baseSalary) : before.salaireBase,
            modePaie: nouveauMode,
            forfaitHebdomadaire: input.forfaitHebdomadaire !== undefined ? String(input.forfaitHebdomadaire) : before.forfaitHebdomadaire,
            updatedAt: new Date(),
          } as any)
          .where(eq(employes.id, input.employeeId));
      }

      // Avertissements : bulletins clôturés calculés avec l'ancienne valeur sur des périodes
      // postérieures à dateEffet. Jamais de régénération silencieuse.
      const snapshots = await db
        .select({
          snapshot: payrollEntrySnapshots,
          periodEnd: payrollPeriods.endDate,
          status: payrollEntries.status,
        })
        .from(payrollEntrySnapshots)
        .innerJoin(payrollEntries, eq(payrollEntrySnapshots.payrollEntryId, payrollEntries.id))
        .innerJoin(payrollPeriods, eq(payrollEntries.periodId, payrollPeriods.id))
        .where(
          and(
            eq(payrollEntrySnapshots.employeeId, input.employeeId),
            inArray(payrollEntries.status, ["valide", "cloture", "paye"]),
            gte(sql`COALESCE(${payrollPeriods.endDate}, '9999-12-31')`, input.dateEffet),
            sql`${payrollEntrySnapshots.baseSalary} <> ${input.baseSalary !== undefined ? String(input.baseSalary) : before.salaireBase}`
          )
        );

      const avant = {
        salaireBase: before.salaireBase,
        modePaie: before.modePaie,
        forfaitHebdomadaire: before.forfaitHebdomadaire,
      };
      const apres = {
        salaireBase: input.baseSalary !== undefined ? String(input.baseSalary) : before.salaireBase,
        modePaie: nouveauMode,
        forfaitHebdomadaire: input.forfaitHebdomadaire !== undefined ? String(input.forfaitHebdomadaire) : before.forfaitHebdomadaire,
        dateEffet: input.dateEffet,
      };
      await journaliserAvantApres(db, {
        agenceId: ctx.user.agenceId,
        entityType: "employe",
        entityId: input.employeeId,
        action: "CORRECTION_SALAIRE_RETROACTIVE",
        avant,
        apres,
        motif: input.reason.trim(),
        userId: Number(ctx.user.id),
      });

      return {
        success: true,
        intervalId: insere?.id,
        projectionsFiche: estLePlusRecent,
        bulletinsCloturesImpactes: snapshots.map((s) => ({
          snapshotId: s.snapshot.id,
          version: s.snapshot.version,
          periodEnd: iso(s.periodEnd),
          statut: s.status,
          baseSalarySnapshot: num(s.snapshot.baseSalary),
        })),
      };
    }),
});
