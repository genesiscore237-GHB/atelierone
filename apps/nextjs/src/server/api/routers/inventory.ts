// @deprecated This router is legacy. New code should use the `stock` router (stock.ts)
// which goes through stock-engine (enregistrerMouvement) and handles stocksUnites,
// coutUnitaireMoyen, boiteEnvoi, and complete mouvement chaining.
// Do NOT add new endpoints here — add them to stock.ts instead.

import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure, stockProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, stocks, produits, agences, inventaires, mouvementsCaisse as inventoryMovements, mouvementsStock, inventairesSessions, ventes, ventesLignes, produitUnites, unitesMesure, emplacements } from "@atelierone/db";
import { eq, and, desc, sql, lt, gte, like, ne, isNotNull, isNull, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { PertesService } from "~/server/lib/pertes-service";
import { enregistrerMouvement, TYPES_MOUVEMENT, SENS } from "~/server/lib/stock-engine";

export const inventoryRouter = createTRPCRouter({
  getStock: protectedProcedure
    .input(z.object({ produitId: z.string() }))
    .query(async ({ ctx, input }) => {
      const stock = await db.select()
        .from(stocks)
        .where(and(
          eq(stocks.produitId, Number(input.produitId)),
          eq(stocks.agenceId, ctx.user!.agenceId),
          isNull(stocks.emplacementId)
        ))
        .limit(1);
      if (!stock[0]) return null;
      const s = stock[0];
      return {
        id: String(s.id),
        produitId: String(s.produitId),
        agenceId: s.agenceId,
        quantite: s.quantite,
        emplacementId: s.emplacementId,
        coutUnitaireMoyen: s.coutUnitaireMoyen,
        createdAt: s.updatedAt,
        updatedAt: s.updatedAt,
        productId: String(s.produitId),
        quantity: s.quantite,
        onHandQty: s.quantite,
        siteId: String(s.agenceId),
      };
    }),

  listStock: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select({
      id: stocks.id,
      produitId: stocks.produitId,
      quantite: stocks.quantite,
      emplacementId: stocks.emplacementId,
      titre: produits.titre,
      codeBarre: produits.codeBarre,
      prixVente: produits.prixVente,
      seuilAlerte: produits.seuilAlerte,
    })
      .from(stocks)
      .innerJoin(produits, eq(stocks.produitId, produits.id))
      .where(eq(stocks.agenceId, ctx.user!.agenceId))
      .orderBy(produits.titre);
    const unitRows = await db.select({
      produitId: produitUnites.produitId,
      uniteId: produitUnites.uniteId,
      facteurVersBase: produitUnites.facteurVersBase,
      libelle: unitesMesure.libelle,
    })
      .from(produitUnites)
      .innerJoin(unitesMesure, eq(produitUnites.uniteId, unitesMesure.id))
      .where(and(
        eq(produitUnites.statut, "ACTIF"),
        inArray(produitUnites.produitId, rows.map(r => r.produitId).filter((id): id is number => id != null)),
      ));
    const unitsMap = new Map<number, any[]>();
    for (const u of unitRows) {
      if (!u.produitId) continue;
      const list = unitsMap.get(u.produitId) ?? [];
      list.push({ uniteId: u.uniteId, libelle: u.libelle, facteurVersBase: Number(u.facteurVersBase ?? 1) });
      unitsMap.set(u.produitId, list);
    }
    return rows.map(r => ({
      id: String(r.id),
      produitId: String(r.produitId),
      quantite: r.quantite,
      emplacementId: r.emplacementId,
      titre: r.titre,
      codeBarre: r.codeBarre,
      prixVente: r.prixVente,
      seuilAlerte: r.seuilAlerte,
      productId: String(r.produitId),
      quantity: r.quantite,
      onHandQty: r.quantite,
      siteId: ctx.user.agenceId,
      productName: r.titre,
      unites: unitsMap.get(r.produitId) ?? [],
    }));
  }),

  getLowStock: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select({
      id: stocks.id,
      produitId: stocks.produitId,
      quantite: stocks.quantite,
      titre: produits.titre,
      seuilAlerte: produits.seuilAlerte,
      derniereVente: sql<string>`(
        SELECT MAX(${ventes.createdAt})::text
        FROM ${ventesLignes}
        INNER JOIN ${ventes} ON ${ventes.id} = ${ventesLignes.venteId}
        WHERE ${ventesLignes.produitId} = ${stocks.produitId}
          AND ${ventes.statut} = 'termine'
      )`,
    })
      .from(stocks)
      .innerJoin(produits, eq(stocks.produitId, produits.id))
      .where(and(
        eq(stocks.agenceId, ctx.user!.agenceId),
        lt(stocks.quantite, produits.seuilAlerte)
      ))
      .orderBy(produits.titre);
    return rows.map(r => ({
      id: String(r.id),
      produitId: String(r.produitId),
      quantite: r.quantite,
      titre: r.titre,
      seuilAlerte: r.seuilAlerte,
      derniereVente: r.derniereVente ?? "",
      productId: String(r.produitId),
      quantity: r.quantite,
      onHandQty: r.quantite,
      siteId: ctx.user.agenceId,
    }));
  }),

  adjustStock: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      produitId: z.string(),
      nouvelleQuantite: z.number().min(0),
      commentaire: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // @deprecated Use stock.ajusterStock instead. This procedure bypasses
      // the stock-engine (enregistrerMouvement) and does not handle
      // stocksUnites, coutUnitaireMoyen, or boiteEnvoi.
      return db.transaction(async (tx) => {
        const existing = await tx.select().from(stocks).where(and(eq(stocks.produitId, Number(input.produitId)), eq(stocks.agenceId, ctx.user!.agenceId))).limit(1);
        const stockAvant = Number(existing[0]?.quantite ?? 0);
        const stockApres = input.nouvelleQuantite;
        const ecart = stockApres - stockAvant;
        if (existing.length) {
          await tx.update(stocks).set({ quantite: String(stockApres) }).where(eq(stocks.id, existing[0].id)) as any;
        } else {
          await tx.insert(stocks).values({ produitId: Number(input.produitId), agenceId: ctx.user!.agenceId, quantite: String(stockApres) }) as any;
        }
        await tx.insert(mouvementsStock).values({
          produitId: Number(input.produitId),
          agenceId: ctx.user!.agenceId,
          type: "AJUSTEMENT",
          sens: ecart >= 0 ? "E" : "S",
          quantite: String(Math.abs(ecart)),
          stockAvant: String(stockAvant),
          stockApres: String(stockApres),
          motif: input.commentaire || "Ajustement manuel (legacy)",
          effectuePar: ctx.user!.id,
        }) as any;
        return { stockAvant, stockApres, ecart };
      }) as any;
    }),

  getMovements: protectedProcedure
    .input(z.object({ produitId: z.string().optional(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(inventaires.agenceId, ctx.user!.agenceId)];
      if (input.produitId) conditions.push(eq(inventaires.produitId, Number(input.produitId)));

      const rows = await db.select({
        id: inventaires.id,
        produitId: inventaires.produitId,
        quantiteTheorique: inventaires.quantiteTheorique,
        quantiteReelle: inventaires.quantiteReelle,
        ecart: inventaires.ecart,
        commentaire: inventaires.commentaire,
        dateInventaire: inventaires.dateInventaire,
        titre: produits.titre,
      })
        .from(inventaires)
        .innerJoin(produits, eq(inventaires.produitId, produits.id))
        .where(and(...conditions))
        .orderBy(desc(inventaires.dateInventaire))
        .limit(input.limit);
      return rows.map(r => ({
        id: String(r.id),
        produitId: String(r.produitId),
        quantiteTheorique: r.quantiteTheorique,
        quantiteReelle: r.quantiteReelle,
        ecart: r.ecart,
        commentaire: r.commentaire,
        dateInventaire: r.dateInventaire,
        titre: r.titre,
        productId: String(r.produitId),
        productTitle: r.titre ?? "Produit",
        systemQuantity: r.quantiteTheorique,
        countedQuantity: r.quantiteReelle,
        adjustment: r.ecart,
        createdAt: r.dateInventaire ?? new Date(),
        notes: r.commentaire ?? "",
      }));
    }),

  getTransfers: protectedProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;
    const sorts = await db
      .select({
        groupeOperationId: mouvementsStock.groupeOperationId,
        produitId: mouvementsStock.produitId,
        titre: produits.titre,
        quantite: mouvementsStock.quantite,
        emplacementId: mouvementsStock.emplacementId,
        emplacementCode: emplacements.code,
        emplacementLibelle: emplacements.libelle,
        dateMouvement: mouvementsStock.dateMouvement,
      })
      .from(mouvementsStock)
      .innerJoin(produits, eq(mouvementsStock.produitId, produits.id))
      .leftJoin(emplacements, eq(mouvementsStock.emplacementId, emplacements.id))
      .where(and(
        eq(mouvementsStock.agenceId, agenceId),
        eq(mouvementsStock.type, "TRANSFERT_SORTIE"),
      ))
      .orderBy(desc(mouvementsStock.dateMouvement));

    return sorts.map(r => ({
      id: r.groupeOperationId,
      fromPosName: r.emplacementCode ? `${r.emplacementCode}${r.emplacementLibelle ? ` - ${r.emplacementLibelle}` : ""}` : "Stock réserve",
      toPosName: "Site distant",
      productTitle: r.titre ?? "Produit",
      quantity: Number(r.quantite),
      status: "COMPLETED",
      createdAt: r.dateMouvement ?? new Date(),
    }));
  }),

  setOpeningStock: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      produitId: z.string().optional(),
      productId: z.string().optional(),
      quantite: z.number().min(0),
      quantity: z.number().min(0).optional(),
      siteId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const produitId = input.produitId ?? input.productId;
      if (!produitId) throw new TRPCError({ code: "BAD_REQUEST", message: "ID produit requis." });
      const qty = input.quantity ?? input.quantite;
      const existing = await db.select().from(stocks).where(and(eq(stocks.produitId, Number(produitId)), eq(stocks.agenceId, ctx.user!.agenceId))).limit(1);
      if (existing.length) {
        await db.update(stocks).set({ quantite: String(qty) }).where(eq(stocks.id, existing[0].id)) as any;
      } else {
        await db.insert(stocks).values({ produitId: Number(produitId), agenceId: ctx.user!.agenceId, quantite: String(qty) }) as any;
      }
      return { success: true };
    }),

  startInventorySession: requirePermissionProcedure("stock.inventaire")
    .input(z.object({
      name: z.string().optional(),
      siteId: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user!.agenceId;
      const [session] = await db.insert(inventairesSessions).values({
        agenceId: agenceId,
        libelle: input.name || `Session INV-${Date.now()}`,
        statut: "en_cours",
        effectuePar: ctx.user!.id,
        notes: input.notes || null,
      }).returning() as any;
      return { id: String(session.id), name: session.libelle, status: session.statut };
    }),

  beginInventoryCount: requirePermissionProcedure("stock.inventaire")
    .input(z.object({
      sessionId: z.string().optional(),
      produitId: z.string().optional(),
      productId: z.string().optional(),
      quantiteReelle: z.number().min(0).optional(),
      countedQuantity: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const produitId = input.produitId ?? input.productId;
      if (!produitId) throw new TRPCError({ code: "BAD_REQUEST", message: "ID produit requis." });
      const qty = input.countedQuantity ?? input.quantiteReelle ?? 0;
      const existing = await db.select().from(stocks).where(and(eq(stocks.produitId, Number(produitId)), eq(stocks.agenceId, ctx.user!.agenceId))).limit(1);
      const oldQty = Number(existing[0]?.quantite ?? 0);
      const [count] = await db.insert(inventaires).values({
        produitId: Number(produitId),
        agenceId: ctx.user!.agenceId,
        quantiteTheorique: oldQty,
        quantiteReelle: qty,
        ecart: oldQty - qty,
        effectuePar: ctx.user!.id,
      }).returning() as any;
      return { id: String(count.id), systemQuantity: oldQty, countedQuantity: qty, adjustment: oldQty - qty };
    }),

  completeInventorySession: requirePermissionProcedure("stock.inventaire")
    .input(z.object({
      sessionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.sessionId) throw new TRPCError({ code: "BAD_REQUEST", message: "ID session requis." });
      const agenceId = ctx.user!.agenceId;
      return db.transaction(async (tx) => {
        const counts = await tx.select().from(inventaires).where(and(eq(inventaires.agenceId, agenceId), eq(inventaires.sessionId, Number(input.sessionId))));
        for (const count of counts) {
          if (count.ecart === 0 || !count.produitId) continue;
          const [stockRow] = await tx.select().from(stocks).where(and(eq(stocks.produitId, count.produitId), eq(stocks.agenceId, agenceId))).limit(1);
          const stockAvant = Number(stockRow?.quantite ?? 0);
          const stockApres = stockAvant + Number(count.ecart);
          if (stockRow) {
            await tx.update(stocks).set({ quantite: String(stockApres) }).where(eq(stocks.id, stockRow.id)) as any;
          }
          await tx.insert(mouvementsStock).values({
            produitId: count.produitId,
            agenceId: agenceId,
            type: count.ecart > 0 ? "AJUSTEMENT_INVENTAIRE_POSITIF" : "AJUSTEMENT_INVENTAIRE_NEGATIF",
            sens: count.ecart > 0 ? "E" : "S",
            quantite: String(Math.abs(Number(count.ecart))),
            stockAvant: String(stockAvant),
            stockApres: String(stockApres),
            reference: `INV-${input.sessionId}`,
            referenceType: "INVENTAIRE",
            motif: "Correction inventaire",
            effectuePar: ctx.user!.id,
          }) as any;

          if (Number(count.ecart) < 0) {
            const coutUnitaire = Number(stockRow?.coutUnitaireMoyen ?? 0);
            const montantPerte = Math.abs(Number(count.ecart)) * coutUnitaire;
            if (montantPerte > 0) {
              await PertesService.enregistrerPerte({
                agenceId,
                produitId: count.produitId,
                quantite: Math.abs(Number(count.ecart)),
                coutUnitaire,
                montantPerte,
                typePerte: "INVENTAIRE_NEGATIF",
                motif: `Écart d'inventaire négatif (session ${input.sessionId})`,
                reference: `INV-${input.sessionId}`,
                referenceType: "INVENTAIRE",
                effectuePar: Number(ctx.user!.id),
              }, tx as any);
            }
          }
        }
        await tx.update(inventairesSessions).set({ statut: "valide", dateFin: new Date(), validePar: ctx.user!.id }).where(eq(inventairesSessions.id, Number(input.sessionId))) as any;
        return { success: true };
      }) as any;
    }),

  getInventorySessions: protectedProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;
    const rows = await db
      .select({
        id: inventaires.id,
        commentaire: inventaires.commentaire,
        dateInventaire: inventaires.dateInventaire,
        effectuePar: inventaires.effectuePar,
      })
      .from(inventaires)
      .where(and(
        eq(inventaires.agenceId, agenceId),
        like(inventaires.commentaire, "SESSION_START::%"),
      ))
      .orderBy(desc(inventaires.dateInventaire));

    return rows.map((r) => {
      const parts = (r.commentaire ?? "").split("::");
      const sessionRef = parts[1] ?? "";
      const name = parts[2] ?? `Session #${r.id}`;
      const notes = parts[3] ?? "";
      const statusRaw = parts[4] ?? "COMPLETED";
      const status = statusRaw === "OPEN" ? "OPEN" : "COMPLETED";
      return {
        id: String(r.id),
        name,
        notes,
        sessionRef,
        posId: null,
        startedBy: String(r.effectuePar ?? ""),
        startedAt: r.dateInventaire ?? new Date(),
        completedAt: status === "COMPLETED" ? r.dateInventaire ?? new Date() : null,
        status,
      };
    });
  }),

  getInventoryCounts: protectedProcedure
    .input(z.object({
      sessionId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions = [eq(inventaires.agenceId, agenceId), isNotNull(inventaires.produitId)];

      if (input?.sessionId) {
        conditions.push(like(inventaires.commentaire, `COUNT::${input.sessionId}`));
      }

      const rows = await db
        .select({
          id: inventaires.id,
          produitId: inventaires.produitId,
          quantiteTheorique: inventaires.quantiteTheorique,
          quantiteReelle: inventaires.quantiteReelle,
          ecart: inventaires.ecart,
          commentaire: inventaires.commentaire,
          dateInventaire: inventaires.dateInventaire,
          effectuePar: inventaires.effectuePar,
          titre: produits.titre,
        })
        .from(inventaires)
        .innerJoin(produits, eq(inventaires.produitId, produits.id))
        .where(and(...conditions))
        .orderBy(desc(inventaires.dateInventaire));
      return rows.map(r => ({
        id: String(r.id),
        posId: null,
        produitId: r.produitId,
        productId: String(r.produitId),
        productTitle: r.titre ?? "Produit",
        systemQuantity: r.quantiteTheorique,
        countedQuantity: r.quantiteReelle,
        status: "COMPLETED",
        createdAt: r.dateInventaire ?? new Date(),
        notes: r.commentaire ?? "",
      }));
    }),

  shipTransfer: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      transferId: z.string().optional(),
      produitId: z.string().optional(),
      toAgenceId: z.string().optional(),
      quantite: z.number().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.transferId) return { success: true, message: "Simulated (transferId provided)" };
      const pId = input.produitId;
      const destAgence = input.toAgenceId;
      const qty = input.quantite ?? 1;
      if (!pId || !destAgence) throw new TRPCError({ code: "BAD_REQUEST", message: "Paramètres requis." });
      return db.transaction(async (tx) => {
        const [sourceStock] = await tx.select().from(stocks).where(and(eq(stocks.produitId, Number(pId)), eq(stocks.agenceId, ctx.user!.agenceId))).limit(1);
        if (!sourceStock || Number(sourceStock.quantite) < qty) throw new TRPCError({ code: "BAD_REQUEST", message: "Stock insuffisant." });
        const stockAvant = Number(sourceStock.quantite);
        const stockApres = stockAvant - qty;
        await tx.update(stocks).set({ quantite: String(stockApres) }).where(eq(stocks.id, sourceStock.id)) as any;
        await tx.insert(mouvementsStock).values({
          produitId: Number(pId), agenceId: ctx.user!.agenceId,
          type: "TRANSFERT_SORTIE", sens: "S",
          quantite: String(qty), stockAvant: String(stockAvant), stockApres: String(stockApres),
          motif: `Transfert vers agence ${destAgence}`,
          effectuePar: ctx.user!.id,
        }) as any;
        return { success: true, stockAvant, stockApres };
      }) as any;
    }),

  transferStock: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      produitId: z.string().optional(),
      fromAgenceId: z.string().optional(),
      toAgenceId: z.string().optional(),
      quantite: z.number().min(1).optional(),
      fromPosId: z.string().optional(),
      toPosId: z.string().optional(),
      productId: z.string().optional(),
      quantity: z.number().min(1).optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pId = input.produitId ?? input.productId;
      const qty = input.quantity ?? input.quantite ?? 1;
      if (!pId) throw new TRPCError({ code: "BAD_REQUEST", message: "ID produit requis." });
      return db.transaction(async (tx) => {
        const [sourceStock] = await tx.select().from(stocks).where(and(eq(stocks.produitId, Number(pId)), eq(stocks.agenceId, ctx.user!.agenceId))).limit(1);
        if (!sourceStock || Number(sourceStock.quantite) < qty) throw new TRPCError({ code: "BAD_REQUEST", message: "Stock insuffisant." });
        const stockAvant = Number(sourceStock.quantite);
        const stockApres = stockAvant - qty;
        await tx.update(stocks).set({ quantite: String(stockApres) }).where(eq(stocks.id, sourceStock.id)) as any;
        await tx.insert(mouvementsStock).values({
          produitId: Number(pId), agenceId: ctx.user!.agenceId,
          type: "TRANSFERT", sens: "S",
          quantite: String(qty), stockAvant: String(stockAvant), stockApres: String(stockApres),
          motif: input.reason || "Transfert stock",
          effectuePar: ctx.user!.id,
        }) as any;
        return { success: true };
      }) as any;
    }),

  getStockMovements: protectedProcedure
    .input(z.object({
      produitId: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions = [eq(mouvementsStock.agenceId, agenceId)];
      if (input?.produitId) conditions.push(eq(mouvementsStock.produitId, Number(input.produitId)));

      const rows = await db
        .select({
          id: mouvementsStock.id,
          produitId: mouvementsStock.produitId,
          type: mouvementsStock.type,
          quantite: mouvementsStock.quantite,
          stockAvant: mouvementsStock.stockAvant,
          stockApres: mouvementsStock.stockApres,
          reference: mouvementsStock.reference,
          referenceType: mouvementsStock.referenceType,
          commentaire: mouvementsStock.commentaire,
          dateMouvement: mouvementsStock.dateMouvement,
          titre: produits.titre,
        })
        .from(mouvementsStock)
        .leftJoin(produits, eq(mouvementsStock.produitId, produits.id))
        .where(and(...conditions))
        .orderBy(desc(mouvementsStock.dateMouvement))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);

      return rows.map(r => ({
        id: String(r.id),
        productId: String(r.produitId),
        productTitle: r.titre ?? "Produit",
        type: r.type,
        quantity: r.quantite,
        stockAvant: r.stockAvant,
        stockApres: r.stockApres,
        reference: r.reference,
        referenceType: r.referenceType,
        commentaire: r.commentaire,
        dateMouvement: r.dateMouvement,
      }));
    }),

  getCriticalStock: protectedProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;
    const rows = await db.select({
      id: stocks.id,
      produitId: stocks.produitId,
      quantite: stocks.quantite,
      titre: produits.titre,
      seuilAlerte: produits.seuilAlerte,
      seuilCritique: produits.seuilCritique,
    })
      .from(stocks)
      .innerJoin(produits, eq(stocks.produitId, produits.id))
      .where(and(
        eq(stocks.agenceId, agenceId),
        lt(stocks.quantite, produits.seuilCritique),
      ))
      .orderBy(stocks.quantite);
    return rows.map(r => ({
      id: String(r.id),
      produitId: String(r.produitId),
      quantite: r.quantite,
      titre: r.titre,
      seuilAlerte: r.seuilAlerte,
      seuilCritique: r.seuilCritique,
      level: Number(r.quantite) < (r.seuilCritique ?? 2) ? "CRITICAL" : "LOW",
    }));
  }),
});
