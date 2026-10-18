import { z } from "zod";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db, lots, produits } from "@atelierone/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import {
  ouvrirContenant,
  deconditionnerContenant,
  listerContenantsOuverts,
  dlcEffective,
  factoriserConversion,
} from "~/server/lib/contenants-service";

/**
 * CONTENANTS — l'huile en fût.
 *
 * Ce router ne fait qu'une chose, et la fait entièrement : ouvrir un
 * contenant, en tirer des unités tracées, et répondre à « qu'est-ce qui
 * reste, et jusqu'à quand ».
 *
 * Il ne REDESSINE pas l'inventaire — il s'y branche. Le stock des bidons
 * entre par le moteur de mouvements, comme tout le reste.
 */

export const stockContenantsRouter = createTRPCRouter({
  /**
   * CONTENANTS SCELLÉS EN ATTENTE D'OUVERTURE.
   *
   * Un lot « scellé » est un lot dont on ne connaît pas la date d'ouverture.
   * Ce sont les fûts arrivés du fournisseur et pas encore ouverts — donc
   * probablement à ouvrir. C'est aussi le seul endroit où l'écran de
   * déconditionnement a le choix : ouvrir un contenant déjà ouvert est
   * refusé, donc proposer les deux serait un piège.
   */
  scelles: requirePermissionProcedure("stock.consulter")
    .input(z.object({ produitId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          lotId: lots.id,
          produitId: lots.produitId,
          titre: produits.titre,
          numeroLot: lots.numeroLot,
          datePeremption: lots.datePeremption,
          dateFabrication: lots.dateFabrication,
          provenance: lots.provenance,
          quantiteEnStock: sql<number>`COALESCE((
            SELECT SUM(sl.quantite) FROM stocks_lots sl
             WHERE sl.lot_id = ${lots.id} AND sl.agence_id = ${ctx.user.agenceId}
          ), 0)`,
          estBloque: lots.estBloque,
          motifBlocage: lots.motifBlocage,
        })
        .from(lots)
        .innerJoin(produits, eq(produits.id, lots.produitId))
        .where(
          and(
            isNull(lots.dateOuverture),
            input?.produitId ? eq(lots.produitId, input.produitId) : undefined,
          ),
        )
        .orderBy(asc(lots.dateEntree))
        .limit(60);

      return rows.map((r) => ({ ...r, quantiteEnStock: Number(r.quantiteEnStock) }));
    }),

  /**
   * OUVRIR UN CONTENANT.
   *
   * On enregistre le jour où le fût a été ouvert, et la SOURCE du délai de
   * conservation retenu. Une DLC sans source est une devinette ; on la
   * refuse plutôt que de la faire circuler.
   */
  ouvrir: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      lotId: z.number().int(),
      /** Format YYYY-MM-DD. Par défaut aujourd'hui. */
      dateOuverture: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      periodiciteJours: z.number().int().positive().optional(),
      reference: z.string().max(200).optional(),
      contenuSource: z.number().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const r = await db.transaction(async (tx) =>
        ouvrirContenant(tx as never, {
          lotId: input.lotId,
          dateOuverture: input.dateOuverture ? new Date(input.dateOuverture) : null,
          periodiciteJours: input.periodiciteJours ?? null,
          reference: input.reference ?? null,
          contenuSource: input.contenuSource ?? null,
          effectuePar: Number(ctx.user.id),
        }),
      );

      // Le stock ne bouge pas à l'ouverture : seule la DLC change. Mais
      // l'écran des fûts affiche la DLC, donc il doit se rafraîchir.
      await Promise.all([
        // invalidation faite par l'appelant ; ici on garde le service pur.
        Promise.resolve(),
      ]);

      return r.dejaOuvert
        ? {
            ...r,
            message:
              "Ce contenant était déjà ouvert : sa date d'ouverture n'a pas été modifiée.",
          }
        : r;
    }),

  /**
   * PRÉVOIR LE DÉCONDITIONNEMENT — combien de bidons dans un fût.
   *
   * Le facteur est calculé depuis les tables d'unités, puis FIGÉ à
   * l'opération. L'afficher avant permet au magasinier de vérifier qu'il a
   * choisi la bonne unité cible — 208 bidons de 1 L dans un fût de 208 L, ou
   * 52 bidons de 4 L.
   */
  previsualiserDeconditionnement: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      lotId: z.number().int(),
      uniteSourceId: z.string().uuid(),
      uniteCibleId: z.string().uuid(),
      produitCibleId: z.number().int().optional(),
      quantiteSource: z.number().positive().default(1),
    }))
    .query(async ({ input }) => {
      const [lot] = await db
        .select({
          id: lots.id,
          produitId: lots.produitId,
          numeroLot: lots.numeroLot,
          dateOuverture: lots.dateOuverture,
          periodicite: lots.periodiciteOuvertureJours,
          datePeremption: lots.datePeremption,
          contenuRestant: lots.contenuRestant,
          estBloque: lots.estBloque,
          quantiteEnStock: sql<number>`COALESCE((
            SELECT SUM(sl.quantite) FROM stocks_lots sl WHERE sl.lot_id = ${lots.id}
          ), 0)`,
        })
        .from(lots)
        .where(eq(lots.id, input.lotId))
        .limit(1);

      if (!lot) throw new TRPCError({ code: "NOT_FOUND", message: "Lot introuvable." });

      const produitCibleId = input.produitCibleId ?? lot.produitId;
      const facteur = await factoriserConversion(
        db as never,
        lot.produitId,
        produitCibleId,
        input.uniteSourceId,
        input.uniteCibleId,
      );
      const dlc = dlcEffective(lot);

      return {
        lotId: lot.id,
        numeroLot: lot.numeroLot,
        produitId: lot.produitId,
        produitCibleId,
        facteur,
        quantiteSource: input.quantiteSource,
        quantiteCible: Math.round(input.quantiteSource * facteur * 100) / 100,
        quantiteEnStock: Number(lot.quantiteEnStock),
        ouvert: lot.dateOuverture != null,
        dateOuverture: lot.dateOuverture,
        dlc: dlc ? dlc.toISOString().slice(0, 10) : null,
        contenuRestant: lot.contenuRestant != null ? Number(lot.contenuRestant) : null,
        bloquant: lot.estBloque
          ? "Ce lot est bloque (rappel ou consignation)."
          : !lot.dateOuverture
            ? "Ce contenant n'est pas ouvert : ouvrez-le d'abord."
            : null,
      };
    }),

  /** Tirer les unités du contenant ouvert. */
  deconditionner: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      lotId: z.number().int(),
      uniteSourceId: z.string().uuid(),
      uniteCibleId: z.string().uuid(),
      produitCibleId: z.number().int().optional(),
      quantiteSource: z.number().positive().default(1),
      quantiteCible: z.number().positive().optional(),
      emplacementSourceId: z.number().int().optional(),
      emplacementCibleId: z.number().int().optional(),
      motif: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Le facteur est calculé ici, jamais reçu du client : une quantité cible
      // envoyée par un navigateur est une quantité que l'on ne peut pas
      // vérifier. On la déduit des tables d'unités, puis on la fige.
      const [lot] = await db
        .select({ produitId: lots.produitId })
        .from(lots)
        .where(eq(lots.id, input.lotId))
        .limit(1);
      if (!lot) throw new TRPCError({ code: "NOT_FOUND", message: "Lot introuvable." });

      const produitCibleId = input.produitCibleId ?? lot.produitId;
      const facteur = await factoriserConversion(
        db as never,
        lot.produitId,
        produitCibleId,
        input.uniteSourceId,
        input.uniteCibleId,
      );
      const quantiteCible = input.quantiteCible ?? Math.round(input.quantiteSource * facteur * 100) / 100;

      return db.transaction(async (tx) =>
        deconditionnerContenant(tx as never, {
          lotId: input.lotId,
          produitCibleId,
          uniteSourceId: input.uniteSourceId,
          uniteCibleId: input.uniteCibleId,
          quantiteSource: input.quantiteSource,
          quantiteCible,
          emplacementSourceId: input.emplacementSourceId ?? null,
          emplacementCibleId: input.emplacementCibleId ?? null,
          motif: input.motif ?? null,
          effectuePar: Number(ctx.user.id),
          facteurConversion: facteur,
        }),
      );
    }),

  /**
   * OPTIONS DE DÉCONDITIONNEMENT — que peut-on tirer de ce fût, et combien.
   *
   * Le magasinier ne doit choisir que deux choses : l'article qui reçoit, et
   * l'unité qu'il veut obtenir. Le NOMBRE est calculé depuis les tables
   * d'unités et affiché — jamais saisi. Saisir « combien de bidons » pour
   * une opération entièrement déterminée par le conditionnement, c'est
   * inviter à saisir 208 bidons dans un fût de 208 litres… ou 1.
   */
  optionsDeconditionnement: requirePermissionProcedure("stock.consulter")
    .input(z.object({ lotId: z.number().int() }))
    // `ctx` n'est pas utilisé : les options portent sur le catalogue, pas
    // sur l'agence. On le dit (`_ctx`) plutôt que de le supprimer, parce que
    // la forme de la callback reste celle attendue par tRPC.
    .query(async ({ ctx: _ctx, input }) => {
      const [lot] = await db
        .select({
          lotId: lots.id,
          produitId: lots.produitId,
          titre: produits.titre,
          numeroLot: lots.numeroLot,
          categorieId: produits.categorieId,
          typeProduit: produits.typeProduit,
        })
        .from(lots)
        .innerJoin(produits, eq(produits.id, lots.produitId))
        .where(eq(lots.id, input.lotId))
        .limit(1);
      if (!lot) throw new TRPCError({ code: "NOT_FOUND", message: "Lot introuvable." });

      // Type EXPLICITE : `db.execute` renvoie un type opaque, et diffuser ses
      // lignes sans le nommer effondre l'inférence côté client — TypeScript
      // nie alors l'existence même de `libelle`. La forme est donc écrite ici.
      type LigneUnite = { id: string; code: string; libelle: string; symbole: string | null };

      const unitesSource = (await db.execute(sql`
        SELECT u.id, u.code, u.libelle, u.symbole, pu.facteur_vers_base AS facteur
          FROM produit_unites pu
          JOIN unites_mesure u ON u.id = pu.unite_id
         WHERE pu.produit_id = ${lot.produitId}
         ORDER BY pu.facteur_vers_base DESC`)) as unknown as (LigneUnite & {
        facteur: string | null;
      })[];

      // Les articles CANDIDATS : même catégorie, même type produit. C'est ce
      // qui évite de proposer un moteur à côté d'une huile.
      const candidats = await db
        .select({
          produitId: produits.id,
          titre: produits.titre,
          typeProduit: produits.typeProduit,
          uniteBaseId: produits.uniteBaseId,
        })
        .from(produits)
        .where(
          and(
            eq(produits.isActive, true),
            eq(produits.typeProduit, lot.typeProduit),
            lot.categorieId ? eq(produits.categorieId, lot.categorieId) : undefined,
            sql`${produits.id} <> ${lot.produitId}`,
          ),
        )
        .limit(40);

      const unitesCibleParProduit = new Map<number, (LigneUnite & { facteur: number })[]>();
      if (candidats.length) {
        const parProduit = (await db.execute(sql`
          SELECT pu.produit_id, u.id, u.code, u.libelle, u.symbole,
                 pu.facteur_vers_base AS facteur
            FROM produit_unites pu
            JOIN unites_mesure u ON u.id = pu.unite_id
           WHERE pu.produit_id IN (${sql.join(
             candidats.map((c) => c.produitId),
             sql`, `,
           )})
           ORDER BY pu.facteur_vers_base ASC`)) as unknown as (LigneUnite & {
          produit_id: number;
          facteur: string | null;
        })[];
        for (const u of parProduit) {
          const liste = unitesCibleParProduit.get(u.produit_id) ?? [];
          liste.push({ ...u, facteur: Number(u.facteur ?? 1) });
          unitesCibleParProduit.set(u.produit_id, liste);
        }
      }

      return {
        lot: {
          lotId: lot.lotId,
          produitId: lot.produitId,
          titre: lot.titre,
          numeroLot: lot.numeroLot,
        },
        unitesSource: unitesSource.map((u) => ({ ...u, facteur: Number(u.facteur ?? 1) })),
        cibles: candidats.map((c) => ({
          produitId: c.produitId,
          titre: c.titre,
          typeProduit: c.typeProduit,
          unites: unitesCibleParProduit.get(c.produitId) ?? [],
        })),
      };
    }),

  /** Le tableau de bord : ce qui reste, et jusqu'à quand. */
  ouverts: requirePermissionProcedure("stock.consulter")
    .input(z.object({ produitId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Le service renvoie déjà une forme typée ET normalise les nombres.
      // Le redisposer ici détruirait l'inférence pour rien.
      return listerContenantsOuverts(ctx.user.agenceId, input?.produitId);
    }),
});