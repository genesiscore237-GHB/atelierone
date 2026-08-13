import { db } from "~/server/db";
import { stockTransfers, inventoryMovements, inventoryBalances, profiles, pointsOfSale } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export class TransferService {
  static async createTransfer({
    organizationId,
    fromPosId,
    toPosId,
    productId,
    quantity,
    userId,
    reason,
  }: {
    organizationId: string;
    fromPosId: string;
    toPosId: string;
    productId: string;
    quantity: number;
    userId: string;
    reason?: string;
  }) {
    if (fromPosId === toPosId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Points de vente différents requis." });
    }

    const sourceInv = await db.select().from(inventoryBalances).where(and(
      eq(inventoryBalances.produitId, Number(productId)),
      eq(inventoryBalances.agenceId, Number(fromPosId))
    )).limit(1);
    if (!sourceInv[0] || Number(sourceInv[0].quantite ?? 0) < quantity) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Stock insuffisant.` });
    }

  }

  static async shipTransfer(transferId: string, userId: string) {
    const transfer = await db.select().from(stockTransfers).where(eq(stockTransfers.id, Number(transferId))).limit(1);
    const t = transfer[0];
    if (!t || t.statut !== "PENDING") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Transfert invalide." });
    }

  }

  static async completeTransfer(transferId: string, userId: string) {
    const transfer = await db.select().from(stockTransfers).where(eq(stockTransfers.id, Number(transferId))).limit(1);
    const t = transfer[0];
    if (!t || t.statut === "COMPLETED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Transfert déjà complété." });
    }

    const fromPosId = t.depuisAgenceId;
    const toPosId = t.versAgenceId;
    const productId = t.produitId;
    const quantity = t.quantite;

    const sourceInv = await db.select().from(inventoryBalances).where(and(
      eq(inventoryBalances.produitId, Number(productId)),
      eq(inventoryBalances.agenceId, Number(fromPosId))
    )).limit(1);
    const destInv = await db.select().from(inventoryBalances).where(and(
      eq(inventoryBalances.produitId, Number(productId)),
      eq(inventoryBalances.agenceId, Number(toPosId))
    )).limit(1);

    if (!sourceInv[0] || Number(sourceInv[0].quantite ?? 0) < quantity) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Stock insuffisant pour compléter." });
    }

    const newSourceQty = Number(sourceInv[0].quantite ?? 0) - quantity;
    const newDestQty = Number(destInv[0]?.quantite ?? 0) + quantity;

  }
}
