import { z } from "zod";
import { createTRPCRouter, posProcedure } from "~/server/api/trpc";
import { db, ventes, ventesLignes, produits, stocks, caisses, sessionsCaisse, mouvementsCaisse, auditLogs, mouvementsStock, paiements, stocksUnites, ordresReparation } from "@atelierone/db";
import { eq, and, desc, sql, gte, lte, ilike, or, inArray } from "drizzle-orm";
import { clients } from "@atelierone/db";
import { TRPCError } from "@trpc/server";
import { SaleService } from "~/server/lib/sale-service";
import { CaisseService } from "~/server/lib/caisse-service";
import { entrerStockLot } from "~/server/lib/lot-service";

export const salesRouter = createTRPCRouter({
  createSale: posProcedure
    .input(z.object({
      clientId: z.string().optional(),
      customerId: z.string().optional(),
      modePaiement: z.enum(["especes", "carte", "mobile_money", "credit"]).default("especes"),
      lignes: z.array(z.object({
        produitId: z.string(),
        quantite: z.number().int().min(1),
        prixUnitaire: z.number().min(0),
        uniteId: z.string().optional(),
        facteurConversion: z.number().int().default(1),
      })).min(1).optional(),
      lines: z.array(z.object({
        productId: z.string(),
        quantity: z.number().int().min(1),
        unitPrice: z.number().min(0).optional(),
        uniteId: z.string().optional(),
        facteurConversion: z.number().int().default(1),
      })).optional(),
      remise: z.number().min(0).default(0),
      montantPaye: z.number().min(0).optional(),
      notes: z.string().optional(),
      siteId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const [session] = await db.select({ id: sessionsCaisse.id }).from(sessionsCaisse)
        .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
        .where(and(eq(sessionsCaisse.statut, "ouverte"), eq(caisses.agenceId, agenceId)))
        .limit(1);
      if (!session) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune caisse ouverte" });

      const { SaleService } = await import("~/server/lib/sale-service");
      return SaleService.createSale({
        agenceId,
        operateurId: ctx.user.id,
        operateurRole: ctx.user.role,
        clientId: (input.clientId ?? input.customerId) ? Number(input.clientId ?? input.customerId) : null,
        modePaiement: input.modePaiement || "especes",
        remise: input.remise ? String(input.remise) : "0",
        montantPaye: input.montantPaye ? String(input.montantPaye) : undefined,
        notes: input.notes || null,
        lignes: (input.lignes ?? input.lines ?? []).map(l => ({
          produitId: Number(l.produitId || l.productId),
          quantite: l.quantite || l.quantity,
          prixUnitaire: l.prixUnitaire || l.unitPrice || 0,
          uniteId: l.uniteId,
          facteurConversion: l.facteurConversion ?? 1,
        })),
      });
    }),

  list: posProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      statut: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions = [eq(ventes.agenceId, agenceId)];

      if (input?.statut) conditions.push(eq(ventes.statut, input.statut));
      if (input?.dateDebut) conditions.push(gte(ventes.createdAt, new Date(input.dateDebut)));
      if (input?.dateFin) conditions.push(lte(ventes.createdAt, new Date(input.dateFin)));
      if (input?.search) {
        const q = `%${input.search}%`;
        conditions.push(or(ilike(ventes.reference, q), ilike(clients.nom, q), ilike(clients.prenom, q)));
      }

      const rows = await db.select({
        id: ventes.id,
        reference: ventes.reference,
        montantTotal: ventes.montantTotal,
        remise: ventes.remise,
        montantPaye: ventes.montantPaye,
        modePaiement: ventes.modePaiement,
        statut: ventes.statut,
        notes: ventes.notes,
        clientId: ventes.clientId,
        clientNom: clients.nom,
        clientPrenom: clients.prenom,
        clientTelephone: clients.telephone,
        createdAt: ventes.createdAt,
      })
      .from(ventes)
      .leftJoin(clients, eq(ventes.clientId, clients.id))
      .where(and(...conditions))
      .orderBy(desc(ventes.createdAt))
      .limit(input?.limit ?? 50)
      .offset(input?.offset ?? 0);

      const ors = rows.length > 0
        ? await db.select({
            venteId: ordresReparation.venteId,
            orId: ordresReparation.id,
            orNumero: ordresReparation.numero,
          })
          .from(ordresReparation)
          .where(inArray(ordresReparation.venteId, rows.map((r) => r.id).filter((id): id is number => id != null)))
        : [];

      return rows.map(v => ({
        id: String(v.id),
        reference: v.reference,
        montantTotal: v.montantTotal,
        remise: v.remise,
        montantPaye: v.montantPaye,
        modePaiement: v.modePaiement,
        statut: v.statut,
        notes: v.notes,
        clientId: v.clientId,
        clientNom: v.clientNom ? `${v.clientPrenom ?? ""} ${v.clientNom}`.trim() : null,
        clientTelephone: v.clientTelephone ?? null,
        createdAt: v.createdAt,
        saleNumber: v.reference,
        totalAmount: Number(v.montantTotal),
        status: v.statut === "termine" ? "COMPLETED" : v.statut === "suspendue" ? "SUSPENDED" : v.statut,
        paymentMethod: v.modePaiement,
        ordres: ors.filter((o) => o.venteId != null && o.venteId === v.id).map((o) => ({ orId: o.orId, orNumero: o.orNumero })),
      }));
    }),

  getById: posProcedure
    .input(z.object({ venteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [vente] = await db.select().from(ventes).where(
        and(eq(ventes.id, input.venteId), eq(ventes.agenceId, agenceId))
      ).limit(1);
      if (!vente) throw new TRPCError({ code: "NOT_FOUND", message: "Vente non trouvée" });

      const lignes = await db.select({
        id: ventesLignes.id,
        produitId: ventesLignes.produitId,
        titre: produits.titre,
        quantite: ventesLignes.quantite,
        prixUnitaire: ventesLignes.prixUnitaire,
        totalLigne: ventesLignes.totalLigne,
      })
      .from(ventesLignes)
      .leftJoin(produits, eq(ventesLignes.produitId, produits.id))
      .where(eq(ventesLignes.venteId, input.venteId));

      const [clientRow] = vente.clientId
        ? await db.select({ nom: clients.nom, prenom: clients.prenom, telephone: clients.telephone })
            .from(clients)
            .where(eq(clients.id, vente.clientId))
            .limit(1)
        : [];

      const ors = await db.select({
        orId: ordresReparation.id,
        orNumero: ordresReparation.numero,
      })
      .from(ordresReparation)
      .where(inArray(ordresReparation.venteId, [vente.id]));

      return {
        id: String(vente.id),
        reference: vente.reference,
        agenceId: vente.agenceId,
        operateurId: vente.operateurId,
        clientId: vente.clientId ?? null,
        clientNom: clientRow ? `${clientRow.prenom ?? ""} ${clientRow.nom}`.trim() : null,
        clientTelephone: clientRow?.telephone ?? null,
        modePaiement: vente.modePaiement,
        montantTotal: vente.montantTotal,
        remise: vente.remise,
        montantPaye: vente.montantPaye,
        statut: vente.statut,
        notes: vente.notes,
        createdAt: vente.createdAt,
        saleNumber: vente.reference,
        totalAmount: Number(vente.montantTotal),
        status: vente.statut === "termine" ? "COMPLETED" : vente.statut,
        paymentMethod: vente.modePaiement,
        ordres: ors,
        lignes: lignes.map(l => ({
          id: String(l.id),
          produitId: l.produitId,
          titre: l.titre,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          totalLigne: l.totalLigne,
          productId: String(l.produitId),
          productName: l.titre ?? "Produit",
          quantity: l.quantite,
          unitPrice: Number(l.prixUnitaire),
        })),
      };
    }),

  voidSale: posProcedure
    .input(z.object({
      venteId: z.string(),
      motif: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const userId = ctx.user.id;

      const [vente] = await db.select().from(ventes).where(
        and(eq(ventes.id, input.venteId), eq(ventes.agenceId, agenceId))
      ).limit(1);
      if (!vente) throw new TRPCError({ code: "NOT_FOUND", message: "Vente non trouvée" });
      if (vente.statut !== "termine" && vente.statut !== "suspendue") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Impossible d'annuler cette vente" });
      }

      return db.transaction(async (tx) => {
        const [vente] = await tx.select().from(ventes).where(eq(ventes.id, Number(input.venteId))).limit(1);
        if (!vente) throw new TRPCError({ code: "NOT_FOUND", message: "Vente introuvable" });
        
        await tx.update(ventes).set({ statut: "annule", notes: input.motif || "Annulation" }).where(eq(ventes.id, vente.id)) as any;
        
        const lignes = await tx.select().from(ventesLignes).where(eq(ventesLignes.venteId, vente.id));
        for (const ligne of lignes) {
          if (!ligne.produitId) continue;
          if (ligne.lotId) {
            await entrerStockLot(tx as any, {
              lotId: ligne.lotId,
              produitId: ligne.produitId,
              agenceId: ctx.user.agenceId,
              quantite: Number(ligne.quantite),
            });
          }
          const [stockRow] = await tx.select().from(stocks).where(and(eq(stocks.produitId, ligne.produitId), eq(stocks.agenceId, ctx.user.agenceId))).limit(1);
          if (stockRow) {
            const stockAvant = Number(stockRow.quantite);
            const stockApres = stockAvant + Number(ligne.quantite);
            await tx.update(stocks).set({ quantite: String(stockApres) }).where(eq(stocks.id, stockRow.id)) as any;
            await tx.insert(mouvementsStock).values({
              produitId: ligne.produitId,
              agenceId: ctx.user.agenceId,
              type: "RETOUR_CLIENT", sens: "E",
              quantite: String(ligne.quantite),
              lotId: ligne.lotId ?? null,
              stockAvant: String(stockAvant),
              stockApres: String(stockApres),
              reference: vente.reference,
              referenceType: "ANNULATION",
              motif: input.motif || "Annulation vente",
              effectuePar: ctx.user.id,
            }) as any;

            if (ligne.uniteId) {
              const [su] = await tx.select().from(stocksUnites).where(
                and(eq(stocksUnites.produitId, ligne.produitId), eq(stocksUnites.agenceId, ctx.user.agenceId), eq(stocksUnites.uniteId, ligne.uniteId))
              ).limit(1);
              if (su) {
                await tx.update(stocksUnites).set({ quantite: su.quantite + Number(ligne.quantite) }).where(eq(stocksUnites.id, su.id)) as any;
              }
            }
          }
        }
        await tx.update(paiements).set({ statut: "annule" }).where(eq(paiements.venteId, vente.id)) as any;

        const montantTotal = Number(vente.montantTotal ?? 0);
        if (montantTotal > 0) {
          const caisse = await CaisseService.trouverCaisseOuverte(ctx.user.agenceId, tx as any);
          await CaisseService.enregistrerFlux({
            caisseId: caisse.caisseId,
            agenceId: ctx.user.agenceId,
            type: "annulation",
            montant: montantTotal,
            motif: input.motif || "Annulation vente",
            reference: vente.reference,
            entiteType: "VENTE",
            entiteId: vente.id,
            effectuePar: Number(ctx.user.id),
          }, tx as any);
        }

        return { success: true };
      }) as any;
    }),

  convertPrefacture: posProcedure
    .input(z.object({ venteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return SaleService.convertPrefactureToSale(Number(input.venteId), ctx.user.agenceId);
    }),

  createPrefacture: posProcedure
    .input(z.object({
      clientId: z.string().optional(),
      customerId: z.string().optional(),
      lignes: z.array(z.object({
        produitId: z.string(),
        quantite: z.number().int().min(1),
        prixUnitaire: z.number().min(0),
        uniteId: z.string().optional(),
        facteurConversion: z.number().int().default(1),
      })).min(1).optional(),
      lines: z.array(z.object({
        productId: z.string(),
        quantity: z.number().int().min(1),
        unitPrice: z.number().min(0).optional(),
        uniteId: z.string().optional(),
        facteurConversion: z.number().int().default(1),
      })).optional(),
      remise: z.number().min(0).default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { SaleService } = await import("~/server/lib/sale-service");
      return SaleService.createSale({
        agenceId: ctx.user.agenceId,
        operateurId: ctx.user.id,
        operateurRole: ctx.user.role,
        clientId: (input.clientId ?? input.customerId) ? Number(input.clientId ?? input.customerId) : null,
        modePaiement: "especes",
        remise: input.remise ? String(input.remise) : "0",
        montantPaye: "0",
        notes: input.notes || null,
        statut: "brouillon",
        lignes: (input.lignes ?? input.lines ?? []).map(l => ({
          produitId: Number(l.produitId || l.productId),
          quantite: l.quantite || l.quantity,
          prixUnitaire: l.prixUnitaire || l.unitPrice || 0,
          uniteId: l.uniteId,
          facteurConversion: l.facteurConversion ?? 1,
        })),
      });
    }),
});

