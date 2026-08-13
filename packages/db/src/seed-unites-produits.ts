import "dotenv/config";
import { db } from "./client";
import { produits, unitesMesure, unitesMesureProduits } from "./schema";
import { eq, sql } from "drizzle-orm";

async function seedUnitesProduits() {
  console.log("=== SEED: Unites Mesure Produits ===");

  const [pce] = await db.select().from(unitesMesure).where(eq(unitesMesure.code, "PCE")).limit(1);
  if (!pce) {
    console.log("Unité PCE introuvable, exécute d'abord seed_ref_data.sql");
    process.exit(1);
  }

  const allProduits = await db.select({ id: produits.id, titre: produits.titre, uniteVente: produits.uniteVente, uniteAchat: produits.uniteAchat }).from(produits);
  console.log(`Produits existants: ${allProduits.length}`);

  const existingAssocs = await db.select({ produitId: unitesMesureProduits.produitId }).from(unitesMesureProduits);
  const existingSet = new Set(existingAssocs.map(a => a.produitId));
  console.log(`Associations existantes: ${existingSet.size}`);

  let count = 0;
  for (const p of allProduits) {
    if (existingSet.has(p.id)) continue;

    await db.insert(unitesMesureProduits).values({
      produitId: p.id,
      uniteId: pce.id,
      facteurConversion: 1,
      estUniteBase: true,
      estUniteAchatDefaut: true,
      estUniteVenteDefaut: true,
      prixAchat: 0,
      prixVente: 0,
    });
    count++;
  }

  console.log(`Associations créées: ${count}`);
  console.log("=== SEED TERMINÉ ===");
}

seedUnitesProduits()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => process.exit(0));
