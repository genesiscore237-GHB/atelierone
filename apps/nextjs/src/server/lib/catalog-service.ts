import { db, catalogueQualite, produitArticles, produits, categories, stocks } from "@atelierone/db";
import { eq, sql, and, count, desc } from "drizzle-orm";

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const LOCK_KEY = 792341; // pg_advisory_lock key

type ProblemeCode =
  | "INCOMPLETE_ARTICLE"
  | "DUPLICATE_CANDIDATE"
  | "MISSING_CATEGORY"
  | "MISSING_PRIMARY_REFERENCE"
  | "INVALID_REFERENCE"
  | "MISSING_BRAND"
  | "INVALID_COMPATIBILITY"
  | "ORPHAN_VARIANTE";

interface Probleme {
  code: ProblemeCode;
  count: number;
  severity: "error" | "warning" | "info";
  label: string;
}

/** Cache en mémoire côté serveur (uniquement utile entre 2 requêtes dans le même process). */
let memoryCache: { data: CatalogueQualiteResult; at: number } | null = null;

/** Requête de recalcul en cours (déduplication intra-process). */
let inflight: Promise<CatalogueQualiteResult> | null = null;

export interface CatalogueQualiteResult {
  totalArticles: number;
  totalVariantes: number;
  totalModeles: number;
  problemes: Probleme[];
  score: number;
  generatedAt: Date;
  generationDurationMs: number;
}

/**
 * Récupère ou régénère le snapshot de qualité.
 * Stratégie : cache mémoire → cache DB (TTL 10 min) → recalcul + advisory lock.
 */
export async function getCatalogueQualite(organisationId?: number): Promise<CatalogueQualiteResult> {
  // 1. Cache mémoire
  if (memoryCache && Date.now() - memoryCache.at < TTL_MS) {
    return memoryCache.data;
  }

  // 2. Cache DB
  const [cached] = await db
    .select()
    .from(catalogueQualite)
    .where(
      organisationId
        ? eq(catalogueQualite.organisationId, organisationId)
        : sql`${catalogueQualite.organisationId} IS NULL`
    )
    .orderBy(desc(catalogueQualite.generatedAt))
    .limit(1);

  if (cached) {
    const age = Date.now() - new Date(cached.generatedAt).getTime();
    if (age < TTL_MS) {
      const result: CatalogueQualiteResult = {
        totalArticles: cached.totalArticles,
        totalVariantes: cached.totalVariantes,
        totalModeles: cached.totalModeles,
        problemes: (cached.problemes as Probleme[]) ?? [],
        score: cached.score,
        generatedAt: new Date(cached.generatedAt),
        generationDurationMs: cached.generationDurationMs ?? 0,
      };
      memoryCache = { data: result, at: Date.now() };
      return result;
    }
  }

  // 3. Advisory lock + recalcul (dédupliqué : si un recalcul est déjà en cours, on l'attend)
  if (inflight) return inflight;
  inflight = regenerateQualite(organisationId, cached?.id ?? null).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function regenerateQualite(organisationId?: number, cachedId?: number | null): Promise<CatalogueQualiteResult> {
  const start = Date.now();

  // Advisory lock (skip if already locked)
  const [lockResult] = await db.execute(sql`SELECT pg_try_advisory_lock(${LOCK_KEY})`);
  const locked = (lockResult as any)?.pg_try_advisory_lock;
  if (!locked) {
    // Un autre process calcule déjà — attendre le cache
    const [waitCache] = await db
      .select()
      .from(catalogueQualite)
      .where(
        organisationId
          ? eq(catalogueQualite.organisationId, organisationId)
          : sql`${catalogueQualite.organisationId} IS NULL`
      )
      .orderBy(desc(catalogueQualite.generatedAt))
      .limit(1);
    if (waitCache) {
      return {
        totalArticles: waitCache.totalArticles,
        totalVariantes: waitCache.totalVariantes,
        totalModeles: waitCache.totalModeles,
        problemes: (waitCache.problemes as Probleme[]) ?? [],
        score: waitCache.score,
        generatedAt: new Date(waitCache.generatedAt),
        generationDurationMs: waitCache.generationDurationMs ?? 0,
      };
    }
  }

  try {
    // Compteurs globaux
    const [articleCount] = await db
      .select({ total: count() })
      .from(produitArticles)
      .where(eq(produitArticles.isActive, true));

    const [varianteCount] = await db
      .select({ total: count() })
      .from(produits)
      .where(and(eq(produits.isActive, true), sql`${produits.niveau} = 'VARIANTE'`));

    const [modeleCount] = await db
      .select({ total: count() })
      .from(produits)
      .where(and(eq(produits.isActive, true), sql`${produits.niveau} = 'EXEMPLAIRE'`));

    const totalArticles = articleCount?.total ?? 0;
    const totalVariantes = varianteCount?.total ?? 0;
    const totalModeles = modeleCount?.total ?? 0;

    // Règles de qualité
    const problemes: Probleme[] = [];

    // INCOMPLETE_ARTICLE : articles sans désignation ou sans code
    const [incompleteRes] = await db
      .select({ total: count() })
      .from(produitArticles)
      .where(
        and(
          eq(produitArticles.isActive, true),
          sql`(${produitArticles.designation} IS NULL OR ${produitArticles.designation} = '' OR ${produitArticles.code} IS NULL OR ${produitArticles.code} = '')`
        )
      );
    const incompleteCount = incompleteRes?.total ?? 0;
    if (incompleteCount > 0) {
      problemes.push({
        code: "INCOMPLETE_ARTICLE",
        count: incompleteCount,
        severity: "warning",
        label: "Articles incomplets (sans code ou désignation)",
      });
    }

    // MISSING_CATEGORY : articles sans catégorie
    const [missingCatRes] = await db
      .select({ total: count() })
      .from(produitArticles)
      .where(
        and(
          eq(produitArticles.isActive, true),
          sql`${produitArticles.categorieId} IS NULL`
        )
      );
    const missingCatCount = missingCatRes?.total ?? 0;
    if (missingCatCount > 0) {
      problemes.push({
        code: "MISSING_CATEGORY",
        count: missingCatCount,
        severity: "warning",
        label: "Articles sans catégorie assignée",
      });
    }

    // MISSING_BRAND : articles sans marque (via variante)
    const [missingBrandRes] = await db
      .select({ total: count() })
      .from(produits)
      .where(
        and(
          eq(produits.isActive, true),
          sql`${produits.niveau} = 'VARIANTE'`,
          sql`(${produits.marque} IS NULL OR ${produits.marque} = '')`
        )
      );
    const missingBrandCount = missingBrandRes?.total ?? 0;
    if (missingBrandCount > 0) {
      problemes.push({
        code: "MISSING_BRAND",
        count: missingBrandCount,
        severity: "info",
        label: "Variantes sans marque renseignée",
      });
    }

    // MISSING_PRIMARY_REFERENCE : variantes sans référence principale
    const [missingRefRes] = await db
      .select({ total: count() })
      .from(produits)
      .where(
        and(
          eq(produits.isActive, true),
          sql`${produits.niveau} = 'VARIANTE'`,
          sql`(${produits.referenceFabricant} IS NULL OR ${produits.referenceFabricant} = '') AND (${produits.refOem} IS NULL OR ${produits.refOem} = '')`
        )
      );
    const missingRefCount = missingRefRes?.total ?? 0;
    if (missingRefCount > 0) {
      problemes.push({
        code: "MISSING_PRIMARY_REFERENCE",
        count: missingRefCount,
        severity: "warning",
        label: "Variantes sans référence fabricant ni OEM",
      });
    }

    // DUPLICATE_CANDIDATE : variantes avec même designationCourte
    const [dupRes] = await db.execute(sql`
      SELECT count(*)::int AS total FROM (
        SELECT 1 FROM produits
        WHERE is_active = true AND designation_courte IS NOT NULL AND designation_courte != ''
        GROUP BY lower(designation_courte) HAVING count(*) > 1
      ) sub
    `);
    const dupCount = (dupRes as any)?.total ?? 0;
    if (dupCount > 0) {
      problemes.push({
        code: "DUPLICATE_CANDIDATE",
        count: dupCount,
        severity: "error",
        label: "Groupes de doublons potentiels détectés",
      });
    }

    // ORPHAN_VARIANTE : variantes/exemplaires actifs sans article parent rattaché
    const [orphanRes] = await db
      .select({ total: count() })
      .from(produits)
      .where(
        and(
          eq(produits.isActive, true),
          sql`${produits.articleId} IS NULL`,
          sql`${produits.niveau} IN ('VARIANTE', 'EXEMPLAIRE')`
        )
      );
    const orphanCount = orphanRes?.total ?? 0;
    if (orphanCount > 0) {
      problemes.push({
        code: "ORPHAN_VARIANTE",
        count: orphanCount,
        severity: "warning",
        label: "Variantes/exemplaires sans article rattaché",
      });
    }

    // Score : 100 - pénalités
    const penalty =
      incompleteCount * 2 +
      missingCatCount * 2 +
      missingBrandCount * 1 +
      missingRefCount * 1 +
      dupCount * 3 +
      orphanCount * 2;
    const score = Math.max(0, Math.min(100, 100 - penalty));

    const durationMs = Date.now() - start;
    const now = new Date();

    // Upsert le snapshot
    if (cachedId) {
      await db
        .update(catalogueQualite)
        .set({
          totalArticles,
          totalVariantes,
          totalModeles,
          problemes,
          score,
          generatedAt: now,
          generationDurationMs: durationMs,
        })
        .where(eq(catalogueQualite.id, cachedId));
    } else {
      await db.insert(catalogueQualite).values({
        organisationId: organisationId ?? null,
        totalArticles,
        totalVariantes,
        totalModeles,
        problemes,
        score,
        generatedAt: now,
        generationDurationMs: durationMs,
      });
    }

    const result: CatalogueQualiteResult = {
      totalArticles,
      totalVariantes,
      totalModeles,
      problemes,
      score,
      generatedAt: now,
      generationDurationMs: durationMs,
    };
    memoryCache = { data: result, at: Date.now() };
    return result;
  } finally {
    try {
      await db.execute(sql`SELECT pg_advisory_unlock(${LOCK_KEY})`);
    } catch { /* ignore */ }
  }
}

/**
 * Drill-down : retourne les articles concernés par un problème donné.
 */
export async function getQualiteDetail(
  code: ProblemeCode,
  page = 1,
  limit = 50,
  organisationId?: number
): Promise<{ items: any[]; total: number }> {
  const offset = (page - 1) * limit;

  switch (code) {
    case "INCOMPLETE_ARTICLE": {
      const [totalRes] = await db
        .select({ total: count() })
        .from(produitArticles)
        .where(
          and(
            eq(produitArticles.isActive, true),
            sql`(${produitArticles.designation} IS NULL OR ${produitArticles.designation} = '' OR ${produitArticles.code} IS NULL OR ${produitArticles.code} = '')`
          )
        );
      const items = await db
        .select({
          id: produitArticles.id,
          code: produitArticles.code,
          designation: produitArticles.designation,
          typeProduit: produitArticles.typeProduit,
          createdAt: produitArticles.createdAt,
        })
        .from(produitArticles)
        .where(
          and(
            eq(produitArticles.isActive, true),
            sql`(${produitArticles.designation} IS NULL OR ${produitArticles.designation} = '' OR ${produitArticles.code} IS NULL OR ${produitArticles.code} = '')`
          )
        )
        .orderBy(produitArticles.createdAt)
        .limit(limit)
        .offset(offset);
      return { items, total: totalRes?.total ?? 0 };
    }

    case "MISSING_CATEGORY": {
      const [totalRes] = await db
        .select({ total: count() })
        .from(produitArticles)
        .where(
          and(
            eq(produitArticles.isActive, true),
            sql`${produitArticles.categorieId} IS NULL`
          )
        );
      const items = await db
        .select({
          id: produitArticles.id,
          code: produitArticles.code,
          designation: produitArticles.designation,
          typeProduit: produitArticles.typeProduit,
        })
        .from(produitArticles)
        .where(
          and(
            eq(produitArticles.isActive, true),
            sql`${produitArticles.categorieId} IS NULL`
          )
        )
        .orderBy(produitArticles.createdAt)
        .limit(limit)
        .offset(offset);
      return { items, total: totalRes?.total ?? 0 };
    }

    case "MISSING_BRAND": {
      const [totalRes] = await db
        .select({ total: count() })
        .from(produits)
        .where(
          and(
            eq(produits.isActive, true),
            sql`${produits.niveau} = 'VARIANTE'`,
            sql`(${produits.marque} IS NULL OR ${produits.marque} = '')`
          )
        );
      const items = await db
        .select({
          id: produits.id,
          titre: produits.titre,
          codeArticle: produits.codeArticle,
          typeProduit: produits.typeProduit,
        })
        .from(produits)
        .where(
          and(
            eq(produits.isActive, true),
            sql`${produits.niveau} = 'VARIANTE'`,
            sql`(${produits.marque} IS NULL OR ${produits.marque} = '')`
          )
        )
        .orderBy(produits.createdAt)
        .limit(limit)
        .offset(offset);
      return { items, total: totalRes?.total ?? 0 };
    }

    case "MISSING_PRIMARY_REFERENCE": {
      const [totalRes] = await db
        .select({ total: count() })
        .from(produits)
        .where(
          and(
            eq(produits.isActive, true),
            sql`${produits.niveau} = 'VARIANTE'`,
            sql`(${produits.referenceFabricant} IS NULL OR ${produits.referenceFabricant} = '') AND (${produits.refOem} IS NULL OR ${produits.refOem} = '')`
          )
        );
      const items = await db
        .select({
          id: produits.id,
          titre: produits.titre,
          codeArticle: produits.codeArticle,
          typeProduit: produits.typeProduit,
        })
        .from(produits)
        .where(
          and(
            eq(produits.isActive, true),
            sql`${produits.niveau} = 'VARIANTE'`,
            sql`(${produits.referenceFabricant} IS NULL OR ${produits.referenceFabricant} = '') AND (${produits.refOem} IS NULL OR ${produits.refOem} = '')`
          )
        )
        .orderBy(produits.createdAt)
        .limit(limit)
        .offset(offset);
      return { items, total: totalRes?.total ?? 0 };
    }

    case "DUPLICATE_CANDIDATE": {
      const totalRes = await db.execute(sql`
        SELECT COALESCE(sum(cnt), 0)::int AS total FROM (
          SELECT count(*) AS cnt FROM produits
          WHERE is_active = true AND designation_courte IS NOT NULL AND designation_courte != ''
          GROUP BY lower(designation_courte) HAVING count(*) > 1
        ) sub
      `);
      const total = Number((totalRes as any)?.total ?? 0);
      const items = await db.execute(sql`
        SELECT p.id, p.titre, p.code_article, p.type_produit, p.designation_courte,
               (SELECT count(*) FROM produits p2 WHERE p2.is_active = true AND lower(p2.designation_courte) = lower(p.designation_courte)) AS occurrences
        FROM produits p
        WHERE p.is_active = true AND p.designation_courte IS NOT NULL AND p.designation_courte != ''
          AND EXISTS (
            SELECT 1 FROM produits p3
            WHERE p3.is_active = true AND lower(p3.designation_courte) = lower(p.designation_courte)
              AND p3.id != p.id
          )
        ORDER BY lower(p.designation_courte), p.id
        LIMIT ${limit} OFFSET ${offset}
      `);
      return { items: (items as any[]).map(r => ({
        id: r.id,
        titre: r.titre,
        codeArticle: r.code_article,
        typeProduit: r.type_produit,
        designationCourte: r.designation_courte,
        occurrences: Number(r.occurrences),
      })), total };
    }

    case "ORPHAN_VARIANTE": {
      const [totalRes] = await db
        .select({ total: count() })
        .from(produits)
        .where(
          and(
            eq(produits.isActive, true),
            sql`${produits.articleId} IS NULL`,
            sql`${produits.niveau} IN ('VARIANTE', 'EXEMPLAIRE')`
          )
        );
      const items = await db
        .select({
          id: produits.id,
          titre: produits.titre,
          codeArticle: produits.codeArticle,
          typeProduit: produits.typeProduit,
        })
        .from(produits)
        .where(
          and(
            eq(produits.isActive, true),
            sql`${produits.articleId} IS NULL`,
            sql`${produits.niveau} IN ('VARIANTE', 'EXEMPLAIRE')`
          )
        )
        .orderBy(produits.createdAt)
        .limit(limit)
        .offset(offset);
      return { items, total: totalRes?.total ?? 0 };
    }

    default:
      return { items: [], total: 0 };
  }
}
