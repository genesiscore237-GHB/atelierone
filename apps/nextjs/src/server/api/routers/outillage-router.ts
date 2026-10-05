import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db, produits, categories, stocks, stocksUnites, stocksLots, lots, unitesMesure, pretsOutils, employes, mouvementsStock, emplacements, outillageCalibration, outillageMaintenance } from "@atelierone/db";
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
async function ajusterStockOutil(tx: any, outilId: number, agenceId: number, sens: "E" | "S", type: string, motif: string, par: number, emplacementId?: number) {
  const [stockRow] = await tx
    .select({ id: stocks.id, quantite: stocks.quantite })
    .from(stocks)
    .where(and(eq(stocks.produitId, outilId), eq(stocks.agenceId, agenceId), emplacementId ? eq(stocks.emplacementId, emplacementId) : undefined))
    .limit(1);
  const stockAvant = stockRow ? Number(stockRow.quantite) : 0;
  if (sens === "S" && stockAvant <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Stock disponible insuffisant pour cet outil." });
  }
  const stockApres = sens === "S" ? stockAvant - 1 : stockAvant + 1;
  if (stockRow) {
    await tx.update(stocks).set({ quantite: String(stockApres) }).where(eq(stocks.id, stockRow.id));
  } else {
    await tx.insert(stocks).values({ produitId: outilId, agenceId, emplacementId: emplacementId ?? 2, quantite: String(stockApres), quantiteReservee: 0 } as any);
  }
  await tx.insert(mouvementsStock).values({
    produitId: outilId,
    agenceId,
    type,
    sens,
    quantite: "1",
    stockAvant: String(stockAvant),
    stockApres: String(stockApres),
    emplacementId: emplacementId ?? 2,
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

/** Emplacement « Bureau du magasinier » de l'agence (créé à la première utilisation). */
async function getOrCreateBureau(q: any, agenceId: number): Promise<{ id: number; libelle: string | null }> {
  const [bureau] = await q
    .select({ id: emplacements.id, libelle: emplacements.libelle })
    .from(emplacements)
    .where(and(eq(emplacements.agenceId, agenceId), eq(emplacements.code, "BUREAU")))
    .limit(1);
  if (bureau) return bureau;
  const [row] = await q
    .insert(emplacements)
    .values({ agenceId, type: "BUREAU", code: "BUREAU", libelle: "Bureau du magasinier", ordre: 999, profondeur: 0 } as any)
    .returning({ id: emplacements.id, libelle: emplacements.libelle });
  return row;
}

export const outillageRouter = createTRPCRouter({
  /** Liste des outils / consommables avec recherche, stock et statut. */
  list: requirePermissionProcedure("stock.consulter")
    .input(
      z.object({
        q: z.string().optional(),
        type: z.enum(["OUTIL", "CONSOMMABLE", "EQUIPEMENT"]).optional(),
        categorieId: z.number().int().optional(),
        statut: z.enum(["TOUS", "DISPONIBLE", "PRETE", "STOCK_EPUISE", "REPARATION", "USE", "CASSE", "PERDU", "VOLE", "REFORME"]).optional(),
        limit: z.number().int().min(10).max(300).default(100),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [
        eq(produits.isActive, true),
        inArray(produits.typeProduit, safe.type ? [safe.type] : ["OUTIL", "CONSOMMABLE", "EQUIPEMENT"]),
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
          calibrable: produits.calibrable,
        })
        .from(produits)
        .leftJoin(categories, eq(produits.categorieId, categories.id))
        .where(eq(produits.id, input.id))
        .limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });

      const [stocksLignes, pretsHisto, mouvements, stockParUnite, futs, calibrations] = await Promise.all([
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
        // Calibration des instruments de mesure (échéances, certificats)
        db
          .select({
            id: outillageCalibration.id,
            dateCalibration: outillageCalibration.dateCalibration,
            organisme: outillageCalibration.organisme,
            certificat: outillageCalibration.certificat,
            resultat: outillageCalibration.resultat,
            tolerance: outillageCalibration.tolerance,
            prochaineCalibration: outillageCalibration.prochaineCalibration,
          })
          .from(outillageCalibration)
          .where(eq(outillageCalibration.outilId, input.id))
          .orderBy(desc(outillageCalibration.dateCalibration))
          .limit(10),
      ]);

      const pretsActifs = pretsHisto.filter((h) => h.actif);
      const now = new Date();
      const [derniereCalibration] = calibrations;
      const derniereCalibrationInfo = derniereCalibration
        ? {
            ...derniereCalibration,
            enAttente: !!derniereCalibration.prochaineCalibration && new Date(derniereCalibration.prochaineCalibration) < now,
          }
        : null;
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
        calibrations: calibrations.map((c) => ({
          ...c,
          dateCalibration: c.dateCalibration,
          prochaineCalibration: c.prochaineCalibration,
          enAttente: !!c.prochaineCalibration && new Date(c.prochaineCalibration) < now,
        })),
        derniereCalibration: derniereCalibrationInfo,
        prochaineCalibration: derniereCalibrationInfo?.prochaineCalibration ?? null,
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
        const bureau = await getOrCreateBureau(tx, ctx.user.agenceId);
        await ajusterStockOutil(tx, input.outilId, ctx.user.agenceId, "S", TYPES_MOUVEMENT.SORTIE_OUTIL, `Prêt à technicien — retour prévu ${input.dateRetour}`, Number(ctx.user.id), bureau.id);

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
        const bureau = await getOrCreateBureau(tx, ctx.user.agenceId);

        // Specs : retour OK → quantité disponible +1, statut disponible ;
        // Endommagé → statut CASSE ; Perdu → statut PERDU + déduction
        if (input.etatRetour === "OK") {
          await ajusterStockOutil(tx, pret.outilId, ctx.user.agenceId, "E", TYPES_MOUVEMENT.RETOUR_OUTIL, `Retour OK — ${input.remarque ?? "bon état"}`, Number(ctx.user.id), bureau.id);
          await tx.update(produits).set({ statutOutil: null } as any).where(eq(produits.id, pret.outilId));
        } else if (input.etatRetour === "ENDOMMAGE") {
          await tx.update(produits).set({ statutOutil: "CASSE" } as any).where(eq(produits.id, pret.outilId));
        } else {
          await ajusterStockOutil(tx, pret.outilId, ctx.user.agenceId, "S", TYPES_MOUVEMENT.RETOUR_OUTIL, `Outil perdu (non rendu) — ${input.remarque}`, Number(ctx.user.id), bureau.id);
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
        if (p.typeProduit !== "OUTIL" && p.typeProduit !== "EQUIPEMENT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Seul un outil (OUTIL) ou un équipement (EQUIPEMENT) peut être déclaré." });
        }

        // Perte / vol / casse / réforme → déduction d'une unité (specs : quantity_available ajustée)
        if (["PERDU", "VOLE", "CASSE", "REFORME"].includes(input.statut)) {
          const bureau = await getOrCreateBureau(tx, ctx.user.agenceId);
          await ajusterStockOutil(tx, input.outilId, ctx.user.agenceId, "S", TYPES_MOUVEMENT.RETOUR_OUTIL, `${STATUT_OUTIL_META[input.statut]} — ${input.motif}`, Number(ctx.user.id), bureau.id);
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
        const [p] = await tx
          .select({ id: produits.id, statutOutil: produits.statutOutil, typeProduit: produits.typeProduit })
          .from(produits)
          .where(eq(produits.id, input.outilId))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
        const [pret] = await tx.select({ id: pretsOutils.id }).from(pretsOutils).where(and(eq(pretsOutils.outilId, input.outilId), eq(pretsOutils.actif, true))).limit(1);
        if (pret) throw new TRPCError({ code: "BAD_REQUEST", message: "Cet outil est en prêt — il doit d'abord être rendu." });

        // Un statut « perdu / volé / cassé / réformé » avait déjà déduit 1 unité :
        // le lever réintègre l'exemplaire retrouvé / réparé (traçabilité conservée).
        const etaitDeductible = p.statutOutil != null && ["PERDU", "VOLE", "CASSE", "REFORME"].includes(p.statutOutil);
        if (etaitDeductible) {
          const bureau = await getOrCreateBureau(tx, ctx.user.agenceId);
          await ajusterStockOutil(tx, input.outilId, ctx.user.agenceId, "E", TYPES_MOUVEMENT.RETOUR_OUTIL, `Exemplaire retrouvé/réparé (${STATUT_OUTIL_META[p.statutOutil!] ?? p.statutOutil}) — ${input.motif}`, Number(ctx.user.id), bureau.id);
        }

        await tx.update(produits).set({ statutOutil: null } as any).where(eq(produits.id, input.outilId));
        return { success: true, stockReintegre: etaitDeductible };
      }) as any;
    }),

  /** Calibration / étalonnage d'un outil ou équipement de mesure (échéance, organisme, certificat, essai). */
  calibrer: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      outilId: z.number().int(),
      resultat: z.enum(["CONFORME", "NON_CONFORME", "AVEC_RESERVES"]),
      organisme: z.string().optional(),
      certificat: z.string().optional(),
      tolerance: z.string().optional(),
      prochaineCalibration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      motif: z.string().min(3).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({ id: produits.id, typeProduit: produits.typeProduit, calibrable: produits.calibrable })
          .from(produits)
          .where(eq(produits.id, input.outilId))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
        if (p.typeProduit !== "OUTIL" && p.typeProduit !== "EQUIPEMENT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Seuls les outils et équipements de mesure peuvent être calibrés." });
        }

        const [row] = await tx.insert(outillageCalibration).values({
          outilId: input.outilId,
          organisme: input.organisme || null,
          certificat: input.certificat || null,
          resultat: input.resultat,
          tolerance: input.tolerance || null,
          prochaineCalibration: input.prochaineCalibration ? new Date(`${input.prochaineCalibration}T18:00:00`) : null,
          effectuePar: Number(ctx.user.id),
        } as any).returning();

        // Un essai NON_CONFORME retire l'instrument de la circulation jusqu'à réparation.
        if (input.resultat === "NON_CONFORME") {
          await tx.update(produits).set({ statutOutil: "REPARATION" } as any).where(eq(produits.id, input.outilId));
        }

        await tx.insert(mouvementsStock).values({
          produitId: input.outilId,
          agenceId: ctx.user.agenceId,
          type: "CALIBRATION",
          sens: "N",
          quantite: "0",
          stockAvant: "0",
          stockApres: "0",
          motif: `Calibration ${input.resultat} — ${input.certificat ?? "sans certificat"}${input.organisme ? ` (${input.organisme})` : ""}`,
          effectuePar: ctx.user.id,
        } as any);

        return { success: true, calibrationId: row.id, resultat: input.resultat };
      }) as any;
    }),

  /** Historique des calibrations d'un outil / équipement. */
  calibrationHistorique: requirePermissionProcedure("stock.consulter")
    .input(z.object({ outilId: z.number().int(), limit: z.number().int().default(20) }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: outillageCalibration.id,
          dateCalibration: outillageCalibration.dateCalibration,
          organisme: outillageCalibration.organisme,
          certificat: outillageCalibration.certificat,
          resultat: outillageCalibration.resultat,
          tolerance: outillageCalibration.tolerance,
          prochaineCalibration: outillageCalibration.prochaineCalibration,
        })
        .from(outillageCalibration)
        .where(eq(outillageCalibration.outilId, input.outilId))
        .orderBy(desc(outillageCalibration.dateCalibration))
        .limit(input.limit);
      return rows.map((r) => ({
        ...r,
        enAttente: !!r.prochaineCalibration && new Date(r.prochaineCalibration) < new Date(),
      }));
    }),

  /** Opération de maintenance (préventive/curative/contrôle) sur un équipement ou outil. */
  maintenance: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      outilId: z.number().int(),
      type: z.enum(["PREVENTIVE", "CURATIVE", "CONTROLE"]),
      dateMaintenance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      prestataire: z.string().optional(),
      cout: z.number().min(0).optional(),
      observations: z.string().optional(),
      prochaineMaintenance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({ id: produits.id, typeProduit: produits.typeProduit })
          .from(produits)
          .where(eq(produits.id, input.outilId))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
        if (p.typeProduit !== "OUTIL" && p.typeProduit !== "EQUIPEMENT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Seuls les outils et équipements peuvent être maintenus." });
        }
        const [row] = await tx.insert(outillageMaintenance).values({
          outilId: input.outilId,
          type: input.type,
          dateMaintenance: input.dateMaintenance ? new Date(`${input.dateMaintenance}T18:00:00`) : new Date(),
          prestataire: input.prestataire || null,
          cout: input.cout != null ? String(input.cout) : null,
          observations: input.observations || null,
          prochaineMaintenance: input.prochaineMaintenance ? new Date(`${input.prochaineMaintenance}T18:00:00`) : null,
          effectuePar: Number(ctx.user.id),
        } as any).returning();
        return { success: true, maintenanceId: row.id };
      }) as any;
    }),

  /** Historique de maintenance d'un équipement / outil. */
  maintenanceHistorique: requirePermissionProcedure("stock.consulter")
    .input(z.object({ outilId: z.number().int(), limit: z.number().int().default(20) }))
    .query(async ({ ctx, input }) => {
      return db
        .select({
          id: outillageMaintenance.id,
          type: outillageMaintenance.type,
          dateMaintenance: outillageMaintenance.dateMaintenance,
          prestataire: outillageMaintenance.prestataire,
          cout: outillageMaintenance.cout,
          observations: outillageMaintenance.observations,
          prochaineMaintenance: outillageMaintenance.prochaineMaintenance,
        })
        .from(outillageMaintenance)
        .where(eq(outillageMaintenance.outilId, input.outilId))
        .orderBy(desc(outillageMaintenance.dateMaintenance))
        .limit(input.limit);
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

  // ─── BUREAU DU MAGASINIER (MVP conception stock + outillage) ───

  /** Emplacement « Bureau » de l'agence (créé à la première utilisation). */
  bureauEmplacement: requirePermissionProcedure("stock.consulter")
    .query(async ({ ctx }) => {
      return getOrCreateBureau(db, ctx.user.agenceId);
    }),

  /** Approvisionner le bureau depuis un grand magasin (transfert tracé). */
  approvisionnerBureau: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      produitId: z.number().int(),
      emplacementSourceId: z.number().int(),
      quantite: z.number().positive(),
      motif: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const groupeOperationId = crypto.randomUUID();
      return db.transaction(async (tx) => {
        const bureau = await getOrCreateBureau(tx, ctx.user.agenceId);
        const [prod] = await tx.select({ titre: produits.titre }).from(produits).where(eq(produits.id, input.produitId)).limit(1);
        if (!prod) throw new TRPCError({ code: "NOT_FOUND", message: "Article introuvable." });
        const motif = input.motif || "Réassort du bureau";
        await enregistrerMouvement(tx, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          type: TYPES_MOUVEMENT.APPROVISIONNEMENT_BUREAU_SORTIE,
          sens: "S",
          quantite: input.quantite,
          emplacementId: input.emplacementSourceId,
          motif: `Sortie magasin → bureau : ${motif}`,
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });
        await enregistrerMouvement(tx, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          type: TYPES_MOUVEMENT.APPROVISIONNEMENT_BUREAU_ENTREE,
          sens: "E",
          quantite: input.quantite,
          emplacementId: bureau.id,
          motif: `Entrée bureau depuis magasin #${input.emplacementSourceId} : ${motif}`,
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });
        return { success: true, bureauId: bureau.id };
      }) as any;
    }),

  /** Dotation de consommable : sortie bureau → OR / technicien, sans retour. */
  doter: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      produitId: z.number().int(),
      quantite: z.number().positive(),
      orId: z.number().int().optional(),
      technicienId: z.number().int().optional(),
      motif: z.string().min(3),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [prod] = await tx.select({ titre: produits.titre, typeProduit: produits.typeProduit }).from(produits).where(eq(produits.id, input.produitId)).limit(1);
        if (!prod) throw new TRPCError({ code: "NOT_FOUND", message: "Article introuvable." });
        if (prod.typeProduit === "OUTIL") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Un outil se prête (pas de dotation) — utilisez « Prêter un outil »." });
        }
        const bureau = await getOrCreateBureau(tx, ctx.user.agenceId);
        const cible = input.orId ? `OR #${input.orId}` : input.technicienId ? `technicien #${input.technicienId}` : "atelier";
        await enregistrerMouvement(tx, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          type: TYPES_MOUVEMENT.DOTATION_CONSOMMABLE,
          sens: "S",
          quantite: input.quantite,
          emplacementId: bureau.id,
          orId: input.orId,
          motif: `Dotation → ${cible} : ${input.motif}`,
          effectuePar: Number(ctx.user.id),
        });
        return { success: true, bureauId: bureau.id };
      }) as any;
    }),

  /** Stock du bureau (quantités, seuils locaux, statut OK / sous seuil). */
  bureauList: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      q: z.string().optional(),
      type: z.enum(["OUTIL", "CONSOMMABLE", "PIECE"]).optional(),
      sousSeuilOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const bureau = await getOrCreateBureau(db, ctx.user.agenceId);
      const safe = input ?? {};
      const conditions: any[] = [
        eq(stocks.emplacementId, bureau.id),
        eq(stocks.agenceId, ctx.user.agenceId),
      ];
      if (safe.type) conditions.push(eq(produits.typeProduit, safe.type));
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
          produitId: stocks.produitId,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          codeArticle: produits.codeArticle,
          typeProduit: produits.typeProduit,
          statutOutil: produits.statutOutil,
          seuilGlobal: produits.seuilAlerte,
          quantite: stocks.quantite,
          quantiteReservee: stocks.quantiteReservee,
          seuilLocal: stocks.seuilAlerteLocal,
        })
        .from(stocks)
        .innerJoin(produits, eq(stocks.produitId, produits.id))
        .where(and(...conditions))
        .orderBy(desc(stocks.quantite));
      const result = rows.map((r) => {
        const quantite = Number(r.quantite ?? 0);
        const reservee = Number(r.quantiteReservee ?? 0);
        const seuil = r.seuilLocal ?? r.seuilGlobal ?? 0;
        return {
          ...r,
          quantite,
          reservee,
          disponible: Math.max(0, quantite - reservee),
          seuil,
          sousSeuil: seuil > 0 && quantite < seuil,
        };
      });
      return safe.sousSeuilOnly ? result.filter((r) => r.sousSeuil) : result;
    }),

  /** Régler le seuil d'alerte local d'un produit au bureau. */
  setSeuilBureau: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({ produitId: z.number().int(), seuil: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const bureau = await getOrCreateBureau(db, ctx.user.agenceId);
      await db
        .update(stocks)
        .set({ seuilAlerteLocal: input.seuil } as any)
        .where(and(eq(stocks.produitId, input.produitId), eq(stocks.emplacementId, bureau.id), eq(stocks.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  /** Mouvements liés au bureau (entrées/sorties/dotations/prêts). */
  bureauMouvements: requirePermissionProcedure("stock.consulter")
    .input(z.object({ produitId: z.number().int().optional(), limit: z.number().int().default(100) }))
    .query(async ({ ctx, input }) => {
      const bureau = await getOrCreateBureau(db, ctx.user.agenceId);
      const conditions: any[] = [
        eq(mouvementsStock.agenceId, ctx.user.agenceId),
        or(
          eq(mouvementsStock.emplacementId, bureau.id),
          inArray(mouvementsStock.type, [
            TYPES_MOUVEMENT.APPROVISIONNEMENT_BUREAU_SORTIE,
            TYPES_MOUVEMENT.APPROVISIONNEMENT_BUREAU_ENTREE,
            TYPES_MOUVEMENT.DOTATION_CONSOMMABLE,
          ]),
        ),
      ];
      if (input.produitId) conditions.push(eq(mouvementsStock.produitId, input.produitId));
      const rows = await db
        .select({
          id: mouvementsStock.id,
          type: mouvementsStock.type,
          sens: mouvementsStock.sens,
          quantite: mouvementsStock.quantite,
          motif: mouvementsStock.motif,
          orId: mouvementsStock.orId,
          emplacementId: mouvementsStock.emplacementId,
          dateMouvement: mouvementsStock.dateMouvement,
          produitTitre: produits.titre,
          produitCode: produits.codeArticle,
        })
        .from(mouvementsStock)
        .leftJoin(produits, eq(mouvementsStock.produitId, produits.id))
        .where(and(...conditions))
        .orderBy(desc(mouvementsStock.dateMouvement))
        .limit(input.limit);
      return rows;
    }),
});