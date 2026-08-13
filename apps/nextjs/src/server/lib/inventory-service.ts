import { db } from "~/server/db";
import { inventorySessions, inventoryCounts, inventoryBalances, products, profiles } from "~/server/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export class InventoryService {
  static async startInventorySession({
    posId,
    organizationId,
    userId,
  }: {
    posId: number;
    organizationId: number;
    userId: number;
  }) {
    const existing = await db.select().from(inventorySessions).where(and(eq(inventorySessions.posId, posId), eq(inventorySessions.status, "OPEN"))).limit(1);
    if (existing.length > 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Une session d'inventaire est déjà ouverte pour ce point de vente." });
    }

  }

  static async beginCounting(sessionId: string, userId: number) {
  }

  static async recordCount({
    sessionId,
    productId,
    countedQuantity,
    userId,
  }: {
    sessionId: string;
    productId: number;
    countedQuantity: number;
    userId: number;
  }) {
    const session = await db.select({ status: inventorySessions.status, posId: inventorySessions.posId }).from(inventorySessions).where(eq(inventorySessions.id, sessionId)).limit(1);
    const s = session[0];
    if (!s || s.status === "COMPLETED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Session invalide." });
    }

    const systemQtyResult = await db.select({ quantity: inventoryBalances.quantite }).from(inventoryBalances).where(and(eq(inventoryBalances.produitId, productId), eq(inventoryBalances.agenceId, s.posId))).limit(1);
    const systemQty = Number(systemQtyResult[0]?.quantity ?? 0);
    const discrepancy = countedQuantity - systemQty;

  }

  static async approveSession(sessionId: string, userId: number) {
    const session = await db.select({ status: inventorySessions.status }).from(inventorySessions).where(eq(inventorySessions.id, sessionId)).limit(1);
    const s = session[0];
    if (!s || s.status !== "REVIEW") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Session non en revue." });
    }

  }

  static async completeSession(sessionId: string, userId: number) {
    const session = await db.select({ status: inventorySessions.status }).from(inventorySessions).where(eq(inventorySessions.id, sessionId)).limit(1);
    const s = session[0];
    if (!s || s.status !== "APPROVED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Session non approuvée." });
    }

    const counts = await db.select().from(inventoryCounts).where(eq(inventoryCounts.sessionId, sessionId));
    for (const count of counts) {
      if (count.discrepancy !== 0) {
        const inv = await db.select({ agenceId: inventoryBalances.agenceId }).from(inventoryBalances).where(eq(inventoryBalances.produitId, count.productId)).limit(1);
        const i = inv[0];
        if (i) {
          const newQty = count.countedQuantity;
        }
      }
    }

  }

  static async getSessionCounts(sessionId: string) {
    return db.select({
      id: inventoryCounts.id,
      countedQuantity: inventoryCounts.countedQuantity,
      systemQuantity: inventoryCounts.systemQuantity,
      discrepancy: inventoryCounts.discrepancy,
      product: products,
    })
    .from(inventoryCounts)
    .leftJoin(products, eq(inventoryCounts.productId, products.id))
    .where(eq(inventoryCounts.sessionId, sessionId));
  }
}
