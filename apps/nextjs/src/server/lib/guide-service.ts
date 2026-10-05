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
  guideVariantTypes,
  guideVariantDifferentiators,
  guideProcedures,
  guideProcedureSteps,
  guideFieldMappings,
  guideModelingRules,
  guideRelations,
  produits,
  produitArticles,
  produitReferences,
  produitReferencesEquiv,
  compatibilitesProduits,
} from "@atelierone/db";
import { eq, and, asc, sql, inArray, or, like } from "drizzle-orm";

/**
 * OUTIL D'AIDE INTELLIGENT À LA SAISIE DES ARTICLES (« Concept Article »).
 * Couche métier pure : rien de spécifique tRPC ici — les routers s'appuient
 * dessus. Le principe est ARTICLE-CENTRIC :
 *
 *   "Filtre à huile" → searchArticleConcept() → catégorie cible
 *   catégorie       → getArticleConcept()     → fiche métier complète
 *   référence       → checkExistingProduct()  → « enrichir, ne pas créer »
 */

// ── Normalisation (fautes de frappe, accents, espaces) ───────────────────────

export function normalizeTexte(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeRef(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function tokens(s: string): string[] {
  return normalizeTexte(s).split(" ").filter(Boolean);
}

/** Distance de Levenshtein (tolérance aux fautes : « lhuile » ≃ « huile »). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i, ...Array(b.length).fill(0)];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Un token du terme correspond (exact ou à 1 faute près) à un mot du nom. */
function tokenMatch(tok: string, nameWords: string[], tol: number): boolean {
  if (tok.length <= 1) return nameWords.some((w) => w === tok);
  if (nameWords.some((w) => w === tok || w.startsWith(tok))) return true;
  return nameWords.some((w) => levenshtein(tok, w) <= Math.min(tol, w.length));
}

/** Types de branche « produit physique » pertinents pour l'identification métier. */
const BRANCHES_PRODUIT = ["PIECE", "CONSOMMABLE", "OUTIL", "EQUIPEMENT", "SERVICE"];

/** Translittération SQL des accents FR pour un filtrage accent-insensible. */
const ACCENTS_SRC = "àâäéèêëïîôöùûüç";
const ACCENTS_DST = "aaaeeeeiioouuuc";

function esc(t: string): string {
  return t.replace(/[%_]/g, "");
}

// ── Chaîne d'ancêtres ─────────────────────────────────────────────────────────

async function chaineAncetres(categorieId: number): Promise<
  { id: number; nom: string; niveauOntologie: string | null; typeBranche: string | null }[]
> {
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

// ── Coeurs de score ───────────────────────────────────────────────────────────

function scoreCategorie(cat: { nom: string }, termeN: string, termTokens: string[]): number | null {
  const nomN = normalizeTexte(cat.nom);
  if (nomN === termeN) return 100;
  const nomNoSpace = nomN.replace(/\s+/g, "");
  const termeNoSpace = termeN.replace(/\s+/g, "");
  if (nomNoSpace === termeNoSpace) return 98;
  // Tous les tokens du terme présents dans le nom (ordre libre) → correspondance forte
  if (termTokens.length > 0 && termTokens.every((t) => nomN.includes(t))) {
    return 70 + Math.min(10, nomN.length);
  }
  // Le nom est contenu dans le terme (ex : terme = « filtre à huile Toyota »)
  if (nomN.length >= 4 && termeN.includes(nomN)) return 60;
  // Tous les tokens correspondent à 1 faute de frappe près (« lhuile » ≃ « huile »)
  const nameWords = nomN.split(" ");
  if (termTokens.length > 0 && termTokens.every((t) => tokenMatch(t, nameWords, 1))) {
    return 60;
  }
  // Un seul token en commun → faible
  const hits = termTokens.filter((t) => nomN.includes(t)).length;
  if (hits > 0) return 30 + hits * 5;
  return null;
}

// ── 1. Identification par nom / synonyme / référence ─────────────────────────

export interface ConceptSearchCible {
  kind: "CATEGORIE" | "PRODUIT";
  categorieId: number | null;
  categorieNom: string | null;
  chainNoms: string[];
  typeBranche: string | null;
  niveauOntologie: string | null;
  matchedBy: string;
  explication: string;
  score: number;
  // Produit
  produitId?: number;
  titreProduit?: string;
  marque?: string;
  referencePrincipale?: string;
  articleId?: number | null;
}

export async function searchArticleConcept(
  term: string,
  limit = 10
): Promise<ConceptSearchCible[]> {
  const termeN = normalizeTexte(term);
  const termTokens = tokens(term);
  if (!termeN) return [];

  const results: ConceptSearchCible[] = [];
  const byCat = new Map<number, ConceptSearchCible>();
  const push = (c: ConceptSearchCible) => {
    if (c.categorieId == null) { results.push(c); return; }
    const ex = byCat.get(c.categorieId);
    if (!ex || c.score > ex.score) byCat.set(c.categorieId, c);
  };

  // (A) Catégories candidates par scan des branches produit (pas d'accents à tester :
  //     filtrage via translate() en SQL, ordre par longueur pour favoriser le nom exact)
  const gab = sql`translate(lower(${categories.nom}), ${ACCENTS_SRC}, ${ACCENTS_DST})`;
  const first = esc(termTokens[0] ?? termeN.slice(0, 3));
  if (first) {
    const rows = await db.select({
      id: categories.id,
      nom: categories.nom,
      typeBranche: categories.typeBranche,
      niveauOntologie: categories.niveauOntologie,
      parentId: categories.parentId,
    }).from(categories)
      .where(and(
        eq(categories.isActive, true),
        inArray(categories.typeBranche, BRANCHES_PRODUIT),
        sql`${gab} LIKE ${`%${first}%`}`,
      ))
      .orderBy(asc(sql`char_length(${categories.nom})`))
      .limit(500);
    for (const r of rows) {
      if (!BRANCHES_PRODUIT.includes(r.typeBranche ?? "")) continue;
      const score = scoreCategorie({ nom: r.nom }, termeN, termTokens);
      if (score == null) continue;
      const chain = await chaineAncetres(r.id);
      push({
        kind: "CATEGORIE",
        categorieId: r.id,
        categorieNom: r.nom,
        chainNoms: chain.map((c) => c.nom).reverse(),
        typeBranche: r.typeBranche,
        niveauOntologie: r.niveauOntologie,
        matchedBy: score >= 98 ? "Nom exact" : score >= 70 ? "Nom contenant le terme" : score >= 60 ? "Terme englobant" : "Correspondance partielle",
        explication: "",
        score,
      });
    }
  }

  // (B) Alias vernaculaires → catégorie
  const aliasRows = await db.select({
    alias: guideSearchAliases.alias,
    categorieId: guideSearchAliases.categorieId,
    categorieNom: categories.nom,
    typeBranche: categories.typeBranche,
    niveauOntologie: categories.niveauOntologie,
  })
    .from(guideSearchAliases)
    .leftJoin(categories, eq(categories.id, guideSearchAliases.categorieId))
.where(or(
      eq(sql`lower(${guideSearchAliases.alias})`, termeN),
      like(sql`lower(${guideSearchAliases.alias})`, `%${esc(termeN)}%`),
    ))
    .limit(30);
  for (const a of aliasRows) {
    if (!a.categorieId || !a.categorieNom) continue;
    if (!BRANCHES_PRODUIT.includes(a.typeBranche ?? "")) continue;
    const aN = normalizeTexte(a.alias);
    const score = aN === termeN ? 90 : aN.replace(/\s+/g, "") === termeN.replace(/\s+/g, "") ? 88 : tokens(a.alias).filter((t) => termTokens.includes(t)).length >= 2 ? 75 : 50;
    const chain = await chaineAncetres(a.categorieId);
    push({
      kind: "CATEGORIE",
      categorieId: a.categorieId,
      categorieNom: a.categorieNom,
      chainNoms: chain.map((c) => c.nom).reverse(),
      typeBranche: a.typeBranche,
      niveauOntologie: a.niveauOntologie,
      matchedBy: `Synonyme « ${a.alias} »`,
      explication: "",
      score,
    });
  }

  // (C) Référence de produit → identification catégorie + recommandation enrichir
  const refN = normalizeRef(term);
  if (refN.length >= 3) {
    const prodRows = await db.select({
      id: produits.id,
      titre: produits.titre,
      marque: produits.marque,
      referencePrincipale: produits.referencePrincipale,
      referenceFabricant: produits.referenceFabricant,
      refOem: produits.refOem,
      codeArticle: produits.codeArticle,
      niveau: produits.niveau,
      articleId: produits.articleId,
    }).from(produits)
      .where(and(
        eq(produits.isActive, true),
        or(
          eq(sql`lower(regexp_replace(${produits.referencePrincipale}, '[^a-z0-9]', '', 'g'))`, refN),
          eq(sql`lower(regexp_replace(${produits.referenceFabricant}, '[^a-z0-9]', '', 'g'))`, refN),
          eq(sql`lower(regexp_replace(${produits.refOem}, '[^a-z0-9]', '', 'g'))`, refN),
          eq(sql`lower(regexp_replace(${produits.codeArticle}, '[^a-z0-9]', '', 'g'))`, refN),
          eq(sql`lower(regexp_replace(${produits.codeBarre}, '[^a-z0-9]', '', 'g'))`, refN),
          sql`EXISTS (SELECT 1 FROM ${produitReferences} pr WHERE pr.variante_id = ${produits.id} AND lower(regexp_replace(pr.valeur, '[^a-z0-9]', '', 'g')) = ${refN})`,
          sql`EXISTS (SELECT 1 FROM ${produitReferencesEquiv} pr2 WHERE pr2.article_id = ${produits.articleId} AND lower(regexp_replace(pr2.reference, '[^a-z0-9]', '', 'g')) = ${refN})`,
        )
      ))
      .limit(10);
    for (const p of prodRows) {
      const chain = p.articleId ? await chainProduit(p.articleId) : null;
      push({
        kind: "PRODUIT",
        categorieId: chain?.categorieId ?? null,
        categorieNom: chain?.categorieNom ?? null,
        chainNoms: chain?.chainNoms ?? [],
        typeBranche: chain?.typeBranche,
        niveauOntologie: chain?.niveau ?? null,
        matchedBy: "Référence « " + (p.referencePrincipale ?? p.codeArticle ?? refN) + " »",
        explication: `Produit déjà présent dans le référentiel — à enrichir, ne pas recréer.`,
        score: 85,
        produitId: p.id,
        titreProduit: p.titre,
        marque: p.marque ?? null,
        referencePrincipale: p.referencePrincipale ?? null,
        articleId: p.articleId,
      });
    }
  }

  // (D) Marque + produit (ex : « Denso filtre huile ») → catégorie via produit correspondant
  if (results.length === 0 || byCat.size === 0) {
    const prodText = await db.select({
      id: produits.id,
      titre: produits.titre,
      marque: produits.marque,
      referencePrincipale: produits.referencePrincipale,
      articleId: produits.articleId,
      niveau: produits.niveau,
    }).from(produits)
      .where(and(
        eq(produits.isActive, true),
        sql`EXISTS (SELECT 1 FROM ${categories} c WHERE c.id = ${produits.articleId} AND c.is_active = true)`
      ))
      .limit(400);
    // FILTRAGE EN JS — recherche texte multicritères tolérante (tokens)
    for (const p of prodText) {
      const hay = normalizeTexte((p.titre ?? "") + " " + (p.marque ?? ""));
      if (termTokens.every((t) => hay.includes(t))) {
        if (!p.articleId) continue;
        const chain = await chainProduit(p.articleId);
        if (!chain?.categorieId) continue;
        push({
          kind: "PRODUIT",
          categorieId: chain.categorieId,
          categorieNom: chain.categorieNom,
          chainNoms: chain.chainNoms,
          typeBranche: chain.typeBranche,
          niveauOntologie: chain.niveau,
          matchedBy: "Désignation commerciale",
          explication: `Existe : ${p.marque ?? ""} ${p.referencePrincipale ?? ""} — enrichir, ne pas recréer.`,
          score: 70,
          produitId: p.id,
          titreProduit: p.titre,
          marque: p.marque ?? null,
          referencePrincipale: p.referencePrincipale ?? null,
          articleId: p.articleId,
        });
      }
    }
  }

  // Assemblage final
  const merged = [...byCat.values(), ...results.filter((r) => r.categorieId == null)]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return merged;
}

/** Résout la catégorie d'un article (via produits → articleId → categorie). */
async function chainProduit(articleId: number) {
  const [article] = await db.select({ categorieId: produitArticles.categorieId })
    .from(produitArticles)
    .where(eq(produitArticles.id, articleId))
    .limit(1);
  if (!article?.categorieId) return { categorieId: null, categorieNom: null, chainNoms: [], typeBranche: null, niveau: null };
  const chain = await chaineAncetres(article.categorieId);
  return {
    categorieId: article.categorieId,
    categorieNom: chain[0]?.nom ?? null,
    chainNoms: chain.map((c) => c.nom).reverse(),
    typeBranche: chain.find((c) => c.typeBranche)?.typeBranche ?? null,
    niveau: chain[0]?.niveauOntologie ?? null,
  };
}

// ── 2. Fiche métier complète (Concept Article) ────────────────────────────────

export async function getArticleConcept(categorieId: number, portee?: string) {
  const chain = await chaineAncetres(categorieId);
  if (chain.length === 0) return null;
  const cata = chain[0];
  const branche = chain.find((c) => c.typeBranche)?.typeBranche ?? null;
  const bredCats = chain.map((c) => c.id);

  const [enTete] = await db.select().from(guideCategories)
    .where(and(
      eq(guideCategories.isActive, true),
      or(
        eq(guideCategories.categorieId, categorieId),
        sql`${guideCategories.categorieId} IS NULL AND ${guideCategories.typeProduit} IS NOT NULL`
      )
    ))
    .orderBy(asc(guideCategories.ordre))
    .limit(1);

  // Définitions (résolution catégorie > famille > branche)
  const scopes = [inArray(attributDefinitions.categorieId, bredCats)];
  if (branche) scopes.push(sql`${attributDefinitions.typeProduit} = ${branche}`);
  if (bredCats.length > 1) scopes.push(or(...bredCats.slice(1).map((id) => sql`${attributDefinitions.familleId} = ${id}`)));
  const conds: any[] = [eq(attributDefinitions.isActive, true), or(...scopes.filter(Boolean))];
  if (portee) conds.push(eq(attributDefinitions.portee, portee));
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

  // Nouveaux blocs v2
  const variantTypes = await db.select().from(guideVariantTypes)
    .where(and(eq(guideVariantTypes.categorieId, categorieId), eq(guideVariantTypes.isActive, true)))
    .orderBy(asc(guideVariantTypes.ordre));

  const vtIds = variantTypes.map((v) => v.id);
  const differentiators = vtIds.length
    ? await db.select().from(guideVariantDifferentiators)
        .where(inArray(guideVariantDifferentiators.variantTypeId, vtIds))
        .orderBy(asc(guideVariantDifferentiators.ordre))
    : [];

  const procedures = await db.select().from(guideProcedures)
    .where(and(eq(guideProcedures.categorieId, categorieId), eq(guideProcedures.isActive, true)))
    .orderBy(asc(guideProcedures.ordre));
  const procIds = procedures.map((p) => p.id);
  const procedureSteps = procIds.length
    ? await db.select().from(guideProcedureSteps)
        .where(inArray(guideProcedureSteps.procedureId, procIds))
        .orderBy(asc(guideProcedureSteps.ordre))
    : [];

  const fieldMappings = await db.select().from(guideFieldMappings)
    .where(eq(guideFieldMappings.categorieId, categorieId))
    .orderBy(asc(guideFieldMappings.ordre));

  const modelingRules = await db.select().from(guideModelingRules)
    .where(eq(guideModelingRules.categorieId, categorieId))
    .orderBy(asc(guideModelingRules.ordre));

  const relations = await db.select().from(guideRelations)
    .where(eq(guideRelations.categorieId, categorieId))
    .orderBy(asc(guideRelations.ordre));

  const [steps, rules, errors, examples] = await Promise.all([
    db.select().from(guideSteps).where(eq(guideSteps.categorieId, categorieId)).orderBy(asc(guideSteps.ordre)),
    db.select().from(guideRules).where(eq(guideRules.categorieId, categorieId)),
    db.select().from(guideCommonErrors).where(eq(guideCommonErrors.categorieId, categorieId)),
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
      .where(eq(guideExamples.categorieId, categorieId))
      .orderBy(asc(guideExamples.ordre)),
  ]);

  // Compatibilités : exemples réels pour cette catégorie (pour enseigner le « comment »)
  const compatibilites = await db.select({
    marque: compatibilitesProduits.marque,
    modele: compatibilitesProduits.modele,
    motorisation: compatibilitesProduits.motorisation,
  })
    .from(compatibilitesProduits)
    .innerJoin(produitArticles, eq(produitArticles.id, compatibilitesProduits.articleId))
    .where(eq(produitArticles.categorieId, categorieId))
    .limit(6);

  return {
    categorie: cata,
    chain: chain.map((c) => ({ id: c.id, nom: c.nom, niveauOntologie: c.niveauOntologie, typeBranche: c.typeBranche })),
    branche,
    guide: enTete ?? null,
    definitions,
    variantTypes: variantTypes.map((v) => ({
      id: v.id,
      nom: v.nom,
      description: v.description,
      diffPrincipale: v.diffPrincipale,
      estReference: v.estReference,
      ordre: v.ordre,
      differentiators: differentiators.filter((d) => d.variantTypeId === v.id),
    })),
    procedures: procedures.map((p) => ({
      id: p.id,
      scenario: p.scenario,
      titre: p.titre,
      contexte: p.contexte,
      ordre: p.ordre,
      steps: procedureSteps.filter((s) => s.procedureId === p.id),
    })),
    fieldMappings,
    modelingRules,
    relations,
    steps,
    rules,
    errors,
    examples,
    compatibilites: compatibilites.map((c) => ({
      marque: c.marque,
      modele: c.modele,
      motorisation: c.motorisation,
    })),
    niveauExemplaire: branche === "OUTIL" || branche === "EQUIPEMENT",
  };
}

// ── 3. « L'article existe déjà ? » ────────────────────────────────────────────

export interface ExistingProduct {
  produitId: number;
  titre: string;
  marque: string | null;
  referencePrincipale: string | null;
  referenceFabricant: string | null;
  refOem: string | null;
  codeArticle: string | null;
  codeBarre: string | null;
  niveau: string | null;
  articleId: number | null;
  designationArticle: string | null;
  source: string;
}

export async function checkExistingProduct(reference: string, limit = 8): Promise<ExistingProduct[]> {
  const refN = normalizeRef(reference);
  if (!refN) return [];
  const prodRows = await db.select({
    id: produits.id,
    titre: produits.titre,
    marque: produits.marque,
    referencePrincipale: produits.referencePrincipale,
    referenceFabricant: produits.referenceFabricant,
    refOem: produits.refOem,
    codeArticle: produits.codeArticle,
    codeBarre: produits.codeBarre,
    niveau: produits.niveau,
    articleId: produits.articleId,
    designationArticle: produitArticles.designation,
  })
    .from(produits)
    .leftJoin(produitArticles, eq(produitArticles.id, produits.articleId))
    .where(and(
      eq(produits.isActive, true),
      or(
        eq(sql`lower(regexp_replace(${produits.referencePrincipale}, '[^a-z0-9]', '', 'g'))`, refN),
        eq(sql`lower(regexp_replace(${produits.referenceFabricant}, '[^a-z0-9]', '', 'g'))`, refN),
        eq(sql`lower(regexp_replace(${produits.refOem}, '[^a-z0-9]', '', 'g'))`, refN),
        eq(sql`lower(regexp_replace(${produits.codeArticle}, '[^a-z0-9]', '', 'g'))`, refN),
        like(sql`lower(regexp_replace(${produits.referencePrincipale}, '[^a-z0-9]', '', 'g'))`, `%${refN}%`),
        sql`EXISTS (SELECT 1 FROM ${produitReferences} pr WHERE pr.variante_id = ${produits.id} AND lower(regexp_replace(pr.valeur, '[^a-z0-9]', '', 'g')) LIKE ${`%${refN}%`})`,
        sql`EXISTS (SELECT 1 FROM ${produitReferencesEquiv} pr2 WHERE pr2.article_id = ${produits.articleId} AND lower(regexp_replace(pr2.reference, '[^a-z0-9]', '', 'g')) LIKE ${`%${refN}%`})`,
      )
    ))
    .limit(limit);

  return prodRows.map((p) => ({
    produitId: p.id,
    titre: p.titre,
    marque: p.marque ?? null,
    referencePrincipale: p.referencePrincipale ?? null,
    referenceFabricant: p.referenceFabricant ?? null,
    refOem: p.refOem ?? null,
    codeArticle: p.codeArticle ?? null,
    codeBarre: p.codeBarre ?? null,
    niveau: p.niveau ?? null,
    articleId: p.articleId ?? null,
    designationArticle: p.designationArticle ?? null,
    source: "Référence exacte",
  }));
}