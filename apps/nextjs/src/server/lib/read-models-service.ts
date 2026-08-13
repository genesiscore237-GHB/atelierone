import { db } from "@atelierone/db";
import { ventes, ventesLignes, produits, stocks, caisses, sessionsCaisse, mouvementsCaisse, utilisateurs, agences } from "@atelierone/db";
import { eq, and, gte, lte, sql, desc, count, sum } from "drizzle-orm";

export class ReadModelsService {
  static async getDailySalesFacts(agenceId: number, startDate: Date, endDate: Date) {
    const data = await db
      .select({
        date: sql<string>`DATE(${ventes.createdAt})`,
        totalVentes: count(),
        montantTotal: sql<string>`COALESCE(SUM(${ventes.montantTotal}), 0)`,
        montantPaye: sql<string>`COALESCE(SUM(${ventes.montantPaye}), 0)`,
        remiseTotal: sql<string>`COALESCE(SUM(${ventes.remise}), 0)`,
        nombreProduits: sql<string>`COALESCE(SUM(${ventesLignes.quantite}), 0)`,
      })
      .from(ventes)
      .leftJoin(ventesLignes, eq(ventes.id, ventesLignes.venteId))
      .where(
        and(
          eq(ventes.agenceId, agenceId),
          gte(ventes.createdAt, startDate),
          lte(ventes.createdAt, endDate),
        )
      )
      .groupBy(sql`DATE(${ventes.createdAt})`)
      .orderBy(sql`DATE(${ventes.createdAt})`);

    return data;
  }

  static async getDailyCashFacts(agenceId: number, startDate: Date, endDate: Date) {
    const data = await db
      .select({
        date: sql<string>`DATE(${mouvementsCaisse.createdAt})`,
        caisse: caisses.libelle,
        totalEntrees: sql<string>`COALESCE(SUM(CASE WHEN CAST(${mouvementsCaisse.montant} AS numeric) > 0 THEN ${mouvementsCaisse.montant} ELSE 0 END), 0)`,
        totalSorties: sql<string>`COALESCE(SUM(CASE WHEN CAST(${mouvementsCaisse.montant} AS numeric) < 0 THEN ABS(CAST(${mouvementsCaisse.montant} AS numeric)) ELSE 0 END), 0)`,
        operationsCount: count(),
      })
      .from(mouvementsCaisse)
      .leftJoin(caisses, eq(mouvementsCaisse.caisseId, caisses.id))
      .where(
        and(
          eq(caisses.agenceId, agenceId),
          gte(mouvementsCaisse.createdAt, startDate),
          lte(mouvementsCaisse.createdAt, endDate),
        )
      )
      .groupBy(sql`DATE(${mouvementsCaisse.createdAt})`, caisses.libelle)
      .orderBy(sql`DATE(${mouvementsCaisse.createdAt})`);

    return data;
  }

  static async getStockAlerts(agenceId: number) {
    const data = await db
      .select({
        produitId: stocks.produitId,
        titre: produits.titre,
        codeBarre: produits.codeBarre,
        stockActuel: stocks.quantite,
        seuilAlerte: produits.seuilAlerte,
        statut: sql<string>`
          CASE
            WHEN CAST(${stocks.quantite} AS numeric) <= 0 THEN 'rupture'
            WHEN CAST(${stocks.quantite} AS numeric) <= CAST(${produits.seuilAlerte} AS numeric) THEN 'critique'
            ELSE 'normal'
          END
        `,
      })
      .from(stocks)
      .leftJoin(produits, eq(stocks.produitId, produits.id))
      .where(eq(stocks.agenceId, agenceId))
      .orderBy(stocks.quantite);

    return data;
  }

  static async getAgencyStats(agenceId: number) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [venteStats] = await db
      .select({
        totalVentes: count(),
        montantTotal: sql<string>`COALESCE(SUM(${ventes.montantTotal}), 0)`,
      })
      .from(ventes)
      .where(and(eq(ventes.agenceId, agenceId), gte(ventes.createdAt, startOfMonth)));

    const [stockStats] = await db
      .select({
        totalProduits: count(),
        valeurStock: sql<string>`COALESCE(SUM(${stocks.quantite} * ${produits.prixVente}), 0)`,
      })
      .from(stocks)
      .leftJoin(produits, eq(stocks.produitId, produits.id))
      .where(eq(stocks.agenceId, agenceId));

    const [caisseStats] = await db
      .select({
        totalCaisse: sql<string>`COALESCE(SUM(${sessionsCaisse.soldeActuel}), 0)`,
      })
      .from(sessionsCaisse)
      .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
      .where(and(eq(sessionsCaisse.statut, "ouverte"), eq(caisses.agenceId, agenceId)));

    return {
      ventesDuMois: venteStats ?? { totalVentes: 0, montantTotal: "0" },
      stock: stockStats ?? { totalProduits: 0, valeurStock: "0" },
      tresorerie: caisseStats ?? { totalCaisse: "0" },
    };
  }

  static async refreshAllReadModels(agenceId: number, startDate?: Date, endDate?: Date) {
    const start = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ?? new Date();

    const [dailySales, dailyCash, alerts, stats] = await Promise.all([
      this.getDailySalesFacts(agenceId, start, end),
      this.getDailyCashFacts(agenceId, start, end),
      this.getStockAlerts(agenceId),
      this.getAgencyStats(agenceId),
    ]);

    return { dailySales, dailyCash, alerts, stats };
  }
}
