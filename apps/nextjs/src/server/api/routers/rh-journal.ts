/**
 * RPT-04 — Journal des absences & retards : API.
 *
 * LECTURE : le journal ne possesse AUCUNE donnee metier. Il consomme la couche
 * source unique de RPT-01 (`chargerDonneesRapport`) et l'enrichit du workflow de
 * justificatif. Aucune reconciliation, aucun montant, aucune heure n'est
 * recalcule ici (§2, §3).
 *
 * ECRITURE : uniquement le workflow de justificatif, sur deux tables dediees
 * (`rh_absence_justifications`, `rh_absence_justification_decisions`). Ni
 * `attendance_entries.validated*` ni `absences` ne sont jamais reecrits : ces
 * colonnes portent la trace d'import (R7) et 495 lignes `validated = true`
 * sans `validated_by` qu'on signale sans les reecrire (§14).
 *
 * CONTROLES, tous appliques sur les trois mutations :
 *  · tenant (agence) — `assertEmployeEnAgence` ;
 *  · cloture de periode — `moisCloture` (septembre 2026 verrouille) ;
 *  · separation des pouvoirs — le deposant ne peut pas valider son propre
 *    justificatif ;
 *  · historique immuable — une decision s'ajoute, jamais ne s'ecrase.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import {
  attendanceEntries,
  employes,
  hrSensibilisationRules,
  rhAbsenceJustificationDecisions,
  rhAbsenceJustifications,
} from "@atelierone/db";

import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { RBACService } from "~/server/lib/rbac-service";
import {
  canSeeSalary,
  chargerDonneesRapport,
  construireJoursEmploye,
  dateStr,
  type ChargeRapport,
} from "~/server/lib/rh-centre-rapports";
import { analyserPeriode } from "~/server/lib/rh-stats-engine";
import { segmenterSalaires } from "~/server/lib/rh-situation-engine";
import {
  appliquerMasquageSalaire,
  calculerIndicateursSensibilisation,
  type RegleSensibilisation,
} from "~/server/lib/rh-sensibilisation-engine";
import { moisCloture } from "~/server/lib/rh-projection";
import { assertEmployeEnAgence } from "~/server/lib/rh-scope";
import { journaliserAvantApres } from "~/server/lib/rh-audit";
import {
  analyserEventIdStable,
  appliquerFiltres,
  construireJournal,
  construireReferenceSensibilisation,
  masquerImpacts,
  masquerJustificatif,
  paginer,
  trierEvenements,
  type CodeAnomalie,
  type ConflitPresence,
  type JustificationSource,
  type StatutJustificatif,
  type TriJournal,
  type TypeEvenementRapport,
} from "~/server/lib/rh-journal-engine";

const PERMISSION_LIRE = "rh.presence.consulter";
const PERMISSION_JUSTIFIER = "rh.absence.justifier";
const PERMISSION_VALIDER = "rh.absence.valider";

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const TYPES = [
  "ABSENCE",
  "RETARD",
  "CONGE",
  "MALADIE",
  "ACCIDENT",
  "SITUATION_RH",
  "AUTRE",
] as const;

const SOURCES_RPT01 = [
  "attendance_entries",
  "attendance_calculations",
  "absences",
  "situations_rh",
] as const;

const STATUTS = ["AUCUN", "FOURNI", "VALIDE", "REFUSE"] as const;

const ANOMALIES = [
  "ANOMALIE_RECONCILIATION",
  "ANOMALIE_CONFLIT_EVENT",
  "ANOMALIE_VALIDATION_SANS_AUTEUR",
  "ANOMALIE_HORS_PERIODE_EMPLOI",
] as const;

const TRIS = ["date", "employe", "retard", "type", "statut_justificatif"] as const;

const FiltresSchema = z.object({
  recherche: z.string().trim().max(200).optional(),
  employeeIds: z.array(z.number().int().positive()).max(500).optional(),
  types: z.array(z.enum(TYPES)).optional(),
  statutsJustificatif: z.array(z.enum(STATUTS)).optional(),
  valide: z.boolean().optional(),
  sources: z.array(z.enum(SOURCES_RPT01)).optional(),
  departementId: z.number().int().positive().optional(),
  fonction: z.string().trim().max(120).optional(),
  anomalies: z.array(z.enum(ANOMALIES)).optional(),
});

const ListeSchema = z.object({
  from: dateStr(),
  to: dateStr(),
  filtres: FiltresSchema.default({}),
  tri: z.enum(TRIS).default("date"),
  sens: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  /** Bloc de reference RPT-03 par employe (§21) ; desactive pour rester leger. */
  avecReference: z.boolean().default(true),
});

const CibleSchema = z.object({
  employeeId: z.number().int().positive(),
  date: ISO_DATE,
});

function iso(v: unknown): string {
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/**
 * Conflits de saisie (§10) : RPT-01 ne conserve qu'une ligne par jour
 * (`saisiesByEmploye` est une Map date -> saisie). Le conflit est donc
 * reconstitue ici par une requete groupee, et remonte comme anomalie au lieu
 * d'etre tranche en silence.
 */
async function chargerConflits(agenceId: number, from: string, to: string): Promise<ConflitPresence[]> {
  const rows = await db
    .select({
      employeeId: attendanceEntries.employeeId,
      date: attendanceEntries.date,
      entryIds: sql<number[]>`array_agg(${attendanceEntries.id} order by ${attendanceEntries.id})`,
    })
    .from(attendanceEntries)
    .innerJoin(employes, eq(attendanceEntries.employeeId, employes.id))
    .where(
      and(
        eq(employes.agenceId, agenceId),
        gte(attendanceEntries.date, from),
        lte(attendanceEntries.date, to)
      )
    )
    .groupBy(attendanceEntries.employeeId, attendanceEntries.date)
    .having(sql`count(*) > 1`);

  return rows.map((r) => ({
    employeeId: r.employeeId,
    date: iso(r.date),
    entryIds: Array.from(r.entryIds ?? []).map(Number),
  }));
}

async function chargerJustifications(
  agenceId: number,
  from: string,
  to: string
): Promise<JustificationSource[]> {
  const rows = await db
    .select()
    .from(rhAbsenceJustifications)
    .where(
      and(
        eq(rhAbsenceJustifications.agenceId, agenceId),
        gte(rhAbsenceJustifications.date, from),
        lte(rhAbsenceJustifications.date, to)
      )
    );

  return rows.map((j) => ({
    id: j.id,
    employeeId: j.employeeId,
    date: iso(j.date),
    statut: j.statut as StatutJustificatif,
    motifCode: j.motifCode,
    motifLibelle: j.motifLibelle,
    justificatifUrl: j.justificatifUrl,
    justificatifReference: j.justificatifReference,
    justificatifType: j.justificatifType,
    deposePar: j.deposePar,
    deposeAt: j.deposeAt ? String(j.deposeAt) : null,
    decisionPar: j.decisionPar,
    decisionAt: j.decisionAt ? String(j.decisionAt) : null,
    refusMotif: j.refusMotif,
  }));
}

/** Charge le journal complet de la periode (une seule lecture batch RPT-01). */
async function chargerJournal(ctx: { user: { id: string; agenceId: number } }, from: string, to: string) {
  const [charge, conflits, justifications] = await Promise.all([
    chargerDonneesRapport(ctx, from, to),
    chargerConflits(ctx.user.agenceId, from, to),
    chargerJustifications(ctx.user.agenceId, from, to),
  ]);

  const lignes = construireJournal({
    events: charge.events,
    situation: charge.situation,
    justifications,
    conflits,
  });

  return { charge, lignes };
}

/** §30 — les pieces d'un justificatif ne sont visibles que par les habilites. */
async function peutVoirJustificatif(ctx: { user: { id: string; role: string; agenceId: number } }): Promise<boolean> {
  if (ctx.user.role === "superadmin") return true;
  const agence = String(ctx.user.agenceId ?? "");
  for (const perm of [PERMISSION_JUSTIFIER, PERMISSION_VALIDER, "rh.document.consulter"]) {
    if (await RBACService.hasPermission(ctx.user.id, perm, agence)) return true;
  }
  return false;
}

export const rhJournalRouter = createTRPCRouter({
  /**
   * §24-§27 — Liste paginee, filtree, triee cote serveur.
   *
   * `typesEvenement` n'est PAS passe a RPT-01 : le filtre de type s'applique
   * apres fusion, sinon un filtre « RETARD » masquerait les jours d'absence
   * porteurs d'un retard (§26).
   */
  liste: requirePermissionProcedure(PERMISSION_LIRE)
    .input(ListeSchema)
    .query(async ({ ctx, input }) => {
      const autorise = await peutVoirJustificatif(ctx);
      const salaryVisible = await canSeeSalary({ user: ctx.user });

      const { charge, lignes } = await chargerJournal(ctx, input.from, input.to);

      const filtrees = appliquerFiltres(lignes, {
        recherche: input.filtres.recherche ?? null,
        employeeIds: input.filtres.employeeIds ?? null,
        types: (input.filtres.types ?? null) as TypeEvenementRapport[] | null,
        statutsJustificatif: (input.filtres.statutsJustificatif ?? null) as StatutJustificatif[] | null,
        valide: input.filtres.valide ?? null,
        sources: (input.filtres.sources ?? null) as never,
        departementId: input.filtres.departementId ?? null,
        fonction: input.filtres.fonction ?? null,
        anomalies: (input.filtres.anomalies ?? null) as CodeAnomalie[] | null,
      });

      const triees = trierEvenements(filtrees, { tri: input.tri as TriJournal, sens: input.sens });
      const page = paginer(triees, input.page, input.pageSize);

      const referenceSensibilisation = input.avecReference
        ? await chargerReferenceSensibilisation(ctx, charge, salaryVisible)
        : [];

      return {
        periode: { from: charge.situation.from, to: charge.situation.to },
        lignes: masquerImpacts(masquerJustificatif(page.lignes, autorise), salaryVisible),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
        pageCount: page.pageCount,
        salariesVisible: salaryVisible,
        referenceSensibilisation,
      };
    }),

  /**
   * §34 — Detail d'une ligne de journal, avec l'historique IMMUABLE des
   * decisions de justificatif.
   */
  detail: requirePermissionProcedure(PERMISSION_LIRE)
    .input(z.object({ eventId: z.string().trim().min(3).max(80) }))
    .query(async ({ ctx, input }) => {
      const autorise = await peutVoirJustificatif(ctx);

      // Le contrat de l'identifiant est porte par le moteur (§5) : l'API ne
      // reinterpretait jamais un `eventId` refuse.
      const cible = analyserEventIdStable(input.eventId);
      if (!cible) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Identifiant de journal invalide." });
      }
      const { employeeId, date } = cible;

      const justification = await chargerJustification(ctx.user.agenceId, employeeId, date);

      const charge = await chargerDonneesRapport(ctx, date, date);
      const conflits = await chargerConflits(ctx.user.agenceId, date, date);
      const justifications = justification
        ? await chargerJustifications(ctx.user.agenceId, date, date)
        : [];

      const lignes = construireJournal({
        events: charge.events,
        situation: charge.situation,
        justifications,
        conflits,
      });

      const ligne = lignes.find((l) => l.eventId === input.eventId);
      if (!ligne) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Aucun evenement de journal pour cette journee." });
      }

      const historique = justification
        ? await db
            .select()
            .from(rhAbsenceJustificationDecisions)
            .where(
              and(
                eq(rhAbsenceJustificationDecisions.agenceId, ctx.user.agenceId),
                eq(rhAbsenceJustificationDecisions.justificationId, justification.id)
              )
            )
            .orderBy(asc(rhAbsenceJustificationDecisions.createdAt))
        : [];

      const [masquee] = masquerJustificatif([ligne], autorise);
      const [ligneVisible] = masquerImpacts([masquee], await canSeeSalary({ user: ctx.user }));

      return {
        ...ligneVisible,
        historique: historique.map((h) => ({
          id: h.id,
          ancienStatut: h.ancienStatut,
          nouveauStatut: h.nouveauStatut,
          action: h.action,
          acteurId: h.acteurId,
          motif: autorise ? h.motif : null,
          documentUrl: autorise ? h.documentUrl : null,
          createdAt: h.createdAt ? String(h.createdAt) : null,
        })),
      };
    }),

  /**
   * §35 — Depot d'un justificatif.
   *
   * Un depot n'est pas une validation : le statut passe a FOURNI, la decision
   * reste vide, et l'historique conserve l'ancien etat.
   */
  submitJustificatif: requirePermissionProcedure(PERMISSION_JUSTIFIER)
    .input(
      CibleSchema.extend({
        motifCode: z.string().trim().max(40).optional(),
        motifLibelle: z.string().trim().max(120).optional(),
        justificatifUrl: z.string().trim().max(2048).optional(),
        justificatifReference: z.string().trim().max(120).optional(),
        justificatifType: z.string().trim().max(40).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const userId = Number(ctx.user.id);
      await assertEmployeEnAgence(input.employeeId, agenceId);

      if (await moisCloture(agenceId, input.date)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Mois cloture : impossible de deposit un justificatif sur cette periode.",
        });
      }

      const resultat = await db.transaction(async (tx) => {
        const existant = await tx
          .select()
          .from(rhAbsenceJustifications)
          .where(
            and(
              eq(rhAbsenceJustifications.agenceId, agenceId),
              eq(rhAbsenceJustifications.employeeId, input.employeeId),
              eq(rhAbsenceJustifications.date, input.date)
            )
          )
          .limit(1);

        const avant = existant[0]
          ? { statut: existant[0].statut, motifCode: existant[0].motifCode, justificatifUrl: existant[0].justificatifUrl }
          : null;

        if (existant[0]) {
          await tx
            .update(rhAbsenceJustifications)
            .set({
              statut: "FOURNI",
              motifCode: input.motifCode ?? null,
              motifLibelle: input.motifLibelle ?? null,
              justificatifUrl: input.justificatifUrl ?? null,
              justificatifReference: input.justificatifReference ?? null,
              justificatifType: input.justificatifType ?? null,
              deposePar: userId,
              deposeAt: new Date(),
              decisionPar: null,
              decisionAt: null,
              refusMotif: null,
              updatedAt: new Date(),
            } as any)
            .where(eq(rhAbsenceJustifications.id, existant[0].id));
        } else {
          await tx.insert(rhAbsenceJustifications).values({
            agenceId,
            employeeId: input.employeeId,
            date: input.date,
            statut: "FOURNI",
            motifCode: input.motifCode ?? null,
            motifLibelle: input.motifLibelle ?? null,
            justificatifUrl: input.justificatifUrl ?? null,
            justificatifReference: input.justificatifReference ?? null,
            justificatifType: input.justificatifType ?? null,
            deposePar: userId,
            deposeAt: new Date(),
          } as any);
        }

        const ligne = await tx
          .select()
          .from(rhAbsenceJustifications)
          .where(
            and(
              eq(rhAbsenceJustifications.agenceId, agenceId),
              eq(rhAbsenceJustifications.employeeId, input.employeeId),
              eq(rhAbsenceJustifications.date, input.date)
            )
          )
          .limit(1);

        const justificationId = ligne[0].id;

        await tx.insert(rhAbsenceJustificationDecisions).values({
          justificationId,
          agenceId,
          ancienStatut: avant?.statut ?? null,
          nouveauStatut: "FOURNI",
          action: avant ? "CORRECTION" : "DEPOT",
          acteurId: userId,
          motif: input.motifLibelle?.trim() || "Depot de justificatif d'absence ou de retard",
          documentUrl: input.justificatifUrl ?? null,
        } as any);

        return { justificationId, avant };
      });

      await journaliserAvantApres(db, {
        agenceId,
        entityType: "rh_absence_justification",
        entityId: resultat.justificationId,
        action: avantAction("DEPOT"),
        avant: resultat.avant,
        apres: {
          statut: "FOURNI",
          motifCode: input.motifCode ?? null,
          justificatifUrl: input.justificatifUrl ?? null,
        },
        motif: input.motifLibelle?.trim() || "Depot de justificatif d'absence ou de retard",
        userId,
      });

      return { justificationId: resultat.justificationId, statut: "FOURNI" as StatutJustificatif };
    }),

  /**
   * §35 — Validation d'un justificatif.
   *
   * SEPARATION DES POUVOIRS : le deposant ne valide pas son propre justificatif.
   * Le statut `VALIDE` n'est ecrit qu'accompagne de `decision_par` +
   * `decision_at` (contrainte DB), donc une validation fantome est impossible.
   */
  validateJustificatif: requirePermissionProcedure(PERMISSION_VALIDER)
    .input(CibleSchema)
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const userId = Number(ctx.user.id);
      await assertEmployeEnAgence(input.employeeId, agenceId);

      if (await moisCloture(agenceId, input.date)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Mois cloture : impossible de valider un justificatif sur cette periode.",
        });
      }

      const row = await chargerJustification(agenceId, input.employeeId, input.date);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Aucun justificatif a valider pour cette journee." });
      }
      if (row.deposePar !== null && row.deposePar === userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Separation des pouvoirs : le deposant ne peut pas valider son propre justificatif.",
        });
      }

      await decider({
        agenceId,
        userId,
        row,
        nouveauStatut: "VALIDE",
        action: "VALIDATION",
        motif: "Validation du justificatif",
      });

      return { justificationId: row.id, statut: "VALIDE" as StatutJustificatif };
    }),

  /** §35 — Refus motive d'un justificatif. Le motif est obligatoire (CHECK DB). */
  rejectJustificatif: requirePermissionProcedure(PERMISSION_VALIDER)
    .input(CibleSchema.extend({ refusMotif: z.string().trim().min(3).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const userId = Number(ctx.user.id);
      await assertEmployeEnAgence(input.employeeId, agenceId);

      if (await moisCloture(agenceId, input.date)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Mois cloture : impossible de refuser un justificatif sur cette periode.",
        });
      }

      const row = await chargerJustification(agenceId, input.employeeId, input.date);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Aucun justificatif a refuser pour cette journee." });
      }
      if (row.deposePar !== null && row.deposePar === userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Separation des pouvoirs : le deposant ne peut pas statuer sur son propre justificatif.",
        });
      }

      await decider({
        agenceId,
        userId,
        row,
        nouveauStatut: "REFUSE",
        action: "REFUS",
        motif: input.refusMotif.trim(),
        refusMotif: input.refusMotif.trim(),
      });

      return { justificationId: row.id, statut: "REFUSE" as StatutJustificatif };
    }),
});

// ─── Helpers de mutation ──────────────────────────────────────────────────

type LigneJustification = typeof rhAbsenceJustifications.$inferSelect;

async function chargerJustification(
  agenceId: number,
  employeeId: number,
  date: string
): Promise<LigneJustification | null> {
  const rows = await db
    .select()
    .from(rhAbsenceJustifications)
    .where(
      and(
        eq(rhAbsenceJustifications.agenceId, agenceId),
        eq(rhAbsenceJustifications.employeeId, employeeId),
        eq(rhAbsenceJustifications.date, date)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Transaction atomique : statut + decision d'historique. L'historique est
 * immuable (`onDelete: restrict`) : on ajoute une ligne, on n'efface jamais
 * une decision.
 */
async function decider(opts: {
  agenceId: number;
  userId: number;
  row: LigneJustification;
  nouveauStatut: "VALIDE" | "REFUSE";
  action: "VALIDATION" | "REFUS";
  motif: string;
  refusMotif?: string;
}): Promise<void> {
  const { agenceId, userId, row } = opts;

  await db.transaction(async (tx) => {
    await tx
      .update(rhAbsenceJustifications)
      .set({
        statut: opts.nouveauStatut,
        decisionPar: userId,
        decisionAt: new Date(),
        refusMotif: opts.nouveauStatut === "REFUSE" ? (opts.refusMotif ?? opts.motif) : null,
        updatedAt: new Date(),
      } as any)
      .where(eq(rhAbsenceJustifications.id, row.id));

    await tx.insert(rhAbsenceJustificationDecisions).values({
      justificationId: row.id,
      agenceId,
      ancienStatut: row.statut,
      nouveauStatut: opts.nouveauStatut,
      action: opts.action,
      acteurId: userId,
      motif: opts.motif,
    } as any);
  });

  await journaliserAvantApres(db, {
    agenceId,
    entityType: "rh_absence_justification",
    entityId: row.id,
    action: opts.action === "VALIDATION" ? "JUSTIFICATIF_VALIDE" : "JUSTIFICATIF_REFUSE",
    avant: { statut: row.statut, decisionPar: row.decisionPar, decisionAt: row.decisionAt ? String(row.decisionAt) : null },
    apres: { statut: opts.nouveauStatut, decisionPar: userId },
    motif: opts.motif,
    userId,
  });
}

function avantAction(a: string): string {
  return `JUSTIFICATIF_${a}`;
}

/**
 * §21 — Bloc de REFERENCE RPT-03, par employe et par periode.
 *
 * Meme chaine de calcul que `rhSensibilisation.indicateurs` : la reference est
 * donc identique par construction, jamais recalculee par RPT-04.
 */
async function chargerReferenceSensibilisation(
  ctx: { user: { id: string; agenceId: number } },
  charge: ChargeRapport,
  canSee: boolean
) {
  const regles = await db
    .select()
    .from(hrSensibilisationRules)
    .where(eq(hrSensibilisationRules.agenceId, ctx.user.agenceId));

  const d = charge.situation;
  const reglesNormalisees: RegleSensibilisation[] = regles.map((r) => ({
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

  return construireReferenceSensibilisation(
    d.employees.map((emp) => {
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
      const indicateur = calculerIndicateursSensibilisation({
        employe: emp,
        jours,
        analyse: analyserPeriode(jours),
        calcs: d.calcsByEmploye.get(emp.id) ?? [],
        segments,
        absences: d.absencesByEmploye.get(emp.id) ?? [],
        donnees: d,
        regles: reglesNormalisees,
      });
      return appliquerMasquageSalaire(indicateur, canSee);
    })
  );
}
