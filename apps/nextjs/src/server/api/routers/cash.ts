import { z } from "zod";
import { createTRPCRouter, caisseProcedure, adminProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, caisses, sessionsCaisse, mouvementsCaisse, caisseOperateurs, utilisateurs, transfertsCaisses } from "@atelierone/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createBusinessError } from "~/server/lib/errors";
import { CaisseService } from "~/server/lib/caisse-service";

async function getRecapMouvements(caisseId: number) {
  const rows = await db.select({
    type: mouvementsCaisse.type,
    total: sql<string>`COALESCE(SUM(CAST(${mouvementsCaisse.montant} AS numeric)), 0)`,
  }).from(mouvementsCaisse)
    .where(eq(mouvementsCaisse.caisseId, caisseId))
    .groupBy(mouvementsCaisse.type);

  const parType: Record<string, string> = {};
  for (const r of rows) parType[r.type] = String(r.total ?? "0");
  const total = (t: string) => parType[t] ?? "0";

  return {
    totalVentes: total("vente"),
    totalDepenses: total("depense"),
    totalEntrees: total("entree"),
    totalSorties: total("sortie"),
    totalApports: total("apport"),
    totalRetraits: total("retrait"),
    totalRemboursements: total("remboursement"),
    totalAnnulations: total("annulation"),
    totalPaiementsFournisseurs: total("paiement_fournisseur"),
    totalEncaissementsDettes: total("encaissement_dette"),
    parType,
  };
}

export const cashRouter = createTRPCRouter({
  /* ─── Gestion des caisses ─── */

  createCaisse: adminProcedure
    .input(z.object({ libelle: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [caisse] = await db.insert(caisses).values({
        agenceId: ctx.user.agenceId,
        libelle: input.libelle,
      }).returning() as any;
      return { id: String(caisse.id), libelle: caisse.libelle };
    }),

  listCaisses: adminProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;

    const rows = await db.select({
      id: caisses.id,
      libelle: caisses.libelle,
      notes: caisses.notes,
      actif: caisses.actif,
      createdAt: caisses.createdAt,
      sessionId: sessionsCaisse.id,
      sessionStatut: sessionsCaisse.statut,
      sessionSoldeActuel: sessionsCaisse.soldeActuel,
      ouvertLe: sessionsCaisse.ouvertLe,
    }).from(caisses)
      .leftJoin(sessionsCaisse, and(eq(sessionsCaisse.caisseId, caisses.id), eq(sessionsCaisse.statut, "ouverte")))
      .where(eq(caisses.agenceId, agenceId))
      .orderBy(caisses.id) as any;

    const caisseIds = rows.map((r: any) => r.id);
    if (caisseIds.length === 0) return [];

    const opsRows: any[] = await db.execute(sql`
      SELECT "caisse_id", COUNT(*)::int AS "count",
             COALESCE(BOOL_OR("peut_ouvrir"), false) AS "peut_ouvrir",
             COALESCE(BOOL_OR("peut_fermer"), false) AS "peut_fermer",
             COALESCE(BOOL_OR("peut_depenser"), false) AS "peut_depenser"
      FROM "caisse_operateurs"
      WHERE "caisse_id" IN (${sql.join(caisseIds, sql`, `)})
      GROUP BY "caisse_id"
    `) as any;

    const opsByCaisse = new Map<number, any>();
    for (const row of opsRows ?? []) opsByCaisse.set(Number(row.caisse_id), row);

    return rows.map((c: any) => {
      const ops = opsByCaisse.get(c.id);
      return {
        id: String(c.id),
        libelle: c.libelle,
        notes: c.notes,
        actif: c.actif,
        createdAt: c.createdAt,
        session: c.sessionId ? {
          id: String(c.sessionId),
          statut: c.sessionStatut,
          soldeActuel: c.sessionSoldeActuel,
          ouvertLe: c.ouvertLe,
        } : null,
        operateurCount: Number(ops?.count ?? 0),
        permissions: {
          peutOuvrir: !!ops?.peut_ouvrir,
          peutFermer: !!ops?.peut_fermer,
          peutDepenser: !!ops?.peut_depenser,
        },
      };
    });
  }),

  updateCaisse: adminProcedure
    .input(z.object({
      caisseId: z.string(),
      libelle: z.string().min(1).optional(),
      notes: z.string().nullable().optional(),
      actif: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const caisseId = Number(input.caisseId);

      const [caisse] = await db.select({ id: caisses.id, libelle: caisses.libelle }).from(caisses)
        .where(and(eq(caisses.id, caisseId), eq(caisses.agenceId, agenceId))).limit(1);
      if (!caisse) throw createBusinessError("NOT_FOUND", "Caisse non trouvée");

      if (input.libelle && input.libelle !== caisse.libelle) {
        const [dup] = await db.select({ id: caisses.id }).from(caisses)
          .where(and(eq(caisses.agenceId, agenceId), eq(caisses.libelle, input.libelle)))
          .limit(1);
        if (dup && dup.id !== caisseId) {
          throw createBusinessError("BAD_REQUEST", `Une caisse « ${input.libelle} » existe déjà dans cette agence`);
        }
      }

      await db.update(caisses).set({
        libelle: input.libelle ?? caisse.libelle,
        notes: input.notes !== undefined ? input.notes : undefined,
        actif: input.actif !== undefined ? input.actif : undefined,
      } as any).where(eq(caisses.id, caisseId));

      return { success: true };
    }),

  listCaisseRegisters: caisseProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;
    const userId = ctx.user.id;

    const rows = await db.select({
      id: caisses.id,
      libelle: caisses.libelle,
      notes: caisses.notes,
      actif: caisses.actif,
      sessionId: sessionsCaisse.id,
      sessionCaisseId: sessionsCaisse.caisseId,
      sessionStatut: sessionsCaisse.statut,
      soldeOuverture: sessionsCaisse.soldeOuverture,
      soldeActuel: sessionsCaisse.soldeActuel,
      ouvertLe: sessionsCaisse.ouvertLe,
      ouvertPar: sessionsCaisse.ouvertPar,
      ouvertParNom: utilisateurs.nom,
      ouvertParPrenom: utilisateurs.prenom,
    }).from(caisses)
      .leftJoin(sessionsCaisse, and(eq(sessionsCaisse.caisseId, caisses.id), eq(sessionsCaisse.statut, "ouverte")))
      .leftJoin(utilisateurs, eq(sessionsCaisse.ouvertPar, utilisateurs.id))
      .where(and(eq(caisses.agenceId, agenceId), eq(caisses.actif, true)))
      .orderBy(caisses.id) as any;

    const ops: any[] = await (db as any).execute(
      sql`SELECT "caisse_id" as "caisseId", "peut_ouvrir" as "peutOuvrir", "peut_fermer" as "peutFermer", "peut_depenser" as "peutDepenser", "peut_voir_mouvements" as "peutVoirMouvements" FROM "caisse_operateurs" WHERE "user_id" = ${userId}`
    );

    const permsByCaisse = new Map<number, any>();
    for (const op of ops) permsByCaisse.set(op.caisseId, op);

    return rows.map((c) => {
      const perm = permsByCaisse.get(c.id);
      const isGestionnaire = ctx.user.role === "admin_reseau" || ctx.user.role === "responsable_agence";
      const permissions = isGestionnaire ? {
        peutOuvrir: true, peutFermer: true, peutDepenser: true, peutVoirMouvements: true,
      } : {
        peutOuvrir: !!perm?.peutOuvrir,
        peutFermer: !!perm?.peutFermer,
        peutDepenser: !!perm?.peutDepenser,
        peutVoirMouvements: !!perm?.peutVoirMouvements,
      };
      return {
        id: String(c.id),
        libelle: c.libelle,
        notes: c.notes,
        actif: c.actif,
        session: c.sessionId
          ? {
              id: String(c.sessionId),
              caisseId: String(c.sessionCaisseId),
              statut: c.sessionStatut,
              soldeOuverture: c.soldeOuverture,
              soldeActuel: c.soldeActuel,
              ouvertLe: c.ouvertLe,
              ouvertPar: c.ouvertPar ? String(c.ouvertPar) : null,
              ouvertParNom: c.ouvertParNom ? `${c.ouvertParPrenom ?? ""} ${c.ouvertParNom}`.trim() : null,
            }
          : null,
        permissions,
      };
    });
  }),

  listOperateurs: adminProcedure
    .input(z.object({ caisseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const caisseId = Number(input.caisseId);
      const [caisse] = await db.select({ id: caisses.id }).from(caisses)
        .where(and(eq(caisses.id, caisseId), eq(caisses.agenceId, ctx.user.agenceId))).limit(1);
      if (!caisse) throw createBusinessError("NOT_FOUND", "Caisse non trouvée");
      const rows = await db.select({
        id: caisseOperateurs.id,
        userId: caisseOperateurs.userId,
        nom: utilisateurs.nom,
        prenom: utilisateurs.prenom,
        email: utilisateurs.email,
        peutOuvrir: caisseOperateurs.peutOuvrir,
        peutFermer: caisseOperateurs.peutFermer,
        peutDepenser: caisseOperateurs.peutDepenser,
        peutVoirMouvements: caisseOperateurs.peutVoirMouvements,
      }).from(caisseOperateurs)
        .leftJoin(utilisateurs, eq(caisseOperateurs.userId, utilisateurs.id))
        .where(eq(caisseOperateurs.caisseId, caisseId));
      return rows;
    }),

  assignerOperateur: adminProcedure
    .input(z.object({
      caisseId: z.string(),
      userId: z.string(),
      peutOuvrir: z.boolean().default(true),
      peutFermer: z.boolean().default(false),
      peutDepenser: z.boolean().default(false),
      peutVoirMouvements: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const caisseId = Number(input.caisseId);
      const userId = Number(input.userId);

      const [caisse] = await db.select({ id: caisses.id }).from(caisses)
        .where(and(eq(caisses.id, caisseId), eq(caisses.agenceId, agenceId))).limit(1);
      if (!caisse) throw createBusinessError("NOT_FOUND", "Caisse non trouvée");

      const [existing] = await db.select({ id: caisseOperateurs.id }).from(caisseOperateurs)
        .where(and(eq(caisseOperateurs.caisseId, caisseId), eq(caisseOperateurs.userId, userId)))
        .limit(1);

      if (existing) {
        await db.update(caisseOperateurs).set({
          peutOuvrir: input.peutOuvrir,
          peutFermer: input.peutFermer,
          peutDepenser: input.peutDepenser,
          peutVoirMouvements: input.peutVoirMouvements,
        }).where(eq(caisseOperateurs.id, existing.id));
      } else {
        await db.insert(caisseOperateurs).values({
          caisseId,
          userId,
          peutOuvrir: input.peutOuvrir,
          peutFermer: input.peutFermer,
          peutDepenser: input.peutDepenser,
          peutVoirMouvements: input.peutVoirMouvements,
        });
      }
      return { success: true };
    }),

  retirerOperateur: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const opId = Number(input.id);
      const [op] = await db.select({
        id: caisseOperateurs.id,
        caisseId: caisseOperateurs.caisseId,
      }).from(caisseOperateurs).where(eq(caisseOperateurs.id, opId)).limit(1);
      if (!op) throw createBusinessError("NOT_FOUND", "Liaison opérateur non trouvée");

      const [caisse] = await db.select({ id: caisses.id }).from(caisses)
        .where(and(eq(caisses.id, op.caisseId), eq(caisses.agenceId, ctx.user.agenceId))).limit(1);
      if (!caisse) throw new TRPCError({ code: "FORBIDDEN", message: "Cette caisse ne fait pas partie de votre agence" });

      await db.delete(caisseOperateurs).where(eq(caisseOperateurs.id, opId));
      return { success: true };
    }),

  /* ─── Mouvements ─── */

  getSession: caisseProcedure
    .input(z.object({ caisseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const caisseId = Number(input.caisseId);
      await CaisseService.verifierAcces(caisseId, ctx.user.id);
      const [caisse] = await db.select().from(caisses).where(
        and(eq(caisses.id, caisseId), eq(caisses.agenceId, ctx.user.agenceId))
      ).limit(1);
      if (!caisse) throw new TRPCError({ code: "NOT_FOUND", message: "Caisse non trouvée" });
      return caisse;
    }),

  getMovements: caisseProcedure
    .input(z.object({
      caisseId: z.string(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const caisseId = Number(input.caisseId);
      await CaisseService.verifierAcces(caisseId, ctx.user.id);
      const agenceId = ctx.user.agenceId;
      const [caisse] = await db.select({ id: caisses.id }).from(caisses).where(
        and(eq(caisses.id, caisseId), eq(caisses.agenceId, agenceId))
      ).limit(1);
      if (!caisse) throw createBusinessError("NOT_FOUND", "Caisse non trouvée");

      return db.select()
        .from(mouvementsCaisse)
        .where(eq(mouvementsCaisse.caisseId, caisseId))
        .orderBy(desc(mouvementsCaisse.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  recordMovement: requirePermissionProcedure("caisse.mouvement")
    .input(z.object({
      caisseId: z.string(),
      type: z.enum(["entree", "sortie", "apport", "retrait"]),
      montant: z.number().min(1),
      motif: z.string().min(1),
      reference: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const caisseId = Number(input.caisseId);
      await CaisseService.verifierAcces(caisseId, ctx.user.id);

      if (input.type === "retrait") {
        const session = await CaisseService.getSessionOuverte(caisseId);
        const soldeActuel = Number(session.soldeActuel ?? 0);
        if (soldeActuel < input.montant) {
          throw createBusinessError("BAD_REQUEST", `Solde insuffisant en caisse (${soldeActuel.toLocaleString()}) pour un retrait de ${input.montant.toLocaleString()}`);
        }
      }

      const mvt = await CaisseService.enregistrerMouvementComplet({
        caisseId,
        agenceId: ctx.user.agenceId,
        type: input.type,
        montant: input.montant,
        motif: input.motif,
        reference: input.reference,
        effectuePar: ctx.user.id,
      });

      return { id: String(mvt?.id), success: true };
    }),

  recordExpense: requirePermissionProcedure("caisse.mouvement")
    .input(z.object({
      caisseId: z.string(),
      montant: z.number().min(1),
      categorie: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const caisseId = Number(input.caisseId);
      await CaisseService.verifierPermission(caisseId, ctx.user.id, "peutDepenser");

      const dep = await CaisseService.enregistrerDepenseAvecCaisse({
        caisseId,
        agenceId: ctx.user.agenceId,
        categorie: input.categorie,
        montant: input.montant,
        description: input.description,
        effectuePar: ctx.user.id,
      });

      return { id: String(dep?.id), success: true };
    }),

  getSessionSummary: caisseProcedure
    .input(z.object({ caisseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const caisseId = Number(input.caisseId);
      await CaisseService.verifierAcces(caisseId, ctx.user.id);

      const [session] = await db.select().from(sessionsCaisse)
        .where(and(eq(sessionsCaisse.caisseId, caisseId), eq(sessionsCaisse.statut, "ouverte")))
        .limit(1);
      if (!session) throw createBusinessError("NOT_FOUND", "Aucune session ouverte");

      const recap = await getRecapMouvements(caisseId);

      const mouvements = await db.select({
        id: mouvementsCaisse.id,
        type: mouvementsCaisse.type,
        montant: mouvementsCaisse.montant,
        motif: mouvementsCaisse.motif,
        reference: mouvementsCaisse.reference,
        entiteType: mouvementsCaisse.entiteType,
        entiteId: mouvementsCaisse.entiteId,
        categorieDepense: mouvementsCaisse.categorieDepense,
        createdAt: mouvementsCaisse.createdAt,
      }).from(mouvementsCaisse)
        .where(eq(mouvementsCaisse.caisseId, caisseId))
        .orderBy(desc(mouvementsCaisse.createdAt))
        .limit(50);

      return {
        session: {
          id: String(session.id),
          soldeOuverture: session.soldeOuverture,
          soldeActuel: session.soldeActuel,
          ouvertLe: session.ouvertLe,
        },
        recap,
        mouvements,
      };
    }),

  getBalance: caisseProcedure
    .input(z.object({ caisseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const caisseId = Number(input.caisseId);
      await CaisseService.verifierAcces(caisseId, ctx.user.id);
      const [caisse] = await db.select({
        id: caisses.id,
        libelle: caisses.libelle,
        soldeOuverture: sessionsCaisse.soldeOuverture,
        soldeActuel: sessionsCaisse.soldeActuel,
        statut: sessionsCaisse.statut,
        dateOuverture: sessionsCaisse.ouvertLe,
      }).from(caisses)
      .leftJoin(sessionsCaisse, and(eq(sessionsCaisse.caisseId, caisses.id), eq(sessionsCaisse.statut, "ouverte")))
      .where(
        and(eq(caisses.id, caisseId), eq(caisses.agenceId, ctx.user.agenceId))
      ).limit(1);
      if (!caisse) throw createBusinessError("NOT_FOUND", "Caisse non trouvée");

      const [entrees] = await db.select({
        total: sql`COALESCE(SUM(CAST(${mouvementsCaisse.montant} AS numeric)), 0)`,
      }).from(mouvementsCaisse).where(
        and(eq(mouvementsCaisse.caisseId, caisseId), eq(mouvementsCaisse.type, "entree"))
      );

      const [sorties] = await db.select({
        total: sql`COALESCE(SUM(CAST(${mouvementsCaisse.montant} AS numeric)), 0)`,
      }).from(mouvementsCaisse).where(
        and(eq(mouvementsCaisse.caisseId, caisseId), eq(mouvementsCaisse.type, "sortie"))
      );

      // Nouveau: total ventes et dépenses pour le récap
      const [totalVentes] = await db.select({
        total: sql`COALESCE(SUM(CAST(${mouvementsCaisse.montant} AS numeric)), 0)`,
      }).from(mouvementsCaisse).where(
        and(eq(mouvementsCaisse.caisseId, caisseId), eq(mouvementsCaisse.type, "vente"))
      );

      const [totalDepenses] = await db.select({
        total: sql`COALESCE(SUM(CAST(${mouvementsCaisse.montant} AS numeric)), 0)`,
      }).from(mouvementsCaisse).where(
        and(eq(mouvementsCaisse.caisseId, caisseId), eq(mouvementsCaisse.type, "depense"))
      );

      return {
        ...caisse,
        totalEntrees: String(entrees?.total ?? "0"),
        totalSorties: String(sorties?.total ?? "0"),
        totalVentes: String(totalVentes?.total ?? "0"),
        totalDepenses: String(totalDepenses?.total ?? "0"),
      };
    }),

  listClosedSessions: caisseProcedure
    .input(z.object({
      caisseId: z.string(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const caisseId = Number(input.caisseId);
      await CaisseService.verifierAcces(caisseId, ctx.user.id);

      const totalResult = await db.select({
        count: sql`COUNT(*)`,
      }).from(sessionsCaisse)
        .where(and(eq(sessionsCaisse.caisseId, caisseId), eq(sessionsCaisse.statut, "fermee")));

      const rows = await db.select({
        id: sessionsCaisse.id,
        caisseId: sessionsCaisse.caisseId,
        ouvertPar: sessionsCaisse.ouvertPar,
        fermePar: sessionsCaisse.fermePar,
        soldeOuverture: sessionsCaisse.soldeOuverture,
        soldeActuel: sessionsCaisse.soldeActuel,
        soldeCompteFermeture: sessionsCaisse.soldeCompteFermeture,
        ecart: sessionsCaisse.ecart,
        ouvertLe: sessionsCaisse.ouvertLe,
        fermeLe: sessionsCaisse.fermeLe,
      }).from(sessionsCaisse)
        .where(and(eq(sessionsCaisse.caisseId, caisseId), eq(sessionsCaisse.statut, "fermee")))
        .orderBy(desc(sessionsCaisse.fermeLe))
        .limit(input.limit)
        .offset(input.offset);

      return {
        sessions: rows.map(s => ({
          id: String(s.id),
          soldeOuverture: s.soldeOuverture,
          soldeActuel: s.soldeActuel,
          soldeFermeture: s.soldeCompteFermeture,
          ecart: s.ecart ?? "0",
          ouvertLe: s.ouvertLe,
          fermeLe: s.fermeLe,
        })),
        total: Number(totalResult[0]?.count ?? 0),
      };
    }),

  getClosedSessionDetail: caisseProcedure
    .input(z.object({
      caisseId: z.string(),
      sessionId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const caisseId = Number(input.caisseId);
      await CaisseService.verifierAcces(caisseId, ctx.user.id);

      const [session] = await db.select().from(sessionsCaisse)
        .where(and(
          eq(sessionsCaisse.id, Number(input.sessionId)),
          eq(sessionsCaisse.caisseId, caisseId),
        )).limit(1);
      if (!session) throw createBusinessError("NOT_FOUND", "Session non trouvée");

      const recap = await getRecapMouvements(caisseId);

      const mouvements = await db.select({
        id: mouvementsCaisse.id,
        type: mouvementsCaisse.type,
        montant: mouvementsCaisse.montant,
        motif: mouvementsCaisse.motif,
        reference: mouvementsCaisse.reference,
        entiteType: mouvementsCaisse.entiteType,
        entiteId: mouvementsCaisse.entiteId,
        categorieDepense: mouvementsCaisse.categorieDepense,
        createdAt: mouvementsCaisse.createdAt,
      }).from(mouvementsCaisse)
        .where(eq(mouvementsCaisse.caisseId, caisseId))
        .orderBy(desc(mouvementsCaisse.createdAt))
        .limit(100);

      return {
        session: {
          id: String(session.id),
          soldeOuverture: session.soldeOuverture,
          soldeActuel: session.soldeActuel,
          soldeFermeture: session.soldeCompteFermeture,
          ecart: session.ecart ?? "0",
          ouvertLe: session.ouvertLe,
          fermeLe: session.fermeLe,
        },
        recap,
        mouvements,
      };
    }),

  closeDay: caisseProcedure
    .input(z.object({
      caisseId: z.string(),
      soldeReel: z.number().min(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const caisseId = Number(input.caisseId);
      await CaisseService.verifierPermission(caisseId, ctx.user.id, "peutFermer");

      const result = await CaisseService.fermerSession({
        caisseId,
        userId: ctx.user.id,
        soldeReel: input.soldeReel,
      });

      return { success: true, ecart: result.ecart };
    }),

  // ─── Transferts entre caisses ───
  listTransferts: caisseProcedure
    .input(z.object({
      caisseSourceId: z.number().optional(),
      caisseDestId: z.number().optional(),
      statut: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(transfertsCaisses.agenceId, ctx.user.agenceId)];
      if (input.caisseSourceId) conditions.push(eq(transfertsCaisses.caisseSourceId, input.caisseSourceId));
      if (input.caisseDestId) conditions.push(eq(transfertsCaisses.caisseDestId, input.caisseDestId));
      if (input.statut) conditions.push(eq(transfertsCaisses.statut, input.statut));

      return db.select()
        .from(transfertsCaisses)
        .where(and(...conditions))
        .orderBy(desc(transfertsCaisses.createdAt));
    }),

  createTransfert: caisseProcedure
    .input(z.object({
      caisseSourceId: z.number(),
      caisseDestId: z.number(),
      montant: z.number().min(1),
      motif: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const [source] = await db.select().from(caisses)
        .where(and(eq(caisses.id, input.caisseSourceId), eq(caisses.agenceId, agenceId))).limit(1);
      if (!source) throw createBusinessError("NOT_FOUND", "Caisse source non trouvée");

      const [dest] = await db.select().from(caisses)
        .where(and(eq(caisses.id, input.caisseDestId), eq(caisses.agenceId, agenceId))).limit(1);
      if (!dest) throw createBusinessError("NOT_FOUND", "Caisse destination non trouvée");
      if (input.caisseSourceId === input.caisseDestId) throw createBusinessError("VALIDATION", "Les caisses doivent être différentes");

      // Vérifier session ouverte sur la caisse source
      const [session] = await db.select({ id: sessionsCaisse.id, soldeActuel: sessionsCaisse.soldeActuel })
        .from(sessionsCaisse)
        .where(and(eq(sessionsCaisse.caisseId, input.caisseSourceId), eq(sessionsCaisse.statut, "ouverte")))
        .limit(1);
      if (!session) throw createBusinessError("NOT_FOUND", "Aucune session ouverte sur la caisse source");

      const soldeActuel = Number(session.soldeActuel ?? 0);
      if (soldeActuel < input.montant) throw createBusinessError("VALIDATION", "Solde insuffisant dans la caisse source");

      const ref = `TRF-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      await CaisseService.enregistrerMouvementComplet({
        caisseId: input.caisseSourceId,
        agenceId,
        type: "sortie",
        montant: input.montant,
        motif: `Transfert vers caisse #${input.caisseDestId}: ${input.motif}`,
        reference: ref,
        effectuePar: ctx.user.id,
      });

      await CaisseService.enregistrerMouvementComplet({
        caisseId: input.caisseDestId,
        agenceId,
        type: "entree",
        montant: input.montant,
        motif: `Transfert depuis caisse #${input.caisseSourceId}: ${input.motif}`,
        reference: ref,
        effectuePar: ctx.user.id,
      });

      const [transfert] = await db.insert(transfertsCaisses).values({
        reference: ref,
        agenceId,
        caisseSourceId: input.caisseSourceId,
        caisseDestId: input.caisseDestId,
        montant: String(input.montant),
        motif: input.motif,
        statut: "effectue",
        effectuePar: ctx.user.id,
      } as any).returning() as any;

      return { id: String(transfert.id), reference: ref };
    }) as any,
});
