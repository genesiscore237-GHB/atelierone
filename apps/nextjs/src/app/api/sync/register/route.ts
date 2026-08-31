import { NextResponse } from "next/server";
import { db, tenantSites, tenantLicences } from "@atelierone/db";
import { eq } from "drizzle-orm";
import { signerLicence, etendrePeriode, type LicencePayload } from "~/server/lib/licence-service";
import { notifierSite, corpsMail } from "~/server/lib/mailer-saas";

/** Enregistrement d'un garage : crée le site + licence d'essai 30 jours. */
export async function POST(req: Request) {
  if (process.env.APP_ROLE !== "central") {
    return NextResponse.json({ error: "Route réservée au serveur central." }, { status: 404 });
  }
  try {
    const body = await req.json();
    const nom = (body.nomGarage ?? "").trim();
    const code = (body.codeSite ?? "").trim();
    const email = (body.email ?? "").trim();
    if (!nom || !code || !email) {
      return NextResponse.json({ error: "nomGarage, codeSite et email sont requis." }, { status: 400 });
    }

    const [existing] = await db.select({ id: tenantSites.id }).from(tenantSites).where(eq(tenantSites.codeSite, code)).limit(1);
    if (existing) {
      return NextResponse.json({ error: "Ce code de site est déjà enregistré." }, { status: 409 });
    }

    const cleApi = `${code}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const [site] = await db
      .insert(tenantSites)
      .values({
        codeSite: code,
        nomGarage: nom,
        email,
        ville: body.ville ?? null,
        telephone: body.telephone ?? null,
        statut: "ACTIF",
        cleApi,
        versionLogiciel: body.versionLogiciel ?? null,
        inscritLe: new Date(),
      } as any)
      .returning();

    // Licence d'essai : 30 jours
    const dateFin = new Date();
    dateFin.setDate(dateFin.getDate() + 30);
    const payload: LicencePayload = {
      siteId: code,
      nomGarage: nom,
      dateDebut: new Date().toISOString().slice(0, 10),
      dateFin: dateFin.toISOString().slice(0, 10),
      graceJours: 7,
      mode: "ESSAI",
      emitLe: new Date().toISOString(),
    };
    const jeton = signerLicence(payload, process.env.LICENCE_SECRET ?? "");
    await db
      .insert(tenantLicences)
      .values({
        siteId: site.id,
        jeton,
        dateDebut: payload.dateDebut,
        dateFin: payload.dateFin,
        graceJours: 7,
        statut: "ACTIVE",
        mode: "ESSAI",
      } as any)
      .returning();

    // Email de bienvenue (file boite_envoi)
    await notifierSite("SAAS_BIENVENUE_ESSAI", {
      destinataire: email,
      ...corpsMail.bienvenueEssai(nom, payload.dateFin),
      codeSite: code,
    } as any);

    return NextResponse.json({ success: true, siteId: code, cleApi, jeton, dateFin: payload.dateFin, mode: "ESSAI" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}