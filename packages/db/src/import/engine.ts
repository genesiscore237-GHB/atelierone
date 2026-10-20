import fs from "fs";
import { z } from "zod";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "../client";
import * as schema from "../schema";
import { slugifierCode } from "./primitives";
import * as schemas from "./schemas";
import type { LigneValidation, RapportValidation, ResultatImport, ImportContext } from "./types";

/* ============================================================
 * MOTEUR D'IMPORT STANDARD
 * Le système impose le format (schémas canoniques dans schemas.ts).
 * Étapes : charger → valider (dry-run) → importer (idempotent).
 * Les références entre entités se font par CODES STABLES, résolus
 * ici vers les IDs internes de la base.
 * ============================================================ */

export type EntiteCle =
  | "unites"
  | "categories"
  | "fournisseurs"
  | "produits"
  | "references_equiv"
  | "compatibilites"
  | "produits_unites"
  | "produits_fournisseurs"
  | "tarifs"
  | "prix_historique"
  | "stocks";

export const ORDRE_IMPORT: EntiteCle[] = [
  "unites",
  "categories",
  "fournisseurs",
  "produits",
  // La qualification catalogue vient APRÈS les produits (elle rattache des
  // lignes à des articles) et AVANT les stocks : une compatibilité retient
  // sa variante, un stock n'a pas besoin d'elle — aucun réordonnement permis.
  "references_equiv",
  "compatibilites",
  "produits_unites",
  "produits_fournisseurs",
  "tarifs",
  "prix_historique",
  "stocks",
];

const FICHIER_PAR_ENTITE: Record<EntiteCle, string> = {
  unites: "unites.jsonl",
  categories: "categories.jsonl",
  fournisseurs: "fournisseurs.jsonl",
  produits: "produits.jsonl",
  references_equiv: "references_equiv.jsonl",
  compatibilites: "compatibilites.jsonl",
  produits_unites: "produits_unites.jsonl",
  produits_fournisseurs: "produits_fournisseurs.jsonl",
  tarifs: "tarifs.jsonl",
  prix_historique: "prix_historique.jsonl",
  stocks: "stocks_initiaux.jsonl",
};

/* ---------- Chargement ---------- */

export function chargerFichier(chemin: string): unknown[] {
  const brut = fs.readFileSync(chemin, "utf-8");
  if (chemin.endsWith(".jsonl")) {
    return brut
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          throw new Error(`Ligne JSON invalide dans ${chemin} : ${l.slice(0, 120)}`);
        }
      });
  }
  const parse = JSON.parse(brut);
  if (Array.isArray(parse)) return parse;
  throw new Error(`Format non supporté : ${chemin} doit être un tableau JSON ou un fichier .jsonl`);
}

/* ---------- Validation (dry-run, sans écriture) ---------- */

export function validerEntite(cle: EntiteCle, rows: unknown[], fichier = ""): RapportValidation {
  const schemaEntite = schemaParEntite(cle);
  const lignes: LigneValidation[] = rows.map((r, i) => {
    const res = schemaEntite.safeParse(r);
    if (!res.success) {
      return {
        index: i,
        statut: "invalide",
        erreurs: res.error.issues.map((iss) => `${iss.path.join(".")} : ${iss.message}`),
        avertissements: [],
      };
    }
    return { index: i, statut: "valide", erreurs: [], avertissements: [] };
  });

  const valides = lignes.filter((l) => l.statut === "valide");

  // RG-009 / RG-010 : unicité des clés d'upsert dans le fichier
  const cles = valides.map((l, idx) => ({ l, idx, cle: cleUpsert(cle, rows[idx] as Record<string, unknown>) }));
  const vues = new Map<string, number[]>();
  for (const c of cles) {
    if (!c.cle) continue;
    const arr = vues.get(c.cle) ?? [];
    arr.push(c.idx);
    vues.set(c.cle, arr);
  }
  for (const [cle, idxs] of vues) {
    if (idxs.length > 1) {
      for (const idx of idxs) {
        lignes[idx].statut = "invalide";
        lignes[idx].erreurs.push(`Clé d'upsert dupliquée dans le fichier : "${cle}" (RG-009/RG-010)`);
      }
    }
  }

  const invalides = lignes.filter((l) => l.statut === "invalide").length;
  const existants = lignes.filter((l) => l.statut === "existant").length;
  return { entite: cle, fichier, total: rows.length, valides: lignes.length - invalides - existants, invalides, existants, lignes };
}

export function schemaParEntite(cle: EntiteCle): z.ZodType {
  const map: Record<EntiteCle, z.ZodType> = {
    unites: schemas.unitesSchema,
    categories: schemas.categoriesSchema,
    fournisseurs: schemas.fournisseursSchema,
    produits: schemas.produitsSchema,
    references_equiv: schemas.referencesEquivSchema,
    compatibilites: schemas.compatibilitesSchema,
    produits_unites: schemas.produitsUnitesSchema,
    produits_fournisseurs: schemas.produitsFournisseursSchema,
    tarifs: schemas.tarifsSchema,
    prix_historique: schemas.prixHistoriqueSchema,
    stocks: schemas.stocksSchema,
  };
  return map[cle];
}

/** Clé canonique : minuscules, sans ponctuation. */
function normaliserCle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleUpsert(cle: EntiteCle, row: Record<string, unknown>): string | null {
  switch (cle) {
    case "unites":
    case "categories":
    case "fournisseurs":
      return String(row.code ?? "");
    case "produits":
      return String(row.codeBarre ?? "");
    case "references_equiv": {
      // Attachement : designation d'article, sinon code-barres de variante.
      const attache = row.articleDesignation ? normaliserCle(String(row.articleDesignation)) : String(row.codeBarre ?? "");
      const ref = normaliserCle(String(row.reference ?? ""));
      return attache && ref ? `${attache}|${ref}` : null;
    }
    case "compatibilites": {
      const attache = row.codeBarre ? normaliserCle(String(row.codeBarre)) : row.articleDesignation ? normaliserCle(String(row.articleDesignation)) : "";
      const base = `${attache}|${String(row.typeCompat ?? "")}|${normaliserCle(String(row.marque ?? ""))}|${normaliserCle(String(row.modele ?? ""))}`;
      return attache && row.marque && row.modele ? base : null;
    }
    case "produits_unites":
      return row.codeBarre && row.uniteCode ? `${row.codeBarre}|${row.uniteCode}` : "";
    case "produits_fournisseurs":
      return row.codeBarre && row.fournisseurCode ? `${row.codeBarre}|${row.fournisseurCode}` : "";
    case "tarifs":
      return row.codeBarre && row.type ? `${row.codeBarre}|${row.type}` : "";
    case "stocks":
      return row.codeBarre && row.agenceCode ? `${row.codeBarre}|${row.agenceCode}` : String(row.codeBarre ?? "");
    case "prix_historique":
      return null; // append-only
  }
}

/* ---------- Import (exécution) ---------- */

interface Maps {
  categories: Map<string, number>;
  unites: Map<string, string>;
  fournisseurs: Map<string, number>;
  produits: Map<string, number>;
  agences: Map<string, number>;
  /** designation d'article normalisée → id (produit_articles), enrichi en cours d'import. */
  articles: Map<string, number>;
  /** projection dry-run : codeBarre → designationArticle de la variante projetée. */
  articleParCodeBarre: Map<string, string>;
  /** Ids négatifs pour la PROJECTION (dry-run seulement) : les maps s'enrichissent
   *  dans l'ordre d'import SANS écriture — les enfants résolvent comme au run réel. */
  nextFakeId: () => number;
}

export async function preparerMaps(): Promise<Maps> {
  const [cats, unis, four, prods, agences, arts] = await Promise.all([
    db.select({ code: schema.categories.code, id: schema.categories.id }).from(schema.categories),
    db.select({ code: schema.unitesMesure.code, id: schema.unitesMesure.id }).from(schema.unitesMesure),
    db.select({ code: schema.fournisseurs.code, id: schema.fournisseurs.id }).from(schema.fournisseurs),
    db.select({ codeBarre: schema.produits.codeBarre, id: schema.produits.id }).from(schema.produits),
    db.select({ code: schema.agences.code, id: schema.agences.id }).from(schema.agences),
    db.select({ designation: schema.produitArticles.designation, id: schema.produitArticles.id }).from(schema.produitArticles),
  ]);
  let faux = 0;
  return {
    categories: new Map(cats.map((c) => [c.code, c.id])),
    unites: new Map(unis.map((u) => [u.code, u.id])),
    fournisseurs: new Map(four.map((f) => [f.code, f.id])),
    produits: new Map(prods.map((p) => [p.codeBarre, p.id])),
    agences: new Map(agences.map((a) => [a.code, a.id])),
    articles: new Map(arts.map((a) => [a.designation.trim().toLowerCase(), a.id])),
    articleParCodeBarre: new Map(),
    nextFakeId: () => --faux,
  };
}

/**
 * Résout ou crée l'article par désignation (produit_articles). La désignation
 * est la clé du grouping formulaire : deux variantes du même produit
 * conceptuel la partagent. Compare en bas-de-casse — la recherche existe déjà,
 * la création est réelle ; sans autorisation (dry-run), on renvoie null.
 */
async function articleOuCreer(designation: string, typeProduit: string, maps: Maps, autoriserCreation: boolean): Promise<number | null> {
  const norm = designation.trim().toLowerCase();
  if (!norm) return null;
  const connu = maps.articles.get(norm);
  if (connu) return connu;
  const [existe] = await db
    .select({ id: schema.produitArticles.id })
    .from(schema.produitArticles)
    .where(sql`lower(${schema.produitArticles.designation}) = ${norm}`)
    .limit(1);
  if (existe) { maps.articles.set(norm, existe.id); return existe.id; }
  if (!autoriserCreation) return null;
  const [cre] = await db
    .insert(schema.produitArticles)
    .values({ designation, typeProduit, isActive: true })
    .onConflictDoNothing()
    .returning({ id: schema.produitArticles.id });
  const id = cre?.id ?? null;
  if (id) maps.articles.set(norm, id);
  return id;
}

/** Article d'une variante (via son code-barres), sans création. */
async function articleDeVariante(codeBarre: string, maps: Maps): Promise<number | null> {
  const produitId = maps.produits.get(codeBarre);
  if (!produitId) return null;
  const [r] = await db.select({ articleId: schema.produits.articleId }).from(schema.produits).where(eq(schema.produits.id, produitId)).limit(1);
  return r?.articleId ?? null;
}

/** Fabrique un mapper de batch : safeParse + retour de l'objet typé ou null. */
function mapValide<T>(cle: EntiteCle): (row: unknown) => T | null {
  const schemaEntite = schemaParEntite(cle);
  return (row) => {
    const res = schemaEntite.safeParse(row);
    return res.success ? (res.data as T) : null;
  };
}

const BATCH = 100;

export async function importerEntite(cle: EntiteCle, rows: unknown[], ctx: ImportContext, maps: Maps): Promise<ResultatImport> {
  const rapport = validerEntite(cle, rows, FICHIER_PAR_ENTITE[cle]);
  let creees = 0;
  let skippees = 0;
  const details: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).filter((_, j) => rapport.lignes[i + j]?.statut === "valide");
    if (batch.length === 0) continue;
    switch (cle) {
      case "unites": ({ creees, skippees } = await upsertUnites(batch, ctx, maps, creees, skippees, details)); break;
      case "categories": ({ creees, skippees } = await upsertCategories(batch, ctx, maps, creees, skippees, details)); break;
      case "fournisseurs": ({ creees, skippees } = await upsertFournisseurs(batch, ctx, maps, creees, skippees, details)); break;
      case "produits": ({ creees, skippees } = await upsertProduits(batch, ctx, maps, creees, skippees, details)); break;
      case "references_equiv": ({ creees, skippees } = await upsertReferencesEquiv(batch, ctx, maps, creees, skippees, details)); break;
      case "compatibilites": ({ creees, skippees } = await upsertCompatibilites(batch, ctx, maps, creees, skippees, details)); break;
      case "produits_unites": ({ creees, skippees } = await upsertProduitsUnites(batch, ctx, maps, creees, skippees, details)); break;
      case "produits_fournisseurs": ({ creees, skippees } = await upsertProduitsFournisseurs(batch, ctx, maps, creees, skippees, details)); break;
      case "tarifs": ({ creees, skippees } = await upsertTarifs(batch, ctx, maps, creees, skippees, details)); break;
      case "prix_historique": ({ creees, skippees } = await insererPrixHistorique(batch, ctx, maps, creees, skippees, details)); break;
      case "stocks": ({ creees, skippees } = await upsertStocks(batch, ctx, maps, creees, skippees, details)); break;
    }
  }

  if (!ctx.dryRun && creees > 0) {
    const idRef = details[0] ?? "";
    await db.insert(schema.auditLogs).values({
      action: `IMPORT_${cle.toUpperCase()}`,
      entityType: "IMPORT",
      details: JSON.stringify({ total: rows.length, creees, skippees, source: "import" }),
      userId: ctx.userId ?? null,
    }).onConflictDoNothing();
  }

  return {
    entite: cle,
    total: rows.length,
    creees,
    skippees,
    enErreur: rapport.invalides,
    dryRun: ctx.dryRun,
    details,
  };
}

/* ---------- Importeurs par entité ---------- */

/** Stock initial : stock d'ouverture par produit + mouvement d'entrée initiale (audit). */
async function upsertStocks(batch: unknown[], ctx: ImportContext, maps: Maps, creees: number, skippees: number, details: string[]) {
  const lignes = batch.map(mapValide<schemas.StockImport>("stocks")).filter((l): l is schemas.StockImport => l !== null);
  const prets: { ligne: schemas.StockImport; produitId: number; agenceId: number }[] = [];
  for (const ligne of lignes) {
    const produitId = maps.produits.get(ligne.codeBarre);
    if (!produitId) { skippees++; details.push(`stock ${ligne.codeBarre} : REFUSÉ (produit inconnu)`); continue; }
    const agenceId = ligne.agenceCode ? maps.agences.get(ligne.agenceCode) ?? null : null;
    if (!agenceId) { skippees++; details.push(`stock ${ligne.codeBarre} : REFUSÉ (agence ${ligne.agenceCode ?? "?"} inconnue)`); continue; }
    prets.push({ ligne, produitId, agenceId });
  }
  if (prets.length === 0) return { creees, skippees };
  if (ctx.dryRun) {
    for (const p of prets) { creees++; details.push(`stock ${p.ligne.codeBarre}|${p.ligne.agenceCode} : à créer`); }
    return { creees, skippees };
  }

  // Existence groupée
  const existants = await db.select({ id: schema.stocks.id, produitId: schema.stocks.produitId, agenceId: schema.stocks.agenceId, quantite: schema.stocks.quantite })
    .from(schema.stocks)
    .where(and(
      inArray(schema.stocks.produitId, [...new Set(prets.map((p) => p.produitId))]),
      sql`${schema.stocks.emplacementId} IS NULL`,
      sql`${schema.stocks.lotId} IS NULL`,
    ));
  const parCle = new Map(existants.map((s) => [`${s.produitId}|${s.agenceId}`, s]));

  const aInserer: { produitId: number; agenceId: number; quantite: string; coutUnitaireMoyen: string | null }[] = [];
  const aMettreAJour: { id: number; quantite: number; coutUnitaireMoyen: string | null }[] = [];
  for (const p of prets) {
    const cle = `${p.produitId}|${p.agenceId}`;
    const ex = parCle.get(cle);
    const qte = Number(p.ligne.quantite);
    const cout = p.ligne.coutUnitaireMoyen ?? null;
    if (ex && Number(ex.quantite) === qte) { skippees++; details.push(`stock ${p.ligne.codeBarre}|${p.ligne.agenceCode} : déjà à ${qte}`); continue; }
    if (ex) aMettreAJour.push({ id: ex.id, quantite: qte, coutUnitaireMoyen: cout });
    else aInserer.push({ produitId: p.produitId, agenceId: p.agenceId, quantite: String(qte), coutUnitaireMoyen: cout });
    creees++;
    details.push(`stock ${p.ligne.codeBarre}|${p.ligne.agenceCode} : ${ex ? "mis à jour" : "créé"} → ${qte}`);
  }
  if (aInserer.length > 0) {
    await db.insert(schema.stocks).values(aInserer);
  }
  for (const up of aMettreAJour) {
    await db.update(schema.stocks).set({ quantite: String(up.quantite), coutUnitaireMoyen: up.coutUnitaireMoyen, updatedAt: new Date() })
      .where(eq(schema.stocks.id, up.id));
  }
  // Mouvements d'entrée initiale en batch (traçabilité)
  const mouvements = prets
    .filter((p) => parCle.has(`${p.produitId}|${p.agenceId}`) ? Number(parCle.get(`${p.produitId}|${p.agenceId}`)!.quantite) !== Number(p.ligne.quantite) : true)
    .map((p) => {
      const ex = parCle.get(`${p.produitId}|${p.agenceId}`);
      return {
        produitId: p.produitId,
        agenceId: p.agenceId,
        type: "ENTREE_INITIALE",
        sens: "E", // convention du système : E = entrée, S = sortie (ck_mouvements_stock_sens)
        quantite: String(Number(p.ligne.quantite)),
        stockAvant: String(ex ? Number(ex.quantite) : 0),
        stockApres: String(Number(p.ligne.quantite)),
        reference: "IMPORT-INITIAL",
        referenceType: "IMPORT_CATALOGUE",
        motif: "Stock d'ouverture lors de l'installation",
        commentaire: p.ligne.refSource ?? null,
      };
    });
  if (mouvements.length > 0) {
    await db.insert(schema.mouvementsStock).values(mouvements);
  }
  return { creees, skippees };
}

async function upsertUnites(batch: unknown[], ctx: ImportContext, maps: Maps, creees: number, skippees: number, details: string[]) {
  const lignes = batch.map(mapValide<schemas.UniteImport>("unites")).filter((l): l is schemas.UniteImport => l !== null);
  for (const ligne of lignes) {
    if (maps.unites.has(ligne.code)) { skippees++; details.push(`unite ${ligne.code} : existant`); continue; }
    if (ctx.dryRun) { creees++; details.push(`unite ${ligne.code} : à créer`); maps.unites.set(ligne.code, ligne.code); continue; }
    const [ins] = await db.insert(schema.unitesMesure).values({
      code: ligne.code,
      libelle: ligne.libelle,
      symbole: ligne.symbole,
      type: ligne.type,
      isActive: ligne.isActive ?? true,
    }).onConflictDoNothing().returning({ id: schema.unitesMesure.id });
    if (ins) { maps.unites.set(ligne.code, ins.id); creees++; } else skippees++;
  }
  return { creees, skippees };
}

async function upsertCategories(batch: unknown[], ctx: ImportContext, maps: Maps, creees: number, skippees: number, details: string[]) {
  const lignes = batch.map(mapValide<schemas.CategorieImport>("categories")).filter((l): l is schemas.CategorieImport => l !== null);
  for (const ligne of lignes) {
    if (ctx.dryRun) { creees++; details.push(`categorie ${ligne.code} : à créer`); maps.categories.set(ligne.code, maps.nextFakeId()); continue; }
    const id = maps.categories.get(ligne.code);
    if (id) {
      await db.update(schema.categories).set({
        nom: ligne.nom,
        typeBranche: ligne.typeBranche ?? null,
        description: ligne.description,
        isActive: ligne.isActive ?? true,
        updatedAt: new Date(),
      }).where(eq(schema.categories.id, id));
      if (ligne.parentCode) {
        const parentId = maps.categories.get(ligne.parentCode);
        if (parentId && parentId !== id) await db.update(schema.categories).set({ parentId }).where(eq(schema.categories.id, id));
      }
      skippees++; details.push(`categorie ${ligne.code} : mis à jour`);
      continue;
    }
    const [ins] = await db.insert(schema.categories).values({
      nom: ligne.nom,
      code: ligne.code,
      typeBranche: ligne.typeBranche ?? null,
      description: ligne.description,
      isActive: ligne.isActive ?? true,
    }).onConflictDoNothing().returning({ id: schema.categories.id });
    if (ins) { maps.categories.set(ligne.code, ins.id); creees++; }
    else skippees++;
  }
  // Rattachement parent (après création de toutes les catégories du batch)
  for (const ligne of lignes) {
    const id = maps.categories.get(ligne.code);
    if (id && ligne.parentCode) {
      const parentId = maps.categories.get(ligne.parentCode);
      if (parentId && parentId !== id) {
        await db.update(schema.categories).set({ parentId }).where(and(eq(schema.categories.id, id), sql`${schema.categories.parentId} IS NULL`));
      }
    }
  }
  return { creees, skippees };
}

async function upsertFournisseurs(batch: unknown[], ctx: ImportContext, maps: Maps, creees: number, skippees: number, details: string[]) {
  const lignes = batch.map(mapValide<schemas.FournisseurImport>("fournisseurs")).filter((l): l is schemas.FournisseurImport => l !== null);
  for (const ligne of lignes) {
    const agenceId = ligne.agenceCode ? maps.agences.get(ligne.agenceCode) ?? null : null;
    if (ctx.dryRun) { creees++; details.push(`fournisseur ${ligne.code} : à créer`); maps.fournisseurs.set(ligne.code, maps.nextFakeId()); continue; }
    if (maps.fournisseurs.has(ligne.code)) {
      const id = maps.fournisseurs.get(ligne.code)!;
      await db.update(schema.fournisseurs).set({
        nom: ligne.nom, contact: ligne.contact, telephone: ligne.telephone, email: ligne.email,
        adresse: ligne.adresse, ville: ligne.ville, pays: ligne.pays ?? "Bénin",
        agenceId, isActive: ligne.isActive ?? true, updatedAt: new Date(),
      }).where(eq(schema.fournisseurs.id, id));
      skippees++; details.push(`fournisseur ${ligne.code} : existant`);
      continue;
    }
    const [ins] = await db.insert(schema.fournisseurs).values({
      nom: ligne.nom, code: ligne.code, contact: ligne.contact, telephone: ligne.telephone,
      email: ligne.email, adresse: ligne.adresse, ville: ligne.ville, pays: ligne.pays ?? "Bénin",
      agenceId, isActive: ligne.isActive ?? true,
    }).onConflictDoNothing().returning({ id: schema.fournisseurs.id });
    if (ins) { maps.fournisseurs.set(ligne.code, ins.id); creees++; }
    else skippees++;
  }
  return { creees, skippees };
}

async function upsertProduits(batch: unknown[], ctx: ImportContext, maps: Maps, creees: number, skippees: number, details: string[]) {
  const lignes = batch.map(mapValide<schemas.ProduitImport>("produits")).filter((l): l is schemas.ProduitImport => l !== null);

  // Préparation : résolution des références + valeurs DB (échec → REFUSÉ).
  const prets: { ligne: schemas.ProduitImport; valeurs: Record<string, unknown> }[] = [];
  for (const ligne of lignes) {
    const categorieId = maps.categories.get(ligne.categorieCode);
    if (!categorieId) { skippees++; details.push(`produit ${ligne.codeBarre} : REFUSÉ (categorie ${ligne.categorieCode} inconnue)`); continue; }
    const fournisseurId = ligne.fournisseurCode ? maps.fournisseurs.get(ligne.fournisseurCode) ?? null : null;
    const uniteBaseId = maps.unites.get(ligne.uniteBaseCode);
    if (!uniteBaseId) { skippees++; details.push(`produit ${ligne.codeBarre} : REFUSÉ (unite ${ligne.uniteBaseCode} inconnue)`); continue; }
    // Article conceptuel : créé s'il n'existe pas — le grouping formulaire
    // regroupe les variantes du même produit (designation partagée).
    let articleId: number | null = null;
    if (ligne.designationArticle) {
      if (ctx.dryRun) {
        const norm = ligne.designationArticle.trim().toLowerCase();
        if (!maps.articles.has(norm)) details.push(`article ${ligne.designationArticle} : à créer`);
        articleId = maps.articles.get(norm) ?? null;
      } else {
        articleId = await articleOuCreer(ligne.designationArticle, ligne.typeProduit, maps, true);
        if (!articleId) { skippees++; details.push(`produit ${ligne.codeBarre} : REFUSÉ (article ${ligne.designationArticle} irrésolvable)`); continue; }
      }
    }
    prets.push({
      ligne,
      valeurs: {
        typeProduit: ligne.typeProduit,
        codeBarre: ligne.codeBarre,
        nomCode: ligne.nomCode,
        titre: ligne.titre,
        etat: ligne.etat ?? "neuf",
        description: ligne.description,
        categorieId,
        fournisseurId,
        uniteBaseId,
        // Réfs et positions de montage (migration 0023) ; articleId présent
        // seulement si résolu : un spread à null écraserait un attachement existant.
        ...(articleId != null ? { articleId } : {}),
        ...(ligne.refOem ? { refOem: ligne.refOem } : {}),
        ...(ligne.refAftermarket ? { refAftermarket: ligne.refAftermarket } : {}),
        ...(ligne.positionCote ? { positionCote: ligne.positionCote } : {}),
        ...(ligne.positionEssieu ? { positionEssieu: ligne.positionEssieu } : {}),
        prixVente: ligne.prixVente,
        prixMinimumVente: ligne.prixMinimumVente,
        prixAchat: ligne.prixAchat,
        prixAchatReference: ligne.prixAchatReference,
        tva: ligne.tva ?? "18",
        seuilAlerte: ligne.seuilAlerte ?? 5,
        seuilCritique: ligne.seuilCritique ?? 2,
        stockMaximum: ligne.stockMaximum,
        statut: ligne.statut,
        statutCycleVie: ligne.statutCycleVie,
        uniteVente: ligne.uniteVente ?? "unite",
        uniteAchat: ligne.uniteAchat ?? "unite",
        marque: ligne.marque,
        referenceFabricant: ligne.referenceFabricant,
        couleur: ligne.couleur,
        format: ligne.format,
        matiereComposition: ligne.matiereComposition,
        photos: ligne.photos ?? [],
        imageUrl: ligne.imageUrl,
        isActive: ligne.isActive ?? true,
      },
    });
  }
  if (prets.length === 0) return { creees, skippees };

  if (ctx.dryRun) {
    for (const p of prets) {
      // Projection profonde : la variante et son article existent pour les
      // entités qui suivent (réfs/compat via codeBarre), sans rien écrire.
      maps.articleParCodeBarre.set(p.ligne.codeBarre, p.ligne.designationArticle ?? "");
      if (!maps.produits.has(p.ligne.codeBarre)) {
        maps.produits.set(p.ligne.codeBarre, maps.nextFakeId());
        creees++; details.push(`produit ${p.ligne.codeBarre} : à créer`);
      } else { skippees++; details.push(`produit ${p.ligne.codeBarre} : existant`); }
    }
    return { creees, skippees };
  }

  // Les produits connus sont pris sur la map (populée AVANT cette passe) :
  // nouveaux → insert, existants → mise à jour champ par champ.
  const connus = maps.produits;
  const nouveaux: { ligne: schemas.ProduitImport; valeurs: Record<string, unknown> }[] = [];
  const existants: { ligne: schemas.ProduitImport; valeurs: Record<string, unknown> }[] = [];
  for (const p of prets) (connus.has(p.ligne.codeBarre) ? existants : nouveaux).push(p);

  if (nouveaux.length > 0) {
    // Un seul INSERT batch pour tous les nouveaux. Les collisions éventuelles
    // (import concurrent) sont ignorées sans lever d'erreur.
    const ins = await db.insert(schema.produits)
      .values(nouveaux.map((p) => p.valeurs) as any[])
      .onConflictDoNothing({ target: schema.produits.codeBarre })
      .returning({ id: schema.produits.id, codeBarre: schema.produits.codeBarre });
    for (const r of ins) { maps.produits.set(r.codeBarre, r.id); creees++; details.push(`produit ${r.codeBarre} : créé`); }
  }

  // Colonnes de mise à jour : tout sauf l'attachement (article/réfs/position),
  // qui se rattache en one-way APRÈS — jamais dé-taché, jamais écrasé.
  const ATTACHE_SEULE = new Set(["articleId", "refOem", "refAftermarket", "positionCote", "positionEssieu"]);
  for (const p of existants) {
    const id = connus.get(p.ligne.codeBarre)!;
    const patch: Record<string, unknown> = {};
    for (const [col, val] of Object.entries(p.valeurs)) {
      if (ATTACHE_SEULE.has(col)) continue;
      if (val == null) continue; // champ absent : on ne détruit pas
      patch[col] = val;
    }
    await db.update(schema.produits).set(patch as any).where(eq(schema.produits.id, id));
    skippees++; details.push(`produit ${p.ligne.codeBarre} : mis à jour`);
  }

  // Attachement one-way sur les produits EXISTANTS (les nouveaux ont reçu
  // l'article/réfs à l'insert) : l'attachement ne comble que du vide.
  const rattacher = async (colonne: string, getter: (v: Record<string, unknown>) => unknown) => {
    const parValeur = new Map<string, string[]>();
    for (const p of existants) {
      const val = getter(p.valeurs);
      if (val == null) continue;
      const cle = String(val);
      const arr = parValeur.get(cle) ?? [];
      arr.push(p.ligne.codeBarre);
      parValeur.set(cle, arr);
    }
    for (const [cle, codes] of parValeur) {
      await db.update(schema.produits).set(
        colonne === "articleId" ? { articleId: Number(cle) } : { [colonne]: cle } as any,
      ).where(and(inArray(schema.produits.codeBarre, codes), sql`${sql.raw(`"${colonne.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}"`)} IS NULL`));
    }
  };
  await rattacher("articleId", (v) => v.articleId);
  await rattacher("refOem", (v) => v.refOem);
  await rattacher("refAftermarket", (v) => v.refAftermarket);
  await rattacher("positionCote", (v) => v.positionCote);
  await rattacher("positionEssieu", (v) => v.positionEssieu);
  return { creees, skippees };
}

async function upsertProduitsUnites(batch: unknown[], ctx: ImportContext, maps: Maps, creees: number, skippees: number, details: string[]) {
  const lignes = batch.map(mapValide<schemas.ProduitUniteImport>("produits_unites")).filter((l): l is schemas.ProduitUniteImport => l !== null);
  const prets: { ligne: schemas.ProduitUniteImport; valeurs: Record<string, unknown> }[] = [];
  for (const ligne of lignes) {
    const produitId = maps.produits.get(ligne.codeBarre);
    const uniteId = maps.unites.get(ligne.uniteCode);
    if (!produitId || !uniteId) { skippees++; details.push(`produit_unite ${ligne.codeBarre}|${ligne.uniteCode} : REFUSÉ (produit ou unité inconnue)`); continue; }
    prets.push({
      ligne,
      valeurs: {
        produitId, uniteId,
        facteurVersBase: ligne.facteurVersBase,
        prixAchat: ligne.prixAchat,
        prixVente: ligne.prixVente,
        estUniteBase: ligne.estUniteBase ?? false,
        estUniteAchatDefaut: ligne.estUniteAchatDefaut ?? false,
        estUniteVenteDefaut: ligne.estUniteVenteDefaut ?? false,
        statut: "CREE",
      },
    });
  }
  if (prets.length === 0) return { creees, skippees };
  if (ctx.dryRun) {
    for (const p of prets) { creees++; details.push(`produit_unite ${p.ligne.codeBarre}|${p.ligne.uniteCode} : à créer`); }
    return { creees, skippees };
  }
  const ins = await db.insert(schema.produitUnites)
    .values(prets.map((p) => p.valeurs))
    .onConflictDoUpdate({
      target: [schema.produitUnites.produitId, schema.produitUnites.uniteId],
      set: {
        facteurVersBase: sql`excluded.facteur_vers_base`,
        prixAchat: sql`excluded.prix_achat`,
        prixVente: sql`excluded.prix_vente`,
        estUniteBase: sql`excluded.est_unite_base`,
        estUniteAchatDefaut: sql`excluded.est_unite_achat_defaut`,
        estUniteVenteDefaut: sql`excluded.est_unite_vente_defaut`,
      },
    })
    .returning({ id: schema.produitUnites.id });
  for (const r of ins) { creees++; details.push(`produit_unite ${r.id} : créé/mis à jour`); }
  return { creees, skippees };
}

async function upsertProduitsFournisseurs(batch: unknown[], ctx: ImportContext, maps: Maps, creees: number, skippees: number, details: string[]) {
  const lignes = batch.map(mapValide<schemas.ProduitFournisseurImport>("produits_fournisseurs")).filter((l): l is schemas.ProduitFournisseurImport => l !== null);
  const prets: { ligne: schemas.ProduitFournisseurImport; produitId: number; fournisseurId: number }[] = [];
  for (const ligne of lignes) {
    const produitId = maps.produits.get(ligne.codeBarre);
    const fournisseurId = maps.fournisseurs.get(ligne.fournisseurCode);
    if (!produitId || !fournisseurId) { skippees++; details.push(`produit_fournisseur ${ligne.codeBarre}|${ligne.fournisseurCode} : REFUSÉ (référence inconnue)`); continue; }
    prets.push({ ligne, produitId, fournisseurId });
  }
  if (prets.length === 0) return { creees, skippees };
  if (ctx.dryRun) {
    for (const p of prets) { creees++; details.push(`produit_fournisseur ${p.ligne.codeBarre}|${p.ligne.fournisseurCode} : à créer`); }
    return { creees, skippees };
  }

  // Existence en une requête groupée
  const existants = await db.select({
    produitId: schema.produitsFournisseurs.produitId,
    fournisseurId: schema.produitsFournisseurs.fournisseurId,
  }).from(schema.produitsFournisseurs)
    .where(inArray(schema.produitsFournisseurs.produitId, [...new Set(prets.map((p) => p.produitId))]));
  const existKeys = new Set(existants.map((e) => `${e.produitId}|${e.fournisseurId}`));

  const aInserer = prets.filter((p) => !existKeys.has(`${p.produitId}|${p.fournisseurId}`));
  if (aInserer.length > 0) {
    await db.insert(schema.produitsFournisseurs).values(aInserer.map((p) => ({
      produitId: p.produitId,
      fournisseurId: p.fournisseurId,
      referenceFournisseur: p.ligne.referenceFournisseur,
      prixAchat: p.ligne.prixAchat,
      delaiApprovisionnement: p.ligne.delaiApprovisionnement,
      estPrincipal: p.ligne.estPrincipal ?? false,
      isActive: p.ligne.isActive ?? true,
    })));
    creees += aInserer.length;
  }
  for (const p of prets) {
    if (existKeys.has(`${p.produitId}|${p.fournisseurId}`)) {
      skippees++; details.push(`produit_fournisseur ${p.ligne.codeBarre}|${p.ligne.fournisseurCode} : existant`);
    } else {
      details.push(`produit_fournisseur ${p.ligne.codeBarre}|${p.ligne.fournisseurCode} : créé`);
    }
  }
  return { creees, skippees };
}

async function upsertReferencesEquiv(batch: unknown[], ctx: ImportContext, maps: Maps, creees: number, skippees: number, details: string[]) {
  const lignes = batch.map(mapValide<schemas.ReferenceEquivImport>("references_equiv")).filter((l): l is schemas.ReferenceEquivImport => l !== null);
  for (const ligne of lignes) {
    // Attachement : désignation d'article (créée si absente) — sauf en
    // dry-run, qui ne crée pas mais projette (-1 = article à créer) — ou
    // l'article de la variante désignée par code-barres.
    let articleId: number | null = null;
    if (ligne.articleDesignation) {
      articleId = await articleOuCreer(ligne.articleDesignation, "PIECE", maps, !ctx.dryRun);
      if (!articleId && ctx.dryRun) {
        details.push(`article ${ligne.articleDesignation} : à créer (attachement référence ${ligne.reference})`);
        articleId = -1;
      }
    } else if (ligne.codeBarre) {
      if (ctx.dryRun) {
        // Attachement projeté : la variante peut n'exister qu'en projection
        // (importée dans le même run) — sa désignation est la clé.
        const designationProjetee = maps.articleParCodeBarre.get(ligne.codeBarre) ?? "";
        if (designationProjetee) {
          articleId = await articleOuCreer(designationProjetee, "PIECE", maps, false);
          if (!articleId) {
            details.push(`article ${designationProjetee} : à créer (attachement référence ${ligne.reference})`);
            articleId = -1;
          }
        } else {
          articleId = maps.produits.has(ligne.codeBarre) ? await articleDeVariante(ligne.codeBarre, maps) : null;
          if (!articleId) { skippees++; details.push(`reference_equiv ${ligne.reference} : REFUSÉ (variante ${ligne.codeBarre} sans article)`); continue; }
        }
      } else {
        articleId = await articleDeVariante(ligne.codeBarre, maps);
        if (!articleId) { skippees++; details.push(`reference_equiv ${ligne.reference} : REFUSÉ (variante ${ligne.codeBarre} sans article)`); continue; }
      }
    }
    if (!articleId) { skippees++; details.push(`reference_equiv ${ligne.reference} : REFUSÉ (attachement impossible — ni designation, ni codeBarre)`); continue; }
    if (ctx.dryRun) { creees++; details.push(`reference_equiv ${ligne.marque ? `${ligne.marque} ` : ""}${ligne.reference} : à créer`); continue; }

    const [ex] = await db
      .select({ id: schema.produitReferencesEquiv.id })
      .from(schema.produitReferencesEquiv)
      .where(and(eq(schema.produitReferencesEquiv.articleId, articleId), eq(schema.produitReferencesEquiv.reference, ligne.reference)))
      .limit(1);
    if (ex) {
      // Ré-import = seuls les champs RENSEIGNÉS sont mis à jour. Un re-catalogue
      // qui ne mentionne plus la source d'une ligne ne doit pas dégrader une
      // référence déjà CONFIRMÉE à la main ; patch vide → no-op.
      const patch = {
        ...(ligne.marque ? { marque: ligne.marque } : {}),
        ...(ligne.note ? { note: ligne.note } : {}),
        ...(ligne.source ? { source: ligne.source } : {}),
        ...(ligne.niveauVerification ? { niveauVerification: ligne.niveauVerification } : {}),
      };
      if (Object.keys(patch).length > 0) {
        await db.update(schema.produitReferencesEquiv).set(patch).where(eq(schema.produitReferencesEquiv.id, ex.id));
      }
      skippees++; details.push(`reference_equiv ${ligne.reference} : mis à jour`);
      continue;
    }
    await db.insert(schema.produitReferencesEquiv).values({
      articleId,
      marque: ligne.marque ?? null,
      reference: ligne.reference,
      note: ligne.note ?? null,
      source: ligne.source ?? "CATALOGUE",
      niveauVerification: ligne.niveauVerification ?? "NON_VERIFIE",
    }).onConflictDoNothing();
    creees++;
  }
  return { creees, skippees };
}

async function upsertCompatibilites(batch: unknown[], ctx: ImportContext, maps: Maps, creees: number, skippees: number, details: string[]) {
  const lignes = batch.map(mapValide<schemas.CompatibiliteImport>("compatibilites")).filter((l): l is schemas.CompatibiliteImport => l !== null);
  for (const ligne of lignes) {
    // Portée variante si code-barres connu, sinon article (désignation).
    let produitId: number | null = null;
    let articleId: number | null = null;
    if (ligne.codeBarre) {
      produitId = maps.produits.get(ligne.codeBarre) ?? null;
      if (!produitId) { skippees++; details.push(`compatibilite ${ligne.marque} ${ligne.modele} : REFUSÉ (produit ${ligne.codeBarre} inconnu)`); continue; }
    } else if (ligne.articleDesignation) {
      articleId = await articleOuCreer(ligne.articleDesignation, "PIECE", maps, !ctx.dryRun);
      if (!articleId && ctx.dryRun) {
        details.push(`article ${ligne.articleDesignation} : à créer (attachement compatibilité ${ligne.marque} ${ligne.modele})`);
        articleId = -1;
      }
      if (!articleId) { skippees++; details.push(`compatibilite ${ligne.marque} ${ligne.modele} : REFUSÉ (article ${ligne.articleDesignation} introuvable)`); continue; }
    }
    if (ctx.dryRun) { creees++; details.push(`compatibilite ${ligne.typeCompat} ${ligne.marque} ${ligne.modele} : à créer`); continue; }

    // Dédoublement applicatif (la contrainte UNIQUE a été retirée pour
    // autoriser POSITIVE + NEGATIVE sur le même véhicule) : la même ligne
    // (portée, type, marque, modèle) n'est pas réinsérée — mais SA
    // qualification (source/niveau) est mise à jour.
    const existants = await db
      .select({ id: schema.compatibilitesProduits.id })
      .from(schema.compatibilitesProduits)
      .where(and(
        produitId != null ? eq(schema.compatibilitesProduits.produitId, produitId) : sql`${schema.compatibilitesProduits.produitId} IS NULL`,
        articleId != null ? eq(schema.compatibilitesProduits.articleId, articleId) : sql`${schema.compatibilitesProduits.articleId} IS NULL`,
        eq(schema.compatibilitesProduits.typeCompat, ligne.typeCompat),
        sql`lower(${schema.compatibilitesProduits.marque}) = ${ligne.marque.toLowerCase()}`,
        sql`lower(${schema.compatibilitesProduits.modele}) = ${ligne.modele.toLowerCase()}`,
      )).limit(1);
    if (existants.length > 0) {
      // Ré-import : la même ligne existe déjà — SEULE la qualification et les
      // restrictions documentées sont rafraîchies, champ par champ. Rien
      // d'absent n'efface ce qu'un magasinier a précisé ; une ligne sans
      // aucune précision ne produit pas de mise à jour (patch vide = no-op).
      const patch = {
        ...(ligne.source ? { source: ligne.source } : {}),
        ...(ligne.niveauVerification ? { niveauVerification: ligne.niveauVerification } : {}),
        ...(ligne.anneeDe != null ? { anneeDe: ligne.anneeDe } : {}),
        ...(ligne.anneeA != null ? { anneeA: ligne.anneeA } : {}),
        ...(ligne.motorisation ? { motorisation: ligne.motorisation } : {}),
        ...(ligne.version ? { version: ligne.version } : {}),
        ...(ligne.codeMoteur ? { codeMoteur: ligne.codeMoteur } : {}),
        ...(ligne.codeChassis ? { codeChassis: ligne.codeChassis } : {}),
        ...(ligne.position ? { position: ligne.position } : {}),
        ...(ligne.notes ? { notes: ligne.notes } : {}),
      };
      if (Object.keys(patch).length > 0) {
        await db.update(schema.compatibilitesProduits).set(patch).where(eq(schema.compatibilitesProduits.id, existants[0].id));
      }
      skippees++; details.push(`compatibilite ${ligne.typeCompat} ${ligne.marque} ${ligne.modele} : mis à jour`);
      continue;
    }
    await db.insert(schema.compatibilitesProduits).values({
      articleId,
      produitId,
      typeCompat: ligne.typeCompat,
      marque: ligne.marque,
      modele: ligne.modele,
      anneeDe: ligne.anneeDe ?? null,
      anneeA: ligne.anneeA ?? null,
      motorisation: ligne.motorisation ?? null,
      version: ligne.version ?? null,
      generation: ligne.generation ?? null,
      carburant: ligne.carburant ?? null,
      codeMoteur: ligne.codeMoteur ?? null,
      boite: ligne.boite ?? null,
      transmission: ligne.transmission ?? null,
      carrosserie: ligne.carrosserie ?? null,
      codeChassis: ligne.codeChassis ?? null,
      position: ligne.position ?? null,
      notes: ligne.notes ?? null,
      source: ligne.source ?? "CATALOGUE",
      niveauVerification: ligne.niveauVerification ?? "NON_VERIFIE",
      creePar: ctx.userId ?? null,
    });
    creees++;
  }
  return { creees, skippees };
}

async function upsertTarifs(batch: unknown[], ctx: ImportContext, maps: Maps, creees: number, skippees: number, details: string[]) {
  const lignes = batch.map(mapValide<schemas.TarifImport>("tarifs")).filter((l): l is schemas.TarifImport => l !== null);
  for (const ligne of lignes) {
    const produitId = maps.produits.get(ligne.codeBarre);
    if (!produitId) { skippees++; details.push(`tarif ${ligne.codeBarre}|${ligne.type} : REFUSÉ (produit inconnu)`); continue; }
    if (ctx.dryRun) { creees++; details.push(`tarif ${ligne.codeBarre}|${ligne.type} : à créer`); continue; }
    const existant = await db.select({ id: schema.tarifs.id }).from(schema.tarifs)
      .where(and(eq(schema.tarifs.produitId, produitId), eq(schema.tarifs.type, ligne.type))).limit(1);
    if (existant.length > 0) {
      await db.update(schema.tarifs).set({
        prix: ligne.prix, label: ligne.label, quantiteMin: ligne.quantiteMin ?? 1,
        isActive: ligne.isActive ?? true, updatedAt: new Date(),
      }).where(eq(schema.tarifs.id, existant[0].id));
      skippees++;
      continue;
    }
    await db.insert(schema.tarifs).values({
      produitId, type: ligne.type, prix: ligne.prix, label: ligne.label,
      quantiteMin: ligne.quantiteMin ?? 1, isActive: ligne.isActive ?? true,
    });
    creees++;
  }
  return { creees, skippees };
}

async function insererPrixHistorique(batch: unknown[], ctx: ImportContext, maps: Maps, creees: number, skippees: number, details: string[]) {  const lignes = batch.map(mapValide<schemas.PrixHistoriqueImport>("prix_historique")).filter((l): l is schemas.PrixHistoriqueImport => l !== null);
  for (const ligne of lignes) {
    const produitId = maps.produits.get(ligne.codeBarre);
    if (!produitId) { skippees++; details.push(`prix_historique ${ligne.codeBarre} : REFUSÉ (produit inconnu)`); continue; }
    if (ctx.dryRun) { creees++; details.push(`prix_historique ${ligne.codeBarre} : à créer`); continue; }
    await db.insert(schema.prixHistorique).values({
      produitId,
      fournisseurId: ligne.fournisseurCode ? maps.fournisseurs.get(ligne.fournisseurCode) ?? null : null,
      uniteId: ligne.uniteCode ? maps.unites.get(ligne.uniteCode) ?? null : null,
      typePrix: ligne.typePrix,
      ancienPrix: ligne.ancienPrix,
      nouveauPrix: ligne.nouveauPrix,
      source: ligne.source,
      reference: ligne.reference,
      referenceType: ligne.referenceType,
      motif: ligne.motif,
      createdAt: ligne.date ? new Date(ligne.date) : undefined,
    });
    creees++;
  }
  return { creees, skippees };
}

/* ---------- Orchestration multi-fichiers ---------- */

export interface ImportCatalogueOptions {
  dossier: string;
  dryRun: boolean;
  cles?: EntiteCle[];
}

export async function importerCatalogue(opts: ImportCatalogueOptions): Promise<{ resultats: ResultatImport[]; rapports: RapportValidation[] }> {
  const ctx: ImportContext = { dryRun: opts.dryRun, agenceId: null, userId: null, logs: [] };
  const maps = await preparerMaps();
  const resultats: ResultatImport[] = [];
  const rapports: RapportValidation[] = [];
  const cles = opts.cles ?? ORDRE_IMPORT;

  for (const cle of cles) {
    const fichier = `${opts.dossier.replace(/[\\/]+$/, "")}/${FICHIER_PAR_ENTITE[cle]}`;
    if (!fs.existsSync(fichier)) continue;
    const rows = chargerFichier(fichier);
    rapports.push(validerEntite(cle, rows, fichier));
    resultats.push(await importerEntite(cle, rows, ctx, maps));
  }

  return { resultats, rapports };
}

/** Génère un code stable déterministe pour les fournisseurs sans code. */
export function codeFournisseurAuto(nom: string, index: number): string {
  return slugifierCode(nom, String(index + 1).padStart(3, "0")).slice(0, 50);
}
