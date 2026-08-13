import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { profiles } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const loyaltyRouter = createTRPCRouter({
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const profile = await db
      .select({ agenceId: profiles.agenceId })
      .from(profiles)
      .where(eq(profiles.id, Number(ctx.user.id)))
      .limit(1);

    if (!profile.length || !profile[0]?.agenceId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Organisation non trouvée." });
    }

    return {
      totalPoints: 0,
      activeMembers: 0,
      redemptionRate: 0,
      avgPointsPerCustomer: 0,
    };
  }),

  getPrograms: protectedProcedure.query(async () => {
    return [
      {
        id: "1",
        name: "Programme VIP",
        type: "TIER_BASED",
        status: "ACTIVE",
        pointsPerXAF: 1,
        tiers: [
          { name: "Bronze", minPoints: 0, benefits: ["5% de réduction"] },
          { name: "Argent", minPoints: 5000, benefits: ["10% de réduction", "Livraison gratuite"] },
          { name: "Or", minPoints: 15000, benefits: ["15% de réduction", "Livraison gratuite", "Accès anticipé"] },
          { name: "Platine", minPoints: 30000, benefits: ["20% de réduction", "Livraison gratuite", "Accès anticipé", "Conseiller dédié"] }
        ]
      }
    ];
  }),

  getRewards: protectedProcedure.query(async () => {
    return [
      { id: "1", name: "Réduction 10%", pointsCost: 500, category: "DISCOUNT", status: "ACTIVE" },
      { id: "2", name: "Livraison gratuite", pointsCost: 1000, category: "SHIPPING", status: "ACTIVE" },
      { id: "3", name: "Produit offert", pointsCost: 2000, category: "PRODUCT", status: "ACTIVE" },
      { id: "4", name: "Accès VIP 1 mois", pointsCost: 5000, category: "SERVICE", status: "ACTIVE" }
    ];
  }),
});
