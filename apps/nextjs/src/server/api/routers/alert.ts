import { z } from "zod";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { profiles, alerts, notifications, automationRules } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { AlertService, NotificationService } from "~/server/lib/alert-service";

export const alertRouter = createTRPCRouter({
  // Alerts
  getActiveAlerts: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id;
      if (!userId) return [];
    const profile = await db.select({ organizationId: profiles.agenceId })
      .from(profiles)
      .where(eq(profiles.id, Number(userId)))
      .limit(1);

    if (!profile.length || !profile[0]?.organizationId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Organisation non trouvée" });
    }

    return await AlertService.getActiveAlerts(profile[0]!.organizationId);
  }),

  resolveAlert: adminProcedure
    .input(z.object({ alertId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Non autorisé" });
      await AlertService.resolveAlert(input.alertId, ctx.user?.id);
      return { success: true };
    }),

  checkAlerts: adminProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user?.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    const profile = await db.select({ organizationId: profiles.agenceId })
      .from(profiles)
      .where(eq(profiles.id, Number(userId)))
      .limit(1);

    if (!profile.length || !profile[0]?.organizationId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
    }

    await AlertService.checkStockAlerts(profile[0]!.organizationId);
    await AlertService.checkSalesAnomalies(profile[0]!.organizationId);

    return { success: true };
  }),

  // Notifications
  getNotifications: protectedProcedure
    .input(z.object({
      status: z.enum(["PENDING", "SENT", "FAILED"]).optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const profile = await db.select({ organizationId: profiles.agenceId })
        .from(profiles)
      .where(eq(profiles.id, Number(userId)))
      .limit(1);

      if (!profile.length || !profile[0]?.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      let whereConditions = [eq(notifications.organisationId, profile[0]!.organizationId)];
      if (input.status) {
        whereConditions.push(eq(notifications.statut, input.status));
      }

      return await db.select()
        .from(notifications)
        .where(and(...whereConditions))
        .orderBy(notifications.createdAt)
        .limit(input.limit);
    }),

  sendTestNotification: adminProcedure
    .input(z.object({
      type: z.enum(["EMAIL", "SMS", "WHATSAPP", "PUSH"]),
      recipient: z.string(),
      message: z.string(),
      subject: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const profile = await db.select({ organizationId: profiles.agenceId })
        .from(profiles)
        .where(eq(profiles.id, Number(userId)))
        .limit(1);

      if (!profile.length || !profile[0]?.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      await NotificationService.sendNotification({
        organizationId: profile[0]!.organizationId,
        type: input.type,
        recipient: input.recipient,
        subject: input.subject,
        message: input.message,
      });

      return { success: true };
    }),

  // Automation Rules
  getAutomationRules: adminProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const profile = await db.select({ organizationId: profiles.agenceId })
        .from(profiles)
        .where(eq(profiles.id, Number(userId)))
        .limit(1);

      if (!profile.length || !profile[0]?.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
    }

    return await db.select()
      .from(automationRules)
      .where(eq(automationRules.organisationId, profile[0]!.organizationId));
  }),

  createAutomationRule: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      trigger: z.enum(["STOCK_LOW", "SALE_COMPLETED", "INVENTORY_COUNT", "TIME_BASED"]),
      conditions: z.any().optional(),
      actions: z.any(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const profile = await db.select({ organizationId: profiles.agenceId })
        .from(profiles)
        .where(eq(profiles.id, Number(userId)))
        .limit(1);

      if (!profile.length || !profile[0]?.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const [rule] = await db.insert(automationRules).values({
        organisationId: profile[0]!.organizationId,
        name: input.name,
        description: input.description || null,
        trigger: input.trigger,
        conditions: input.conditions || null,
        actions: input.actions,
        isActive: true,
      } as any).returning() as any;
      return { id: rule.id };
    }),

  updateAutomationRule: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      updates: z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        trigger: z.enum(["STOCK_LOW", "SALE_COMPLETED", "INVENTORY_COUNT", "TIME_BASED"]).optional(),
        conditions: z.any().optional(),
        actions: z.any().optional(),
        isActive: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {};
      if (input.updates.name !== undefined) updateData.name = input.updates.name;
      if (input.updates.description !== undefined) updateData.description = input.updates.description;
      if (input.updates.trigger !== undefined) updateData.trigger = input.updates.trigger;
      if (input.updates.conditions !== undefined) updateData.conditions = input.updates.conditions;
      if (input.updates.actions !== undefined) updateData.actions = input.updates.actions;
      if (input.updates.isActive !== undefined) updateData.isActive = input.updates.isActive;
      updateData.updatedAt = new Date();
      const [result] = await db.update(automationRules)
        .set(updateData as any)
        .where(eq(automationRules.id, input.id))
        .returning({ id: automationRules.id }) as any;
      return { id: result?.id };
    }),
});