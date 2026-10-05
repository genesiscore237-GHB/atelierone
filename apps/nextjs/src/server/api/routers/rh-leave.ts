import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  employes,
  hrLeaveTypes,
  hrGeneralSettings,
  hrPublicHolidays,
  leaveBalances,
  leaveRequests,
  leaveBalanceAdjustments,
  leaveBalanceSnapshots,
  attendanceEntries,
  utilisateurs,
  employeeSituations,
  employeeSituationTransitions,
  hrSituationTypes,
} from "@atelierone/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  calculateBalance,
  countWorkingDays,
  garageWorkingDay,
  proRataAcquisition,
  overlaps,
} from "~/server/lib/leave-engine";
import { moisCloture, runCalculation } from "~/server/lib/rh-projection";
import { assertEmployeEnAgence } from "~/server/lib/rh-scope";
import { prochaineVersion } from "~/server/lib/rh-snapshots";
import { conflits, mapperTypeCongeeVersSituation, type SituationLike } from "~/server/lib/situations-engine";

const REQUEST_STATUS = ["brouillon", "en_attente", "approuve", "refuse", "annule"] as const;

/** RH-03 — Congés & absences : soldes, demandes, workflow, impact présences */
export const rhLeaveRouter = createTRPCRouter({
  // ─── Soldes ───
  // P15 : query LECTURE PURE — aucune écriture à la lecture. Les lignes de solde
  // manquantes sont renvoyées en « virtuel » (isVirtual, id: null) ; la création
  // réelle se fait par la mutation explicite ensureBalances.
  getBalances: rhProcedure
    .input(z.object({ employeeId: z.number().int().optional(), year: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const year = safe.year ?? new Date().getFullYear();

      const leaveTypes = await db
        .select()
        .from(hrLeaveTypes)
        .where(eq(hrLeaveTypes.agenceId, ctx.user.agenceId));

      const employees = await db
        .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom, matricule: employes.matricule, dateEmbauche: employes.dateEmbauche })
        .from(employes)
        .where(and(eq(employes.agenceId, ctx.user.agenceId), ...(safe.employeeId ? [eq(employes.id, safe.employeeId)] : [])));

      const [gen] = await db
        .select({ annualLeaveDays: hrGeneralSettings.annualLeaveDays })
        .from(hrGeneralSettings)
        .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
        .limit(1);
      const annualLeaveDays = Number(gen?.annualLeaveDays ?? 30);

      const rows: Array<Record<string, unknown>> = [];
      for (const emp of employees) {
        for (const lt of leaveTypes) {
          if (!lt.deductBalance) continue;
          const [existing] = await db
            .select()
            .from(leaveBalances)
            .where(
              and(
                eq(leaveBalances.employeeId, emp.id),
                eq(leaveBalances.leaveTypeId, lt.id),
                eq(leaveBalances.year, year),
              )
            )
            .limit(1);

          const virtual = existing
            ? null
            : {
                id: null,
                acquiredDays: lt.code === "CONGE_ANNUEL" ? String(acquisitionEmploye(emp, year, annualLeaveDays)) : "0",
                takenDays: "0",
                adjustedDays: "0",
                balance: lt.code === "CONGE_ANNUEL" ? String(acquisitionEmploye(emp, year, annualLeaveDays)) : "0",
              };
          const balance = existing ?? virtual;

          rows.push({
            id: balance?.id ?? null,
            employeeId: emp.id,
            employeNom: emp.nom,
            employePrenom: emp.prenom,
            matricule: emp.matricule,
            leaveTypeId: lt.id,
            leaveTypeCode: lt.code,
            leaveTypeName: lt.name,
            year,
            acquiredDays: balance?.acquiredDays ?? "0",
            takenDays: balance?.takenDays ?? "0",
            adjustedDays: balance?.adjustedDays ?? "0",
            balance: balance?.balance ?? "0",
            isVirtual: !existing,
          });
        }
      }
      return rows;
    }),

  /** F27 — Historique versionné des soldes de congés (lecture seule). */
  listBalanceSnapshots: requirePermissionProcedure("rh.conge.modifier")
    .input(
      z
        .object({
          leaveBalanceId: z.number().int().optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(leaveBalanceSnapshots.agenceId, ctx.user.agenceId)];
      if (input?.leaveBalanceId) conditions.push(eq(leaveBalanceSnapshots.leaveBalanceId, input.leaveBalanceId));
      const rows = await db
        .select({
          id: leaveBalanceSnapshots.id,
          leaveBalanceId: leaveBalanceSnapshots.leaveBalanceId,
          version: leaveBalanceSnapshots.version,
          entityJson: leaveBalanceSnapshots.entityJson,
          raison: leaveBalanceSnapshots.raison,
          createdBy: leaveBalanceSnapshots.createdBy,
          creatorName: utilisateurs.nom,
          creatorPrenom: utilisateurs.prenom,
          createdAt: leaveBalanceSnapshots.createdAt,
        })
        .from(leaveBalanceSnapshots)
        .leftJoin(utilisateurs, eq(leaveBalanceSnapshots.createdBy, utilisateurs.id))
        .where(and(...conditions))
        .orderBy(desc(leaveBalanceSnapshots.version), desc(leaveBalanceSnapshots.id))
        .limit(input?.limit ?? 50);
      return rows;
    }),

  // P15 : création explicite et idempotente des lignes de solde manquantes
  ensureBalances: requirePermissionProcedure("rh.conge.modifier")
    .input(z.object({ employeeId: z.number().int().optional(), year: z.number().int().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const safe = input ?? {};
      const year = safe.year ?? new Date().getFullYear();

      const leaveTypes = await db
        .select()
        .from(hrLeaveTypes)
        .where(eq(hrLeaveTypes.agenceId, ctx.user.agenceId));

      const employees = await db
        .select({ id: employes.id, dateEmbauche: employes.dateEmbauche })
        .from(employes)
        .where(and(eq(employes.agenceId, ctx.user.agenceId), ...(safe.employeeId ? [eq(employes.id, safe.employeeId)] : [])));

      const [gen] = await db
        .select({ annualLeaveDays: hrGeneralSettings.annualLeaveDays })
        .from(hrGeneralSettings)
        .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
        .limit(1);
      const annualLeaveDays = Number(gen?.annualLeaveDays ?? 30);

      const created: Array<Record<string, unknown>> = [];
      for (const emp of employees) {
        for (const lt of leaveTypes) {
          if (!lt.deductBalance) continue;
          const [existing] = await db
            .select({ id: leaveBalances.id })
            .from(leaveBalances)
            .where(
              and(
                eq(leaveBalances.employeeId, emp.id),
                eq(leaveBalances.leaveTypeId, lt.id),
                eq(leaveBalances.year, year),
              )
            )
            .limit(1);
          if (existing) continue;
          const acquired = lt.code === "CONGE_ANNUEL" ? acquisitionEmploye(emp, year, annualLeaveDays) : 0;
          const [balance] = await db
            .insert(leaveBalances)
            .values({
              employeeId: emp.id,
              leaveTypeId: lt.id,
              year,
              acquiredDays: String(acquired),
              takenDays: "0",
              adjustedDays: "0",
              balance: String(acquired),
            } as any)
            .returning();
          created.push({ id: balance.id, employeeId: emp.id, leaveTypeId: lt.id, year, acquiredDays: balance.acquiredDays });
        }
      }
      return { created: created.length, rows: created };
    }),

  adjustBalance: requirePermissionProcedure("rh.conge.modifier")
    .input(
      z.object({
        leaveBalanceId: z.number().int(),
        amount: z.number().min(-100).max(100),
        reason: z.string().min(3, "Le motif est obligatoire"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // N01 : le solde doit appartenir à un employé de l'agence courante
      const [balance] = await db
        .select({
          id: leaveBalances.id,
          acquiredDays: leaveBalances.acquiredDays,
          takenDays: leaveBalances.takenDays,
          adjustedDays: leaveBalances.adjustedDays,
        })
        .from(leaveBalances)
        .innerJoin(employes, eq(leaveBalances.employeeId, employes.id))
        .where(and(eq(leaveBalances.id, input.leaveBalanceId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!balance) throw new TRPCError({ code: "NOT_FOUND", message: "Solde introuvable." });

      await db.insert(leaveBalanceAdjustments).values({
        leaveBalanceId: balance.id,
        amount: String(input.amount),
        reason: input.reason,
        createdBy: Number(ctx.user.id),
      } as any);

      const newAdjusted = Number(balance.adjustedDays ?? 0) + input.amount;
      const newBalance = calculateBalance(
        Number(balance.acquiredDays ?? 0),
        Number(balance.takenDays ?? 0),
        newAdjusted
      );
      await db
        .update(leaveBalances)
        .set({ adjustedDays: String(newAdjusted), balance: String(newBalance), updatedAt: new Date() } as any)
        .where(eq(leaveBalances.id, balance.id));
      return { success: true, balance: newBalance };
    }),

  // ─── Demandes ───
  createRequest: requirePermissionProcedure("rh.conge.modifier")
    .input(
      z.object({
        employeeId: z.number().int(),
        leaveTypeId: z.number().int(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().min(3, "Le motif est obligatoire"),
        documentUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.endDate < input.startDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La date de fin doit suivre la date de début." });
      }
      // N01 : l'employé et le type de congé doivent appartenir à l'agence courante
      await assertEmployeEnAgence(input.employeeId, ctx.user.agenceId);
      const [leaveType] = await db
        .select({ id: hrLeaveTypes.id })
        .from(hrLeaveTypes)
        .where(and(eq(hrLeaveTypes.id, input.leaveTypeId), eq(hrLeaveTypes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!leaveType) throw new TRPCError({ code: "NOT_FOUND", message: "Type de congé introuvable." });
      // Jours fériés paramétrés exclus du décompte (M8)
      const feries = await db.select({ date: hrPublicHolidays.date }).from(hrPublicHolidays).where(eq(hrPublicHolidays.agenceId, ctx.user.agenceId));
      const daysCount = countWorkingDays(input.startDate, input.endDate, garageWorkingDay, feries.map((f) => f.date));
      if (daysCount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La période ne contient aucun jour ouvré." });
      }

      // Conflit : demande approuvée/en attente sur la même période
      const [conflict] = await db
        .select({ id: leaveRequests.id })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.employeeId, input.employeeId),
            lte(leaveRequests.startDate, input.endDate),
            gte(leaveRequests.endDate, input.startDate),
            eq(leaveRequests.status, "approuve"),
          )
        )
        .limit(1);
      if (conflict) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Une demande approuvée chevauche cette période." });
      }

      const [row] = await db
        .insert(leaveRequests)
        .values({
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          startDate: input.startDate,
          endDate: input.endDate,
          daysCount: String(daysCount),
          reason: input.reason,
          documentUrl: input.documentUrl ?? null,
          status: "en_attente",
          requestedBy: Number(ctx.user.id),
        } as any)
        .returning();
      return row;
    }),

  listRequests: rhProcedure
    .input(
      z.object({
        employeeId: z.number().int().optional(),
        status: z.enum(REQUEST_STATUS).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.employeeId) conditions.push(eq(leaveRequests.employeeId, safe.employeeId));
      if (safe.status) conditions.push(eq(leaveRequests.status, safe.status));
      if (safe.from) conditions.push(gte(leaveRequests.startDate, safe.from));
      if (safe.to) conditions.push(lte(leaveRequests.endDate, safe.to));

      return db
        .select({
          id: leaveRequests.id,
          employeeId: leaveRequests.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          matricule: employes.matricule,
          leaveTypeId: leaveRequests.leaveTypeId,
          leaveTypeName: hrLeaveTypes.name,
          leaveTypeCode: hrLeaveTypes.code,
          startDate: leaveRequests.startDate,
          endDate: leaveRequests.endDate,
          daysCount: leaveRequests.daysCount,
          reason: leaveRequests.reason,
          status: leaveRequests.status,
          rejectionReason: leaveRequests.rejectionReason,
          createdAt: leaveRequests.createdAt,
        })
        .from(leaveRequests)
        .innerJoin(employes, eq(leaveRequests.employeeId, employes.id))
        .innerJoin(hrLeaveTypes, eq(leaveRequests.leaveTypeId, hrLeaveTypes.id))
        .where(and(...conditions))
        .orderBy(desc(leaveRequests.createdAt));
    }),

  decideRequest: requirePermissionProcedure("rh.conge.modifier")
    .input(
      z.object({
        id: z.number().int(),
        status: z.enum(["approuve", "refuse", "annule"]),
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // N01 : la demande doit appartenir à un employé de l'agence courante
      const [request] = await db
        .select({
          id: leaveRequests.id,
          employeeId: leaveRequests.employeeId,
          leaveTypeId: leaveRequests.leaveTypeId,
          status: leaveRequests.status,
          startDate: leaveRequests.startDate,
          endDate: leaveRequests.endDate,
          daysCount: leaveRequests.daysCount,
        })
        .from(leaveRequests)
        .innerJoin(employes, eq(leaveRequests.employeeId, employes.id))
        .where(and(eq(leaveRequests.id, input.id), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Demande introuvable." });
      if (request.status === "approuve" || request.status === "refuse") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cette demande est déjà traitée." });
      }

      if (input.status === "approuve") {
        // R6 — situation CONGE (source de vérité §11) : idempotente par provenance,
        // conflits REFUS bloquants AVANT tout décompte. Le congé n'est pas un statut :
        // l'employé reste « actif », l'impact est porté par la situation datée.
        await procSituationConge(
          ctx.user.agenceId,
          request.id,
          request.employeeId,
          request.leaveTypeId,
          request.startDate,
          request.endDate,
          Number(ctx.user.id),
        );

        // Vérification du solde (types avec décompte)
        const [leaveType] = await db
          .select({ deductBalance: hrLeaveTypes.deductBalance, code: hrLeaveTypes.code })
          .from(hrLeaveTypes)
          .where(eq(hrLeaveTypes.id, request.leaveTypeId))
          .limit(1);
        const deduct = leaveType?.deductBalance ?? true;

        if (deduct) {
          const year = new Date(request.startDate).getFullYear();
          let balance = (
            await db
              .select()
              .from(leaveBalances)
              .where(
                and(
                  eq(leaveBalances.employeeId, request.employeeId),
                  eq(leaveBalances.leaveTypeId, request.leaveTypeId),
                  eq(leaveBalances.year, year),
                )
              )
              .limit(1)
          )[0];

          // Solde absent → création automatique (acquisition annuelle/prorata RH-00)
          if (!balance) {
            const [gen] = await db
              .select({ annualLeaveDays: hrGeneralSettings.annualLeaveDays })
              .from(hrGeneralSettings)
              .where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId))
              .limit(1);
            const annualLeaveDays = Number(gen?.annualLeaveDays ?? 30);
            const [emp] = await db
              .select({ dateEmbauche: employes.dateEmbauche })
              .from(employes)
              .where(eq(employes.id, request.employeeId))
              .limit(1);
            let acquired = annualLeaveDays;
            if (emp?.dateEmbauche) {
              const hireYear = new Date(emp.dateEmbauche).getFullYear();
              if (hireYear === year) {
                const months = Math.max(1, new Date().getMonth() + 1 - new Date(emp.dateEmbauche).getMonth());
                acquired = proRataAcquisition(annualLeaveDays, months);
              }
            }
            const [created] = await db
              .insert(leaveBalances)
              .values({
                employeeId: request.employeeId,
                leaveTypeId: request.leaveTypeId,
                year,
                acquiredDays: String(acquired),
                takenDays: "0",
                adjustedDays: "0",
                balance: String(acquired),
              } as any)
              .returning();
            balance = created;
          }

          const soldeRestant = Number(balance.balance ?? 0);
          const jours = Number(request.daysCount ?? 0);
          if (soldeRestant < jours) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Solde insuffisant (reste ${soldeRestant} j, demande ${jours} j).`,
            });
          }
          const newTaken = Number(balance.takenDays ?? 0) + jours;
          const newBalance = calculateBalance(
            Number(balance.acquiredDays ?? 0),
            newTaken,
            Number(balance.adjustedDays ?? 0)
          );
          // P13 : archive le solde AVANT le décompte (décision) — historique rejouable
          const versions = (await db
            .select({ v: leaveBalanceSnapshots.version })
            .from(leaveBalanceSnapshots)
            .where(eq(leaveBalanceSnapshots.leaveBalanceId, balance.id))).map((r) => r.v);
          await db.insert(leaveBalanceSnapshots).values({
            agenceId: ctx.user.agenceId,
            leaveBalanceId: balance.id,
            version: prochaineVersion(versions),
            entityJson: balance,
            raison: "decision",
            createdBy: Number(ctx.user.id),
          } as any);
          await db
            .update(leaveBalances)
            .set({ takenDays: String(newTaken), balance: String(newBalance), updatedAt: new Date() } as any)
            .where(eq(leaveBalances.id, balance.id));
          // N04 : trace d'audit de la prise de congé (journal du solde)
          await db.insert(leaveBalanceAdjustments).values({
            leaveBalanceId: balance.id,
            amount: String(-jours),
            reason: `Prise de congé approuvée (demande #${request.id}, ${jours} j)`,
            createdBy: Number(ctx.user.id),
          } as any);
        }

        // Impact présences : marquer les jours approuvés en "conge"
        await markLeaveOnAttendance(ctx.user.agenceId, request.employeeId, request.startDate, request.endDate);
      }

      await db
        .update(leaveRequests)
        .set({
          status: input.status,
          approvedBy: input.status === "annule" ? null : Number(ctx.user.id),
          approvedAt: input.status === "annule" ? null : new Date(),
          rejectionReason: input.status === "refuse" ? (input.rejectionReason ?? null) : null,
          updatedAt: new Date(),
        } as any)
        .where(eq(leaveRequests.id, input.id));

      return { success: true };
    }),
});

/** Acquisition annuelle ou proratisée d'un employé pour l'année visée (P15 — logique partagée). */
function acquisitionEmploye(
  emp: { dateEmbauche: string | Date | null },
  year: number,
  annualLeaveDays: number
): number {
  if (!emp.dateEmbauche) return annualLeaveDays;
  const embauche = new Date(emp.dateEmbauche);
  const hireYear = embauche.getFullYear();
  if (hireYear !== year) return annualLeaveDays;
  const monthsEmployed = Math.max(0, Math.min(12, new Date().getMonth() + 1 - embauche.getMonth()));
  return proRataAcquisition(annualLeaveDays, monthsEmployed);
}

/** Marque les jours approuvés comme congés dans les présences (upsert + recalcul).
 *  Refuse si un jour de la période tombe dans un mois déjà clôturé (E8) —
 *  un congé ne doit jamais écraser une présence verrouillée.
 *  Compatible avec la projection : chaque jour de congé reçoit UNE ligne de
 *  présence (statut 'conge') ET un calcul (code C/M/O/F) — sans quoi analyse et
 *  clôture (qui lisent les calculs) ne voient jamais le congé (bug B). */
async function markLeaveOnAttendance(agenceId: number, employeeId: number, startDate: string, endDate: string) {
  const [emp] = await db
    .select({ workCycleId: employes.workCycleId })
    .from(employes)
    .where(eq(employes.id, employeeId))
    .limit(1);
  if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employé introuvable." });
  if (!emp.workCycleId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Impossible d'approuver ce congé : l'employé n'a pas de cycle de travail (affectez-lui un cycle pour projeter le congé en présences).",
    });
  }
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end) {
    if (garageWorkingDay(cursor.getDay())) {
      const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      if (await moisCloture(agenceId, dateStr)) {
        const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
        const d = new Date(`${dateStr}T12:00:00`);
        const mois = `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
        throw new TRPCError({
          code: "CONFLICT",
          message: `Impossible d'approuver ce congé : le mois de ${mois} est déjà clôturé (présences verrouillées).`,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Jours fériés publics paramétrés excluent la projection (R6-D2) :
  // cohérence avec le décompte M8 (countWorkingDays) qui ne compte pas les fériés.
  const feries = await db.select({ date: hrPublicHolidays.date }).from(hrPublicHolidays).where(eq(hrPublicHolidays.agenceId, agenceId));
  const feriesStr = new Set(feries.map((f) => f.date));

  const replay = new Date(`${startDate}T12:00:00`);
  while (replay <= end) {
    if (garageWorkingDay(replay.getDay())) {
      const dateStr = `${replay.getFullYear()}-${String(replay.getMonth() + 1).padStart(2, "0")}-${String(replay.getDate()).padStart(2, "0")}`;
      if (!feriesStr.has(dateStr)) {
        const [existing] = await db
          .select({ id: attendanceEntries.id, timeIn: attendanceEntries.timeIn, timeOut: attendanceEntries.timeOut })
          .from(attendanceEntries)
          .where(and(eq(attendanceEntries.employeeId, employeeId), eq(attendanceEntries.date, dateStr)))
          .limit(1);
        // R6-D2 : un jour réellement pointé (timeIn/timeOut présents) n'est JAMAIS
        // écrasé par la projection congé — la présence pointée prime (on garde
        // l'historique réel, on ne supprime pas une valeur). Seule une entrée
        // vide (aucun pointage) devient 'conge'.
        const aPointagesReels = Boolean(existing && (existing.timeIn || existing.timeOut));
        if (aPointagesReels) {
          replay.setDate(replay.getDate() + 1);
          continue;
        }
        const values = { status: "conge", timeIn: null, timeOut: null, updatedAt: new Date() } as any;
        let entryId = existing?.id;
        if (existing) {
          await db
            .update(attendanceEntries)
            .set(values)
            .where(eq(attendanceEntries.id, existing.id));
        } else {
          const [row] = await db.insert(attendanceEntries).values({
            employeeId,
            date: dateStr,
            status: "conge",
            source: "import",
          } as any).returning();
          entryId = row.id;
        }
        // Projection : le jour de congé doit produire un calcul (code C/M/O/F),
        // sinon analyse/closeMonth ne comptent pas le congé (bug B).
        if (entryId) await runCalculation(entryId, employeeId, dateStr);
      }
    }
    replay.setDate(replay.getDate() + 1);
  }
}

// Référence gardée pour l'analyse statique (overlaps utilisé par la suite)
export { overlaps };

/**
 * R6 — Génère la situation CONGE (source de vérité) à l'approbation d'une
 * demande de congé. Idempotente par provenance (leave_requests). Les conflits
 * REFUS (§14) bloquent l'approbation AVANT tout décompte de solde.
 */
async function procSituationConge(
  agenceId: number,
  requestId: number,
  employeId: number,
  leaveTypeId: number,
  dateDebut: string,
  dateFin: string,
  userId: number
) {
  const [deja] = await db
    .select({ id: employeeSituations.id })
    .from(employeeSituations)
    .where(and(eq(employeeSituations.provenanceTable, "leave_requests"), eq(employeeSituations.provenanceId, requestId)))
    .limit(1);
  if (deja) return;

  const [leaveType] = await db
    .select({ code: hrLeaveTypes.code })
    .from(hrLeaveTypes)
    .where(eq(hrLeaveTypes.id, leaveTypeId))
    .limit(1);
  const mappe = mapperTypeCongeeVersSituation(leaveType?.code ?? null);

  const [sitType] = await db
    .select()
    .from(hrSituationTypes)
    .where(
      and(
        eq(hrSituationTypes.agenceId, agenceId),
        eq(hrSituationTypes.category, mappe.category),
        eq(hrSituationTypes.type, mappe.type),
      )
    )
    .limit(1);

  const fallbackPaie: Record<string, string> = {
    CONGE_ANNUEL: "MAINTIEN_REMUNERATION",
    CONGE_SANS_SOLDE: "NON_REMUNERE",
    CONGE_FORMATION: "MAINTIEN_REMUNERATION",
    MALADIE: "MAINTIEN_REMUNERATION",
    MATERNITE: "INDEMNISATION_EXTERNE",
    PERMISSION_EXCEPTIONNELLE: "MAINTIEN_REMUNERATION",
    AUTRE: "A_DETERMINER",
  };

  const candidat: SituationLike = {
    category: mappe.category,
    type: mappe.type,
    dateDebut,
    dateFin,
    dateEffet: dateDebut,
    impactContrat: sitType?.impactContrat ?? "ACTIVE",
    impactPresence: sitType?.impactPresence ?? "CONGE",
    impactPlanning: sitType?.impactPlanning ?? "NON_PLANIFIABLE",
    impactPaie: sitType?.impactPaie ?? fallbackPaie[mappe.type] ?? "A_DETERMINER",
    modeCalculPaie: sitType?.modeCalculPaie ?? "PRORATA_JOURS",
    validationRequise: sitType?.validationRequise ?? true,
    statutWorkflow: "ACTIF",
  };

  const existantes = (
    await db
      .select()
      .from(employeeSituations)
      .where(and(eq(employeeSituations.agenceId, agenceId), eq(employeeSituations.employeeId, employeId)))
  ).map((r) => ({
    id: r.id,
    category: r.category,
    type: r.type,
    subType: r.subType ?? null,
    dateDebut: String(r.dateDebut).slice(0, 10),
    dateFin: r.dateFin ? String(r.dateFin).slice(0, 10) : null,
    dateEffet: r.dateEffet ? String(r.dateEffet).slice(0, 10) : null,
    dureeJours: r.dureeJours ?? null,
    impactContrat: r.impactContrat,
    impactPresence: r.impactPresence,
    impactPlanning: r.impactPlanning,
    impactPaie: r.impactPaie,
    modeCalculPaie: r.modeCalculPaie ?? null,
    validationRequise: r.validationRequise,
    statutWorkflow: r.statutWorkflow,
    notificationEcrite: r.notificationEcrite,
    communicationInspection: r.communicationInspection,
    montantRetenue: r.montantRetenue as string | null,
    anomalie: r.anomalie ?? null,
  }));

  const refus = conflits({ candidate: candidat, existantes }).filter((c) => c.type === "REFUS");
  if (refus.length > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: refus[0].message });
  }

  const [row] = await db
    .insert(employeeSituations)
    .values({
      agenceId,
      employeeId: employeId,
      situationTypeId: sitType?.id ?? null,
      category: mappe.category,
      type: mappe.type,
      name: sitType?.name ?? null,
      dateDebut,
      dateFin,
      dateEffet: dateDebut,
      motif: `Demande de congé #${requestId} approuvée`,
      impactContrat: candidat.impactContrat,
      impactPresence: candidat.impactPresence,
      impactPlanning: candidat.impactPlanning,
      impactPaie: candidat.impactPaie,
      modeCalculPaie: candidat.modeCalculPaie,
      validationRequise: candidat.validationRequise ?? true,
      approbationRequise: false,
      statutWorkflow: "ACTIF",
      provenanceTable: "leave_requests",
      provenanceId: requestId,
      createdBy: userId,
    } as any)
    .returning();

  await db.insert(employeeSituationTransitions).values({
    situationId: row.id,
    fromStatus: null,
    toStatus: "ACTIF",
    acteurId: userId,
    justification: `Approbation de la demande de congé #${requestId}`,
  } as any);
}
