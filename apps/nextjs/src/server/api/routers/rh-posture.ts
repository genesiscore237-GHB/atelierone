import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, employes, attendanceEntries, attendanceCalculations, employeePostures, TYPES_MISSION, hrWorkSchedules, hrGeneralSettings, hrAttendanceSettings } from "@atelierone/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { calculateAttendance, dayThreshold, type DaySchedule } from "~/server/lib/presence-engine";
import { calculerSalaireIntervalle, gainJour, tauxHoraire } from "~/server/lib/rh-posture-engine";

/**
 * RH — POSTURE DES EMPLOYÉS EN TEMPS RÉEL.
 * Pointage en direct par le responsable : arrivée, départ pause, retour pause,
 * départ, mission (début/retour avec motif normalisé). Chaque action dérive la
 * posture courante et alimente l'entrée de présence (4 moments).
 */

const ACTION_POSTURE: Record<string, string> = {
  ARRIVEE: "EN_TRAVAIL",
  DEPART_PAUSE: "EN_PAUSE",
  RETOUR_PAUSE: "EN_TRAVAIL",
  MISSION_DEBUT: "EN_MISSION",
  MISSION_RETOUR: "EN_TRAVAIL",
  DEPART: "HORS_SITE",
};

const heureMaintenant = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const dateAujourdhui = () => new Date().toISOString().slice(0, 10);

export const rhPostureRouter = createTRPCRouter({
  // ─── Pointage en direct (responsable) ───
  pointer: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({
      employeId: z.number().int(),
      action: z.enum(["ARRIVEE", "DEPART_PAUSE", "RETOUR_PAUSE", "MISSION_DEBUT", "MISSION_RETOUR", "DEPART"]),
      motifMission: z.enum(TYPES_MISSION).optional(),
      reference: z.string().max(120).optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [emp] = await db
        .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom, workCycleId: employes.workCycleId, salaireBase: employes.salaireBase, modePaie: employes.modePaie, statut: employes.statut })
        .from(employes)
        .where(and(eq(employes.id, input.employeId), eq(employes.statut, "actif")))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employé actif introuvable." });
      if (input.action === "MISSION_DEBUT" && !input.motifMission) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le motif de mission est obligatoire." });
      }

      const today = dateAujourdhui();
      const now = heureMaintenant();

      // Entrée de présence du jour (upsert) + 4 moments
      const [entry] = await db.select().from(attendanceEntries).where(and(eq(attendanceEntries.employeeId, input.employeId), eq(attendanceEntries.date, today))).limit(1);
      const valeurs: Record<string, unknown> = {};
      if (input.action === "ARRIVEE") valeurs.timeIn = now;
      if (input.action === "DEPART_PAUSE") valeurs.timeInBreak = now;
      if (input.action === "RETOUR_PAUSE") valeurs.timeOutBreak = now;
      if (input.action === "DEPART") valeurs.timeOut = now;
      if (input.action === "MISSION_DEBUT") valeurs.status = "mission";
      if (input.action === "MISSION_RETOUR") valeurs.status = "present";
      if (entry) {
        await db.update(attendanceEntries).set({ ...valeurs, updatedAt: new Date() } as any).where(eq(attendanceEntries.id, entry.id));
      } else {
        await db.insert(attendanceEntries).values({ employeeId: input.employeId, date: today, ...valeurs } as any);
      }

      // Posture : désactiver la posture active du jour, créer la nouvelle
      await db.update(employeePostures).set({ actif: false } as any).where(and(eq(employeePostures.employeeId, input.employeId), eq(employeePostures.date, today), eq(employeePostures.actif, true)));
      const posture = ACTION_POSTURE[input.action];
      const [evt] = await db
        .insert(employeePostures)
        .values({
          employeeId: input.employeId,
          date: today,
          action: input.action,
          posture,
          motifMission: input.motifMission ?? null,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          horodatage: new Date(),
          pointePar: Number(ctx.user.id),
          actif: true,
        } as any)
        .returning();

      // Recalcul de la journée (pause réelle incluse)
      const [entryFinal] = await db.select().from(attendanceEntries).where(and(eq(attendanceEntries.employeeId, input.employeId), eq(attendanceEntries.date, today))).limit(1);
      const [schedule] = emp.workCycleId
        ? await db.select().from(hrWorkSchedules).where(and(eq(hrWorkSchedules.cycleId, emp.workCycleId), eq(hrWorkSchedules.dayOfWeek, new Date().getDay()))).limit(1)
        : [];
      const [settings] = await db.select().from(hrAttendanceSettings).where(eq(hrAttendanceSettings.agenceId, ctx.user.agenceId)).limit(1);
      if (entryFinal && settings) {
        const calc = calculateAttendance({
          timeIn: entryFinal.timeIn ?? null,
          timeOut: entryFinal.timeOut ?? null,
          timeInBreak: entryFinal.timeInBreak ?? null,
          timeOutBreak: entryFinal.timeOutBreak ?? null,
          schedule: (schedule ? {
            startTime: schedule.startTime, endTime: schedule.endTime, breakStart: schedule.breakStart, breakEnd: schedule.breakEnd,
            expectedHours: schedule.expectedHours, overtimeThreshold: schedule.overtimeThreshold, isWorkingDay: schedule.isWorkingDay ?? true,
          } : null) as DaySchedule | null,
          settings: {
            lateToleranceMinutes: settings.lateToleranceMinutes, roundToMinutes: settings.roundToMinutes, autoDeductBreak: settings.autoDeductBreak,
            countEarlyArrival: settings.countEarlyArrival, countLateDeparture: settings.countLateDeparture, autoDeductLate: settings.autoDeductLate,
            autoDeductEarlyDeparture: settings.autoDeductEarlyDeparture, maxNormalHoursPerDay: settings.maxNormalHoursPerDay,
          },
          overtimeAuth: null,
        });
        const [existingCalc] = await db.select({ id: attendanceCalculations.id }).from(attendanceCalculations).where(eq(attendanceCalculations.attendanceEntryId, entryFinal.id)).limit(1);
        const calcValues = {
          employeeId: input.employeId,
          date: today,
          rawMinutes: calc.rawMinutes,
          breakMinutes: calc.breakMinutes,
          workedMinutes: calc.workedMinutes,
          normalMinutes: calc.normalMinutes,
          overtimeMinutes: calc.overtimeMinutes,
          lateMinutes: calc.lateMinutes,
          earlyDepartureMinutes: calc.earlyDepartureMinutes,
          isAbsent: calc.isAbsent,
          codePresence: calc.codePresence,
          calculationDetails: calc.details,
        } as any;
        if (existingCalc) {
          await db.update(attendanceCalculations).set(calcValues).where(eq(attendanceCalculations.id, existingCalc.id));
        } else {
          await db.insert(attendanceCalculations).values({ attendanceEntryId: entryFinal.id, ...calcValues } as any);
        }
      }

      return { success: true, posture, event: evt, entryId: entryFinal?.id };
    }),

  // ─── Vue temps réel : tous les employés, posture + gain du jour ───
  now: rhProcedure.query(async ({ ctx }) => {
    const today = dateAujourdhui();
    const emps = await db
      .select({
        id: employes.id, matricule: employes.matricule, nom: employes.nom, prenom: employes.prenom,
        fonction: employes.fonction, statut: employes.statut, salaireBase: employes.salaireBase,
        modePaie: employes.modePaie, workCycleId: employes.workCycleId,
      })
      .from(employes)
      .where(eq(employes.statut, "actif"))
      .orderBy(employes.nom);

    const [settings] = await db.select().from(hrAttendanceSettings).where(eq(hrAttendanceSettings.agenceId, ctx.user.agenceId)).limit(1);
    const [general] = await db.select().from(hrGeneralSettings).where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId)).limit(1);
    const heuresStd = general?.standardMonthlyHours ? Number(general.standardMonthlyHours) : 225.3;
    const mult = general?.overtimeMultiplier ? Number(general.overtimeMultiplier) : 1.5;

    // Postures actives du jour + entrées de présence du jour
    const ids = emps.map((e) => e.id);
    const postures = ids.length
      ? await db.select().from(employeePostures).where(and(eq(employeePostures.date, today), eq(employeePostures.actif, true), sql`${employeePostures.employeeId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`))
      : [];
    const posturesParEmp = new Map(postures.map((p) => [p.employeeId, p]));
    const entries = ids.length
      ? await db.select().from(attendanceEntries).where(and(eq(attendanceEntries.date, today), sql`${attendanceEntries.employeeId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`))
      : [];
    const entriesParEmp = new Map(entries.map((e) => [e.employeeId, e]));
    const calcs = ids.length
      ? await db.select().from(attendanceCalculations).where(and(eq(attendanceCalculations.date, today), sql`${attendanceCalculations.employeeId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`))
      : [];
    const calcParEmp = new Map(calcs.map((c) => [c.employeeId, c]));

    const toMin = (t: string | null | undefined) => {
    if (!t) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const maintenantMin = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };

  const result = emps.map((e) => {
      const evt = posturesParEmp.get(e.id);
      const entry = entriesParEmp.get(e.id);
      const rate = tauxHoraire(Number(e.salaireBase ?? 0), heuresStd);
      // Gain partiel du jour : travaillé jusqu'à maintenant si le départ n'est pas pointé
      let workedMin = 0;
      const inMin = toMin(entry?.timeIn);
      if (inMin !== null) {
        const finMin = toMin(entry?.timeOut) ?? maintenantMin();
        const pause1 = entry?.timeInBreak && entry?.timeOutBreak ? Math.max(0, toMin(entry.timeOutBreak)! - toMin(entry.timeInBreak)!) : 0;
        const enPauseMaintenant = evt?.posture === "EN_PAUSE" && entry?.timeInBreak;
        const pause2 = enPauseMaintenant ? Math.max(0, maintenantMin() - toMin(entry.timeInBreak)!) : 0;
        workedMin = Math.max(0, finMin - inMin - pause1 - pause2);
      }
      const gain = Math.round(rate * (workedMin / 60) * 100) / 100;
      return {
        id: e.id,
        matricule: e.matricule,
        nom: `${e.prenom ?? ""} ${e.nom}`.trim(),
        fonction: e.fonction ?? null,
        modePaie: e.modePaie,
        salaireBase: Number(e.salaireBase ?? 0),
        tauxHoraire: rate,
        posture: evt?.posture ?? "ABSENT",
        action: evt?.action ?? null,
        motifMission: evt?.motifMission ?? null,
        reference: evt?.reference ?? null,
        depuis: evt?.horodatage ?? null,
        gainJour: gain,
        pointage: entry
          ? {
              timeIn: entry.timeIn,
              timeInBreak: entry.timeInBreak,
              timeOutBreak: entry.timeOutBreak,
              timeOut: entry.timeOut,
            }
          : null,
      };
    });

    const compteurs = {
      enTravail: result.filter((r) => r.posture === "EN_TRAVAIL").length,
      enPause: result.filter((r) => r.posture === "EN_PAUSE").length,
      enMission: result.filter((r) => r.posture === "EN_MISSION").length,
      horsSite: result.filter((r) => r.posture === "HORS_SITE").length,
      absents: result.filter((r) => r.posture === "ABSENT").length,
    };
    return { employes: result, compteurs, settings: { heuresStandard: heuresStd, majorationHS: mult } };
  }),

  // ─── Timeline d'une journée d'un employé ───
  journee: rhProcedure
    .input(z.object({ employeId: z.number().int(), date: z.string().optional() }))
    .query(async ({ input }) => {
      const d = input.date ?? dateAujourdhui();
      const [entry] = await db.select().from(attendanceEntries).where(and(eq(attendanceEntries.employeeId, input.employeId), eq(attendanceEntries.date, d))).limit(1);
      const [calc] = await db.select().from(attendanceCalculations).where(and(eq(attendanceCalculations.employeeId, input.employeId), eq(attendanceCalculations.date, d))).limit(1);
      const events = await db.select().from(employeePostures).where(and(eq(employeePostures.employeeId, input.employeId), eq(employeePostures.date, d))).orderBy(desc(employeePostures.horodatage));
      return { date: d, pointage: entry, calcul: calc, events };
    }),

  // ─── Salaire sur intervalle (base présences) ───
  salaireIntervalle: rhProcedure
    .input(z.object({ employeId: z.number().int(), dateDebut: z.string(), dateFin: z.string() }))
    .query(async ({ ctx, input }) => {
      const [emp] = await db
        .select({ id: employes.id, salaireBase: employes.salaireBase, modePaie: employes.modePaie, nom: employes.nom, prenom: employes.prenom })
        .from(employes)
        .where(eq(employes.id, input.employeId))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employé introuvable." });
      const [general] = await db.select().from(hrGeneralSettings).where(eq(hrGeneralSettings.agenceId, ctx.user.agenceId)).limit(1);
      const heuresStd = general?.standardMonthlyHours ? Number(general.standardMonthlyHours) : 225.3;
      const mult = general?.overtimeMultiplier ? Number(general.overtimeMultiplier) : 1.5;

      const calcs = await db
        .select()
        .from(attendanceCalculations)
        .where(and(eq(attendanceCalculations.employeeId, input.employeId), sql`${attendanceCalculations.date} >= ${input.dateDebut} AND ${attendanceCalculations.date} <= ${input.dateFin}`))
        .orderBy(attendanceCalculations.date);
      // Primes de tâche : portées par l'entrée de présence (pas le calcul)
      const entriesPresence = await db
        .select({ date: attendanceEntries.date, taskBonus: attendanceEntries.taskBonus })
        .from(attendanceEntries)
        .where(and(eq(attendanceEntries.employeeId, input.employeId), sql`${attendanceEntries.date} >= ${input.dateDebut} AND ${attendanceEntries.date} <= ${input.dateFin}`));
      const primeParDate = new Map(entriesPresence.map((e) => [String(e.date), Number(e.taskBonus ?? 0)]));
      const entries = calcs.map((c) => ({
        workedMinutes: c.workedMinutes ?? 0,
        overtimeMinutes: c.overtimeMinutes ?? 0,
        taskBonus: primeParDate.get(String(c.date)) ?? 0,
        isAbsent: c.isAbsent ?? false,
      }));

      const resultat = calculerSalaireIntervalle({
        salaireBase: Number(emp.salaireBase ?? 0),
        standardMonthlyHours: heuresStd,
        overtimeMultiplier: mult,
        joursOuvresMois: 26,
        entries,
      });
      return { employe: { id: emp.id, nom: `${emp.prenom ?? ""} ${emp.nom}`.trim() }, dateDebut: input.dateDebut, dateFin: input.dateFin, resultat, nbJours: calcs.length };
    }),

  // ─── Historique des postures ───
  historique: rhProcedure
    .input(z.object({ employeId: z.number().int().optional(), dateDebut: z.string().optional(), limit: z.number().int().default(100) }).optional())
    .query(async ({ ctx, input }) => {
      return db
        .select({
          id: employeePostures.id,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          date: employeePostures.date,
          action: employeePostures.action,
          posture: employeePostures.posture,
          motifMission: employeePostures.motifMission,
          reference: employeePostures.reference,
          notes: employeePostures.notes,
          horodatage: employeePostures.horodatage,
        })
        .from(employeePostures)
        .leftJoin(employes, eq(employeePostures.employeeId, employes.id))
        .where(and(
          input?.employeId ? eq(employeePostures.employeeId, input.employeId) : undefined,
          input?.dateDebut ? sql`${employeePostures.date} >= ${input.dateDebut}` : undefined,
        ))
        .orderBy(desc(employeePostures.horodatage))
        .limit(input?.limit ?? 100);
    }),

  motifsMission: rhProcedure.query(async () => TYPES_MISSION),
});