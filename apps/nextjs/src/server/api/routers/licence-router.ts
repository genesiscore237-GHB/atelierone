import { z } from "zod";
import { createTRPCRouter, publicProcedure, requirePermissionProcedure, invaliderLicenceCache } from "~/server/api/trpc";
import { db, licenceLocale } from "@atelierone/db";
import { eq } from "drizzle-orm";
import { verifierLicence } from "~/server/lib/licence-service";
import { logger } from "~/server/lib/logger";

/**
 * MODULE SAAS — licence locale du garage.
 * etat : décompte local (OK / AVERTISSEMENT / LECTURE_SEULE / BLOQUE).
 * renouveler : heartbeat vers le central (seul moyen d'étendre la période).
 * Ces procédures restent accessibles même en mode BLOQUE (exemption du garde).
 */

export const licenceRouter = createTRPCRouter({
  etat: publicProcedure.query(async () => {
    if (process.env.APP_ROLE === "central" || process.env.LICENCE_MODE !== "on") {
      return { actif: false as const, statut: "OFF" as const, joursRestants: 0, joursGrace: 0, dateFin: null, mode: null };
    }
    const [row] = await db.select().from(licenceLocale).limit(1);
    if (!row) {
      return { actif: false as const, statut: "SANS_LICENCE" as const, joursRestants: 0, joursGrace: 0, dateFin: null, mode: null, siteCode: process.env.SITE_CODE ?? null };
    }
    const v = verifierLicence(row.jeton, process.env.LICENCE_SECRET ?? "");
    return {
      actif: v.valide,
      statut: v.statut,
      joursRestants: v.joursRestants,
      joursGrace: v.joursGrace,
      dateFin: row.dateFin,
      mode: row.mode,
      siteCode: row.siteId,
    };
  }),

  /** Heartbeat : appelle le central, applique la licence renvoyée localement. */
  renouveler: requirePermissionProcedure("admin.parametres")
    .input(z.object({}).optional())
    .mutation(async () => {
      const centralUrl = process.env.CENTRAL_URL ?? "";
      const siteCode = process.env.SITE_CODE ?? "";
      const [local] = await db.select({ cleApi: licenceLocale.cleApi }).from(licenceLocale).limit(1);
      const cleApi = local?.cleApi ?? process.env.SITE_CLE_API ?? "";
      if (!centralUrl || !siteCode || !cleApi) {
        throw new Error("Configuration SaaS manquante (CENTRAL_URL, SITE_CODE, SITE_CLE_API).");
      }
      const res = await fetch(`${centralUrl}/api/sync/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeSite: siteCode, cleApi, versionLogiciel: process.env.npm_package_version ?? "simulation" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Heartbeat refusé");
      if (data.jeton) {
        const v = verifierLicence(data.jeton, process.env.LICENCE_SECRET ?? "");
        if (!v.valide) throw new Error("Licence reçue invalide.");
        const [existing] = await db.select({ id: licenceLocale.id }).from(licenceLocale).limit(1);
        if (existing) {
          await db.update(licenceLocale).set({ jeton: data.jeton, dateFin: new Date(data.dateFin), mode: data.mode, cleApi, dernierHeartbeat: new Date(), derniereVerification: new Date(), miseAJourLe: new Date() } as any).where(eq(licenceLocale.id, existing.id));
        } else {
          await db.insert(licenceLocale).values({ siteId: siteCode, cleApi, jeton: data.jeton, dateFin: new Date(data.dateFin), graceJours: 7, mode: data.mode, dernierHeartbeat: new Date() } as any);
        }
        logger.info({ siteCode, dateFin: data.dateFin, renouvelee: data.renouvelee }, "Licence renouvelée");
        invaliderLicenceCache();
        return { success: true, dateFin: data.dateFin, renouvelee: data.renouvelee ?? false };
      }
      return { success: true, renouvelee: false };
    }),

  /** Enregistrement initial : crée le compte chez le central + applique l'essai. */
  enregistrer: requirePermissionProcedure("admin.parametres")
    .input(z.object({ codeSite: z.string().min(3).max(50), nomGarage: z.string().min(2).max(255), email: z.string().email(), ville: z.string().optional(), telephone: z.string().optional() }))
    .mutation(async ({ input }) => {
      const centralUrl = process.env.CENTRAL_URL ?? "";
      if (!centralUrl) throw new Error("CENTRAL_URL non configuré.");
      const res = await fetch(`${centralUrl}/api/sync/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeSite: input.codeSite, nomGarage: input.nomGarage, email: input.email, ville: input.ville, telephone: input.telephone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Enregistrement refusé");
      if (!data.jeton) throw new Error("Aucune licence reçue.");
      const v = verifierLicence(data.jeton, process.env.LICENCE_SECRET ?? "");
      if (!v.valide) throw new Error("Licence reçue invalide.");
      const [existing] = await db.select({ id: licenceLocale.id }).from(licenceLocale).limit(1);
      if (existing) {
        await db.update(licenceLocale).set({ siteId: input.codeSite, cleApi: data.cleApi, jeton: data.jeton, dateFin: new Date(data.dateFin), mode: data.mode, dernierHeartbeat: new Date(), miseAJourLe: new Date() } as any).where(eq(licenceLocale.id, existing.id));
      } else {
        await db.insert(licenceLocale).values({ siteId: input.codeSite, cleApi: data.cleApi, jeton: data.jeton, dateFin: new Date(data.dateFin), graceJours: 7, mode: data.mode, dernierHeartbeat: new Date() } as any);
      }
      invaliderLicenceCache();
      return { success: true, dateFin: data.dateFin, cleApi: data.cleApi, mode: data.mode };
    }),
});