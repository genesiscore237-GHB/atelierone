import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  employeeSituations,
  employeeSituationTransitions,
  hrSituationTypes,
  employes,
  employeeStatusHistory,
  payrollPeriods,
} from "@atelierone/db";
import { and, desc, eq, gte, isNull, like, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  conflits,
  effet,
  verifierGardeFousMap,
  statutAdministratif,
  veilleDe,
  lendemainDe,
  type SituationLike,
} from "~/server/lib/situations-engine";
import { moisCloture } from "~/server/lib/rh-projection";
import { assertEmployeEnAgence } from "~/server/lib/rh-scope";

const iso = /^\d{4}-\d{2}-\d{2}$/;

/** Type d'une transaction drizzle (helpers partagés create/update/transitions). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const toIso = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
};

/** Reconstruit un `SituationLike` (moteur pur) depuis une ligne. */
function toLike(row: Record<string, unknown>): SituationLike {
  return {
    id: row.id as number,
    category: row.category as string,
    type: row.type as string,
    subType: (row.subType as string) ?? null,
    dateDebut: toIso(row.dateDebut as never) as string,
    dateFin: toIso(row.dateFin as never),
    dateEffet: toIso(row.dateEffet as never),
    dureeJours: row.dureeJours as number | null,
    impactContrat: row.impactContrat as string,
    impactPresence: row.impactPresence as string,
    impactPlanning: row.impactPlanning as string,
    impactPaie: row.impactPaie as string,
    modeCalculPaie: row.modeCalculPaie as string | null,
    validationRequise: row.validationRequise as boolean,
    statutWorkflow: row.statutWorkflow as string,
    notificationEcrite: row.notificationEcrite as boolean,
    communicationInspection: row.communicationInspection as boolean,
    montantRetenue: row.montantRetenue as number | string | null,
    anomalie: row.anomalie as string | null,
  };
}

const situationsOf = async (
  el: Tx,
  employeeId: number,
  agenceId: number
) => {
  const rows = await el
    .select()
    .from(employeeSituations)
    .where(and(eq(employeeSituations.employeeId, employeeId), eq(employeeSituations.agenceId, agenceId)));
  return rows.map(toLike);
};

/** Journal métier (pattern R5 `advance_transitions`) — écrit ET insère la transition. */
async function journal(
  el: Tx,
  opts: {
    situationId: number;
    fromStatus: string | null;
    toStatus: string;
    userId: number;
    justification?: string | null;
    documentUrl?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await el.insert(employeeSituationTransitions).values({
    situationId: opts.situationId,
    fromStatus: opts.fromStatus,
    toStatus: opts.toStatus,
    acteurId: opts.userId,
    justification: opts.justification ?? null,
    documentUrl: opts.documentUrl ?? null,
    metadata: opts.metadata ?? null,
  } as any);
}

async function mettreStatut(
  el: Tx,
  situationId: number,
  fromStatus: string | null,
  toStatus: string,
  userId: number,
  justification?: string | null,
  metadata?: Record<string, unknown>
) {
  await el.update(employeeSituations).set({ statutWorkflow: toStatus, updatedAt: new Date() } as any).where(eq(employeeSituations.id, situationId));
  await journal(el, { situationId, fromStatus, toStatus, userId, justification, metadata });
}

/**
 * D-R6-01 §3 : fait le pont entre les situations ACTIF et le statut administratif
 * dérivé (`suspendu`). Réconcilie `employes.statut` + `employee_status_history`
 * (bornes = date d'effet des situations, jamais « today » arbitraire).
 */
async function reconcilierStatutDerive(
  el: Tx,
  opts: { agenceId: number; employeeId: number; userId: number; pivot?: string | null }
) {
  const { agenceId, employeeId, userId, pivot } = opts;
  const [emp] = await el
    .select({ statut: employes.statut })
    .from(employes)
    .where(and(eq(employes.id, employeeId), eq(employes.agenceId, agenceId)))
    .limit(1);
  if (!emp) return;
  const today = new Date().toISOString().split("T")[0];
  const situations = await situationsOf(el, employeeId, agenceId);
  const derive = statutAdministratif({ statutCourant: emp.statut, situations, date: today });
  if (derive.statut === emp.statut) return;

  const [open] = await el
    .select({ id: employeeStatusHistory.id, startDate: employeeStatusHistory.startDate })
    .from(employeeStatusHistory)
    .where(and(eq(employeeStatusHistory.employeeId, employeeId), isNull(employeeStatusHistory.endDate)))
    .limit(1);

  let startDate = derive.situationDerivante ? effet(derive.situationDerivante) : pivot ?? today;
  // Non-régression temporelle : on ne peut pas « commencer » avant la suspension active.
  if (open && startDate <= (toIso(open.startDate) as string)) {
    startDate = lendemainDe(toIso(open.startDate) as string);
  }
  if (open) {
    await el
      .update(employeeStatusHistory)
      .set({ endDate: veilleDe(startDate), reason: "Statut dérivé des situations RH (R6)" } as any)
      .where(eq(employeeStatusHistory.id, open.id));
  }
  await el.insert(employeeStatusHistory).values({
    employeeId,
    statut: derive.statut,
    startDate,
    reason: `Situation ${derive.situationDerivante?.type ?? derive.statut} (#${derive.situationDerivante?.id ?? "?"})`,
    changedBy: userId,
  } as any);
  await el.update(employes).set({ statut: derive.statut, updatedAt: new Date() } as any).where(eq(employes.id, employeeId));
}

/** §15 — un mois clôturé (présences) ou une période de paie close interdit toute écriture rétroactive. */
async function verifierPeriodeNonCloturee(agenceId: number, debut: string, fin: string): Promise<void> {
  const cursor = new Date(`${debut}T12:00:00`);
  const finDate = new Date(`${fin}T12:00:00`);
  const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const moisVus = new Set<string>();
  while (cursor <= finDate) {
    const cle = `${cursor.getFullYear()}-${cursor.getMonth() + 1}`;
    if (!moisVus.has(cle)) {
      moisVus.add(cle);
      if (await moisCloture(agenceId, `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Moins de ${MOIS_FR[cursor.getMonth()]} ${cursor.getFullYear()} déjà clôturé : impossible d'écrire sur cette période sans procédure corrective.`,
        });
      }
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // §15 — période de paie close croisant l'intervalle : toute écriture rétroactive est refusée
  const [periodeClose] = await db
    .select({ id: payrollPeriods.id, startDate: payrollPeriods.startDate, endDate: payrollPeriods.endDate })
    .from(payrollPeriods)
    .where(
      and(
        eq(payrollPeriods.agenceId, agenceId),
        eq(payrollPeriods.status, "closed"),
        lte(payrollPeriods.startDate, fin),
        gte(payrollPeriods.endDate, debut),
      ),
    )
    .orderBy(payrollPeriods.endDate)
    .limit(1);
  if (periodeClose) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `La période de paie du ${periodeClose.startDate} → ${periodeClose.endDate} est close : impossible d'écrire sur cette période sans procédure corrective.`,
    });
  }
}

const situationInput = z.object({
  employeeId: z.number().int(),
  situationTypeId: z.number().int().optional(),
  category: z.string().min(1),
  type: z.string().min(1),
  subType: z.string().max(60).optional().nullable(),
  dateDebut: z.string().regex(iso, "Date de début invalide"),
  dateFin: z.string().regex(iso, "Date de fin invalide").optional().nullable(),
  dateEffet: z.string().regex(iso, "Date d'effet invalide").optional().nullable(),
  dureeJours: z.number().int().positive().optional().nullable(),
  motif: z.string().optional().nullable(),
  faitReproche: z.string().optional().nullable(),
  commentaire: z.string().optional().nullable(),
  justificatifUrl: z.string().max(500).optional().nullable(),
  notificationEcrite: z.boolean().optional(),
  communicationInspection: z.boolean().optional(),
  detailsFinanciers: z.string().optional().nullable(),
  montantRetenue: z.number().nonnegative().optional().nullable(),
});

export const rhSituationsRouter = createTRPCRouter({
  // ─── Catalogue paramétrable (D-R6-02 §4) ───
  listTypes: requirePermissionProcedure("rh.situation.consulter")
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(hrSituationTypes.agenceId, ctx.user.agenceId), eq(hrSituationTypes.active, true)];
      if (input?.category) conditions.push(eq(hrSituationTypes.category, input.category));
      const rows = await db
        .select()
        .from(hrSituationTypes)
        .where(and(...conditions))
        .orderBy(hrSituationTypes.category, hrSituationTypes.sortOrder);
      return rows;
    }),

  // ─── Liste des situations (fiche / écran cycle de vie) ───
  list: requirePermissionProcedure("rh.situation.consulter")
    .input(
      z
        .object({
          employeeId: z.number().int().optional(),
          category: z.string().optional(),
          statutWorkflow: z.string().optional(),
          from: z.string().regex(iso).optional(),
          to: z.string().regex(iso).optional(),
          search: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employeeSituations.agenceId, ctx.user.agenceId)];
      if (safe.employeeId) conditions.push(eq(employeeSituations.employeeId, safe.employeeId));
      if (safe.category) conditions.push(eq(employeeSituations.category, safe.category));
      if (safe.statutWorkflow) conditions.push(eq(employeeSituations.statutWorkflow, safe.statutWorkflow));
      if (safe.search && safe.search.trim()) {
        const s = `%${safe.search.trim()}%`;
        conditions.push(like(employeeSituations.type, s));
      }
      if (safe.from) conditions.push(eq(employeeSituations.dateDebut, safe.from));
      const rows = await db
        .select({
          id: employeeSituations.id,
          employeeId: employeeSituations.employeeId,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          matricule: employes.matricule,
          category: employeeSituations.category,
          type: employeeSituations.type,
          subType: employeeSituations.subType,
          name: employeeSituations.name,
          situationTypeId: employeeSituations.situationTypeId,
          typeSource: hrSituationTypes.source,
          typeBaseJuridique: hrSituationTypes.baseJuridique,
          typeDureeMaxJours: hrSituationTypes.dureeMaxJours,
          dateDebut: employeeSituations.dateDebut,
          dateFin: employeeSituations.dateFin,
          dateEffet: employeeSituations.dateEffet,
          dureeJours: employeeSituations.dureeJours,
          motif: employeeSituations.motif,
          faitReproche: employeeSituations.faitReproche,
          justificatifUrl: employeeSituations.justificatifUrl,
          notificationEcrite: employeeSituations.notificationEcrite,
          communicationInspection: employeeSituations.communicationInspection,
          impactContrat: employeeSituations.impactContrat,
          impactPresence: employeeSituations.impactPresence,
          impactPlanning: employeeSituations.impactPlanning,
          impactPaie: employeeSituations.impactPaie,
          modeCalculPaie: employeeSituations.modeCalculPaie,
          baseCalculPaie: employeeSituations.baseCalculPaie,
          validationRequise: employeeSituations.validationRequise,
          anomalie: employeeSituations.anomalie,
          statutWorkflow: employeeSituations.statutWorkflow,
          approbateurId: employeeSituations.approbateurId,
          approuveAt: employeeSituations.approuveAt,
          provenanceTable: employeeSituations.provenanceTable,
          provenanceId: employeeSituations.provenanceId,
          createdAt: employeeSituations.createdAt,
        })
        .from(employeeSituations)
        .innerJoin(employes, eq(employeeSituations.employeeId, employes.id))
        .leftJoin(hrSituationTypes, eq(employeeSituations.situationTypeId, hrSituationTypes.id))
        .where(and(...conditions))
        .orderBy(desc(employeeSituations.dateDebut));
      return rows;
    }),

  // ─── Journal des transitions (workflow/H) ───
  listTransitions: requirePermissionProcedure("rh.situation.consulter")
    .input(z.object({ situationId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [sit] = await db
        .select({ agenceId: employeeSituations.agenceId })
        .from(employeeSituations)
        .where(eq(employeeSituations.id, input.situationId))
        .limit(1);
      if (!sit || sit.agenceId !== ctx.user.agenceId) throw new TRPCError({ code: "NOT_FOUND", message: "Situation introuvable." });
      return db
        .select()
        .from(employeeSituationTransitions)
        .where(eq(employeeSituationTransitions.situationId, input.situationId))
        .orderBy(desc(employeeSituationTransitions.createdAt));
    }),

  // ─── Création (workflow ; ABSENCE constat = ACTIF direct) ───
  create: requirePermissionProcedure("rh.situation.modifier")
    .input(situationInput.extend({ statutWorkflow: z.enum(["BROUILLON", "SOUMIS", "ACTIF"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeeId, ctx.user.agenceId);
      if (input.category === "SORTIE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La catégorie SORTIE est réservée à la transition dédiée (rh.employe.sortie)." });
      }

      return db.transaction(async (tx) => {
        const [type] = input.situationTypeId
          ? await tx
              .select()
              .from(hrSituationTypes)
              .where(and(eq(hrSituationTypes.id, input.situationTypeId), eq(hrSituationTypes.agenceId, ctx.user.agenceId)))
              .limit(1)
          : [];
        if (input.situationTypeId && !type) throw new TRPCError({ code: "NOT_FOUND", message: "Type de situation introuvable." });

        const dateFin = input.dateFin ?? null;
        const dateEffet = input.dateEffet ?? input.dateDebut;
        if (dateFin && dateFin < input.dateDebut) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "La date de fin doit suivre la date de début." });
        }
        if (dateEffet < input.dateDebut) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "La date d'effet ne peut pas précéder la date de début." });
        }
        await verifierPeriodeNonCloturee(ctx.user.agenceId, input.dateDebut, dateFin ?? input.dateDebut);

        const candidate: SituationLike = {
          category: input.category,
          type: input.type,
          subType: input.subType ?? null,
          dateDebut: input.dateDebut,
          dateFin,
          dateEffet,
          dureeJours: input.dureeJours ?? null,
          impactContrat: type?.impactContrat ?? "ACTIVE",
          impactPresence: type?.impactPresence ?? "PRESENCE",
          impactPlanning: type?.impactPlanning ?? "PLANIFIE",
          impactPaie: type?.impactPaie ?? "NORMAL",
          modeCalculPaie: type?.modeCalculPaie ?? "PRORATA_JOURS",
          validationRequise: type?.validationRequise ?? true,
          notificationEcrite: input.notificationEcrite ?? false,
          communicationInspection: input.communicationInspection ?? false,
          montantRetenue:
            input.montantRetenue != null
              ? String(input.montantRetenue)
              : (type?.impactPaie === "RETENUE" ? "0" : null),
        };

        const existantes = await situationsOf(tx, input.employeeId, ctx.user.agenceId);
        const cfl = conflits({ candidate, existantes });
        const refus = cfl.filter((x) => x.type === "REFUS");
        if (refus.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: refus[0].message });
        }
        const anomalie = cfl.find((x) => x.type === "ANOMALIE");

        let gardeFous: string[] = [];
        if (input.category === "DISCIPLINAIRE" && (input.type === "MISE_A_PIED" || input.type === "MISE_A_PIED_CONSERVATOIRE")) {
          gardeFous = verifierGardeFousMap(candidate, type);
          if (gardeFous.length > 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: gardeFous[0] });
          }
        }

        const approbationRequise = type?.approbationRequise ?? true;
        const autoActif = input.category === "ABSENCE" && !approbationRequise;
        const statutInitial: string = input.statutWorkflow ?? (autoActif ? "ACTIF" : "BROUILLON");

        const [row] = await tx
          .insert(employeeSituations)
          .values({
            agenceId: ctx.user.agenceId,
            employeeId: input.employeeId,
            situationTypeId: type?.id ?? null,
            category: input.category,
            type: input.type,
            subType: input.subType ?? null,
            name: type?.name ?? null,
            dateDebut: input.dateDebut,
            dateFin,
            dateEffet,
            dureeJours: input.dureeJours ?? null,
            motif: input.motif ?? null,
            faitReproche: input.faitReproche ?? null,
            commentaire: input.commentaire ?? null,
            justificatifUrl: input.justificatifUrl ?? null,
            notificationEcrite: input.notificationEcrite ?? false,
            communicationInspection: input.communicationInspection ?? false,
            detailsFinanciers: input.detailsFinanciers ?? null,
            montantRetenue: input.montantRetenue != null ? String(input.montantRetenue) : null,
            impactContrat: type?.impactContrat ?? "ACTIVE",
            impactPresence: type?.impactPresence ?? "PRESENCE",
            impactPlanning: type?.impactPlanning ?? "PLANIFIE",
            impactPaie: type?.impactPaie ?? "NORMAL",
            modeCalculPaie: type?.modeCalculPaie ?? "PRORATA_JOURS",
            baseCalculPaie: type?.baseCalculPaie ?? null,
            validationRequise: type?.validationRequise ?? true,
            anomalie: anomalie ? anomalie.code : null,
            statutWorkflow: statutInitial,
            approbationRequise,
            provenanceTable: null,
            provenanceId: null,
            createdBy: Number(ctx.user.id),
          } as any)
          .returning();

        await journal(tx, { situationId: row.id, fromStatus: null, toStatus: statutInitial, userId: Number(ctx.user.id) });
        if (statutInitial === "ACTIF") {
          await reconcilierStatutDerive(tx, { agenceId: ctx.user.agenceId, employeeId: input.employeeId, userId: Number(ctx.user.id) });
        }
        return { id: row.id, statutWorkflow: statutInitial };
      });
    }),

  // ─── Mise à jour (avant activation : BROUILLON/SOUMIS/EN_ATTENTE/REFUSE) ───
  update: requirePermissionProcedure("rh.situation.modifier")
    .input(z.object({ id: z.number().int() }).extend(situationInput.shape))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [sit] = await tx
          .select()
          .from(employeeSituations)
          .where(and(eq(employeeSituations.id, input.id), eq(employeeSituations.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!sit) throw new TRPCError({ code: "NOT_FOUND", message: "Situation introuvable." });
        if (!["BROUILLON", "SOUMIS", "EN_ATTENTE", "REFUSE"].includes(sit.statutWorkflow)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Seule une situation non activée peut être modifiée (fermez-la puis recréez si besoin)." });
        }
        await assertEmployeEnAgence(input.employeeId, ctx.user.agenceId);

        const dateDebut = input.dateDebut ?? toIso(sit.dateDebut) as string;
        const dateFin = input.dateFin !== undefined ? input.dateFin : toIso(sit.dateFin);
        const dateEffet = input.dateEffet ?? input.dateDebut ?? toIso(sit.dateEffet) ?? dateDebut;
        if (dateFin && dateFin < dateDebut) throw new TRPCError({ code: "BAD_REQUEST", message: "La date de fin doit suivre la date de début." });

        await verifierPeriodeNonCloturee(ctx.user.agenceId, dateDebut, dateFin ?? dateDebut);

        const candidate: SituationLike = {
          category: input.category ?? sit.category,
          type: input.type ?? sit.type,
          subType: input.subType ?? sit.subType ?? null,
          dateDebut,
          dateFin,
          dateEffet,
          dureeJours: input.dureeJours ?? sit.dureeJours ?? null,
          impactContrat: sit.impactContrat,
          impactPresence: sit.impactPresence,
          impactPlanning: sit.impactPlanning,
          impactPaie: sit.impactPaie,
          modeCalculPaie: sit.modeCalculPaie,
          validationRequise: sit.validationRequise,
          notificationEcrite: input.notificationEcrite ?? sit.notificationEcrite,
          communicationInspection: input.communicationInspection ?? sit.communicationInspection,
          anomalie: sit.anomalie ?? null,
        };

        const existantes = (await situationsOf(tx, input.employeeId, ctx.user.agenceId)).filter((s) => s.id !== sit.id);
        const cfl = conflits({ candidate, existantes });
        const refus = cfl.filter((x) => x.type === "REFUS");
        if (refus.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: refus[0].message });
        const anomalie = cfl.find((x) => x.type === "ANOMALIE")?.code ?? null;

        await tx
          .update(employeeSituations)
          .set({
            category: candidate.category,
            type: candidate.type,
            subType: candidate.subType,
            dateDebut,
            dateFin,
            dateEffet,
            dureeJours: candidate.dureeJours,
            motif: input.motif !== undefined ? (input.motif ?? null) : sit.motif,
            faitReproche: input.faitReproche !== undefined ? (input.faitReproche ?? null) : sit.faitReproche,
            commentaire: input.commentaire !== undefined ? (input.commentaire ?? null) : sit.commentaire,
            justificatifUrl: input.justificatifUrl !== undefined ? (input.justificatifUrl ?? null) : sit.justificatifUrl,
            notificationEcrite: candidate.notificationEcrite,
            communicationInspection: candidate.communicationInspection,
            anomalie,
            updatedAt: new Date(),
          } as any)
          .where(eq(employeeSituations.id, sit.id));

        await journal(tx, { situationId: sit.id, fromStatus: sit.statutWorkflow, toStatus: sit.statutWorkflow, userId: Number(ctx.user.id), justification: "Mise à jour de la situation" });
        return { id: sit.id };
      });
    }),

  // ─── Soumettre : BROUILLON → SOUMIS ───
  soumettre: requirePermissionProcedure("rh.situation.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [sit] = await tx
          .select()
          .from(employeeSituations)
          .where(and(eq(employeeSituations.id, input.id), eq(employeeSituations.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!sit) throw new TRPCError({ code: "NOT_FOUND", message: "Situation introuvable." });
        if (sit.statutWorkflow !== "BROUILLON") throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible de soumettre un état « ${sit.statutWorkflow} » (attendu : BROUILLON).` });
        await mettreStatut(tx, sit.id, sit.statutWorkflow, "SOUMIS", Number(ctx.user.id));
        return { id: sit.id };
      });
    }),

  // ─── Approuver : SOUMIS/EN_ATTENTE → APPROUVE (garde-fous MAP avant activation) ───
  approuver: requirePermissionProcedure("rh.situation.modifier")
    .input(z.object({ id: z.number().int(), justification: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [sit] = await tx
          .select()
          .from(employeeSituations)
          .where(and(eq(employeeSituations.id, input.id), eq(employeeSituations.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!sit) throw new TRPCError({ code: "NOT_FOUND", message: "Situation introuvable." });
        if (!["SOUMIS", "EN_ATTENTE"].includes(sit.statutWorkflow)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible d'approuver un état « ${sit.statutWorkflow} ».` });
        }
        const [type] = sit.situationTypeId
          ? await tx
              .select()
              .from(hrSituationTypes)
              .where(eq(hrSituationTypes.id, sit.situationTypeId))
              .limit(1)
          : [];
        if (sit.category === "DISCIPLINAIRE") {
          const viols = verifierGardeFousMap(toLike(sit as unknown as Record<string, unknown>), type);
          if (viols.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Garde-fous art. 30 non satisfaits : ${viols[0]}` });
        }
        await tx
          .update(employeeSituations)
          .set({ statutWorkflow: "APPROUVE", approbateurId: Number(ctx.user.id), approuveAt: new Date(), updatedAt: new Date() } as any)
          .where(eq(employeeSituations.id, sit.id));
        await journal(tx, { situationId: sit.id, fromStatus: sit.statutWorkflow, toStatus: "APPROUVE", userId: Number(ctx.user.id), justification: input.justification ?? "Approbation" });
        return { id: sit.id };
      });
    }),

  // ─── Activer : APPROUVE → ACTIF (effets contrat/présence/paie + statut dérivé) ───
  activer: requirePermissionProcedure("rh.situation.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [sit] = await tx
          .select()
          .from(employeeSituations)
          .where(and(eq(employeeSituations.id, input.id), eq(employeeSituations.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!sit) throw new TRPCError({ code: "NOT_FOUND", message: "Situation introuvable." });
        if (sit.statutWorkflow !== "APPROUVE") throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible d'activer un état « ${sit.statutWorkflow} » (attendu : APPROUVE).` });
        await verifierPeriodeNonCloturee(ctx.user.agenceId, toIso(sit.dateDebut) as string, toIso(sit.dateFin) ?? (toIso(sit.dateDebut) as string));
        await mettreStatut(tx, sit.id, sit.statutWorkflow, "ACTIF", Number(ctx.user.id), "Activation de la situation");
        await reconcilierStatutDerive(tx, { agenceId: ctx.user.agenceId, employeeId: sit.employeeId, userId: Number(ctx.user.id) });
        return { id: sit.id };
      });
    }),

  // ─── Terminer : ACTIF → TERMINE (fin de l'impact + statut dérivé levé) ───
  terminer: requirePermissionProcedure("rh.situation.modifier")
    .input(z.object({ id: z.number().int(), dateFin: z.string().regex(iso).optional().nullable(), justification: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [sit] = await tx
          .select()
          .from(employeeSituations)
          .where(and(eq(employeeSituations.id, input.id), eq(employeeSituations.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!sit) throw new TRPCError({ code: "NOT_FOUND", message: "Situation introuvable." });
        if (sit.statutWorkflow !== "ACTIF") throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible de terminer un état « ${sit.statutWorkflow} » (attendu : ACTIF).` });
        const today = new Date().toISOString().split("T")[0];
        const dateFin = input.dateFin ?? toIso(sit.dateFin) ?? today;
        const justification = input.justification ?? `Fin au ${dateFin}`;
        await tx
          .update(employeeSituations)
          .set({ statutWorkflow: "TERMINE", dateFin, updatedAt: new Date() } as any)
          .where(eq(employeeSituations.id, sit.id));
        await journal(tx, { situationId: sit.id, fromStatus: "ACTIF", toStatus: "TERMINE", userId: Number(ctx.user.id), justification });
        await reconcilierStatutDerive(tx, {
          agenceId: ctx.user.agenceId,
          employeeId: sit.employeeId,
          userId: Number(ctx.user.id),
          pivot: lendemainDe(dateFin),
        });
        return { id: sit.id };
      });
    }),

  // ─── Refuser : SOUMIS/EN_ATTENTE/APPROUVE → REFUSE ───
  refuser: requirePermissionProcedure("rh.situation.modifier")
    .input(z.object({ id: z.number().int(), rejectionReason: z.string().min(1, "Le motif de refus est obligatoire.") }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [sit] = await tx
          .select()
          .from(employeeSituations)
          .where(and(eq(employeeSituations.id, input.id), eq(employeeSituations.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!sit) throw new TRPCError({ code: "NOT_FOUND", message: "Situation introuvable." });
        if (!["SOUMIS", "EN_ATTENTE", "APPROUVE"].includes(sit.statutWorkflow)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible de refuser un état « ${sit.statutWorkflow} ».` });
        }
        await mettreStatut(tx, sit.id, sit.statutWorkflow, "REFUSE", Number(ctx.user.id), input.rejectionReason);
        return { id: sit.id };
      });
    }),

  // ─── Annuler : toute étape (sauf REFUSE/TERMINE) → ANNULE ───
  annuler: requirePermissionProcedure("rh.situation.modifier")
    .input(z.object({ id: z.number().int(), justification: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [sit] = await tx
          .select()
          .from(employeeSituations)
          .where(and(eq(employeeSituations.id, input.id), eq(employeeSituations.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!sit) throw new TRPCError({ code: "NOT_FOUND", message: "Situation introuvable." });
        if (["REFUSE", "TERMINE", "ANNULE"].includes(sit.statutWorkflow)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible d'annuler un état « ${sit.statutWorkflow} ».` });
        }
        if (sit.statutWorkflow === "ACTIF") {
          await verifierPeriodeNonCloturee(ctx.user.agenceId, toIso(sit.dateDebut) as string, toIso(sit.dateFin) ?? (toIso(sit.dateDebut) as string));
        }
        await mettreStatut(tx, sit.id, sit.statutWorkflow, "ANNULE", Number(ctx.user.id), input.justification ?? "Annulation de la situation");
        if (sit.statutWorkflow === "ACTIF") {
          await reconcilierStatutDerive(tx, {
            agenceId: ctx.user.agenceId,
            employeeId: sit.employeeId,
            userId: Number(ctx.user.id),
            pivot: toIso(sit.dateFin) ? lendemainDe(toIso(sit.dateFin) as string) : undefined,
          });
        }
        return { id: sit.id };
      });
    }),
});