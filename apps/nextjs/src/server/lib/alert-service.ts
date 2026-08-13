import { db } from "~/server/db";
import { alerts, notifications, automationRules, inventoryBalances, products, sales, profiles } from "~/server/db/schema";
import { eq, and, lt, gte, sql } from "drizzle-orm";
import { logger } from "~/server/lib/logger";

export interface AlertData {
  organizationId: number;
  type: "STOCK_LOW" | "ANOMALY" | "SYSTEM" | "CUSTOM";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  message: string;
  data?: any;
}

export interface NotificationData {
  alertId?: string;
  organizationId: number;
  type: "EMAIL" | "SMS" | "WHATSAPP" | "PUSH";
  recipient: string;
  subject?: string;
  message: string;
}

export class AlertService {
  static async createAlert(alertData: AlertData) {
    const alert = await db.insert(alerts).values({
      organisationId: alertData.organizationId,
      type: alertData.type,
      severite: alertData.severity,
      titre: alertData.title,
      message: alertData.message,
      donnees: alertData.data || null,
    }).returning();

    await this.processAutomationRules(alertData.organizationId, alertData.type, alert[0]);

    return alert[0];
  }

  static async checkStockAlerts(organizationId: number) {
    const lowStockItems = await db.select({
      productId: products.id,
      productTitle: products.titre,
      currentStock: inventoryBalances.quantite,
      thresholdAlert: products.seuilAlerte,
    })
    .from(inventoryBalances)
    .leftJoin(products, eq(inventoryBalances.produitId, products.id))
    .where(and(
      eq(inventoryBalances.agenceId, organizationId),
      sql`${inventoryBalances.quantite} <= ${products.seuilAlerte}`
    ));

    for (const item of lowStockItems) {
      const existingAlert = await db.select()
        .from(alerts)
        .where(and(
          eq(alerts.organisationId, organizationId),
          eq(alerts.type, "STOCK_LOW"),
          eq(alerts.estResolue, false),
          sql`${alerts.donnees} ->> 'productId' = ${item.productId}`
        ))
        .limit(1);

      if (existingAlert.length === 0) {
        await this.createAlert({
          organizationId,
          type: "STOCK_LOW",
          severity: (item.currentStock ?? 0) === 0 ? "CRITICAL" : "HIGH",
          title: `Stock faible: ${item.productTitle}`,
          message: `Le stock de ${item.productTitle} est à ${item.currentStock} unités (seuil: ${item.thresholdAlert})`,
          data: {
            productId: item.productId,
            productTitle: item.productTitle,
            currentStock: item.currentStock,
            thresholdAlert: item.thresholdAlert,
          },
        });
      }
    }
  }

  static async checkSalesAnomalies(organizationId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todaySales = await db.select({
      count: sql<number>`count(*)`,
      revenue: sql<number>`sum(${sales.montantTotal})`,
    })
    .from(sales)
    .where(and(
      eq(sales.agenceId, organizationId),
      eq(sales.statut, "termine"),
      gte(sales.createdAt, today)
    ));

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weeklyAverage = await db.select({
      avgRevenue: sql<number>`avg(daily_revenue)`,
    })
    .from(sql`
      SELECT date_trunc('day', ${sales.createdAt}) as day,
             sum(${sales.montantTotal}) as daily_revenue
      FROM ${sales}
      WHERE ${eq(sales.agenceId, organizationId)}
        AND ${eq(sales.statut, "termine")}
        AND ${sales.createdAt} >= ${weekAgo}
        AND ${sales.createdAt} < ${today}
      GROUP BY date_trunc('day', ${sales.createdAt})
    ` as any);

    const todayRevenue = todaySales[0]?.revenue || 0;
    const avgRevenue = weeklyAverage[0]?.avgRevenue || 0;

    if (avgRevenue > 1000 && todayRevenue < avgRevenue * 0.5) {
      await this.createAlert({
        organizationId,
        type: "ANOMALY",
        severity: "MEDIUM",
        title: "Chute inhabituelle des ventes",
        message: `Les ventes d'aujourd'hui (${todayRevenue} FCFA) sont inférieures de plus de 50% à la moyenne hebdomadaire (${avgRevenue} FCFA)`,
        data: {
          todayRevenue,
          avgRevenue,
          date: today.toISOString(),
        },
      });
    }
  }

  static async processAutomationRules(organizationId: number, trigger: string, alert: any) {
    const rules = await db.select()
      .from(automationRules)
      .where(and(
        eq(automationRules.organisationId, organizationId),
        eq(automationRules.declencheur, trigger),
        eq(automationRules.estActive, true)
      ));

    for (const rule of rules) {
      if (this.evaluateAutomationConditions(rule.conditions, alert)) {
        await this.executeAutomationActions(rule.actions, alert);
      }
    }
  }

  private static evaluateAutomationConditions(conditions: any, alert: any): boolean {
    if (!conditions) return true;

    for (const [key, condition] of Object.entries(conditions)) {
      if (typeof condition === "object" && condition !== null) {
        const { operator, value } = condition as any;
        const alertValue = alert.data?.[key];

        switch (operator) {
          case "<":
            if (!(alertValue < value)) return false;
            break;
          case ">":
            if (!(alertValue > value)) return false;
            break;
          case "==":
            if (alertValue != value) return false;
            break;
        }
      }
    }

    return true;
  }

  private static async executeAutomationActions(actions: any, alert: any) {
    if (!actions) return;

    if (actions.notifyUsers && Array.isArray(actions.notifyUsers)) {
      for (const user of actions.notifyUsers) {
        await NotificationService.sendNotification({
          alertId: alert.id,
          organizationId: alert.organisationId,
          type: "EMAIL",
          recipient: user,
          subject: alert.titre,
          message: alert.message,
        });
      }
    }
  }

  static async resolveAlert(alertId: string, resolvedBy: number) {
    await db.update(alerts)
      .set({
        estResolue: true,
        resolueLe: new Date(),
        resoluePar: resolvedBy,
      })
      .where(eq(alerts.id, alertId));
  }

  static async getActiveAlerts(organizationId: number) {
    return await db.select()
      .from(alerts)
      .where(and(
        eq(alerts.organisationId, organizationId),
        eq(alerts.estResolue, false)
      ))
      .orderBy(sql`${alerts.createdAt} desc`);
  }
}

export class NotificationService {
  static async sendNotification(notificationData: NotificationData) {
    const notification = await db.insert(notifications).values({
      alerteId: notificationData.alertId || null,
      organisationId: notificationData.organizationId,
      type: notificationData.type,
      destinataire: notificationData.recipient,
      sujet: notificationData.subject || null,
      message: notificationData.message,
    }).returning();

    setTimeout(() => this.processNotification(notification[0]), 100);

    return notification[0];
  }

  private static async processNotification(notification: any) {
    try {
      switch (notification.type) {
        case "EMAIL":
          await this.sendEmail(notification);
          break;
        case "SMS":
          await this.sendSMS(notification);
          break;
        case "WHATSAPP":
          await this.sendWhatsApp(notification);
          break;
        case "PUSH":
          await this.sendPush(notification);
          break;
      }

      await db.update(notifications)
        .set({
          statut: "ENVOYEE",
          envoyeeLe: new Date(),
        })
        .where(eq(notifications.id, notification.id));

    } catch (error) {
      await db.update(notifications)
        .set({
          statut: "ECHEC",
          erreurMessage: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(notifications.id, notification.id));
    }
  }

  private static async sendEmail(notification: any) {
    logger.info({ destinataire: notification.destinataire, sujet: notification.sujet }, "Sending email");
  }

  private static async sendSMS(notification: any) {
    logger.info({ destinataire: notification.destinataire, message: notification.message }, "Sending SMS");
  }

  private static async sendWhatsApp(notification: any) {
    logger.info({ destinataire: notification.destinataire, message: notification.message }, "Sending WhatsApp");
  }

  private static async sendPush(notification: any) {
    logger.info({ message: notification.message }, "Sending push notification");
  }
}
