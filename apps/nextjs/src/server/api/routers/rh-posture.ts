import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, employes, attendanceEntries, attendanceCalculations, employeePostures, TYPES_MISSION, hrGeneralSettings, hrAttendanceSettings, employeeSalaryHistory } from "@atelierone/db";
import { eq, and, desc, asc, sql, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { calculerSalaireIntervalle, gainJour, tauxHoraire } from "~/server/lib/rh-posture-engine";
import { runCalculation, moisCloture, reconstruireJournee, annulerEvenement } from "~/server/lib/rh-projection";

/**
 * RH — POSTURE DES EMPLOYÉS EN TEMPS RÉEL.
 * Pointage en direct par le responsable : arrivée, départ pause, retour pause,
 * départ, mission (début/retour avec motif normalisé). La timeline des
 * événements est la source canonique ; la journée (attendance_entries) est une
 * projection recalculée (reconstruireJournee). Correction = invalidation tracée
 * (annulerEvenement) : jamais de suppression, l'audit est complet.
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
      const today = dateAujourdhui();
      if (await moisCloture(ctx.user.agenceId, today)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le mois courant est clôturé — le pointage en direct est verrouillé." });
      }
      const [emp] = await db
        .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom, workCycleId: employes.workCycleId, salaireBase: employes.salaireBase, modePaie: employes.modePaie, statut: employes.statut })
        .from(employes)
        .where(and(eq(employes.id, input.employeId), eq(employes.statut, "actif")))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employé actif introuvable." });
      if (input.action === "MISSION_DEBUT" && !input.motifMission) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le motif de mission est obligatoire." });
      }

      // R1 — séquence logique : chaque action exige son prérequis (non annulé)
      const REQUIS: Record<string, string> = {
        DEPART_PAUSE: "ARRIVEE",
        RETOUR_PAUSE: "DEPART_PAUSE",
        DEPART: "ARRIVEE",
        MISSION_RETOUR: "MISSION_DEBUT",
      };
      const requis = REQUIS[input.action];
      if (requis) {
        const [pre] = await db
          .select({ id: employeePostures.id })
          .from(employeePostures)
          .where(and(
            eq(employeePostures.employeeId, input.employeId),
            eq(employeePostures.date, today),
            eq(employeePostures.annule, false),
            requis === "ARRIVEE"
              ? sql`(${employeePostures.action} = 'ARRIVEE' OR (${employeePostures.action} = 'SAISIE_HEURE' AND ${employeePostures.notes} LIKE 'timeIn=%'))`
              : eq(employeePostures.action, requis),
          ))
          .limit(1);
        if (!pre) {
          const LABELS: Record<string, string> = {
            ARRIVEE: "l'arrivée", DEPART_PAUSE: "le départ en pause", RETOUR_PAUSE: "le retour de pause",
            MISSION_DEBUT: "le début de mission", MISSION_RETOUR: "le retour de mission", DEPART: "le départ",
          };
          throw new TRPCError({ code: "BAD_REQUEST", message: `Action impossible : ${LABELS[requis] ?? requis} doit d'abord être pointé(e).` });
        }
      }

      const now = heureMaintenant();
      const nowFull = new Date();

      // Événement (timeline canonique, immuable) — la projection dérive la journée
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
          horodatage: nowFull,
          heureEvenement: input.action === "MISSION_DEBUT" || input.action === "MISSION_RETOUR" ? null : now,
          pointePar: Number(ctx.user.id),
          actif: true,
        } as any)
        .returning();

      // Projection : journée + calcul + posture active recalculés depuis la timeline
      const proj = await reconstruireJournee(input.employeId, today);

      return { success: true, posture, event: evt, entryId: proj?.entry?.id ?? null };
    }),

  // ─── Annulation tracée d'un événement (motif obligatoire) ───
  annulerEvenement: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ evenementId: z.number().int(), motif: z.string().min(3).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const [evt] = await db.select().from(employeePostures).where(eq(employeePostures.id, input.evenementId)).limit(1);
      if (!evt) throw new TRPCError({ code: "NOT_FOUND", message: "Événement introuvable." });
      if (evt.annule) throw new TRPCError({ code: "BAD_REQUEST", message: "Cet événement est déjà annulé." });
      if (await moisCloture(ctx.user.agenceId, evt.date)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce mois est clôturé — l'annulation est verrouillée." });
      }
      const proj = await annulerEvenement(evt.id, input.motif, Number(ctx.user.id));
      return { success: true, postureActive: proj?.postureActive ?? null };
    }),

  // ─── Correction d'heure (1 clic : invalide l'ancien + pose SAISIE_HEURE tracé) ───
  corrigerHeure: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({
      employeId: z.number().int(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      moment: z.enum(["timeIn", "timeInBreak", "timeOutBreak", "timeOut"]),
      heure: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    }))
    .mutation(async ({ ctx, input }) => {
      if (await moisCloture(ctx.user.agenceId, input.date)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce mois est clôturé — la correction est verrouillée." });
      }
      const POSTURE_MOMENT: Record<string, string> = {
        timeIn: "EN_TRAVAIL",
        timeInBreak: "EN_PAUSE",
        timeOutBreak: "EN_TRAVAIL",
        timeOut: "HORS_SITE",
      };
      // Invalider l'événement actuel du moment (le plus récent non annulé)
      const candidats = await db
        .select()
        .from(employeePostures)
        .where(and(
          eq(employeePostures.employeeId, input.employeId),
          eq(employeePostures.date, input.date),
          eq(employeePostures.annule, false),
        ))
        .orderBy(desc(employeePostures.id));
      for (const evt of candidats) {
        const estDuMoment =
          (input.moment === "timeIn" && evt.action === "ARRIVEE") ||
          (input.moment === "timeInBreak" && evt.action === "DEPART_PAUSE") ||
          (input.moment === "timeOutBreak" && evt.action === "RETOUR_PAUSE") ||
          (input.moment === "timeOut" && evt.action === "DEPART") ||
          (evt.action === "SAISIE_HEURE" && (evt.notes ?? "").startsWith(`${input.moment}=`));
        if (estDuMoment) {
          await db
            .update(employeePostures)
            .set({ annule: true, annulePar: Number(ctx.user.id), motifAnnulation: `Heure corrigée (${input.heure})`, annuleA: new Date() } as any)
            .where(eq(employeePostures.id, evt.id));
          break;
        }
      }
      // Poser la nouvelle heure (tracée)
      await db.insert(employeePostures).values({
        employeeId: input.employeId,
        date: input.date,
        action: "SAISIE_HEURE",
        posture: POSTURE_MOMENT[input.moment],
        notes: `${input.moment}=${input.heure}`,
        horodatage: new Date(),
        heureEvenement: input.heure,
        pointePar: Number(ctx.user.id),
        actif: true,
      } as any);
      const proj = await reconstruireJournee(input.employeId, input.date);
      return { success: true, entryId: proj?.entry?.id ?? null };
    }),

  // ─── Annulation du pointage de toute la journée (re-pointe global) ───
  annulerJournee: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ employeId: z.number().int(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), motif: z.string().min(3).max(300) }))
    .mutation(async ({ ctx, input }) => {
      if (await moisCloture(ctx.user.agenceId, input.date)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce mois est clôturé — l'annulation est verrouillée." });
      }
      const evts = await db
        .select({ id: employeePostures.id })
        .from(employeePostures)
        .where(and(eq(employeePostures.employeeId, input.employeId), eq(employeePostures.date, input.date), eq(employeePostures.annule, false)));
      for (const e of evts) {
        await db
          .update(employeePostures)
          .set({ annule: true, annulePar: Number(ctx.user.id), motifAnnulation: input.motif, annuleA: new Date() } as any)
          .where(eq(employeePostures.id, e.id));
      }
      const proj = await reconstruireJournee(input.employeId, input.date);
      return { success: true, annules: evts.length, postureActive: proj?.postureActive ?? null };
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
      const eventsUi = events.map((evt) => ({
        ...evt,
        heure: evt.heureEvenement ?? (evt.horodatage ? evt.horodatage.toTimeString().slice(0, 5) : null),
        pointeParNom: null as string | null,
      }));
      return { date: d, pointage: entry, calcul: calc, events: eventsUi };
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

      // Salaire en vigueur pendant la période : dernière entrée d'historique débutée avant la fin de l'intervalle
      const [histo] = await db
        .select({ baseSalary: employeeSalaryHistory.baseSalary })
        .from(employeeSalaryHistory)
        .where(and(eq(employeeSalaryHistory.employeeId, input.employeId), lte(employeeSalaryHistory.startDate, input.dateFin)))
        .orderBy(desc(employeeSalaryHistory.startDate))
        .limit(1);
      const salairePeriode = histo?.baseSalary != null ? Number(histo.baseSalary) : Number(emp.salaireBase ?? 0);

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
        salaireBase: salairePeriode,
        standardMonthlyHours: heuresStd,
        overtimeMultiplier: mult,
        joursOuvresMois: 26,
        entries,
      });
      return { employe: { id: emp.id, nom: `${emp.prenom ?? ""} ${emp.nom}`.trim() }, dateDebut: input.dateDebut, dateFin: input.dateFin, salaireBase: salairePeriode, salaireHistorique: histo?.baseSalary != null, resultat, nbJours: calcs.length };
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