import { z } from "zod";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { pricingRules, promotions, approvals, profiles } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";
import { PricingService, type SaleItem } from "~/server/lib/pricing-service";

export const pricingRouter = createTRPCRouter({
  getPricingRules: adminProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) return [];
      const profile = await db.select({ organizationId: profiles.agenceId })
        .from(profiles)
        .where(eq(profiles.id, Number(ctx.user.id)))
        .limit(1);

    if (!profile.length || !profile[0]!.organizationId) {
      throw new Error("Organization not found");
    }

    return await db.select()
      .from(pricingRules)
      .where(eq(pricingRules.organisationId, profile[0]!.organizationId))
      .orderBy(pricingRules.priorite);
  }),

  createPricingRule: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      type: z.enum(["FIXED", "PERCENTAGE", "EXPRESSION", "BUNDLE"]),
      conditions: z.any().optional(),
      valeur: z.string().optional(),
      priority: z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new Error("Unauthorized");
      
      const profile = await db.select({ organizationId: profiles.agenceId })
        .from(profiles)
        .where(eq(profiles.id, Number(userId)))
        .limit(1);

      if (!profile.length || !profile[0]!.organizationId) {
        throw new Error("Organization not found");
      }

    }) as any,

  updatePricingRule: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      updates: z.object({
        nom: z.string().min(1).optional(),
        typeRegle: z.enum(["FIXED", "PERCENTAGE", "EXPRESSION", "BUNDLE"]).optional(),
        conditions: z.any().optional(),
        valeur: z.string().optional(),
        priorite: z.number().int().optional(),
        estActive: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.update(pricingRules)
    }) as any,

  getPromotions: adminProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id;
    if (!userId) return [];
    
    const profile = await db.select({ organizationId: profiles.agenceId })
      .from(profiles)
      .where(eq(profiles.id, Number(userId)))
      .limit(1);

    if (!profile.length || !profile[0]!.organizationId) {
      throw new Error("Organization not found");
    }

    return await db.select()
      .from(promotions)
      .where(eq(promotions.organisationId, profile[0]!.organizationId));
  }),

  createPromotion: adminProcedure
    .input(z.object({
      nom: z.string().min(1),
      typePromo: z.enum(["DISCOUNT", "BUY_X_GET_Y", "BUNDLE", "FREE_SHIPPING"]),
      conditions: z.any().optional(),
      valeur: z.string().optional(),
      dateDebut: z.date(),
      dateFin: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new Error("Unauthorized");
      
      const profile = await db.select({ organizationId: profiles.agenceId })
        .from(profiles)
        .where(eq(profiles.id, Number(userId)))
        .limit(1);

      if (!profile.length || !profile[0]!.organizationId) {
        throw new Error("Organization not found");
      }

    }) as any,

  getPendingApprovals: adminProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id;
    if (!userId) return [];
    
    const profile = await db.select({ organizationId: profiles.agenceId })
      .from(profiles)
      .where(eq(profiles.id, Number(userId)))
      .limit(1);

    if (!profile.length || !profile[0]!.organizationId) {
      throw new Error("Organization not found");
    }

    return await PricingService.getPendingApprovals(userId, profile[0]!.organizationId);
  }),

  processApproval: adminProcedure
    .input(z.object({
      approvalId: z.string().uuid(),
      approved: z.boolean(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new Error("Unauthorized");
      
      await PricingService.processApproval({
        approvalId: input.approvalId,
        approved: input.approved,
        approvedBy: userId,
        reason: input.reason,
      });

      return { success: true };
    }),

  calculatePrices: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1),
        basePrice: z.number().int().min(0),
      })),
      posId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const profile = await db.select({ organizationId: profiles.agenceId })
        .from(profiles)
        .where(eq(profiles.id, Number(ctx.user?.id)))
        .limit(1);

      if (!profile.length || !profile[0]!.organizationId) {
        throw new Error("Organization not found");
      }

      return await PricingService.calculatePrices(input.items as SaleItem[], {
        organizationId: profile[0]!.organizationId,
        posId: input.posId,
        userId: ctx.user?.id,
      });
    }),
});
