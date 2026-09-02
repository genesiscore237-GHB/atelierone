import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db, produits, categories, stocks, stocksUnites, stocksLots, lots, unitesMesure, pretsOutils, employes, mouvementsStock } from "@atelierone/db";
import { eq, and, desc, asc, sql, or, ilike, inArray, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { enregistrerMouvement, TYPES_MOUVEMENT } from "~/server/lib/stock-engine";

/**
 * OUTILLAGE & MATÉRIEL — outils prêtés aux techniciens + consommables.
 * OUTIL : prêt (sortie → retour) — CONSOMMABLE : stock classique.
 * Statuts d'outil (specs garage) : REPARATION | USE | CASSE | PERDU | VOLE | REFORME
 * Le prêt décrémente la quantité disponible, le retour OK la réintègre.
 * Permission mécanicien : stock.utiliser (sortir/rendre) — stock.modifier (gestion).
 */

/** Décrémente (ou incrémente) le stock d'un outil d'une unité + mouvement tracé. */
async function ajusterStockOutil(tx: any, outilId: number, agenceId: number, sens: "E" | "S", type: string, motif: string, par: number) {
  const [stockRow] = await tx
    .select({ id: stocks.id, quantite: stocks.quantite })
    .from(stocks)
    .where(and(eq(stocks.produitId, outilId), eq(stocks.agenceId, agenceId)))
    .limit(1);
  const stockAvant = stockRow ? Number(stockRow.quantite) : 0;
  if (sens === "S" && stockAvant <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Stock disponible insuffisant pour cet outil." });
  }
  const stockApres = sens === "S" ? stockAvant - 1 : stockAvant + 1;
  if (stockRow) {
    await tx.update(stocks).set({ quantite: String(stockApres) }).where(eq(stocks.id, stockRow.id));
  } else {
    await tx.insert(stocks).values({ produitId: outilId, agenceId, emplacementId: 2, quantite: String(stockApres), quantiteReservee: 0 } as any);
  }
  await tx.insert(mouvementsStock).values({
    produitId: outilId,
    agenceId,
    type,
    sens,
    quantite: "1",
    stockAvant: String(stockAvant),
    stockApres: String(stockApres),
    motif,
    effectuePar: par,
  } as any);
}

const STATUT_OUTIL_META: Record<string, string> = {
  REPARATION: "En réparation",
  USE: "Usé",
  CASSE: "Cassé",
  PERDU: "Perdu",
  VOLE: "Volé",
  REFORME: "Réformé",
};

export const outillageRouter = createTRPCRouter({
  /** Liste des outils / consommables avec recherche, stock et statut. */
  list: requirePermissionProcedure("stock.consulter")
    .input(
      z.object({
        q: z.string().optional(),
        type: z.enum(["OUTIL", "CONSOMMABLE"]).optional(),
        categorieId: z.number().int().optional(),
        statut: z.enum(["TOUS", "DISPONIBLE", "PRETE", "STOCK_EPUISE", "REPARATION", "USE", "CASSE", "PERDU", "VOLE", "REFORME"]).optional(),
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
          statutOutil: produits.statutOutil,
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
        // Statut specs garage prioritaire (usé, cassé, perdu, volé, en réparation, réformé)
        const statutSpecial = r.statutOutil ?? null;
        const statut = statutSpecial
          ? statutSpecial
          : r.typeProduit === "OUTIL" ? (estPrete ? "PRETE" : stock > 0 ? "DISPONIBLE" : "STOCK_EPUISE") : stock > 0 ? "DISPONIBLE" : "STOCK_EPUISE";
        return {
          ...r,
          stockTotal: stock,
          prets: pretsActifs,
          estPrete,
          statut,
          statutLabel: statutSpecial ? STATUT_OUTIL_META[statutSpecial] ?? statutSpecial : null,
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
          statutOutil: produits.statutOutil,
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

      const [stocksLignes, pretsHisto, mouvements, stockParUnite, futs] = await Promise.all([
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
        // Fûts / lots (specs huiles : volume initial / restant, ouvert / fermé)
        db
          .select({
            lotId: lots.id,
            numeroLot: lots.numeroLot,
            volumeInitial: lots.quantiteInitiale,
            volumeRestant: stocksLots.quantite,
            datePeremption: lots.datePeremption,
            dateReception: lots.dateReception,
            statut: lots.statut,
          })
          .from(stocksLots)
          .innerJoin(lots, eq(stocksLots.lotId, lots.id))
          .where(and(eq(stocksLots.produitId, input.id), eq(stocksLots.agenceId, ctx.user.agenceId))),
      ]);

      const pretsActifs = pretsHisto.filter((h) => h.actif);
      const now = new Date();
      return {
        outil: p,
        stock: stocksLignes.map((s) => ({ emplacementId: s.emplacementId, quantite: Number(s.quantite) })),
        stockTotal: stocksLignes.reduce((acc, s) => acc + Number(s.quantite), 0),
        stockParUnite: stockParUnite.map((u) => ({ uniteId: u.uniteId, code: u.uniteCode, libelle: u.uniteLibelle, symbole: u.uniteSymbole, quantite: Number(u.quantite) })),
        futs: futs.map((f) => ({
          lotId: f.lotId,
          numeroLot: f.numeroLot,
          volumeInitial: Number(f.volumeInitial ?? 0),
          volumeRestant: Number(f.volumeRestant ?? 0),
          datePeremption: f.datePeremption,
          dateReception: f.dateReception,
          ouvert: f.statut !== "CLOTURE",
        })),
        pretsActifs,
        historiquePrets: pretsHisto.map((h) => ({ ...h, enRetard: !!h.actif && !!h.dateRetour && new Date(h.dateRetour) < now })),
        mouvements,
      };
    }),

  /** Prêt d'un outil à un technicien. */
  preter: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      outilId: z.number().int(),
      technicienId: z.number().int(),
      orId: z.number().int().optional(),
      motif: z.string().optional(),
      dateRetour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({ id: produits.id, typeProduit: produits.typeProduit, statutOutil: produits.statutOutil })
          .from(produits)
          .where(eq(produits.id, input.outilId))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
        if (p.typeProduit !== "OUTIL") throw new TRPCError({ code: "BAD_REQUEST", message: "Seul un outil (type OUTIL) peut être prêté." });
        if (p.statutOutil) throw new TRPCError({ code: "BAD_REQUEST", message: `Outil non disponible : ${STATUT_OUTIL_META[p.statutOutil] ?? p.statutOutil} — il ne peut pas être prêté.` });

        const [dejaPrete] = await tx
          .select({ id: pretsOutils.id })
          .from(pretsOutils)
          .where(and(eq(pretsOutils.outilId, input.outilId), eq(pretsOutils.actif, true)))
          .limit(1);
        if (dejaPrete) throw new TRPCError({ code: "BAD_REQUEST", message: "Cet outil est déjà prêté — il doit d'abord être rendu." });

        const [tech] = await tx.select({ id: employes.id }).from(employes).where(eq(employes.id, input.technicienId)).limit(1);
        if (!tech) throw new TRPCError({ code: "NOT_FOUND", message: "Technicien introuvable." });

        // Specs garage : quantity_available diminue de 1 (le stock est contrôlé)
        await ajusterStockOutil(tx, input.outilId, ctx.user.agenceId, "S", TYPES_MOUVEMENT.SORTIE_OUTIL, `Prêt à technicien — retour prévu ${input.dateRetour}`, Number(ctx.user.id));

        const [row] = await tx
          .insert(pretsOutils)
          .values({
            agenceId: ctx.user.agenceId,
            outilId: input.outilId,
            technicienId: input.technicienId,
            orId: input.orId ?? null,
            motif: input.motif ?? null,
            dateSortie: new Date(),
            dateRetour: new Date(`${input.dateRetour}T18:00:00`),
            sortiePar: Number(ctx.user.id),
            actif: true,
          } as any)
          .returning();
        return row;
      }) as any;
    }),

  /** Retour d'un outil (état + remarque). Specs : notes obligatoires si état ≠ OK. */
  retourner: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      pretId: z.number().int(),
      etatRetour: z.enum(["OK", "ENDOMMAGE", "PERDU"]).default("OK"),
      remarque: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.etatRetour !== "OK" && (!input.remarque || input.remarque.trim().length < 3)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Une remarque (min 3 caractères) est obligatoire quand l'outil revient endommagé ou perdu." });
      }
      return db.transaction(async (tx) => {
        const [pret] = await tx
          .select()
          .from(pretsOutils)
          .where(and(eq(pretsOutils.id, input.pretId), eq(pretsOutils.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!pret) throw new TRPCError({ code: "NOT_FOUND", message: "Prêt introuvable." });
        if (!pret.actif) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce prêt est déjà rendu." });

        const [p] = await tx.select({ statutOutil: produits.statutOutil }).from(produits).where(eq(produits.id, pret.outilId)).limit(1);

        // Specs : retour OK → quantité disponible +1, statut disponible ;
        // Endommagé → statut CASSE ; Perdu → statut PERDU + déduction
        if (input.etatRetour === "OK") {
          await ajusterStockOutil(tx, pret.outilId, ctx.user.agenceId, "E", TYPES_MOUVEMENT.RETOUR_OUTIL, `Retour OK — ${input.remarque ?? "bon état"}`, Number(ctx.user.id));
          await tx.update(produits).set({ statutOutil: null } as any).where(eq(produits.id, pret.outilId));
        } else if (input.etatRetour === "ENDOMMAGE") {
          await tx.update(produits).set({ statutOutil: "CASSE" } as any).where(eq(produits.id, pret.outilId));
        } else {
          await ajusterStockOutil(tx, pret.outilId, ctx.user.agenceId, "S", TYPES_MOUVEMENT.RETOUR_OUTIL, `Outil perdu (non rendu) — ${input.remarque}`, Number(ctx.user.id));
          await tx.update(produits).set({ statutOutil: "PERDU" } as any).where(eq(produits.id, pret.outilId));
        }

        await tx
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
      }) as any;
    }),

  /** Déclaration directe (fiche outil / retard) : perdu, volé, cassé, usé, en réparation, réformé. */
  declarerStatut: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      outilId: z.number().int(),
      statut: z.enum(["REPARATION", "USE", "CASSE", "PERDU", "VOLE", "REFORME"]),
      motif: z.string().min(3),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({ id: produits.id, typeProduit: produits.typeProduit, statutOutil: produits.statutOutil })
          .from(produits)
          .where(eq(produits.id, input.outilId))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
        if (p.typeProduit !== "OUTIL") throw new TRPCError({ code: "BAD_REQUEST", message: "Seul un outil peut être déclaré." });

        // Perte / vol / casse / réforme → déduction d'une unité (specs : quantity_available ajustée)
        if (["PERDU", "VOLE", "CASSE", "REFORME"].includes(input.statut)) {
          await ajusterStockOutil(tx, input.outilId, ctx.user.agenceId, "S", TYPES_MOUVEMENT.RETOUR_OUTIL, `${STATUT_OUTIL_META[input.statut]} — ${input.motif}`, Number(ctx.user.id));
        }
        await tx.update(produits).set({ statutOutil: input.statut } as any).where(eq(produits.id, input.outilId));
        return { success: true, statutLabel: STATUT_OUTIL_META[input.statut] };
      }) as any;
    }),

  /** Retour d'un outil à l'état disponible (levée d'un statut spécial, ex. fin de réparation). */
  leverStatut: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({ outilId: z.number().int(), motif: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx.select({ id: produits.id }).from(produits).where(eq(produits.id, input.outilId)).limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
        const [pret] = await tx.select({ id: pretsOutils.id }).from(pretsOutils).where(and(eq(pretsOutils.outilId, input.outilId), eq(pretsOutils.actif, true))).limit(1);
        if (pret) throw new TRPCError({ code: "BAD_REQUEST", message: "Cet outil est en prêt — il doit d'abord être rendu." });
        await tx.update(produits).set({ statutOutil: null } as any).where(eq(produits.id, input.outilId));
        return { success: true };
      }) as any;
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