import "dotenv/config";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { db } from "./client";
import { produits, stocks, categories, produitUnites, unitesMesure } from "./schema";

async function time(label: string, fn: () => Promise<unknown>) {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`${label}: ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`${label}: ${Date.now() - t0}ms ERROR`, (e as Error).message);
  }
}

async function main() {
  const conditions = [eq(produits.isActive, true)];
  const items = await db.select().from(produits).where(and(...conditions)).limit(20).offset(0).orderBy(desc(produits.createdAt));
  const ids = items.map((p) => p.id).filter(Boolean);
  console.log("items:", items.length);

  await time("1: items+count parallel", async () => {
    await Promise.all([
      db.select().from(produits).where(and(...conditions)).limit(20).offset(0).orderBy(desc(produits.createdAt)),
      db.select({ count: sql<number>`count(*)` }).from(produits).where(and(...conditions)),
    ]);
  });

  await time("2: stocks sum", () =>
    db.select({ produitId: stocks.produitId, stockTotal: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)` })
      .from(stocks).where(inArray(stocks.produitId, ids)).groupBy(stocks.produitId));

  await time("3: categories", () =>
    db.select({ id: categories.id, nom: categories.nom })
      .from(categories).where(inArray(categories.id, items.map((p) => p.categorieId).filter(Boolean) as string[])));

  await time("4: units", () =>
    db.select({ produitId: produitUnites.produitId })
      .from(produitUnites)
      .innerJoin(unitesMesure, eq(produitUnites.uniteId, unitesMesure.id))
      .where(and(eq(produitUnites.statut, "ACTIF"), inArray(produitUnites.produitId, ids))));

  await time("5: ALL 5 in parallel (warm)", async () => {
    await Promise.all([
      db.select().from(produits).where(and(...conditions)).limit(20).offset(0).orderBy(desc(produits.createdAt)),
      db.select({ count: sql<number>`count(*)` }).from(produits).where(and(...conditions)),
      db.select({ produitId: stocks.produitId, stockTotal: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)` })
        .from(stocks).where(inArray(stocks.produitId, ids)).groupBy(stocks.produitId),
      db.select({ id: categories.id, nom: categories.nom })
        .from(categories).where(inArray(categories.id, items.map((p) => p.categorieId).filter(Boolean) as string[])),
      db.select({ produitId: produitUnites.produitId })
        .from(produitUnites)
        .innerJoin(unitesMesure, eq(produitUnites.uniteId, unitesMesure.id))
        .where(and(eq(produitUnites.statut, "ACTIF"), inArray(produitUnites.produitId, ids))),
    ]);
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
