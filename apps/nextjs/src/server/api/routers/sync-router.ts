import { z } from "zod";
import { createTRPCRouter, publicProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, syncEtat, syncOutbox, licenceLocale } from "@atelierone/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "~/server/lib/logger";

/**
 * MODULE SAAS — agent de synchronisation du garage (delta incrémental → central).
 * Tables synchronisées : clients, vehicules, ordres_reparation, ventes (+lignes),
 * paiements, mouvements_stock, fournisseurs, factures_fournisseur.
 * Principe : WHERE updated_at > dernierSync (ou created_at si pas d'updated_at).
 */

const TABLES_SYNC: { table: string; col: string | null; parentTable?: string; parentCol?: string; fkCol?: string }[] = [
  { table: "clients", col: "updated_at" },
  { table: "vehicules", col: "updated_at" },
  { table: "ordres_reparation", col: "updated_at" },
  { table: "ventes", col: "created_at" },
  { table: "ventes_lignes", col: null, parentTable: "ventes", parentCol: "created_at", fkCol: "vente_id" },
  { table: "paiements", col: "created_at" },
  { table: "mouvements_stock", col: "date_mouvement" },
  { table: "fournisseurs", col: "updated_at" },
  { table: "factures_fournisseur", col: "updated_at" },
];

export const syncRouter = createTRPCRouter({
  /** État de la synchro (dernières poussées par table). */
  etat: publicProcedure.query(async () => {
    if (process.env.APP_ROLE === "central") return { actif: false as const, centralUrl: null as string | null, tables: [] as any[] };
    const rows = await db.select().from(syncEtat).orderBy(syncEtat.table);
    return {
      actif: !!process.env.CENTRAL_URL,
      centralUrl: process.env.CENTRAL_URL ?? null,
      siteCode: process.env.SITE_CODE ?? null,
      tables: rows,
    };
  }),

  /** Poussée manuelle : collecte les deltas et les envoie au central. */
  pousser: requirePermissionProcedure("admin.parametres")
    .input(z.object({}).optional())
    .mutation(async () => {
      return pousserDelta();
    }),

  /** Historique des ingests (local, dernière poussée par table). */
  historique: publicProcedure.query(async () => {
    return db.select().from(syncOutbox).orderBy(syncOutbox.id).limit(50);
  }),
});

export async function pousserDelta(): Promise<{ success: boolean; envoye: number; erreur?: string }> {
  const centralUrl = process.env.CENTRAL_URL ?? "";
  const siteCode = process.env.SITE_CODE ?? "";
  const [local] = await db.select({ cleApi: licenceLocale.cleApi }).from(licenceLocale).limit(1);
  const cleApi = local?.cleApi ?? process.env.SITE_CLE_API ?? "";
  if (!centralUrl || !siteCode || !cleApi) {
    return { success: false, envoye: 0, erreur: "Configuration SaaS manquante." };
  }

  const entites: { entite: string; lignes: any[] }[] = [];
  for (const t of TABLES_SYNC) {
    try {
      const [etat] = await db.select().from(syncEtat).where(eq(syncEtat.table, t.table)).limit(1);
      const depuis = (etat?.dernierSync ?? new Date(Date.now() - 90 * 86400000)).toISOString();
      const result = t.col
        ? await db.execute(
            sql`SELECT * FROM ${sql.identifier(t.table)} WHERE ${sql.identifier(t.col)} > ${depuis} ORDER BY ${sql.identifier(t.col)} LIMIT 500`
          )
        : await db.execute(
            sql`SELECT * FROM ${sql.identifier(t.table)} WHERE ${sql.identifier(t.fkCol!)} IN (SELECT id FROM ${sql.identifier(t.parentTable!)} WHERE ${sql.identifier(t.parentCol!)} > ${depuis}) LIMIT 500`
          );
      const lignes = Array.isArray(result) ? result : (result as any).rows ?? [];
      if (lignes.length > 0) {
        entites.push({ entite: t.table, lignes });
        const nouveau = new Date();
        if (etat) {
          await db.update(syncEtat).set({ dernierSync: nouveau, statut: "OK", erreur: null, nbPoussees: (etat.nbPoussees ?? 0) + 1, majLe: nouveau } as any).where(eq(syncEtat.id, etat.id));
        } else {
          await db.insert(syncEtat).values({ table: t.table, dernierSync: nouveau, statut: "OK", nbPoussees: 1 } as any);
        }
      }
    } catch (e: any) {
      logger.warn({ table: t.table, msg: e?.message }, "Sync table %s impossible", t.table);
    }
  }

  if (entites.length === 0) return { success: true, envoye: 0 };

  try {
    const res = await fetch(`${centralUrl}/api/sync/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codeSite: siteCode, cleApi, entites }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Ingest refusé");
    return { success: true, envoye: data.reçu ?? 0 };
  } catch (e: any) {
    logger.error({ e }, "Ingest échoué");
    return { success: false, envoye: 0, erreur: e.message };
  }
}

/** Heartbeat périodique : renouvelle la licence si paiement actif. */
export async function heartbeatCentral(): Promise<boolean> {
  const centralUrl = process.env.CENTRAL_URL ?? "";
  const siteCode = process.env.SITE_CODE ?? "";
  const [local] = await db.select({ cleApi: licenceLocale.cleApi }).from(licenceLocale).limit(1);
  const cleApi = local?.cleApi ?? process.env.SITE_CLE_API ?? "";
  if (!centralUrl || !siteCode || !cleApi) return false;
  try {
    const res = await fetch(`${centralUrl}/api/sync/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codeSite: siteCode, cleApi }),
    });
    const data = await res.json();
    if (!res.ok || !data.jeton) return false;
    const [existing] = await db.select({ id: licenceLocale.id }).from(licenceLocale).limit(1);
    if (existing) {
      await db.update(licenceLocale).set({ jeton: data.jeton, dateFin: new Date(data.dateFin), mode: data.mode, cleApi: data.nouvelleCleApi ?? cleApi, dernierHeartbeat: new Date(), miseAJourLe: new Date() } as any).where(eq(licenceLocale.id, existing.id));
    }
    return true;
  } catch {
    return false;
  }
}