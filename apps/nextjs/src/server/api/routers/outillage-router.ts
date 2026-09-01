import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db, produits, categories, stocks, stocksUnites, unitesMesure, pretsOutils, employes, mouvementsStock } from "@atelierone/db";
import { eq, and, desc, asc, sql, or, ilike, inArray, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * OUTILLAGE & MATÉRIEL — outils prêtés aux techniciens + consommables.
 * OUTIL : prêt (sortie → retour) — CONSOMMABLE : stock classique.
 */

export const outillageRouter = createTRPCRouter({
  /** Liste des outils / consommables avec recherche, stock et statut. */
  list: requirePermissionProcedure("stock.consulter")
    .input(
      z.object({
        q: z.string().optional(),
        type: z.enum(["OUTIL", "CONSOMMABLE"]).optional(),
        categorieId: z.number().int().optional(),
        statut: z.enum(["TOUS", "DISPONIBLE", "PRETE", "STOCK_EPUISE"]).optional(),
        limit: z.number().int().min(10).max(300).default(100),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [
        eq(produits.isActive, true),
        inArray(produits.typeProduit, safe.type ? [safe.type] : ["OUTIL", "CONSOMMABLE"]),
      ];
      if (safe.categorieId) conditions.push(eq(produits.categorieId, safe.categorieId));
      if (safe.q?.trim()) {
        const q = `%${safe.q.trim()}%`;
        conditions.push(
          or(
            ilike(produits.titre, q),
            ilike(produits.codeBarre, q),
            ilike(produits.codeArticle, q),
            ilike(produits.designationCourte, q),
          )!
        );
      }

      const rows = await db
        .select({
          id: produits.id,
          typeProduit: produits.typeProduit,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          codeArticle: produits.codeArticle,
          designationCourte: produits.designationCourte,
          marque: produits.marque,
          etat: produits.etat,
          description: produits.description,
          categorieId: produits.categorieId,
          categorieNom: categories.nom,
          emplacementPrincipalId: produits.emplacementPrincipalId,
          seuilAlerte: produits.seuilAlerte,
          photos: produits.photos,
          imageUrl: produits.imageUrl,
          stockTotal: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)`,
        })
        .from(produits)
        .leftJoin(categories, eq(produits.categorieId, categories.id))
        .leftJoin(stocks, and(eq(stocks.produitId, produits.id), eq(stocks.agenceId, ctx.user.agenceId)))
        .where(and(...conditions))
        .groupBy(produits.id, categories.nom)
        .orderBy(produits.titre);

      // Prêts actifs par outil (avec date de retour prévue → détection des retards)
      const ids = rows.map((r) => r.id);
      const prets = ids.length
        ? await db
            .select({
              id: pretsOutils.id,
              outilId: pretsOutils.outilId,
              technicienNom: employes.nom,
              technicienPrenom: employes.prenom,
              dateSortie: pretsOutils.dateSortie,
              dateRetour: pretsOutils.dateRetour,
            })
            .from(pretsOutils)
            .leftJoin(employes, eq(pretsOutils.technicienId, employes.id))
            .where(and(inArray(pretsOutils.outilId, ids), eq(pretsOutils.actif, true)))
        : [];
      const now = new Date();
      const pretsParOutil = new Map<number, { id: number; technicien: string; dateSortie: Date | null; dateRetour: Date | null; enRetard: boolean }[]>();
      for (const p of prets) {
        const cur = pretsParOutil.get(p.outilId) ?? [];
        cur.push({
          id: p.id,
          technicien: `${p.technicienPrenom ?? ""} ${p.technicienNom ?? ""}`.trim(),
          dateSortie: p.dateSortie,
          dateRetour: p.dateRetour,
          enRetard: !!p.dateRetour && new Date(p.dateRetour) < now,
        });
        pretsParOutil.set(p.outilId, cur);
      }

      const result = rows.map((r) => {
        const stock = Number(r.stockTotal ?? 0);
        const pretsActifs = pretsParOutil.get(r.id) ?? [];
        const estPrete = pretsActifs.length > 0;
        const statut = r.typeProduit === "OUTIL" ? (estPrete ? "PRETE" : stock > 0 ? "DISPONIBLE" : "STOCK_EPUISE") : stock > 0 ? "DISPONIBLE" : "STOCK_EPUISE";
        return {
          ...r,
          stockTotal: stock,
          prets: pretsActifs,
          estPrete,
          statut,
        };
      });

      if (safe.statut && safe.statut !== "TOUS") {
        return result.filter((r) => r.statut === safe.statut);
      }
      return result;
    }),

  /** Fiche outil : infos + prêts historisés + mouvements de stock. */
  get: requirePermissionProcedure("stock.consulter")
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [p] = await db
        .select({
          id: produits.id,
          typeProduit: produits.typeProduit,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          codeArticle: produits.codeArticle,
          designationCourte: produits.designationCourte,
          marque: produits.marque,
          etat: produits.etat,
          description: produits.description,
          categorieId: produits.categorieId,
          categorieNom: categories.nom,
          emplacementPrincipalId: produits.emplacementPrincipalId,
          seuilAlerte: produits.seuilAlerte,
          photos: produits.photos,
          imageUrl: produits.imageUrl,
          estReconditionnable: produits.estReconditionnable,
          valeurCore: produits.valeurCore,
          estCore: produits.estCore,
        })
        .from(produits)
        .leftJoin(categories, eq(produits.categorieId, categories.id))
        .where(eq(produits.id, input.id))
        .limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });

      const [stocksLignes, pretsHisto, mouvements, stockParUnite] = await Promise.all([
        db
          .select({ emplacementId: stocks.emplacementId, quantite: stocks.quantite })
          .from(stocks)
          .where(and(eq(stocks.produitId, input.id), eq(stocks.agenceId, ctx.user.agenceId))),
        db
          .select({
            id: pretsOutils.id,
            technicienNom: employes.nom,
            technicienPrenom: employes.prenom,
            dateSortie: pretsOutils.dateSortie,
            dateRetour: pretsOutils.dateRetour,
            retourneLe: pretsOutils.retourneLe,
            etatRetour: pretsOutils.etatRetour,
            motif: pretsOutils.motif,
            remarque: pretsOutils.remarque,
            actif: pretsOutils.actif,
            orId: pretsOutils.orId,
          })
          .from(pretsOutils)
          .leftJoin(employes, eq(pretsOutils.technicienId, employes.id))
          .where(eq(pretsOutils.outilId, input.id))
          .orderBy(desc(pretsOutils.dateSortie))
          .limit(50),
        db
          .select({ id: mouvementsStock.id, type: mouvementsStock.type, quantite: mouvementsStock.quantite, dateMouvement: mouvementsStock.dateMouvement, motif: mouvementsStock.motif })
          .from(mouvementsStock)
          .where(eq(mouvementsStock.produitId, input.id))
          .orderBy(desc(mouvementsStock.dateMouvement))
          .limit(30),
        db
          .select({
            uniteId: stocksUnites.uniteId,
            uniteCode: unitesMesure.code,
            uniteLibelle: unitesMesure.libelle,
            uniteSymbole: unitesMesure.symbole,
            quantite: stocksUnites.quantite,
          })
          .from(stocksUnites)
          .leftJoin(unitesMesure, eq(stocksUnites.uniteId, unitesMesure.id))
          .where(and(eq(stocksUnites.produitId, input.id), eq(stocksUnites.agenceId, ctx.user.agenceId))),
      ]);

      const pretsActifs = pretsHisto.filter((h) => h.actif);
      const now = new Date();
      return {
        outil: p,
        stock: stocksLignes.map((s) => ({ emplacementId: s.emplacementId, quantite: Number(s.quantite) })),
        stockTotal: stocksLignes.reduce((acc, s) => acc + Number(s.quantite), 0),
        stockParUnite: stockParUnite.map((u) => ({ uniteId: u.uniteId, code: u.uniteCode, libelle: u.uniteLibelle, symbole: u.uniteSymbole, quantite: Number(u.quantite) })),
        pretsActifs,
        historiquePrets: pretsHisto.map((h) => ({ ...h, enRetard: !!h.actif && !!h.dateRetour && new Date(h.dateRetour) < now })),
        mouvements,
      };
    }),

  /** Prêt d'un outil à un technicien. */
  preter: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      outilId: z.number().int(),
      technicienId: z.number().int(),
      orId: z.number().int().optional(),
      motif: z.string().optional(),
      dateRetour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [p] = await db
        .select({ id: produits.id, typeProduit: produits.typeProduit })
        .from(produits)
        .where(eq(produits.id, input.outilId))
        .limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
      if (p.typeProduit !== "OUTIL") throw new TRPCError({ code: "BAD_REQUEST", message: "Seul un outil (type OUTIL) peut être prêté." });

      const [dejaPrete] = await db
        .select({ id: pretsOutils.id })
        .from(pretsOutils)
        .where(and(eq(pretsOutils.outilId, input.outilId), eq(pretsOutils.actif, true)))
        .limit(1);
      if (dejaPrete) throw new TRPCError({ code: "BAD_REQUEST", message: "Cet outil est déjà prêté — il doit d'abord être rendu." });

      const [tech] = await db.select({ id: employes.id }).from(employes).where(eq(employes.id, input.technicienId)).limit(1);
      if (!tech) throw new TRPCError({ code: "NOT_FOUND", message: "Technicien introuvable." });

      const [row] = await db
        .insert(pretsOutils)
        .values({
          agenceId: ctx.user.agenceId,
          outilId: input.outilId,
          technicienId: input.technicienId,
          orId: input.orId ?? null,
          motif: input.motif ?? null,
          dateSortie: new Date(),
          dateRetour: input.dateRetour ? new Date(`${input.dateRetour}T18:00:00`) : null,
          sortiePar: Number(ctx.user.id),
          actif: true,
        } as any)
        .returning();
      return row;
    }),

  /** Retour d'un outil (état + remarque). */
  retourner: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      pretId: z.number().int(),
      etatRetour: z.enum(["OK", "ENDOMMAGE", "PERDU"]).default("OK"),
      remarque: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [pret] = await db
        .select()
        .from(pretsOutils)
        .where(and(eq(pretsOutils.id, input.pretId), eq(pretsOutils.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!pret) throw new TRPCError({ code: "NOT_FOUND", message: "Prêt introuvable." });
      if (!pret.actif) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce prêt est déjà rendu." });
      await db
        .update(pretsOutils)
        .set({
          actif: false,
          retourneLe: new Date(),
          retournePar: Number(ctx.user.id),
          etatRetour: input.etatRetour,
          remarque: input.remarque ?? null,
        } as any)
        .where(eq(pretsOutils.id, input.pretId));
      return { success: true };
    }),

  /** Historique des prêts (par technicien ou global). */
  historiquePrets: requirePermissionProcedure("stock.consulter")
    .input(z.object({ technicienId: z.number().int().optional(), limit: z.number().int().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const rows = await db
        .select({
          id: pretsOutils.id,
          outilTitre: produits.titre,
          outilCode: produits.codeBarre,
          technicienNom: employes.nom,
          technicienPrenom: employes.prenom,
          dateSortie: pretsOutils.dateSortie,
          dateRetour: pretsOutils.dateRetour,
          retourneLe: pretsOutils.retourneLe,
          etatRetour: pretsOutils.etatRetour,
          motif: pretsOutils.motif,
          remarque: pretsOutils.remarque,
          orId: pretsOutils.orId,
          actif: pretsOutils.actif,
        })
        .from(pretsOutils)
        .leftJoin(produits, eq(pretsOutils.outilId, produits.id))
        .leftJoin(employes, eq(pretsOutils.technicienId, employes.id))
        .where(and(eq(pretsOutils.agenceId, ctx.user.agenceId), input?.technicienId ? eq(pretsOutils.technicienId, input.technicienId) : undefined))
        .orderBy(desc(pretsOutils.dateSortie))
        .limit(input?.limit ?? 50);
      return rows.map((r) => ({ ...r, enRetard: !!r.actif && !!r.dateRetour && new Date(r.dateRetour) < now }));
    }),

  /** Prêts en cours (avec retards) — pour les alertes du magasinier. */
  pretsEnCours: requirePermissionProcedure("stock.consulter")
    .query(async ({ ctx }) => {
      const now = new Date();
      const rows = await db
        .select({
          id: pretsOutils.id,
          outilTitre: produits.titre,
          outilCode: produits.codeBarre,
          technicienNom: employes.nom,
          technicienPrenom: employes.prenom,
          dateSortie: pretsOutils.dateSortie,
          dateRetour: pretsOutils.dateRetour,
          motif: pretsOutils.motif,
          orId: pretsOutils.orId,
        })
        .from(pretsOutils)
        .leftJoin(produits, eq(pretsOutils.outilId, produits.id))
        .leftJoin(employes, eq(pretsOutils.technicienId, employes.id))
        .where(and(eq(pretsOutils.agenceId, ctx.user.agenceId), eq(pretsOutils.actif, true)))
        .orderBy(asc(pretsOutils.dateSortie));
      return rows.map((r) => ({
        ...r,
        enRetard: !!r.dateRetour && new Date(r.dateRetour) < now,
        joursEcoules: Math.max(0, Math.floor((now.getTime() - new Date(r.dateSortie).getTime()) / 86400000)),
      }));
    }),
});