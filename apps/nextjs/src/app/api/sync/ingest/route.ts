import { NextResponse } from "next/server";
import { db, tenantSites, syncIngests, tenantSnapshots } from "@atelierone/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * Ingestion de la synchronisation d'un garage (delta push).
 * Authentifié par cleApi. Stocke les payloads + agrège les snapshots mensuels
 * (ventes / OR / stock) pour le dashboard parent.
 */
export async function POST(req: Request) {
  if (process.env.APP_ROLE !== "central") {
    return NextResponse.json({ error: "Route réservée au serveur central." }, { status: 404 });
  }
  try {
    const body = await req.json();
    const codeSite = (body.codeSite ?? "").trim();
    const cleApi = (body.cleApi ?? "").trim();
    if (!codeSite || !cleApi) {
      return NextResponse.json({ error: "codeSite et cleApi requis." }, { status: 400 });
    }
    const [site] = await db
      .select({ id: tenantSites.id })
      .from(tenantSites)
      .where(and(eq(tenantSites.codeSite, codeSite), eq(tenantSites.cleApi, cleApi)))
      .limit(1);
    if (!site) return NextResponse.json({ error: "Site inconnu ou clé invalide." }, { status: 401 });

    const entites = (body.entites ?? []) as { entite: string; lignes: any[] }[];
    let total = 0;
    for (const e of entites) {
      if (!Array.isArray(e.lignes) || e.lignes.length === 0) continue;
      total += e.lignes.length;
      await db.insert(syncIngests).values({
        siteId: site.id,
        entite: e.entite.slice(0, 80),
        action: "DELTA",
        payload: e.lignes as any,
        nbLignes: e.lignes.length,
      } as any);
      // Agrégats mensuels
      if (e.entite === "ventes") {
        const periode = new Date().toISOString().slice(0, 7);
        const montant = e.lignes.reduce((s: number, l: any) => s + Number(l.montant_total ?? l.montantTotal ?? l.total_ttc ?? l.totalTTC ?? 0), 0);
        await db
          .insert(tenantSnapshots)
          .values({ siteId: site.id, type: "VENTES", montant: Math.round(montant), nb: e.lignes.length, periode } as any)
          .onConflictDoNothing();
      }
      if (e.entite === "ordres_reparation") {
        const periode = new Date().toISOString().slice(0, 7);
        await db
          .insert(tenantSnapshots)
          .values({ siteId: site.id, type: "OR", montant: Math.round(e.lignes.reduce((s: number, l: any) => s + Number(l.total_ttc ?? l.totalTTC ?? 0), 0)), nb: e.lignes.length, periode } as any)
          .onConflictDoNothing();
      }
    }
    await db.update(tenantSites).set({ derniereSync: new Date() } as any).where(eq(tenantSites.id, site.id));
    return NextResponse.json({ success: true, reçu: total });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}