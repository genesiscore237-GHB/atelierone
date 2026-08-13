import { z } from "zod";
import { createTRPCRouter, posProcedure, stockProcedure, caisseProcedure, adminProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, agences, ventes, ventesLignes, produits, stocks, clients, caisses, mouvementsCaisse, auditLogs, mouvementsStock, sessionsCaisse, paiements, caisseOperateurs, produitUnites, unitesMesure, utilisateurs } from "@atelierone/db";
import { eq, and, or, ilike, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createBusinessError } from "~/server/lib/errors";
import { CaisseService } from "~/server/lib/caisse-service";
import { SaleService } from "~/server/lib/sale-service";
import { getFacteurVersBase } from "~/server/lib/stock-engine";

async function loadProductUnits(produitIds: number[]) {
  if (produitIds.length === 0) return new Map<number, any[]>();
  const rows = await db.select({
    produitId: produitUnites.produitId,
    uniteId: produitUnites.uniteId,
    facteurVersBase: produitUnites.facteurVersBase,
    prixVente: produitUnites.prixVente,
    estUniteVenteDefaut: produitUnites.estUniteVenteDefaut,
    estUniteBase: produitUnites.estUniteBase,
    libelle: unitesMesure.libelle,
    symbole: unitesMesure.symbole,
  })
    .from(produitUnites)
    .innerJoin(unitesMesure, eq(produitUnites.uniteId, unitesMesure.id))
    .where(and(
      eq(produitUnites.statut, "ACTIF"),
      inArray(produitUnites.produitId, produitIds),
    ));
  const map = new Map<number, any[]>();
  for (const r of rows) {
    if (!r.produitId) continue;
    const list = map.get(r.produitId) ?? [];
    list.push({
      uniteId: r.uniteId,
      libelle: r.libelle,
      symbole: r.symbole,
      facteurVersBase: Number(r.facteurVersBase ?? 1),
      prixVente: r.prixVente ? Number(r.prixVente) : null,
      estUniteVenteDefaut: r.estUniteVenteDefaut,
      estUniteBase: r.estUniteBase,
    });
    map.set(r.produitId, list);
  }
  return map;
}

export const posRouter = createTRPCRouter({
  getOpenSession: posProcedure
    .input(z.object({ caisseId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions: any[] = [eq(sessionsCaisse.statut, "ouverte"), eq(caisses.agenceId, agenceId)];
      if (input.caisseId) conditions.push(eq(sessionsCaisse.caisseId, Number(input.caisseId)));
      const [session] = await db.select({
        id: sessionsCaisse.id,
        caisseId: sessionsCaisse.caisseId,
        agenceId: caisses.agenceId,
        libelle: caisses.libelle,
        soldeOuverture: sessionsCaisse.soldeOuverture,
        soldeActuel: sessionsCaisse.soldeActuel,
        dateOuverture: sessionsCaisse.ouvertLe,
        dateFermeture: sessionsCaisse.fermeLe,
        statut: sessionsCaisse.statut,
        ouvertPar: sessionsCaisse.ouvertPar,
        fermePar: sessionsCaisse.fermePar,
        notes: caisses.notes,
        createdAt: sessionsCaisse.createdAt,
      }).from(sessionsCaisse)
      .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
      .where(and(...conditions)).limit(1);
    if (!session) return null;
    return {
      id: String(session.id),
      caisseId: String(session.caisseId),
      libelle: session.libelle,
      soldeOuverture: session.soldeOuverture,
      soldeActuel: session.soldeActuel,
      dateOuverture: session.dateOuverture,
      dateFermeture: session.dateFermeture,
      statut: session.statut,
      ouvertPar: session.ouvertPar,
      fermePar: session.fermePar,
      notes: session.notes,
      createdAt: session.createdAt,
      status: session.statut,
      openingBalance: Number(session.soldeOuverture ?? 0),
      openedAt: session.dateOuverture?.toISOString(),
      registerId: String(session.id),
      siteId: null,
      registers: [],
    };
  }),

  openSession: requirePermissionProcedure("caisse.ouvrir")
    .input(z.object({
      libelle: z.string().min(1).optional(),
      soldeOuverture: z.number().min(0).optional(),
      openingBalance: z.number().min(0).optional(),
      cashRegisterId: z.string().optional(),
      caisseId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const userId = ctx.user.id;
      const effectiveSolde = input.soldeOuverture ?? input.openingBalance ?? 0;

      let caisseId: number | null = null;
      let existing: any[] = [];

      if (input.caisseId) {
        caisseId = Number(input.caisseId);
        const [caisse] = (await (db as any).select().from(caisses)
          .where(and(eq(caisses.id, caisseId), eq(caisses.agenceId, agenceId), eq(caisses.actif, true)))
          .limit(1)) as any[];
        if (!caisse) throw new TRPCError({ code: "NOT_FOUND", message: "Caisse non trouvée ou désactivée" });

        existing = (await (db as any).select().from(sessionsCaisse)
          .where(and(eq(sessionsCaisse.caisseId, caisseId), eq(sessionsCaisse.statut, "ouverte")))
          .limit(1)) as any[];
        if (existing.length > 0) {
          throw createBusinessError("CASH_SESSION_ALREADY_OPEN");
        }

        const existingRows: any[] = await db.execute(
          sql`SELECT id FROM caisse_operateurs WHERE caisse_id = ${caisseId} AND user_id = ${userId} LIMIT 1`
        );
        const existingOp = existingRows[0];
        const isGestionnaire = ctx.user.role === "superadmin" || ctx.user.role === "directeur";
        if (existingOp) {
          await CaisseService.verifierPermission(Number(caisseId), Number(userId), "peutOuvrir");
        } else if (isGestionnaire) {
          await db.insert(caisseOperateurs).values({
            caisseId,
            userId,
            peutOuvrir: true,
            peutFermer: true,
            peutDepenser: true,
            peutVoirMouvements: true,
          } as any);
        } else {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Vous n'êtes pas assigné à cette caisse. Demandez à votre admin ou chef d'agence de vous y assigner.",
          });
        }
      } else {
        existing = await db.select().from(sessionsCaisse)
          .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
          .where(
            and(eq(sessionsCaisse.statut, "ouverte"), eq(caisses.agenceId, agenceId))
          ).limit(1);
        if (existing.length > 0) {
          throw createBusinessError("CASH_SESSION_ALREADY_OPEN");
        }

        const [caisse] = await db.select().from(caisses)
          .where(and(eq(caisses.agenceId, agenceId), eq(caisses.actif, true))).limit(1);
        if (!caisse) {
          const [newCaisse] = await db.insert(caisses).values({
            agenceId: agenceId,
            libelle: input.libelle ?? `Caisse ${agenceId}`,
          }).returning({ id: caisses.id }) as any;
          caisseId = Number(newCaisse.id);
          const [existingOp] = await db.select({ id: caisseOperateurs.id }).from(caisseOperateurs)
            .where(and(eq(caisseOperateurs.caisseId, caisseId), eq(caisseOperateurs.userId, userId)))
            .limit(1);
          if (!existingOp) {
            await db.insert(caisseOperateurs).values({
              caisseId,
              userId,
              peutOuvrir: true,
              peutFermer: true,
              peutDepenser: true,
              peutVoirMouvements: true,
            });
          }
        } else {
          caisseId = caisse.id;
          const [existingOp] = await db.select({ id: caisseOperateurs.id }).from(caisseOperateurs)
            .where(and(eq(caisseOperateurs.caisseId, caisseId), eq(caisseOperateurs.userId, userId)))
            .limit(1);
          const isGestionnaire = ctx.user.role === "superadmin" || ctx.user.role === "directeur";
          if (existingOp) {
            await CaisseService.verifierPermission(caisseId, userId, "peutOuvrir");
          } else if (isGestionnaire) {
            await db.insert(caisseOperateurs).values({
              caisseId,
              userId,
              peutOuvrir: true,
              peutFermer: true,
              peutDepenser: true,
              peutVoirMouvements: true,
            });
          } else {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Vous n'êtes pas assigné à cette caisse. Demandez à votre admin ou chef d'agence de vous y assigner.",
            });
          }
        }
      }

      const [session] = await db.insert(sessionsCaisse).values({
        caisseId: Number(caisseId),
        ouvertPar: ctx.user.id,
        statut: "ouverte",
        soldeOuverture: String(effectiveSolde),
        soldeActuel: String(effectiveSolde),
        ouvertLe: new Date(),
      }).returning({
        id: sessionsCaisse.id,
        statut: sessionsCaisse.statut,
        soldeOuverture: sessionsCaisse.soldeOuverture,
      }) as any;
      return { id: String(session.id), statut: session.statut, soldeOuverture: session.soldeOuverture };
    }) as any,

  closeSession: requirePermissionProcedure("caisse.fermer")
    .input(z.object({
      caisseId: z.string().optional(),
      soldeFermeture: z.number().min(0).optional(),
      closingBalance: z.number().min(0).optional(),
      notes: z.string().optional(),
      sessionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const inputId = input.caisseId ?? input.sessionId;
      if (!inputId) throw new TRPCError({ code: "BAD_REQUEST", message: "ID caisse ou session requis." });
      const effectiveSoldeFermeture = input.soldeFermeture ?? input.closingBalance ?? 0;

      let caisseId = Number(inputId);
      if (input.caisseId) {
        const [caisse] = await db.select({ id: caisses.id }).from(caisses)
          .where(and(eq(caisses.id, caisseId), eq(caisses.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!caisse) throw new TRPCError({ code: "NOT_FOUND", message: "Caisse non trouvée" });
      } else {
        const [session] = await db.select({ caisseId: sessionsCaisse.caisseId }).from(sessionsCaisse)
          .where(eq(sessionsCaisse.id, caisseId)).limit(1) as any;
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session non trouvée" });
        caisseId = session.caisseId;
      }

      await CaisseService.verifierPermission(caisseId, ctx.user.id, "peutFermer");

      const result = await CaisseService.fermerSession({
        caisseId,
        userId: ctx.user.id,
        soldeReel: effectiveSoldeFermeture,
      });
      return { success: true, ecart: result.ecart };
    }) as any,

  createSale: requirePermissionProcedure("pos.vente.creer")
    .input(z.object({
      clientId: z.string().optional(),
      customerId: z.string().optional(),
      modePaiement: z.enum(["especes", "carte", "mobile_money", "credit"]).default("especes"),
      lignes: z.array(z.object({
        produitId: z.string(),
        quantite: z.number().int().min(1),
        prixUnitaire: z.number().min(0),
        uniteId: z.string().optional(),
        facteurConversion: z.number().default(1),
      })).min(1),
      remise: z.number().min(0).default(0),
      montantPaye: z.number().min(0).optional(),
      notes: z.string().optional(),
      siteId: z.string().optional(),
      caisseId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const sessionConditions: any[] = [eq(sessionsCaisse.statut, "ouverte")];
      if (input.caisseId) {
        sessionConditions.push(eq(sessionsCaisse.caisseId, Number(input.caisseId)));
      } else {
        sessionConditions.push(eq(caisses.agenceId, agenceId));
      }
      const [caisse] = await db.select({ id: caisses.id }).from(sessionsCaisse)
        .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
        .where(and(...sessionConditions))
        .limit(1) as any;
      if (!caisse) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune caisse ouverte" });

      const { SaleService } = await import("~/server/lib/sale-service");
      return SaleService.createSale({
        agenceId,
        operateurId: ctx.user.id,
        operateurRole: ctx.user.role,
        caisseId: input.caisseId ? Number(input.caisseId) : undefined,
        clientId: (input.clientId ?? input.customerId) ? Number(input.clientId ?? input.customerId) : null,
        modePaiement: input.modePaiement || "especes",
        remise: input.remise ? String(input.remise) : "0",
        montantPaye: input.montantPaye ? String(input.montantPaye) : undefined,
        lignes: (input.lignes || []).map(l => ({
          produitId: Number(l.produitId),
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          uniteId: l.uniteId,
          facteurConversion: l.facteurConversion ?? 1,
        })),
      });
    }),

  searchProducts: posProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const pattern = `%${input.query}%`;

      const rows = await db.select({
        id: produits.id,
        codeBarre: produits.codeBarre,
        titre: produits.titre,
        editeur: produits.editeur,
        prixVente: produits.prixVente,
        prixMinimumVente: produits.prixMinimumVente,
        typeProduit: produits.typeProduit,
        stock: stocks.quantite,
      })
      .from(produits)
      .leftJoin(stocks, and(eq(stocks.produitId, produits.id), eq(stocks.agenceId, agenceId)))
      .where(
        and(
          eq(produits.isActive, true),
          eq(produits.statutCycleVie, "ACTIF"),
          or(
            ilike(produits.titre, pattern),
            ilike(produits.codeBarre, pattern),
            ilike(produits.titre, pattern),
            ilike(produits.codeBarre, pattern),
          )
        )
      )
      .limit(input.limit);
      const unitsMap = await loadProductUnits(rows.map(r => r.id).filter((id): id is number => id != null));
      return rows.map(p => ({
        id: String(p.id),
        codeBarre: p.codeBarre,
        titre: p.titre,
        editeur: p.editeur,
        prixVente: p.prixVente,
        prixMinimumVente: p.prixMinimumVente ? Number(p.prixMinimumVente) : null,
        typeProduit: p.typeProduit,
        stock: p.stock,
        name: p.titre,
        title: p.titre,
        sku: p.codeBarre ?? '',
        barcode: p.codeBarre ?? '',
        defaultPrice: Number(p.prixVente),
        salePrice: Number(p.prixVente),
        editeur: p.editeur ?? '',
        unites: unitsMap.get(p.id) ?? [],
      }));
    }),

  searchCustomers: posProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.query}%`;
      const rows = await db.select()
        .from(clients)
        .where(
          and(
            eq(clients.isActive, true),
            eq(clients.agenceId, ctx.user.agenceId),
            or(
              ilike(clients.nom, pattern),
              ilike(clients.prenom, pattern),
              ilike(clients.telephone, pattern),
            )
          )
        )
        .limit(input.limit);
      return rows.map(c => ({
        id: String(c.id),
        nom: c.nom,
        prenom: c.prenom,
        telephone: c.telephone,
        email: c.email,
        adresse: c.adresse,
        codeClient: c.codeClient,
        agenceId: c.agenceId,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        name: `${c.prenom ?? ""} ${c.nom}`.trim(),
        fullName: `${c.prenom ?? ""} ${c.nom}`.trim(),
        phone: c.telephone,
      }));
    }),

  suspendSale: requirePermissionProcedure("pos.vente.creer")
    .input(z.object({
      clientId: z.string().optional(),
      lignes: z.array(z.object({
        produitId: z.string(),
        quantite: z.number().int().min(1),
        prixUnitaire: z.number().min(0),
      })).min(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const userId = ctx.user.id;

      const ref = `SUSP-${Date.now()}`;
      const [vente] = await db.insert(ventes).values({
        agenceId: ctx.user.agenceId,
        reference: ref,
        operateurId: ctx.user.id,
        clientId: input.clientId ? Number(input.clientId) : null,
        statut: "suspendue",
        notes: input.notes || null,
      }).returning() as any;
      if (input.lignes) {
        for (const ligne of input.lignes) {
          await db.insert(ventesLignes).values({
            venteId: vente.id,
            produitId: Number(ligne.produitId),
            quantite: Number(ligne.quantite || 1),
            prixUnitaire: String(ligne.prixUnitaire || 0),
            totalLigne: String(Number(ligne.quantite || 1) * Number(ligne.prixUnitaire || 0)),
          }) as any;
        }
      }
      return { id: String(vente.id), reference: ref };
    }) as any,

  getSuspendedSales: posProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;
    const rows = await db.select()
      .from(ventes)
      .where(and(eq(ventes.agenceId, agenceId), eq(ventes.statut, "suspendue")))
      .orderBy(desc(ventes.createdAt));
    return rows.map(v => ({
      id: String(v.id),
      reference: v.reference,
      agenceId: v.agenceId,
      operateurId: v.operateurId,
      clientId: v.clientId,
      modePaiement: v.modePaiement,
      montantTotal: v.montantTotal,
      remise: v.remise,
      montantPaye: v.montantPaye,
      statut: v.statut,
      notes: v.notes,
      createdAt: v.createdAt,
      saleNumber: v.reference,
      totalAmount: Number(v.montantTotal),
      status: v.statut,
    }));
  }),

  resumeSale: posProcedure
    .input(z.object({ venteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [vente] = await db.select().from(ventes).where(
        and(eq(ventes.id, input.venteId), eq(ventes.agenceId, agenceId))
      ).limit(1);
      if (!vente) throw createBusinessError("NOT_FOUND", "Vente non trouvée");

      const lignes = await db.select({
        id: ventesLignes.id,
        venteId: ventesLignes.venteId,
        produitId: ventesLignes.produitId,
        quantite: ventesLignes.quantite,
        prixUnitaire: ventesLignes.prixUnitaire,
        totalLigne: ventesLignes.totalLigne,
        uniteId: ventesLignes.uniteId,
        produitNom: produits.titre,
      }).from(ventesLignes)
        .leftJoin(produits, eq(ventesLignes.produitId, produits.id))
        .where(eq(ventesLignes.venteId, input.venteId));
      return {
        vente: {
          id: String(vente.id),
          reference: vente.reference,
          agenceId: vente.agenceId,
          operateurId: vente.operateurId,
          clientId: vente.clientId,
          modePaiement: vente.modePaiement,
          montantTotal: vente.montantTotal,
          remise: vente.remise,
          montantPaye: vente.montantPaye,
          statut: vente.statut,
          notes: vente.notes,
          createdAt: vente.createdAt,
          saleNumber: vente.reference,
          totalAmount: Number(vente.montantTotal),
          status: vente.statut,
        },
        lignes: lignes.map(l => ({
          id: String(l.id),
          venteId: String(l.venteId),
          produitId: String(l.produitId),
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          totalLigne: l.totalLigne,
          total: l.totalLigne,
          productId: String(l.produitId),
          productName: l.produitNom ?? `Article #${String(l.produitId).substring(0, 8)}`,
          quantity: l.quantite,
          unitPrice: Number(l.prixUnitaire),
        })),
      };
    }),

  listProductsWithStock: posProcedure
    .input(z.object({
      query: z.string().default(""),
      limit: z.number().int().min(1).max(200).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions = [eq(produits.isActive, true), eq(produits.statutCycleVie, "ACTIF")];

      if (input.query) {
        const pattern = `%${input.query}%`;
        conditions.push(
          or(
            ilike(produits.titre, pattern),
            ilike(produits.codeBarre, pattern),
            ilike(produits.titre, pattern),
            ilike(produits.codeBarre, pattern),
          )
        );
      }

      const rows = await db.select({
        id: produits.id,
        codeBarre: produits.codeBarre,
        titre: produits.titre,
        editeur: produits.editeur,
        prixVente: produits.prixVente,
        prixMinimumVente: produits.prixMinimumVente,
        typeProduit: produits.typeProduit,
        seuilAlerte: produits.seuilAlerte,
        stock: stocks.quantite,
      })
        .from(produits)
        .leftJoin(stocks, and(eq(stocks.produitId, produits.id), eq(stocks.agenceId, agenceId)))
        .where(and(...conditions))
        .orderBy(desc(produits.createdAt))
        .limit(input.limit);

      const unitsMap = await loadProductUnits(rows.map(p => p.id).filter((id): id is number => id != null));
      return rows.map(p => ({
        id: String(p.id),
        codeBarre: p.codeBarre,
        titre: p.titre,
        editeur: p.editeur,
        prixVente: p.prixVente,
        prixMinimumVente: p.prixMinimumVente ? Number(p.prixMinimumVente) : null,
        typeProduit: p.typeProduit,
        seuilAlerte: p.seuilAlerte,
        stock: p.stock,
        name: p.titre,
        sku: p.codeBarre ?? "",
        defaultPrice: Number(p.prixVente),
        salePrice: Number(p.prixVente),
        editeur: p.editeur ?? "",
        unites: unitsMap.get(p.id) ?? [],
      }));
    }),

  registers: posProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;
    const rows = await db
      .select({
        id: caisses.id,
        libelle: caisses.libelle,
        statut: sessionsCaisse.statut,
        soldeOuverture: sessionsCaisse.soldeOuverture,
        soldeActuel: sessionsCaisse.soldeActuel,
        ouvertLe: sessionsCaisse.ouvertLe,
      })
      .from(caisses)
      .leftJoin(sessionsCaisse, and(eq(sessionsCaisse.caisseId, caisses.id), eq(sessionsCaisse.statut, "ouverte")))
      .where(eq(caisses.agenceId, agenceId));
    return rows.map(c => ({
      id: String(c.id),
      name: c.libelle,
      code: String(c.id),
      status: c.statut ?? "fermee",
      openingBalance: Number(c.soldeOuverture ?? 0),
      currentBalance: Number(c.soldeActuel ?? 0),
      openedAt: c.ouvertLe?.toISOString(),
    }));
  }),

  // ─── Pré-facture (POS pur, pas d'argent) ───
  createPreInvoice: requirePermissionProcedure("pos.vente.creer")
    .input(z.object({
      clientId: z.string().optional(),
      lignes: z.array(z.object({
        produitId: z.string(),
        quantite: z.number().int().min(1),
        prixUnitaire: z.number().min(0),
        uniteId: z.string().optional(),
        facteurConversion: z.number().default(1),
      })).min(1),
      remise: z.number().min(0).default(0),
      notes: z.string().optional(),
      caisseId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const userId = ctx.user.id;

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const suffix = String(Date.now()).slice(-6);
      const [agenceRow] = await db.select({ prefixeFacture: agences.prefixeFacture }).from(agences).where(eq(agences.id, agenceId)).limit(1);
      const reference = `${agenceRow?.prefixeFacture ?? "PF"}-${year}${month}${day}-${suffix}`;

      const montantTotal = input.lignes.reduce((sum, l) => sum + l.prixUnitaire * l.quantite, 0);

      const produitIds = [...new Set(input.lignes.map(l => Number(l.produitId)))];
      const pmvRows = await db.select({
        id: produits.id,
        titre: produits.titre,
        prixMinimumVente: produits.prixMinimumVente,
      })
        .from(produits)
        .where(inArray(produits.id, produitIds));
      const pmvMap = new Map(pmvRows.map(p => [p.id, p]));
      const violations = input.lignes
        .filter((ligne) => {
          const p = pmvMap.get(Number(ligne.produitId));
          return p && p.prixMinimumVente != null && ligne.prixUnitaire < Number(p.prixMinimumVente);
        })
        .map((ligne) => {
          const p = pmvMap.get(Number(ligne.produitId))!;
          return `${p.titre} : ${ligne.prixUnitaire} F (PMV ${p.prixMinimumVente} F)`;
        });
      if (violations.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Prix en dessous du prix minimum de vente (PMV) : ${violations.join(" ; ")}`,
        });
      }

      // Contrôle de stock : une pré-facture ne débouche que sur une vente qui devra être encaissée
      const stockRows = await db.select({
        produitId: stocks.produitId,
        quantite: stocks.quantite,
        quantiteReservee: stocks.quantiteReservee,
      })
        .from(stocks)
        .where(and(eq(stocks.agenceId, agenceId), inArray(stocks.produitId, produitIds)));
      const stockMap = new Map(stockRows.map(s => [s.produitId, s]));
      const stockErrors: string[] = [];
      for (const ligne of input.lignes) {
        const pid = Number(ligne.produitId);
        let facteur = Number(ligne.facteurConversion ?? 0);
        if (facteur <= 1 && ligne.uniteId) {
          facteur = await getFacteurVersBase(db as any, pid, ligne.uniteId);
        }
        if (facteur <= 1) facteur = 1;
        const qteBase = ligne.quantite * facteur;
        const s = stockMap.get(pid);
        const dispo = s ? Number(s.quantite ?? 0) - Number(s.quantiteReservee ?? 0) : 0;
        if (dispo < qteBase) {
          const [p] = pmvRows.find(x => x.id === pid) ? [pmvRows.find(x => x.id === pid)!] : [{ titre: `#${pid}` }];
          stockErrors.push(`${p.titre} : dispo ${Math.max(0, dispo)}, requis ${qteBase}`);
        }
      }
      if (stockErrors.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Stock insuffisant pour générer la pré-facture : ${stockErrors.join(" ; ")}`,
        });
      }

      return db.transaction(async (tx) => {
        const sessionConditions: any[] = [eq(sessionsCaisse.statut, "ouverte")];
        if (input.caisseId) {
          sessionConditions.push(eq(sessionsCaisse.caisseId, Number(input.caisseId)));
        } else {
          sessionConditions.push(eq(caisses.agenceId, agenceId));
        }
        const [openSession] = await tx.select({ id: sessionsCaisse.id }).from(sessionsCaisse)
          .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
          .where(and(...sessionConditions))
          .limit(1) as any;

        const [preInvoice] = await tx.insert(ventes).values({
          agenceId: agenceId,
          reference: reference,
          operateurId: Number(userId),
          clientId: input.clientId ? Number(input.clientId) : null,
          statut: "pre_facture",
          montantTotal: String(montantTotal),
          remise: input.remise ? String(input.remise) : "0",
          notes: input.notes || null,
          sessionCaisseId: openSession?.id ?? null,
        }).returning();

        const lignesData = (input.lignes || []).map((ligne) => {
          const pu = String(ligne.prixUnitaire || 0);
          const qte = Number(ligne.quantite || 1);
          const total = qte * Number(pu);
          return {
            venteId: preInvoice.id,
            produitId: Number(ligne.produitId),
            quantite: qte,
            uniteId: ligne.uniteId || null,
            facteurConversion: ligne.facteurConversion || 1,
            prixUnitaire: pu,
            totalLigne: String(total),
          };
        });

        if (lignesData.length > 0) {
          await tx.insert(ventesLignes).values(lignesData);
        }

        const lignes = lignesData.map((l) => ({
          produitId: String(l.produitId),
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          total: l.totalLigne,
        }));

        return {
          id: String(preInvoice.id),
          reference: reference,
          clientId: preInvoice.clientId,
          montantTotal: preInvoice.montantTotal,
          remise: preInvoice.remise,
          statut: preInvoice.statut,
          notes: preInvoice.notes,
          createdAt: preInvoice.createdAt,
          lignes,
          operateurName: ctx.user.name,
          agenceName: ctx.user.agenceName,
        };
      });
    }),

  countPreInvoices: posProcedure
    .query(async ({ ctx }) => {
      const [row] = await db.select({
        count: sql<number>`COUNT(*)`,
      }).from(ventes)
        .where(and(eq(ventes.agenceId, ctx.user.agenceId), eq(ventes.statut, "pre_facture")));
      return { count: Number(row?.count ?? 0) };
    }),

  searchPreInvoices: posProcedure
    .input(z.object({
      query: z.string().default(""),
      statut: z.enum(["pre_facture", "termine", "annulee", "suspendue"]).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions: any[] = [eq(ventes.agenceId, agenceId)];
      if (input.statut) conditions.push(eq(ventes.statut, input.statut));
      if (input.query) {
        conditions.push(or(
          ilike(ventes.reference, `%${input.query}%`),
          ilike(ventes.notes, `%${input.query}%`),
          ilike(clients.nom, `%${input.query}%`),
          ilike(clients.prenom, `%${input.query}%`),
        ));
      }
      if (input.dateDebut) conditions.push(gte(ventes.createdAt, new Date(input.dateDebut)));
      if (input.dateFin) conditions.push(lte(ventes.createdAt, new Date(input.dateFin)));

      const rows = await db.select({
        id: ventes.id,
        reference: ventes.reference,
        clientId: ventes.clientId,
        nom: clients.nom,
        prenom: clients.prenom,
        montantTotal: ventes.montantTotal,
        remise: ventes.remise,
        statut: ventes.statut,
        notes: ventes.notes,
        modePaiement: ventes.modePaiement,
        createdAt: ventes.createdAt,
        operateurId: ventes.operateurId,
        operateurNom: utilisateurs.nom,
        operateurPrenom: utilisateurs.prenom,
        caisseId: caisses.id,
        caisseLibelle: caisses.libelle,
      })
        .from(ventes)
        .leftJoin(clients, eq(ventes.clientId, clients.id))
        .leftJoin(utilisateurs, eq(ventes.operateurId, utilisateurs.id))
        .leftJoin(sessionsCaisse, eq(ventes.sessionCaisseId, sessionsCaisse.id))
        .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
        .where(and(...conditions))
        .orderBy(desc(ventes.createdAt))
        .limit(input.limit);

      return rows.map(r => ({
        id: String(r.id),
        reference: r.reference,
        clientNom: r.nom ? `${r.prenom ?? ""} ${r.nom}`.trim() : "Client Divers",
        montantTotal: r.montantTotal,
        remise: r.remise,
        statut: r.statut,
        modePaiement: r.modePaiement,
        notes: r.notes,
        createdAt: r.createdAt,
        operateurId: r.operateurId ? String(r.operateurId) : null,
        operateurNom: r.operateurNom ? `${r.operateurPrenom ?? ""} ${r.operateurNom}`.trim() : null,
        caisseId: r.caisseId ? String(r.caisseId) : null,
        caisseLibelle: r.caisseLibelle ?? null,
      }));
    }),

  cancelPreInvoice: requirePermissionProcedure("pos.vente.annuler")
    .input(z.object({
      id: z.string(),
      motif: z.string().min(1, "Le motif est obligatoire"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [preInvoice] = await db.select().from(ventes).where(and(eq(ventes.id, Number(input.id)), eq(ventes.statut, "pre_facture"))).limit(1);
      if (!preInvoice) throw new TRPCError({ code: "NOT_FOUND", message: "Pré-facture non trouvée" });
      await db.update(ventes).set({
        statut: "annulee",
        notes: input.motif || "Annulation pré-facture",
      }).where(eq(ventes.id, preInvoice.id));
      return { success: true };
    }),

  payPreInvoice: requirePermissionProcedure("caisse.mouvement")
    .input(z.object({
      venteId: z.string(),
      modePaiement: z.enum(["especes", "carte", "mobile_money", "credit"]).default("especes"),
      montantPaye: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await SaleService.convertPrefactureToSale(
        Number(input.venteId),
        ctx.user.agenceId,
        {
          modePaiement: input.modePaiement,
          montantPaye: input.montantPaye ? String(input.montantPaye) : undefined,
          encaissePar: ctx.user.id,
        },
      );
      return { id: String(result.id), reference: result.reference, totalAmount: result.montantTotal, success: true };
    }),
});

