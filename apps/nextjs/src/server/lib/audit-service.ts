import { db } from "~/server/db";
import { auditEvents } from "~/server/db/schema";
import type { InferInsertModel } from "drizzle-orm";
import { logger } from "~/server/lib/logger";

type AuditEventInput = Omit<InferInsertModel<typeof auditEvents>, "id" | "createdAt">;

export class AuditService {
  static async log(event: AuditEventInput): Promise<void> {
    try {
      await db.insert(auditEvents).values(event as any);
    } catch (error) {
      logger.error({ err: error }, "[AUDIT] Échec enregistrement événement");
    }
  }

  static async logCreate(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    after: unknown,
    userId?: string,
    siteId?: string,
    ipAddress?: string,
    userAgent?: string,
    reason?: string
  ): Promise<void> {
    await this.log({
      userId,
      action: "create",
      entityType: resourceType,
      entityId: resourceId,
      details: JSON.stringify({ siteId, reason, after }),
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    } as any);
  }

  static async logUpdate(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    before: unknown,
    after: unknown,
    userId?: string,
    siteId?: string,
    ipAddress?: string,
    userAgent?: string,
    reason?: string
  ): Promise<void> {
    await this.log({
      userId,
      action: "update",
      entityType: resourceType,
      entityId: resourceId,
      details: JSON.stringify({ siteId, reason, before, after }),
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    } as any);
  }

  static async logDelete(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    before: unknown,
    userId?: string,
    siteId?: string,
    ipAddress?: string,
    userAgent?: string,
    reason?: string
  ): Promise<void> {
    await this.log({
      userId,
      action: "delete",
      entityType: resourceType,
      entityId: resourceId,
      details: JSON.stringify({ siteId, reason, before }),
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    } as any);
  }

  static async logAction(
    tenantId: string,
    action: string,
    resourceType: string = "action",
    resourceId?: string,
    metadata?: unknown,
    userId?: string,
    siteId?: string,
    ipAddress?: string,
    userAgent?: string,
    reason?: string
  ): Promise<void> {
    await this.log({
      userId,
      action,
      entityType: resourceType,
      entityId: resourceId || null,
      details: JSON.stringify({ siteId, metadata, reason }),
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    } as any);
  }
}
