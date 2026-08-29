import { NextResponse } from "next/server";
import { db, tenantSites, tenantLicences, tenantPaiements } from "@atelierone/db";
import { and, eq, desc } from "drizzle-orm";
import { signerLicence, etendrePeriode, type LicencePayload } from "~/server/lib/licence-service";
import { validerCleSite } from "~/server/lib/cle-sync";

/**
 * Heartbeat du garage : met à jour la dernière connexion + renvoie une licence
 * renouvelée si un paiement actif couvre la période. C'est le seul moyen pour
 * un garage de prolonger son usage → blocage garanti si impayé.
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
      .select({ id: tenantSites.id, nomGarage: tenantSites.nomGarage, statut: tenantSites.statut, cleApi: tenantSites.cleApi, cleApiAncienne: tenantSites.cleApiAncienne, cleApiChangeLe: tenantSites.cleApiChangeLe })
      .from(tenantSites)
      .where(eq(tenantSites.codeSite, codeSite))
      .limit(1);
    if (!site) return NextResponse.json({ error: "Site inconnu." }, { status: 401 });
    const validation = validerCleSite(site, cleApi);
    if (!validation.valide) return NextResponse.json({ error: "Clé invalide." }, { status: 401 });
    if (site.statut === "SUSPENDU") return NextResponse.json({ error: "Site suspendu : contactez le support." }, { status: 403 });

    await db.update(tenantSites).set({ dernierHeartbeat: new Date(), versionLogiciel: body.versionLogiciel ?? undefined } as any).where(eq(tenantSites.id, site.id));

    // Dernier paiement confirmé (le plus récent)
    const [paiement] = await db
      .select({ periodeMois: tenantPaiements.periodeMois, payeLe: tenantPaiements.payeLe })
      .from(tenantPaiements)
      .where(and(eq(tenantPaiements.siteId, site.id), eq(tenantPaiements.statut, "CONFIRME")))
      .orderBy(desc(tenantPaiements.payeLe))
      .limit(1);

    // Licence actuelle
    const [licence] = await db
      .select({ id: tenantLicences.id, dateFin: tenantLicences.dateFin, jeton: tenantLicences.jeton, mode: tenantLicences.mode })
      .from(tenantLicences)
      .where(eq(tenantLicences.siteId, site.id))
      .orderBy(desc(tenantLicences.emitLe))
      .limit(1);

    let dateFinActuelle = licence?.dateFin ?? new Date().toISOString().slice(0, 10);
    if (paiement?.periodeMois && paiement.payeLe) {
      const payloadBase: LicencePayload = {
        siteId: codeSite,
        nomGarage: site.nomGarage,
        dateDebut: dateFinActuelle,
        dateFin: dateFinActuelle,
        graceJours: 7,
        mode: "ABONNEMENT",
        emitLe: new Date().toISOString(),
      };
      // Le paiement étend la période depuis la fin actuelle (ou aujourd'hui si dépassée)
      const etendue = etendrePeriode({ ...payloadBase, dateFin: dateFinActuelle }, paiement.periodeMois);
      const jeton = signerLicence({ ...payloadBase, dateFin: etendue.dateFin }, process.env.LICENCE_SECRET ?? "");
      await db
        .insert(tenantLicences)
        .values({
          siteId: site.id,
          jeton,
          dateDebut: dateFinActuelle,
          dateFin: etendue.dateFin,
          graceJours: 7,
          statut: "ACTIVE",
          mode: "ABONNEMENT",
        } as any)
        .returning();
      dateFinActuelle = etendue.dateFin;
    } else if (licence) {
      // Pas de paiement récent : on renvoie la licence actuelle (le décompte continue)
      return NextResponse.json({ success: true, jeton: licence.jeton, dateFin: licence.dateFin, mode: licence.mode ?? "ESSAI", renouvelee: false, nouvelleCleApi: validation.nouvelleCleApi });
    }

    return NextResponse.json({ success: true, jeton: licence?.jeton ?? "", dateFin: dateFinActuelle, mode: paiement ? "ABONNEMENT" : "ESSAI", renouvelee: !!paiement, nouvelleCleApi: validation.nouvelleCleApi });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}