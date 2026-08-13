import "dotenv/config";
import { and, eq, desc, sql, ilike, inArray, getTableColumns } from "drizzle-orm";
import { db } from "./client";
import { produits, stocks, categories, produitUnites, unitesMesure } from "./schema";

async function time(label: string, fn: () => Promise<unknown>) {
  const t0 = Date.now();
  await fn();
  console.log(`${label}: ${Date.now() - t0}ms`);
}

async function main() {
  await time("warmup", () => db.execute(sql`SELECT 1`));

  const conditions = [eq(produits.isActive, true), ilike(produits.titre, "%manu%")];

  await time("1: items+window", async () => {
    const rows = await db.select({
      ...getTableColumns(produits),
      totalCount: sql<number>`count(*) over()`,
    })
      .from(produits)
      .where(and(...conditions))
      .limit(20).offset(0).orderBy(desc(produits.createdAt));
    const items = rows.map(({ totalCount, ...p }) => p);
    console.log(`   items=${items.length} total=${rows[0]?.totalCount}`);
    return items;
  });

  const items = await db.select().from(produits).where(and(...conditions)).limit(20).offset(0).orderBy(desc(produits.createdAt));
  const productIds = items.map(p => p.id).filter(Boolean);
  console.log("ids:", productIds.length);

  await time("2: stock", () =>
    db.select({ produitId: stocks.produitId, stockTotal: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)` })
      .from(stocks).where(inArray(stocks.produitId, productIds)).groupBy(stocks.produitId));

  await time("3: categories", () =>
    db.select({ id: categories.id, nom: categories.nom })
      .from(categories).where(inArray(categories.id, items.map(p => p.categorieId).filter(Boolean) as string[])));

  await time("4: units", () =>
    db.select({ produitId: produitUnites.produitId })
      .from(produitUnites)
      .innerJoin(unitesMesure, eq(produitUnites.uniteId, unitesMesure.id))
      .where(and(eq(produitUnites.statut, "ACTIF"), inArray(produitUnites.produitId, productIds))));

  await time("5: sequential full", async () => {
    const rows = await db.select({ ...getTableColumns(produits), totalCount: sql<number>`count(*) over()` })
      .from(produits).where(and(...conditions)).limit(20).offset(0).orderBy(desc(produits.createdAt));
    const items2 = rows.map(({ totalCount, ...p }) => p);
    const ids2 = items2.map(p => p.id).filter(Boolean);
    await db.select({ produitId: stocks.produitId, stockTotal: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)` })
      .from(stocks).where(inArray(stocks.produitId, ids2)).groupBy(stocks.produitId);
    await db.select({ id: categories.id, nom: categories.nom })
      .from(categories).where(inArray(categories.id, items2.map(p => p.categorieId).filter(Boolean) as string[]));
    await db.select({ produitId: produitUnites.produitId })
      .from(produitUnites).innerJoin(unitesMesure, eq(produitUnites.uniteId, unitesMesure.id))
      .where(and(eq(produitUnites.statut, "ACTIF"), inArray(produitUnites.produitId, ids2)));
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
