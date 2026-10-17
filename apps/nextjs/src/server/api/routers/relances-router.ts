/**
 * RELANCES — écrire ce qui était jusqu'ici impossible.
 *
 * ÉTAPE 5, lot 2. La migration `0014` a rendu la table capable de dire ce
 * qu'une relance est et qui l'a faite. `relance-service.ts` définit ce qui
 * mérite d'être relancé. Ce routeur fait le reste : le lien entre les deux.
 *
 *
 * CE QUE CE ROUTEUR GARDE
 *
 * 1. **Une relance sans auteur.** `cree_par` est `NOT NULL` côté serveur. La
 *    colonne l'est en base depuis la `0014`, mais une colonne nullable et une
 *    règle applicative font deux vérités — et c'est la seconde qu'on contourne.
 *    Une relance automatique porte `canal: "SYSTEME"` : elle n'a pas d'auteur,
 *    et elle ne prétend pas en avoir un.
 *
 * 2. **Une relance sans sujet.** Ni `or_id` ni `vehicule_id` ni `client_id`
 *    n'est renseigné : on ne sait pas ce qui est relancé. C'est le trou
 *    historique de la table, et il se reproduirait par simple oubli.
 *
 * 3. **Le périmètre d'agence.** Une relance se lit dans son agence, jamais
 *    dans celle d'à côté. Les autres tables du module le font déjà ; une
 *    relance de créance qui fuite entre agences est une relance au mauvais
 *    client.
 */

import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { relances, ordresReparation, vehicules, clients, parkingVehicles } from "@atelierone/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  TYPES_RELANCE,
  CANAUX_RELANCE,
  STATUTS_RELANCE,
  TYPE_RELANCE_LABELS,
  CANAL_RELANCE_LABELS,
  STATUT_RELANCE_LABELS,
  estTypeRelance,
  estCanalRelance,
  estStatutRelance,
  relanceFermee,
  relancesAttendues,
  SEUIL_RELANCE_DEVIS_JOURS,
  SEUIL_RELANCE_IMMOBILISATION_JOURS,
  type TypeRelance,
  type CanalRelance,
  type StatutRelance,
} from "~/server/lib/relance-service";

export const relancesRouter = createTRPCRouter({
  /** Le vocabulaire, servi au client : une seule source, jamais recopiée. */
  vocabulaire: requirePermissionProcedure("creances.relancer").query(() => ({
    types: TYPES_RELANCE.map((t) => ({ value: t, label: TYPE_RELANCE_LABELS[t] })),
    canaux: CANAUX_RELANCE.map((c) => ({ value: c, label: CANAL_RELANCE_LABELS[c] })),
    statuts: STATUTS_RELANCE.map((s) => ({ value: s, label: STATUT_RELANCE_LABELS[s] })),
    seuils: {
      devisJours: SEUIL_RELANCE_DEVIS_JOURS,
      immobilisationJours: SEUIL_RELANCE_IMMOBILISATION_JOURS,
    },
  })),

  /** Ce qu'il faut relancer sur ce dossier, une relance déjà partie exclue. */
  attendues: requirePermissionProcedure("creances.relancer")
    .input(z.object({ vehiculeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [v] = await db
        .select({ id: vehicules.id, statutImmobilisation: vehicules.statutImmobilisation })
        .from(vehicules)
        .where(and(eq(vehicules.id, input.vehiculeId), eq(vehicules.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });

      const [or] = await db
        .select({
          id: ordresReparation.id,
          statut: ordresReparation.statut,
          devisAccepte: ordresReparation.devisAccepte,
        })
        .from(ordresReparation)
        .where(
          and(
            eq(ordresReparation.vehiculeId, input.vehiculeId),
            eq(ordresReparation.agenceId, ctx.user.agenceId),
            sql`${ordresReparation.statut} NOT IN ('LIVRE','ANNULE','ferme_definitif')`,
          ),
        )
        .orderBy(desc(ordresReparation.id))
        .limit(1);

      // Jours d'immobilisation : ce qui est PRATIQUE, pas ce qui est daté.
      // Un dossier peut être ouvert depuis six mois ; ce qui compte est le
      // nombre de jours depuis que le véhicule est à l'arrêt.
      //
      // La date vient du REGISTRE PARKING, pas du dossier. Un dossier peut
      // rester ouvert bien après la sortie du véhicule : compter depuis
      // l'ouverture ferait d'un dossier clos de longue date un véhicule
      // « immobilisé depuis 200 jours », et l'alerte serait irrecevable - et l'agent finirait par ignorer l'onglet entier.
      // La consigne du module est inverse — pas d'invention : `date_entree`
      // est NULLABLE tant qu'elle n'est pas relevée, et dans ce cas on ne
      // devine pas, on ne propose pas.
      const [parking] = await db
        .select({ dateEntree: parkingVehicles.dateEntree })
        .from(parkingVehicles)
        .where(
          and(
            eq(parkingVehicles.vehiculeId, input.vehiculeId),
            eq(parkingVehicles.agenceId, ctx.user.agenceId),
          ),
        )
        .orderBy(desc(parkingVehicles.dateEntree))
        .limit(1);

      const jours = parking?.dateEntree
        ? Math.max(
            0,
            Math.floor((Date.now() - new Date(parking.dateEntree).getTime()) / 86_400_000),
          )
        : null;

      // Une relance déjà partie sur ce dossier n'est pas redemandée : ce serait
      // du bruit, et du bruit apprend à ne plus regarder l'écran.
      const dejaParties = await db
        .select({ type: relances.type })
        .from(relances)
        .where(
          and(
            eq(relances.agenceId, ctx.user.agenceId),
            eq(relances.vehiculeId, input.vehiculeId),
            sql`${relances.statut} NOT IN ('REPONDUE','CLOTUREE','ECHEC')`,
          ),
        );

      const candidates = relancesAttendues(
        or ? { statut: or.statut, devisAccepte: or.devisAccepte, resteDu: 0 } : null,
        {
          joursImmobilisation: jours,
          statutImmobilisation: v.statutImmobilisation,
        },
      );

      const enCours = new Set(dejaParties.map((r) => r.type));
      return {
        orId: or?.id ?? null,
        candidates: candidates.filter((c) => !enCours.has(c.type)),
        dejaEnCours: [...enCours],
      };
    }),

  /** Historique d'un dossier, du plus récent au plus ancien. */
  parDossier: requirePermissionProcedure("creances.relancer")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(relances)
        .where(and(eq(relances.orId, input.orId), eq(relances.agenceId, ctx.user.agenceId)))
        .orderBy(desc(relances.createdAt));
    }),

  /** Historique d'un véhicule — la vue du garage, qui ne connaît que la plaque. */
  parVehicule: requirePermissionProcedure("creances.relancer")
    .input(z.object({ vehiculeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(relances)
        .where(and(eq(relances.vehiculeId, input.vehiculeId), eq(relances.agenceId, ctx.user.agenceId)))
        .orderBy(desc(relances.createdAt));
    }),

  /** Historique d'un client : toutes ses relances, tous sujets confondus. */
  parClient: requirePermissionProcedure("creances.relancer")
    .input(z.object({ clientId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(relances)
        .where(and(eq(relances.clientId, input.clientId), eq(relances.agenceId, ctx.user.agenceId)))
        .orderBy(desc(relances.createdAt));
    }),

  /** Relances ouvertes d'une agence : la file à traiter. */
  file: requirePermissionProcedure("creances.relancer")
    .input(
      z
        .object({
          type: z.string().optional(),
          statut: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const lignes = await db
        .select({
          id: relances.id,
          type: relances.type,
          canal: relances.canal,
          statut: relances.statut,
          message: relances.message,
          envoyeeLe: relances.envoyeeLe,
          clientId: relances.clientId,
          clientNom: clients.nom,
          clientTelephone: clients.telephone,
          vehiculeId: relances.vehiculeId,
          orId: relances.orId,
          immatriculation: vehicules.immatriculation,
          createdAt: relances.createdAt,
        })
        .from(relances)
        .leftJoin(clients, eq(clients.id, relances.clientId))
        .leftJoin(vehicules, eq(vehicules.id, relances.vehiculeId))
        .where(eq(relances.agenceId, ctx.user.agenceId))
        .orderBy(desc(relances.createdAt))
        .limit(200);

      const t = input?.type;
      const s = input?.statut;
      return lignes.filter((l) => (t ? l.type === t : true) && (s ? l.statut === s : true));
    }),

  /** Écrire une relance. */
  creer: requirePermissionProcedure("creances.relancer")
    .input(
      z.object({
        type: z.string(),
        canal: z.string().default("SYSTEME"),
        message: z.string().min(1, "Le message est obligatoire."),
        clientId: z.number().int().optional(),
        orId: z.number().int().optional(),
        vehiculeId: z.number().int().optional(),
        detteId: z.number().int().optional(),
        statut: z.string().default("ENVOYEE"),
        envoyeeLe: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Le vocabulaire est vérifié ICI, pas seulement par la contrainte SQL.
      // La base dit « valeur invalide » sans dire lesquelles sont valides ;
      // l'agent qui a mal choisi ne peut pas se corriger tout seul.
      if (!estTypeRelance(input.type)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Type de relance inconnu : « ${input.type} ». Attendus : ${TYPES_RELANCE.join(", ")}.`,
        });
      }
      if (!estCanalRelance(input.canal)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Canal inconnu : « ${input.canal} ». Attendus : ${CANAUX_RELANCE.join(", ")}.`,
        });
      }
      if (!estStatutRelance(input.statut)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Statut inconnu : « ${input.statut} ». Attendus : ${STATUTS_RELANCE.join(", ")}.`,
        });
      }

      // (2) Une relance doit dire ce qu'elle relance.
      if (!input.clientId && !input.orId && !input.vehiculeId && !input.detteId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Une relance doit dire ce qu'elle relance : véhicule, dossier ou client. " +
            "Une relance sans sujet n'est pas une relance, c'est une note.",
        });
      }

      // (1) Une relance humaine porte un auteur. Une relance automatique
      // s'identifie par son canal — et c'est tout.
      const automatique = input.canal === "SYSTEME";
      if (!automatique && !ctx.user.id) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Une relance envoyée par un canal suppose un auteur. Refusée.",
        });
      }

      const [row] = (await db
        .insert(relances)
        .values({
          clientId: input.clientId ?? null,
          orId: input.orId ?? null,
          vehiculeId: input.vehiculeId ?? null,
          detteId: input.detteId ?? null,
          agenceId: ctx.user.agenceId,
          type: input.type as TypeRelance,
          canal: input.canal as CanalRelance,
          message: input.message,
          statut: input.statut as StatutRelance,
          creePar: automatique ? null : Number(ctx.user.id),
          envoyeeLe: input.envoyeeLe ? new Date(input.envoyeeLe) : new Date(),
        } as any)
        .returning()) as unknown as Array<typeof relances.$inferSelect>;

      return row;
    }),

  /** Faire avancer une relance : elle est partie, lue, répondue… */
  changerStatut: requirePermissionProcedure("creances.relancer")
    .input(
      z.object({
        id: z.number().int(),
        statut: z.string(),
        luLe: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!estStatutRelance(input.statut)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Statut inconnu : « ${input.statut} ». Attendus : ${STATUTS_RELANCE.join(", ")}.`,
        });
      }
      const [avant] = await db
        .select()
        .from(relances)
        .where(and(eq(relances.id, input.id), eq(relances.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!avant) throw new TRPCError({ code: "NOT_FOUND", message: "Relance introuvable." });

      // Une relance close ne se rouvre pas en silence : rouvrir une relance
      // « répondue » ferait réapparaître un client qui a déjà répondu dans une
      // file d'attente. Si c'est voulu, c'est une NOUVELLE relance.
      if (relanceFermee(avant.statut)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cette relance est close (« ${STATUT_RELANCE_LABELS[avant.statut as StatutRelance] ?? avant.statut} »). Créez une nouvelle relance plutôt que de la rouvrir.`,
        });
      }

      const [apres] = (await db
        .update(relances)
        .set({
          statut: input.statut as StatutRelance,
          luLe: input.luLe ? new Date(input.luLe) : avant.luLe,
        } as any)
        .where(eq(relances.id, input.id))
        .returning()) as unknown as Array<typeof relances.$inferSelect>;
      return apres;
    }),

  /** Clôturer en lot ce qui n'a pas eu de réponse — la fin d'une campagne. */
  cloturerSansReponse: requirePermissionProcedure("creances.relancer")
    .input(z.object({ avant: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const condition = and(
        eq(relances.agenceId, ctx.user.agenceId),
        inArray(relances.statut, ["EN_ATTENTE", "ENVOYEE", "SANS_REPONSE"]),
        input?.avant ? sql`${relances.createdAt} < ${new Date(input.avant)}` : undefined,
      );
      return db
        .update(relances)
        .set({ statut: "CLOTUREE" } as any)
        .where(condition)
        .returning({ id: relances.id });
    }),
});