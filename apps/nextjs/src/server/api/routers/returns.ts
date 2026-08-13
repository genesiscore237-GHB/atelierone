import { z } from "zod";
import { createTRPCRouter, posProcedure } from "~/server/api/trpc";
import { db, retours, lignesRetour, avoirs, ventes, ventesLignes, produits as produitsTable, stocks, mouvementsStock } from "@atelierone/db";
import { eq, and, desc, ilike, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const returnsRouter = createTRPCRouter({
  getCredits: posProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const rows = await db
        .select({
          id: ventes.id,
          reference: ventes.reference,
          montantTotal: ventes.montantTotal,
          remise: ventes.remise,
          montantPaye: ventes.montantPaye,
          statut: ventes.statut,
          createdAt: ventes.createdAt,
        })
        .from(ventes)
        .where(and(
          eq(ventes.agenceId, ctx.user.agenceId),
          sql`COALESCE(${ventes.remise}::numeric, 0) > 0`
        ))
        .orderBy(desc(ventes.createdAt));
      return rows.map(r => ({
        id: String(r.id),
        creditId: String(r.id),
        remaining: Math.max(0, Number(r.remise ?? 0) - Number(r.montantPaye ?? 0)),
        amount: Number(r.remise ?? 0),
        customerName: `Vente #${r.id}`,
        status: Number(r.montantPaye ?? 0) >= Number(r.remise ?? 0) ? "AVAILABLE" : "PARTIAL",
        returnType: "CREDIT",
        createdAt: r.createdAt ?? new Date(),
        return: {
          id: String(r.id),
          saleId: String(r.id),
          saleNumber: r.reference,
          totalAmount: Number(r.montantTotal),
          status: r.statut,
          createdAt: r.createdAt ?? new Date(),
        },
      }));
    }),

  useCredit: posProcedure
    .input(z.object({
      venteId: z.string().optional(),
      creditId: z.string().optional(),
      saleId: z.string().optional(),
      montant: z.number().positive().optional(),
      amount: z.number().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const venteId = input.venteId ?? input.saleId ?? input.creditId;
      if (!venteId) throw new TRPCError({ code: "BAD_REQUEST", message: "ID vente requis." });

      return db.transaction(async (tx) => {
        const [vente] = await tx.select().from(ventes).where(eq(ventes.id, Number(venteId))).limit(1);
        if (!vente) throw new TRPCError({ code: "NOT_FOUND", message: "Vente introuvable" });
        const creditDispo = Number(vente.remise ?? 0) - Number(vente.montantPaye ?? 0);
        const montant = Number(input.montant ?? input.amount ?? 0);
        if (montant <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Montant invalide." });
        if (montant > creditDispo) throw new TRPCError({ code: "BAD_REQUEST", message: "Crédit insuffisant" });
        await tx.update(ventes).set({ montantPaye: String(Number(vente.montantPaye ?? 0) + montant) }).where(eq(ventes.id, vente.id)) as any;
        return { success: true, creditRestant: creditDispo - montant };
      }) as any;
    }),

  getReturns: posProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: ventes.id,
          reference: ventes.reference,
          montantTotal: ventes.montantTotal,
          modePaiement: ventes.modePaiement,
          statut: ventes.statut,
          notes: ventes.notes,
          createdAt: ventes.createdAt,
        })
        .from(ventes)
        .where(and(
          eq(ventes.agenceId, ctx.user.agenceId),
          eq(ventes.statut, "rembourse")
        ))
        .orderBy(desc(ventes.createdAt))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);
      return rows.map(r => ({
        id: String(r.id),
        returnId: String(r.id),
        saleId: String(r.id),
        returnType: "REFUND",
        reason: r.notes ?? "",
        items: [],
        totalAmount: Number(r.montantTotal),
        status: r.statut,
        createdAt: r.createdAt ?? new Date(),
        return: {
          id: String(r.id),
          saleId: String(r.id),
          saleNumber: r.reference,
          totalAmount: Number(r.montantTotal),
          status: r.statut,
          createdAt: r.createdAt ?? new Date(),
        },
      }));
    }),

  createReturn: posProcedure
    .input(z.object({
      venteId: z.string().optional(),
      saleId: z.string().optional(),
      motif: z.string().min(1).optional(),
      reason: z.string().optional(),
      returnType: z.enum(["REMBOURSEMENT", "AVOIR", "ECHANGE"]).optional(),
      disposition: z.string().optional(),
      items: z.array(z.object({
        venteLigneId: z.string(),
        produitId: z.string(),
        quantite: z.number().int().min(1),
        prixUnitaire: z.number().min(0),
        uniteId: z.string().optional(),
        disposition: z.enum(["STOCK", "MISE_AU_REBUT"]).optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const venteId = input.venteId ?? input.saleId;
      if (!venteId) throw new TRPCError({ code: "BAD_REQUEST", message: "ID vente requis." });

      const { ReturnService } = await import("~/server/lib/return-service");
      return ReturnService.createReturn({
        agenceId: ctx.user.agenceId,
        venteId: Number(venteId),
        operateurId: ctx.user.id,
        typeRetour: (input.returnType as any) || "REMBOURSEMENT",
        motif: input.motif || input.reason || "Retour client",
        lignes: (input.items || []).map(item => ({
          venteLigneId: Number(item.venteLigneId),
          produitId: Number(item.produitId),
          quantite: item.quantite,
          prixUnitaire: item.prixUnitaire,
          uniteId: item.uniteId,
          disposition: item.disposition || "STOCK",
        })),
      });
    }),

  searchTicket: posProcedure
    .input(z.object({
      reference: z.string().optional(),
      ticketId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const term = input.ticketId ?? input.reference ?? "";
      const rows = await db
        .select({
          id: ventes.id,
          reference: ventes.reference,
          montantTotal: ventes.montantTotal,
          modePaiement: ventes.modePaiement,
          statut: ventes.statut,
          notes: ventes.notes,
          createdAt: ventes.createdAt,
        })
        .from(ventes)
        .where(and(
          eq(ventes.agenceId, ctx.user.agenceId),
          ilike(ventes.reference, `%${term}%`)
        ))
        .orderBy(desc(ventes.createdAt))
        .limit(1);
      const found = rows[0];
      if (!found) return null;
      const items = await db.select({
        id: ventesLignes.id,
        quantite: ventesLignes.quantite,
        prixUnitaire: ventesLignes.prixUnitaire,
        produit: {
          id: produitsTable.id,
          titre: produitsTable.titre,
        },
      })
        .from(ventesLignes)
        .innerJoin(produitsTable, eq(ventesLignes.produitId, produitsTable.id))
        .where(eq(ventesLignes.venteId, found.id));
      return {
        id: String(found.id),
        ticketId: String(found.id),
        saleId: String(found.id),
        totalAmount: Number(found.montantTotal),
        status: found.statut === "termine" ? "ACTIVE" : found.statut,
        items: items.map(i => ({
          id: String(i.id),
          product: { title: i.produit?.titre ?? "" },
          quantity: i.quantite,
          unitPrice: Number(i.prixUnitaire),
        })),
        createdAt: found.createdAt ?? new Date(),
        return: {
          id: String(found.id),
          saleId: String(found.id),
          saleNumber: found.reference,
          totalAmount: Number(found.montantTotal),
          status: found.statut === "termine" ? "ACTIVE" : found.statut,
          createdAt: found.createdAt ?? new Date(),
        },
      };
    }),
});

