import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure, adminProcedure } from "~/server/api/trpc";
import { db, tenantSites, tenantLicences, tenantPaiements, syncIngests, tenantSnapshots } from "@atelierone/db";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { signerLicence, etendrePeriode, type LicencePayload } from "~/server/lib/licence-service";

/**
 * MODULE SAAS — serveur central (portail + dashboard parent).
 * Monté uniquement quand APP_ROLE=central.
 * Gestion des garages (tenants), licences, paiements et vue d'ensemble.
 */

export const centralRouter = createTRPCRouter({
  // ─── Dashboard parent ───
  dashboard: requirePermissionProcedure("admin.parametres").query(async () => {
    const sites = await db.select().from(tenantSites).orderBy(desc(tenantSites.inscritLe));
    const licences = await db.select().from(tenantLicences).orderBy(desc(tenantLicences.emitLe));
    const paiements = await db.select().from(tenantPaiements).orderBy(desc(tenantPaiements.createdAt));
    const ingests30 = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(syncIngests)
      .where(gte(syncIngests.reçuLe, new Date(Date.now() - 30 * 86400000)));

    const snapshots = await db.select().from(tenantSnapshots).orderBy(desc(tenantSnapshots.majLe));

    const licenceParSite = new Map<number, any>();
    for (const l of licences) {
      const cur = licenceParSite.get(l.siteId);
      if (!cur || new Date(l.emitLe) > new Date(cur.emitLe)) licenceParSite.set(l.siteId, l);
    }

    const stats = {
      nbSites: sites.length,
      sitesActifs: sites.filter((s) => s.statut === "ACTIF").length,
      licencesActives: [...licenceParSite.values()].filter((l) => l.statut === "ACTIVE").length,
      paiementsConfirmes: paiements.filter((p) => p.statut === "CONFIRME").length,
      revenuTotal: paiements.filter((p) => p.statut === "CONFIRME").reduce((s, p) => s + p.montant, 0),
      ingests30j: ingests30?.[0]?.n ?? 0,
    };

    return {
      stats,
      sites: sites.map((s) => {
        const licence = licenceParSite.get(s.id);
        const joursRestants = licence ? Math.ceil((new Date(licence.dateFin).getTime() - Date.now()) / 86400000) : null;
        const paiementsSite = paiements.filter((p) => p.siteId === s.id);
        return {
          ...s,
          licence: licence
            ? { dateFin: licence.dateFin, mode: licence.mode, statut: licence.statut, joursRestants }
            : null,
          nbPaiements: paiementsSite.length,
          payeTotal: paiementsSite.filter((p) => p.statut === "CONFIRME").reduce((acc, p) => acc + p.montant, 0),
        };
      }),
      snapshots: snapshots.map((sn) => ({ ...sn, siteCode: sites.find((s) => s.id === sn.siteId)?.codeSite })),
    };
  }),

  // ─── Garages ───
  sites: requirePermissionProcedure("admin.parametres").query(async () => {
    return db.select().from(tenantSites).orderBy(desc(tenantSites.inscritLe));
  }),

  suspendreSite: requirePermissionProcedure("admin.parametres")
    .input(z.object({ id: z.number().int(), suspendu: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [site] = await db.select({ id: tenantSites.id }).from(tenantSites).where(eq(tenantSites.id, input.id)).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site introuvable." });
      await db.update(tenantSites).set({ statut: input.suspendu ? "SUSPENDU" : "ACTIF", updatedAt: new Date() } as any).where(eq(tenantSites.id, input.id));
      return { success: true };
    }),

  // ─── Licences ───
  licences: requirePermissionProcedure("admin.parametres")
    .input(z.object({ siteId: z.number().int().optional() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: tenantLicences.id,
          siteId: tenantLicences.siteId,
          dateDebut: tenantLicences.dateDebut,
          dateFin: tenantLicences.dateFin,
          graceJours: tenantLicences.graceJours,
          statut: tenantLicences.statut,
          mode: tenantLicences.mode,
          emitLe: tenantLicences.emitLe,
          siteCode: tenantSites.codeSite,
          siteNom: tenantSites.nomGarage,
        })
        .from(tenantLicences)
        .leftJoin(tenantSites, eq(tenantLicences.siteId, tenantSites.id))
        .where(input.siteId ? eq(tenantLicences.siteId, input.siteId) : undefined)
        .orderBy(desc(tenantLicences.emitLe))
        .limit(100);
      return rows;
    }),

  /** Extension manuelle (support) : émet une licence d'essai/abonnement. */
  etendreLicence: requirePermissionProcedure("admin.parametres")
    .input(z.object({ siteId: z.number().int(), mois: z.number().int().min(1).max(12), mode: z.enum(["ESSAI", "ABONNEMENT"]).default("ABONNEMENT") }))
    .mutation(async ({ input }) => {
      const [site] = await db.select({ id: tenantSites.id, codeSite: tenantSites.codeSite, nomGarage: tenantSites.nomGarage }).from(tenantSites).where(eq(tenantSites.id, input.siteId)).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site introuvable." });
      const [last] = await db.select({ dateFin: tenantLicences.dateFin }).from(tenantLicences).where(eq(tenantLicences.siteId, input.siteId)).orderBy(desc(tenantLicences.emitLe)).limit(1);
      const payload: LicencePayload = {
        siteId: site.codeSite,
        nomGarage: site.nomGarage,
        dateDebut: last?.dateFin ?? new Date().toISOString().slice(0, 10),
        dateFin: last?.dateFin ?? new Date().toISOString().slice(0, 10),
        graceJours: 7,
        mode: input.mode,
        emitLe: new Date().toISOString(),
      };
      const etendue = etendrePeriode(payload, input.mois);
      const jeton = signerLicence({ ...payload, dateFin: etendue.dateFin }, process.env.LICENCE_SECRET ?? "");
      const [row] = await db
        .insert(tenantLicences)
        .values({
          siteId: input.siteId,
          jeton,
          dateDebut: payload.dateDebut,
          dateFin: etendue.dateFin,
          graceJours: 7,
          statut: "ACTIVE",
          mode: input.mode,
        } as any)
        .returning();
      return row;
    }),

  // ─── Paiements (simulation CinetPay : créer + confirmer) ───
  paiements: requirePermissionProcedure("admin.parametres")
    .input(z.object({ siteId: z.number().int().optional() }))
    .query(async ({ input }) => {
      return db
        .select({
          id: tenantPaiements.id,
          reference: tenantPaiements.reference,
          montant: tenantPaiements.montant,
          modePaiement: tenantPaiements.modePaiement,
          statut: tenantPaiements.statut,
          periodeMois: tenantPaiements.periodeMois,
          fournisseur: tenantPaiements.fournisseur,
          payeLe: tenantPaiements.payeLe,
          createdAt: tenantPaiements.createdAt,
          siteCode: tenantSites.codeSite,
          siteNom: tenantSites.nomGarage,
        })
        .from(tenantPaiements)
        .leftJoin(tenantSites, eq(tenantPaiements.siteId, tenantSites.id))
        .where(input.siteId ? eq(tenantPaiements.siteId, input.siteId) : undefined)
        .orderBy(desc(tenantPaiements.createdAt))
        .limit(100);
    }),

  /** Création d'un paiement (simulation : le client paie via CinetPay → on confirme). */
  creerPaiement: requirePermissionProcedure("admin.parametres")
    .input(z.object({ siteId: z.number().int(), montant: z.number().positive(), periodeMois: z.number().int().min(1).max(12).default(1), modePaiement: z.enum(["cinetpay", "paydunya", "manuel"]).default("cinetpay"), fournisseur: z.string().optional() }))
    .mutation(async ({ input }) => {
      const [site] = await db.select({ id: tenantSites.id }).from(tenantSites).where(eq(tenantSites.id, input.siteId)).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site introuvable." });
      const ref = `CP-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
      const [row] = await db
        .insert(tenantPaiements)
        .values({ siteId: input.siteId, reference: ref, montant: input.montant, modePaiement: input.modePaiement, statut: "EN_ATTENTE", periodeMois: input.periodeMois, fournisseur: input.fournisseur ?? null } as any)
        .returning();
      return row;
    }),

  confirmerPaiement: requirePermissionProcedure("admin.parametres")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const [p] = await db.select().from(tenantPaiements).where(eq(tenantPaiements.id, input.id)).limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Paiement introuvable." });
      if (p.statut === "CONFIRME") throw new TRPCError({ code: "BAD_REQUEST", message: "Déjà confirmé." });
      await db.update(tenantPaiements).set({ statut: "CONFIRME", payeLe: new Date() } as any).where(eq(tenantPaiements.id, input.id));
      return { success: true };
    }),

  // ─── Ingests reçus (audit sync) ───
  ingests: requirePermissionProcedure("admin.parametres")
    .input(z.object({ siteId: z.number().int().optional(), limit: z.number().int().default(50) }))
    .query(async ({ input }) => {
      return db
        .select({
          id: syncIngests.id,
          entite: syncIngests.entite,
          nbLignes: syncIngests.nbLignes,
          reçuLe: syncIngests.reçuLe,
          siteCode: tenantSites.codeSite,
        })
        .from(syncIngests)
        .leftJoin(tenantSites, eq(syncIngests.siteId, tenantSites.id))
        .where(input.siteId ? eq(syncIngests.siteId, input.siteId) : undefined)
        .orderBy(desc(syncIngests.reçuLe))
        .limit(input.limit);
    }),
});