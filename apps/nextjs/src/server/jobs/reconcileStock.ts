import { db } from "~/server/db";
import { inventoryBalances, inventoryMovements } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "~/server/lib/logger";

export async function reconcileStock() {
  logger.info("Starting stock reconciliation job...");

  const allInventory = await db.select().from(inventoryBalances);
  const discrepancies: Array<{
    productId: string;
    posId: string;
    stored: number;
    calculated: number;
    difference: number;
  }> = [];

  for (const inv of allInventory) {
    const movements = await db.select({
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantite,
    }).from(inventoryMovements).where(and(
      eq(inventoryMovements.produitId, inv.produitId),
      eq(inventoryMovements.agenceId, inv.agenceId)
    ));

    const calculatedBalance = movements.reduce((sum, m) => {
      const qty = Number(m.quantity);
      if (m.type === 'IN' || (m.type === 'ADJUSTMENT' && qty >= 0)) {
        return sum + qty;
      } else {
        return sum - qty;
      }
    }, 0);

    const storedQty = Number(inv.quantite);

    if (calculatedBalance !== storedQty) {
      discrepancies.push({
        productId: String(inv.produitId),
        posId: String(inv.agenceId),
        stored: storedQty,
        calculated: calculatedBalance,
        difference: calculatedBalance - storedQty,
      });

      await db.insert(inventoryMovements).values({
        produitId: inv.produitId,
        agenceId: inv.agenceId,
        type: 'ADJUSTMENT',
        quantite: Math.abs(calculatedBalance - storedQty).toString(),
        stockAvant: storedQty.toString(),
        stockApres: calculatedBalance.toString(),
        commentaire: `Réconciliation automatique: correction écart de ${calculatedBalance - storedQty}`,
        effectuePar: null,
      } as any);

      await db.update(inventoryBalances).set({
        quantite: calculatedBalance.toString(),
        updatedAt: new Date(),
      } as any).where(eq(inventoryBalances.id, inv.id));
    }
  }

  logger.info({ checked: allInventory.length, discrepancies: discrepancies.length }, "Stock reconciliation completed");

  return {
    success: true,
    checked: allInventory.length,
    discrepancies: discrepancies.length,
    details: discrepancies,
  };
}