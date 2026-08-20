import { z } from "zod";
import { createTRPCRouter, protectedProcedure, stockProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, stocks, produits, categories, unitesMesure, mouvementsStock, inventaires, inventairesSessions, deconditionnements, reconditionnements, emplacements, stocksUnites, ventesLignes, ventes } from "@atelierone/db";
import { eq, and, desc, sql, lt, lte, gte, isNotNull, isNull, count, sum, avg, asc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { operationDouble, getFacteurVersBase, enregistrerMouvement, mouvementSortieUnite, mouvementEntreeUnite, TYPES_MOUVEMENT, sortirPourOR, retourAtelier, reserverStock, libererStock } from "~/server/lib/stock-engine";
import { PertesService } from "~/server/lib/pertes-service";
import { sortirStockFIFO, verifierDispoNonPerimee, listerAlertesDlc } from "~/server/lib/lot-service";
import { creerEchangeCore, retournerCoquille, listerCores } from "~/server/lib/core-service";
import { ordresReparation, vehicules, produits as produitsTable } from "@atelierone/db";

export const stockRouter = createTRPCRouter({
  getDashboard: requirePermissionProcedure("stock.consulter").query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;

    // 1. KPI : valeur du stock (somme qte × CMUP)
    const [valeurRow] = await db
      .select({ valeur: sql<number>`COALESCE(SUM(${stocks.quantite} * COALESCE(${stocks.coutUnitaireMoyen}, 0)), 0)` })
      .from(stocks)
      .where(eq(stocks.agenceId, agenceId));
    const valeurStock = valeurRow?.valeur ?? 0;

    // 2. KPI : lignes de stock par état (rupture / bas / critique / surstock)
    const etats = await db
      .select({
        produitId: stocks.produitId,
        quantite: stocks.quantite,
        seuilAlerte: produits.seuilAlerte,
        seuilCritique: produits.seuilCritique,
        stockMaximum: produits.stockMaximum,
        titre: produits.titre,
        codeBarre: produits.codeBarre,
        cmup: stocks.coutUnitaireMoyen,
      })
      .from(stocks)
      .innerJoin(produits, eq(stocks.produitId, produits.id))
      .where(eq(stocks.agenceId, agenceId));

    let nbRuptures = 0;
    let nbStocksBas = 0;
    let nbSurstock = 0;
    const alertes = [];
    for (const e of etats) {
      const qte = Number(e.quantite);
      const seuilAlerte = e.seuilAlerte ?? 5;
      const seuilCritique = e.seuilCritique ?? 2;
      if (qte <= 0) { nbRuptures++; alertes.push({ ...e, quantite: qte, niveau: "rupture" }); }
      else if (qte <= seuilCritique) { nbStocksBas++; alertes.push({ ...e, quantite: qte, niveau: "critique" }); }
      else if (qte <= seuilAlerte) { nbStocksBas++; alertes.push({ ...e, quantite: qte, niveau: "faible" }); }
      if (e.stockMaximum && qte > Number(e.stockMaximum)) { nbSurstock++; }
    }
    alertes.sort((a, b) => Number(a.quantite) - Number(b.quantite));

    const aAchalander = await db.select({
      produitId: stocks.produitId,
      titre: produits.titre,
      codeBarre: produits.codeBarre,
      quantite: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)`,
      quantiteRayon: sql<number>`COALESCE(MAX(${stocks.quantiteRayon}), 0)`,
    })
      .from(stocks)
      .innerJoin(produits, eq(stocks.produitId, produits.id))
      .where(and(eq(stocks.agenceId, agenceId), isNull(stocks.emplacementId)))
      .groupBy(stocks.produitId, produits.titre, produits.codeBarre)
      .having(sql`COALESCE(SUM(${stocks.quantite}), 0) > 0 AND COALESCE(MAX(${stocks.quantiteRayon}), 0) = 0`)
      .orderBy(desc(stocks.produitId))
      .limit(20);

    // 3. Mouvements du jour (specs : KPI mouvements du jour)
    const debutJour = new Date();
    debutJour.setHours(0, 0, 0, 0);
    const [mouvementsJourRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mouvementsStock)
      .where(and(eq(mouvementsStock.agenceId, agenceId), gte(mouvementsStock.dateMouvement, debutJour)));
    const mouvementsJour = mouvementsJourRow?.count ?? 0;

    const recentMouvements = await db.select({
      id: mouvementsStock.id,
      produitId: mouvementsStock.produitId,
      type: mouvementsStock.type,
      quantite: mouvementsStock.quantite,
      stockApres: mouvementsStock.stockApres,
      dateMouvement: mouvementsStock.dateMouvement,
      titre: produits.titre,
    })
      .from(mouvementsStock)
      .leftJoin(produits, eq(mouvementsStock.produitId, produits.id))
      .where(eq(mouvementsStock.agenceId, agenceId))
      .orderBy(desc(mouvementsStock.dateMouvement))
      .limit(10);

    return {
      totalProduits: etats.length,
      valeurStock: Number(valeurStock),
      nbRuptures,
      nbStocksBas,
      nbSurstock,
      mouvementsJour,
      alertesStock: nbRuptures + nbStocksBas,
      alertes: alertes.slice(0, 20).map(a => ({
        id: String(a.produitId),
        produitId: String(a.produitId),
        titre: a.titre,
        codeBarre: a.codeBarre,
        quantite: a.quantite,
        seuilAlerte: a.seuilAlerte ?? 0,
        seuilCritique: a.seuilCritique ?? 0,
        niveau: a.niveau,
      })),
      aAchalander: aAchalander.map(a => ({
        produitId: String(a.produitId),
        titre: a.titre,
        codeBarre: a.codeBarre,
        quantite: Number(a.quantite),
        quantiteRayon: Number(a.quantiteRayon),
      })),
      mouvementsRecents: recentMouvements.map(m => ({
        id: String(m.id),
        produitId: String(m.produitId),
        produitTitre: m.titre,
        type: m.type,
        quantite: m.quantite,
        stockApres: m.stockApres,
        dateMouvement: m.dateMouvement,
      })),
    };
  }),

  getAlertesAntiVol: protectedProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;
    const septJours = new Date();
    septJours.setDate(septJours.getDate() - 7);

    const ajustementsRecents = await db.select({
      id: mouvementsStock.id,
      produitId: mouvementsStock.produitId,
      type: mouvementsStock.type,
      quantite: mouvementsStock.quantite,
      dateMouvement: mouvementsStock.dateMouvement,
      motif: mouvementsStock.motif,
      commentaire: mouvementsStock.commentaire,
      effectuePar: mouvementsStock.effectuePar,
      titre: produits.titre,
      codeBarre: produits.codeBarre,
    })
      .from(mouvementsStock)
      .leftJoin(produits, eq(mouvementsStock.produitId, produits.id))
      .where(and(
        eq(mouvementsStock.agenceId, agenceId),
        gte(mouvementsStock.dateMouvement, septJours)
      ))
      .orderBy(desc(mouvementsStock.dateMouvement))
      .limit(200);

    const alertesAntiVol: Array<{
      id: string;
      type: "ajustement_sans_motif" | "ajustements_multiples" | "sortie_importante" | "inventaire_negatif";
      produitId: string;
      titre: string | null;
      codeBarre: string | null;
      quantite: number;
      message: string;
      date: Date;
    }> = [];

    const ajustementsSansMotif = ajustementsRecents.filter(
      m => m.type === "ajustement" && (!m.motif || m.motif === "Ajustement manuel")
    );
    for (const a of ajustementsSansMotif) {
      alertesAntiVol.push({
        id: `as-${a.id}`,
        type: "ajustement_sans_motif",
        produitId: String(a.produitId),
        titre: a.titre,
        codeBarre: a.codeBarre,
        quantite: a.quantite,
        message: `Ajustement sans motif: ${a.titre ?? "produit #" + a.produitId}, qte=${a.quantite}`,
        date: a.dateMouvement,
      });
    }

    const countMap = new Map<number, { count: number; totalQte: number; rows: typeof ajustementsRecents }>();
    for (const m of ajustementsRecents) {
      if (m.type === "ajustement" && m.produitId) {
        const pid = Number(m.produitId);
        if (!countMap.has(pid)) countMap.set(pid, { count: 0, totalQte: 0, rows: [] });
        const entry = countMap.get(pid)!;
        entry.count++;
        entry.totalQte += m.quantite;
        entry.rows.push(m);
      }
    }
    for (const [pid, data] of countMap) {
      if (data.count >= 3) {
        const first = data.rows[0];
        alertesAntiVol.push({
          id: `am-${pid}-${Date.now()}`,
          type: "ajustements_multiples",
          produitId: String(pid),
          titre: first?.titre ?? null,
          codeBarre: first?.codeBarre ?? null,
          quantite: data.totalQte,
          message: `${data.count} ajustements en 7j sur ${first?.titre ?? "produit #" + pid} (total ${data.totalQte} unitÃ©s)`,
          date: first?.dateMouvement ?? new Date(),
        });
      }
    }

    const sortiesImportantes = ajustementsRecents.filter(m => m.type === "sortie" && m.quantite > 100);
    for (const s of sortiesImportantes) {
      alertesAntiVol.push({
        id: `si-${s.id}`,
        type: "sortie_importante",
        produitId: String(s.produitId),
        titre: s.titre,
        codeBarre: s.codeBarre,
        quantite: s.quantite,
        message: `Sortie volumineuse: ${s.titre ?? "produit #" + s.produitId}, ${s.quantite} unitÃ©s`,
        date: s.dateMouvement,
      });
    }

    return alertesAntiVol;
  }),

  getStocksDormants: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      jours: z.number().default(90),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const jours = input?.jours ?? 90;
      const limit = input?.limit ?? 50;
      const cutoff = new Date(Date.now() - jours * 24 * 60 * 60 * 1000);

      const rows = await db.select({
        produitId: stocks.produitId,
        titre: produits.titre,
        codeBarre: produits.codeBarre,
        quantite: stocks.quantite,
        prixAchat: produits.prixAchat,
        prixVente: produits.prixVente,
        categorieNom: categories.nom,
        derniereVente: sql<Date>`MAX(${mouvementsStock.createdAt})`,
        valeurStock: sql<number>`COALESCE(${stocks.quantite}, 0)::numeric * COALESCE(${produits.prixAchat}, 0)`,
      })
        .from(stocks)
        .innerJoin(produits, eq(stocks.produitId, produits.id))
        .leftJoin(categories, eq(produits.categorieId, categories.id))
        .leftJoin(mouvementsStock, and(
          eq(mouvementsStock.produitId, produits.id),
          eq(mouvementsStock.agenceId, agenceId),
          eq(mouvementsStock.sens, "S"),
        ))
        .where(and(
          eq(stocks.agenceId, agenceId),
          eq(produits.isActive, true),
          sql`COALESCE(${stocks.quantite}, 0) > 0`,
        ))
        .groupBy(stocks.produitId, produits.id, stocks.quantite, stocks.id, categories.nom)
        .having(sql`MAX(${mouvementsStock.createdAt}) IS NULL OR MAX(${mouvementsStock.createdAt}) < ${cutoff}`)
        .orderBy(desc(sql`COALESCE(${stocks.quantite}, 0)::numeric * COALESCE(${produits.prixAchat}, 0)`))
        .limit(limit);

      return {
        items: rows,
        total: rows.length,
        valeurTotale: rows.reduce((sum, r) => sum + Number(r.valeurStock ?? 0), 0),
        periodeJours: jours,
      };
    }),

  getAlertes: requirePermissionProcedure("stock.consulter").query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;
    const rows = await db.select({
      id: stocks.id,
      produitId: stocks.produitId,
      quantite: stocks.quantite,
      titre: produits.titre,
      codeBarre: produits.codeBarre,
      seuilAlerte: produits.seuilAlerte,
      seuilCritique: produits.seuilCritique,
      categorieNom: categories.nom,
    })
      .from(stocks)
      .innerJoin(produits, eq(stocks.produitId, produits.id))
      .leftJoin(categories, eq(produits.categorieId, categories.id))
      .where(and(eq(stocks.agenceId, agenceId), lt(stocks.quantite, produits.seuilAlerte)))
      .orderBy(stocks.quantite);

    return rows.map(r => ({
      id: String(r.id),
      produitId: String(r.produitId),
      titre: r.titre,
      codeBarre: r.codeBarre,
      quantite: r.quantite,
      seuilAlerte: r.seuilAlerte ?? 0,
      seuilCritique: r.seuilCritique ?? 0,
      categorie: r.categorieNom,
      niveau: r.quantite < (r.seuilCritique ?? 2) ? "critique" : "faible",
    }));
  }),

  getMouvements: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      produitId: z.string().optional(),
      type: z.string().optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(mouvementsStock.agenceId, ctx.user.agenceId)];
      if (input.produitId) conditions.push(eq(mouvementsStock.produitId, Number(input.produitId)));
      if (input.type) conditions.push(eq(mouvementsStock.type, input.type));
      if (input.dateDebut) conditions.push(gte(mouvementsStock.dateMouvement, new Date(input.dateDebut)));
      if (input.dateFin) conditions.push(lte(mouvementsStock.dateMouvement, new Date(input.dateFin)));

      const rows = await db.select({
        id: mouvementsStock.id,
        produitId: mouvementsStock.produitId,
        type: mouvementsStock.type,
        sens: mouvementsStock.sens,
        quantite: mouvementsStock.quantite,
        stockAvant: mouvementsStock.stockAvant,
        stockApres: mouvementsStock.stockApres,
        reference: mouvementsStock.reference,
        referenceType: mouvementsStock.referenceType,
        documentLie: mouvementsStock.documentLie,
        motif: mouvementsStock.motif,
        commentaire: mouvementsStock.commentaire,
        groupeOperationId: mouvementsStock.groupeOperationId,
        dateMouvement: mouvementsStock.dateMouvement,
        effectuePar: mouvementsStock.effectuePar,
        titre: produits.titre,
      })
        .from(mouvementsStock)
        .leftJoin(produits, eq(mouvementsStock.produitId, produits.id))
        .where(and(...conditions))
        .orderBy(desc(mouvementsStock.dateMouvement))
        .limit(input.limit)
        .offset(input.offset);

      return rows.map(r => ({
        id: String(r.id),
        produitId: String(r.produitId),
        produitTitre: r.titre,
        type: r.type,
        sens: r.sens,
        quantite: r.quantite,
        stockAvant: r.stockAvant,
        stockApres: r.stockApres,
        reference: r.reference,
        referenceType: r.referenceType,
        documentLie: r.documentLie,
        motif: r.motif,
        commentaire: r.commentaire,
        groupeOperationId: r.groupeOperationId,
        dateMouvement: r.dateMouvement,
        effectuePar: r.effectuePar,
      }));
    }),

  createDeconditionnement: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      produitId: z.string(),
      uniteSourceId: z.string(),
      quantiteSource: z.number().positive(),
      uniteCibleId: z.string(),
      quantiteGeneree: z.number().positive(),
      motif: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [sourceUnite] = await tx.select().from(unitesMesure).where(eq(unitesMesure.id, input.uniteSourceId)).limit(1);
        const [cibleUnite] = await tx.select().from(unitesMesure).where(eq(unitesMesure.id, input.uniteCibleId)).limit(1);

        const [stockRow] = await tx.select()
          .from(stocks)
          .where(and(eq(stocks.produitId, Number(input.produitId)), eq(stocks.agenceId, ctx.user.agenceId)))
          .limit(1);

        if (!stockRow || stockRow.quantite < input.quantiteSource) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Stock source insuffisant" });
        }

        await operationDouble(tx, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          typeSortie: TYPES_MOUVEMENT.DECONDITIONNEMENT_SORTIE,
          typeEntree: TYPES_MOUVEMENT.DECONDITIONNEMENT_ENTREE,
          uniteSourceId: input.uniteSourceId,
          quantiteSource: input.quantiteSource,
          uniteCibleId: input.uniteCibleId,
          quantiteCible: input.quantiteGeneree,
          motif: input.motif,
          effectuePar: Number(ctx.user.id),
          getFacteurVersBase: (uniteId) => getFacteurVersBase(tx, Number(input.produitId), uniteId),
        });

        await tx.insert(deconditionnements).values({
          agenceId: ctx.user.agenceId,
          produitId: Number(input.produitId),
          uniteSourceId: input.uniteSourceId,
          quantiteSource: String(input.quantiteSource),
          uniteCibleId: input.uniteCibleId,
          quantiteGeneree: String(input.quantiteGeneree),
          effectuePar: Number(ctx.user.id),
          motif: input.motif || null,
        }) as any;
      }) as any;
    }),

  listDeconditionnements: stockProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(deconditionnements.agenceId, ctx.user.agenceId)];
      const rows = await db.select({
        id: deconditionnements.id,
        produitId: deconditionnements.produitId,
        quantiteSource: deconditionnements.quantiteSource,
        quantiteGeneree: deconditionnements.quantiteGeneree,
        motif: deconditionnements.motif,
        dateDeconditionnement: deconditionnements.dateDeconditionnement,
        titre: produits.titre,
        sourceCode: unitesMesure.code,
      })
        .from(deconditionnements)
        .innerJoin(produits, eq(deconditionnements.produitId, produits.id))
        .innerJoin(unitesMesure, eq(deconditionnements.uniteSourceId, unitesMesure.id))
        .where(and(...conditions))
        .orderBy(desc(deconditionnements.dateDeconditionnement))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);

      return rows.map(r => ({
        id: String(r.id),
        produitId: String(r.produitId),
        produitTitre: r.titre,
        quantiteSource: r.quantiteSource,
        uniteSourceCode: r.sourceCode,
        quantiteGeneree: r.quantiteGeneree,
        motif: r.motif,
        date: r.dateDeconditionnement,
      }));
    }),

  createSessionInventaire: requirePermissionProcedure("stock.inventaire")
    .input(z.object({ libelle: z.string().optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await db.insert(inventairesSessions).values({
        agenceId: ctx.user.agenceId,
        libelle: input.libelle || `Inventaire du ${new Date().toLocaleDateString("fr-FR")}`,
        statut: "en_cours",
        effectuePar: Number(ctx.user.id),
        notes: input.notes || null,
      }).returning() as any;
      return { id: String(session.id) };
    }) as any,

  listSessionsInventaire: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select()
      .from(inventairesSessions)
      .where(eq(inventairesSessions.agenceId, ctx.user.agenceId))
      .orderBy(desc(inventairesSessions.dateDebut));
    return rows.map(s => ({
      id: String(s.id),
      libelle: s.libelle,
      statut: s.statut,
      dateDebut: s.dateDebut,
      dateFin: s.dateFin,
      notes: s.notes,
      effectuePar: s.effectuePar,
      validePar: s.validePar,
    }));
  }),

  getSessionInventaire: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [session] = await db.select()
        .from(inventairesSessions)
        .where(and(eq(inventairesSessions.id, Number(input.id)), eq(inventairesSessions.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session introuvable" });

      const comptages = await db.select({
        id: inventaires.id,
        produitId: inventaires.produitId,
        quantiteTheorique: inventaires.quantiteTheorique,
        quantiteReelle: inventaires.quantiteReelle,
        ecart: inventaires.ecart,
        commentaire: inventaires.commentaire,
        titre: produits.titre,
        codeBarre: produits.codeBarre,
      })
        .from(inventaires)
        .leftJoin(produits, eq(inventaires.produitId, produits.id))
        .where(eq(inventaires.sessionId, session.id))
        .orderBy(desc(inventaires.dateInventaire));

      const ecarts = comptages.filter(c => Number(c.ecart ?? 0) !== 0);

      return {
        id: String(session.id),
        libelle: session.libelle,
        statut: session.statut,
        dateDebut: session.dateDebut,
        dateFin: session.dateFin,
        notes: session.notes,
        effectuePar: session.effectuePar,
        validePar: session.validePar,
        comptages: comptages.map(c => ({
          id: String(c.id),
          produitId: String(c.produitId),
          titre: c.titre,
          codeBarre: c.codeBarre,
          quantiteTheorique: c.quantiteTheorique,
          quantiteReelle: c.quantiteReelle,
          ecart: c.ecart,
          notes: c.commentaire,
        })),
        totalProduits: comptages.length,
        totalEcarts: ecarts.length,
      };
    }),

  compterProduit: requirePermissionProcedure("stock.inventaire")
    .input(z.object({
      sessionId: z.string(),
      produitId: z.string(),
      uniteId: z.string().optional(),
      quantiteReelle: z.number().min(0),
      commentaire: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [session] = await tx.select()
          .from(inventairesSessions)
          .where(and(eq(inventairesSessions.id, Number(input.sessionId)), eq(inventairesSessions.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session introuvable" });
        if (session.statut !== "en_cours") throw new TRPCError({ code: "BAD_REQUEST", message: "Session dÃ©jÃ  terminÃ©e" });

        const [stockRow] = await tx.select()
          .from(stocks)
          .where(and(eq(stocks.produitId, Number(input.produitId)), eq(stocks.agenceId, ctx.user.agenceId)))
          .limit(1);

        const qteTheorique = stockRow?.quantite ?? 0;
        const ecart = input.quantiteReelle - qteTheorique;
        const [existing] = await tx.select().from(inventaires).where(and(
          eq(inventaires.sessionId, Number(input.sessionId)),
          eq(inventaires.produitId, Number(input.produitId))
        )).limit(1);

        if (existing) {
          await tx.update(inventaires).set({
            quantiteTheorique: qteTheorique,
            quantiteReelle: input.quantiteReelle,
            ecart: ecart,
            commentaire: input.commentaire || null,
          }).where(eq(inventaires.id, existing.id)) as any;
        } else {
          await tx.insert(inventaires).values({
            sessionId: Number(input.sessionId),
            produitId: Number(input.produitId),
            agenceId: ctx.user.agenceId,
            quantiteTheorique: qteTheorique,
            quantiteReelle: input.quantiteReelle,
            ecart: ecart,
            commentaire: input.commentaire || null,
            effectuePar: Number(ctx.user.id),
          }) as any;
        }
        return { quantiteTheorique: qteTheorique, quantiteReelle: input.quantiteReelle, ecart };
      }) as any;
    }) as any,

  validerSession: requirePermissionProcedure("stock.inventaire")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [session] = await tx.select()
          .from(inventairesSessions)
          .where(and(eq(inventairesSessions.id, Number(input.id)), eq(inventairesSessions.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session introuvable" });
        if (session.statut !== "en_cours") throw new TRPCError({ code: "BAD_REQUEST", message: "Session dÃ©jÃ  terminÃ©e" });

        const comptages = await tx.select()
          .from(inventaires)
          .where(eq(inventaires.sessionId, session.id));

        for (const c of comptages) {
          if (c.ecart === 0 || !c.produitId) continue;

          const [stockRow] = await tx.select()
            .from(stocks)
            .where(and(eq(stocks.produitId, c.produitId), eq(stocks.agenceId, ctx.user.agenceId)))
            .limit(1);

          const stockAvant = Number(stockRow?.quantite ?? 0);
          const stockApres = stockAvant + Number(c.ecart);

          await tx.update(stocks).set({ quantite: String(stockApres) }).where(eq(stocks.id, stockRow!.id)) as any;

          const fifoAllocs = Number(c.ecart) < 0
            ? await sortirStockFIFO(tx, {
              produitId: c.produitId,
              agenceId: ctx.user.agenceId,
              quantite: Math.abs(Number(c.ecart)),
              type: "AJUSTEMENT_INVENTAIRE_NEGATIF",
              motif: `Correction inventaire session #${session.id}`,
              effectuePar: Number(ctx.user.id),
              reference: `INV-${session.id}`,
              referenceType: "INVENTAIRE",
            })
            : [];

          if (fifoAllocs.length === 0) {
            await tx.insert(mouvementsStock).values({
              produitId: c.produitId,
              agenceId: ctx.user.agenceId,
              type: c.ecart > 0 ? "AJUSTEMENT_INVENTAIRE_POSITIF" : "AJUSTEMENT_INVENTAIRE_NEGATIF",
              sens: c.ecart > 0 ? "E" : "S",
              quantite: String(Math.abs(Number(c.ecart))),
              stockAvant: String(stockAvant),
              stockApres: String(stockApres),
              reference: `INV-${session.id}`,
              referenceType: "INVENTAIRE",
              motif: `Correction inventaire session #${session.id}`,
              effectuePar: Number(ctx.user.id),
            }) as any;
          }

          if (Number(c.ecart) < 0) {
            const coutUnitaire = Number(stockRow?.coutUnitaireMoyen ?? 0);
            const montantPerte = Math.abs(Number(c.ecart)) * coutUnitaire;
            if (montantPerte > 0) {
              await PertesService.enregistrerPerte({
                agenceId: ctx.user.agenceId,
                produitId: c.produitId,
                quantite: Math.abs(Number(c.ecart)),
                coutUnitaire,
                montantPerte,
                typePerte: "INVENTAIRE_NEGATIF",
                motif: `Ã‰cart d'inventaire nÃ©gatif (session ${session.id})`,
                reference: `INV-${session.id}`,
                referenceType: "INVENTAIRE",
                effectuePar: Number(ctx.user.id),
              }, tx as any);
            }
          }
        }

        await tx.update(inventairesSessions).set({
          statut: "valide",
          dateFin: new Date(),
          validePar: ctx.user.id,
        }).where(eq(inventairesSessions.id, session.id)) as any;
      }) as any;
    }),

  ajusterStock: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      produitId: z.string(),
      nouvelleQuantite: z.number().min(0),
      motif: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [stockRow] = await tx.select()
          .from(stocks)
          .where(and(eq(stocks.produitId, Number(input.produitId)), eq(stocks.agenceId, ctx.user.agenceId)))
          .limit(1);

        const stockAvant = Number(stockRow?.quantite ?? 0);
        const stockApres = input.nouvelleQuantite;
        const ecart = stockApres - stockAvant;

        if (stockRow) {
          await tx.update(stocks).set({ quantite: String(stockApres) }).where(eq(stocks.id, stockRow.id)) as any;
        } else {
          await tx.insert(stocks).values({
            produitId: Number(input.produitId),
            agenceId: ctx.user.agenceId,
            quantite: String(stockApres),
          }) as any;
        }

        await tx.insert(mouvementsStock).values({
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          type: "AJUSTEMENT",
          sens: ecart >= 0 ? "E" : "S",
          quantite: String(Math.abs(ecart)),
          stockAvant: String(stockAvant),
          stockApres: String(stockApres),
          motif: input.motif || "Ajustement manuel",
          effectuePar: Number(ctx.user.id),
        }) as any;

        return { stockAvant, stockApres, ecart };
      }) as any;
    }),

  listRayons: requirePermissionProcedure("stock.consulter").query(async ({ ctx }) => {
    const rows = await db.select()
      .from(emplacements)
      .where(and(
        eq(emplacements.agenceId, ctx.user.agenceId),
        eq(emplacements.type, "RAYON"),
        eq(emplacements.isActive, true),
      ))
      .orderBy(emplacements.code);
    return rows.map(r => ({
      id: String(r.id),
      code: r.code,
      libelle: r.libelle,
      parentId: r.parentId ? String(r.parentId) : null,
      profondeur: r.profondeur,
    }));
  }),

  ajustementManuel: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      produitId: z.string(),
      typeAjustement: z.enum(["POSITIF", "NEGATIF"]),
      nature: z.enum(["AJUSTEMENT", "CASSE_PERTE"]).default("AJUSTEMENT"),
      uniteId: z.string(),
      quantite: z.number().positive(),
      coutUnitaireBase: z.number().optional(),
      motif: z.string(),
      emplacementId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const isEntree = input.typeAjustement === "POSITIF";
        const typeMvt = isEntree
          ? "AJUSTEMENT_INVENTAIRE_POSITIF"
          : input.nature === "CASSE_PERTE"
            ? "CASSE_PERTE"
            : "AJUSTEMENT_INVENTAIRE_NEGATIF";
        const facteur = await getFacteurVersBase(tx as any, Number(input.produitId), input.uniteId);
        const qteBase = input.quantite * facteur;

        if (isEntree) {
          await mouvementEntreeUnite(tx, {
            produitId: Number(input.produitId),
            agenceId: ctx.user.agenceId,
            uniteId: input.uniteId,
            quantite: input.quantite,
            type: typeMvt as any,
            motif: input.motif,
            effectuePar: Number(ctx.user.id),
            coutUnitaireBase: input.coutUnitaireBase,
            audit: false,
          });
        } else {
          await mouvementSortieUnite(tx, {
            produitId: Number(input.produitId),
            agenceId: ctx.user.agenceId,
            uniteId: input.uniteId,
            quantite: input.quantite,
            type: typeMvt as any,
            motif: input.motif,
            effectuePar: Number(ctx.user.id),
            coutUnitaireBase: input.coutUnitaireBase,
            audit: false,
          });
        }

        const fifoAllocs = !isEntree
          ? await sortirStockFIFO(tx, {
            produitId: Number(input.produitId),
            agenceId: ctx.user.agenceId,
            quantite: qteBase,
            type: typeMvt as any,
            motif: input.motif,
            effectuePar: Number(ctx.user.id),
          })
          : [];

        await enregistrerMouvement(tx, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          type: typeMvt as any,
          sens: isEntree ? "E" : "S",
          quantite: qteBase,
          uniteId: input.uniteId,
          emplacementId: input.emplacementId,
          coutUnitaireBase: input.coutUnitaireBase,
          motif: input.motif,
          effectuePar: Number(ctx.user.id),
          audit: fifoAllocs.length === 0,
        });

        if (typeMvt === "CASSE_PERTE") {
          const [stockRow] = await tx.select({ coutUnitaireMoyen: stocks.coutUnitaireMoyen }).from(stocks)
            .where(and(eq(stocks.produitId, Number(input.produitId)), eq(stocks.agenceId, ctx.user.agenceId)))
            .limit(1) as any;
          const coutUnitaire = input.coutUnitaireBase ?? Number(stockRow?.coutUnitaireMoyen ?? 0);
          await PertesService.enregistrerPerte({
            agenceId: ctx.user.agenceId,
            produitId: Number(input.produitId),
            quantite: qteBase,
            coutUnitaire,
            montantPerte: qteBase * coutUnitaire,
            typePerte: "CASSE",
            motif: input.motif,
            reference: `${ctx.user.id}-${Date.now()}`,
            effectuePar: Number(ctx.user.id),
          }, tx as any);
        }

        return { type: typeMvt, quantite: input.quantite, quantiteBase: qteBase };
      }) as any;
    }),

  // DÃ©claration d'un alÃ©a (vol, casse, avarie, rebut) : dÃ©bit du stock du lot
  // (FIFO) + mouvement + perte financiÃ¨re liÃ©e au lot â€” impact direct sur le
  // bÃ©nÃ©fice estimÃ© du lot.
  declarerPerte: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      produitId: z.string(),
      typePerte: z.enum(["VOL", "CASSE", "AVARIE", "REBUT"]),
      uniteId: z.string(),
      quantite: z.number().positive(),
      lotId: z.number().optional(),
      motif: z.string().min(3, "Motif requis (min. 3 caractÃ¨res)"),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const facteur = await getFacteurVersBase(tx as any, Number(input.produitId), input.uniteId);
        const qteBase = input.quantite * facteur;
        const typeMvt = "CASSE_PERTE" as any;

        await mouvementSortieUnite(tx as any, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          uniteId: input.uniteId,
          quantite: input.quantite,
          type: typeMvt,
          motif: input.motif,
          effectuePar: Number(ctx.user.id),
          audit: false,
        });

        const fifoAllocs = await sortirStockFIFO(tx as any, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          quantite: qteBase,
          type: typeMvt,
          motif: input.motif,
          effectuePar: Number(ctx.user.id),
        });

        await enregistrerMouvement(tx as any, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          type: typeMvt,
          sens: "S",
          quantite: qteBase,
          uniteId: input.uniteId,
          lotId: input.lotId ?? fifoAllocs[0]?.lotId,
          coutUnitaireBase: undefined,
          motif: input.motif,
          effectuePar: Number(ctx.user.id),
          audit: fifoAllocs.length === 0,
        });

        const lotLie = input.lotId ?? fifoAllocs[0]?.lotId ?? null;
        let coutFinal = 0;
        if (lotLie != null) {
          const alloc = fifoAllocs.find((a) => a.lotId === lotLie);
          coutFinal = Number(alloc?.coutUnitaire ?? 0);
        }
        if (coutFinal <= 0) {
          const [stockRow] = await tx.select({ cmup: stocks.coutUnitaireMoyen }).from(stocks)
            .where(and(eq(stocks.produitId, Number(input.produitId)), eq(stocks.agenceId, ctx.user.agenceId)))
            .limit(1) as any;
          coutFinal = Number(stockRow?.cmup ?? 0);
        }
        const montantPerte = qteBase * coutFinal;

        await PertesService.enregistrerPerte({
          agenceId: ctx.user.agenceId,
          produitId: Number(input.produitId),
          lotId: lotLie,
          quantite: qteBase,
          coutUnitaire: coutFinal,
          montantPerte,
          typePerte: input.typePerte,
          motif: input.motif,
          reference: lotLie != null ? `LOT-${lotLie}` : null,
          referenceType: lotLie != null ? "LOT" : null,
          effectuePar: Number(ctx.user.id),
        }, tx as any);

        return { type: input.typePerte, quantite: input.quantite, quantiteBase: qteBase, montantPerte, lotId: lotLie };
      }) as any;
    }),

  mettreEnRayon: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      produitId: z.string(),
      uniteId: z.string(),
      quantite: z.number().positive(),
      emplacementRayonId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const groupeOperationId = crypto.randomUUID();
      return db.transaction(async (tx) => {
        await mouvementSortieUnite(tx, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          uniteId: input.uniteId,
          quantite: input.quantite,
          type: TYPES_MOUVEMENT.TRANSFERT_SORTIE,
          motif: "Mise en rayon",
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });

        await mouvementEntreeUnite(tx, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          uniteId: input.uniteId,
          quantite: input.quantite,
          type: TYPES_MOUVEMENT.TRANSFERT_ENTREE,
          motif: "Mise en rayon",
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });

        await enregistrerMouvement(tx, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          type: TYPES_MOUVEMENT.TRANSFERT_SORTIE,
          sens: "S",
          quantite: input.quantite,
          uniteId: input.uniteId,
          emplacementId: null,
          motif: `Sortie stock gÃ©nÃ©ral vers rayon #${input.emplacementRayonId}`,
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });

        await enregistrerMouvement(tx, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          type: TYPES_MOUVEMENT.TRANSFERT_ENTREE,
          sens: "E",
          quantite: input.quantite,
          uniteId: input.uniteId,
          emplacementId: input.emplacementRayonId,
          motif: `EntrÃ©e rayon #${input.emplacementRayonId}`,
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });

        await tx.update(stocks)
          .set({ quantiteRayon: sql`COALESCE(${stocks.quantiteRayon}, 0) + ${input.quantite}` })
          .where(and(
            eq(stocks.produitId, Number(input.produitId)),
            eq(stocks.agenceId, ctx.user.agenceId),
            isNull(stocks.emplacementId),
          )) as any;

        return { groupeOperationId };
      }) as any;
    }),

  transferer: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      produitId: z.string(),
      uniteId: z.string(),
      quantite: z.number().positive(),
      emplacementSourceId: z.number(),
      emplacementCibleId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const groupeOperationId = crypto.randomUUID();
      return db.transaction(async (tx) => {
        await mouvementSortieUnite(tx, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          uniteId: input.uniteId,
          quantite: input.quantite,
          type: TYPES_MOUVEMENT.TRANSFERT_SORTIE,
          motif: `Transfert rayon #${input.emplacementSourceId} â†’ #${input.emplacementCibleId}`,
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });

        await mouvementEntreeUnite(tx, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          uniteId: input.uniteId,
          quantite: input.quantite,
          type: TYPES_MOUVEMENT.TRANSFERT_ENTREE,
          motif: `Transfert rayon #${input.emplacementSourceId} â†’ #${input.emplacementCibleId}`,
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });

        await enregistrerMouvement(tx, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          type: TYPES_MOUVEMENT.TRANSFERT_SORTIE,
          sens: "S",
          quantite: input.quantite,
          uniteId: input.uniteId,
          emplacementId: input.emplacementSourceId,
          motif: `Sortie rayon #${input.emplacementSourceId} vers rayon #${input.emplacementCibleId}`,
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });

        await enregistrerMouvement(tx, {
          produitId: Number(input.produitId),
          agenceId: ctx.user.agenceId,
          type: TYPES_MOUVEMENT.TRANSFERT_ENTREE,
          sens: "E",
          quantite: input.quantite,
          uniteId: input.uniteId,
          emplacementId: input.emplacementCibleId,
          motif: `EntrÃ©e rayon #${input.emplacementCibleId} depuis rayon #${input.emplacementSourceId}`,
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });

        return { groupeOperationId };
      }) as any;
    }),

  getPrevisionsAchat: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      joursHistorique: z.number().default(30),
      joursCouverture: z.number().default(30),
      limite: z.number().default(100),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const dateDebut = new Date();
      dateDebut.setDate(dateDebut.getDate() - input.joursHistorique);

      const ventesParProduit = await db.select({
        produitId: ventesLignes.produitId,
        totalVendus: sql<number>`COALESCE(SUM(${ventesLignes.quantite})::int, 0)`,
      })
        .from(ventesLignes)
        .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
        .where(and(
          eq(ventes.agenceId, agenceId),
          gte(ventes.createdAt, dateDebut),
        ))
        .groupBy(ventesLignes.produitId);

      const ventesMap = new Map<number, number>();
      for (const v of ventesParProduit) {
        ventesMap.set(v.produitId, v.totalVendus);
      }

      const stockRows = await db.select({
        produitId: produits.id,
        quantite: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)`,
        titre: produits.titre,
        codeBarre: produits.codeBarre,
        seuilAlerte: produits.seuilAlerte,
        seuilCritique: produits.seuilCritique,
        prixAchat: produits.prixAchat,
        categorieNom: categories.nom,
      })
        .from(stocks)
        .innerJoin(produits, eq(stocks.produitId, produits.id))
        .leftJoin(categories, eq(produits.categorieId, categories.id))
        .where(eq(stocks.agenceId, agenceId))
        .groupBy(produits.id, produits.titre, produits.codeBarre, produits.seuilAlerte, produits.seuilCritique, produits.prixAchat, categories.nom)
        .orderBy(asc(sql`COALESCE(SUM(${stocks.quantite}), 0)`))
        .limit(input.limite);

      const result = stockRows.map(r => {
        const stockActuel = Number(r.quantite);
        const totalVendus = ventesMap.get(r.produitId) ?? 0;
        const venteMoyenneJour = input.joursHistorique > 0 ? totalVendus / input.joursHistorique : 0;
        const joursRestants = venteMoyenneJour > 0 ? Math.round(stockActuel / venteMoyenneJour) : 999;

        let urgence: "critique" | "faible" | "normal";
        if (stockActuel < (r.seuilCritique ?? 2)) {
          urgence = "critique";
        } else if (stockActuel < (r.seuilAlerte ?? 5)) {
          urgence = "faible";
        } else {
          urgence = "normal";
        }

        const besoinRecommande = venteMoyenneJour > 0
          ? Math.max(0, Math.round(venteMoyenneJour * input.joursCouverture - stockActuel))
          : 0;

        const coutEstimeCommande = besoinRecommande > 0
          ? Math.round(besoinRecommande * Number(r.prixAchat ?? 0))
          : 0;

        return {
          produitId: String(r.produitId),
          titre: r.titre,
          codeBarre: r.codeBarre,
          stockActuel,
          venteMoyenneJour: Math.round(venteMoyenneJour * 100) / 100,
          joursRestants,
          seuilAlerte: r.seuilAlerte ?? 5,
          seuilCritique: r.seuilCritique ?? 2,
          urgence,
          besoinRecommande,
          coutEstimeCommande,
        };
      });

      result.sort((a, b) => {
        const ordre = { critique: 0, faible: 1, normal: 2 };
        return (ordre[a.urgence] ?? 3) - (ordre[b.urgence] ?? 3);
      });

      return result;
    }),

  listReconditionnements: stockProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await db.select({
        id: reconditionnements.id,
        produitSourceId: reconditionnements.produitSourceId,
        produitCibleId: reconditionnements.produitCibleId,
        quantiteSource: reconditionnements.quantiteSource,
        uniteSourceId: reconditionnements.uniteSourceId,
        uniteCibleId: reconditionnements.uniteCibleId,
        quantiteGeneree: reconditionnements.quantiteGeneree,
        facteurConversion: reconditionnements.facteurConversion,
        motif: reconditionnements.motif,
        date: reconditionnements.dateReconditionnement,
        sourceTitre: produits.titre,
        sourceCode: produits.codeArticle,
        sourceUnite: unitesMesure.code,
      })
        .from(reconditionnements)
        .innerJoin(produits, eq(reconditionnements.produitSourceId, produits.id))
        .innerJoin(unitesMesure, eq(reconditionnements.uniteSourceId, unitesMesure.id))
        .where(eq(reconditionnements.agenceId, ctx.user.agenceId))
        .orderBy(desc(reconditionnements.dateReconditionnement))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);

      // Titres des articles cibles (peut Ãªtre le mÃªme article en intra-article)
      const cibleIds = [...new Set(rows.map(r => r.produitCibleId).filter(Boolean))];
      const cibles = cibleIds.length
        ? await db.select({ id: produits.id, titre: produits.titre }).from(produits).where(inArray(produits.id, cibleIds))
        : [];
      const cibleTitre = new Map(cibles.map(c => [c.id, c.titre]));

      return rows.map(r => ({
        id: String(r.id),
        produitSourceId: String(r.produitSourceId),
        produitCibleId: r.produitCibleId ? String(r.produitCibleId) : null,
        sourceTitre: r.sourceTitre,
        cibleTitre: r.produitCibleId ? cibleTitre.get(r.produitCibleId) ?? r.sourceTitre : r.sourceTitre,
        sourceCode: r.sourceCode ?? r.sourceTitre,
        quantiteSource: String(r.quantiteSource),
        uniteSourceCode: r.sourceUnite,
        uniteCibleCode: "",
        quantiteGeneree: Number(r.quantiteGeneree),
        facteurConversion: r.facteurConversion ? Number(r.facteurConversion) : null,
        motif: r.motif,
        date: r.date,
      }));
    }),

  /**
   * RECONDITIONNEMENT â€” transforme une grande unitÃ© en unitÃ©s plus petites.
   * Inter-articles : fÃ»t 200L (produitSourceId) â†’ bidons 5L (produitCibleId).
   * Intra-article (compat) : produitCibleId omis â†’ mÃªme article.
   * AtomicitÃ© : deux mouvements liÃ©s par groupeOperationId (specs 04 Â§3, 05 Â§5).
   */
  createReconditionnement: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      produitSourceId: z.number().int(),
      uniteSourceId: z.string(),
      quantiteSource: z.number().positive(),
      produitCibleId: z.number().int().optional(),
      uniteCibleId: z.string(),
      motif: z.string().min(3).optional().or(z.literal("")),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const produitCibleId = input.produitCibleId ?? input.produitSourceId;

        // Ratio explicite dÃ©rivÃ© des facteurs d'unitÃ©s des deux articles
        const facteurSource = await getFacteurVersBase(tx as any, input.produitSourceId, input.uniteSourceId);
        const facteurCible = await getFacteurVersBase(tx as any, produitCibleId, input.uniteCibleId);

        // Validation ratio (specs : alerte ou refus si incohÃ©rent)
        if (facteurCible <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Facteur de conversion cible invalide." });
        }
        const ratio = facteurSource / facteurCible;
        const quantiteGeneree = Math.floor(input.quantiteSource * ratio);
        if (quantiteGeneree <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Reconditionnement impossible : la quantitÃ© gÃ©nÃ©rÃ©e est 0 (ratio ${ratio.toFixed(4)}). VÃ©rifiez les unitÃ©s et facteurs.`,
          });
        }

        const { groupeOperationId } = await operationDouble(tx as any, {
          produitId: input.produitSourceId,
          produitCibleId,
          agenceId: ctx.user.agenceId,
          typeSortie: TYPES_MOUVEMENT.RECONDITIONNEMENT_SORTIE as any,
          typeEntree: TYPES_MOUVEMENT.RECONDITIONNEMENT_ENTREE as any,
          uniteSourceId: input.uniteSourceId,
          quantiteSource: input.quantiteSource,
          uniteCibleId: input.uniteCibleId,
          quantiteCible: quantiteGeneree,
          motif: input.motif || undefined,
          effectuePar: Number(ctx.user.id),
          getFacteurVersBase: (uniteId) => getFacteurVersBase(tx as any, produitCibleId, uniteId),
        });

        await tx.insert(reconditionnements).values({
          agenceId: ctx.user.agenceId,
          produitSourceId: input.produitSourceId,
          uniteSourceId: input.uniteSourceId,
          quantiteSource: String(input.quantiteSource),
          produitCibleId: input.produitCibleId ?? null,
          uniteCibleId: input.uniteCibleId,
          quantiteGeneree: String(quantiteGeneree),
          facteurConversion: String(ratio),
          effectuePar: Number(ctx.user.id),
          motif: input.motif || null,
          groupeOperationId,
        } as any);

        return { quantiteGeneree, uniteCible: input.uniteCibleId, ratio, groupeOperationId };
      }) as any;
    }),

  // â”€â”€â”€ Emplacements (specs 03 : codification ZONE-ALLEE-RAYON-NIVEAU) â”€â”€â”€

  listEmplacements: stockProcedure
    .input(z.object({ search: z.string().optional(), type: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(emplacements.agenceId, ctx.user.agenceId)];
      if (safe.type) conditions.push(eq(emplacements.type, safe.type));
      const rows = await db
        .select()
        .from(emplacements)
        .where(and(...conditions))
        .orderBy(emplacements.code);
      const filtered = safe.search
        ? rows.filter(r =>
            r.code.toLowerCase().includes(safe.search!.toLowerCase()) ||
            (r.libelle ?? "").toLowerCase().includes(safe.search!.toLowerCase())
          )
        : rows;
      return filtered;
    }),

  createEmplacement: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      code: z.string().min(1).regex(/^[A-Z0-9]{2,4}(-[A-Z0-9]{1,4}){1,4}$/, "Format attendu : ZONE-ALLEE-RAYON-NIVEAU (ex. MAG-A-01-03, EXT-PNEU)"),
      libelle: z.string().optional(),
      type: z.string().default("RAYON"),
      parentId: z.number().int().optional(),
      categorieId: z.number().int().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select({ id: emplacements.id })
        .from(emplacements)
        .where(and(eq(emplacements.agenceId, ctx.user.agenceId), eq(emplacements.code, input.code)))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `L'emplacement Â« ${input.code} Â» existe dÃ©jÃ .` });
      }
      const [row] = await db.insert(emplacements).values({
        agenceId: ctx.user.agenceId,
        code: input.code,
        libelle: input.libelle ?? null,
        type: input.type,
        parentId: input.parentId ?? null,
        profondeur: input.parentId ? 1 : 0,
        categorieId: input.categorieId ?? null,
        isActive: input.isActive,
      } as any).returning();
      return row;
    }),

  updateEmplacement: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      id: z.number().int(),
      libelle: z.string().optional(),
      type: z.string().optional(),
      isActive: z.boolean().optional(),
      categorieId: z.number().int().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await db.update(emplacements).set({ ...rest, updatedAt: new Date() } as any).where(eq(emplacements.id, id));
      return { success: true };
    }),

  // â”€â”€â”€ Contenu d'un emplacement (specs 07 : recherche emplacement) â”€â”€â”€
  getEmplacementContenu: stockProcedure
    .input(z.object({ emplacementId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          produitId: stocks.produitId,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          codeArticle: produits.codeArticle,
          quantite: stocks.quantite,
          cmup: stocks.coutUnitaireMoyen,
          lotId: stocks.lotId,
        })
        .from(stocks)
        .innerJoin(produits, eq(stocks.produitId, produits.id))
        .where(and(eq(stocks.agenceId, ctx.user.agenceId), eq(stocks.emplacementId, input.emplacementId)))
        .orderBy(produits.titre);
      return rows.map(r => ({ ...r, quantite: Number(r.quantite), valeur: Number(r.quantite) * Number(r.cmup ?? 0) }));
    }),

  // â”€â”€â”€ Inventaire initial (specs 04 Â§1 : stock de dÃ©part historisÃ©) â”€â”€â”€
  createInventaireInitial: requirePermissionProcedure("stock.inventaire")
    .input(z.object({
      libelle: z.string().default("Inventaire initial"),
      lignes: z.array(z.object({
        produitId: z.number().int(),
        emplacementId: z.number().int().optional(),
        quantitePhysique: z.number().min(0),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [session] = await tx.insert(inventairesSessions).values({
          agenceId: ctx.user.agenceId,
          libelle: input.libelle,
          statut: "en_cours",
          effectuePar: Number(ctx.user.id),
          notes: "Inventaire initial â€” stock de dÃ©part",
        } as any).returning();

        const groupeOperationId = crypto.randomUUID();
        let comptees = 0;

        for (const ligne of input.lignes) {
          // QuantitÃ© thÃ©orique actuelle (souvent 0 au dÃ©marrage)
          const [theo] = await tx
            .select({ quantite: stocks.quantite })
            .from(stocks)
            .where(and(
              eq(stocks.produitId, ligne.produitId),
              eq(stocks.agenceId, ctx.user.agenceId),
              ligne.emplacementId ? eq(stocks.emplacementId, ligne.emplacementId) : isNull(stocks.emplacementId),
            ))
            .limit(1);
          const quantiteTheorique = theo ? Number(theo.quantite) : 0;
          const ecart = ligne.quantitePhysique - quantiteTheorique;

          await tx.insert(inventaires).values({
            sessionId: session.id,
            produitId: ligne.produitId,
            agenceId: ctx.user.agenceId,
            quantiteTheorique: String(quantiteTheorique),
            quantiteReelle: String(ligne.quantitePhysique),
            ecart: String(ecart),
            commentaire: "Inventaire initial",
            effectuePar: Number(ctx.user.id),
          } as any);

          if (ecart !== 0) {
            const type = ecart > 0
              ? TYPES_MOUVEMENT.AJUSTEMENT_INVENTAIRE_POSITIF
              : TYPES_MOUVEMENT.AJUSTEMENT_INVENTAIRE_NEGATIF;
            await enregistrerMouvement(tx as any, {
              type: type as any,
              sens: ecart > 0 ? "E" : "S",
              produitId: ligne.produitId,
              agenceId: ctx.user.agenceId,
              quantite: Math.abs(ecart),
              emplacementId: ligne.emplacementId ?? null,
              groupeOperationId,
              reference: `INV-INIT-${session.id}`,
              referenceType: "INVENTAIRE",
              documentLie: `INV-INIT-${session.id}`,
              motif: `Inventaire initial (Ã©cart ${ecart > 0 ? "+" : ""}${ecart})`,
              effectuePar: Number(ctx.user.id),
            });
          }
          comptees++;
        }

        await tx.update(inventairesSessions)
          .set({ statut: "valide", validePar: ctx.user.id, dateFin: new Date() } as any)
          .where(eq(inventairesSessions.id, session.id));

        return { sessionId: session.id, lignesComptees: comptees };
      }) as any;
    }),

  // ─── Sortie de pièce liée à un OR (specs V2 §04 processus 4, §05 règle 6) ───
  sortirPourOR: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      orId: z.number().int(),
      produitId: z.number().int(),
      quantite: z.number().positive(),
      uniteId: z.string().optional(),
      emplacementId: z.number().int().optional(),
      motif: z.string().min(3).optional().or(z.literal("")),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx
          .select({ id: ordresReparation.id, numero: ordresReparation.numero, vehiculeId: ordresReparation.vehiculeId, statut: ordresReparation.statut })
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "BAD_REQUEST", message: "Ordre de réparation introuvable." });
        if (or.statut === "annule" || or.statut === "termine" || or.statut === "facture") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible de sortir des pièces sur un OR ${or.statut}.` });
        }

        const [prod] = await tx
          .select({ titre: produitsTable.titre })
          .from(produitsTable)
          .where(eq(produitsTable.id, input.produitId))
          .limit(1);
        if (!prod) throw new TRPCError({ code: "BAD_REQUEST", message: "Produit introuvable." });

        // Specs V2 §05 règle 8 : blocage si stock périmé (produits suivis par lots)
        await verifierDispoNonPerimee(tx as any, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          quantite: input.quantite,
        });

        const res = await sortirPourOR(tx as any, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          quantite: input.quantite,
          orId: or.id,
          vehiculeId: or.vehiculeId,
          numeroOR: or.numero,
          uniteId: input.uniteId,
          emplacementId: input.emplacementId,
          motif: input.motif || undefined,
          effectuePar: Number(ctx.user.id),
        });

        return { stockAvant: res.stockAvant, stockApres: res.stockApres, orId: or.id, numeroOR: or.numero, produitTitre: prod.titre };
      }) as any;
    }),

  // ─── Retour de pièce depuis l'atelier (specs V2 processus, cas particulier V1 §05) ───
  retourAtelier: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      orId: z.number().int(),
      produitId: z.number().int(),
      quantite: z.number().positive(),
      uniteId: z.string().optional(),
      emplacementId: z.number().int().optional(),
      motif: z.string().min(3).optional().or(z.literal("")),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx
          .select({ id: ordresReparation.id, numero: ordresReparation.numero, vehiculeId: ordresReparation.vehiculeId })
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "BAD_REQUEST", message: "Ordre de réparation introuvable." });

        const res = await retourAtelier(tx as any, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          quantite: input.quantite,
          orId: or.id,
          vehiculeId: or.vehiculeId,
          numeroOR: or.numero,
          uniteId: input.uniteId,
          emplacementId: input.emplacementId,
          motif: input.motif || undefined,
          effectuePar: Number(ctx.user.id),
        });

        return { stockAvant: res.stockAvant, stockApres: res.stockApres, orId: or.id, numeroOR: or.numero };
      }) as any;
    }),

  // ─── Historique des mouvements d'un OR (specs V2 : traçabilité) ───
  listMouvementsParOR: requirePermissionProcedure("stock.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: mouvementsStock.id,
          produitId: mouvementsStock.produitId,
          type: mouvementsStock.type,
          sens: mouvementsStock.sens,
          quantite: mouvementsStock.quantite,
          stockAvant: mouvementsStock.stockAvant,
          stockApres: mouvementsStock.stockApres,
          dateMouvement: mouvementsStock.dateMouvement,
          motif: mouvementsStock.motif,
          documentLie: mouvementsStock.documentLie,
          produitTitre: produitsTable.titre,
        })
        .from(mouvementsStock)
        .leftJoin(produitsTable, eq(mouvementsStock.produitId, produitsTable.id))
        .where(and(eq(mouvementsStock.orId, input.orId), eq(mouvementsStock.agenceId, ctx.user.agenceId)))
        .orderBy(desc(mouvementsStock.dateMouvement));
      return rows.map((r) => ({ ...r, quantite: Number(r.quantite), stockAvant: Number(r.stockAvant), stockApres: Number(r.stockApres) }));
    }),

  // ─── Réservation de stock pour un OR (specs V2 §04 processus 5) ───
  reserverStock: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      orId: z.number().int(),
      produitId: z.number().int(),
      quantite: z.number().positive(),
      uniteId: z.string().optional(),
      emplacementId: z.number().int().optional(),
      motif: z.string().min(3).optional().or(z.literal("")),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx
          .select({ id: ordresReparation.id, numero: ordresReparation.numero, vehiculeId: ordresReparation.vehiculeId, statut: ordresReparation.statut })
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "BAD_REQUEST", message: "Ordre de réparation introuvable." });
        if (or.statut === "annule" || or.statut === "termine" || or.statut === "facture") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible de réserver des pièces sur un OR ${or.statut}.` });
        }
        // Specs V2 §05 règle 8 : on ne réserve pas de stock périmé
        await verifierDispoNonPerimee(tx as any, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          quantite: input.quantite,
        });
        return await reserverStock(tx as any, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          quantite: input.quantite,
          orId: or.id,
          vehiculeId: or.vehiculeId,
          numeroOR: or.numero,
          uniteId: input.uniteId,
          emplacementId: input.emplacementId,
          motif: input.motif || undefined,
          effectuePar: Number(ctx.user.id),
        });
      }) as any;
    }),

  // ─── Libération de réservation (specs V2 §04 processus 5) ───
  libererStock: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      orId: z.number().int(),
      produitId: z.number().int(),
      quantite: z.number().positive(),
      uniteId: z.string().optional(),
      emplacementId: z.number().int().optional(),
      motif: z.string().min(3).optional().or(z.literal("")),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx
          .select({ id: ordresReparation.id, numero: ordresReparation.numero, vehiculeId: ordresReparation.vehiculeId })
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "BAD_REQUEST", message: "Ordre de réparation introuvable." });
        return await libererStock(tx as any, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          quantite: input.quantite,
          orId: or.id,
          vehiculeId: or.vehiculeId,
          numeroOR: or.numero,
          uniteId: input.uniteId,
          emplacementId: input.emplacementId,
          motif: input.motif || undefined,
          effectuePar: Number(ctx.user.id),
        });
      }) as any;
    }),

  // ─── Alertes DLC / péremption (specs V2 §05 règle 8, §07 couleurs) ───
  dlcAlertes: requirePermissionProcedure("stock.consulter")
    .input(z.object({ seuilJours: z.number().int().positive().default(30) }))
    .query(async ({ ctx, input }) => {
      return listerAlertesDlc(ctx.user.agenceId, input.seuilJours);
    }),

  // ─── Échange standard (CORES) : specs V2 §04 processus 8, §05 règle 9 ───
  creerEchangeCore: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      orId: z.number().int(),
      produitId: z.number().int(),
      quantite: z.number().positive(),
      valeurCore: z.number().nonnegative(),
      motif: z.string().min(3).optional().or(z.literal("")),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx
          .select({ id: ordresReparation.id, numero: ordresReparation.numero, vehiculeId: ordresReparation.vehiculeId, statut: ordresReparation.statut })
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "BAD_REQUEST", message: "Ordre de réparation introuvable." });
        if (or.statut === "annule" || or.statut === "termine" || or.statut === "facture") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible de créer un échange sur un OR ${or.statut}.` });
        }
        await verifierDispoNonPerimee(tx as any, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          quantite: input.quantite,
        });
        return creerEchangeCore(tx as any, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          quantite: input.quantite,
          orId: or.id,
          vehiculeId: or.vehiculeId,
          numeroOR: or.numero,
          valeurCore: input.valeurCore,
          motif: input.motif || undefined,
          effectuePar: Number(ctx.user.id),
        });
      }) as any;
    }),

  retournerCoquille: requirePermissionProcedure("stock.modifier")
    .input(z.object({ echangeId: z.number().int(), perdue: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        return retournerCoquille(tx as any, {
          echangeId: input.echangeId,
          agenceId: ctx.user.agenceId,
          perdue: input.perdue,
          effectuePar: Number(ctx.user.id),
        });
      }) as any;
    }),

  listerCores: requirePermissionProcedure("stock.consulter")
    .input(z.object({ orId: z.number().int().optional(), statut: z.string().optional(), limit: z.number().int().default(100) }))
    .query(async ({ ctx, input }) => {
      return listerCores(ctx.user.agenceId, input);
    }),
});

