import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { employeeAdvances, advanceRecoveries, advanceTransitions, employes } from "@atelierone/db";
import { payrollPeriods, payrollEntries } from "@atelierone/db";
import { eq, and, desc, inArray, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { ADVANCE_STATUTS, ACTIFS, validerSaisieAvance, validerRecuperation, validerAnnulation, apresRecuperation, validerApprobation, validerVersement, validerRefus, genererReferenceAvance, syntheseAvances } from "~/server/lib/avances-engine";

/** RH-04 — Avances sur salaire : cycle de vie transactionnel (MISSION §4-§6) */
export { ADVANCE_STATUTS };

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const rhAdvancesRouter = createTRPCRouter({
  // ─── Liste (lecture) ───
  list: rhProcedure
    .input(
      z
        .object({
          employeId: z.number().int().optional(),
          search: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.employeId) conditions.push(eq(employeeAdvances.employeeId, safe.employeId));
      if (safe.search && safe.search.trim()) {
        const s = `%${safe.search.trim()}%`;
        conditions.push(or(like(employes.nom, s), like(employes.prenom, s), like(employes.matricule, s)));
      }
      const rows = await db
        .select({
          id: employeeAdvances.id,
          employeeId: employeeAdvances.employeeId,
          reference: employeeAdvances.reference,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          matricule: employes.matricule,
          dateDemande: employeeAdvances.dateDemande,
          dateApprobation: employeeAdvances.dateApprobation,
          dateVersement: employeeAdvances.dateVersement,
          montant: employeeAdvances.montant,
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
        .where(and(...conditions))
        .orderBy(desc(employeeAdvances.dateVersement));

      // R5-E2 : synthèse globale (accordé/payé/récupéré/restant + répartition par statut)
      const synthese = syntheseAvances(rows as unknown as Parameters<typeof syntheseAvances>[0]);
      return { rows, synthese };
    }),

  // ─── Saisie d'une avance (MISSION §4-§5) ───
  create: requirePermissionProcedure("rh.paie.modifier")
    .input(
      z.object({
        employeeId: z.number().int(),
        montant: z.number().positive(),
        dateVersement: z.string(),
        motif: z.string().optional(),
        moyenPaiement: z.enum(["especes", "virement", "cheque", "mobile_money"]).optional(),
        periodeConcerneeDebut: z.string().optional(),
        periodeConcerneeFin: z.string().optional(),
        periodeRecuperationDebut: z.string().optional(),
        periodeRecuperationFin: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [emp] = await db
        .select({ statut: employes.statut, salaireBase: employes.salaireBase, forfaitHebdomadaire: employes.forfaitHebdomadaire })
        .from(employes)
        .where(and(eq(employes.id, input.employeeId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employé introuvable." });

      // Contrôles §18 (sorti, doublon, plafond salaire) — règles pures testables
      const avancesActives = await db
        .select({
          statut: employeeAdvances.statut,
          periodeConcerneeDebut: employeeAdvances.periodeConcerneeDebut,
          periodeConcerneeFin: employeeAdvances.periodeConcerneeFin,
        })
        .from(employeeAdvances)
        .where(and(eq(employeeAdvances.employeeId, input.employeeId), inArray(employeeAdvances.statut, [...ACTIFS])));
      const erreur = validerSaisieAvance({
        montant: input.montant,
        periodeConcerneeDebut: input.periodeConcerneeDebut ?? null,
        periodeConcerneeFin: input.periodeConcerneeFin ?? null,
        avancesActives,
        employe: {
          statut: emp.statut,
          salaireBase: num(emp.salaireBase),
          forfaitHebdomadaire: num(emp.forfaitHebdomadaire),
        },
      });
      if (erreur) throw new TRPCError({ code: "BAD_REQUEST", message: erreur });

      const [row] = await db.transaction(async (tx) => {
        const [r] = await tx
          .insert(employeeAdvances)
          .values({
            employeeId: input.employeeId,
            dateDemande: new Date().toISOString().slice(0, 10),
            dateVersement: input.dateVersement,
            montant: String(input.montant),
            motif: input.motif ?? null,
            moyenPaiement: input.moyenPaiement ?? null,
            periodeConcerneeDebut: input.periodeConcerneeDebut ?? null,
            periodeConcerneeFin: input.periodeConcerneeFin ?? null,
            periodeRecuperationDebut: input.periodeRecuperationDebut ?? null,
            periodeRecuperationFin: input.periodeRecuperationFin ?? null,
            montantRecupere: "0",
            soldeRestant: String(input.montant),
            statut: "DEMANDÉE",
            responsableId: ctx.user.id,
          } as any)
          .returning();
        const now = new Date();
        await tx
          .update(employeeAdvances)
          .set({ reference: genererReferenceAvance(now, r.id), updatedAt: new Date() } as any)
          .where(eq(employeeAdvances.id, r.id));
        await tx.insert(advanceTransitions).values({
          advanceId: r.id,
          fromStatus: null,
          toStatus: "DEMANDÉE",
          acteurId: ctx.user.id,
          justification: input.motif ?? null,
        } as any);
        return [r];
      });
      return row;
    }),

  // ─── Approbation (DEMANDÉE → APPROUVÉE) ───
  approuver: requirePermissionProcedure("rh.paie.modifier")
    .input(z.object({ advanceId: z.number().int(), dateVersement: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [advance] = await db
        .select()
        .from(employeeAdvances)
        .innerJoin(employes, eq(employeeAdvances.employeeId, employes.id))
        .where(and(eq(employeeAdvances.id, input.advanceId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!advance) throw new TRPCError({ code: "NOT_FOUND", message: "Avance introuvable." });

      const erreur = validerApprobation(advance.employee_advances.statut);
      if (erreur) throw new TRPCError({ code: "BAD_REQUEST", message: erreur });

      await db.transaction(async (tx) => {
        await tx
          .update(employeeAdvances)
          .set({
            statut: "APPROUVÉE",
            dateApprobation: new Date().toISOString().slice(0, 10),
            dateVersement: input.dateVersement ?? advance.employee_advances.dateVersement,
            responsableId: ctx.user.id,
            updatedAt: new Date(),
          } as any)
          .where(eq(employeeAdvances.id, input.advanceId));
        await tx.insert(advanceTransitions).values({
          advanceId: input.advanceId,
          fromStatus: "DEMANDÉE",
          toStatus: "APPROUVÉE",
          acteurId: ctx.user.id,
          justification: null,
        } as any);
      });
      return { success: true, statut: "APPROUVÉE" };
    }),

  // ─── Versement (APPROUVÉE → VERSÉE) ───
  verser: requirePermissionProcedure("rh.paie.modifier")
    .input(z.object({ advanceId: z.number().int(), dateVersement: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [advance] = await db
        .select()
        .from(employeeAdvances)
        .innerJoin(employes, eq(employeeAdvances.employeeId, employes.id))
        .where(and(eq(employeeAdvances.id, input.advanceId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!advance) throw new TRPCError({ code: "NOT_FOUND", message: "Avance introuvable." });

      const erreur = validerVersement(advance.employee_advances.statut);
      if (erreur) throw new TRPCError({ code: "BAD_REQUEST", message: erreur });

      await db.transaction(async (tx) => {
        await tx
          .update(employeeAdvances)
          .set({
            statut: "VERSÉE",
            dateVersement: input.dateVersement ?? new Date().toISOString().slice(0, 10),
            updatedAt: new Date(),
          } as any)
          .where(eq(employeeAdvances.id, input.advanceId));
        await tx.insert(advanceTransitions).values({
          advanceId: input.advanceId,
          fromStatus: "APPROUVÉE",
          toStatus: "VERSÉE",
          acteurId: ctx.user.id,
          justification: null,
        } as any);
      });
      return { success: true, statut: "VERSÉE" };
    }),

  // ─── Refus (DEMANDÉE | APPROUVÉE → ANNULÉE) ───
  refuser: requirePermissionProcedure("rh.paie.modifier")
    .input(z.object({ advanceId: z.number().int(), motif: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [advance] = await db
        .select()
        .from(employeeAdvances)
        .innerJoin(employes, eq(employeeAdvances.employeeId, employes.id))
        .where(and(eq(employeeAdvances.id, input.advanceId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!advance) throw new TRPCError({ code: "NOT_FOUND", message: "Avance introuvable." });

      const erreur = validerRefus(advance.employee_advances.statut);
      if (erreur) throw new TRPCError({ code: "BAD_REQUEST", message: erreur });

      await db.transaction(async (tx) => {
        await tx
          .update(employeeAdvances)
          .set({
            statut: "ANNULÉE",
            updatedAt: new Date(),
          } as any)
          .where(eq(employeeAdvances.id, input.advanceId));
        await tx.insert(advanceTransitions).values({
          advanceId: input.advanceId,
          fromStatus: advance.employee_advances.statut,
          toStatus: "ANNULÉE",
          acteurId: ctx.user.id,
          justification: input.motif ? `Refus : ${input.motif}` : "Refus",
        } as any);
      });
      return { success: true, statut: "ANNULÉE" };
    }),

  // ─── Enregistrer une récupération (MISSION §6) ───
  enregistrerRecuperation: requirePermissionProcedure("rh.paie.modifier")
    .input(
      z.object({
        advanceId: z.number().int(),
        montant: z.number().positive(),
        dateRecuperation: z.string(),
        periodeConcerneeDebut: z.string().optional(),
        periodeConcerneeFin: z.string().optional(),
        payrollEntryId: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [advance] = await db
        .select()
        .from(employeeAdvances)
        .innerJoin(employes, eq(employeeAdvances.employeeId, employes.id))
        .where(and(eq(employeeAdvances.id, input.advanceId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!advance) throw new TRPCError({ code: "NOT_FOUND", message: "Avance introuvable." });

      const montantInitial = num(advance.employee_advances.montant);
      const montantRecupereAvant = num(advance.employee_advances.montantRecupere);

      // Contrôle §18 : clôture + cumul dépassant — règles pures testables
      const erreur = validerRecuperation({
        montant: input.montant,
        montantRecupereAvant,
        montantInitial,
        statut: advance.employee_advances.statut,
      });
      if (erreur) throw new TRPCError({ code: "BAD_REQUEST", message: erreur });

      // R5-E8 : récupération manuelle liée à un bulletin d'une période CLÔTURÉE → refus.
      if (input.payrollEntryId) {
        const [entryPeriod] = await db
          .select({ status: payrollPeriods.status })
          .from(payrollEntries)
          .innerJoin(payrollPeriods, eq(payrollEntries.periodId, payrollPeriods.id))
          .where(eq(payrollEntries.id, input.payrollEntryId))
          .limit(1);
        if (!entryPeriod) throw new TRPCError({ code: "NOT_FOUND", message: "Bulletin introuvable." });
        if (entryPeriod.status !== "open") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Récupération refusée : le bulletin est rattaché à une période de paie clôturée (immutable).",
          });
        }
      }

      const { soldeRestant, statut } = apresRecuperation(montantInitial, montantRecupereAvant + input.montant);

      const nouveauCumul = montantRecupereAvant + input.montant;
      await db.transaction(async (tx) => {
        await tx.insert(advanceRecoveries).values({
          advanceId: input.advanceId,
          dateRecuperation: input.dateRecuperation,
          montant: String(input.montant),
          periodeConcerneeDebut: input.periodeConcerneeDebut ?? null,
          periodeConcerneeFin: input.periodeConcerneeFin ?? null,
          payrollEntryId: input.payrollEntryId ?? null,
          createdBy: ctx.user.id,
        } as any);
        await tx
          .update(employeeAdvances)
          .set({
            montantRecupere: String(nouveauCumul),
            soldeRestant: String(soldeRestant),
            statut,
            updatedAt: new Date(),
          } as any)
          .where(eq(employeeAdvances.id, input.advanceId));
        await tx.insert(advanceTransitions).values({
          advanceId: input.advanceId,
          fromStatus: advance.employee_advances.statut,
          toStatus: statut,
          acteurId: ctx.user.id,
          justification: `Récupération ${input.montant} F (cumul ${nouveauCumul} F)`,
        } as any);
      });

      return { success: true, soldeRestant, statut };
    }),

  // ─── Annulation (MISSION §4 : jamais si récupérée) ───
  annuler: requirePermissionProcedure("rh.paie.modifier")
    .input(z.object({ advanceId: z.number().int(), motif: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [advance] = await db
        .select()
        .from(employeeAdvances)
        .innerJoin(employes, eq(employeeAdvances.employeeId, employes.id))
        .where(and(eq(employeeAdvances.id, input.advanceId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!advance) throw new TRPCError({ code: "NOT_FOUND", message: "Avance introuvable." });

      // Contrôle §18 : avance annulée mais déduite → refus si déjà récupérée (règles pures)
      const erreur = validerAnnulation({
        montantRecupere: num(advance.employee_advances.montantRecupere),
        statut: advance.employee_advances.statut,
      });
      if (erreur) throw new TRPCError({ code: "BAD_REQUEST", message: erreur });

      await db.transaction(async (tx) => {
        await tx
          .update(employeeAdvances)
          .set({
            statut: "ANNULÉE",
            updatedAt: new Date(),
          } as any)
          .where(eq(employeeAdvances.id, input.advanceId));
        await tx.insert(advanceTransitions).values({
          advanceId: input.advanceId,
          fromStatus: advance.employee_advances.statut,
          toStatus: "ANNULÉE",
          acteurId: ctx.user.id,
          justification: input.motif ? `Annulation : ${input.motif}` : "Annulation",
        } as any);
      });
      return { success: true };
    }),

  // ─── Journal des transitions d'une avance (R5-E5 historique/audit) ───
  listTransitions: rhProcedure
    .input(z.object({ advanceId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [advance] = await db
        .select({ id: employeeAdvances.id, employeeId: employeeAdvances.employeeId })
        .from(employeeAdvances)
        .innerJoin(employes, eq(employeeAdvances.employeeId, employes.id))
        .where(and(eq(employeeAdvances.id, input.advanceId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!advance) throw new TRPCError({ code: "NOT_FOUND", message: "Avance introuvable." });
      return db
        .select()
        .from(advanceTransitions)
        .where(eq(advanceTransitions.advanceId, input.advanceId))
        .orderBy(desc(advanceTransitions.createdAt));
    }),

  // ─── Détail récupérations d'une avance ───
  listRecoveries: rhProcedure
    .input(z.object({ advanceId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [advance] = await db
        .select({ id: employeeAdvances.id, employeeId: employeeAdvances.employeeId })
        .from(employeeAdvances)
        .innerJoin(employes, eq(employeeAdvances.employeeId, employes.id))
        .where(and(eq(employeeAdvances.id, input.advanceId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!advance) throw new TRPCError({ code: "NOT_FOUND", message: "Avance introuvable." });
      return db
        .select()
        .from(advanceRecoveries)
        .where(eq(advanceRecoveries.advanceId, input.advanceId))
        .orderBy(desc(advanceRecoveries.dateRecuperation));
    }),
});