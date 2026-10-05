import { z } from "zod";
import { eq } from "drizzle-orm";
import { hrSensibilisationRules } from "@atelierone/db";

import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  canSeeSalary,
  chargerDonneesRapport,
  construireJoursEmploye,
  dateStr,
} from "~/server/lib/rh-centre-rapports";
import { analyserPeriode } from "~/server/lib/rh-stats-engine";
import { segmenterSalaires } from "~/server/lib/rh-situation-engine";
import {
  appliquerMasquageSalaire,
  calculerIndicateursEquipe,
  calculerIndicateursSensibilisation,
  reglesManquantes,
  type IndicateurSensibilisation,
  type RegleSensibilisation,
} from "~/server/lib/rh-sensibilisation-engine";

/**
 * RPT-03 — API de SENSIBILISATION RH.
 *
 * LECTURE SEULE PAR CONSTRUCTION (§41) : ce routeur n'expose que des queries.
 * L'administration des seuils est une mutation distincte, réservée, et n'est
 * PAS livrée ici (§42).
 *
 * Zéro écriture, zéro N+1 (§11) : les données sont déjà chargées en batch par
 * `chargerDonneesRapport`; seule la lecture des règles (7 lignes par agence)
 * est ajoutée.
 */

function normaliserRegles(rows: typeof hrSensibilisationRules.$inferSelect[]): RegleSensibilisation[] {
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    niveau: r.niveau as RegleSensibilisation["niveau"],
    priorite: r.priorite,
    condition: r.condition as RegleSensibilisation["condition"],
    metrique: r.metrique,
    seuil: Number(r.seuil),
    message: r.message,
    actionRecommandee: r.actionRecommandee,
    active: r.active,
  }));
}

export const rhSensibilisationRouter = createTRPCRouter({
  /**
   * §8-§13 — Indicateurs par employé, indicateurs d'équipe, messages, et jeu
   * de règles réellement appliqué.
   *
   * Permission d'accès : `rh.presence.consulter`.
   * Les montants (salaire, taux, estimatedImpact, impactPercent, segments) sont
   * ABSENTS sans `rh.salaire.consulter` (§36) — jamais remis à 0.
   */
  indicateurs: requirePermissionProcedure("rh.presence.consulter")
    .input(
      z.object({
        from: dateStr(),
        to: dateStr(),
        employeId: z.number().int().positive().optional(),
        employeIds: z.array(z.number().int().positive()).optional(),
        departementId: z.number().int().positive().optional(),
        statut: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const [charge, reglesBrutes, canSee] = await Promise.all([
        chargerDonneesRapport({ user: ctx.user }, input.from, input.to, {
          employeId: input.employeId,
          employeIds: input.employeIds,
          departementId: input.departementId,
          statut: input.statut,
        }),
        db.select().from(hrSensibilisationRules).where(eq(hrSensibilisationRules.agenceId, ctx.user.agenceId)),
        canSeeSalary({ user: ctx.user }),
      ]);

      const d = charge.situation;
      const regles = normaliserRegles(reglesBrutes);

      const indicateurs: IndicateurSensibilisation[] = d.employees.map((emp) => {
        // Même chaîne que le rapport RPT-01/RPT-02 : les heures et retards sont
        // donc identiques à ceux affichés ailleurs, par construction.
        const jours = construireJoursEmploye(emp, d);
        const segments = segmenterSalaires({
          fiche: {
            baseSalary: emp.salaireBase,
            modePaie: emp.modePaie,
            forfaitHebdomadaire: emp.forfaitHebdomadaire,
          },
          historique: d.histoByEmploye.get(emp.id) ?? [],
          from: d.from,
          to: d.to,
        });
        return calculerIndicateursSensibilisation({
          employe: emp,
          jours,
          analyse: analyserPeriode(jours),
          calcs: d.calcsByEmploye.get(emp.id) ?? [],
          segments,
          absences: d.absencesByEmploye.get(emp.id) ?? [],
          donnees: d,
          regles,
        });
      });

      return {
        periode: { from: d.from, to: d.to },
        standardMonthlyHours: d.standardMonthlyHours,
        equipe: calculerIndicateursEquipe(indicateurs),
        salariesVisible: canSee,
        reglesManquantes: reglesManquantes(regles),
        regles,
        rows: indicateurs.map((r) => appliquerMasquageSalaire(r, canSee)),
      };
    }),

  /**
   * §20 — Règles de sensibilisation en vigueur. `manquantes` signale toute règle
   * EXIGÉE non chargée, au lieu de normaliser silencieusement le jeu de règles.
   */
  regles: requirePermissionProcedure("rh.presence.consulter")
    .input(z.object({}).nullish())
    .query(async ({ ctx }) => {
      const rows = await db
        .select()
        .from(hrSensibilisationRules)
        .where(eq(hrSensibilisationRules.agenceId, ctx.user.agenceId));
      const regles = normaliserRegles(rows);
      return { regles, manquantes: reglesManquantes(regles) };
    }),
});
