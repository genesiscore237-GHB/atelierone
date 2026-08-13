import { db } from "~/server/db";
import { outbox } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "~/server/lib/logger";

export interface WebhookPayload {
  event: string;
  data: any;
  organizationId: string;
  timestamp: Date;
}

export class WebhookService {
  /**
   * Send webhook for an event
   */
  static async sendWebhook(payload: WebhookPayload) {
    // Store webhook in outbox for processing
  }

  /**
   * Process webhooks from outbox
   */
  static async processWebhooks() {
    // This would be called by a background job
    const pendingWebhooks = await db.select()
      .from(outbox)
      .where(eq(outbox.typeEvenement, "WEBHOOK"))
      .limit(10);

    for (const webhook of pendingWebhooks) {
      try {
        await this.deliverWebhook(webhook.corpsJson as WebhookPayload);
        // Mark as processed (would need a processed field)
      } catch (error) {
        logger.error({ err: error }, "Webhook delivery failed");
        // Handle retry logic
      }
    }
  }

  /**
   * Deliver webhook to configured endpoints
   */
  private static async deliverWebhook(payload: WebhookPayload) {
    // Get webhook URLs for the organization
    // This would require a webhooks table to store configured URLs
    const webhookUrls: string[] = []; // Fetch from database

    for (const url of webhookUrls) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": "signature", // Would generate signature
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        logger.error({ err: error, url }, "Failed to deliver webhook to %s", url);
        throw error;
      }
    }
  }
}