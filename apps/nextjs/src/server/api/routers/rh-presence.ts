import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  employes,
  attendanceEntries,
  attendanceCalculations,
  attendanceMonthlySummaries,
  overtimeAuthorizations,
  hrWorkCycles,
  employeePostures,
} from "@atelierone/db";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { runCalculation, moisCloture, reconstruireJournee } from "~/server/lib/rh-projection";

const ENTRY_STATUS = ["present", "absent", "conge", "maladie", "mission"] as const;
const OT_STATUS = ["en_attente", "approuvee", "refusee"] as const;

/**
 * Saisie tracée : une heure posée dans la grille devient un événement
 * SAISIE_HEURE (l'ancien événement du moment est invalidé), un statut devient
 * un événement STATUT — la journée est ensuite recalculée par la projection.
 */
async function poserEvenementsSaisie(
  employeId: number,
  date: string,
  champs: { timeIn?: string | null; timeOut?: string | null; timeInBreak?: string | null; timeOutBreak?: string | null; status?: string; motifMission?: string | null; reference?: string | null },
  par: number
) {
  const MOMENT_ACTION: Record<string, { action: string; posture: string }> = {
    timeIn: { action: "SAISIE_HEURE", posture: "EN_TRAVAIL" },
    timeInBreak: { action: "SAISIE_HEURE", posture: "EN_PAUSE" },
    timeOutBreak: { action: "SAISIE_HEURE", posture: "EN_TRAVAIL" },
    timeOut: { action: "SAISIE_HEURE", posture: "HORS_SITE" },
  };
  for (const [champ, valeur] of Object.entries(champs)) {
    if (champ === "status") {
      if (valeur === "mission") {
        // Mission posée depuis la grille → événement MISSION_DEBUT (motif + référence)
        await db
          .update(employeePostures)
          .set({ annule: true, annulePar: par, motifAnnulation: "Remplacé par une nouvelle saisie", annuleA: new Date() } as any)
          .where(and(eq(employeePostures.employeeId, employeId), eq(employeePostures.date, date), eq(employeePostures.action, "MISSION_DEBUT"), eq(employeePostures.annule, false)));
        await db.insert(employeePostures).values({
          employeeId: employeId,
          date,
          action: "MISSION_DEBUT",
          posture: "EN_MISSION",
          motifMission: champs.motifMission ?? "AUTRE",
          reference: champs.reference ?? null,
          notes: "Mission saisie en présence",
          horodatage: new Date(),
          pointePar: par,
          actif: true,
        } as any);
      } else {
        const POSTURE: Record<string, string> = { conge: "CONGE", maladie: "MALADIE", absent: "ABSENT" };
        const posture = POSTURE[valeur ?? "present"];
        await db
          .update(employeePostures)
          .set({ annule: true, annulePar: par, motifAnnulation: "Remplacé par une nouvelle saisie", annuleA: new Date() } as any)
          .where(and(eq(employeePostures.employeeId, employeId), eq(employeePostures.date, date), eq(employeePostures.action, "STATUT"), eq(employeePostures.annule, false)));
        if (posture) {
          await db.insert(employeePostures).values({
            employeeId: employeId,
            date,
            action: "STATUT",
            posture,
            motifMission: null,
            reference: null,
            notes: `Statut saisi en présence : ${valeur}`,
            horodatage: new Date(),
            pointePar: par,
            actif: true,
          } as any);
        }
      }
      continue;
    }
    if (champ === "motifMission" || champ === "reference" || valeur === undefined) continue;
    const spec = MOMENT_ACTION[champ];
    if (!spec) continue;
    // Invalider l'événement actuel de ce moment
    const current = await db
      .select({ id: employeePostures.id })
      .from(employeePostures)
      .where(and(
        eq(employeePostures.employeeId, employeId),
        eq(employeePostures.date, date),
        eq(employeePostures.action, "SAISIE_HEURE"),
        eq(employeePostures.annule, false),
      ));
    for (const evt of current) {
      const [row] = await db.select().from(employeePostures).where(eq(employeePostures.id, evt.id)).limit(1);
      if (row?.notes?.includes(`${champ}=`)) {
        await db.update(employeePostures).set({ annule: true, annulePar: par, motifAnnulation: "Heure corrigée", annuleA: new Date() } as any).where(eq(employeePostures.id, evt.id));
      }
    }
    await db.insert(employeePostures).values({
      employeeId: employeId,
      date,
      action: spec.action,
      posture: spec.posture,
      motifMission: null,
      reference: null,
      notes: `${champ}=${valeur ?? ""}`,
      horodatage: new Date(),
      heureEvenement: valeur,
      pointePar: par,
      actif: true,
    } as any);
  }
}

/** RH-02 — Présences & temps de travail */
export const rhPresenceRouter = createTRPCRouter({
  // ─── Saisie quotidienne (simple ou en lot) ───
saveEntry: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        employeeId: z.number().int(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        timeIn: z.string().nullable().optional(),
        timeOut: z.string().nullable().optional(),
        // Pointage en direct : pause réelle (départ/retour) — corrections possibles ici aussi
        timeInBreak: z.string().nullable().optional(),
        timeOutBreak: z.string().nullable().optional(),
        status: z.enum(ENTRY_STATUS).default("present"),
        notes: z.string().optional(),
        motifMission: z.string().max(40).optional(),
        reference: z.string().max(120).optional(),
    // specs MVP - validation admin par ligne + prime de tâche
        validateEarlyArrival: z.boolean().optional(),
        validateLateDeparture: z.boolean().optional(),
        taskBonus: z.number().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      if (await moisCloture(agenceId, input.date)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce mois est clôturé — le pointage est verrouillé." });
      }
      const [emp] = await db
        .select({ id: employes.id, workCycleId: employes.workCycleId })
        .from(employes)
        .where(and(eq(employes.id, input.employeeId), eq(employes.agenceId, agenceId)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employé introuvable." });
if (emp.workCycleId === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun cycle de travail affecté à cet employé (voir sa fiche)." });
      }

      // Saisie tracée : heures → événements SAISIE_HEURE, statut → événement STATUT/MISSION_DEBUT
      await poserEvenementsSaisie(
        input.employeeId,
        input.date,
        {
          timeIn: input.timeIn,
          timeOut: input.timeOut,
          timeInBreak: input.timeInBreak,
          timeOutBreak: input.timeOutBreak,
          status: input.status,
          motifMission: input.motifMission,
          reference: input.reference,
        },
        Number(ctx.user.id)
      );

      // Projection : la journée est recalculée depuis la timeline (ligne garantie)
      const proj = await reconstruireJournee(input.employeeId, input.date);

      // Attributs de journée (primes, validations, notes) — appliqués APRÈS la projection
      const [existing] = await db
        .select({ id: attendanceEntries.id })
        .from(attendanceEntries)
        .where(and(eq(attendanceEntries.employeeId, input.employeeId), eq(attendanceEntries.date, input.date)))
        .limit(1);
      const attrs: Record<string, unknown> = {
        notes: input.notes ?? null,
        validateEarlyArrival: input.validateEarlyArrival ?? false,
        validateLateDeparture: input.validateLateDeparture ?? false,
        updatedAt: new Date(),
      };
      if (input.taskBonus != null) attrs.taskBonus = String(input.taskBonus);
      if (existing) {
        await db.update(attendanceEntries).set(attrs as any).where(eq(attendanceEntries.id, existing.id));
      }
      // Recalcul si des validations admin ou primes ont changé (le calcul précède les attributs)
      if (existing && (input.validateLateDeparture != null || input.validateEarlyArrival != null || input.taskBonus != null)) {
        await runCalculation(existing.id, input.employeeId, input.date);
      }
      return { id: proj?.entry?.id ?? existing?.id };
    }),

  saveBatch: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        rows: z.array(
          z.object({
            employeeId: z.number().int(),
            timeIn: z.string().nullable().optional(),
            timeOut: z.string().nullable().optional(),
            status: z.enum(ENTRY_STATUS).default("present"),
            validateEarlyArrival: z.boolean().optional(),
            validateLateDeparture: z.boolean().optional(),
            taskBonus: z.number().min(0).optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (await moisCloture(ctx.user.agenceId, input.date)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce mois est clôturé — le pointage est verrouillé." });
      }
      const results: { employeeId: number; ok: boolean; error?: string }[] = [];
      for (const row of input.rows) {
        try {
          await saveSingle(ctx.user, input.date, row as any);
          results.push({ employeeId: row.employeeId, ok: true });
        } catch (e) {
          results.push({ employeeId: row.employeeId, ok: false, error: (e as Error).message });
        }
      }
      return results;
    }),

  // ─── Historique ───
  listEntries: rhProcedure
    .input(
      z.object({
        employeeId: z.number().int().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().min(10).max(200).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [
        eq(employes.agenceId, ctx.user.agenceId),
      ];
      if (safe.employeeId) conditions.push(eq(attendanceEntries.employeeId, safe.employeeId));
      if (safe.from) conditions.push(gte(attendanceEntries.date, safe.from));
      if (safe.to) conditions.push(lte(attendanceEntries.date, safe.to));

const rows = await db
        .select({
          id: attendanceEntries.id,
          employeeId: attendanceEntries.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          matricule: employes.matricule,
          date: attendanceEntries.date,
          timeIn: attendanceEntries.timeIn,
          timeOut: attendanceEntries.timeOut,
          status: attendanceEntries.status,
          notes: attendanceEntries.notes,
          validateEarlyArrival: attendanceEntries.validateEarlyArrival,
          validateLateDeparture: attendanceEntries.validateLateDeparture,
          taskBonus: attendanceEntries.taskBonus,
          validated: attendanceEntries.validated,
        })
        .from(attendanceEntries)
        .innerJoin(employes, eq(attendanceEntries.employeeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(attendanceEntries.date))
        .limit((input ?? {}).limit ?? 50);

const ids = rows.map((r) => r.id);
      const calcs = ids.length
        ? await db
            .select()
            .from(attendanceCalculations)
            .where(inArray(attendanceCalculations.attendanceEntryId, ids))
        : [];

      return rows.map((r) => ({
        ...r,
        calculation: calcs.find((c) => c.attendanceEntryId === r.id) ?? null,
      }));
    }),

  // ─── Autorisations HS ───
  listOvertime: rhProcedure
    .input(z.object({ employeeId: z.number().int().optional(), date: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.employeeId) conditions.push(eq(overtimeAuthorizations.employeeId, safe.employeeId));
      if (safe.date) conditions.push(eq(overtimeAuthorizations.date, safe.date));
      return db
        .select({
          id: overtimeAuthorizations.id,
          employeeId: overtimeAuthorizations.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          date: overtimeAuthorizations.date,
          maxHours: overtimeAuthorizations.maxHours,
          reason: overtimeAuthorizations.reason,
          status: overtimeAuthorizations.status,
          createdAt: overtimeAuthorizations.createdAt,
        })
        .from(overtimeAuthorizations)
        .innerJoin(employes, eq(overtimeAuthorizations.employeeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(overtimeAuthorizations.date));
    }),

  requestOvertime: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        employeeId: z.number().int(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        maxHours: z.number().min(0.5).max(12),
        reason: z.string().min(3, "Le motif est obligatoire"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(overtimeAuthorizations)
        .values({ ...input, status: "en_attente" } as any)
        .returning();
      return row;
    }),

  decideOvertime: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number().int(), status: z.enum(["approuvee", "refusee"]) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .update(overtimeAuthorizations)
        .set({ status: input.status, authorizedBy: Number(ctx.user.id), authorizedAt: new Date() } as any)
        .where(eq(overtimeAuthorizations.id, input.id))
        .returning();
      return row;
    }),

  // ─── Clôture mensuelle ───
  closeMonth: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const monthStart = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
      const nextMonth = input.month === 12 ? input.year + 1 : input.year;
      const nextMonthNum = input.month === 12 ? 1 : input.month + 1;
      const monthEnd = `${nextMonth}-${String(nextMonthNum).padStart(2, "0")}-01`;

      const employees = await db
        .select({ id: employes.id })
        .from(employes)
        .where(eq(employes.agenceId, agenceId));

      const calcs = await db
        .select({
          employeeId: attendanceEntries.employeeId,
          isAbsent: attendanceCalculations.isAbsent,
          normalMinutes: attendanceCalculations.normalMinutes,
          overtimeMinutes: attendanceCalculations.overtimeMinutes,
          lateMinutes: attendanceCalculations.lateMinutes,
          taskBonus: attendanceEntries.taskBonus,
        })
        .from(attendanceCalculations)
        .innerJoin(attendanceEntries, eq(attendanceCalculations.attendanceEntryId, attendanceEntries.id))
        .innerJoin(employes, eq(attendanceEntries.employeeId, employes.id))
        .where(
          and(
            gte(attendanceEntries.date, monthStart),
            lte(attendanceEntries.date, monthEnd),
            eq(employes.agenceId, agenceId),
          )
        );

      const byEmployee = new Map<number, typeof calcs>();
      calcs.forEach((c) => {
        const list = byEmployee.get(c.employeeId) ?? [];
        list.push(c);
        byEmployee.set(c.employeeId, list);
      });

      let summaries = 0;
      for (const emp of employees) {
        const list = byEmployee.get(emp.id) ?? [];
        const daysPresent = list.filter((c) => !c.isAbsent).length;
        const daysAbsent = list.filter((c) => c.isAbsent).length;

        const [existing] = await db
          .select({ id: attendanceMonthlySummaries.id })
          .from(attendanceMonthlySummaries)
          .where(
            and(
              eq(attendanceMonthlySummaries.employeeId, emp.id),
              eq(attendanceMonthlySummaries.year, input.year),
              eq(attendanceMonthlySummaries.month, input.month),
            )
          )
          .limit(1);

        const values = {
          totalNormalMinutes: list.reduce((s, c) => s + (c.normalMinutes ?? 0), 0),
          totalOvertimeMinutes: list.reduce((s, c) => s + (c.overtimeMinutes ?? 0), 0),
          totalLateMinutes: list.reduce((s, c) => s + (c.lateMinutes ?? 0), 0),
          totalTaskBonus: String(list.reduce((s, c) => s + Number(c.taskBonus ?? 0), 0)),
          daysPresent,
          daysAbsent,
          locked: true,
          lockedAt: new Date(),
          lockedBy: Number(ctx.user.id),
          updatedAt: new Date(),
        };
        if (existing) {
          await db
            .update(attendanceMonthlySummaries)
            .set(values as any)
            .where(eq(attendanceMonthlySummaries.id, existing.id));
        } else {
          await db.insert(attendanceMonthlySummaries).values({
            employeeId: emp.id,
            year: input.year,
            month: input.month,
            ...values,
          } as any);
        }
        summaries++;
      }
      return { summaries };
    }),

  listSummaries: rhProcedure
    .input(z.object({ year: z.number().int().optional(), month: z.number().int().min(1).max(12).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.year) conditions.push(eq(attendanceMonthlySummaries.year, safe.year));
      if (safe.month) conditions.push(eq(attendanceMonthlySummaries.month, safe.month));
      return db
        .select({
          id: attendanceMonthlySummaries.id,
          employeeId: attendanceMonthlySummaries.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          matricule: employes.matricule,
          year: attendanceMonthlySummaries.year,
          month: attendanceMonthlySummaries.month,
totalNormalMinutes: attendanceMonthlySummaries.totalNormalMinutes,
          totalOvertimeMinutes: attendanceMonthlySummaries.totalOvertimeMinutes,
          totalLateMinutes: attendanceMonthlySummaries.totalLateMinutes,
          totalTaskBonus: attendanceMonthlySummaries.totalTaskBonus,
          daysPresent: attendanceMonthlySummaries.daysPresent,
          daysAbsent: attendanceMonthlySummaries.daysAbsent,
          daysOnLeave: attendanceMonthlySummaries.daysOnLeave,
          locked: attendanceMonthlySummaries.locked,
        })
        .from(attendanceMonthlySummaries)
        .innerJoin(employes, eq(attendanceMonthlySummaries.employeeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(attendanceMonthlySummaries.year), desc(attendanceMonthlySummaries.month));
    }),
});

// Réutilisé par saveBatch - saisie tracée (événements + projection)
async function saveSingle(user: { agenceId: number; id: string }, date: string, row: { employeeId: number; timeIn?: string | null; timeOut?: string | null; status?: string; validateEarlyArrival?: boolean; validateLateDeparture?: boolean; taskBonus?: number }) {
  const [emp] = await db
    .select({ id: employes.id, workCycleId: employes.workCycleId })
    .from(employes)
    .where(and(eq(employes.id, row.employeeId), eq(employes.agenceId, user.agenceId)))
    .limit(1);
  if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employé introuvable." });
  if (emp.workCycleId === null) throw new TRPCError({ code: "BAD_REQUEST", message: `Employé ${row.employeeId} sans cycle de travail.` });

  await poserEvenementsSaisie(row.employeeId, date, { timeIn: row.timeIn, timeOut: row.timeOut, status: row.status ?? "present" }, Number(user.id));

  // Projection : la ligne du jour est créée/mise à jour depuis la timeline
  await reconstruireJournee(row.employeeId, date);

  // Attributs de journée (prime, validations) — appliqués APRÈS la projection (ligne garantie)
  const [existing] = await db
    .select({ id: attendanceEntries.id })
    .from(attendanceEntries)
    .where(and(eq(attendanceEntries.employeeId, row.employeeId), eq(attendanceEntries.date, date)))
    .limit(1);
  const attrs: Record<string, unknown> = {
    validateEarlyArrival: row.validateEarlyArrival ?? false,
    validateLateDeparture: row.validateLateDeparture ?? false,
    updatedAt: new Date(),
  };
  if (row.taskBonus != null) attrs.taskBonus = String(row.taskBonus);
  if (existing) {
    await db.update(attendanceEntries).set(attrs as any).where(eq(attendanceEntries.id, existing.id));
  }
  // Recalcul si des validations admin ou primes ont changé (le calcul précède les attributs)
  if (existing && (row.validateLateDeparture != null || row.validateEarlyArrival != null || row.taskBonus != null)) {
    await runCalculation(existing.id, row.employeeId, date);
  }
}