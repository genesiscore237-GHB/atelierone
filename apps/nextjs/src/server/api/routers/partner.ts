import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db, achatsPartenaires, facturesPartenaires, ventes, ventesLignes, produits, agences } from "@atelierone/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { mouvementSortieUnite, enregistrerMouvement } from "~/server/lib/stock-engine";
import { sortirStockFIFO } from "~/server/lib/lot-service";

export const partnerRouter = createTRPCRouter({

  // ──────────────────────────────────────────────
  // ACHATS PARTENAIRES (hors-catalogue)
  // ──────────────────────────────────────────────

  listAchats: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(achatsPartenaires.agenceId, ctx.user.agenceId)];

      const [items, total] = await Promise.all([
        db.select()
          .from(achatsPartenaires)
          .where(and(...conditions))
          .orderBy(desc(achatsPartenaires.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ count: sql<number>`count(*)` })
          .from(achatsPartenaires)
          .where(and(...conditions)),
      ]);

      return { items, total: Number(total[0]?.count ?? 0), page: input.page, totalPages: Math.ceil(Number(total[0]?.count ?? 0) / input.limit) };
    }),

  createAchat: protectedProcedure
    .input(z.object({
      partenaireId: z.number(),
      produitDesignation: z.string().min(1),
      prixAchatPartenaire: z.number().min(0),
      prixVenteClient: z.number().min(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const ref = `ACH-PART-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const [agence] = await db.select({ commissionAgentPourcent: agences.commissionAgentPourcent })
        .from(agences).where(eq(agences.id, agenceId)).limit(1);
      const commissionPourcent = Number(agence?.commissionAgentPourcent ?? 10);

      const margeBrute = input.prixVenteClient - input.prixAchatPartenaire;
      const commissionAgent = Math.round(margeBrute * (commissionPourcent / 100) * 100) / 100;
      const montantCaisse = input.prixVenteClient - commissionAgent;

      const refVente = `PART-VEN-${Date.now()}`;
      const [vente] = await db.insert(ventes).values({
        agenceId,
        reference: refVente,
        operateurId: ctx.user.id,
        modePaiement: "especes",
        montantTotal: String(input.prixVenteClient),
        montantPaye: String(input.prixVenteClient),
        statut: "termine",
        notes: `Achat partenaire - ${input.produitDesignation}`,
      } as any).returning();

      await db.insert(ventesLignes).values({
        venteId: vente.id,
        produitId: 0,
        quantite: 1,
        prixUnitaire: String(input.prixVenteClient),
        totalLigne: String(input.prixVenteClient),
      } as any);

      const [achat] = await db.insert(achatsPartenaires).values({
        reference: ref,
        partenaireId: input.partenaireId,
        produitDesignation: input.produitDesignation,
        prixAchatPartenaire: String(input.prixAchatPartenaire),
        prixVenteClient: String(input.prixVenteClient),
        margeBrute: String(margeBrute),
        commissionPourcent: String(commissionPourcent),
        commissionAgent: String(commissionAgent),
        montantCaisse: String(montantCaisse),
        agentId: ctx.user.id,
        venteId: vente.id,
        agenceId,
        notes: input.notes || null,
      } as any).returning();

      return { id: achat.id, reference: ref, venteId: vente.id, margeBrute, commissionAgent, montantCaisse };
    }),

  // ──────────────────────────────────────────────
  // FACTURES PARTENAIRES
  // ──────────────────────────────────────────────

  listFactures: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(facturesPartenaires.agenceId, ctx.user.agenceId)];

      const [items, total] = await Promise.all([
        db.select()
          .from(facturesPartenaires)
          .where(and(...conditions))
          .orderBy(desc(facturesPartenaires.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ count: sql<number>`count(*)` })
          .from(facturesPartenaires)
          .where(and(...conditions)),
      ]);

      return { items, total: Number(total[0]?.count ?? 0), page: input.page, totalPages: Math.ceil(Number(total[0]?.count ?? 0) / input.limit) };
    }),

  createFacture: protectedProcedure
    .input(z.object({
      partenaireId: z.number(),
      produitId: z.number(),
      quantite: z.number().min(1),
      prixFacture: z.number().min(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const ref = `FAC-PART-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const [prod] = await db.select({ prixVente: produits.prixVente, prixMinimumVente: produits.prixMinimumVente })
        .from(produits).where(eq(produits.id, input.produitId)).limit(1);
      if (!prod) throw new TRPCError({ code: "NOT_FOUND", message: "Produit non trouvé" });

      if (input.prixFacture < Number(prod.prixMinimumVente ?? prod.prixVente)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le prix facture ne peut pas être inférieur au prix minimum de vente" });
      }

      const prixCatalogue = Number(prod.prixVente);
      const ecart = input.prixFacture - prixCatalogue;

      const refVente = `PART-FAC-${Date.now()}`;

      return db.transaction(async (tx) => {
        const [vente] = await tx.insert(ventes).values({
          agenceId,
          reference: refVente,
          operateurId: Number(ctx.user.id),
          modePaiement: "especes",
          montantTotal: String(prixCatalogue * input.quantite),
          montantPaye: String(prixCatalogue * input.quantite),
          statut: "termine",
          notes: `Facture partenaire - ${ref}`,
        } as any).returning();

        const totalLigne = prixCatalogue * input.quantite;
        const [ligne] = await tx.insert(ventesLignes).values({
          venteId: vente.id,
          produitId: input.produitId,
          quantite: input.quantite,
          prixUnitaire: String(prixCatalogue),
          totalLigne: String(totalLigne),
        } as any).returning();

        // Débit du stock + rattachement du lot (FIFO), comme au POS
        await mouvementSortieUnite(tx as any, {
          produitId: input.produitId,
          agenceId,
          uniteId: "pcs",
          quantite: input.quantite,
          type: "VENTE",
          motif: ref,
          effectuePar: Number(ctx.user.id),
          audit: false,
        });

        const fifoAllocs = await sortirStockFIFO(tx as any, {
          produitId: input.produitId,
          agenceId,
          quantite: input.quantite,
          type: "VENTE",
          motif: ref,
          effectuePar: Number(ctx.user.id),
        });

        if (fifoAllocs.length) {
          await tx.update(ventesLignes).set({
            lotId: fifoAllocs[0].lotId,
            coutUnitaire: String(fifoAllocs[0].coutUnitaire ?? 0),
          } as any).where(eq(ventesLignes.id, ligne.id));
        }

        await enregistrerMouvement(tx as any, {
          produitId: input.produitId,
          agenceId,
          type: "VENTE",
          sens: "S",
          quantite: input.quantite,
          uniteId: "pcs",
          lotId: fifoAllocs[0]?.lotId,
          motif: `Vente partenaire ${ref}`,
          effectuePar: Number(ctx.user.id),
          audit: fifoAllocs.length === 0,
        });

        const [facture] = await tx.insert(facturesPartenaires).values({
          reference: ref,
          partenaireId: input.partenaireId,
          produitId: input.produitId,
          quantite: input.quantite,
          prixCatalogue: String(prixCatalogue),
          prixFacture: String(input.prixFacture),
          ecart: String(ecart),
          venteId: vente.id,
          agenceId,
          notes: input.notes || null,
        } as any).returning();

        return {
          id: facture.id,
          reference: ref,
          venteId: vente.id,
          prixCatalogue,
          prixFacture: input.prixFacture,
          ecart,
        };
      }) as any;
    }),
});
