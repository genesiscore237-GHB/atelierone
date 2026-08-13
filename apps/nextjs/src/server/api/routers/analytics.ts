import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { sales, saleItems, products, profiles, payments, posSessions, pointsOfSale, inventoryBalances, inventoryMovements, cashRegisters } from "~/server/db/schema";
import { ventes, ventesLignes, utilisateurs, clients, produits, retours, lignesRetour } from "@atelierone/db";
import { eq, and, gte, lte, lt, sql, desc, asc } from "drizzle-orm";

export const analyticsRouter = createTRPCRouter({
  getSalesSummary: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      posId: z.string().uuid().optional(),
      userId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const profile = await db.select({ organizationId: profiles.agenceId }).from(profiles).where(eq(profiles.id, Number(ctx.user.id))).limit(1);
      if (!profile.length || !profile[0]?.organizationId) return null;

      const orgId = profile[0]!.organizationId;

      let whereConditions = [eq(sales.agenceId, orgId), eq(sales.statut, "ACTIVE")];
      if (input.startDate) whereConditions.push(gte(sales.createdAt, new Date(input.startDate)));
      if (input.endDate) whereConditions.push(lte(sales.createdAt, new Date(input.endDate)));
      if (input.posId) whereConditions.push(eq(sales.agenceId, input.posId as any));
      if (input.userId) whereConditions.push(eq(sales.operateurId, input.userId as any));

      const result = await db.select({
        totalSales: sql<number>`count(${sales.id})`,
        totalRevenue: sql<number>`sum(${sales.montantTotal})`,
        avgSale: sql<number>`avg(${sales.montantTotal})`,
      })
      .from(sales)
      .where(and(...whereConditions));

      return result[0];
    }),

  getMarginAnalysis: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const profile = await db.select({ organizationId: profiles.agenceId }).from(profiles).where(eq(profiles.id, Number(ctx.user.id))).limit(1);
      if (!profile.length || !profile[0]!.organizationId) return null;

      const orgId = profile[0]!.organizationId;

      let whereConditions = [eq(sales.agenceId, orgId), eq(sales.statut, "ACTIVE")];
      if (input.startDate) whereConditions.push(gte(sales.createdAt, new Date(input.startDate)));
      if (input.endDate) whereConditions.push(lte(sales.createdAt, new Date(input.endDate)));

      const coutLigne = sql`${saleItems.quantite} * COALESCE(${saleItems.coutUnitaire}, ${products.prixAchat} * ${saleItems.facteurConversion}, 0)`;

      const produitsRows = await db.select({
        productId: products.id,
        productTitle: products.titre,
        soldQuantity: sql<number>`sum(${saleItems.quantite})`,
        revenue: sql<number>`sum(${saleItems.totalLigne})`,
        cost: sql<number>`sum(${coutLigne})`,
        margin: sql<number>`sum(${saleItems.totalLigne} - ${coutLigne})`,
        tauxMarge: sql<number>`sum(${saleItems.totalLigne}) - sum(${coutLigne})`,
      })
      .from(saleItems)
      .leftJoin(sales, eq(saleItems.venteId, sales.id))
      .leftJoin(products, eq(saleItems.produitId, products.id))
      .where(and(...whereConditions))
      .groupBy(products.id, products.titre)
      .orderBy(sql`margin desc`);

      const [resumeRows] = await db.select({
        ca: sql<number>`COALESCE(sum(${saleItems.totalLigne}), 0)`,
        cout: sql<number>`COALESCE(sum(${coutLigne}), 0)`,
        remises: sql<number>`COALESCE(sum(${sales.remise}), 0)`,
      })
      .from(saleItems)
      .leftJoin(sales, eq(saleItems.venteId, sales.id))
      .leftJoin(products, eq(saleItems.produitId, products.id))
      .where(and(...whereConditions));

      const [retoursRow] = await db.select({
        retoursCa: sql<number>`COALESCE(sum(${lignesRetour.totalLigne}), 0)`,
        retoursCout: sql<number>`COALESCE(sum(${lignesRetour.quantite} * COALESCE(${lignesRetour.coutUnitaire}, ${products.prixAchat} * ${lignesRetour.facteurConversion}, 0)), 0)`,
      })
      .from(lignesRetour)
      .leftJoin(retours, eq(lignesRetour.retourId, retours.id))
      .leftJoin(ventes, eq(retours.venteId, ventes.id))
      .leftJoin(products, eq(lignesRetour.produitId, products.id))
      .where(and(
        eq(ventes.agenceId, orgId),
        eq(ventes.statut, "termine"),
        input.startDate ? gte(ventes.createdAt, new Date(input.startDate)) : undefined,
        input.endDate ? lte(ventes.createdAt, new Date(input.endDate)) : undefined,
      ));

      const ca = Number(resumeRows?.ca ?? 0);
      const cout = Number(resumeRows?.cout ?? 0);
      const remises = Number(resumeRows?.remises ?? 0);
      const retoursCa = Number(retoursRow?.retoursCa ?? 0);
      const retoursCout = Number(retoursRow?.retoursCout ?? 0);
      const margeBrute = ca - cout;
      const margeNet = margeBrute - remises - (retoursCa - retoursCout);

      return {
        produits: produitsRows.map((p) => ({
          ...p,
          margin: Number(p.margin),
          revenue: Number(p.revenue),
          cost: Number(p.cost),
          tauxMarge: ca > 0 ? (Number(p.margin) / Math.max(Number(p.revenue), 0)) * 100 : 0,
        })),
        resume: {
          ca,
          cout,
          remises,
          margeBrute,
          margeNet,
          tauxMarge: ca > 0 ? (margeBrute / ca) * 100 : 0,
          retoursCa,
          retoursCout,
          margeRetours: retoursCa - retoursCout,
        },
      };
    }),

  getStockTurnover: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      posId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const profile = await db.select({ organizationId: profiles.agenceId }).from(profiles).where(eq(profiles.id, Number(ctx.user.id))).limit(1);
      if (!profile.length || !profile[0]!.organizationId) return [];

      const orgId = profile[0]!.organizationId;

      let whereConditions = [eq(inventoryBalances.agenceId, orgId)];
      if (input.startDate) whereConditions.push(gte(inventoryMovements.dateMouvement, new Date(input.startDate)));
      if (input.endDate) whereConditions.push(lte(inventoryMovements.dateMouvement, new Date(input.endDate)));
      if (input.posId) whereConditions.push(eq(inventoryMovements.agenceId, input.posId as any));

      return db.select({
        productId: products.id,
        productTitle: products.titre,
        averageStock: sql<number>`avg(${inventoryBalances.quantite})`,
        totalSold: sql<number>`sum(case when ${inventoryMovements.type} = 'OUT' then ${inventoryMovements.quantite} else 0 end)`,
        turnoverRatio: sql<number>`sum(case when ${inventoryMovements.type} = 'OUT' then ${inventoryMovements.quantite} else 0 end) / nullif(avg(${inventoryBalances.quantite}), 0)`,
      })
      .from(products)
      .leftJoin(inventoryBalances, eq(products.id, inventoryBalances.produitId))
      .leftJoin(inventoryMovements, eq(products.id, inventoryMovements.produitId))
      .where(and(...whereConditions))
      .groupBy(products.id, products.titre)
      .orderBy(desc(sql`sum(case when ${inventoryMovements.type} = 'OUT' then ${inventoryMovements.quantite} else 0 end) / nullif(avg(${inventoryBalances.quantite}), 0)`));
    }),

  getTopProducts: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().default(10),
    }))
    .query(async ({ ctx, input }) => {
      const profile = await db.select({ organizationId: profiles.agenceId }).from(profiles).where(eq(profiles.id, Number(ctx.user.id))).limit(1);
      if (!profile.length || !profile[0]!.organizationId) return [];

      const orgId = profile[0]!.organizationId;

      let whereConditions = [eq(sales.agenceId, orgId), eq(sales.statut, "ACTIVE")];
      if (input.startDate) whereConditions.push(gte(sales.createdAt, new Date(input.startDate)));
      if (input.endDate) whereConditions.push(lte(sales.createdAt, new Date(input.endDate)));

      return db.select({
        productId: products.id,
        productTitle: products.titre,
        totalSold: sql<number>`sum(${saleItems.quantite})`,
        totalRevenue: sql<number>`sum(${saleItems.quantite} * ${saleItems.prixUnitaire})`,
      })
      .from(saleItems)
      .leftJoin(sales, eq(saleItems.venteId, sales.id))
      .leftJoin(products, eq(saleItems.produitId, products.id))
      .where(and(...whereConditions))
      .groupBy(products.id, products.titre)
      .orderBy(desc(sql`sum(${saleItems.quantite} * ${saleItems.prixUnitaire})`))
      .limit(input.limit);
    }),

  getSalesTrends: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      groupBy: z.enum(["day", "week", "month"]).default("day"),
    }))
    .query(async ({ ctx, input }) => {
      const profile = await db.select({ organizationId: profiles.agenceId }).from(profiles).where(eq(profiles.id, Number(ctx.user.id))).limit(1);
      if (!profile.length || !profile[0]!.organizationId) return [];

      const orgId = profile[0]!.organizationId;

      const dateFormat =
        input.groupBy === "week" ? "YYYY-WW" : input.groupBy === "month" ? "YYYY-MM" : "YYYY-MM-DD";
      const periodExpr = sql<string>`to_char(${sales.createdAt}, ${sql.raw(`'${dateFormat}'`)})`;

      let whereConditions = [eq(sales.agenceId, orgId), eq(sales.statut, "ACTIVE")];
      if (input.startDate) whereConditions.push(gte(sales.createdAt, new Date(input.startDate)));
      if (input.endDate) whereConditions.push(lte(sales.createdAt, new Date(input.endDate)));

      return db.select({
        period: periodExpr,
        totalSales: sql<number>`count(${sales.id})`,
        totalRevenue: sql<number>`sum(${sales.montantTotal})`,
      })
      .from(sales)
      .where(and(...whereConditions))
      .groupBy(periodExpr)
      .orderBy(asc(periodExpr));
    }),

  getCurrentStock: protectedProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const profile = await db.select({ organizationId: profiles.agenceId }).from(profiles).where(eq(profiles.id, Number(ctx.user.id))).limit(1);
      if (!profile.length || !profile[0]!.organizationId) return { items: [], total: 0 };

      const orgId = profile[0]!.organizationId;

      const items = await db.select({
        productId: products.id,
        productTitle: products.titre,
        currentStock: inventoryBalances.quantite,
        thresholdAlert: products.seuilAlerte,
        siteName: pointsOfSale.nom,
        valorization: sql<number>`${inventoryBalances.quantite} * ${products.prixAchat}`,
      })
      .from(inventoryBalances)
      .leftJoin(products, eq(inventoryBalances.produitId, products.id))
      .leftJoin(pointsOfSale, eq(inventoryBalances.agenceId, pointsOfSale.id))
      .where(eq(inventoryBalances.agenceId, orgId))
      .orderBy(products.titre)
      .limit(input.limit)
      .offset(input.offset);

      const total = await db.select({ count: sql<number>`count(*)` })
        .from(inventoryBalances)
        .leftJoin(products, eq(inventoryBalances.produitId, products.id))
        .where(eq(inventoryBalances.agenceId, orgId));

      return { items, total: total[0]?.count || 0 };
    }),

  getCashSessions: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const profile = await db.select({ organizationId: profiles.agenceId }).from(profiles).where(eq(profiles.id, Number(ctx.user.id))).limit(1);
      if (!profile.length || !profile[0]!.organizationId) return [];

      const orgId = profile[0]!.organizationId;

      let whereConditions = [eq(posSessions.statut, "CLOSED")];
      if (input.startDate) whereConditions.push(gte(posSessions.fermeLe, new Date(input.startDate)));
      if (input.endDate) whereConditions.push(lte(posSessions.fermeLe, new Date(input.endDate)));

      return db.select({
        sessionId: posSessions.id,
        userName: sql<string>`concat(${profiles.prenom}, ' ', ${profiles.nom})`,
        registerName: cashRegisters.libelle,
        openedAt: posSessions.ouvertLe,
        closedAt: posSessions.fermeLe,
        openingBalance: posSessions.soldeOuverture,
        closingBalance: posSessions.soldeCompteFermeture,
        theoreticalBalance: posSessions.soldeAttenduFermeture,
        variance: sql<number>`${posSessions.soldeCompteFermeture} - ${posSessions.soldeAttenduFermeture}`,
      })
      .from(posSessions)
      .leftJoin(profiles, eq(posSessions.ouvertPar, profiles.id))
      .leftJoin(cashRegisters, eq(posSessions.caisseId, cashRegisters.id))
      .leftJoin(pointsOfSale, eq(cashRegisters.agenceId, pointsOfSale.id))
      .where(and(eq(pointsOfSale.id, orgId), ...whereConditions))
      .orderBy(desc(posSessions.fermeLe));
    }),

  getRealtimeKPIs: protectedProcedure.query(async ({ ctx }) => {
    const profile = await db.select({ organizationId: profiles.agenceId }).from(profiles).where(eq(profiles.id, Number(ctx.user.id))).limit(1);
    if (!profile.length || !profile[0]!.organizationId) return null;

    const orgId = profile[0]!.organizationId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaySales = await db.select({
      count: sql<number>`count(*)`,
      revenue: sql<number>`sum(${sales.montantTotal})`,
    })
    .from(sales)
    .where(and(
      eq(sales.agenceId, orgId),
      eq(sales.statut, "ACTIVE"),
      gte(sales.createdAt, today),
      lt(sales.createdAt, tomorrow)
    ));

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    const monthSales = await db.select({
      count: sql<number>`count(*)`,
      revenue: sql<number>`sum(${sales.montantTotal})`,
    })
    .from(sales)
    .where(and(
      eq(sales.agenceId, orgId),
      eq(sales.statut, "ACTIVE"),
      gte(sales.createdAt, monthStart),
      lt(sales.createdAt, monthEnd)
    ));

    const lowStock = await db.select({
      count: sql<number>`count(*)`,
    })
    .from(inventoryBalances)
    .leftJoin(products, eq(inventoryBalances.produitId, products.id))
    .where(and(
      eq(inventoryBalances.agenceId, orgId),
      sql`${inventoryBalances.quantite} <= ${products.seuilAlerte}`
    ));

    return {
      todaySales: todaySales[0],
      monthSales: monthSales[0],
      lowStockCount: lowStock[0]?.count || 0,
    };
  }),

  getTopVendeurs: protectedProcedure
    .input(z.object({
      limit: z.number().default(10),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(ventes.agenceId, ctx.user.agenceId ?? 1), eq(ventes.statut, "termine")];
      if (input?.startDate) conditions.push(gte(ventes.createdAt, new Date(input.startDate)));
      if (input?.endDate) conditions.push(lte(ventes.createdAt, new Date(input.endDate)));

      const rows = await db.select({
        vendeurId: ventes.operateurId,
        nom: utilisateurs.nom,
        prenom: utilisateurs.prenom,
        nbVentes: sql<number>`COUNT(*)`,
        caTotal: sql<number>`COALESCE(SUM(${ventes.montantTotal}), 0)`,
        panierMoyen: sql<number>`COALESCE(AVG(${ventes.montantTotal}), 0)`,
      })
        .from(ventes)
        .leftJoin(utilisateurs, eq(ventes.operateurId, utilisateurs.id))
        .where(and(...conditions))
        .groupBy(ventes.operateurId, utilisateurs.id)
        .orderBy(desc(sql`SUM(${ventes.montantTotal})`))
        .limit(input?.limit ?? 10);

      return rows;
    }),

  getTopClients: protectedProcedure
    .input(z.object({
      limit: z.number().default(10),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(ventes.agenceId, ctx.user.agenceId ?? 1), eq(ventes.statut, "termine")];
      if (input?.startDate) conditions.push(gte(ventes.createdAt, new Date(input.startDate)));
      if (input?.endDate) conditions.push(lte(ventes.createdAt, new Date(input.endDate)));

      const rows = await db.select({
        clientId: ventes.clientId,
        nom: clients.nom,
        nbAchats: sql<number>`COUNT(*)`,
        caTotal: sql<number>`COALESCE(SUM(${ventes.montantTotal}), 0)`,
        panierMoyen: sql<number>`COALESCE(AVG(${ventes.montantTotal}), 0)`,
      })
        .from(ventes)
        .leftJoin(clients, eq(ventes.clientId, clients.id))
        .where(and(...conditions, sql`${ventes.clientId} IS NOT NULL`))
        .groupBy(ventes.clientId, clients.id)
        .orderBy(desc(sql`SUM(${ventes.montantTotal})`))
        .limit(input?.limit ?? 10);

      return rows;
    }),

  getTopArticles: protectedProcedure
    .input(z.object({
      limit: z.number().default(10),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(ventes.agenceId, ctx.user.agenceId ?? 1), eq(ventes.statut, "termine")];
      if (input?.startDate) conditions.push(gte(ventes.createdAt, new Date(input.startDate)));
      if (input?.endDate) conditions.push(lte(ventes.createdAt, new Date(input.endDate)));

      const rows = await db.select({
        produitId: ventesLignes.produitId,
        titre: produits.titre,
        quantiteVendue: sql<number>`COALESCE(SUM(${ventesLignes.quantite}), 0)`,
        caTotal: sql<number>`COALESCE(SUM(${ventesLignes.totalLigne}), 0)`,
      })
        .from(ventesLignes)
        .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
        .leftJoin(produits, eq(ventesLignes.produitId, produits.id))
        .where(and(...conditions))
        .groupBy(ventesLignes.produitId, produits.id)
        .orderBy(desc(sql`SUM(${ventesLignes.quantite})`))
        .limit(input?.limit ?? 10);

      return rows;
    }),
});
