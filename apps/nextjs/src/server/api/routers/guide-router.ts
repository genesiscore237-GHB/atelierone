import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import {
  db,
  categories,
  attributDefinitions,
  guideCategories,
  guideSteps,
  guideRules,
  guideExamples,
  guideCommonErrors,
  guideSearchAliases,
  produits,
  produitArticles,
} from "@atelierone/db";
import { eq, and, asc, sql, inArray, or, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  searchArticleConcept,
  getArticleConcept,
  checkExistingProduct,
} from "~/server/lib/guide-service";

/**
 * GUIDE DE SAISIE INTELLIGENT (PHASE 3, Module 1).
 * Lecture seule — wrapped par requirePermission("stock.consulter"), invalidation n/a.
 * `getGuideForCategory` sert un bundle complet en UNE requête aux 4 points d'entrée :
 * (1) catégorie, (2) recherche (explain), (3) fiche article, (4) wizard.
 */

/** Remonte la chaîne d'ancêtres d'une catégorie (nœud → racine). */
async function chaineAncetres(categorieId: number): Promise<{ id: number; nom: string; niveauOntologie: string | null; typeBranche: string | null }[]> {
  const chain: { id: number; nom: string; niveauOntologie: string | null; typeBranche: string | null }[] = [];
  const rows = await db.select().from(categories).where(eq(categories.id, categorieId)).limit(1);
  let cur = rows[0] ?? null;
  const seen = new Set<number>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push({ id: cur.id, nom: cur.nom, niveauOntologie: cur.niveauOntologie, typeBranche: cur.typeBranche });
    if (cur.parentId == null) break;
    const parent = await db.select().from(categories).where(eq(categories.id, cur.parentId)).limit(1);
    cur = parent[0] ?? null;
  }
  return chain;
}

export const guideRouter = createTRPCRouter({
  /**
   * Bundle du guide pour une catégorie : chaîne, en-tête, définitions résolues,
   * étapes, règles, erreurs courantes et exemples de référence.
   */
  getGuideForCategory: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      categorieId: z.number().int(),
      portee: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const chain = await chaineAncetres(input.categorieId);
      if (chain.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Catégorie introuvable." });
      const cata = chain[0];
      const branche = chain.find((c) => c.typeBranche)?.typeBranche ?? null;
      const bredCats = chain.map((c) => c.id);

      // En-tête de guide : par catégorie exacte, sinon par typeProduit (fallback transverse)
      const [enTete] = await db.select().from(guideCategories)
        .where(and(
          eq(guideCategories.isActive, true),
          or(
            eq(guideCategories.categorieId, input.categorieId),
            sql`${guideCategories.categorieId} IS NULL AND ${guideCategories.typeProduit} IS NOT NULL`
          )
        ))
        .orderBy(asc(guideCategories.ordre))
        .limit(1);

      // Résolution des définitions (catégorie > famille > type de branche)
      const scopes = [inArray(attributDefinitions.categorieId, bredCats)];
      if (branche) scopes.push(sql`${attributDefinitions.typeProduit} = ${branche}`);
      if (bredCats.length > 1) scopes.push(or(...bredCats.slice(1).map((id) => sql`${attributDefinitions.familleId} = ${id}`)));
      const conds: any[] = [eq(attributDefinitions.isActive, true), or(...scopes.filter(Boolean))];
      if (input.portee) conds.push(eq(attributDefinitions.portee, input.portee));
      const defs = await db.select().from(attributDefinitions)
        .where(and(...conds.filter((c) => c != null)))
        .orderBy(asc(attributDefinitions.ordre), asc(attributDefinitions.cle));
      const merged = new Map<string, (typeof attributDefinitions.$inferSelect)>();
      for (const d of defs) {
        const key = d.cle + "::" + d.portee;
        const poids = (x: (typeof attributDefinitions.$inferSelect)) => (x.categorieId != null ? 2 : x.familleId != null ? 1 : 0);
        const ex = merged.get(key);
        if (!ex || poids(d) > poids(ex)) merged.set(key, d);
      }
      const definitions = [...merged.values()].map((d) => ({
        id: d.id,
        cle: d.cle,
        libelle: d.libelle,
        typeAttribut: d.typeAttribut,
        portee: d.portee,
        obligatoire: d.obligatoire,
        typeProduit: d.typeProduit,
        liste: d.liste ?? [],
        min: d.min != null ? String(d.min) : null,
        max: d.max != null ? String(d.max) : null,
        uniteId: d.uniteId,
        aide: d.aide,
        ordre: d.ordre,
        modeleValeur: d.modeleValeur ?? null,
        explication: d.explication ?? null,
      }));

      const [steps, rules, errors, examples] = await Promise.all([
        db.select().from(guideSteps)
          .where(eq(guideSteps.categorieId, input.categorieId))
          .orderBy(asc(guideSteps.ordre)),
        db.select().from(guideRules).where(eq(guideRules.categorieId, input.categorieId)),
        db.select().from(guideCommonErrors).where(eq(guideCommonErrors.categorieId, input.categorieId)),
        db.select({
          id: guideExamples.id,
          produitId: guideExamples.produitId,
          articleId: guideExamples.articleId,
          libelle: guideExamples.libelle,
          motif: guideExamples.motif,
          estReference: guideExamples.estReference,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          referencePrincipale: produits.referencePrincipale,
          designationArticle: produitArticles.designation,
        })
          .from(guideExamples)
          .leftJoin(produits, eq(produits.id, guideExamples.produitId))
          .leftJoin(produitArticles, eq(produitArticles.id, guideExamples.articleId))
          .where(eq(guideExamples.categorieId, input.categorieId))
          .orderBy(asc(guideExamples.ordre)),
      ]);

      return {
        categorie: cata,
        chain: chain.map((c) => ({ id: c.id, nom: c.nom, niveauOntologie: c.niveauOntologie })),
        branche,
        guide: enTete ?? null,
        definitions,
        steps,
        rules,
        errors,
        examples,
      };
    }),

  /**
   * Résolution d'un terme vernaculaire → catégorie ou champ (guide_search_aliases).
   * Retourne les cibles possibles pour « à quoi ça correspond ? ».
   */
  resolveAlias: requirePermissionProcedure("stock.consulter")
    .input(z.object({ term: z.string().min(1).max(160) }))
    .query(async ({ input }) => {
      const term = input.term.trim().toLowerCase();
      const rows = await db.select({
        alias: guideSearchAliases.alias,
        type: guideSearchAliases.type,
        categorieId: guideSearchAliases.categorieId,
        definitionId: guideSearchAliases.definitionId,
        categorieNom: categories.nom,
        definitionCle: attributDefinitions.cle,
        definitionLibelle: attributDefinitions.libelle,
      })
        .from(guideSearchAliases)
        .leftJoin(categories, eq(categories.id, guideSearchAliases.categorieId))
        .leftJoin(attributDefinitions, eq(attributDefinitions.id, guideSearchAliases.definitionId))
        .where(or(
          eq(sql`lower(${guideSearchAliases.alias})`, term),
          like(sql`lower(${guideSearchAliases.alias})`, `%${term}%`),
        ))
        .limit(10);
      return rows.map((r) => ({
        alias: r.alias,
        type: r.type,
        categorieId: r.categorieId ?? null,
        categorieNom: r.categorieNom ?? null,
        definitionId: r.definitionId ?? null,
        definitionCle: r.definitionCle ?? null,
        definitionLibelle: r.definitionLibelle ?? null,
      }));
    }),

  /**
   * Recherche un concept article par nom / synonyme / référence / marque.
   * Retourne une liste ordonnée (0..N) — le front affiche la fiche si 1 résultat
   * net, sinon une étape de désambiguïsation.
   */
  searchConcept: requirePermissionProcedure("stock.consulter")
    .input(z.object({ term: z.string().min(1).max(160), limit: z.number().int().min(1).max(30).default(10) }))
    .query(async ({ input }) => {
      return searchArticleConcept(input.term, input.limit);
    }),

  /**
   * Fiche métier complète d'un concept article (catégorie cible) :
   * classification, définitions, variantes types + différenciateurs, procédures
   * (scénarios), mapping champ → wizard, règles de modélisation, relations,
   * erreurs, exemples, compatibilités.
   */
  getArticleConcept: requirePermissionProcedure("stock.consulter")
    .input(z.object({ categorieId: z.number().int(), portee: z.string().optional() }))
    .query(async ({ input }) => {
      const concept = await getArticleConcept(input.categorieId, input.portee);
      if (!concept) throw new TRPCError({ code: "NOT_FOUND", message: "Catégorie introuvable." });
      return concept;
    }),

  /**
   * « L'article existe déjà ? » — par référence. Recommande d'enrichir plutôt
   * que de créer pour éviter les doublons.
   */
  checkExisting: requirePermissionProcedure("stock.consulter")
    .input(z.object({ reference: z.string().min(1).max(160), limit: z.number().int().min(1).max(20).default(8) }))
    .query(async ({ input }) => {
      return checkExistingProduct(input.reference, input.limit);
    }),
});