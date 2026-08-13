import "dotenv/config";
import { db } from "./client";
import { produits, categories, unitesMesure, produitUnites, unitesMesureProduits, stocksUnites, stocks } from "./schema";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";

const CATEGORIES_LIBRAIRIE = ["MAN-SCO", "LIT-LOI", "DIC-ENC"];

async function fixData() {
  console.log("=== FIX SEED DATA ===");

  const [pce] = await db.select().from(unitesMesure).where(eq(unitesMesure.code, "PCE")).limit(1);
  if (!pce) {
    console.error("Unité PCE introuvable. Exécute d'abord seed-education.sql");
    process.exit(1);
  }
  console.log(`Unité de base: ${pce.libelle} (${pce.id})`);

  const allCategories = await db.select().from(categories);
  const catMap = new Map(allCategories.map(c => [c.code, c]));

  const allProduits = await db.select().from(produits);
  console.log(`Total produits: ${allProduits.length}`);

  // 1. Update typeProduit based on category
  const bookCatCodes = new Set<string>();
  for (const prefix of CATEGORIES_LIBRAIRIE) {
    for (const c of allCategories) {
      if (c.code === prefix || c.code.startsWith(prefix + "-")) {
        bookCatCodes.add(c.code);
      }
    }
  }
  const bookCatIds = [...bookCatCodes].map(code => catMap.get(code)?.id).filter(Boolean) as number[];

  if (bookCatIds.length > 0) {
    const r1 = await db.update(produits)
      .set({ typeProduit: "LIBRAIRIE" })
      .where(inArray(produits.categorieId, bookCatIds)) as any;
    console.log(`typeProduit → LIBRAIRIE: ${r1?.rowCount ?? "?"} produits`);

    const nonBookIds = allProduits
      .filter(p => p.categorieId && !bookCatIds.includes(p.categorieId))
      .map(p => p.id);
    if (nonBookIds.length > 0) {
      await db.update(produits)
        .set({ typeProduit: "FOURNITURE" })
        .where(inArray(produits.id, nonBookIds));
    }
    console.log(`typeProduit → FOURNITURE: ${nonBookIds.length} produits`);
  }

  // 2. Set statutCycleVie to ACTIF for active products
  const r3 = await db.update(produits)
    .set({ statutCycleVie: "ACTIF" })
    .where(eq(produits.statut, "actif")) as any;
  console.log(`statutCycleVie → ACTIF: ${r3?.rowCount ?? "?"} produits`);

  // 3. Set uniteBaseId to PCE for all products that don't have one
  const r4 = await db.update(produits)
    .set({ uniteBaseId: pce.id })
    .where(isNull(produits.uniteBaseId)) as any;
  console.log(`uniteBaseId → PCE: ${r4?.rowCount ?? "?"} produits`);

  // 4. Fill missing prixAchat (heuristique: 70% du prixVente si prixVente > 0)
  const produitsSansPrixAchat = await db.select()
    .from(produits)
    .where(and(
      isNull(produits.prixAchat),
      sql`${produits.prixVente} > 0`,
    ));
  console.log(`Produits sans prixAchat: ${produitsSansPrixAchat.length}`);

  let countPrix = 0;
  for (const p of produitsSansPrixAchat) {
    const prixAchat = Math.round(Number(p.prixVente) * 0.7);
    await db.update(produits)
      .set({ prixAchat: String(prixAchat) } as any)
      .where(eq(produits.id, p.id));
    countPrix++;
    if (countPrix % 200 === 0) console.log(`  prixAchat: ${countPrix}/${produitsSansPrixAchat.length}`);
  }
  console.log(`prixAchat remplis: ${countPrix}`);

  // 5. Create produit_unites entries
  const existingPu = await db.select({ produitId: produitUnites.produitId }).from(produitUnites);
  const existingPuSet = new Set(existingPu.map(r => r.produitId));

  let countPu = 0;
  for (const p of allProduits) {
    if (existingPuSet.has(p.id)) continue;

    await db.insert(produitUnites).values({
      produitId: p.id,
      uniteId: pce.id,
      facteurVersParent: "1",
      facteurVersBase: "1",
      prixAchat: p.prixAchat || "0",
      prixVente: p.prixVente || "0",
      estUniteBase: true,
      estUniteAchatDefaut: true,
      estUniteVenteDefaut: true,
      statut: "ACTIF",
    });
    countPu++;
    if (countPu % 200 === 0) console.log(`  produit_unites: ${countPu}`);
  }
  console.log(`produit_unites créés: ${countPu}`);

  // 6. Create unites_mesure_produits entries (legacy table, used by stock-engine fallback)
  const existingUmp = await db.select({ produitId: unitesMesureProduits.produitId }).from(unitesMesureProduits);
  const existingUmpSet = new Set(existingUmp.map(r => r.produitId));

  let countUmp = 0;
  for (const p of allProduits) {
    if (existingUmpSet.has(p.id)) continue;

    await db.insert(unitesMesureProduits).values({
      produitId: p.id,
      uniteId: pce.id,
      facteurConversion: 1,
      prixAchat: Number(p.prixAchat || 0),
      prixVente: Number(p.prixVente || 0),
      estUniteBase: true,
      estUniteAchatDefaut: true,
      estUniteVenteDefaut: true,
    });
    countUmp++;
    if (countUmp % 200 === 0) console.log(`  unites_mesure_produits: ${countUmp}`);
  }
  console.log(`unites_mesure_produits créés: ${countUmp}`);

  // 7. Create stocks_unites entries (stock tracking per unit)
  const existingSu = await db.select({ produitId: stocksUnites.produitId, agenceId: stocksUnites.agenceId }).from(stocksUnites);
  const existingSuKey = new Set(existingSu.map(r => `${r.produitId}:${r.agenceId}`));

  const stockRows = await db.select().from(stocks);
  let countSu = 0;
  for (const s of stockRows) {
    const key = `${s.produitId}:${s.agenceId}`;
    if (existingSuKey.has(key)) continue;

    await db.insert(stocksUnites).values({
      produitId: s.produitId,
      agenceId: s.agenceId,
      uniteId: pce.id,
      quantite: s.quantite || "0",
    });
    countSu++;
    if (countSu % 200 === 0) console.log(`  stocks_unites: ${countSu}`);
  }
  console.log(`stocks_unites créés: ${countSu}`);

  console.log("=== FIX TERMINÉ ===");
  console.log(`Résumé: typeProduit ✓ | statutCycleVie ✓ | uniteBaseId ✓ | prixAchat ✓ | ${countPu} produit_unites | ${countUmp} unites_mesure_produits | ${countSu} stocks_unites`);
}

fixData()
  .catch((e) => { console.error("Fix failed:", e); process.exit(1); })
  .finally(() => process.exit(0));
