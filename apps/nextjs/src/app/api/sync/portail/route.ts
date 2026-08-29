import { NextResponse } from "next/server";
import { db, tenantSites, tenantLicences, tenantPaiements } from "@atelierone/db";
import { and, eq, desc } from "drizzle-orm";

/**
 * Portail client : le garage interroge ses propres informations d'abonnement
 * (licences historisées + paiements) sans interface d'administration.
 * Authentifié par cleApi (la même que la sync).
 */
export async function GET(req: Request) {
  if (process.env.APP_ROLE !== "central") {
    return NextResponse.json({ error: "Route réservée au serveur central." }, { status: 404 });
  }
  try {
    const url = new URL(req.url);
    const codeSite = (url.searchParams.get("codeSite") ?? "").trim();
    const cleApi = (url.searchParams.get("cleApi") ?? "").trim();
    if (!codeSite || !cleApi) {
      return NextResponse.json({ error: "codeSite et cleApi requis." }, { status: 400 });
    }
    const [site] = await db
      .select({ id: tenantSites.id, nomGarage: tenantSites.nomGarage, statut: tenantSites.statut, versionLogiciel: tenantSites.versionLogiciel })
      .from(tenantSites)
      .where(and(eq(tenantSites.codeSite, codeSite), eq(tenantSites.cleApi, cleApi)))
      .limit(1);
    if (!site) return NextResponse.json({ error: "Site inconnu ou clé invalide." }, { status: 401 });

    const licences = await db
      .select({ id: tenantLicences.id, dateDebut: tenantLicences.dateDebut, dateFin: tenantLicences.dateFin, mode: tenantLicences.mode, statut: tenantLicences.statut, emitLe: tenantLicences.emitLe })
      .from(tenantLicences)
      .where(eq(tenantLicences.siteId, site.id))
      .orderBy(desc(tenantLicences.emitLe))
      .limit(50);

    const paiements = await db
      .select({ id: tenantPaiements.id, reference: tenantPaiements.reference, montant: tenantPaiements.montant, modePaiement: tenantPaiements.modePaiement, statut: tenantPaiements.statut, periodeMois: tenantPaiements.periodeMois, fournisseur: tenantPaiements.fournisseur, payeLe: tenantPaiements.payeLe, createdAt: tenantPaiements.createdAt })
      .from(tenantPaiements)
      .where(eq(tenantPaiements.siteId, site.id))
      .orderBy(desc(tenantPaiements.createdAt))
      .limit(50);

    return NextResponse.json({ success: true, site: { codeSite, nomGarage: site.nomGarage, statut: site.statut, versionLogiciel: site.versionLogiciel }, licences, paiements });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}