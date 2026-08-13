import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db, ventes, stocks, produits, clients, caisses, sessionsCaisse, ventesLignes, niveaux, faitsVentesQuotidiens, faitsStockQuotidiens, faitsCaisseQuotidiens } from "@atelierone/db";
import { eq, and, sql, lt, desc, type SQL } from "drizzle-orm";

export const dashboardRouter = createTRPCRouter({
  getActiveCashSessions: protectedProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;
    const sessions = await db
      .select()
      .from(sessionsCaisse)
      .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
      .where(and(eq(sessionsCaisse.statut, "ouverte"), eq(caisses.agenceId, agenceId)));
    return sessions.map(s => ({
      id: s.sessions_caisse.id,
      cashRegisterName: s.caisses?.libelle ?? "",
      openedBy: String(s.sessions_caisse.ouvertPar ?? ""),
      openingBalance: Number(s.sessions_caisse.soldeOuverture ?? 0),
      theoreticalBalance: Number(s.sessions_caisse.soldeActuel ?? 0),
      ticketCount: 0,
      status: s.sessions_caisse.statut ?? "ouverte",
    }));
  }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;

    const [todaySalesResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(${ventes.montantTotal}), 0)` })
      .from(ventes)
      .where(
        and(
          eq(ventes.agenceId, agenceId),
          eq(ventes.statut, "termine"),
          sql`DATE(${ventes.createdAt}) = CURRENT_DATE`
        )
      );

    const [todaySalesCountResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ventes)
      .where(
        and(
          eq(ventes.agenceId, agenceId),
          eq(ventes.statut, "termine"),
          sql`DATE(${ventes.createdAt}) = CURRENT_DATE`
        )
      );

    const [lowStockResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(stocks)
      .innerJoin(produits, eq(stocks.produitId, produits.id))
      .where(
        and(
          eq(stocks.agenceId, agenceId),
          sql`${stocks.quantite} < ${produits.seuilAlerte}`
        )
      );

    const [activeCashSessionsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(sessionsCaisse)
      .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
      .where(
        and(eq(sessionsCaisse.statut, "ouverte"), eq(caisses.agenceId, agenceId))
      );

    const [totalProductsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(produits);

    const [totalCustomersResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(clients)
      .where(eq(clients.agenceId, agenceId));

    return {
      todaySales: Number(todaySalesResult?.total ?? 0),
      todaySalesCount: Number(todaySalesCountResult?.count ?? 0),
      lowStockCount: Number(lowStockResult?.count ?? 0),
      activeCashSessions: Number(activeCashSessionsResult?.count ?? 0),
      totalProducts: Number(totalProductsResult?.count ?? 0),
      totalCustomers: Number(totalCustomersResult?.count ?? 0),
    };
  }),

  getCatalogDashboard: protectedProcedure
    .input(z.object({
      periode: z.string().optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const dateFilters: (SQL | undefined)[] = [];
      if (input?.dateDebut) dateFilters.push(sql`${ventes.createdAt} >= ${new Date(input.dateDebut)}`);
      if (input?.dateFin) dateFilters.push(sql`${ventes.createdAt} <= ${new Date(input.dateFin)}`);

      const baseWhere = and(eq(ventes.agenceId, agenceId), eq(ventes.statut, "termine"), ...dateFilters);

      const [caData] = await db
        .select({ total: sql<number>`COALESCE(SUM(${ventes.montantTotal}), 0)` })
        .from(ventes)
        .where(baseWhere);

      const [countData] = await db
        .select({ total: sql<number>`COALESCE(SUM(${ventesLignes.quantite}), 0)` })
        .from(ventesLignes)
        .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
        .where(and(eq(ventes.agenceId, agenceId), eq(ventes.statut, "termine"), ...dateFilters));

      const stockRows = await db
        .select({ quantite: stocks.quantite, prixVente: produits.prixVente })
        .from(stocks)
        .innerJoin(produits, eq(stocks.produitId, produits.id))
        .where(eq(stocks.agenceId, agenceId));

      const valeurStock = stockRows.reduce((s, r) => s + Number(r.quantite) * Number(r.prixVente), 0);

      const alertRows = await db
        .select({ id: stocks.id, quantite: stocks.quantite, titre: produits.titre, seuilAlerte: produits.seuilAlerte, produitId: stocks.produitId })
        .from(stocks)
        .innerJoin(produits, eq(stocks.produitId, produits.id))
        .where(and(eq(stocks.agenceId, agenceId), lt(stocks.quantite, produits.seuilAlerte)))
        .orderBy(produits.titre)
        .limit(50);

      const caParTypeRows = await db
        .select({
          typeProduit: produits.typeProduit,
          total: sql<number>`COALESCE(SUM(${ventesLignes.totalLigne}), 0)`,
        })
        .from(ventesLignes)
        .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
        .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
        .where(and(eq(ventes.agenceId, agenceId), eq(ventes.statut, "termine"), ...dateFilters))
        .groupBy(produits.typeProduit);

      const ventesParNiveauRows = await db
        .select({
          niveauId: produits.niveauId,
          libelle: niveaux.libelle,
          total: sql<number>`COALESCE(SUM(${ventesLignes.totalLigne}), 0)`,
        })
        .from(ventesLignes)
        .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
        .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
        .leftJoin(niveaux, eq(produits.niveauId, niveaux.id))
        .where(and(eq(ventes.agenceId, agenceId), eq(ventes.statut, "termine"), ...dateFilters))
        .groupBy(produits.niveauId, niveaux.libelle);

      const prevDateFilters: (SQL | undefined)[] = [];
      if (input?.dateDebut) {
        const d = new Date(input.dateDebut);
        d.setFullYear(d.getFullYear() - 1);
        prevDateFilters.push(sql`${ventes.createdAt} >= ${d}`);
      }
      if (input?.dateFin) {
        const d = new Date(input.dateFin);
        d.setFullYear(d.getFullYear() - 1);
        prevDateFilters.push(sql`${ventes.createdAt} <= ${d}`);
      }

      const [prevCaData] = await db
        .select({ total: sql<number>`COALESCE(SUM(${ventes.montantTotal}), 0)` })
        .from(ventes)
        .where(and(eq(ventes.agenceId, agenceId), eq(ventes.statut, "termine"), ...prevDateFilters));

      const prevCa = Number(prevCaData?.total ?? 0);
      const currentCa = Number(caData?.total ?? 0);
      const evolution = prevCa > 0 ? ((currentCa - prevCa) / prevCa * 100).toFixed(1) : null;

      return {
        caTotal: currentCa,
        nbProduitsVendus: Number(countData?.total ?? 0),
        valeurStock,
        nbAlertes: alertRows.length,
        alertesStock: alertRows.map(a => ({
          id: String(a.id),
          produitId: String(a.produitId),
          titre: a.titre ?? "",
          quantite: Number(a.quantite),
          seuilAlerte: Number(a.seuilAlerte ?? 5),
        })),
        caParType: caParTypeRows.map(r => ({
          type: r.typeProduit ?? "FOURNITURE",
          total: Number(r.total),
        })),
        ventesParNiveau: ventesParNiveauRows.map(r => ({
          niveauId: r.niveauId ?? "",
          libelle: r.libelle ?? "Sans niveau",
          total: Number(r.total),
        })),
        comparatif: {
          anneeCourante: currentCa,
          anneePrecedente: prevCa,
          evolution: evolution ? `${evolution}%` : null,
        },
      };
    }),

  refreshReadModels: protectedProcedure
    .mutation(async ({ ctx }) => {
      const agenceId = ctx.user.agenceId;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [salesFacts] = await db.select({
        totalVentes: sql<number>`COUNT(DISTINCT ${ventes.id})`,
        montantTotal: sql<number>`COALESCE(SUM(CAST(${ventes.montantTotal} AS numeric)), 0)`,
        montantPaye: sql<number>`COALESCE(SUM(CAST(${ventes.montantPaye} AS numeric)), 0)`,
        remiseTotal: sql<number>`COALESCE(SUM(CAST(${ventes.remise} AS numeric)), 0)`,
        nombreProduits: sql<number>`COALESCE(SUM(${ventesLignes.quantite}), 0)`,
      })
        .from(ventes)
        .leftJoin(ventesLignes, eq(ventesLignes.venteId, ventes.id))
        .where(and(
          eq(ventes.agenceId, agenceId),
          eq(ventes.statut, "termine"),
          sql`${ventes.createdAt} >= ${today}`,
          sql`${ventes.createdAt} < ${tomorrow}`,
        ));

      const salesValues = {
        agenceId,
        date: today,
        totalVentes: salesFacts?.totalVentes ?? 0,
        montantTotal: String(salesFacts?.montantTotal ?? 0),
        montantPaye: String(salesFacts?.montantPaye ?? 0),
        remiseTotal: String(salesFacts?.remiseTotal ?? 0),
        nombreProduits: salesFacts?.nombreProduits ?? 0,
      };
      await db.insert(faitsVentesQuotidiens).values(salesValues as any)
        .onConflictDoNothing();

      const [stockFacts] = await db.select({
        totalProduits: sql<number>`COUNT(DISTINCT ${stocks.produitId})`,
        valeurStock: sql<number>`COALESCE(SUM(CAST(${stocks.quantite} AS numeric) * CAST(${produits.prixVente} AS numeric)), 0)`,
        produitsRupture: sql<number>`COUNT(DISTINCT CASE WHEN ${stocks.quantite} = 0 THEN ${stocks.produitId} END)`,
        alerteStock: sql<number>`COUNT(DISTINCT CASE WHEN ${stocks.quantite} < ${produits.seuilAlerte} THEN ${stocks.produitId} END)`,
      })
        .from(stocks)
        .innerJoin(produits, eq(stocks.produitId, produits.id))
        .where(eq(stocks.agenceId, agenceId));

      const stockValues = {
        agenceId,
        date: today,
        totalProduits: stockFacts?.totalProduits ?? 0,
        valeurStock: String(stockFacts?.valeurStock ?? 0),
        produitsRupture: stockFacts?.produitsRupture ?? 0,
        alerteStock: stockFacts?.alerteStock ?? 0,
      };
      await db.insert(faitsStockQuotidiens).values(stockValues as any)
        .onConflictDoNothing();

      return { success: true };
    }),

  getReadModels: protectedProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions = [eq(faitsVentesQuotidiens.agenceId, agenceId)];

      if (input?.dateDebut) conditions.push(sql`${faitsVentesQuotidiens.date} >= ${new Date(input.dateDebut)}`);
      if (input?.dateFin) conditions.push(sql`${faitsVentesQuotidiens.date} <= ${new Date(input.dateFin)}`);

      const ventesQuotidiennes = await db.select()
        .from(faitsVentesQuotidiens)
        .where(and(...conditions))
        .orderBy(desc(faitsVentesQuotidiens.date));

      const stockData = await db.select()
        .from(faitsStockQuotidiens)
        .where(eq(faitsStockQuotidiens.agenceId, agenceId))
        .orderBy(desc(faitsStockQuotidiens.date))
        .limit(30);

      const caisseData = await db.select()
        .from(faitsCaisseQuotidiens)
        .where(eq(faitsCaisseQuotidiens.agenceId, agenceId))
        .orderBy(desc(faitsCaisseQuotidiens.date))
        .limit(30);

      return {
        ventesQuotidiennes: ventesQuotidiennes.map(v => ({
          id: v.id,
          date: v.date,
          totalVentes: v.totalVentes,
          montantTotal: v.montantTotal,
          montantPaye: v.montantPaye,
          remiseTotal: v.remiseTotal,
          nombreProduits: v.nombreProduits,
        })),
        stock: stockData.map(s => ({
          id: s.id,
          date: s.date,
          totalProduits: s.totalProduits,
          valeurStock: s.valeurStock,
          produitsRupture: s.produitsRupture,
          alerteStock: s.alerteStock,
        })),
        caisse: caisseData.map(c => ({
          id: c.id,
          date: c.date,
          totalEntrees: c.totalEntrees,
          totalSorties: c.totalSorties,
          operationsCount: c.operationsCount,
        })),
      };
    }),

  exportComparatif: protectedProcedure
    .mutation(async ({ ctx }) => {
      const agenceId = ctx.user.agenceId;
      const now = new Date();
      const anDebut = new Date(now.getFullYear(), 0, 1);
      const anFin = now;
      const prevDebut = new Date(now.getFullYear() - 1, 0, 1);
      const prevFin = new Date(now.getFullYear() - 1, 11, 31);

      const rows = await db
        .select({
          niveauId: produits.niveauId,
          libelle: niveaux.libelle,
          anN: sql<number>`COALESCE(SUM(CASE WHEN ${ventes.createdAt} >= ${anDebut} AND ${ventes.createdAt} <= ${anFin} THEN ${ventesLignes.totalLigne} ELSE 0 END), 0)`,
          anN1: sql<number>`COALESCE(SUM(CASE WHEN ${ventes.createdAt} >= ${prevDebut} AND ${ventes.createdAt} <= ${prevFin} THEN ${ventesLignes.totalLigne} ELSE 0 END), 0)`,
          stockN1: sql<number>`0`,
        })
        .from(ventesLignes)
        .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
        .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
        .leftJoin(niveaux, eq(produits.niveauId, niveaux.id))
        .where(and(eq(ventes.agenceId, agenceId), eq(ventes.statut, "termine")))
        .groupBy(produits.niveauId, niveaux.libelle);

      const header = "Niveau;Ventes N-1;Ventes N;Évolution\n";
      const csv = header + rows.map(r => {
        const n1 = Number(r.anN1);
        const n = Number(r.anN);
        const evol = n1 > 0 ? ((n - n1) / n1 * 100).toFixed(1) + "%" : "—";
        return `${r.libelle ?? "Sans niveau"};${n1};${n};${evol}\n`;
      }).join("");
      const bom = "\uFEFF";
      return { csv: bom + csv, filename: "comparatif_annuel.csv" };
    }),
});
