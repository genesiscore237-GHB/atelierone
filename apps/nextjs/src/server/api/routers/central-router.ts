import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure, adminProcedure } from "~/server/api/trpc";
import { db, tenantSites, tenantLicences, tenantPaiements, syncIngests, tenantSnapshots, tenantRelances, tenantAudit, tenantUsage } from "@atelierone/db";
import { eq, and, desc, sql, gte, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { signerLicence, etendrePeriode, type LicencePayload } from "~/server/lib/licence-service";
import type { ExtendedUser } from "@atelierone/auth/types";

/**
 * MODULE SAAS — serveur central (portail + dashboard parent).
 * Monté uniquement quand APP_ROLE=central.
 * Gestion des garages (tenants), licences, paiements, relances, audit et vue d'ensemble.
 * Rôles : central.consulter (lecture) / central.gerer (actions sensibles).
 */

/** Journalise une action éditeur (audit SaaS). */
async function logAction(ctx: { user: ExtendedUser | null }, siteId: number | null, action: string, details?: Record<string, unknown>) {
  try {
    await db.insert(tenantAudit).values({
      siteId,
      action,
      details: details ?? null,
      acteurId: ctx.user ? Number(ctx.user.id) : null,
      acteurEmail: ctx.user?.email ?? null,
    } as any);
  } catch (e) {
    void e;
  }
}

/** Génère les relances (licences ≤ 7 j, hors-ligne > 7 j, sans licence) en évitant les doublons non traités. */
async function regenererRelances() {
  const sites = await db.select().from(tenantSites);
  const licences = await db.select().from(tenantLicences).orderBy(desc(tenantLicences.emitLe));
  const licenceParSite = new Map<number, any>();
  for (const l of licences) {
    const cur = licenceParSite.get(l.siteId);
    if (!cur || new Date(l.emitLe) > new Date(cur.emitLe)) licenceParSite.set(l.siteId, l);
  }
  const existantes = await db.select({ siteId: tenantRelances.siteId, type: tenantRelances.type }).from(tenantRelances).where(eq(tenantRelances.statut, "A_FAIRE"));
  const clef = (s: number, t: string) => `${s}:${t}`;
  const deja = new Set(existantes.map((r) => clef(r.siteId, r.type)));

  const ajouter = async (siteId: number, type: string, message: string) => {
    if (deja.has(clef(siteId, type))) return;
    await db.insert(tenantRelances).values({ siteId, type, message } as any);
    deja.add(clef(siteId, type));
  };

  for (const s of sites) {
    const l = licenceParSite.get(s.id);
    if (!l) {
      await ajouter(s.id, "SANS_LICENCE", `${s.nomGarage} (${s.codeSite}) — site sans licence, bloqué`);
      continue;
    }
    const jours = Math.ceil((new Date(l.dateFin).getTime() - Date.now()) / 86400000);
    if (l.statut === "ACTIVE" && jours <= 7) {
      await ajouter(s.id, "LICENCE_EXPIRANT", `${s.nomGarage} (${s.codeSite}) — licence expire dans ${Math.max(0, jours)} j (${l.dateFin}) → relancer le client`);
    }
    if (s.dernierHeartbeat && new Date(s.dernierHeartbeat) < new Date(Date.now() - 7 * 86400000)) {
      await ajouter(s.id, "HORS_LIGNE", `${s.nomGarage} (${s.codeSite}) — hors-ligne depuis ${new Date(s.dernierHeartbeat).toLocaleDateString("fr-FR")} (> 7 j)`);
    }
  }
}

export const centralRouter = createTRPCRouter({
  // ─── Dashboard parent ───
  dashboard: requirePermissionProcedure("central.consulter").query(async ({ ctx }) => {
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

    // MRR : paiements confirmés des 30 derniers jours (abonnements actifs)
    const paiements30j = paiements.filter((p) => p.statut === "CONFIRME" && new Date(p.payeLe ?? p.createdAt) >= new Date(Date.now() - 30 * 86400000));
    const mrr = paiements30j.reduce((s, p) => s + p.montant, 0);
    // ARPU : revenu 30 j / garages actifs
    const arpu = stats.sitesActifs > 0 ? Math.round((mrr / stats.sitesActifs) * 10) / 10 : 0;
    // Churn : licences expirées non renouvelées
    const churn = [...licenceParSite.values()].filter((l) => l.statut !== "ACTIVE").length;

    // Évolution du revenu sur 12 mois
    const evolutionRevenu: { mois: string; montant: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const montant = paiements
        .filter((p) => p.statut === "CONFIRME" && p.payeLe)
        .filter((p) => new Date(p.payeLe!).toISOString().slice(0, 7) === cle)
        .reduce((s, p) => s + p.montant, 0);
      evolutionRevenu.push({ mois: cle, montant });
    }

    // Relances régénérées + persistées
    await regenererRelances();
    const relances = await db
      .select({
        id: tenantRelances.id,
        type: tenantRelances.type,
        message: tenantRelances.message,
        statut: tenantRelances.statut,
        creeLe: tenantRelances.creeLe,
        faiteLe: tenantRelances.faiteLe,
        siteCode: tenantSites.codeSite,
        siteNom: tenantSites.nomGarage,
      })
      .from(tenantRelances)
      .leftJoin(tenantSites, eq(tenantRelances.siteId, tenantSites.id))
      .orderBy(desc(tenantRelances.creeLe))
      .limit(100);

    return {
      stats: { ...stats, mrr, arpu, churn },
      evolutionRevenu,
      relances: relances.map((r) => ({ ...r, siteCode: r.siteCode ?? null, siteNom: r.siteNom ?? null })),
      alertes: {
        licencesExpirant7j: sites
          .map((s) => ({ site: s, licence: licenceParSite.get(s.id) }))
          .filter((x) => x.licence && x.licence.statut === "ACTIVE" && Math.ceil((new Date(x.licence.dateFin).getTime() - Date.now()) / 86400000) <= 7)
          .map((x) => ({ codeSite: x.site.codeSite, nomGarage: x.site.nomGarage, dateFin: x.licence.dateFin, joursRestants: Math.ceil((new Date(x.licence.dateFin).getTime() - Date.now()) / 86400000) })),
        sitesHorsLigne: sites
          .filter((s) => s.dernierHeartbeat && new Date(s.dernierHeartbeat) < new Date(Date.now() - 7 * 86400000))
          .map((s) => ({ codeSite: s.codeSite, nomGarage: s.nomGarage, dernierHeartbeat: s.dernierHeartbeat })),
        sitesSansLicence: sites.filter((s) => !licenceParSite.get(s.id)).map((s) => ({ codeSite: s.codeSite, nomGarage: s.nomGarage })),
      },
      sites: sites.map((s) => {
        const licence = licenceParSite.get(s.id);
        const joursRestants = licence ? Math.ceil((new Date(licence.dateFin).getTime() - Date.now()) / 86400000) : null;
        const paiementsSite = paiements.filter((p) => p.siteId === s.id);
        // Santé : VERT si licence active (> 7 j) + heartbeat récent ; ORANGE si ≤ 7 j ou heartbeat 3-7 j ; ROUGE sinon
        let sante = "VERT";
        if (!licence || licence.statut !== "ACTIVE") sante = "ROUGE";
        else if (joursRestants !== null && joursRestants <= 7) sante = "ORANGE";
        else if (s.dernierHeartbeat && new Date(s.dernierHeartbeat) < new Date(Date.now() - 7 * 86400000)) sante = "ROUGE";
        else if (s.dernierHeartbeat && new Date(s.dernierHeartbeat) < new Date(Date.now() - 3 * 86400000)) sante = "ORANGE";
        return {
          ...s,
          sante,
          licence: licence
            ? { dateFin: licence.dateFin, mode: licence.mode, statut: licence.statut, joursRestants }
            : null,
          nbPaiements: paiementsSite.length,
          payeTotal: paiementsSite.filter((p) => p.statut === "CONFIRME").reduce((acc, p) => acc + p.montant, 0),
        };
      }),
      snapshots: snapshots.map((sn) => ({ ...sn, siteCode: sites.find((s) => s.id === sn.siteId)?.codeSite })),
      audit: await db
        .select({ id: tenantAudit.id, action: tenantAudit.action, details: tenantAudit.details, acteurEmail: tenantAudit.acteurEmail, creeLe: tenantAudit.creeLe, siteCode: tenantSites.codeSite })
        .from(tenantAudit)
        .leftJoin(tenantSites, eq(tenantAudit.siteId, tenantSites.id))
        .orderBy(desc(tenantAudit.creeLe))
        .limit(30),
    };
  }),

  // ─── Garages ───
  sites: requirePermissionProcedure("central.consulter").query(async () => {
    return db.select().from(tenantSites).orderBy(desc(tenantSites.inscritLe));
  }),

  suspendreSite: requirePermissionProcedure("central.gerer")
    .input(z.object({ id: z.number().int(), suspendu: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [site] = await db.select({ id: tenantSites.id, codeSite: tenantSites.codeSite }).from(tenantSites).where(eq(tenantSites.id, input.id)).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site introuvable." });
      await db.update(tenantSites).set({ statut: input.suspendu ? "SUSPENDU" : "ACTIF", updatedAt: new Date() } as any).where(eq(tenantSites.id, input.id));
      await logAction(ctx, input.id, input.suspendu ? "SITE_SUSPENDU" : "SITE_REACTIVE", { codeSite: site.codeSite });
      return { success: true };
    }),

  // ─── Licences ───
  licences: requirePermissionProcedure("central.consulter")
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
  etendreLicence: requirePermissionProcedure("central.gerer")
    .input(z.object({ siteId: z.number().int(), mois: z.number().int().min(1).max(12), mode: z.enum(["ESSAI", "ABONNEMENT"]).default("ABONNEMENT") }))
    .mutation(async ({ ctx, input }) => {
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
      await logAction(ctx, input.siteId, "LICENCE_ETENDUE", { mois: input.mois, mode: input.mode, dateFin: etendue.dateFin });
      return row;
    }),

  // ─── Paiements (simulation CinetPay : créer + confirmer) ───
  paiements: requirePermissionProcedure("central.consulter")
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
  creerPaiement: requirePermissionProcedure("central.gerer")
    .input(z.object({ siteId: z.number().int(), montant: z.number().positive(), periodeMois: z.number().int().min(1).max(12).default(1), modePaiement: z.enum(["cinetpay", "paydunya", "manuel"]).default("cinetpay"), fournisseur: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [site] = await db.select({ id: tenantSites.id, codeSite: tenantSites.codeSite }).from(tenantSites).where(eq(tenantSites.id, input.siteId)).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site introuvable." });
      const ref = `CP-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
      const [row] = await db
        .insert(tenantPaiements)
        .values({ siteId: input.siteId, reference: ref, montant: input.montant, modePaiement: input.modePaiement, statut: "EN_ATTENTE", periodeMois: input.periodeMois, fournisseur: input.fournisseur ?? null } as any)
        .returning();
      await logAction(ctx, input.siteId, "PAIEMENT_CREE", { reference: ref, montant: input.montant });
      return row;
    }),

  confirmerPaiement: requirePermissionProcedure("central.gerer")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [p] = await db.select().from(tenantPaiements).where(eq(tenantPaiements.id, input.id)).limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Paiement introuvable." });
      if (p.statut === "CONFIRME") throw new TRPCError({ code: "BAD_REQUEST", message: "Déjà confirmé." });
      await db.update(tenantPaiements).set({ statut: "CONFIRME", payeLe: new Date() } as any).where(eq(tenantPaiements.id, input.id));
      await logAction(ctx, p.siteId, "PAIEMENT_CONFIRME", { reference: p.reference, montant: p.montant });
      return { success: true };
    }),

  // ─── Ingests reçus (audit sync) ───
  ingests: requirePermissionProcedure("central.consulter")
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

  // ─── Fiche tenant (drill-down) : tout sur un garage ───
  ficheTenant: requirePermissionProcedure("central.consulter")
    .input(z.object({ siteId: z.number().int() }))
    .query(async ({ input }) => {
      const [site] = await db.select().from(tenantSites).where(eq(tenantSites.id, input.siteId)).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site introuvable." });
      const [licences, paiements, ingests, snapshots, relancesSite, auditSite] = await Promise.all([
        db.select().from(tenantLicences).where(eq(tenantLicences.siteId, input.siteId)).orderBy(desc(tenantLicences.emitLe)),
        db.select().from(tenantPaiements).where(eq(tenantPaiements.siteId, input.siteId)).orderBy(desc(tenantPaiements.createdAt)),
        db.select({ id: syncIngests.id, entite: syncIngests.entite, nbLignes: syncIngests.nbLignes, reçuLe: syncIngests.reçuLe }).from(syncIngests).where(eq(syncIngests.siteId, input.siteId)).orderBy(desc(syncIngests.reçuLe)).limit(50),
        db.select().from(tenantSnapshots).where(eq(tenantSnapshots.siteId, input.siteId)).orderBy(desc(tenantSnapshots.majLe)),
        db.select().from(tenantRelances).where(eq(tenantRelances.siteId, input.siteId)).orderBy(desc(tenantRelances.creeLe)),
        db.select({ id: tenantAudit.id, action: tenantAudit.action, details: tenantAudit.details, acteurEmail: tenantAudit.acteurEmail, creeLe: tenantAudit.creeLe }).from(tenantAudit).where(eq(tenantAudit.siteId, input.siteId)).orderBy(desc(tenantAudit.creeLe)).limit(30),
      ]);
      const [licenceCourante] = licences;
      return {
        site,
        licenceCourante: licenceCourante
          ? { ...licenceCourante, joursRestants: Math.ceil((new Date(licenceCourante.dateFin).getTime() - Date.now()) / 86400000) }
          : null,
        licences,
        paiements,
        ingests,
        snapshots,
        relances: relancesSite,
        audit: auditSite,
      };
    }),

  // ─── Relances : liste + marquer faite ───
  relances: requirePermissionProcedure("central.consulter")
    .input(z.object({ statut: z.string().optional() }))
    .query(async ({ input }) => {
      return db
        .select({
          id: tenantRelances.id,
          type: tenantRelances.type,
          message: tenantRelances.message,
          statut: tenantRelances.statut,
          creeLe: tenantRelances.creeLe,
          faiteLe: tenantRelances.faiteLe,
          siteCode: tenantSites.codeSite,
          siteNom: tenantSites.nomGarage,
        })
        .from(tenantRelances)
        .leftJoin(tenantSites, eq(tenantRelances.siteId, tenantSites.id))
        .where(input.statut ? eq(tenantRelances.statut, input.statut) : undefined)
        .orderBy(desc(tenantRelances.creeLe))
        .limit(100);
    }),

  marquerRelanceFaite: requirePermissionProcedure("central.gerer")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await db.select().from(tenantRelances).where(eq(tenantRelances.id, input.id)).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Relance introuvable." });
      await db.update(tenantRelances).set({ statut: "FAITE", faiteLe: new Date(), faitePar: ctx.user ? Number(ctx.user.id) : null } as any).where(eq(tenantRelances.id, input.id));
      return { success: true };
    }),

  /** Rotation de la clé API d'un site (sécurité) — fenêtre de bascule 24 h. */
  rotationCleApi: requirePermissionProcedure("central.gerer")
    .input(z.object({ siteId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [site] = await db.select({ id: tenantSites.id, codeSite: tenantSites.codeSite, cleApi: tenantSites.cleApi }).from(tenantSites).where(eq(tenantSites.id, input.siteId)).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site introuvable." });
      const nouvelle = `${site.codeSite}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      await db.update(tenantSites).set({
        cleApi: nouvelle,
        cleApiAncienne: site.cleApi,
        cleApiChangeLe: new Date(),
        updatedAt: new Date(),
      } as any).where(eq(tenantSites.id, input.siteId));
      await logAction(ctx, input.siteId, "CLE_API_ROTEE", { codeSite: site.codeSite });
      return { success: true, cleApi: nouvelle };
    }),

  // ─── Exports CSV (éditeur) ───
  exportGarages: requirePermissionProcedure("central.consulter").query(async () => {
    const sites = await db.select().from(tenantSites).orderBy(tenantSites.codeSite);
    const licences = await db.select().from(tenantLicences).orderBy(desc(tenantLicences.emitLe));
    const licenceParSite = new Map<number, any>();
    for (const l of licences) {
      const cur = licenceParSite.get(l.siteId);
      if (!cur || new Date(l.emitLe) > new Date(cur.emitLe)) licenceParSite.set(l.siteId, l);
    }
    const lignes = sites.map((s) => {
      const l = licenceParSite.get(s.id);
      return [
        s.codeSite, s.nomGarage, s.ville ?? "", s.statut,
        l ? `${l.mode}/${l.statut}` : "", l ? l.dateFin : "", l ? String(Math.ceil((new Date(l.dateFin).getTime() - Date.now()) / 86400000)) : "",
        s.dernierHeartbeat ? new Date(s.dernierHeartbeat).toISOString() : "", s.derniereSync ? new Date(s.derniereSync).toISOString() : "", s.versionLogiciel ?? "",
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";");
    });
    return `code_site;nom;ville;statut;licence;echeance;jours_restants;dernier_heartbeat;derniere_sync;version\n${lignes.join("\n")}`;
  }),

  exportPaiements: requirePermissionProcedure("central.consulter").query(async () => {
    const rows = await db
      .select({
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
      .orderBy(desc(tenantPaiements.createdAt));
    const lignes = rows.map((p) =>
      [p.reference, p.siteCode, p.siteNom, String(p.montant), p.periodeMois, p.modePaiement, p.fournisseur ?? "", p.statut, p.payeLe ? new Date(p.payeLe).toISOString() : "", p.createdAt ? new Date(p.createdAt).toISOString() : ""]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")
    );
    return `reference;code_site;garage;montant;mois;mode;fournisseur;statut;paye_le;cree_le\n${lignes.join("\n")}`;
  }),

  // ─── Analytique d'usage : adoption des modules par garage ───
  usage: requirePermissionProcedure("central.consulter")
    .input(z.object({ periode: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const periode = input?.periode ?? new Date().toISOString().slice(0, 7);
      const rows = await db
        .select({
          siteId: tenantUsage.siteId,
          entite: tenantUsage.entite,
          nbLignes: tenantUsage.nbLignes,
          siteCode: tenantSites.codeSite,
          siteNom: tenantSites.nomGarage,
        })
        .from(tenantUsage)
        .leftJoin(tenantSites, eq(tenantUsage.siteId, tenantSites.id))
        .where(eq(tenantUsage.periode, periode))
        .orderBy(tenantUsage.siteId, tenantUsage.entite);
      const parSite = new Map<number, { siteCode: string; siteNom: string; modules: { entite: string; nbLignes: number }[] }>();
      for (const r of rows) {
        const s = parSite.get(r.siteId) ?? { siteCode: r.siteCode ?? "", siteNom: r.siteNom ?? "", modules: [] };
        s.modules.push({ entite: r.entite, nbLignes: r.nbLignes ?? 0 });
        parSite.set(r.siteId, s);
      }
      const sitesUsage = [...parSite.values()].map((s) => ({ ...s, nbModules: s.modules.length })).sort((a, b) => b.nbModules - a.nbModules);
      return { periode, sites: sitesUsage };
    }),
});