import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { products, inventoryBalances, sales, profiles, apiKeys } from "~/server/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

async function authenticateApiKey(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return { error: "API key required", status: 401 };
  }

  const keyRecord = await db.query.apiKeys.findFirst({
    where: (apiKeys, { eq, and }) => and(
      eq(apiKeys.clef, apiKey),
      eq(apiKeys.estActif, true)
    ),
  });

  if (!keyRecord) {
    return { error: "Invalid API key", status: 401 };
  }

  await db.update(apiKeys).set({ derniereUtilisationLe: new Date() } as any).where(eq(apiKeys.id, keyRecord.id));

  return { organizationId: keyRecord.organisationId };
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(apiKey: string): boolean {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 1000;

  const record = rateLimitMap.get(apiKey);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(apiKey, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const apiKey = request.headers.get("x-api-key")!;
  if (!checkRateLimit(apiKey)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint");

  try {
    switch (endpoint) {
      case "products":
        const productsData = await db.select({
          id: products.id,
          name: products.titre,
          defaultPrice: products.prixVente,
          status: products.statut,
        })
        .from(products)
        .where(
          eq(products.statut, "actif")
        );

        return NextResponse.json({ data: productsData });

      case "inventory":
        const inventoryData = await db.select({
          productId: inventoryBalances.produitId,
          productName: products.titre,
          onHandQty: inventoryBalances.quantite,
          availableQty: inventoryBalances.quantite,
        })
        .from(inventoryBalances)
        .leftJoin(products, eq(inventoryBalances.produitId, products.id))
        .where(eq(inventoryBalances.agenceId, Number(auth.organizationId!)));

        return NextResponse.json({ data: inventoryData });

      case "sales":
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        let whereConditions = [
          eq(sales.agenceId, Number(auth.organizationId!)),
          eq(sales.statut, "termine")
        ];

        if (startDate) whereConditions.push(gte(sales.createdAt, new Date(startDate)));
        if (endDate) whereConditions.push(lte(sales.createdAt, new Date(endDate)));

        const salesData = await db.select({
          id: sales.id,
          totalAmount: sales.montantTotal,
          createdAt: sales.createdAt,
        })
        .from(sales)
        .where(and(...whereConditions))
        .orderBy(sales.createdAt)
        .limit(100);

        return NextResponse.json({ data: salesData });

      default:
        return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
