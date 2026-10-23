/**
 * ÉTAPE 7 — INTERVENTIONS ET SOUS-TRAITANCE.
 *
 * Lot 1 : rendre saisissables les notions du lot 2.
 *
 * `or_interventions` est en AJOUT SEUL. Il n'y a ni `update` ni `delete` dans ce
 * routeur, et c'est délibéré : un compte rendu qu'on peut corriger n'est plus
 * un compte rendu, c'est une note. Si un technicien se trompe, il en écrit un
 * autre — la série reste lisible, et le suivant corrige sans effacer.
 *
 * C'est aussi ce qui répond à « la mise à jour ne supprime pas les autres » :
 * la garantie n'est pas une discipline, c'est l'absence même du bouton.
 *
 *
 * DEUX PERMISSIONS, ET POURQUOI
 *
 * `or.intervenir` pour CONSTATER, `or.modifier` pour agir sur le dossier.
 *
 * Dans un atelier, le technicien qui constate n'a pas toujours le droit de
 * facturer ou de clore. Fusionner les deux habilitations fait de la
constatation un privilège de celui qui décide — et c'est exactement la
 * hiérarchie qu'on ne veut pas voir apparaître dans une revue.
 */

import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { orInterventions, ordresReparation, employes, lignesOrdreReparation, vehicules } from "@atelierone/db";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { LIBELLES_SOUS_TRAITANCE } from "~/server/lib/revue-parc-service";

/** Le vocabulaire est contraint par une CHECK en base — ici on le nomme. */
const STATUTS_SOUS_TRAITANCE = [
  "A_ENVOYER",
  "EN_ATTENTE_FOURNISSEUR",
  "REPARTI",
  "RECU",
  "ANNULE",
] as const;

export const interventionsRouter = createTRPCRouter({
  /**
   * Écrire un compte rendu. AJOUT SEUL — ni mise à jour, ni suppression.
   *
   * `au moins un des trois` : un enregistrement vide n'apprend rien et pollue
   * la lecture. On n'oblige pas à remplir les trois — un technicien qui a
   * seulement constaté n'a pas toujours une idée de la suite.
   */
  ecrire: requirePermissionProcedure("or.intervenir")
    .input(
      z.object({
        ligneId: z.number().int(),
        intervention: z.string().trim().max(4000).optional(),
        constat: z.string().trim().max(4000).optional(),
        suite: z.string().trim().max(4000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.intervention && !input.constat && !input.suite) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Un compte rendu vide n'apprend rien : dites au moins ce que vous avez constaté.",
        });
      }

      const [ligne] = await db
        .select({
          id: lignesOrdreReparation.id,
          orId: lignesOrdreReparation.ordreId,
          vehiculeId: ordresReparation.vehiculeId,
          libelle: lignesOrdreReparation.libelle,
        })
        .from(lignesOrdreReparation)
        .innerJoin(ordresReparation, eq(ordresReparation.id, lignesOrdreReparation.ordreId))
        .where(
          and(
            eq(lignesOrdreReparation.id, input.ligneId),
            eq(ordresReparation.agenceId, ctx.user.agenceId),
          ),
        )
        .limit(1);

      if (!ligne) throw new TRPCError({ code: "NOT_FOUND", message: "Ligne de travail introuvable." });

      // L'auteur est l'utilisateur connecté. `technicien_id` référence un
      // EMPLOYÉ : la session ne le donne pas toujours (un compte peut être
      // rattaché à plusieurs employés). On ne l'invente pas — la note reste
      // signée par l'utilisateur, résolu à la lecture.
      const [employe] = await db
        .select({ id: employes.id })
        .from(employes)
        .where(eq(employes.userId, Number(ctx.user.id)))
        .limit(1);

      const [row] = await db
        .insert(orInterventions)
        .values({
          ligneId: ligne.id,
          orId: ligne.orId,
          vehiculeId: ligne.vehiculeId,
          technicienId: employe?.id ?? null,
          intervention: input.intervention || null,
          constat: input.constat || null,
          suite: input.suite || null,
        } as any)
        .returning() as unknown as Array<typeof orInterventions.$inferSelect>;

      return row;
    }),

  /** L'évolution d'une ligne, du plus ancien au plus récent. */
  parLigne: requirePermissionProcedure("or.consulter")
    .input(z.object({ ligneId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const lignes = await db
        .select({
          id: orInterventions.id,
          intervention: orInterventions.intervention,
          constat: orInterventions.constat,
          suite: orInterventions.suite,
          createdAt: orInterventions.createdAt,
          technicien: sql<{ nom: string | null } | null>`(
            (SELECT e.nom FROM employes e WHERE e.id = ${orInterventions.technicienId})
          )`,
        })
        .from(orInterventions)
        .innerJoin(ordresReparation, eq(ordresReparation.id, orInterventions.orId))
        .where(
          and(
            eq(orInterventions.ligneId, input.ligneId),
            eq(ordresReparation.agenceId, ctx.user.agenceId),
          ),
        )
        .orderBy(orInterventions.createdAt);
      // Du plus ancien au plus récent : on lit une HISTOIRE, pas un-tableau
      // trié par date décroissante où l'ordre ne veut rien dire.
      return lignes;
    }),

  /** Tout ce qui a été constaté sur un véhicule, tous dossiers confondus. */
  parVehicule: requirePermissionProcedure("or.consulter")
    .input(z.object({ vehiculeId: z.number().int(), limite: z.number().int().max(50).optional() }))
    .query(async ({ ctx, input }) => {
      return db
        .select({
          id: orInterventions.id,
          ligneId: orInterventions.ligneId,
          libelle: lignesOrdreReparation.libelle,
          intervention: orInterventions.intervention,
          constat: orInterventions.constat,
          suite: orInterventions.suite,
          createdAt: orInterventions.createdAt,
          technicien: sql<{ nom: string | null } | null>`(
            (SELECT e.nom FROM employes e WHERE e.id = ${orInterventions.technicienId})
          )`,
        })
        .from(orInterventions)
        .innerJoin(lignesOrdreReparation, eq(lignesOrdreReparation.id, orInterventions.ligneId))
        .innerJoin(ordresReparation, eq(ordresReparation.id, orInterventions.orId))
        .where(
          and(
            eq(orInterventions.vehiculeId, input.vehiculeId),
            eq(ordresReparation.agenceId, ctx.user.agenceId),
          ),
        )
        .orderBy(desc(orInterventions.createdAt))
        .limit(input.limite ?? 20);
    }),

  /**
   * JOURNAL ATELIER — tous les comptes rendus de l'agence, du plus récent au
   * plus ancien. C'est la vue qui manquait : `parVehicule` oblige à connaître
   * la plaque, et `parLigne` à ouvrir chaque ligne une par une.
   */
  fluxAtelier: requirePermissionProcedure("or.consulter")
    .input(
      z.object({
        search: z.string().trim().optional(),
        technicienId: z.number().int().optional(),
        limite: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [
        eq(ordresReparation.agenceId, ctx.user.agenceId),
      ];
      if (input.technicienId) {
        conditions.push(eq(orInterventions.technicienId, input.technicienId));
      }
      const recherche = input.search?.trim();
      if (recherche) {
        const q = `%${recherche}%`;
        conditions.push(
          or(
            ilike(vehicules.immatriculation, q),
            ilike(ordresReparation.numero, q),
            ilike(lignesOrdreReparation.libelle, q),
            ilike(orInterventions.constat, q),
            ilike(orInterventions.intervention, q),
            ilike(orInterventions.suite, q),
          )!,
        );
      }

      return db
        .select({
          id: orInterventions.id,
          orId: orInterventions.orId,
          numero: ordresReparation.numero,
          vehiculeId: orInterventions.vehiculeId,
          immatriculation: vehicules.immatriculation,
          ligneId: orInterventions.ligneId,
          ligneLibelle: lignesOrdreReparation.libelle,
          constat: orInterventions.constat,
          intervention: orInterventions.intervention,
          suite: orInterventions.suite,
          createdAt: orInterventions.createdAt,
          technicienId: orInterventions.technicienId,
          technicienNom: employes.nom,
          technicienPrenom: employes.prenom,
        })
        .from(orInterventions)
        .innerJoin(ordresReparation, eq(ordresReparation.id, orInterventions.orId))
        .innerJoin(vehicules, eq(vehicules.id, orInterventions.vehiculeId))
        .leftJoin(employes, eq(employes.id, orInterventions.technicienId))
        .leftJoin(lignesOrdreReparation, eq(lignesOrdreReparation.id, orInterventions.ligneId))
        .where(and(...conditions))
        .orderBy(desc(orInterventions.createdAt))
        .limit(input.limite);
    }),

  /** Le dernier constat d'un véhicule — ce que la revue du matin lit en premier. */
  dernierConstat: requirePermissionProcedure("or.consulter")
    .input(z.object({ vehiculeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db
        .select({
          constat: orInterventions.constat,
          intervention: orInterventions.intervention,
          suite: orInterventions.suite,
          createdAt: orInterventions.createdAt,
          libelle: lignesOrdreReparation.libelle,
        })
        .from(orInterventions)
        .innerJoin(lignesOrdreReparation, eq(lignesOrdreReparation.id, orInterventions.ligneId))
        .innerJoin(ordresReparation, eq(ordresReparation.id, orInterventions.orId))
        .where(
          and(
            eq(orInterventions.vehiculeId, input.vehiculeId),
            eq(ordresReparation.agenceId, ctx.user.agenceId),
            sql`${orInterventions.constat} IS NOT NULL`,
          ),
        )
        .orderBy(desc(orInterventions.createdAt))
        .limit(1);
      return row ?? null;
    }),

  /**
   * Décider une sous-traitance.
   *
   * Décision prise en réunion : le véhicule part, chez qui, pour quoi, et on
   * l'attend à quelle date. Tant que ce n'était pas consigné, elle ne se
   * lisait qu'en mémoire — et le véhicule attendait, invisible, comme s'il
   * n'avait aucune raison.
   */
  sousTraitance: requirePermissionProcedure("or.modifier")
    .input(
      z.object({
        orId: z.number().int(),
        statut: z.enum(STATUTS_SOUS_TRAITANCE),
        fournisseurId: z.number().int().optional(),
        retourPrevu: z.string().nullable().optional(),
        note: z.string().trim().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [or] = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          sousTraitanceStatut: ordresReparation.sousTraitanceStatut,
        })
        .from(ordresReparation)
        .where(
          and(
            eq(ordresReparation.id, input.orId),
            eq(ordresReparation.agenceId, ctx.user.agenceId),
          ),
        )
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });

      // « En attente du prestataire » sans savoir QUI est une attente
      // anonyme : la revue ne peut pas relancer personne.
      if (input.statut !== "ANNULE" && !input.fournisseurId && !or.sousTraitanceStatut) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Indiquez le prestataire : « en attente du prestataire » sans nom n'est pas une attente.",
        });
      }

      const [apres] = await db
        .update(ordresReparation)
        .set({
          sousTraitanceStatut: input.statut,
          sousTraitanceFournisseurId: input.fournisseurId ?? null,
          sousTraitanceRetourPrevu: input.retourPrevu ?? null,
          sousTraitanceNote: input.note ?? null,
          updatedAt: new Date(),
        } as any)
        .where(eq(ordresReparation.id, input.orId))
        .returning() as unknown as Array<typeof ordresReparation.$inferSelect>;

      return apres;
    }),

  /** Le vocabulaire, pour que l'écran ne recopie pas la liste. */
  vocabulaire: requirePermissionProcedure("or.consulter").query(() =>
    Object.entries(LIBELLES_SOUS_TRAITANCE).map(([value, label]) => ({ value, label })),
  ),
});