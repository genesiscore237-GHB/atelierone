import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { auditEvents, profiles } from "~/server/db/schema";
import { eq, desc, and, count, gte, lte } from "drizzle-orm";

export const auditRouter = createTRPCRouter({
  list: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(10).max(100).default(50),
      action: z.string().optional(),
      entityType: z.string().optional(),
      userId: z.string().uuid().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) return { events: [], total: 0, page: input.page, limit: input.limit };
      const profile = await db
        .select({ agenceId: profiles.agenceId })
        .from(profiles)
        .where(eq(profiles.id, Number(userId)))
        .limit(1);

      if (!profile.length) {
        return { events: [], total: 0, page: input.page, limit: input.limit };
      }

      const offset = (input.page - 1) * input.limit;

      let whereConditions: any[] = [];

      if (input.action) whereConditions.push(eq(auditEvents.action, input.action));
      if (input.entityType) whereConditions.push(eq(auditEvents.entityType, input.entityType));
      if (input.userId) whereConditions.push(eq(auditEvents.userId, Number(input.userId)));
      if (input.startDate) whereConditions.push(gte(auditEvents.createdAt, new Date(input.startDate)));
      if (input.endDate) whereConditions.push(lte(auditEvents.createdAt, new Date(input.endDate)));

      const events = await db
        .select()
        .from(auditEvents)
        .where(and(...whereConditions))
        .orderBy(desc(auditEvents.createdAt))
        .limit(input.limit)
        .offset(offset);

      const total = await db
        .select({ count: count() })
        .from(auditEvents)
        .where(and(...whereConditions));

      return {
        events,
        total: total[0]?.count ?? 0,
        page: input.page,
        limit: input.limit,
      };
    }),

  getForResource: adminProcedure
    .input(z.object({
      entityType: z.string(),
      entityId: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) return [];

      let whereConditions: any[] = [
        eq(auditEvents.entityType, input.entityType),
        eq(auditEvents.entityId, Number(input.entityId))
      ];

      return db
        .select()
        .from(auditEvents)
        .where(and(...whereConditions))
        .orderBy(desc(auditEvents.createdAt))
        .limit(100);
    }),
});
