import { db } from "~/server/db";
import {
  employes,
  attendanceEntries,
  attendanceCalculations,
  overtimeAuthorizations,
  attendanceMonthlySummaries,
  hrWorkSchedules,
  hrAttendanceSettings,
  hrPublicHolidays,
  hrGeneralSettings,
  employeePostures,
} from "@atelierone/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { calculateAttendance } from "~/server/lib/presence-engine";

/**
 * PROJECTION — la journée d'un employé est une projection dérivée de la
 * timeline d'événements (employee_postures), source canonique immuable.
 *
 * reconstruireJournee(employeId, date) :
 *   1. lit les événements valides (non annulés) du jour, triés
 *   2. dérive les 4 moments + le statut (les valeurs legacy de la ligne sont
 *      conservées pour les moments sans événement — journée « d'origine saisie »)
 *   3. écrit la ligne du jour + recalcule (runCalculation)
 *   4. met à jour la posture active (dernier événement non annulé)
 *
 * Appelée après CHAQUE mutation (pointage, annulation, correction, statut) :
 * les deux modules (Pointage en direct et Présences) lisent toujours la même
 * projection, à l'instant.
 */

/** Garde de clôture : le mois de la date est-il verrouillé (résumé clôturé pour l'agence) ? */
export async function moisCloture(agenceId: number, date: string): Promise<boolean> {
  const [locked] = await db
    .select({ id: attendanceMonthlySummaries.id })
    .from(attendanceMonthlySummaries)
    .innerJoin(employes, eq(attendanceMonthlySummaries.employeeId, employes.id))
    .where(
      and(
        eq(employes.agenceId, agenceId),
        eq(attendanceMonthlySummaries.year, Number(date.slice(0, 4))),
        eq(attendanceMonthlySummaries.month, Number(date.slice(5, 7))),
        eq(attendanceMonthlySummaries.locked, true),
      )
    )
    .limit(1);
  return !!locked;
}

/** Moteur : calcul + persistance du résultat (partagé pointage/présence). */
export async function runCalculation(entryId: number, employeeId: number, date: string) {
  const [entry] = await db
    .select()
    .from(attendanceEntries)
    .where(eq(attendanceEntries.id, entryId))
    .limit(1);
  if (!entry) return;

  const [emp] = await db
    .select({ workCycleId: employes.workCycleId, agenceId: employes.agenceId })
    .from(employes)
    .where(eq(employes.id, employeeId))
    .limit(1);
  if (!emp?.workCycleId) return;
  const entryAgenceId = emp.agenceId ?? 0;

  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();

  const [schedule] = await db
    .select()
    .from(hrWorkSchedules)
    .where(and(eq(hrWorkSchedules.cycleId, emp.workCycleId), eq(hrWorkSchedules.dayOfWeek, dayOfWeek)))
    .limit(1);

  const [settingsRow] = await db
    .select()
    .from(hrAttendanceSettings)
    .where(eq(hrAttendanceSettings.agenceId, entryAgenceId))
    .limit(1);

  const [holiday] = await db
    .select({ id: hrPublicHolidays.id })
    .from(hrPublicHolidays)
    .where(eq(hrPublicHolidays.date, date))
    .limit(1);

  const [ot] = await db
    .select({ maxHours: overtimeAuthorizations.maxHours, status: overtimeAuthorizations.status })
    .from(overtimeAuthorizations)
    .where(
      and(
        eq(overtimeAuthorizations.employeeId, employeeId),
        eq(overtimeAuthorizations.date, date),
        eq(overtimeAuthorizations.status, "approuvee"),
      )
    )
    .limit(1);

  const [generalRow] = await db
    .select({ defaultOvertimeThreshold: hrGeneralSettings.defaultOvertimeThreshold })
    .from(hrGeneralSettings)
    .where(eq(hrGeneralSettings.agenceId, entryAgenceId))
    .limit(1);

  const result = calculateAttendance({
    timeIn: entry.timeIn,
    timeInBreak: entry.timeInBreak ?? null,
    timeOutBreak: entry.timeOutBreak ?? null,
    timeOut: entry.timeOut,
    schedule: schedule ?? null,
    settings: {
      lateToleranceMinutes: settingsRow?.lateToleranceMinutes ?? 0,
      roundToMinutes: settingsRow?.roundToMinutes ?? 0,
      autoDeductBreak: settingsRow?.autoDeductBreak ?? true,
      countEarlyArrival: settingsRow?.countEarlyArrival ?? false,
      countLateDeparture: settingsRow?.countLateDeparture ?? false,
      autoDeductLate: settingsRow?.autoDeductLate ?? true,
      autoDeductEarlyDeparture: settingsRow?.autoDeductEarlyDeparture ?? true,
      maxNormalHoursPerDay: settingsRow?.maxNormalHoursPerDay ?? null,
      defaultOvertimeThreshold: generalRow?.defaultOvertimeThreshold ?? null,
    },
    overtimeAuth: ot ? { maxHours: ot.maxHours, status: ot.status } : null,
    isPublicHoliday: !!holiday,
    validateEarlyArrival: entry.validateEarlyArrival ?? false,
    validateLateDeparture: entry.validateLateDeparture ?? false,
  });

  const [existingCalc] = await db
    .select({ id: attendanceCalculations.id })
    .from(attendanceCalculations)
    .where(eq(attendanceCalculations.attendanceEntryId, entryId))
    .limit(1);

  const values = {
    employeeId,
    date,
    rawMinutes: result.rawMinutes,
    breakMinutes: result.breakMinutes,
    workedMinutes: result.workedMinutes,
    normalMinutes: result.normalMinutes,
    overtimeMinutes: result.overtimeMinutes,
    lateMinutes: result.lateMinutes,
    earlyDepartureMinutes: result.earlyDepartureMinutes,
    isAbsent: result.isAbsent,
    codePresence: result.codePresence,
    calculationDetails: result.details,
    calculatedAt: new Date(),
  };

  if (existingCalc) {
    await db
      .update(attendanceCalculations)
      .set(values as any)
      .where(eq(attendanceCalculations.id, existingCalc.id));
  } else {
    await db.insert(attendanceCalculations).values({ attendanceEntryId: entryId, ...values } as any);
  }
}

const ACTION_MOMENT_LO: Record<string, string | null> = {
  ARRIVEE: "timeIn",
  DEPART_PAUSE: "timeInBreak",
  RETOUR_PAUSE: "timeOutBreak",
  DEPART: "timeOut",
  SAISIE_HEURE: null,
  MISSION_DEBUT: null,
  MISSION_RETOUR: null,
  STATUT: null,
};

/**
 * Rejoue la timeline du jour et dérive la ligne de présence + la posture active.
 * Retourne la ligne mise à jour (ou null si aucune donnée).
 */
export async function reconstruireJournee(employeId: number, date: string) {
  const [emp] = await db
    .select({ agenceId: employes.agenceId })
    .from(employes)
    .where(eq(employes.id, employeId))
    .limit(1);
  if (!emp) return null;

  // 1. Événements du jour (tous, y compris annulés) — tri stable horodatage + id
  const events = await db
    .select()
    .from(employeePostures)
    .where(and(eq(employeePostures.employeeId, employeId), eq(employeePostures.date, date)))
    .orderBy(asc(employeePostures.horodatage), asc(employeePostures.id));
  const validEvents = events.filter((e) => !e.annule);
  const aDesEvenements = events.length > 0;

  // 2. Ligne existante — le legacy ne vaut que pour une journée SANS timeline
  const [existing] = await db
    .select()
    .from(attendanceEntries)
    .where(and(eq(attendanceEntries.employeeId, employeId), eq(attendanceEntries.date, date)))
    .limit(1);

  // 3. Dérivation des 4 moments : dernier événement valide du moment → son heure
  //    (journée gérée par timeline = pur ; journée legacy = ligne telle quelle)
  const moments: Record<string, string | null> = {
    timeIn: aDesEvenements ? null : (existing?.timeIn ?? null),
    timeInBreak: aDesEvenements ? null : (existing?.timeInBreak ?? null),
    timeOutBreak: aDesEvenements ? null : (existing?.timeOutBreak ?? null),
    timeOut: aDesEvenements ? null : (existing?.timeOut ?? null),
  };
  for (const evt of validEvents) {
    let moment = ACTION_MOMENT_LO[evt.action];
    if (evt.action === "SAISIE_HEURE") {
      // L'événement porte le moment ciblé dans notes (« timeIn=08:00 »)
      moment = (evt.notes ?? "").split("=")[0];
    }
    if (moment && moment in moments) {
      moments[moment] = evt.heureEvenement ?? evt.horodatage?.toTimeString?.().slice(0, 8) ?? moments[moment];
    }
  }

  // 4. Statut dérivé (pur si timeline, sinon legacy)
  let status = aDesEvenements ? "present" : (existing?.status ?? "present");
  if (aDesEvenements) {
    const statutEvent = validEvents.filter((e) => e.action === "STATUT").sort((a, b) => a.id - b.id);
    const missionDeb = validEvents.filter((e) => e.action === "MISSION_DEBUT").sort((a, b) => a.id - b.id);
    const missionRet = validEvents.filter((e) => e.action === "MISSION_RETOUR").sort((a, b) => a.id - b.id);
    if (statutEvent.length > 0) {
      status = statutEvent[statutEvent.length - 1].posture === "CONGE" ? "conge" : statutEvent[statutEvent.length - 1].posture === "MALADIE" ? "maladie" : "absent";
    } else if (missionDeb.length > missionRet.length) {
      status = "mission";
    }
  }

  // 5. Écriture de la ligne (projection)
  let entryId = existing?.id;
  if (existing) {
    await db
      .update(attendanceEntries)
      .set({ timeIn: moments.timeIn, timeInBreak: moments.timeInBreak, timeOutBreak: moments.timeOutBreak, timeOut: moments.timeOut, status, updatedAt: new Date() } as any)
      .where(eq(attendanceEntries.id, existing.id));
    entryId = existing.id;
  } else if (moments.timeIn || moments.timeOut || status !== "present") {
    const [row] = await db
      .insert(attendanceEntries)
      .values({
        employeeId: employeId,
        date,
        timeIn: moments.timeIn,
        timeInBreak: moments.timeInBreak,
        timeOutBreak: moments.timeOutBreak,
        timeOut: moments.timeOut,
        status,
        source: validEvents.length > 0 ? "direct" : "manual",
      } as any)
      .returning();
    entryId = row.id;
  } else {
    return null;
  }

  // 6. Recalcul (pause réelle incluse)
  if (entryId) {
    await runCalculation(entryId, employeId, date);
  }

  // 7. Posture active = dernier événement valide (ou dérivée de la ligne legacy)
  const latest = validEvents[validEvents.length - 1] ?? null;
  await db
    .update(employeePostures)
    .set({ actif: false } as any)
    .where(and(eq(employeePostures.employeeId, employeId), eq(employeePostures.date, date), eq(employeePostures.actif, true)));
  if (latest) {
    await db.update(employeePostures).set({ actif: true } as any).where(eq(employeePostures.id, latest.id));
  }

  const [final] = await db.select().from(attendanceEntries).where(eq(attendanceEntries.id, entryId)).limit(1);
  return { entry: final, postureActive: latest?.posture ?? null, status, moments };
}

/** Annule (invalide, tracé) un événement puis rejoue la journée.
 *  La pause est un bloc : annuler un côté invalide l'autre côté du même bloc. */
export async function annulerEvenement(evenementId: number, motif: string, par: number) {
  const [evt] = await db.select().from(employeePostures).where(eq(employeePostures.id, evenementId)).limit(1);
  if (!evt) return null;
  const aAnnuler: number[] = [evt.id];
  if (evt.action === "DEPART_PAUSE") {
    const [retour] = await db
      .select({ id: employeePostures.id })
      .from(employeePostures)
      .where(and(
        eq(employeePostures.employeeId, evt.employeeId),
        eq(employeePostures.date, evt.date),
        eq(employeePostures.action, "RETOUR_PAUSE"),
        eq(employeePostures.annule, false),
      ))
      .orderBy(asc(employeePostures.id))
      .limit(1);
    if (retour) aAnnuler.push(retour.id);
  } else if (evt.action === "RETOUR_PAUSE") {
    const [depart] = await db
      .select({ id: employeePostures.id })
      .from(employeePostures)
      .where(and(
        eq(employeePostures.employeeId, evt.employeeId),
        eq(employeePostures.date, evt.date),
        eq(employeePostures.action, "DEPART_PAUSE"),
        eq(employeePostures.annule, false),
      ))
      .orderBy(desc(employeePostures.id))
      .limit(1);
    if (depart) aAnnuler.push(depart.id);
  }
  for (const id of aAnnuler) {
    await db
      .update(employeePostures)
      .set({ annule: true, annulePar: par, motifAnnulation: motif, annuleA: new Date() } as any)
      .where(eq(employeePostures.id, id));
  }
  return reconstruireJournee(evt.employeeId, evt.date);
}

/** Heure effective d'un événement (heureEvenement sinon heure du horodatage). */
export function heureEvenement(evt: { heureEvenement: string | null; horodatage: Date | null }): string | null {
  return evt.heureEvenement ?? (evt.horodatage ? evt.horodatage.toTimeString().slice(0, 8) : null);
}