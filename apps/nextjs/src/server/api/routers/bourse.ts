import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db, rachats, rachatsLignes, produits, tarifs, lots, niveaux, stocks, ventes, ventesLignes, agences } from "@atelierone/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { enregistrerMouvement, TYPES_MOUVEMENT } from "~/server/lib/stock-engine";
import { BourseService } from "~/server/lib/bourse-service";

const etatValues = ["neuf", "bon", "moyen", "usage"] as const;
const etatCoefficients: Record<string, number> = { neuf: 0.7, bon: 0.5, moyen: 0.35, usage: 0.2 };
const PLAFOND_50_POURCENT = 0.50;

async function getNiveauxBourseIds(): Promise<string[]> {
  const rows = await db.select({ id: niveaux.id })
    .from(niveaux)
    .where(inArray(niveaux.code, ["SEC", "SECONDARY"]));
  return rows.map((r) => r.id);
}

export const bourseRouter = createTRPCRouter({
  eligibles: protectedProcedure
    .input(z.object({
      query: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const niveauIds = await getNiveauxBourseIds();
      if (niveauIds.length === 0) return { items: [], total: 0, page: 1, totalPages: 0 };

      const conditions = and(
        eq(produits.typeProduit, "MANUEL"),
        eq(produits.statutOfficiel, "OFFICIEL"),
        eq(produits.statut, "actif"),
        inArray(produits.niveauId, niveauIds),
        input.query ? sql`(${produits.titre}::text ILIKE ${`%${input.query}%`} OR ${produits.codeBarre}::text ILIKE ${`%${input.query}%`})` : undefined,
      );

      const [items, total] = await Promise.all([
        db.select({
          id: produits.id,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          isbn: produits.isbn,
          auteur: produits.auteur,
          editeur: produits.editeur,
          prixVente: produits.prixVente,
          prixMinimumVente: produits.prixMinimumVente,
        })
          .from(produits)
          .where(conditions)
          .orderBy(produits.titre)
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ count: sql<number>`count(*)` })
          .from(produits)
          .where(conditions),
      ]);

      return { items, total: Number(total[0]?.count ?? 0), page: input.page, totalPages: Math.ceil(Number(total[0]?.count ?? 0) / input.limit) };
    }),

  calculerPrix: protectedProcedure
    .input(z.object({
      produitId: z.number(),
      etat: z.enum(etatValues),
    }))
    .query(async ({ input }) => {
      const [prod] = await db.select({ prixVente: produits.prixVente })
        .from(produits).where(eq(produits.id, input.produitId)).limit(1);
      if (!prod) throw new TRPCError({ code: "NOT_FOUND", message: "Produit non trouvé" });

      const [maxTarif] = await db.select({ prix: tarifs.prix })
        .from(tarifs)
        .where(and(
          eq(tarifs.produitId, input.produitId),
          eq(tarifs.type, "maximum_rachat"),
          eq(tarifs.isActive, true),
        ))
        .orderBy(tarifs.prix)
        .limit(1);

      const coeff = etatCoefficients[input.etat] ?? 0.2;
      const prixVente = Number(prod.prixVente);
      const prixTheorique = prixVente * coeff;
      const plafond = prixVente * PLAFOND_50_POURCENT;
      const maxRachat = maxTarif ? Number(maxTarif.prix) : null;

      const prixUnitaire = Math.round(Math.min(prixTheorique, plafond, maxRachat ?? Infinity) * 100) / 100;

      return { prixUnitaire, coeff, plafond, maxRachat };
    }),

  list: protectedProcedure
    .input(z.object({
      query: z.string().optional(),
      type: z.enum(["rachat_simple", "rachat_bourse", "echange_bourse"]).optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(rachats.agenceId, ctx.user.agenceId ?? 1)];
      if (input.query) conditions.push(sql`${rachats.reference}::text ILIKE ${`%${input.query}%`}`);
      if (input.type) conditions.push(eq(rachats.type, input.type));

      const [items, total] = await Promise.all([
        db.select()
          .from(rachats)
          .where(and(...conditions))
          .orderBy(desc(rachats.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ count: sql<number>`count(*)` })
          .from(rachats)
          .where(and(...conditions)),
      ]);

      return { items, total: Number(total[0]?.count ?? 0), page: input.page, totalPages: Math.ceil(Number(total[0]?.count ?? 0) / input.limit) };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const rachat = await db.select().from(rachats).where(eq(rachats.id, input.id)).limit(1);
      if (!rachat[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Rachat non trouvé" });
      const lignes = await db.select()
        .from(rachatsLignes)
        .where(eq(rachatsLignes.rachatId, input.id));
      return { ...rachat[0], lignes };
    }),

  create: protectedProcedure
    .input(z.object({
      clientNom: z.string().optional(),
      clientContact: z.string().optional(),
      notes: z.string().optional(),
      type: z.enum(["rachat_bourse", "rachat_simple"]).default("rachat_simple"),
      lignes: z.array(z.object({
        produitId: z.number(),
        quantite: z.number().min(1),
        etat: z.enum(etatValues).default("usage"),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId ?? 1;
      const prefix = input.type === "rachat_bourse" ? "BRS" : "RCH";
      const ref = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      let montantTotal = 0;
      const lignesData: any[] = [];

      const niveauIds = input.type === "rachat_bourse" ? await getNiveauxBourseIds() : [];

      for (const ligne of input.lignes) {
        const [prod] = await db.select({
          titre: produits.titre,
          prixVente: produits.prixVente,
          prixMinimumVente: produits.prixMinimumVente,
          typeProduit: produits.typeProduit,
          statutOfficiel: produits.statutOfficiel,
          niveauId: produits.niveauId,
        })
          .from(produits).where(eq(produits.id, ligne.produitId)).limit(1);
        if (!prod) throw new TRPCError({ code: "NOT_FOUND", message: `Produit ${ligne.produitId} introuvable` });

        if (input.type === "rachat_bourse") {
          if (prod.typeProduit !== "MANUEL" || prod.statutOfficiel !== "OFFICIEL" || !prod.niveauId || !niveauIds.includes(prod.niveauId)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Produit ${prod.titre} non éligible à la bourse du livre` });
          }
        }

        const [maxTarif] = await db.select({ prix: tarifs.prix })
          .from(tarifs)
          .where(and(
            eq(tarifs.produitId, ligne.produitId),
            eq(tarifs.type, "maximum_rachat"),
            eq(tarifs.isActive, true),
          ))
          .orderBy(tarifs.prix)
          .limit(1);

        const coeff = etatCoefficients[ligne.etat] ?? 0.2;
        const prixVente = Number(prod.prixVente);
        const prixTheorique = prixVente * coeff;
        const plafond = prixVente * PLAFOND_50_POURCENT;
        const maxRachat = maxTarif ? Number(maxTarif.prix) : null;

        const prixUnitaire = Math.round(Math.min(prixTheorique, plafond, maxRachat ?? Infinity) * 100) / 100;
        const totalLigne = Math.round(prixUnitaire * ligne.quantite * 100) / 100;
        montantTotal += totalLigne;

        lignesData.push({
          produitId: ligne.produitId,
          quantite: ligne.quantite,
          prixUnitaire: String(prixUnitaire),
          etat: ligne.etat,
          totalLigne: String(totalLigne),
        });
      }

      const [rachat] = await db.insert(rachats).values({
        reference: ref,
        clientNom: input.clientNom || null,
        clientContact: input.clientContact || null,
        agenceId,
        operateurId: ctx.user!.id,
        montantTotal: String(montantTotal),
        type: input.type,
        stocke: false,
        notes: input.notes || null,
      } as any).returning();

      for (const ld of lignesData) {
        await db.insert(rachatsLignes).values({
          ...ld,
          rachatId: rachat.id,
          vendu: false,
        } as any);
      }

      for (const [idx, ligne] of input.lignes.entries()) {
        await db.transaction(async (tx) => {
          let lotId: number | null = null;

          if (input.type === "rachat_bourse") {
            const numeroLot = `BRS-${ref}-${ligne.produitId}`;
            const [lot] = await db.insert(lots).values({
              numeroLot,
              produitId: ligne.produitId,
              dateReception: new Date(),
              statut: "stocke",
              quantiteInitiale: ligne.quantite,
              coutUnitaire: lignesData[idx].prixUnitaire,
            } as any).returning();
            lotId = lot.id;

            await db.update(rachatsLignes)
              .set({ lotId: lot.id } as any)
              .where(and(
                eq(rachatsLignes.rachatId, rachat.id),
                eq(rachatsLignes.produitId, ligne.produitId),
              ));

            await db.update(rachats).set({ stocke: true } as any).where(eq(rachats.id, rachat.id));
          }

          await enregistrerMouvement(tx as any, {
            type: TYPES_MOUVEMENT.ACHAT_RECEPTION,
            sens: "E",
            produitId: ligne.produitId,
            agenceId,
            quantite: ligne.quantite,
            lotId: lotId ?? undefined,
            reference: ref,
            referenceType: "RACHAT",
            effectuePar: ctx.user!.id,
          } as any);
        });
      }

      return { id: rachat.id, reference: ref, montantTotal, type: input.type };
    }),

  getLots: protectedProcedure
    .input(z.object({
      statut: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      if (input.statut) conditions.push(eq(lots.statut, input.statut));

      const [items, total] = await Promise.all([
        db.select({
          id: lots.id,
          numeroLot: lots.numeroLot,
          produitId: lots.produitId,
          titre: produits.titre,
          prixReseal: rachatsLignes.prixReseal,
          prixUnitaire: rachatsLignes.prixUnitaire,
          vendu: rachatsLignes.vendu,
          rachatId: rachatsLignes.rachatId,
          statut: lots.statut,
          dateReception: lots.dateReception,
          quantiteInitiale: lots.quantiteInitiale,
        })
          .from(lots)
          .leftJoin(rachatsLignes, eq(rachatsLignes.lotId, lots.id))
          .leftJoin(produits, eq(produits.id, lots.produitId))
          .where(and(...conditions))
          .orderBy(desc(lots.dateReception))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ count: sql<number>`count(*)` })
          .from(lots).where(and(...conditions)),
      ]);

      return { items, total: Number(total[0]?.count ?? 0), page: input.page, totalPages: Math.ceil(Number(total[0]?.count ?? 0) / input.limit) };
    }),

  lotsDisponibles: protectedProcedure
    .input(z.object({
      statut: z.string().default("stocke"),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(lots.statut, input.statut),
      ];

      const [items, total] = await Promise.all([
        db.select({
          id: lots.id,
          numeroLot: lots.numeroLot,
          produitId: lots.produitId,
          titre: produits.titre,
          prixReseal: rachatsLignes.prixReseal,
          prixUnitaire: rachatsLignes.prixUnitaire,
          quantiteDisponible: sql<number>`COALESCE((SELECT ${stocks.quantite} FROM ${stocks} WHERE ${stocks.lotId} = ${lots.id} AND ${stocks.agenceId} = ${ctx.user.agenceId}), 0)`,
        })
          .from(lots)
          .leftJoin(rachatsLignes, eq(rachatsLignes.lotId, lots.id))
          .leftJoin(produits, eq(produits.id, lots.produitId))
          .where(and(...conditions))
          .orderBy(desc(lots.dateReception))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ count: sql<number>`count(*)` })
          .from(lots).where(and(...conditions)),
      ]);

      return { items, total: Number(total[0]?.count ?? 0), page: input.page, totalPages: Math.ceil(Number(total[0]?.count ?? 0) / input.limit) };
    }),

  vendreOccasion: protectedProcedure
    .input(z.object({
      lotId: z.number(),
      prixVente: z.number().min(0),
      clientId: z.number().optional(),
      modePaiement: z.string().default("especes"),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await BourseService.vendreOccasion({
        agenceId: ctx.user.agenceId,
        operateurId: ctx.user.id,
        clientId: input.clientId,
        lignes: [{ lotId: input.lotId, quantite: 1, prixUnitaire: input.prixVente }],
        modePaiement: input.modePaiement,
      } as any);
      return result;
    }),

  echange: protectedProcedure
    .input(z.object({
      clientNom: z.string(),
      clientContact: z.string().optional(),
      repriseLignes: z.array(z.object({
        produitId: z.number(),
        quantite: z.number().min(1),
        etat: z.enum(etatValues).default("usage"),
      })).min(1),
      venteLignes: z.array(z.object({
        lotId: z.number(),
        quantite: z.number().min(1),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await BourseService.echangeBourse({
        agenceId: ctx.user.agenceId,
        operateurId: ctx.user.id,
        clientNom: input.clientNom,
        clientContact: input.clientContact,
        rachatLignes: input.repriseLignes as any,
        echangeLignes: input.venteLignes?.map(l => ({ lotId: l.lotId, quantite: l.quantite })) ?? [],
      } as any);
      return result;
    }),
});
