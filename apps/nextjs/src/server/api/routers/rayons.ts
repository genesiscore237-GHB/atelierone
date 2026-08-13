import { z } from "zod";
import { createTRPCRouter, protectedProcedure, stockProcedure } from "~/server/api/trpc";
import {
  db,
  emplacements,
  sousSystemes, niveaux, classes, filieres,
  categories,
  produits,
  stocks,
  mouvementsStock,
  listesScolaires, listeScolaireItems,
} from "@atelierone/db";
import { eq, and, asc, sql, isNull, isNotNull, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const MAX_PROFONDEUR = 3;

type NoeudRayon = {
  id: string;
  type: string;
  code: string;
  libelle: string;
  parentId: string | null;
  profondeur: number;
  categorieId: string | null;
  sousSystemeId: string | null;
  niveauId: string | null;
  classeId: string | null;
  filiereId: string | null;
  ordre: number;
  isActive: boolean;
  nbProduits: number;
  stockRayon: number;
  stockTotal: number;
  enfants: NoeudRayon[];
};

const createSchema = z.object({
  type: z.enum(["ZONE", "RAYON", "ETAGERE", "ENTREPOT", "RESERVE", "VITRINE"]),
  code: z.string().min(1).max(50),
  libelle: z.string().min(1).max(255),
  parentId: z.number().nullable().optional(),
  categorieId: z.number().nullable().optional(),
  sousSystemeId: z.string().uuid().nullable().optional(),
  niveauId: z.string().uuid().nullable().optional(),
  classeId: z.string().uuid().nullable().optional(),
  filiereId: z.string().uuid().nullable().optional(),
  ordre: z.number().default(0),
});

const updateSchema = z.object({
  id: z.number(),
  libelle: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  categorieId: z.number().nullable().optional(),
  filiereId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  ordre: z.number().optional(),
});

const CLASSES_AVEC_FILIERE = ["4e", "3e", "2NDE", "1ERE", "TLE", "FORM3", "FORM4", "FORM5", "L6", "U6"];

async function verifierReglesEducatives(params: { sousSystemeId?: string | null; niveauId?: string | null; classeId?: string | null; filiereId?: string | null }) {
  const { sousSystemeId, niveauId, classeId, filiereId } = params;

  if (sousSystemeId || niveauId || classeId || filiereId) {
    if (!sousSystemeId || !niveauId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Une étagère manuels exige sousSystemeId et niveauId (RG-11)." });
    }
  }

  if (niveauId) {
    const [niveau] = await db.select().from(niveaux).where(eq(niveaux.id, niveauId)).limit(1);
    if (!niveau) throw new TRPCError({ code: "BAD_REQUEST", message: "Niveau inconnu." });
    if (sousSystemeId && niveau.sousSystemeId !== sousSystemeId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Le niveau n'appartient pas au sous-système (RG-12)." });
    }
    if (classeId) {
      const [classe] = await db.select().from(classes).where(eq(classes.id, classeId)).limit(1);
      if (!classe) throw new TRPCError({ code: "BAD_REQUEST", message: "Classe inconnue." });
      if (classe.niveauId !== niveauId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La classe n'appartient pas au niveau (RG-12)." });
      }
      if (CLASSES_AVEC_FILIERE.includes(classe.code) && !filiereId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `La classe ${classe.code} exige une filière (RG-11).` });
      }
    }
    if (filiereId) {
      const [filiere] = await db.select().from(filieres).where(eq(filieres.id, filiereId)).limit(1);
      if (!filiere) throw new TRPCError({ code: "BAD_REQUEST", message: "Filière inconnue." });
    }
  }
}

export const rayonsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;

    const [rows, produitsParClasse, produitsParCategorie, stockParEmplacement] = await Promise.all([
      db.select().from(emplacements)
        .where(and(eq(emplacements.agenceId, agenceId), eq(emplacements.isActive, true)))
        .orderBy(asc(emplacements.profondeur), asc(emplacements.ordre), asc(emplacements.code)),

      db.select({ classeId: produits.classeId, c: sql<number>`count(*)::int` })
        .from(produits)
        .where(isNotNull(produits.classeId))
        .groupBy(produits.classeId),

      db.select({ categorieId: produits.categorieId, c: sql<number>`count(*)::int` })
        .from(produits)
        .where(isNotNull(produits.categorieId))
        .groupBy(produits.categorieId),

      db.select({ emplacementId: stocks.emplacementId, qte: sql<number>`COALESCE(sum(${stocks.quantite}), 0)`, qteRayon: sql<number>`COALESCE(sum(${stocks.quantiteRayon}), 0)` })
        .from(stocks)
        .where(isNotNull(stocks.emplacementId))
        .groupBy(stocks.emplacementId),
    ]);

    const mapParClasse = new Map(produitsParClasse.map((r) => [r.classeId, r.c]));
    const mapParCategorie = new Map(produitsParCategorie.map((r) => [String(r.categorieId), r.c]));
    const mapStockEmplacement = new Map(stockParEmplacement.map((r) => [String(r.emplacementId), r]));

    const withChildren: NoeudRayon[] = rows.map((r) => ({
      id: String(r.id),
      type: r.type,
      code: r.code,
      libelle: r.libelle ?? "",
      parentId: r.parentId ? String(r.parentId) : null,
      profondeur: r.profondeur,
      categorieId: r.categorieId ? String(r.categorieId) : null,
      sousSystemeId: r.sousSystemeId ?? null,
      niveauId: r.niveauId ?? null,
      classeId: r.classeId ?? null,
      filiereId: r.filiereId ?? null,
      ordre: r.ordre,
      isActive: r.isActive ?? true,
      nbProduits: r.classeId ? (mapParClasse.get(r.classeId) ?? 0) : (r.categorieId ? (mapParCategorie.get(String(r.categorieId)) ?? 0) : 0),
      stockRayon: mapStockEmplacement.get(String(r.id))?.qteRayon ?? 0,
      stockTotal: mapStockEmplacement.get(String(r.id))?.qte ?? 0,
      enfants: [],
    }));

    const byId = new Map(withChildren.map((r) => [r.id, r]));
    const zones = withChildren.filter((r) => r.profondeur === 0 && r.parentId === null && r.type !== "ENTREPOT" && r.type !== "RESERVE" && r.type !== "VITRINE");
    for (const z of zones) {
      const rayons = withChildren.filter((r) => r.parentId === z.id);
      for (const ra of rayons) {
        ra.enfants = withChildren.filter((r) => r.parentId === ra.id);
      }
      z.enfants = rayons;
    }
    const reserves = withChildren.filter((r) => r.type === "ENTREPOT" || r.type === "RESERVE" || r.type === "VITRINE");
    return { zones, reserves };
  }),

  listFlat: protectedProcedure
    .input(z.object({
      types: z.array(z.enum(["ZONE", "RAYON", "ETAGERE", "ENTREPOT", "RESERVE", "VITRINE"])).optional(),
      sousSystemeId: z.string().uuid().optional(),
      withStock: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions = [eq(emplacements.agenceId, agenceId), eq(emplacements.isActive, true)];
      if (input.types && input.types.length > 0) conditions.push(inArray(emplacements.type, input.types));
      if (input.sousSystemeId) conditions.push(eq(emplacements.sousSystemeId, input.sousSystemeId));

      const rows = await db.select().from(emplacements).where(and(...conditions))
        .orderBy(asc(emplacements.profondeur), asc(emplacements.ordre), asc(emplacements.code));

      let stockMap = new Map<string, { qte: number; qteRayon: number }>();
      if (input.withStock) {
        const stockRows = await db.select({
          emplacementId: stocks.emplacementId,
          qte: sql<number>`COALESCE(sum(${stocks.quantite}), 0)`,
          qteRayon: sql<number>`COALESCE(sum(${stocks.quantiteRayon}), 0)`,
        })
          .from(stocks)
          .where(isNotNull(stocks.emplacementId))
          .groupBy(stocks.emplacementId);
        stockMap = new Map(stockRows.map((r) => [String(r.emplacementId), r]));
      }

      return rows.map((r) => ({
        id: String(r.id),
        type: r.type,
        code: r.code,
        libelle: r.libelle ?? "",
        parentId: r.parentId ? String(r.parentId) : null,
        profondeur: r.profondeur,
        categorieId: r.categorieId ? String(r.categorieId) : null,
        sousSystemeId: r.sousSystemeId ?? null,
        niveauId: r.niveauId ?? null,
        classeId: r.classeId ?? null,
        filiereId: r.filiereId ?? null,
        ordre: r.ordre,
        stockRayon: stockMap.get(String(r.id))?.qteRayon ?? 0,
        stockTotal: stockMap.get(String(r.id))?.qte ?? 0,
      }));
    }),

  create: stockProcedure
    .input(createSchema)
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const [dup] = await db.select({ id: emplacements.id })
        .from(emplacements)
        .where(and(eq(emplacements.agenceId, agenceId), eq(emplacements.code, input.code)))
        .limit(1);
      if (dup) throw new TRPCError({ code: "CONFLICT", message: `Code déjà utilisé: ${input.code}` });

      let profondeur = 0;
      let parentId: number | null = null;
      if (input.parentId != null) {
        const [parent] = await db.select().from(emplacements)
          .where(and(eq(emplacements.id, input.parentId), eq(emplacements.agenceId, agenceId)))
          .limit(1);
        if (!parent) throw new TRPCError({ code: "BAD_REQUEST", message: "Parent inconnu." });
        profondeur = parent.profondeur + 1;
        if (profondeur > MAX_PROFONDEUR) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Profondeur maximale ${MAX_PROFONDEUR} dépassée.` });
        }
        parentId = parent.id;
      }

      let categorieId = input.categorieId ?? null;
      if (input.classeId && !categorieId) {
        const [manSco] = await db.select({ id: categories.id }).from(categories).where(eq(categories.code, "MAN-SCO")).limit(1);
        if (manSco) categorieId = manSco.id;
      }

      await verifierReglesEducatives(input);

      const [created] = await db.insert(emplacements).values({
        agenceId,
        type: input.type,
        code: input.code,
        libelle: input.libelle,
        parentId,
        profondeur,
        categorieId,
        sousSystemeId: input.sousSystemeId ?? null,
        niveauId: input.niveauId ?? null,
        classeId: input.classeId ?? null,
        filiereId: input.filiereId ?? null,
        ordre: input.ordre,
        isActive: true,
      }).returning();

      return { id: String(created.id) };
    }),

  update: stockProcedure
    .input(updateSchema)
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db.select().from(emplacements)
        .where(and(eq(emplacements.id, input.id), eq(emplacements.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Emplacement introuvable." });

      if (input.code && input.code !== existing.code) {
        const [dup] = await db.select({ id: emplacements.id })
          .from(emplacements)
          .where(and(eq(emplacements.agenceId, ctx.user.agenceId), eq(emplacements.code, input.code)))
          .limit(1);
        if (dup) throw new TRPCError({ code: "CONFLICT", message: `Code déjà utilisé: ${input.code}` });
      }

      await verifierReglesEducatives({
        sousSystemeId: existing.sousSystemeId,
        niveauId: existing.niveauId,
        classeId: existing.classeId,
        filiereId: input.filiereId !== undefined ? input.filiereId : existing.filiereId,
      });

      const updated = await db.update(emplacements)
        .set({
          libelle: input.libelle ?? existing.libelle ?? "",
          code: input.code ?? existing.code,
          categorieId: input.categorieId !== undefined ? input.categorieId : existing.categorieId,
          filiereId: input.filiereId !== undefined ? input.filiereId : existing.filiereId,
          isActive: input.isActive ?? existing.isActive ?? true,
          ordre: input.ordre ?? existing.ordre ?? 0,
        })
        .where(eq(emplacements.id, input.id))
        .returning();

      return { id: String(updated[0]!.id) };
    }),

  move: stockProcedure
    .input(z.object({ id: z.number(), newParentId: z.number().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db.select().from(emplacements)
        .where(and(eq(emplacements.id, input.id), eq(emplacements.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Emplacement introuvable." });

      let newProfondeur = 0;
      if (input.newParentId != null) {
        if (input.newParentId === input.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Un emplacement ne peut pas être son propre parent." });
        const [parent] = await db.select().from(emplacements)
          .where(and(eq(emplacements.id, input.newParentId), eq(emplacements.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!parent) throw new TRPCError({ code: "BAD_REQUEST", message: "Parent inconnu." });
        newProfondeur = parent.profondeur + 1;
        if (newProfondeur > MAX_PROFONDEUR) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Profondeur maximale ${MAX_PROFONDEUR} dépassée.` });
        }
      }

      const descendants = await db.select({ id: emplacements.id, parentId: emplacements.parentId })
        .from(emplacements)
        .where(eq(emplacements.agenceId, ctx.user.agenceId));
      const adj = new Map<number, number | null>(descendants.map((d) => [d.id, d.parentId]));
      let cursor: number | null = input.newParentId;
      const visite = new Set<number>();
      while (cursor != null) {
        if (visite.has(cursor)) throw new TRPCError({ code: "BAD_REQUEST", message: "Cycle détecté dans l'arbre." });
        visite.add(cursor);
        if (cursor === input.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Impossible de déplacer sous son propre descendant." });
        cursor = adj.get(cursor) ?? null;
      }

      await db.update(emplacements)
        .set({ parentId: input.newParentId, profondeur: newProfondeur })
        .where(eq(emplacements.id, input.id));

      const enfantsDirects = descendants.filter((d) => d.parentId === input.id);
      for (const enfant of enfantsDirects) {
        await db.update(emplacements)
          .set({ profondeur: newProfondeur + 1 })
          .where(eq(emplacements.id, enfant.id));
        const petitsEnfants = descendants.filter((d) => d.parentId === enfant.id);
        for (const pe of petitsEnfants) {
          await db.update(emplacements)
            .set({ profondeur: newProfondeur + 2 })
            .where(eq(emplacements.id, pe.id));
        }
      }

      return { id: String(input.id) };
    }),

  reorder: stockProcedure
    .input(z.object({ parentId: z.number().nullable(), orderedIds: z.array(z.number()).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await db.select({ id: emplacements.id, ordre: emplacements.ordre })
        .from(emplacements)
        .where(and(
          eq(emplacements.agenceId, ctx.user.agenceId),
          input.parentId != null ? eq(emplacements.parentId, input.parentId) : isNull(emplacements.parentId),
        ));
      const existants = new Set(rows.map((r) => r.id));
      const ordres: Record<number, number> = {};
      input.orderedIds.forEach((id, idx) => {
        if (existants.has(id)) ordres[id] = idx + 1;
      });
      for (const r of rows) {
        if (ordres[r.id] !== undefined && ordres[r.id] !== r.ordre) {
          await db.update(emplacements).set({ ordre: ordres[r.id] }).where(eq(emplacements.id, r.id));
        }
      }
      return { reordonnes: Object.keys(ordres).length };
    }),

  delete: stockProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db.select().from(emplacements)
        .where(and(eq(emplacements.id, input.id), eq(emplacements.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Emplacement introuvable." });

      const [enfants] = await db.select({ c: sql<number>`count(*)::int` })
        .from(emplacements)
        .where(eq(emplacements.parentId, input.id));
      if ((enfants?.c ?? 0) > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Déplacez ou supprimez d'abord les sous-emplacements." });
      }

      const [stockInfo] = await db.select({ c: sql<number>`count(*)::int` })
        .from(stocks)
        .where(and(eq(stocks.emplacementId, input.id), sql`${stocks.quantite} > 0`));
      const [mvtInfo] = await db.select({ c: sql<number>`count(*)::int` })
        .from(mouvementsStock)
        .where(eq(mouvementsStock.emplacementId, input.id));

      const aHistorique = (stockInfo?.c ?? 0) > 0 || (mvtInfo?.c ?? 0) > 0;

      if (aHistorique) {
        await db.update(emplacements).set({ isActive: false }).where(eq(emplacements.id, input.id));
        return { mode: "soft" };
      }

      await db.delete(emplacements).where(eq(emplacements.id, input.id));
      return { mode: "hard" };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;

    const [counts, stockRayon] = await Promise.all([
      db.select({ type: emplacements.type, c: sql<number>`count(*)::int` })
        .from(emplacements)
        .where(and(eq(emplacements.agenceId, agenceId), eq(emplacements.isActive, true)))
        .groupBy(emplacements.type),
      db.select({
        emplacementId: stocks.emplacementId,
        nbProduits: sql<number>`count(*)::int`,
        qte: sql<number>`COALESCE(sum(${stocks.quantite}), 0)`,
        qteRayon: sql<number>`COALESCE(sum(${stocks.quantiteRayon}), 0)`,
      })
        .from(stocks)
        .where(and(eq(stocks.agenceId, agenceId), isNotNull(stocks.emplacementId)))
        .groupBy(stocks.emplacementId),
    ]);

    const byType: Record<string, number> = {};
    for (const c of counts) byType[c.type] = c.c;

    const parEmplacement = await db.select({ id: emplacements.id, code: emplacements.code, libelle: emplacements.libelle, type: emplacements.type, parentId: emplacements.parentId })
      .from(emplacements)
      .where(and(eq(emplacements.agenceId, agenceId), eq(emplacements.isActive, true)));
    const stockMap = new Map(stockRayon.map((r) => [String(r.emplacementId), r]));

    const detail = parEmplacement.map((e) => ({
      id: String(e.id),
      code: e.code,
      libelle: e.libelle ?? "",
      type: e.type,
      parentId: e.parentId ? String(e.parentId) : null,
      nbProduits: stockMap.get(String(e.id))?.nbProduits ?? 0,
      stockRayon: Number(stockMap.get(String(e.id))?.qteRayon ?? 0),
      stockTotal: Number(stockMap.get(String(e.id))?.qte ?? 0),
    }));

    return {
      zones: byType.ZONE ?? 0,
      rayons: byType.RAYON ?? 0,
      etageres: byType.ETAGERE ?? 0,
      reserves: (byType.ENTREPOT ?? 0) + (byType.RESERVE ?? 0) + (byType.VITRINE ?? 0),
      total: parEmplacement.length,
      detail,
    };
  }),

  achalandage: protectedProcedure
    .input(z.object({ emplacementId: z.number(), anneeScolaire: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const [etagere] = await db.select().from(emplacements)
        .where(and(eq(emplacements.id, input.emplacementId), eq(emplacements.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!etagere) throw new TRPCError({ code: "NOT_FOUND", message: "Emplacement introuvable." });
      if (!etagere.classeId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "L'achalandage s'applique aux étagères-classe." });
      }

      const listeConditions = [eq(listesScolaires.isActive, true)];
      if (input.anneeScolaire) listeConditions.push(eq(listesScolaires.anneeScolaire, input.anneeScolaire));

      const requis = await db.select({
        produitId: listeScolaireItems.produitId,
        quantiteRequise: listeScolaireItems.quantiteRequise,
        priorite: listeScolaireItems.priorite,
        titre: produits.titre,
        codeBarre: produits.codeBarre,
        prixVente: produits.prixVente,
      })
        .from(listeScolaireItems)
        .innerJoin(listesScolaires, eq(listeScolaireItems.listeId, listesScolaires.id))
        .innerJoin(produits, eq(listeScolaireItems.produitId, produits.id))
        .where(and(eq(produits.classeId, etagere.classeId), ...listeConditions));

      let produitsReq = requis;
      if (requis.length === 0) {
        const manuels = await db.select({
          produitId: produits.id,
          quantiteRequise: sql<number>`1`,
          priorite: sql<string>`'obligatoire'`,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          prixVente: produits.prixVente,
        })
          .from(produits)
          .where(and(eq(produits.classeId, etagere.classeId), eq(produits.isActive, true), eq(produits.statutCycleVie, "ACTIF")));
        produitsReq = manuels;
      }

      const produitIds = produitsReq.map((p) => p.produitId);
      const stocksRows = produitIds.length > 0
        ? await db.select({
          produitId: stocks.produitId,
          qte: sql<number>`COALESCE(MAX(${stocks.quantite}), 0)`,
          qteRayon: sql<number>`COALESCE(MAX(${stocks.quantiteRayon}), 0)`,
        })
          .from(stocks)
          .where(and(eq(stocks.agenceId, ctx.user.agenceId), inArray(stocks.produitId, produitIds)))
          .groupBy(stocks.produitId)
        : [];
      const stockMap = new Map(stocksRows.map((r) => [r.produitId, r]));

      const lignes = produitsReq.map((p) => {
        const stock = stockMap.get(p.produitId);
        const cible = Number(p.quantiteRequise ?? 1);
        const enRayon = Number(stock?.qteRayon ?? 0);
        const enReserve = Math.max(Number(stock?.qte ?? 0) - enRayon, 0);
        const enStock = enRayon + enReserve;
        return {
          produitId: String(p.produitId),
          titre: p.titre,
          codeBarre: p.codeBarre ?? "",
          prixVente: p.prixVente ?? "0",
          cible,
          priorite: p.priorite ?? "obligatoire",
          enRayon,
          enReserve,
          enStock,
          manquantRayon: Math.max(cible - enRayon, 0),
          manquantTotal: Math.max(cible - enStock, 0),
          enRupture: enRayon <= 0,
        };
      });

      const totalCible = lignes.reduce((a, l) => a + l.cible, 0);
      const enRayonTotal = lignes.reduce((a, l) => a + l.enRayon, 0);
      const enStockTotal = lignes.reduce((a, l) => a + l.enStock, 0);
      const couverture = lignes.length === 0 ? 0 : (lignes.filter((l) => !l.enRupture).length / lignes.length) * 100;
      const completude = totalCible === 0 ? 0 : (Math.min(enStockTotal, totalCible) / totalCible) * 100;
      const ruptures = lignes.filter((l) => l.enRupture && l.priorite === "obligatoire").length;

      return {
        emplacementId: String(etagere.id),
        classeId: etagere.classeId,
        lignes,
        resume: {
          requis: lignes.length,
          totalCible,
          enRayon: enRayonTotal,
          enStock: enStockTotal,
          couverture,
          completude,
          ruptures,
        },
      };
    }),

  kitsRentree: protectedProcedure
    .input(z.object({ anneeScolaire: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const etageres = await db.select().from(emplacements)
        .where(and(eq(emplacements.agenceId, agenceId), eq(emplacements.type, "ETAGERE"), isNotNull(emplacements.classeId)));

      if (etageres.length === 0) {
        return { anneeScolaire: input.anneeScolaire ?? "toutes", kits: [], totalEtagereClasse: 0 };
      }

      const classeIds = etageres.map((e) => e.classeId!).filter(Boolean);
      const niveauIds = etageres.map((e) => e.niveauId).filter((v): v is string => Boolean(v));
      const ssIds = etageres.map((e) => e.sousSystemeId).filter((v): v is string => Boolean(v));

      const [classeRows, niveauRows, ssRows, requisRows] = await Promise.all([
        classeIds.length > 0
          ? db.select({ id: classes.id, code: classes.code }).from(classes).where(inArray(classes.id, classeIds))
          : Promise.resolve([]),
        niveauIds.length > 0
          ? db.select({ id: niveaux.id, code: niveaux.code }).from(niveaux).where(inArray(niveaux.id, niveauIds))
          : Promise.resolve([]),
        ssIds.length > 0
          ? db.select({ id: sousSystemes.id, code: sousSystemes.code }).from(sousSystemes).where(inArray(sousSystemes.id, ssIds))
          : Promise.resolve([]),
        db.select({
          classeId: produits.classeId,
          c: sql<number>`count(*)::int`,
          qte: sql<number>`COALESCE(sum(${listeScolaireItems.quantiteRequise}), 0)`,
        })
          .from(listeScolaireItems)
          .innerJoin(listesScolaires, eq(listeScolaireItems.listeId, listesScolaires.id))
          .innerJoin(produits, eq(listeScolaireItems.produitId, produits.id))
          .where(and(
            inArray(produits.classeId, classeIds),
            eq(listesScolaires.isActive, true),
            input.anneeScolaire ? eq(listesScolaires.anneeScolaire, input.anneeScolaire) : undefined,
          ))
          .groupBy(produits.classeId),
      ]);

      const classeMap = new Map(classeRows.map((r) => [r.id, r.code]));
      const niveauMap = new Map(niveauRows.map((r) => [r.id, r.code]));
      const ssMap = new Map(ssRows.map((r) => [r.id, r.code]));
      const requisMap = new Map(requisRows.map((r) => [r.classeId, r]));

      const kits = etageres.map((e) => {
        const req = requisMap.get(e.classeId!);
        return {
          emplacementId: String(e.id),
          code: e.code,
          libelle: e.libelle,
          sousSysteme: e.sousSystemeId ? (ssMap.get(e.sousSystemeId) ?? null) : null,
          niveau: e.niveauId ? (niveauMap.get(e.niveauId) ?? null) : null,
          classe: e.classeId ? (classeMap.get(e.classeId) ?? null) : null,
          produitsRequis: req?.c ?? 0,
          quantiteCible: req?.qte ?? 0,
        };
      });

      return {
        anneeScolaire: input.anneeScolaire ?? "toutes",
        kits,
        totalEtagereClasse: kits.length,
      };
    }),

  suivi: protectedProcedure.query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;

    const [etageres, requisParClasse, stocksParProduit, produitsParClasse] = await Promise.all([
      db.select().from(emplacements)
        .where(and(eq(emplacements.agenceId, agenceId), eq(emplacements.type, "ETAGERE"), isNotNull(emplacements.classeId))),

      db.select({ classeId: produits.classeId, nb: sql<number>`count(*)::int`, qte: sql<number>`COALESCE(sum(${listeScolaireItems.quantiteRequise}), 0)` })
        .from(listeScolaireItems)
        .innerJoin(listesScolaires, eq(listeScolaireItems.listeId, listesScolaires.id))
        .innerJoin(produits, eq(listeScolaireItems.produitId, produits.id))
        .where(and(eq(listesScolaires.isActive, true), isNotNull(produits.classeId)))
        .groupBy(produits.classeId),

      db.select({ produitId: stocks.produitId, qte: sql<number>`COALESCE(sum(${stocks.quantite}), 0)`, qteRayon: sql<number>`COALESCE(sum(${stocks.quantiteRayon}), 0)` })
        .from(stocks)
        .where(eq(stocks.agenceId, agenceId))
        .groupBy(stocks.produitId),

      db.select({ id: produits.id, classeId: produits.classeId })
        .from(produits)
        .where(and(eq(produits.isActive, true), eq(produits.statutCycleVie, "ACTIF"), isNotNull(produits.classeId))),
    ]);

    const requisMap = new Map(requisParClasse.map((r) => [r.classeId, { nb: r.nb, qte: r.qte }]));
    const stockMap = new Map(stocksParProduit.map((r) => [r.produitId, r]));
    const produitsParClasseMap = new Map<string, { id: number; qte: number; qteRayon: number }[]>();
    for (const p of produitsParClasse) {
      const s = stockMap.get(p.id);
      const liste = produitsParClasseMap.get(p.classeId!) ?? [];
      liste.push({ id: p.id, qte: Number(s?.qte ?? 0), qteRayon: Number(s?.qteRayon ?? 0) });
      produitsParClasseMap.set(p.classeId!, liste);
    }

    const parEtagere = etageres.map((e) => {
      const requis = requisMap.get(e.classeId!) ?? { nb: 0, qte: 0 };
      const manuels = produitsParClasseMap.get(e.classeId!) ?? [];
      let enRayon = 0, enStock = 0, produitsEnRayon = 0;
      for (const m of manuels) {
        enRayon += m.qteRayon;
        enStock += m.qte;
        if (m.qteRayon > 0) produitsEnRayon++;
      }
      const couverture = manuels.length === 0 ? 0 : (produitsEnRayon / manuels.length) * 100;
      return {
        emplacementId: String(e.id),
        code: e.code,
        libelle: e.libelle,
        produitsRequis: requis.nb,
        quantiteCible: requis.qte,
        enRayon,
        enStock,
        couverture,
        completude: requis.qte === 0 ? 0 : (Math.min(enStock, requis.qte) / requis.qte) * 100,
      };
    });

    const totalRequis = parEtagere.reduce((a, e) => a + e.produitsRequis, 0);
    const totalEnRayon = parEtagere.reduce((a, e) => a + e.enRayon, 0);

    return {
      parEtagere,
      resume: {
        etageresClasse: parEtagere.length,
        produitsRequis: totalRequis,
        enRayon: totalEnRayon,
        couvertureMoyenne: parEtagere.length === 0 ? 0 : parEtagere.reduce((a, e) => a + e.couverture, 0) / parEtagere.length,
        completudeMoyenne: parEtagere.length === 0 ? 0 : parEtagere.reduce((a, e) => a + e.completude, 0) / parEtagere.length,
      },
    };
  }),
});
