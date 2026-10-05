import { z } from "zod";
import { createTRPCRouter, financeProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, depenses, caisses, sessionsCaisse, mouvementsCaisse, ventes, clients, previsionsTresorerie, relances, dettesClients, paiements, pertesFinancieres } from "@atelierone/db";
import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { CaisseService } from "~/server/lib/caisse-service";
import { classerDette } from "~/server/lib/facturation-service";

const EXPENSE_CATEGORIES = ["Loyer", "Salaires", "Transport", "Fournitures", "Électricité", "Maintenance", "Divers"] as const;

export const financeRouter = createTRPCRouter({
  getBalance: financeProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;

    const caisseList = await db
      .select({
        id: caisses.id,
        libelle: caisses.libelle,
        soldeActuel: sessionsCaisse.soldeActuel,
      })
      .from(caisses)
      .innerJoin(sessionsCaisse, and(eq(sessionsCaisse.caisseId, caisses.id), eq(sessionsCaisse.statut, "ouverte")))
      .where(eq(caisses.agenceId, agenceId));

    const total = caisseList.reduce((sum, c) => sum + Number(c.soldeActuel ?? 0), 0);
    const accounts = caisseList.map(c => ({
      id: String(c.id),
      code: String(c.id),
      name: c.libelle,
      type: "CAISSE",
      totalDebit: Number(c.soldeActuel ?? 0),
      totalCredit: 0,
    }));

    return {
      caisses: caisseList.map(c => ({
        id: String(c.id),
        libelle: c.libelle,
        soldeActuel: c.soldeActuel,
        name: c.libelle,
        balance: Number(c.soldeActuel ?? 0),
      })),
      total,
      accounts,
      totalDebit: total,
      totalCredit: 0,
    };
  }),

  getExpenses: financeProcedure
    .input(z.object({
      category: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().default(100),
      offset: z.number().default(0),
    }).nullish())
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const conditions = [eq(depenses.agenceId, agenceId)];

      if (input?.category) {
        conditions.push(eq(depenses.categorie, input.category));
      }
      if (input?.dateFrom) {
        conditions.push(gte(depenses.dateDepense, new Date(input.dateFrom)));
      }
      if (input?.dateTo) {
        conditions.push(lte(depenses.dateDepense, new Date(input.dateTo)));
      }

      const rows = await db
        .select()
        .from(depenses)
        .where(and(...conditions))
        .orderBy(desc(depenses.dateDepense))
        .limit(input?.limit ?? 100)
        .offset(input?.offset ?? 0);

      return rows.map(e => ({
        ...e,
        id: String(e.id),
        date: e.dateDepense ?? new Date(),
        category: e.categorie,
        description: e.description,
        amount: Number(e.montant),
        paymentMethod: e.modePaiement ?? "",
        pos: null,
      }));
    }),

  addExpense: requirePermissionProcedure("comptabilite.depense.creer")
    .input(z.object({
      categorie: z.enum(EXPENSE_CATEGORIES),
      montant: z.number().positive(),
      description: z.string().optional(),
      modePaiement: z.enum(["especes", "carte", "momo", "om"]).default("especes"),
      dateDepense: z.string().optional(),
      fournisseurId: z.string().optional(),
      caisseId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      return db.transaction(async (tx) => {
        const caisseId = input.caisseId ?? (await CaisseService.trouverCaisseOuverte(agenceId, tx as any)).caisseId;

        const [depense] = await (tx as any).insert(depenses).values({
          agenceId,
          categorie: input.categorie,
          montant: String(input.montant),
          description: input.description || null,
          modePaiement: input.modePaiement,
          dateDepense: input.dateDepense ? new Date(input.dateDepense) : new Date(),
          fournisseurId: input.fournisseurId ? Number(input.fournisseurId) : null,
          caisseId,
          enregistrePar: Number(ctx.user.id),
        }).returning();

        await CaisseService.enregistrerFlux({
          caisseId,
          agenceId,
          type: "depense",
          montant: input.montant,
          motif: input.description || input.categorie,
          reference: `DEP-${depense.id}`,
          entiteType: "DEPENSE",
          entiteId: depense.id,
          categorieDepense: input.categorie,
          effectuePar: Number(ctx.user.id),
        }, tx as any);

        return { id: String(depense.id) };
      }) as any;
    }),

  getCashFlowSummary: financeProcedure
    .input(z.object({
      period: z.enum(["day", "week", "month"]).default("month"),
    }).nullish())
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const now = new Date();
      let startDate: Date;

      switch (input?.period ?? "month") {
        case "day":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week": {
          const dayOfWeek = now.getDay();
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
          break;
        }
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }

      const [salesResult] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${ventes.montantTotal}::numeric), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(ventes)
        .where(and(
          eq(ventes.agenceId, agenceId),
          gte(ventes.createdAt, startDate),
        ));

      const [expensesResult] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${depenses.montant}::numeric), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(depenses)
        .where(and(
          eq(depenses.agenceId, agenceId),
          gte(depenses.dateDepense, startDate),
        ));

      const expensesByCategory = await db
        .select({
          category: depenses.categorie,
          total: sql<number>`COALESCE(SUM(${depenses.montant}::numeric), 0)`,
        })
        .from(depenses)
        .where(and(
          eq(depenses.agenceId, agenceId),
          gte(depenses.dateDepense, startDate),
        ))
        .groupBy(depenses.categorie);

      const inflows = Number(salesResult?.total ?? 0);
      const outflows = Number(expensesResult?.total ?? 0);

      const fluxParType = await db
        .select({
          type: mouvementsCaisse.type,
          total: sql<number>`COALESCE(SUM(CAST(${mouvementsCaisse.montant} AS numeric)), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(mouvementsCaisse)
        .innerJoin(caisses, eq(mouvementsCaisse.caisseId, caisses.id))
        .where(and(
          eq(caisses.agenceId, agenceId),
          gte(mouvementsCaisse.createdAt, startDate),
        ))
        .groupBy(mouvementsCaisse.type);

      const [pertesResult] = await db
        .select({
          total: sql<number>`COALESCE(SUM(CAST(${pertesFinancieres.montantPerte} AS numeric)), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(pertesFinancieres)
        .where(and(
          eq(pertesFinancieres.agenceId, agenceId),
          gte(pertesFinancieres.datePerte, startDate),
        ));

      return {
        inflows,
        outflows,
        totalIncome: inflows,
        totalExpenses: outflows,
        netCashFlow: inflows - outflows,
        salesCount: Number(salesResult?.count ?? 0),
        expensesCount: Number(expensesResult?.count ?? 0),
        expensesByCategory,
        flux: {
          parType: Object.fromEntries(fluxParType.map(f => [f.type, { total: Number(f.total ?? 0), count: Number(f.count ?? 0) }])),
          entrees: fluxParType.filter(f => ["vente", "entree", "apport", "encaissement_dette"].includes(f.type)).reduce((s, f) => s + Number(f.total ?? 0), 0),
          sorties: fluxParType.filter(f => !["vente", "entree", "apport", "encaissement_dette"].includes(f.type)).reduce((s, f) => s + Number(f.total ?? 0), 0),
          pertes: Number(pertesResult?.total ?? 0),
          pertesCount: Number(pertesResult?.count ?? 0),
        },
      };
    }),

  getDebts: financeProcedure
    .input(z.object({
      status: z.enum(["UNPAID", "PARTIAL", "PAID", "OVERDUE"]).optional(),
      search: z.string().trim().max(120).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const status = input?.status;
      const search = input?.search?.trim().toLowerCase();

      // Le restant dû est une donnée financière réelle : montantTotal − montantPaye.
      // Les conditions SQL ne servent qu'à pré-filtrer ; le statut final est toujours
      // recalculé en mémoire à partir des montants réels de chaque vente.
      // Les ventes non définitives (annulée / pré-facture / brouillon) ne sont pas des créances.
      let whereConditions = [
        eq(ventes.agenceId, agenceId),
        sql`${ventes.statut} != 'annulee' AND ${ventes.statut} != 'pre_facture' AND ${ventes.statut} != 'brouillon'`,
      ];
      if (status === "PAID") {
        whereConditions.push(sql`COALESCE(${ventes.montantPaye}::numeric, 0) >= COALESCE(${ventes.montantTotal}::numeric, 0)`);
      } else if (status === "UNPAID") {
        whereConditions.push(sql`COALESCE(${ventes.montantPaye}::numeric, 0) <= 0`);
      } else if (status === "PARTIAL") {
        whereConditions.push(sql`COALESCE(${ventes.montantPaye}::numeric, 0) > 0 AND COALESCE(${ventes.montantPaye}::numeric, 0) < COALESCE(${ventes.montantTotal}::numeric, 0)`);
      } else {
        // OVERDUE ou vue par défaut : créances encore dues
        whereConditions.push(sql`COALESCE(${ventes.montantPaye}::numeric, 0) < COALESCE(${ventes.montantTotal}::numeric, 0)`);
      }

      const debtSales = await db
        .select({
          id: ventes.id,
          reference: ventes.reference,
          clientId: ventes.clientId,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientTelephone: clients.telephone,
          montantTotal: ventes.montantTotal,
          remise: ventes.remise,
          montantPaye: ventes.montantPaye,
          statut: ventes.statut,
          createdAt: ventes.createdAt,
        })
        .from(ventes)
        .leftJoin(clients, eq(ventes.clientId, clients.id))
        .where(and(...whereConditions))
        .orderBy(desc(ventes.createdAt));

      // Date d'échéance réelle issue de la table des créances (dettesClients)
      const dettesMap = new Map<number, { echeanceLe: Date | null }>();
      const venteIds = debtSales.map((s) => s.id);
      if (venteIds.length > 0) {
        const dettes = await db
          .select({ venteId: dettesClients.venteId, echeanceLe: dettesClients.echeanceLe })
          .from(dettesClients)
          .where(and(inArray(dettesClients.venteId, venteIds), eq(dettesClients.agenceId, agenceId)));
        for (const d of dettes) {
          const current = dettesMap.get(d.venteId);
          if (!current || (d.echeanceLe && (!current.echeanceLe || new Date(d.echeanceLe) > new Date(current.echeanceLe)))) {
            dettesMap.set(d.venteId, { echeanceLe: d.echeanceLe });
          }
        }
      }

      const aujourdhui = new Date();
      aujourdhui.setHours(0, 0, 0, 0);

      const debts = debtSales.map((s) => {
        const amount = Number(s.montantTotal ?? 0);
        const paid = Number(s.montantPaye ?? 0);
        const remaining = Math.max(0, amount - paid);
        const dueDate = dettesMap.get(s.id)?.echeanceLe ?? null;
        const computedStatus = classerDette(amount, paid, dueDate, aujourdhui);
        const isOverdue = computedStatus === "OVERDUE";

        const customerName = s.clientNom ? `${s.clientPrenom ?? ""} ${s.clientNom}`.trim() : "Client inconnu";
        return {
          id: String(s.id),
          venteId: s.id,
          reference: s.reference,
          amount,
          remaining,
          isOverdue,
          status: computedStatus,
          customerName,
          customerPhone: s.clientTelephone ?? null,
          dueDate,
          createdAt: s.createdAt ?? new Date(),
          // French aliases
          clientNom: customerName,
          clientTelephone: s.clientTelephone ?? null,
          montantTotal: amount,
          credit: Number(s.remise ?? 0),
          montantPaye: paid,
          restant: remaining,
          statut: computedStatus,
          date: s.createdAt,
        };
      });

      let result = status ? debts.filter((d) => d.status === status) : debts;
      if (search) {
        result = result.filter((d) =>
          (d.reference ?? "").toLowerCase().includes(search)
          || (d.customerName ?? "").toLowerCase().includes(search)
          || (d.customerPhone ?? "").toLowerCase().includes(search)
        );
      }
      return result;
    }),

  getLedger: financeProcedure
    .input(z.object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().default(100),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions = [eq(ventes.agenceId, agenceId)];

      if (input?.dateFrom) conditions.push(gte(ventes.createdAt, new Date(input.dateFrom)));
      if (input?.dateTo) conditions.push(lte(ventes.createdAt, new Date(input.dateTo)));

      const entries = await db
        .select({
          id: ventes.id,
          reference: ventes.reference,
          montantTotal: ventes.montantTotal,
          statut: ventes.statut,
          date: ventes.createdAt,
        })
        .from(ventes)
        .where(and(...conditions))
        .orderBy(desc(ventes.createdAt))
        .limit(input?.limit ?? 100)
        .offset(input?.offset ?? 0);

      return {
        entries: entries.map(e => ({
          id: String(e.id),
          date: e.date ?? new Date(),
          description: `Vente ${e.reference}`,
          referenceType: e.reference,
          totalDebit: Number(e.montantTotal),
          totalCredit: 0,
        })),
      };
    }),

  payDebt: requirePermissionProcedure("comptabilite.depense.creer")
    .input(z.object({
      venteId: z.string().optional(),
      debtId: z.string().optional(),
      montant: z.number().positive().optional(),
      amount: z.number().positive().optional(),
      modePaiement: z.enum(["especes", "carte", "momo", "om"]).default("especes"),
      method: z.string().optional(),
      caisseId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const venteId = input.venteId ?? input.debtId;
      if (!venteId) throw new TRPCError({ code: "BAD_REQUEST", message: "ID de vente requis." });

      return db.transaction(async (tx) => {
        const [sale] = await tx
          .select()
          .from(ventes)
          .where(and(eq(ventes.id, venteId), eq(ventes.agenceId, agenceId)))
          .limit(1);

        if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Vente non trouvée." });

        // Dette = montant total − montant payé (le champ remise est la remise commerciale, pas le crédit)
        const credit = Number(sale.montantTotal ?? 0);
        const paid = Number(sale.montantPaye ?? 0);
        const remaining = credit - paid;
        const payAmount = input.amount ?? input.montant ?? 0;

        if (remaining <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cette dette est déjà payée." });
        }
        if (payAmount > remaining) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Le montant dépasse le reste à payer (${remaining}).`,
          });
        }

        const newPaid = paid + payAmount;
        const newRemaining = credit - newPaid;
        const actualMethod = input.method ?? input.modePaiement;

        await tx
          .update(ventes)
          .set({
            montantPaye: String(newPaid),
            updatedAt: new Date(),
          })
          .where(eq(ventes.id, Number(venteId)));

        await tx.update(dettesClients).set({
          montantPaye: String(newPaid),
          montantRestant: String(Math.max(0, newRemaining)),
          statut: newRemaining <= 0 ? "paye" : "partiel",
        } as any).where(eq(dettesClients.venteId, Number(venteId)));

        const ref = `PAY-${Date.now()}`;
        const [paiement] = await tx.insert(paiements).values({
          agenceId,
          venteId: Number(venteId),
          montant: String(payAmount),
          modePaiement: actualMethod,
          reference: ref,
          effectuePar: ctx.user.id,
          createdAt: new Date(),
        } as any).returning() as any;

        const caisse = await CaisseService.trouverCaisseOuverte(agenceId, tx as any);
        await CaisseService.enregistrerFlux({
          caisseId: input.caisseId ?? caisse.caisseId,
          agenceId,
          type: "encaissement_dette",
          montant: payAmount,
          motif: `Encaissement dette client vente #${venteId} (${actualMethod})`,
          reference: ref,
          entiteType: "VENTE",
          entiteId: Number(venteId),
          effectuePar: Number(ctx.user.id),
        }, tx as any);

        return { success: true, id: String(paiement?.id), reference: ref };
      }) as any;
    }),

  // ─── Prévisions de trésorerie ───
  listPrevisions: financeProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      statut: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions = [eq(previsionsTresorerie.agenceId, agenceId)];
      if (input.statut) conditions.push(eq(previsionsTresorerie.statut, input.statut));
      if (input.dateDebut) conditions.push(gte(previsionsTresorerie.datePrevision, new Date(input.dateDebut)));
      if (input.dateFin) conditions.push(lte(previsionsTresorerie.datePrevision, new Date(input.dateFin)));

      return db.select()
        .from(previsionsTresorerie)
        .where(and(...conditions))
        .orderBy(previsionsTresorerie.datePrevision);
    }),

  createPrevision: requirePermissionProcedure("comptabilite.depense.creer")
    .input(z.object({
      type: z.enum(["entree", "sortie"]),
      categorie: z.string().optional(),
      montantPrevu: z.number().positive(),
      datePrevision: z.string(),
      libelle: z.string().min(1),
      notes: z.string().optional(),
      referenceId: z.number().optional(),
      referenceType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [prev] = await db.insert(previsionsTresorerie).values({
        agenceId: ctx.user.agenceId,
        type: input.type === "entree" ? "entree" : "sortie",
        categorie: input.categorie || null,
        montantPrevu: String(input.montantPrevu),
        datePrevision: new Date(input.datePrevision),
        libelle: input.libelle,
        notes: input.notes || null,
        referenceId: input.referenceId || null,
        referenceType: input.referenceType || null,
      } as any).returning() as any;
      return { id: String(prev.id) };
    }) as any,

  updatePrevisionRealisation: requirePermissionProcedure("comptabilite.depense.creer")
    .input(z.object({
      id: z.number(),
      montantReel: z.number(),
      dateRealisation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.update(previsionsTresorerie).set({
        montantReel: String(input.montantReel),
        dateRealisation: input.dateRealisation ? new Date(input.dateRealisation) : new Date(),
        statut: "realise",
      } as any).where(eq(previsionsTresorerie.id, input.id)) as any;
      return { success: true };
    }) as any,

  getTresorerieSynthese: financeProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const today = new Date();
      const start = input.dateDebut ? new Date(input.dateDebut) : new Date(today.getFullYear(), today.getMonth(), 1);
      const end = input.dateFin ? new Date(input.dateFin) : new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const previsions = await db.select()
        .from(previsionsTresorerie)
        .where(and(
          eq(previsionsTresorerie.agenceId, agenceId),
          gte(previsionsTresorerie.datePrevision, start),
          lte(previsionsTresorerie.datePrevision, end),
        ));

      const entreesPrevues = previsions.filter(p => p.type === "entree").reduce((sum, p) => sum + Number(p.montantPrevu ?? 0), 0);
      const sortiesPrevues = previsions.filter(p => p.type === "sortie").reduce((sum, p) => sum + Number(p.montantPrevu ?? 0), 0);
      const entreesReelles = previsions.filter(p => p.type === "entree" && p.montantReel).reduce((sum, p) => sum + Number(p.montantReel ?? 0), 0);
      const sortiesReelles = previsions.filter(p => p.type === "sortie" && p.montantReel).reduce((sum, p) => sum + Number(p.montantReel ?? 0), 0);

      return {
        totalEntreesPrevues: entreesPrevues,
        totalSortiesPrevues: sortiesPrevues,
        soldePrevu: entreesPrevues - sortiesPrevues,
        totalEntreesReelles: entreesReelles,
        totalSortiesReelles: sortiesReelles,
        soldeReel: entreesReelles - sortiesReelles,
        nbPrevisions: previsions.length,
      };
    }),
});

