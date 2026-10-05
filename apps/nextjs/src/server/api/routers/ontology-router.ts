import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure, adminProcedure } from "~/server/api/trpc";
import { db, attributDefinitions, unitesDomaines, unitesConversions, unitesMesure, categories } from "@atelierone/db";
import { eq, and, asc, sql, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  typeAttributsSchemaLegacy,
  porteeAttributSchema,
  normalizeTypeAttribut,
} from "@atelierone/validators";

/**
 * ONTOLOGIE DU CATALOGUE — P0 (fondations du « Catalogue Universel »).
 * - attribut_definitions : gabarits d'attributs par catégorie/famille/type de produit
 *   (c'est ce qui rend « NEW CATEGORY WITHOUT CODE CHANGE » complet pour l'UI).
 * - unites_domaines / unites_conversions : moteur de conversion global (1000 mm = 1 m).
 * Aucune suppression de procédure existante : rétro-compatible.
 */

/** Remonte la chaîne d'ancêtres d'une catégorie (nœud → racine). */
async function chaineAncetres(categorieId: number): Promise<{ id: number; typeBranche: string | null }[]> {
  const chain: { id: number; typeBranche: string | null }[] = [];
  const rows = (await db.select().from(categories).where(eq(categories.id, categorieId)).limit(1)) as {
    id: number; parentId: number | null; typeBranche: string | null;
  }[];
  let cur = rows[0] ?? null;
  const seen = new Set<number>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push({ id: cur.id, typeBranche: cur.typeBranche });
    if (cur.parentId == null) break;
    const parent = (await db.select().from(categories).where(eq(categories.id, cur.parentId)).limit(1)) as {
      id: number; parentId: number | null; typeBranche: string | null;
    }[];
    cur = parent[0] ?? null;
  }
  return chain;
}

/** Définition d'attribut enrichie (libellé catégorie + unité) pour la sortie API. */
type DefEnrichie = {
  id: number;
  categorieId: number | null;
  categorieNom: string | null;
  familleId: number | null;
  typeProduit: string | null;
  portee: string;
  cle: string;
  libelle: string;
  typeAttribut: string;
  obligatoire: boolean;
  searchable: boolean;
  filtrable: boolean;
  comparable: boolean;
  min: string | null;
  max: string | null;
  precision: string | null;
  liste: string[];
  uniteId: string | null;
  uniteCode: string | null;
  uniteSymbole: string | null;
  aide: string | null;
  ordre: number;
  isActive: boolean;
};

async function enrichir(defs: (typeof attributDefinitions.$inferSelect)[]): Promise<DefEnrichie[]> {
  if (defs.length === 0) return [];
  const catIds = new Set<number>();
  for (const d of defs) {
    if (d.categorieId != null) catIds.add(d.categorieId);
    if (d.familleId != null) catIds.add(d.familleId);
  }
  const unIds = new Set<string>();
  for (const d of defs) if (d.uniteId) unIds.add(d.uniteId);
  const [cats, unites] = await Promise.all([
    catIds.size ? db.select({ id: categories.id, nom: categories.nom }).from(categories).where(inArray(categories.id, [...catIds])) : Promise.resolve([]),
    unIds.size ? db.select().from(unitesMesure).where(inArray(unitesMesure.id, [...unIds])) : Promise.resolve([]),
  ]);
  const catMap = new Map(cats.map((c) => [c.id, c.nom]));
  const uniteMap = new Map(unites.map((u) => [u.id, u]));
  return defs.map((d) => ({
    id: d.id,
    categorieId: d.categorieId,
    categorieNom: d.categorieId != null ? catMap.get(d.categorieId) ?? null : null,
    familleId: d.familleId,
    typeProduit: d.typeProduit,
    portee: d.portee,
    cle: d.cle,
    libelle: d.libelle,
    typeAttribut: d.typeAttribut,
    obligatoire: d.obligatoire,
    searchable: d.searchable,
    filtrable: d.filtrable,
    comparable: d.comparable,
    min: d.min != null ? String(d.min) : null,
    max: d.max != null ? String(d.max) : null,
    precision: d.precision != null ? String(d.precision) : null,
    liste: d.liste ?? [],
    uniteId: d.uniteId ?? null,
    uniteCode: d.uniteId && uniteMap.get(d.uniteId) ? uniteMap.get(d.uniteId)!.code : null,
    uniteSymbole: d.uniteId && uniteMap.get(d.uniteId) ? uniteMap.get(d.uniteId)!.symbole : null,
    aide: d.aide,
    ordre: d.ordre,
    isActive: d.isActive,
  }));
}

export const ontologyRouter = createTRPCRouter({
  /** Liste brute des définitions (filtres facultatifs : catégorie, famille, type, portee). */
  listDefinitions: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      categorieId: z.number().int().optional(),
      familleId: z.number().int().optional(),
      typeProduit: z.string().optional(),
      portee: porteeAttributSchema.optional(),
    }).optional())
    .query(async ({ input }) => {
      const conds = [];
      if (input?.categorieId != null) conds.push(eq(attributDefinitions.categorieId, input.categorieId));
      if (input?.familleId != null) conds.push(eq(attributDefinitions.familleId, input.familleId));
      if (input?.typeProduit != null) conds.push(eq(attributDefinitions.typeProduit, input.typeProduit));
      if (input?.portee != null) conds.push(eq(attributDefinitions.portee, input.portee));
      const rows = await db.select().from(attributDefinitions)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(asc(attributDefinitions.ordre), asc(attributDefinitions.cle));
      return enrichir(rows);
    }),

  /** Résolution ontologique d'une catégorie : chaîne d'ancêtres + type de branche. */
  getDefinitionsForCategory: requirePermissionProcedure("stock.consulter")
    .input(z.object({ categorieId: z.number().int(), portee: porteeAttributSchema.optional() }))
    .query(async ({ input }) => {
      const chain = await chaineAncetres(input.categorieId);
      if (chain.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Catégorie introuvable." });
      const branch = chain.find((c) => c.typeBranche)?.typeBranche ?? null;
      const catIds = chain.map((c) => c.id);
      const scopes = [inArray(attributDefinitions.categorieId, catIds)];
      if (branch) scopes.push(sql`${attributDefinitions.typeProduit} = ${branch}`);
      if (catIds.length > 1) scopes.push(or(...catIds.slice(1).map((id) => sql`${attributDefinitions.familleId} = ${id}`)));
      const conds: any[] = [eq(attributDefinitions.isActive, true), or(...scopes.filter(Boolean))];
      if (input.portee) conds.push(eq(attributDefinitions.portee, input.portee));
      const rows = await db.select().from(attributDefinitions)
        .where(and(...conds.filter((c) => c != null)))
        .orderBy(asc(attributDefinitions.ordre), asc(attributDefinitions.cle));
      const enriched = await enrichir(rows);
      // Surcharge : la définition la plus spécifique gagne (catégorie exacte > famille > type).
      const merged = new Map<string, DefEnrichie>();
      for (const d of enriched) {
        const key = d.cle + "::" + d.portee;
        const existing = merged.get(key);
        const poids = (dd: DefEnrichie) => (dd.categorieId != null ? 2 : dd.familleId != null ? 1 : 0);
        if (!existing || poids(d) > poids(existing)) merged.set(key, d);
      }
      return { categorieId: input.categorieId, chain: chain.map((c) => c.id), branch, definitions: [...merged.values()] };
    }),

  /** Créer / mettre à jour une définition (upsert par portée + clé). */
  upsertDefinition: adminProcedure
    .input(z.object({
      id: z.number().int().optional(),
      categorieId: z.number().int().optional(),
      familleId: z.number().int().optional(),
      typeProduit: z.string().optional(),
      portee: porteeAttributSchema.default("ARTICLE"),
      cle: z.string().min(1).max(100),
      libelle: z.string().min(1).max(160),
      typeAttribut: typeAttributsSchemaLegacy.default("TEXTE"),
      obligatoire: z.boolean().default(false),
      searchable: z.boolean().default(false),
      filtrable: z.boolean().default(false),
      comparable: z.boolean().default(false),
      min: z.number().optional(),
      max: z.number().optional(),
      precision: z.number().optional(),
      liste: z.array(z.string()).default([]),
      uniteId: z.string().uuid().optional(),
      aide: z.string().optional(),
      ordre: z.number().int().default(0),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.categorieId == null && input.familleId == null && !input.typeProduit) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Une définition doit cibler une catégorie, une famille ou un type de produit." });
      }
      if (input.min != null && input.max != null && input.max < input.min) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "max doit être supérieur ou égal à min." });
      }
      const values = {
        categorieId: input.categorieId ?? null,
        familleId: input.familleId ?? null,
        typeProduit: input.typeProduit ?? null,
        portee: input.portee,
        cle: input.cle.trim(),
        libelle: input.libelle.trim(),
        typeAttribut: normalizeTypeAttribut(input.typeAttribut),
        obligatoire: input.obligatoire,
        searchable: input.searchable,
        filtrable: input.filtrable,
        comparable: input.comparable,
        min: input.min != null ? String(input.min) : null,
        max: input.max != null ? String(input.max) : null,
        precision: input.precision != null ? String(input.precision) : null,
        liste: input.liste,
        uniteId: input.uniteId ?? null,
        aide: input.aide ?? null,
        ordre: input.ordre,
        isActive: input.isActive,
      } as any;
      if (input.id) {
        const [row] = await db.update(attributDefinitions).set({ ...values, updatedAt: sql`now()` }).where(eq(attributDefinitions.id, input.id)).returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Définition introuvable." });
        const [enr] = await enrichir([row]);
        return enr;
      }
      // Upsert par scope complet (quelque soit le chemin : catégorie, famille ou type).
      const scope = and(
        input.categorieId != null ? sql`${attributDefinitions.categorieId} IS NOT DISTINCT FROM ${input.categorieId}` : sql`${attributDefinitions.categorieId} IS NULL`,
        input.familleId != null ? sql`${attributDefinitions.familleId} IS NOT DISTINCT FROM ${input.familleId}` : sql`${attributDefinitions.familleId} IS NULL`,
        input.typeProduit != null ? sql`${attributDefinitions.typeProduit} IS NOT DISTINCT FROM ${input.typeProduit}` : sql`${attributDefinitions.typeProduit} IS NULL`,
        eq(attributDefinitions.cle, input.cle.trim()),
        eq(attributDefinitions.portee, input.portee),
      );
      const [existing] = await db.select({ id: attributDefinitions.id }).from(attributDefinitions).where(scope as any).limit(1);
      if (existing) {
        const [row] = await db.update(attributDefinitions).set({ ...values, updatedAt: sql`now()` }).where(eq(attributDefinitions.id, existing.id)).returning();
        const [enr] = await enrichir([row]);
        return enr;
      }
      const [row] = await db.insert(attributDefinitions).values(values).returning();
      const [enr] = await enrichir([row]);
      return enr;
    }),

  deleteDefinition: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(attributDefinitions).where(eq(attributDefinitions.id, input.id));
      return { success: true };
    }),

  /** Domaines d'unités avec leurs conversions (base + facteur/formule). */
  listDomains: requirePermissionProcedure("stock.consulter")
    .query(async () => {
      const rows = await db.select().from(unitesDomaines).orderBy(asc(unitesDomaines.code));
      if (rows.length === 0) return [];
      const convs = await db.select({
        id: unitesConversions.id,
        domaineId: unitesConversions.domaineId,
        uniteId: unitesConversions.uniteId,
        facteurVersBase: unitesConversions.facteurVersBase,
        formuleDerivee: unitesConversions.formuleDerivee,
        precision: unitesConversions.precision,
        uniteCode: unitesMesure.code,
        uniteLibelle: unitesMesure.libelle,
        uniteSymbole: unitesMesure.symbole,
      })
        .from(unitesConversions)
        .innerJoin(unitesMesure, eq(unitesMesure.id, unitesConversions.uniteId))
        .where(inArray(unitesConversions.domaineId, rows.map((r) => r.id)))
        .orderBy(asc(unitesMesure.code));
      const map = new Map<string, any[]>();
      for (const c of convs) {
        const l = map.get(c.domaineId) ?? [];
        l.push(c); map.set(c.domaineId, l);
      }
      return rows.map((d) => {
        const convs = (map.get(d.id) ?? []).map((c) => ({
          uniteId: c.uniteId,
          uniteCode: c.uniteCode,
          uniteLibelle: c.uniteLibelle,
          uniteSymbole: c.uniteSymbole,
          facteurVersBase: c.facteurVersBase != null ? String(c.facteurVersBase) : null,
          formuleDerivee: c.formuleDerivee,
        }));
        return {
          id: d.id,
          code: d.code,
          libelle: d.libelle,
          uniteBaseId: d.uniteBaseId,
          baseCode: convs.find((c) => c.uniteId === d.uniteBaseId)?.uniteCode ?? null,
          conversions: convs,
        };
      });
    }),

  /**
   * Conversion d'une valeur entre deux unités du MÊME domaine (ex. 1000 mm = 1 m).
   * Linéaire uniquement (température via formule non linéaire : BAD_REQUEST explicite).
   */
  convert: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      valeur: z.number(),
      uniteId: z.string().uuid(),
      cibleUniteId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      const urs = await db.select()
        .from(unitesConversions)
        .where(and(inArray(unitesConversions.uniteId, [input.uniteId, input.cibleUniteId])));
      if (urs.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Ces unités n'appartiennent à aucun domaine référencé." });
      const domA = new Set(urs.filter((r) => r.uniteId === input.uniteId).map((r) => r.domaineId));
      const domB = new Set(urs.filter((r) => r.uniteId === input.cibleUniteId).map((r) => r.domaineId));
      const commun = [...domA].filter((d) => domB.has(d));
      if (commun.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Unités de domaines différents — conversion impossible." });
      const domaineId = commun[0];
      const a = urs.find((r) => r.uniteId === input.uniteId && r.domaineId === domaineId)!;
      const b = urs.find((r) => r.uniteId === input.cibleUniteId && r.domaineId === domaineId)!;
      if (a.facteurVersBase == null || b.facteurVersBase == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cette conversion est non linéaire (température) : formule à évaluer, non factorisée." });
      }
      const factA = Number(a.facteurVersBase);
      const factB = Number(b.facteurVersBase);
      const enBase = input.valeur * factA;
      const convertie = enBase / factB;
      return { valeur: input.valeur, valeurConvertie: convertie, domaineId, uniteId: input.uniteId, cibleUniteId: input.cibleUniteId };
    }),
});