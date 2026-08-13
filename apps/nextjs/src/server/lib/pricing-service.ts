import { db } from "~/server/db";
import { pricingRules, promotions, approvals, organizations, profiles } from "~/server/db/schema";
import { eq, and, desc, gte, lte, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

interface PricingRuleConditions {
  minQuantity?: number;
  productIds?: string[];
}

interface PromotionConditions {
  minQuantity?: number;
  productIds?: string[];
  buyQuantity?: number;
  getQuantity?: number;
}

export interface PricingContext {
  organizationId: number;
  posId?: string;
  customerId?: string;
  userId: string;
}

export interface SaleItem {
  productId: string;
  quantity: number;
  basePrice: number;
}

export interface PricedItem extends SaleItem {
  finalPrice: number;
  appliedRules: Array<{ ruleId: string; discount: number; type: string }>;
}

export class PricingService {
  static async calculatePrices(items: SaleItem[], context: PricingContext): Promise<PricedItem[]> {
    const { organizationId } = context;

    const rules = await db.select()
      .from(pricingRules)
      .where(and(
        eq(pricingRules.organisationId, organizationId),
        eq(pricingRules.estActive, true),
      ))
      .orderBy(desc(pricingRules.priorite));

    const activePromotions = await db.select()
      .from(promotions)
      .where(and(
        eq(promotions.organisationId, organizationId),
        eq(promotions.estActive, true),
        gte(promotions.dateFin, new Date()),
        lte(promotions.dateDebut, new Date())
      ));

    const pricedItems: PricedItem[] = [];

    for (const item of items) {
      let finalPrice = item.basePrice;
      const appliedRules: PricedItem['appliedRules'] = [];

      for (const rule of rules) {
        const discount = this.evaluateRule(rule, item, items);
        if (discount > 0) {
          finalPrice -= discount;
          appliedRules.push({
            ruleId: rule.id,
            discount,
            type: rule.typeRegle
          });
        }
      }

      for (const promo of activePromotions) {
        const discount = this.evaluatePromotion(promo, item, items);
        if (discount > 0) {
          finalPrice -= discount;
          appliedRules.push({
            ruleId: promo.id,
            discount,
            type: promo.typePromo
          });
        }
      }

      finalPrice = Math.max(0, finalPrice);

      pricedItems.push({
        ...item,
        finalPrice,
        appliedRules
      });
    }

    return pricedItems;
  }

  private static evaluateRule(rule: typeof pricingRules.$inferSelect, item: SaleItem, allItems: SaleItem[]): number {
    const { conditions, typeRegle, valeur } = rule;

    if (!this.checkConditions(conditions as PricingRuleConditions | null, item, allItems)) {
      return 0;
    }

    switch (typeRegle) {
      case 'FIXED':
        return Number(valeur ?? "0");
      case 'PERCENTAGE':
        return (item.basePrice * Number(valeur ?? "0")) / 100;
      case 'EXPRESSION':
        return this.evaluateExpression(valeur ?? "0", item, allItems);
      case 'BUNDLE':
        return 0;
      default:
        return 0;
    }
  }

  private static evaluatePromotion(promo: typeof promotions.$inferSelect, item: SaleItem, allItems: SaleItem[]): number {
    const { conditions, valeur, typePromo } = promo;

    if (!this.checkConditions(conditions as PromotionConditions | null, item, allItems)) {
      return 0;
    }

    switch (typePromo) {
      case 'DISCOUNT':
        return (item.basePrice * Number(valeur ?? "0")) / 100;
      case 'BUY_X_GET_Y':
        return 0;
      default:
        return 0;
    }
  }

  private static checkConditions(conditions: PricingRuleConditions | PromotionConditions | null, item: SaleItem, allItems: SaleItem[]): boolean {
    if (!conditions) return true;

    if (conditions.minQuantity && item.quantity < conditions.minQuantity) {
      return false;
    }

    if (conditions.productIds && !conditions.productIds.includes(item.productId)) {
      return false;
    }

    return true;
  }

  private static evaluateExpression(expression: string, item: SaleItem, allItems: SaleItem[]): number {
    try {
      let expr = expression
        .replace(/price/g, item.basePrice.toString())
        .replace(/quantity/g, item.quantity.toString());

      return eval(expr) - item.basePrice;
    } catch {
      return 0;
    }
  }

  static async checkApprovalRequired(discountAmount: number, context: PricingContext): Promise<boolean> {
    const orgResult = await db.select().from(organizations).where(eq(organizations.id, context.organizationId)).limit(1);
    const org = orgResult[0];

    if (!org) return false;

    const threshold = 1000;
    return discountAmount > threshold;
  }

  static async requestApproval({
    saleId,
    discountAmount,
    threshold,
    reason,
    context
  }: {
    saleId?: string;
    discountAmount: number;
    threshold: number;
    reason?: string;
    context: PricingContext;
  }) {
  }

  static async processApproval({
    approvalId,
    approved,
    approvedBy,
    reason
  }: {
    approvalId: string;
    approved: boolean;
    approvedBy: string;
    reason?: string;
  }) {
    await db.update(approvals)
  }

  static async getPendingApprovals(userId: string, organizationId: number) {
    return await db.select()
      .from(approvals)
      .where(and(
        eq(approvals.organisationId, organizationId),
        eq(approvals.statut, "en_attente")
      ))
      .innerJoin(profiles, eq(approvals.demandePar, profiles.id))
      .orderBy(desc(approvals.createdAt));
  }
}
