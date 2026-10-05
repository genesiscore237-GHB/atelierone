import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  produitArticles,
  produits,
  compatibilitesProduits,
  articleAttributs,
  varianteAttributs,
  articleDocuments,
  produitReferencesEquiv,
  produitReferences,
  produitSupersessions,
  produitSubstitutions,
  attributTemplates,
  categories,
  produitUnites,
  produitsFournisseurs,
  stocks,
  unitesMesure,
  emplacements,
  achats,
  achatsLignes,
  lots,
  stocksLots,
  auditLogs,
} from "@atelierone/db";
import { eq, and, desc, asc, sql, or, ilike, isNull, inArray, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { enregistrerMouvement, TYPES_MOUVEMENT } from "~/server/lib/stock-engine";
import { normalizeTypeAttribut, statutValeurSchema, provenanceSchema, niveauConfianceSchema, typeAttributsSchemaLegacy } from "@atelierone/validators";

/**
 * ARTICLES & VARIANTES — catalogue V3 (conception validée).
 * ARTICLE = produit conceptuel · VARIANTE/SKU = référence stockable ·
 * EXEMPLAIRE (niveau) = actif physique outillage/équipement.
 * GF1 : séparation métier stricte (validations backend impossibles à contourner).
 */

const POSITION_OPTIONS = ["GAUCHE", "DROITE", "CENTRAL", "LES_DEUX", "N_A"] as const;
const ESSIEU_OPTIONS = ["AVANT", "ARRIERE", "N_A"] as const;
const ZONE_OPTIONS = ["INTERIEUR", "EXTERIEUR", "SUPERIEUR", "INFERIEUR", "N_A"] as const;
const EMPLACEMENT_POS_OPTIONS = ["MOTEUR", "BOITE", "ROUE", "HABITACLE", "CARROSSERIE", "FREINAGE", "CLIM", "CHASSIS", "N_A"] as const;
const ETATS_PRODUIT = ["NEUF", "OCCASION", "RECONDITIONNE", "REMANUFACTURE"] as const;
const ORIGINES_PRODUIT = ["CONSTRUCTEUR", "OEM", "AFTERMARKET", "ADAPTABLE"] as const;
const RELATIONS_PRODUIT = ["EQUIVALENT", "SUBSTITUT", "ECHANGE_STANDARD"] as const;
const TYPES_REF = ["FABRICANT", "OEM", "CONSTRUCTEUR", "FOURNISSEUR", "EAN", "UPC", "GTIN", "ANCIENNE", "AUTRE"] as const;
const NIVEAUX_CONFIANCE = ["OFFICIEL", "HOMOLOGUE", "TECHNIQUE", "COMMERCIAL", "MANUELLE"] as const;

/**
 * Attribut EAV étendu (catalogue universel P0) :
 * - type sur les 13 valeurs (BOOLEAN accepté en entrée, normalisé en BOOLEEN),
 * - contraintes (obligatoire, searchable, filtrable, comparable, liste, precision, uniteId),
 * - INCONNU / N_A structurés (statutValeur) + provenance/confiance/source/preuve.
 */
const ATTRIBUT_INPUT = z.object({
  cle: z.string().min(1),
  valeur: z.string().optional(),
  unite: z.string().optional(),
  typeAttribut: typeAttributsSchemaLegacy.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  obligatoire: z.boolean().optional(),
  searchable: z.boolean().optional(),
  filtrable: z.boolean().optional(),
  comparable: z.boolean().optional(),
  liste: z.array(z.string()).optional(),
  precision: z.number().optional(),
  uniteId: z.string().uuid().optional(),
  aide: z.string().optional(),
  statutValeur: statutValeurSchema.optional(),
  provenance: provenanceSchema.optional(),
  source: z.string().max(160).optional(),
  niveauConfiance: niveauConfianceSchema.optional(),
  sourceDate: z.date().optional(),
  sourcePar: z.number().int().optional(),
  preuve: z.string().optional(),
});

/** Mappe un attribut d'entrée vers la ligne DB (ordinalité fournie par l'appelant). */
function mapAttribut(a: z.infer<typeof ATTRIBUT_INPUT>, ordre: number): Record<string, unknown> {
  return {
    cle: a.cle.trim(),
    valeur: a.valeur ?? null,
    unite: a.unite ?? null,
    typeAttribut: a.typeAttribut ? normalizeTypeAttribut(a.typeAttribut) : "TEXTE",
    min: a.min != null ? String(a.min) : null,
    max: a.max != null ? String(a.max) : null,
    ordre,
    obligatoire: a.obligatoire ?? false,
    searchable: a.searchable ?? false,
    filtrable: a.filtrable ?? false,
    comparable: a.comparable ?? false,
    liste: a.liste ?? [],
    precision: a.precision != null ? String(a.precision) : null,
    uniteId: a.uniteId ?? null,
    aide: a.aide ?? null,
    statutValeur: a.statutValeur ?? "RENSEIGNE",
    provenance: a.provenance ?? null,
    source: a.source ?? null,
    niveauConfiance: a.niveauConfiance ?? null,
    sourceDate: a.sourceDate ?? null,
    sourcePar: a.sourcePar ?? null,
    preuve: a.preuve ?? null,
  };
}

/** Normalise une référence pour la recherche (minuscules, sans espaces ni ponctuation). */
function normaliserRef(ref: string): string {
  return ref.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const VARIANTE_INPUT = z.object({
  marque: z.string().optional(),
  referenceFabricant: z.string().optional(),
  refOem: z.string().optional(),
  codeBarre: z.string().optional(),
  codeArticle: z.string().optional(),
  designationCourte: z.string().optional(),
  conditionnement: z.string().optional(),
  referencePrincipale: z.string().optional(),
  prixAchat: z.number().min(0).optional(),
  prixVente: z.number().min(0).optional(),
  prixPro: z.number().min(0).optional(),
  prixParticulier: z.number().min(0).optional(),
  tva: z.number().min(0).max(100).optional(),
  fournisseurId: z.number().int().optional(),
  uniteStockId: z.string().optional(),
  stockInitial: z.number().min(0).optional(),
  emplacementStockId: z.number().int().optional(),
  seuilAlerte: z.number().int().min(0).optional(),
  stockSecurite: z.number().int().min(0).optional(),
  pointCommande: z.number().int().min(0).optional(),
  qteMinCommande: z.number().min(0).optional(),
  etatProduit: z.enum(ETATS_PRODUIT).optional(),
  origineProduit: z.enum(ORIGINES_PRODUIT).optional(),
  relationProduit: z.enum(RELATIONS_PRODUIT).optional(),
  positionCote: z.enum(POSITION_OPTIONS).optional(),
  positionEssieu: z.enum(ESSIEU_OPTIONS).optional(),
  positionZone: z.enum(ZONE_OPTIONS).optional(),
  positionEmplacement: z.enum(EMPLACEMENT_POS_OPTIONS).optional(),
  suiviSerie: z.boolean().optional(),
  numeroSerie: z.string().optional(),
  suiviLot: z.boolean().optional(),
  numeroLot: z.string().optional(),
  dateFabrication: z.string().optional(),
  dateExpiration: z.string().optional(),
  garantieMois: z.number().int().min(0).optional(),
  estCore: z.boolean().optional(),
  valeurCore: z.number().min(0).optional(),
  typeOutil: z.string().optional(),
  etatEquipement: z.string().optional(),
  calibrable: z.boolean().optional(),
  numeroImmobilisation: z.string().optional(),
  dateAchat: z.string().optional(),
  valeurAcquisition: z.number().min(0).optional(),
  responsableId: z.number().int().optional(),
  // Bloc prix (Prix min / marge) + bloc comptable & analytique
  prixMinimumVente: z.number().min(0).optional(),
  compteComptable: z.string().optional(),
  centreDeCout: z.string().optional(),
  methodeValorisation: z.string().optional(),
  // Conversions d'unités (bloc 3) : unité de base + unités secondaires
  unites: z.array(z.object({
    uniteId: z.string().uuid(),
    facteurVersBase: z.number().optional(),
    prixAchat: z.number().optional(),
    prixVente: z.number().optional(),
    estUniteBase: z.boolean().optional(),
    estUniteAchatDefaut: z.boolean().optional(),
    estUniteVenteDefaut: z.boolean().optional(),
  })).optional(),
  // Fournisseurs secondaires (bloc 4)
  fournisseurs: z.array(z.object({
    fournisseurId: z.number().int(),
    referenceFournisseur: z.string().optional(),
    prixAchat: z.number().optional(),
    delaiApprovisionnement: z.number().int().optional(),
    estPrincipal: z.boolean().optional(),
    uniteConditionnement: z.string().uuid().optional(),
    facteurConditionnement: z.number().optional(),
  })).optional(),
  // Attributs différenciants par variante (EAV variante_attributs)
  attributs: z.array(ATTRIBUT_INPUT).optional(),
});

const COMPAT_INPUT = z.object({
  typeCompat: z.enum(["POSITIVE", "NEGATIVE"]).default("POSITIVE"),
  marque: z.string().min(1),
  modele: z.string().min(1),
  anneeDe: z.number().int().optional(),
  anneeA: z.number().int().optional(),
  dateProductionDebut: z.string().optional(),
  dateProductionFin: z.string().optional(),
  motorisation: z.string().optional(),
  version: z.string().optional(),
  generation: z.string().optional(),
  carburant: z.string().optional(),
  cylindree: z.string().optional(),
  puissanceKw: z.string().optional(),
  codeMoteur: z.string().optional(),
  boite: z.string().optional(),
  codeBoite: z.string().optional(),
  transmission: z.string().optional(),
  carrosserie: z.string().optional(),
  nbPortes: z.number().int().optional(),
  normeEuro: z.string().optional(),
  codeChassis: z.string().optional(),
  typeFreinage: z.string().optional(),
  diametreFrein: z.string().optional(),
  codesPr: z.string().optional(),
  marche: z.string().optional(),
  position: z.string().optional(),
  refOem: z.string().optional(),
  refEquivalente: z.string().optional(),
  restrictions: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Crée une variante (ou un exemplaire) avec les règles GF1 :
 * - PIECE / CONSOMMABLE → niveau VARIANTE (champs outillage rejetés)
 * - OUTIL / EQUIPEMENT → niveau EXEMPLAIRE (champs commerciaux rejetés)
 */
async function creerVariante(tx: any, article: { id: number; typeProduit: string }, input: z.infer<typeof VARIANTE_INPUT>, agenceId: number, userId: number) {
  const type = article.typeProduit;
  const estExemplaire = type === "OUTIL" || type === "EQUIPEMENT";
  const estPiece = type === "PIECE" || type === "CONSOMMABLE";

  if (estPiece && (input.typeOutil || input.etatEquipement || input.calibrable || input.numeroImmobilisation)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Une pièce/consommable ne peut pas avoir de champs d'exemplaire (outillage)." });
  }
  if (estExemplaire) {
    if (input.prixVente != null || input.conditionnement) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Un outil/équipement n'a pas de prix de vente ni de conditionnement commercial." });
    }
    if (type === "OUTIL" && !input.typeOutil) throw new TRPCError({ code: "BAD_REQUEST", message: "Type d'outil requis (INDIVIDUEL, KIT, JEU, MACHINE)." });
    if (type === "EQUIPEMENT" && !input.numeroImmobilisation) throw new TRPCError({ code: "BAD_REQUEST", message: "Numéro d'immobilisation requis pour un équipement." });
  }

  const titre = estExemplaire
    ? `${input.marque ?? ""} ${input.referenceFabricant ?? ""}${input.numeroSerie ? ` — SN ${input.numeroSerie}` : ""}`.trim() || "Exemplaire"
    : [input.marque, input.referenceFabricant, input.conditionnement].filter(Boolean).join(" — ") || "Variante";

  const [row] = await tx
    .insert(produits)
    .values({
      articleId: article.id,
      typeProduit: type,
      niveau: estExemplaire ? "EXEMPLAIRE" : "VARIANTE",
      titre,
      marque: input.marque ?? null,
      referenceFabricant: input.referenceFabricant ?? null,
      refOem: input.refOem ?? null,
      codeBarre: input.codeBarre ?? `VAR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      codeArticle: input.codeArticle ?? null,
      referencePrincipale: input.referencePrincipale ?? input.referenceFabricant ?? null,
      designationCourte: input.designationCourte ?? null,
      conditionnement: estExemplaire ? null : input.conditionnement ?? null,
      prixAchat: input.prixAchat != null ? String(input.prixAchat) : null,
      prixVente: estExemplaire ? null : input.prixVente != null ? String(input.prixVente) : null,
      prixPro: input.prixPro != null ? String(input.prixPro) : null,
      prixParticulier: input.prixParticulier != null ? String(input.prixParticulier) : null,
      tva: input.tva != null ? String(input.tva) : "0",
      fournisseurId: input.fournisseurId ?? null,
      suiviSerie: input.suiviSerie ?? estExemplaire,
      numeroSerie: input.numeroSerie ?? null,
      suiviLot: input.suiviLot ?? false,
      numeroLot: input.numeroLot ?? null,
      dateFabrication: input.dateFabrication ? new Date(input.dateFabrication) : null,
      dateExpiration: input.dateExpiration ? new Date(input.dateExpiration) : null,
      garantieMois: input.garantieMois ?? null,
      estCore: input.estCore ?? false,
      valeurCore: input.valeurCore != null ? String(input.valeurCore) : null,
      etatProduit: input.etatProduit ?? null,
      origineProduit: input.origineProduit ?? null,
      relationProduit: input.relationProduit ?? null,
      positionCote: input.positionCote ?? null,
      positionEssieu: input.positionEssieu ?? null,
      positionZone: input.positionZone ?? null,
      positionEmplacement: input.positionEmplacement ?? null,
      typeOutil: estExemplaire ? input.typeOutil ?? null : null,
      etatEquipement: estExemplaire ? input.etatEquipement ?? "NEUF" : null,
      calibrable: estExemplaire ? input.calibrable ?? false : null,
      numeroImmobilisation: estExemplaire ? input.numeroImmobilisation ?? null : null,
      dateAchat: input.dateAchat ? new Date(input.dateAchat) : null,
      valeurAcquisition: input.valeurAcquisition != null ? String(input.valeurAcquisition) : null,
      responsableId: input.responsableId ?? null,
      prixMinimumVente: input.prixMinimumVente != null ? String(input.prixMinimumVente) : null,
      compteComptable: input.compteComptable ?? null,
      centreDeCout: input.centreDeCout ?? null,
      methodeValorisation: input.methodeValorisation ?? null,
      stockSecurite: input.stockSecurite ?? null,
      pointCommande: input.pointCommande ?? null,
      qteMinCommande: input.qteMinCommande != null ? String(input.qteMinCommande) : null,
      seuilAlerte: input.seuilAlerte ?? 5,
      statut: "actif",
    } as any)
    .returning({ id: produits.id });
  const varianteId = row.id;

  const unites = input.unites ?? (input.uniteStockId && !estExemplaire
    ? [{ uniteId: input.uniteStockId, facteurVersBase: 1, estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true }]
    : []);
  const uniteBase = unites.find((u) => u.estUniteBase) ?? unites[0];
  for (const u of unites) {
    await tx
      .insert(produitUnites)
      .values({
        produitId: varianteId,
        uniteId: u.uniteId,
        facteurVersBase: String(u.facteurVersBase ?? 1),
        estUniteBase: u.estUniteBase ?? false,
        estUniteAchatDefaut: u.estUniteAchatDefaut ?? false,
        estUniteVenteDefaut: u.estUniteVenteDefaut ?? false,
        prixAchat: u.prixAchat != null ? String(u.prixAchat) : input.prixAchat != null ? String(input.prixAchat) : "0",
        prixVente: u.prixVente != null ? String(u.prixVente) : input.prixVente != null ? String(input.prixVente) : "0",
      } as any)
      .onConflictDoNothing();
  }

  if (input.fournisseurs?.length) {
    for (const f of input.fournisseurs) {
      await tx
        .insert(produitsFournisseurs)
        .values({
          produitId: varianteId,
          fournisseurId: f.fournisseurId,
          referenceFournisseur: f.referenceFournisseur ?? null,
          prixAchat: f.prixAchat != null ? String(f.prixAchat) : null,
          delaiApprovisionnement: f.delaiApprovisionnement ?? null,
          estPrincipal: f.estPrincipal ?? false,
          uniteConditionnement: f.uniteConditionnement ?? null,
          facteurConditionnement: f.facteurConditionnement != null ? String(f.facteurConditionnement) : null,
        } as any)
        .onConflictDoNothing();
    }
  }

  if (input.attributs?.length) {
    let i = 0;
    for (const a of input.attributs) {
      await tx
        .insert(varianteAttributs)
        .values({ varianteId, ...mapAttribut(a as z.infer<typeof ATTRIBUT_INPUT>, i), portee: "VARIANTE" } as any)
        .onConflictDoNothing();
      i++;
    }
  }

  if (input.stockInitial && input.stockInitial > 0) {
    let lotId: number | undefined;
    // Suivi par lot (specs garage) : le lot est créé et rattaché au mouvement d'ouverture.
    if (input.suiviLot || input.numeroLot) {
      const numeroLot = input.numeroLot?.trim() || `LOT-${Date.now()}-${Math.floor(Math.random() * 900) + 100}`;
      const [lot] = await tx
        .insert(lots)
        .values({
          produitId: varianteId,
          numeroLot,
          fournisseurId: input.fournisseurId ?? null,
          dateReception: input.dateFabrication ? new Date(input.dateFabrication) : new Date(),
          quantiteInitiale: input.stockInitial,
          coutUnitaire: input.prixAchat != null ? String(input.prixAchat) : null,
          dateFabrication: input.dateFabrication ? new Date(input.dateFabrication) : null,
          datePeremption: input.dateExpiration ? new Date(input.dateExpiration) : null,
          provenance: input.origineProduit ?? null,
          fabricant: input.marque ?? null,
        } as any)
        .returning({ id: lots.id });
      lotId = lot?.id;
      await tx
        .insert(stocksLots)
        .values({
          produitId: varianteId,
          agenceId,
          lotId,
          quantite: String(input.stockInitial),
        } as any)
        .onConflictDoNothing();
    }
    await enregistrerMouvement(tx, {
      produitId: varianteId,
      agenceId,
      type: TYPES_MOUVEMENT.INITIAL_RECEIPT,
      sens: "E",
      quantite: input.stockInitial,
      uniteId: estExemplaire ? undefined : (uniteBase?.uniteId ?? input.uniteStockId),
      emplacementId: input.emplacementStockId ?? null,
      lotId,
      motif: `Stock initial (article #${article.id})`,
      effectuePar: userId,
      reference: lotId ? `LOT ${input.numeroLot ?? ""}`.trim() || undefined : undefined,
      referenceType: lotId ? "LOT" : undefined,
      synchroniserStocksUnites: true,
    });
    await tx
      .insert(auditLogs)
      .values({
        userId,
        action: "STOCK_INITIALIZED",
        entityType: "produit",
        entityId: varianteId,
        details: JSON.stringify({ type: TYPES_MOUVEMENT.INITIAL_RECEIPT, quantite: input.stockInitial, emplacementId: input.emplacementStockId ?? null, lot: lotId ? (input.numeroLot ?? null) : null }),
      } as any);
  }
  await tx
    .insert(auditLogs)
    .values({
      userId,
      action: "VARIANTE_CREATED",
      entityType: "produit",
      entityId: varianteId,
      details: JSON.stringify({ articleId: article.id, titre, marque: input.marque ?? null, referencePrincipale: input.referencePrincipale ?? input.referenceFabricant ?? null }),
    } as any);
  return varianteId;
}

export const articlesRouter = createTRPCRouter({
  // ─── Liste des articles (produits conceptuels) ───
  listArticles: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      q: z.string().optional(),
      type: z.string().optional(),
      categorieId: z.number().int().optional(),
      sousSeuilOnly: z.boolean().optional(),
      // CAT-02 : filtre qualité — code de problème (INCOMPLETE_ARTICLE, MISSING_CATEGORY,
      // MISSING_BRAND, MISSING_PRIMARY_REFERENCE, DUPLICATE_CANDIDATE)
      probleme: z.string().optional(),
      limit: z.number().int().min(10).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(produitArticles.isActive, true)];
      if (safe.type) conditions.push(eq(produitArticles.typeProduit, safe.type));
      if (safe.categorieId) conditions.push(eq(produitArticles.categorieId, safe.categorieId));
      if (safe.q?.trim()) {
        const q = `%${safe.q.trim()}%`;
        // Recherche multi-références : code/désignation de l'article + champs variantes
        // (marque, réf fabricant, réf OEM, réf principale, code-barre, code article, titre).
        conditions.push(or(
          ilike(produitArticles.designation, q),
          ilike(produitArticles.designationCourte, q),
          ilike(produitArticles.code, q),
          sql`EXISTS (SELECT 1 FROM produits v WHERE v.article_id = ${produitArticles.id} AND v.is_active = true AND (v.marque ILIKE ${q} OR v.reference_fabricant ILIKE ${q} OR v.ref_oem ILIKE ${q} OR v.reference_principale ILIKE ${q} OR v.code_barre ILIKE ${q} OR v.code_article ILIKE ${q} OR v.titre ILIKE ${q}))`,
        )!);
      }
      if (safe.probleme) {
        switch (safe.probleme) {
          case "INCOMPLETE_ARTICLE":
            conditions.push(sql`(${produitArticles.designation} IS NULL OR ${produitArticles.designation} = '' OR ${produitArticles.code} IS NULL OR ${produitArticles.code} = '')`);
            break;
          case "MISSING_CATEGORY":
            conditions.push(sql`${produitArticles.categorieId} IS NULL`);
            break;
          case "MISSING_BRAND":
            conditions.push(sql`EXISTS (SELECT 1 FROM produits v WHERE v.article_id = ${produitArticles.id} AND v.is_active = true AND v.niveau = 'VARIANTE' AND (v.marque IS NULL OR v.marque = ''))`);
            break;
          case "MISSING_PRIMARY_REFERENCE":
            conditions.push(sql`EXISTS (SELECT 1 FROM produits v WHERE v.article_id = ${produitArticles.id} AND v.is_active = true AND v.niveau = 'VARIANTE' AND (v.reference_fabricant IS NULL OR v.reference_fabricant = '') AND (v.ref_oem IS NULL OR v.ref_oem = ''))`);
            break;
          case "DUPLICATE_CANDIDATE":
            conditions.push(sql`EXISTS (SELECT 1 FROM produits v WHERE v.article_id = ${produitArticles.id} AND v.is_active = true AND v.niveau = 'VARIANTE' AND v.designation_courte IS NOT NULL AND v.designation_courte != '' AND EXISTS (SELECT 1 FROM produits w WHERE w.is_active = true AND lower(w.designation_courte) = lower(v.designation_courte) AND w.id != v.id))`);
            break;
          default:
            throw new TRPCError({ code: "BAD_REQUEST", message: "Code de problème de qualité inconnu." });
        }
      }
      const rows = await db
        .select({
          id: produitArticles.id,
          code: produitArticles.code,
          designation: produitArticles.designation,
          designationCourte: produitArticles.designationCourte,
          typeProduit: produitArticles.typeProduit,
          categorieId: produitArticles.categorieId,
          categorieNom: categories.nom,
          imageUrl: produitArticles.imageUrl,
          nVariantes: sql<number>`(SELECT COUNT(*)::int FROM produits v WHERE v.article_id = ${produitArticles.id})`,
          stockTotal: sql<number>`COALESCE((SELECT SUM(s.quantite)::int FROM produits v JOIN stocks s ON s.produit_id = v.id AND s.agence_id = ${ctx.user.agenceId} WHERE v.article_id = ${produitArticles.id}), 0)`,
        })
        .from(produitArticles)
        .leftJoin(categories, eq(produitArticles.categorieId, categories.id))
        .where(and(...conditions))
        .orderBy(asc(produitArticles.designation))
        .limit(safe.limit)
        .offset(safe.offset);
      const [total] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(produitArticles)
        .where(and(...conditions));

      // Flags qualité par article (CAT-02) : codes de problèmes constatés.
      const flagsMap = new Map<number, string[]>();
      const addFlag = (articleId: number | null | undefined, code: string) => {
        if (articleId == null) return;
        const cur = flagsMap.get(articleId) ?? [];
        if (!cur.includes(code)) cur.push(code);
        flagsMap.set(articleId, cur);
      };
      const [incRows, missingCatRows, missingBrandRows, missingRefRows] = await Promise.all([
        db.select({ id: produitArticles.id }).from(produitArticles)
          .where(and(eq(produitArticles.isActive, true), sql`(${produitArticles.designation} IS NULL OR ${produitArticles.designation} = '' OR ${produitArticles.code} IS NULL OR ${produitArticles.code} = '')`)),
        db.select({ id: produitArticles.id }).from(produitArticles)
          .where(and(eq(produitArticles.isActive, true), sql`${produitArticles.categorieId} IS NULL`)),
        db.select({ articleId: produits.articleId }).from(produits)
          .where(and(eq(produits.isActive, true), sql`${produits.niveau} = 'VARIANTE'`, sql`(${produits.marque} IS NULL OR ${produits.marque} = '')`))
          .groupBy(produits.articleId),
        db.select({ articleId: produits.articleId }).from(produits)
          .where(and(eq(produits.isActive, true), sql`${produits.niveau} = 'VARIANTE'`, sql`(${produits.referenceFabricant} IS NULL OR ${produits.referenceFabricant} = '') AND (${produits.refOem} IS NULL OR ${produits.refOem} = '')`))
          .groupBy(produits.articleId),
      ]);
      incRows.forEach((r) => addFlag(r.id, "INCOMPLETE_ARTICLE"));
      missingCatRows.forEach((r) => addFlag(r.id, "MISSING_CATEGORY"));
      missingBrandRows.forEach((r) => addFlag(r.articleId, "MISSING_BRAND"));
      missingRefRows.forEach((r) => addFlag(r.articleId, "MISSING_PRIMARY_REFERENCE"));
      const dupRows = await db.execute(sql`
        SELECT DISTINCT v.article_id AS "articleId" FROM produits v
        WHERE v.is_active = true AND v.niveau = 'VARIANTE' AND v.article_id IS NOT NULL
          AND v.designation_courte IS NOT NULL AND v.designation_courte != ''
          AND EXISTS (
            SELECT 1 FROM produits w
            WHERE w.is_active = true AND lower(w.designation_courte) = lower(v.designation_courte) AND w.id != v.id
          )
      `);
      (dupRows as unknown as Array<{ articleId: number }>).forEach((r) => addFlag(r.articleId, "DUPLICATE_CANDIDATE"));

      return {
        articles: rows.map((r) => ({ ...r, problemes: flagsMap.get(r.id) ?? [] })),
        total: total?.n ?? 0,
      };
    }),

  // ─── Fiche article complète ───
  getArticle: requirePermissionProcedure("stock.consulter")
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [article] = await db
        .select({
          id: produitArticles.id,
          code: produitArticles.code,
          designation: produitArticles.designation,
          designationCourte: produitArticles.designationCourte,
          description: produitArticles.description,
          categorieId: produitArticles.categorieId,
          categorieNom: categories.nom,
          typeProduit: produitArticles.typeProduit,
          imageUrl: produitArticles.imageUrl,
          isActive: produitArticles.isActive,
          etatProduitDefaut: produitArticles.etatProduitDefaut,
          origineProduitDefaut: produitArticles.origineProduitDefaut,
        })
        .from(produitArticles)
        .leftJoin(categories, eq(produitArticles.categorieId, categories.id))
        .where(eq(produitArticles.id, input.id))
        .limit(1);
      if (!article) throw new TRPCError({ code: "NOT_FOUND", message: "Article introuvable." });

      const [variantesG, compatibilites, attributs, referencesEquiv, documents] = await Promise.all([
        db
          .select({
            id: produits.id,
            articleId: produits.articleId,
            niveau: produits.niveau,
            titre: produits.titre,
            marque: produits.marque,
            referenceFabricant: produits.referenceFabricant,
            referencePrincipale: produits.referencePrincipale,
            refOem: produits.refOem,
            codeBarre: produits.codeBarre,
            codeArticle: produits.codeArticle,
            designationCourte: produits.designationCourte,
            conditionnement: produits.conditionnement,
            prixAchat: produits.prixAchat,
            prixVente: produits.prixVente,
            prixPro: produits.prixPro,
            prixParticulier: produits.prixParticulier,
            tva: produits.tva,
            fournisseurId: produits.fournisseurId,
            typeOutil: produits.typeOutil,
            numeroImmobilisation: produits.numeroImmobilisation,
            etatEquipement: produits.etatEquipement,
            etatProduit: produits.etatProduit,
            origineProduit: produits.origineProduit,
            relationProduit: produits.relationProduit,
            positionCote: produits.positionCote,
            positionEssieu: produits.positionEssieu,
            positionZone: produits.positionZone,
            positionEmplacement: produits.positionEmplacement,
            numeroSerie: produits.numeroSerie,
            calibrable: produits.calibrable,
            suiviSerie: produits.suiviSerie,
            stockMaximum: produits.stockMaximum,
            seuilAlerte: produits.seuilAlerte,
            quantiteMinimale: produits.quantiteMinimale,
            statut: produits.statut,
            stockTotal: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)::int`,
            stockReserve: sql<number>`COALESCE(SUM(${stocks.quantiteReservee}), 0)::int`,
          })
          .from(produits)
          .leftJoin(stocks, and(eq(stocks.produitId, produits.id), eq(stocks.agenceId, ctx.user.agenceId)))
          .where(eq(produits.articleId, input.id))
          .groupBy(produits.id)
          .orderBy(asc(produits.titre)),
        db
          .select()
          .from(compatibilitesProduits)
          .where(eq(compatibilitesProduits.articleId, input.id))
          .orderBy(asc(compatibilitesProduits.marque)),
        db
          .select()
          .from(articleAttributs)
          .where(eq(articleAttributs.articleId, input.id))
          .orderBy(asc(articleAttributs.ordre), asc(articleAttributs.cle)),
        db
          .select()
          .from(produitReferencesEquiv)
          .where(eq(produitReferencesEquiv.articleId, input.id))
          .orderBy(asc(produitReferencesEquiv.marque)),
        db
          .select()
          .from(articleDocuments)
          .where(eq(articleDocuments.articleId, input.id))
          .orderBy(desc(articleDocuments.createdAt)),
      ]);

      // Attributs différenciants de CHAQUE variante (séparés des attributs ARTICLE).
      const idsVariantes = variantesG.map((v) => v.id);
      const lignesAttributsVariante = idsVariantes.length
        ? await db.select().from(varianteAttributs).where(inArray(varianteAttributs.varianteId, idsVariantes)).orderBy(asc(varianteAttributs.ordre), asc(varianteAttributs.cle))
        : [];
      const parVariante = new Map<number, typeof lignesAttributsVariante>();
      for (const la of lignesAttributsVariante) {
        const arr = parVariante.get(la.varianteId) ?? [];
        arr.push(la);
        parVariante.set(la.varianteId, arr);
      }
      const variantes = variantesG.map((v) => ({ ...v, attributs: parVariante.get(v.id) ?? [] }));

      return { article, variantes, compatibilites, attributs, referencesEquiv, documents };
    }),

  // ─── Mettre à jour l'identification d'un article ───
  updateArticle: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      articleId: z.number().int(),
      designation: z.string().min(2).optional(),
      designationCourte: z.string().max(200).optional(),
      description: z.string().optional(),
      categorieId: z.number().int().optional(),
      imageUrl: z.string().max(500).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [article] = await db
        .select({ id: produitArticles.id })
        .from(produitArticles)
        .where(eq(produitArticles.id, input.articleId))
        .limit(1);
      if (!article) throw new TRPCError({ code: "NOT_FOUND", message: "Article introuvable." });

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.designation !== undefined) patch.designation = input.designation.trim();
      if (input.designationCourte !== undefined) patch.designationCourte = input.designationCourte.trim() || null;
      if (input.description !== undefined) patch.description = input.description.trim() || null;
      if (input.categorieId !== undefined) patch.categorieId = input.categorieId;
      if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl.trim() || null;
      if (input.isActive !== undefined) patch.isActive = input.isActive;

      const [updated] = await db
        .update(produitArticles)
        .set(patch as any)
        .where(eq(produitArticles.id, input.articleId))
        .returning({ id: produitArticles.id });

      await db
        .insert(auditLogs)
        .values({
          userId: Number(ctx.user.id),
          action: "ARTICLE_UPDATED",
          entityType: "article",
          entityId: input.articleId,
          details: JSON.stringify({
            designation: input.designation?.trim(),
            designationCourte: input.designationCourte?.trim() ?? null,
            description: input.description?.trim() || null,
            categorieId: input.categorieId ?? null,
            imageUrl: input.imageUrl?.trim() || null,
            isActive: input.isActive,
          }),
        } as any);

      return { articleId: updated.id };
    }),

  // ─── Créer un article (+ variantes) ───
  createArticle: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      designation: z.string().min(2),
      designationCourte: z.string().optional(),
      description: z.string().optional(),
      categorieId: z.number().int().optional(),
      typeProduit: z.enum(["PIECE", "CONSOMMABLE", "OUTIL", "EQUIPEMENT", "SERVICE", "FOURNITURE", "KIT", "MANUEL", "LIQUIDE", "BIDON", "AUTRE"]).default("PIECE"),
      imageUrl: z.string().optional(),
      etatProduitDefaut: z.enum(ETATS_PRODUIT).optional(),
      origineProduitDefaut: z.enum(ORIGINES_PRODUIT).optional(),
      attributs: z.array(ATTRIBUT_INPUT).optional(),
      variantes: z.array(VARIANTE_INPUT).optional(),
      compatibilites: z.array(COMPAT_INPUT).optional(),
      referencesEquiv: z.array(z.object({
        marque: z.string().optional(),
        reference: z.string().min(1),
        note: z.string().optional(),
      })).optional(),
    })
    .superRefine((input, ctx) => {
      for (const v of input.variantes ?? []) {
        if (v.prixMinimumVente != null && v.prixMinimumVente > 0 && v.prixVente != null && v.prixVente < v.prixMinimumVente) {
          ctx.addIssue({
            code: "custom",
            path: ["variantes", "prixVente"],
            message: `Prix de vente (${v.prixVente} F) inférieur au prix plancher (${v.prixMinimumVente} F) — vente impossible.`,
          });
        }
        if (v.prixMinimumVente != null && v.prixVente == null) {
          ctx.addIssue({
            code: "custom",
            path: ["variantes", "prixVente"],
            message: "Un prix plancher est défini mais le prix de vente est vide — indiquez un prix de vente.",
          });
        }
      }
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.typeProduit === "SERVICE" && (input.variantes?.length ?? 0) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Un service n'a pas de variantes ni de stock." });
      }
      return db.transaction(async (tx) => {
        const [article] = await tx
          .insert(produitArticles)
          .values({
            code: `ART-${Date.now().toString().slice(-6)}`,
            designation: input.designation.trim(),
            designationCourte: input.designationCourte ?? null,
            description: input.description ?? null,
            categorieId: input.categorieId ?? null,
            typeProduit: input.typeProduit,
            imageUrl: input.imageUrl ?? null,
            etatProduitDefaut: input.etatProduitDefaut ?? "NEUF",
            origineProduitDefaut: input.origineProduitDefaut ?? "AFTERMARKET",
          } as any)
          .returning({ id: produitArticles.id });
        const articleObj = { id: article.id, typeProduit: input.typeProduit };
        let variantesCrees = 0;
        for (const v of input.variantes ?? []) {
          await creerVariante(tx, articleObj, v, ctx.user.agenceId, Number(ctx.user.id));
          variantesCrees++;
        }
        let i = 0;
        for (const a of input.attributs ?? []) {
          await tx.insert(articleAttributs).values({
            articleId: article.id,
            ...mapAttribut(a as z.infer<typeof ATTRIBUT_INPUT>, i),
          } as any).onConflictDoNothing();
          i++;
        }
        let compatibilitesCrees = 0;
        for (const c of input.compatibilites ?? []) {
          await tx.insert(compatibilitesProduits).values({ articleId: article.id, ...c } as any);
          compatibilitesCrees++;
        }
        let referencesEquivCrees = 0;
        for (const r of input.referencesEquiv ?? []) {
          await tx.insert(produitReferencesEquiv).values({
            articleId: article.id,
            marque: r.marque ?? null,
            reference: r.reference.trim(),
            note: r.note ?? null,
          } as any).onConflictDoNothing();
          referencesEquivCrees++;
        }
        await tx
        .insert(auditLogs)
        .values({
          userId: Number(ctx.user.id),
          action: "ARTICLE_CREATED",
          entityType: "article",
          entityId: article.id,
          details: JSON.stringify({ designation: input.designation.trim(), typeProduit: input.typeProduit, categorieId: input.categorieId ?? null, variantes: variantesCrees, compatibilites: compatibilitesCrees }),
        } as any);
        return {
          articleId: article.id,
          variantesCrees,
          compatibilitesCrees,
          referencesEquivCrees,
        };
      }) as any;
    }),

  // ─── Ajouter une variante (ou un exemplaire) à un article ───
  addVariante: requirePermissionProcedure("stock.modifier")
    .input(z.object({ articleId: z.number().int(), variante: VARIANTE_INPUT }))
    .mutation(async ({ ctx, input }) => {
      const [article] = await db
        .select({ id: produitArticles.id, typeProduit: produitArticles.typeProduit })
        .from(produitArticles)
        .where(eq(produitArticles.id, input.articleId))
        .limit(1);
      if (!article) throw new TRPCError({ code: "NOT_FOUND", message: "Article introuvable." });
      if (article.typeProduit === "SERVICE") throw new TRPCError({ code: "BAD_REQUEST", message: "Un service n'a pas de variantes." });
      return db.transaction(async (tx) => {
        const id = await creerVariante(tx, article, input.variante, ctx.user.agenceId, Number(ctx.user.id));
        return { varianteId: id };
      }) as any;
    }),

  // ─── Attributs techniques dynamiques (upsert par clé) ───
  setAttributs: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      articleId: z.number().int(),
      attributs: z.array(ATTRIBUT_INPUT),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const existants = await tx
          .select({ id: articleAttributs.id, cle: articleAttributs.cle })
          .from(articleAttributs)
          .where(eq(articleAttributs.articleId, input.articleId));
        const parCle = new Map(existants.map((a) => [a.cle, a.id]));
        let i = 0;
        for (const a of input.attributs) {
          const id = parCle.get(a.cle);
          const data = mapAttribut(a, i);
          if (id) {
            await tx.update(articleAttributs).set(data).where(eq(articleAttributs.id, id));
          } else {
            await tx.insert(articleAttributs).values({ articleId: input.articleId, ...data } as any);
          }
          i++;
        }
        return { success: true };
      }) as any;
    }),

  // ─── Références équivalentes ───
  addReferenceEquiv: requirePermissionProcedure("stock.modifier")
    .input(z.object({ articleId: z.number().int(), marque: z.string().optional(), reference: z.string().min(1), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(produitReferencesEquiv)
        .values({ articleId: input.articleId, marque: input.marque ?? null, reference: input.reference.trim(), note: input.note ?? null } as any)
        .onConflictDoNothing();
      return { success: true };
    }),
  removeReferenceEquiv: requirePermissionProcedure("stock.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(produitReferencesEquiv).where(eq(produitReferencesEquiv.id, input.id));
      return { success: true };
    }),

  // ─── Compatibilités véhicules (niveau article) ───
  addCompatibilite: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      articleId: z.number().int().optional(),
      produitId: z.number().int().optional(),
      compat: COMPAT_INPUT,
    }).superRefine((v, ctx) => {
      if (v.articleId == null && v.produitId == null) ctx.addIssue({ code: "custom", message: "Il faut cibler un article ou une variante." });
    }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(compatibilitesProduits).values({ articleId: input.articleId ?? null, produitId: input.produitId ?? null, ...input.compat } as any);
      return { success: true };
    }),
  removeCompatibilite: requirePermissionProcedure("stock.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(compatibilitesProduits).where(eq(compatibilitesProduits.id, input.id));
      return { success: true };
    }),

  // ─── Documents liés à l'article ───
  addDocument: requirePermissionProcedure("stock.modifier")
    .input(z.object({ articleId: z.number().int(), type: z.string().optional(), titre: z.string().optional(), url: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(articleDocuments).values({ articleId: input.articleId, type: input.type ?? "AUTRE", titre: input.titre ?? null, url: input.url } as any);
      return { success: true };
    }),
  removeDocument: requirePermissionProcedure("stock.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(articleDocuments).where(eq(articleDocuments.id, input.id));
      return { success: true };
    }),

  // ─── Mettre à jour une variante / un exemplaire ───
  updateVariante: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      varianteId: z.number().int(),
      marque: z.string().optional(),
      referenceFabricant: z.string().optional(),
      referencePrincipale: z.string().optional(),
      conditionnement: z.string().optional(),
      codeBarre: z.string().optional(),
      codeArticle: z.string().optional(),
      fournisseurId: z.number().int().nullable().optional(),
      prixAchat: z.number().min(0).nullable().optional(),
      prixVente: z.number().min(0).nullable().optional(),
      prixPro: z.number().min(0).nullable().optional(),
      prixParticulier: z.number().min(0).nullable().optional(),
      tva: z.number().min(0).max(100).optional(),
      etatProduit: z.enum(ETATS_PRODUIT).nullable().optional(),
      origineProduit: z.enum(ORIGINES_PRODUIT).nullable().optional(),
      relationProduit: z.enum(RELATIONS_PRODUIT).nullable().optional(),
      positionCote: z.enum(POSITION_OPTIONS).nullable().optional(),
      positionEssieu: z.enum(ESSIEU_OPTIONS).nullable().optional(),
      positionZone: z.enum(ZONE_OPTIONS).nullable().optional(),
      positionEmplacement: z.enum(EMPLACEMENT_POS_OPTIONS).nullable().optional(),
      seuilAlerte: z.number().int().min(0).nullable().optional(),
      stockSecurite: z.number().int().min(0).nullable().optional(),
      pointCommande: z.number().int().min(0).nullable().optional(),
      qteMinCommande: z.number().min(0).nullable().optional(),
      numeroSerie: z.string().nullable().optional(),
      numeroLot: z.string().nullable().optional(),
      dateFabrication: z.string().nullable().optional(),
      dateExpiration: z.string().nullable().optional(),
      garantieMois: z.number().int().min(0).nullable().optional(),
      etatEquipement: z.string().nullable().optional(),
      typeOutil: z.string().nullable().optional(),
      calibrable: z.boolean().nullable().optional(),
      estCore: z.boolean().nullable().optional(),
      valeurCore: z.number().min(0).nullable().optional(),
      numeroImmobilisation: z.string().nullable().optional(),
      valeurAcquisition: z.number().min(0).nullable().optional(),
      responsableId: z.number().int().nullable().optional(),
      prixMinimumVente: z.number().min(0).nullable().optional(),
    })
    .superRefine((input, ctx) => {
      if (input.prixMinimumVente != null && input.prixMinimumVente > 0 && input.prixVente != null && input.prixVente < input.prixMinimumVente) {
        ctx.addIssue({
          code: "custom",
          path: ["prixVente"],
          message: `Prix de vente (${input.prixVente} F) inférieur au prix plancher (${input.prixMinimumVente} F) — vente impossible.`,
        });
      }
    }))
    .mutation(async ({ ctx, input }) => {
      const { varianteId, ...rest } = input;
      const values: any = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v === undefined) continue;
        if (["prixAchat", "prixVente", "prixPro", "prixParticulier", "qteMinCommande", "prixMinimumVente", "valeurCore", "valeurAcquisition"].includes(k) && v != null) values[k] = String(v);
        else if ((k === "dateFabrication" || k === "dateExpiration") && v != null) values[k] = new Date(v as string);
        else values[k] = v;
      }
      values.updatedAt = new Date();
      await db.update(produits).set(values as any).where(eq(produits.id, varianteId));
      return { success: true };
    }),

  // ─── Fiche variante / exemplaire ───
  getVariante: requirePermissionProcedure("stock.consulter")
    .input(z.object({ varianteId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [variante] = await db
        .select({
          id: produits.id,
          articleId: produits.articleId,
          niveau: produits.niveau,
          titre: produits.titre,
          marque: produits.marque,
          referenceFabricant: produits.referenceFabricant,
          referencePrincipale: produits.referencePrincipale,
          refOem: produits.refOem,
          codeBarre: produits.codeBarre,
          codeArticle: produits.codeArticle,
          conditionnement: produits.conditionnement,
          prixAchat: produits.prixAchat,
          prixVente: produits.prixVente,
          prixPro: produits.prixPro,
          prixParticulier: produits.prixParticulier,
          tva: produits.tva,
          prixMinimumVente: produits.prixMinimumVente,
          etatProduit: produits.etatProduit,
          origineProduit: produits.origineProduit,
          relationProduit: produits.relationProduit,
          positionCote: produits.positionCote,
          positionEssieu: produits.positionEssieu,
          positionZone: produits.positionZone,
          positionEmplacement: produits.positionEmplacement,
          stockSecurite: produits.stockSecurite,
          pointCommande: produits.pointCommande,
          seuilAlerte: produits.seuilAlerte,
          qteMinCommande: produits.qteMinCommande,
          numeroSerie: produits.numeroSerie,
          numeroLot: produits.numeroLot,
          dateFabrication: produits.dateFabrication,
          dateExpiration: produits.dateExpiration,
          garantieMois: produits.garantieMois,
          estCore: produits.estCore,
          valeurCore: produits.valeurCore,
          typeOutil: produits.typeOutil,
          etatEquipement: produits.etatEquipement,
          calibrable: produits.calibrable,
          numeroImmobilisation: produits.numeroImmobilisation,
          dateAchat: produits.dateAchat,
          valeurAcquisition: produits.valeurAcquisition,
          responsableId: produits.responsableId,
          fournisseurId: produits.fournisseurId,
          articleDesignation: produitArticles.designation,
        })
        .from(produits)
        .leftJoin(produitArticles, eq(produitArticles.id, produits.articleId))
        .where(eq(produits.id, input.varianteId))
        .limit(1);
      if (!variante) throw new TRPCError({ code: "NOT_FOUND", message: "Variante introuvable." });
      const [attributs, references] = await Promise.all([
        db.select().from(varianteAttributs).where(eq(varianteAttributs.varianteId, input.varianteId)).orderBy(asc(varianteAttributs.ordre)),
        db.select().from(produitReferences).where(eq(produitReferences.varianteId, input.varianteId)).orderBy(asc(produitReferences.typeRef)),
      ]);
      // Marges calculées côté serveur (édition jamais affichée/modifiable telle quelle en client).
      const prixAchatN = variante.prixAchat ? Number(variante.prixAchat) : null;
      const prixVenteN = variante.prixVente ? Number(variante.prixVente) : null;
      const tvaN = variante.tva ? Number(variante.tva) : 0;
      const margeUnitaire = prixAchatN != null && prixVenteN != null ? prixVenteN - prixAchatN : null;
      return {
        variante,
        marges: {
          margeUnitaire: margeUnitaire != null ? Number(margeUnitaire.toFixed(2)) : null,
          tauxMarge: margeUnitaire != null && prixAchatN ? Math.round((margeUnitaire / prixAchatN) * 1000) / 10 : null,
          coefficient: margeUnitaire != null && prixAchatN ? Math.round((prixVenteN! / prixAchatN) * 100) / 100 : null,
          prixVenteTTC: prixVenteN != null ? Number((prixVenteN * (1 + tvaN / 100)).toFixed(2)) : null,
        },
        attributs,
        references,
      };
    }),

  // ─── Attributs différenciants d'une variante ───
  setAttributsVariante: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      varianteId: z.number().int(),
      attributs: z.array(ATTRIBUT_INPUT),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const existants = await tx.select({ id: varianteAttributs.id, cle: varianteAttributs.cle }).from(varianteAttributs).where(eq(varianteAttributs.varianteId, input.varianteId));
        const parCle = new Map(existants.map((a) => [a.cle, a.id]));
        let i = 0;
        for (const a of input.attributs) {
          const id = parCle.get(a.cle);
          const data = mapAttribut(a, i);
          if (id) await tx.update(varianteAttributs).set(data).where(eq(varianteAttributs.id, id));
          else await tx.insert(varianteAttributs).values({ varianteId: input.varianteId, ...data } as any);
          i++;
        }
        return { success: true };
      }) as any;
    }),

  // ─── Références multiples (une principale max) ───
  addReference: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      varianteId: z.number().int(),
      typeRef: z.enum(TYPES_REF),
      valeur: z.string().min(1),
      isPrincipale: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        if (input.isPrincipale) {
          await tx.update(produitReferences).set({ isPrincipale: false } as any).where(eq(produitReferences.varianteId, input.varianteId));
          await tx.update(produits).set({ referencePrincipale: input.valeur.trim() } as any).where(eq(produits.id, input.varianteId));
        }
        await tx.insert(produitReferences).values({
          varianteId: input.varianteId,
          typeRef: input.typeRef,
          valeur: input.valeur.trim(),
          valeurNormalisee: normaliserRef(input.valeur),
          isPrincipale: input.isPrincipale ?? false,
        } as any).onConflictDoNothing();
        return { success: true };
      }) as any;
    }),
  listReferences: requirePermissionProcedure("stock.consulter")
    .input(z.object({ varianteId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return db.select().from(produitReferences).where(eq(produitReferences.varianteId, input.varianteId)).orderBy(desc(produitReferences.isPrincipale), asc(produitReferences.typeRef));
    }),
  removeReference: requirePermissionProcedure("stock.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(produitReferences).where(eq(produitReferences.id, input.id));
      return { success: true };
    }),

  // ─── Supersessions (référence remplacée) ───
  addSupersession: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      ancienneVarianteId: z.number().int().optional(),
      ancienneReference: z.string().min(1),
      nouvelleVarianteId: z.number().int().optional(),
      nouvelleReference: z.string().min(1),
      fabricant: z.string().optional(),
      motif: z.string().optional(),
      commandeAutorisee: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(produitSupersessions).values({
        ancienneVarianteId: input.ancienneVarianteId ?? null,
        ancienneReference: input.ancienneReference.trim(),
        nouvelleVarianteId: input.nouvelleVarianteId ?? null,
        nouvelleReference: input.nouvelleReference.trim(),
        fabricant: input.fabricant ?? null,
        motif: input.motif ?? null,
        commandeAutorisee: input.commandeAutorisee ?? false,
      } as any);
      return { success: true };
    }),
  listSupersessions: requirePermissionProcedure("stock.consulter")
    .input(z.object({ varianteId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(produitSupersessions)
        .where(input?.varianteId ? or(eq(produitSupersessions.ancienneVarianteId, input.varianteId), eq(produitSupersessions.nouvelleVarianteId, input.varianteId)) : undefined)
        .orderBy(desc(produitSupersessions.dateRemplacement));
    }),
  removeSupersession: requirePermissionProcedure("stock.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(produitSupersessions).where(eq(produitSupersessions.id, input.id));
      return { success: true };
    }),

  // ─── Substitutions (variante → variante, avec confiance) ───
  addSubstitution: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      varianteAId: z.number().int(),
      varianteBId: z.number().int(),
      niveauConfiance: z.enum(NIVEAUX_CONFIANCE).default("MANUELLE"),
      motif: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.varianteAId === input.varianteBId) throw new TRPCError({ code: "BAD_REQUEST", message: "Une variante ne se substitue pas à elle-même." });
      await db.insert(produitSubstitutions).values({
        varianteAId: input.varianteAId,
        varianteBId: input.varianteBId,
        niveauConfiance: input.niveauConfiance,
        validePar: Number(ctx.user.id),
        motif: input.motif ?? null,
        actif: true,
      } as any);
      return { success: true };
    }),
  listSubstitutions: requirePermissionProcedure("stock.consulter")
    .input(z.object({ varianteId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(produitSubstitutions)
        .where(input?.varianteId ? or(eq(produitSubstitutions.varianteAId, input.varianteId), eq(produitSubstitutions.varianteBId, input.varianteId)) : undefined)
        .orderBy(desc(produitSubstitutions.createdAt));
    }),
  removeSubstitution: requirePermissionProcedure("stock.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(produitSubstitutions).where(eq(produitSubstitutions.id, input.id));
      return { success: true };
    }),

  // ─── Templates techniques ───
  listTemplates: requirePermissionProcedure("stock.consulter")
    .query(async ({ ctx }) => {
      return db.select().from(attributTemplates).where(eq(attributTemplates.isActive, true)).orderBy(asc(attributTemplates.libelle));
    }),

  // ─── Stock 6 états (GF3) : physique / bloqué / réservé / disponible / en commande / affecté ───
  stockEtats: requirePermissionProcedure("stock.consulter")
    .input(z.object({ varianteId: z.number().int(), besoin: z.number().min(0).optional() }))
    .query(async ({ ctx, input }) => {
      const [stock] = await db
        .select({
          physique: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)::int`,
          bloque: sql<number>`COALESCE(SUM(${stocks.quantiteBloquee}), 0)::int`,
          reserve: sql<number>`COALESCE(SUM(${stocks.quantiteReservee}), 0)::int`,
        })
        .from(stocks)
        .where(and(eq(stocks.produitId, input.varianteId), eq(stocks.agenceId, ctx.user.agenceId)));
      const [encmde] = await db
        .select({ n: sql<number>`COALESCE(SUM(${achatsLignes.quantiteConvertie}), 0)::int` })
        .from(achatsLignes)
        .innerJoin(achats, eq(achats.id, achatsLignes.achatId))
        .where(and(eq(achatsLignes.produitId, input.varianteId), eq(achats.agenceId, ctx.user.agenceId), isNull(achats.dateCloture)));
      const [v] = await db
        .select({
          pointCommande: produits.pointCommande,
          stockSecurite: produits.stockSecurite,
          seuilAlerte: produits.seuilAlerte,
          qteMin: produits.qteMinCommande,
          stockMax: produits.stockMaximum,
        })
        .from(produits)
        .where(eq(produits.id, input.varianteId))
        .limit(1);
      const physique = stock?.physique ?? 0;
      const bloque = stock?.bloque ?? 0;
      const reserve = stock?.reserve ?? 0;
      const disponible = Math.max(0, physique - bloque - reserve);
      const enCommande = encmde?.n ?? 0;
      let suggestion: string | null = null;
      let besoinNet = 0;
      if (input.besoin != null) {
        besoinNet = Math.max(0, input.besoin - disponible - enCommande);
        suggestion = besoinNet === 0 ? "Stock suffisant — aucune commande nécessaire" : `Commander ${besoinNet} unité(s)`;
      } else if (v?.pointCommande != null && disponible <= v.pointCommande) {
        besoinNet = Math.max(0, (v.stockMax ?? disponible * 2) - disponible - enCommande);
        suggestion = `Sous le point de commande — commander ${besoinNet} unité(s)`;
      }
      return { physique, bloque, reserve, disponible, enCommande, affecte: reserve, pointCommande: v?.pointCommande ?? null, stockSecurite: v?.stockSecurite ?? null, seuilAlerte: v?.seuilAlerte ?? null, suggestion, besoinNet };
    }),

  // ─── Stock par lot (GF4) : détail lots + emplacements ───
  stockLots: requirePermissionProcedure("stock.consulter")
    .input(z.object({ varianteId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          lotId: stocksLots.lotId,
          numeroLot: lots.numeroLot,
          dateFabrication: lots.dateFabrication,
          datePeremption: lots.datePeremption,
          quantite: stocksLots.quantite,
          emplacementId: stocks.emplacementId,
        })
        .from(stocksLots)
        .leftJoin(lots, eq(lots.id, stocksLots.lotId))
        .leftJoin(stocks, and(eq(stocks.produitId, stocksLots.produitId), eq(stocks.lotId, stocksLots.lotId)))
        .where(and(eq(stocksLots.produitId, input.varianteId), eq(stocksLots.agenceId, ctx.user.agenceId)));
      return rows;
    }),

  // ─── Vue « où se trouve » : stock par emplacement (Rayon → Étagère → Casier) + seuils ───
  stockParEmplacement: requirePermissionProcedure("stock.consulter")
    .input(z.object({ varianteId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const emplParent = emplacements.as("parent");
      const emplGrandParent = emplacements.as("grandparent");
      const rows = await db
        .select({
          emplacementId: stocks.emplacementId,
          code: emplacements.code,
          libelle: emplacements.libelle,
          typeEmpl: emplacements.type,
          codeParent: emplParent.code,
          codeGrandParent: emplGrandParent.code,
          quantite: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)::int`,
          bloque: sql<number>`COALESCE(SUM(${stocks.quantiteBloquee}), 0)::int`,
          reserve: sql<number>`COALESCE(SUM(${stocks.quantiteReservee}), 0)::int`,
        })
        .from(stocks)
        .leftJoin(emplacements, eq(stocks.emplacementId, emplacements.id))
        .leftJoin(emplParent, eq(emplacements.parentId, emplParent.id))
        .leftJoin(emplGrandParent, eq(emplParent.parentId, emplGrandParent.id))
        .where(and(eq(stocks.produitId, input.varianteId), eq(stocks.agenceId, agenceId)))
        .groupBy(stocks.emplacementId, emplacements.code, emplacements.libelle, emplacements.type, emplParent.code, emplGrandParent.code)
        .orderBy(asc(emplacements.code));
      const lotsRows = await db
        .select({
          emplacementId: stocks.emplacementId,
          lotId: stocks.lotId,
          numeroLot: lots.numeroLot,
          quantite: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)::int`,
        })
        .from(stocks)
        .leftJoin(lots, eq(stocks.lotId, lots.id))
        .where(and(eq(stocks.produitId, input.varianteId), eq(stocks.agenceId, agenceId)))
        .groupBy(stocks.emplacementId, stocks.lotId, lots.numeroLot);
      const lotsParEmpl = new Map<number | null, { lotId: number; numeroLot: string; quantite: number }[]>();
      for (const l of lotsRows) {
        if (!l.lotId) continue;
        const arr = lotsParEmpl.get(l.emplacementId) ?? [];
        arr.push({ lotId: l.lotId, numeroLot: l.numeroLot ?? `#${l.lotId}`, quantite: l.quantite });
        lotsParEmpl.set(l.emplacementId, arr);
      }
      const [seuils] = await db
        .select({
          pointCommande: produits.pointCommande,
          stockSecurite: produits.stockSecurite,
          seuilAlerte: produits.seuilAlerte,
          stockMax: produits.stockMaximum,
          qteMin: produits.qteMinCommande,
        })
        .from(produits)
        .where(eq(produits.id, input.varianteId))
        .limit(1);
      const emplacementsOut = rows.map((r) => {
        const disponible = Math.max(0, r.quantite - r.bloque - r.reserve);
        return {
          emplacementId: r.emplacementId,
          code: r.code ?? null,
          libelle: r.libelle ?? null,
          chemin: [r.codeGrandParent, r.codeParent, r.code].filter(Boolean).join(" › ") || "Emplacement non défini",
          quantite: r.quantite,
          bloque: r.bloque,
          reserve: r.reserve,
          disponible,
          rupture: disponible === 0 && r.quantite > 0,
          lots: lotsParEmpl.get(r.emplacementId) ?? [],
        };
      });
      return {
        seuils: {
          pointCommande: seuils?.pointCommande ?? null,
          stockSecurite: seuils?.stockSecurite ?? null,
          seuilAlerte: seuils?.seuilAlerte ?? null,
          stockMax: seuils?.stockMax ?? null,
          qteMin: seuils?.qteMin ?? null,
        },
        emplacements: emplacementsOut,
      };
    }),

  // ─── Recherche unifiée (réf / texte / véhicule / caractéristiques / combiné) ───
  recherche: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      q: z.string().optional(),
      reference: z.string().optional(),
      // mode « contient » : un fragment suffit (ex. « 90915 » retrouve « 90915-YZZD1 »)
      referenceContient: z.boolean().optional(),
      referenceFournisseur: z.string().optional(),
      marqueVehicule: z.string().optional(),
      modeleVehicule: z.string().optional(),
      motorisation: z.string().optional(),
      position: z.string().optional(),
      // VIN / numéro de châssis (compatibilité véhicule)
      codeChassis: z.string().optional(),
      attributs: z.array(z.object({ cle: z.string(), valeur: z.string() })).optional(),
      limit: z.number().int().min(5).max(100).default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [];
      let exactRef: string | null = null;

      const refConds: any[] = [];
      if (safe.reference?.trim()) {
        const norm = normaliserRef(safe.reference.trim());
        if (safe.referenceContient) {
          const patt = `%${norm}%`;
          refConds.push(
            sql`lower(regexp_replace(coalesce(${produits.referencePrincipale}, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE ${patt}`,
            sql`lower(regexp_replace(coalesce(${produits.referenceFabricant}, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE ${patt}`,
            sql`lower(regexp_replace(coalesce(${produits.refOem}, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE ${patt}`,
            sql`lower(regexp_replace(coalesce(${produits.codeBarre}, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE ${patt}`,
            sql`lower(regexp_replace(coalesce(${produits.codeArticle}, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE ${patt}`,
            sql`EXISTS (SELECT 1 FROM ${produitReferences} pr WHERE pr.variante_id = ${produits.id} AND lower(regexp_replace(pr.valeur, '[^a-zA-Z0-9]', '', 'g')) LIKE ${patt})`,
            sql`EXISTS (SELECT 1 FROM ${produitReferencesEquiv} refe JOIN ${produitArticles} pa ON pa.id = refe.article_id WHERE pa.id = ${produits.articleId} AND lower(regexp_replace(refe.reference, '[^a-zA-Z0-9]', '', 'g')) LIKE ${patt})`,
          );
        } else {
          exactRef = norm;
          refConds.push(
            sql`lower(regexp_replace(coalesce(${produits.referencePrincipale}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm}`,
            sql`lower(regexp_replace(coalesce(${produits.referenceFabricant}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm}`,
            sql`lower(regexp_replace(coalesce(${produits.refOem}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm}`,
            sql`lower(regexp_replace(coalesce(${produits.codeBarre}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm}`,
            sql`lower(regexp_replace(coalesce(${produits.codeArticle}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm}`,
            sql`EXISTS (SELECT 1 FROM ${produitReferences} pr WHERE pr.variante_id = ${produits.id} AND lower(regexp_replace(pr.valeur, '[^a-zA-Z0-9]', '', 'g')) = ${norm})`,
            sql`EXISTS (SELECT 1 FROM ${produitReferencesEquiv} refe JOIN ${produitArticles} pa ON pa.id = refe.article_id WHERE pa.id = ${produits.articleId} AND lower(regexp_replace(refe.reference, '[^a-zA-Z0-9]', '', 'g')) = ${norm})`,
          );
        }
      }
      if (refConds.length) conditions.push(or(...refConds)!);

      // Réf. fournisseur (produits_fournisseurs.reference_fournisseur)
      if (safe.referenceFournisseur?.trim()) {
        const norm = normaliserRef(safe.referenceFournisseur.trim());
        conditions.push(sql`EXISTS (SELECT 1 FROM ${produitsFournisseurs} pf WHERE pf.produit_id = ${produits.id} AND lower(regexp_replace(coalesce(pf.reference_fournisseur, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm})`);
      }

      // VIN / numéro de châssis
      if (safe.codeChassis?.trim()) {
        const vin = `%${safe.codeChassis.trim().toUpperCase()}%`;
        conditions.push(sql`EXISTS (SELECT 1 FROM ${compatibilitesProduits} c WHERE (c.article_id = ${produits.articleId} OR c.produit_id = ${produits.id}) AND c.type_compat = 'POSITIVE' AND upper(coalesce(c.code_chassis, '')) LIKE ${vin})`);
      }

      if (safe.q?.trim()) {
        const q = `%${safe.q.trim()}%`;
        conditions.push(or(ilike(produits.titre, q), ilike(produits.marque, q), ilike(produitArticles.designation, q))!);
      }
      if (safe.marqueVehicule) {
        conditions.push(sql`EXISTS (SELECT 1 FROM ${compatibilitesProduits} c WHERE (c.article_id = ${produits.articleId} OR c.produit_id = ${produits.id}) AND c.type_compat = 'POSITIVE' AND c.marque ILIKE ${safe.marqueVehicule})`);
      }
      if (safe.modeleVehicule) {
        conditions.push(sql`EXISTS (SELECT 1 FROM ${compatibilitesProduits} c WHERE (c.article_id = ${produits.articleId} OR c.produit_id = ${produits.id}) AND c.type_compat = 'POSITIVE' AND c.modele ILIKE ${safe.modeleVehicule})`);
      }
      if (safe.motorisation) {
        conditions.push(sql`EXISTS (SELECT 1 FROM ${compatibilitesProduits} c WHERE (c.article_id = ${produits.articleId} OR c.produit_id = ${produits.id}) AND c.type_compat = 'POSITIVE' AND c.motorisation ILIKE ${safe.motorisation})`);
      }
      if (safe.position) {
        conditions.push(sql`((${produits.positionCote} ILIKE ${safe.position}) OR (${produits.positionEssieu} ILIKE ${safe.position}) OR (${produits.positionEmplacement} ILIKE ${safe.position}))`);
      }

      // Caractéristiques techniques (attributs) — désormais APPLIQUÉS au niveau variante OU article
      for (const a of safe.attributs ?? []) {
        if (!a.cle.trim() || !a.valeur.trim()) continue;
        const cle = a.cle.trim();
        const val = `%${a.valeur.trim().toLowerCase()}%`;
        conditions.push(sql`(EXISTS (SELECT 1 FROM ${varianteAttributs} va WHERE va.variante_id = ${produits.id} AND va.cle = ${cle} AND lower(coalesce(va.valeur, '')) LIKE ${val})
          OR EXISTS (SELECT 1 FROM ${articleAttributs} aa WHERE aa.article_id = ${produits.articleId} AND aa.cle = ${cle} AND lower(coalesce(aa.valeur, '')) LIKE ${val}))`);
      }

      const rows = await db
        .select({
          id: produits.id,
          niveau: produits.niveau,
          titre: produits.titre,
          marque: produits.marque,
          referencePrincipale: produits.referencePrincipale,
          articleId: produits.articleId,
          articleDesignation: produitArticles.designation,
          typeProduit: produitArticles.typeProduit,
          positionCote: produits.positionCote,
          positionEssieu: produits.positionEssieu,
          prixVente: produits.prixVente,
        })
        .from(produits)
        .innerJoin(produitArticles, eq(produitArticles.id, produits.articleId))
        .where(and(...conditions))
        .orderBy(exactRef ? sql`case when lower(regexp_replace(coalesce(${produits.referencePrincipale}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${exactRef} then 0 else 1 end` : asc(produits.titre))
        .limit(safe.limit);

      // Justification : stock + compatibilités matchées pour chaque résultat
      const ids = rows.map((r) => r.id);
      const stocksTot: Record<number, number> = {};
      if (ids.length) {
        const s = await db
          .select({ produitId: stocks.produitId, q: sql<number>`COALESCE(SUM(${stocks.quantite} - COALESCE(${stocks.quantiteReservee},0) - COALESCE(${stocks.quantiteBloquee},0)), 0)::int` })
          .from(stocks)
          .where(and(inArray(stocks.produitId, ids), eq(stocks.agenceId, ctx.user.agenceId)))
          .groupBy(stocks.produitId);
        for (const x of s) stocksTot[x.produitId] = x.q;
      }
      return rows.map((r) => {
        const explications: string[] = [];
        if (exactRef) {
          const curNorm = normaliserRef(r.referencePrincipale ?? "");
          explications.push(curNorm === exactRef ? `Référence exacte « ${r.referencePrincipale} »` : `Référence croisée (équivalente) « ${r.referencePrincipale ?? ""} »`);
        }
        if (safe.referenceFournisseur?.trim()) explications.push(`Référence fournisseur « ${safe.referenceFournisseur.trim()} »`);
        if (safe.q?.trim()) explications.push(`Texte « ${safe.q.trim()} » (titre / marque / désignation)`);
        if (safe.marqueVehicule || safe.modeleVehicule) {
          explications.push(`Compatible véhicule ${safe.marqueVehicule ?? ""} ${safe.modeleVehicule ?? ""}${safe.motorisation ? " · " + safe.motorisation : ""}`.trim());
        }
        if (safe.position) explications.push(`Position montage « ${safe.position} »`);
        for (const a of safe.attributs ?? []) {
          if (a.cle.trim() && a.valeur.trim()) explications.push(`Caractéristique ${a.cle.trim()}: ${a.valeur.trim()}`);
        }
        if (!explications.length) explications.push("Correspondance catalogue");
        return {
          ...r,
          stockDisponible: stocksTot[r.id] ?? 0,
          explications,
          justification: {
            reference: exactRef ? (normaliserRef(r.referencePrincipale ?? "") === exactRef ? "exacte" : "équivalente/croisée") : null,
            compat: safe.marqueVehicule ? `${safe.marqueVehicule}${safe.modeleVehicule ? " " + safe.modeleVehicule : ""}${safe.motorisation ? " · " + safe.motorisation : ""}` : null,
            position: r.positionCote && r.positionCote !== "N_A" ? `${r.positionCote}${r.positionEssieu && r.positionEssieu !== "N_A" ? " · " + r.positionEssieu : ""}` : null,
          },
        };
      });
    }),

  // ─── Détection des doublons (moteur universel, multi-critères) ───
  // 10 stratégies : réf exacte → OEM → fournisseur → réf croisée → équivalente →
  // supersession → substituable → nom similaire → marque+réf fabricant → caractéristiques.
  // AUCUNE fusion automatique (GF5) : un doublon est signalé, jamais fusionné.
  detecterDoublons: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      reference: z.string().min(1),
      nom: z.string().optional(),
      marque: z.string().optional(),
      categorieId: z.number().int().optional(),
      caracteristiques: z.array(z.object({ cle: z.string(), valeur: z.string() })).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const norm = normaliserRef(input.reference);
      const selectionVariante = {
        id: produits.id,
        titre: produits.titre,
        marque: produits.marque,
        referencePrincipale: produits.referencePrincipale,
        referenceFabricant: produits.referenceFabricant,
        refOem: produits.refOem,
        codeBarre: produits.codeBarre,
        codeArticle: produits.codeArticle,
        articleId: produits.articleId,
        articleDesignation: produitArticles.designation,
        categorieId: produitArticles.categorieId,
      };

      // 1) Référence exacte (principale, fabricant, OEM, code-barres, code article)
      const exacts = await db
        .select(selectionVariante)
        .from(produits)
        .innerJoin(produitArticles, eq(produitArticles.id, produits.articleId))
        .where(or(
          sql`lower(regexp_replace(coalesce(${produits.referencePrincipale}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm}`,
          sql`lower(regexp_replace(coalesce(${produits.referenceFabricant}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm}`,
          sql`lower(regexp_replace(coalesce(${produits.refOem}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm}`,
          sql`lower(regexp_replace(coalesce(${produits.codeBarre}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm}`,
          sql`lower(regexp_replace(coalesce(${produits.codeArticle}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm}`,
        )!);

      // 2) Référence croisée (produit_references : réf. multiples par variante) via valeur_normalisee persistée
      const croisees = await db
        .select({ ...selectionVariante, reflexValeur: produitReferences.valeur, reflexType: produitReferences.typeRef })
        .from(produitReferences)
        .innerJoin(produits, eq(produits.id, produitReferences.varianteId))
        .innerJoin(produitArticles, eq(produitArticles.id, produits.articleId))
        .where(sql`lower(coalesce(${produitReferences.valeurNormalisee}, regexp_replace(lower(${produitReferences.valeur}), '[^a-zA-Z0-9]', '', 'g'))) = ${norm}`);

      // 3) Référence fournisseur (produits_fournisseurs)
      const parFournisseur = await db
        .select({ ...selectionVariante, refFournisseur: produitsFournisseurs.referenceFournisseur, fournisseurId: produitsFournisseurs.fournisseurId })
        .from(produitsFournisseurs)
        .innerJoin(produits, eq(produits.id, produitsFournisseurs.produitId))
        .innerJoin(produitArticles, eq(produitArticles.id, produits.articleId))
        .where(sql`lower(regexp_replace(coalesce(${produitsFournisseurs.referenceFournisseur}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${norm}`);

      // 4) Référence équivalente (niveau article)
      const equivalents = await db
        .select({ id: produitReferencesEquiv.id, reference: produitReferencesEquiv.reference, articleId: produitReferencesEquiv.articleId, articleDesignation: produitArticles.designation })
        .from(produitReferencesEquiv)
        .innerJoin(produitArticles, eq(produitArticles.id, produitReferencesEquiv.articleId))
        .where(sql`lower(regexp_replace(${produitReferencesEquiv.reference}, '[^a-zA-Z0-9]', '', 'g')) = ${norm}`);

      // 5) Supersession (référence remplacée)
      const supersessions = await db
        .select()
        .from(produitSupersessions)
        .where(sql`lower(regexp_replace(${produitSupersessions.ancienneReference}, '[^a-zA-Z0-9]', '', 'g')) = ${norm}`)
        .limit(5);

      // 6) Substitution enregistrée impliquant un candidat (variant remplaçable par un autre)
      const candidatIds = new Set<number>([...exacts, ...croisees, ...parFournisseur].map((r) => r.id));
      const substitutes = candidatIds.size
        ? await db
            .select({ id: produitSubstitutions.id, varianteAId: produitSubstitutions.varianteAId, varianteBId: produitSubstitutions.varianteBId, niveauConfiance: produitSubstitutions.niveauConfiance })
            .from(produitSubstitutions)
            .where(or(
              inArray(produitSubstitutions.varianteAId, [...candidatIds]),
              inArray(produitSubstitutions.varianteBId, [...candidatIds]),
            )).limit(10)
        : [];

      // 7) Nom similaire (même catégorie + titre contenant des mots-clés du nom saisi)
      let parNom: typeof exacts = [];
      if (input.nom?.trim()) {
        const mots = input.nom.trim().toLowerCase().replace(/[-_]+/g, " ").split(/\s+/).filter((m) => m.length > 2).slice(0, 4);
        if (mots.length) {
          const conds: (ReturnType<typeof sql>)[] = mots.map((m) => sql`lower(coalesce(${produits.titre}, '')) LIKE ${`%${m}%`}`);
          conds.push(sql`lower(coalesce(${produitArticles.designation}, '')) LIKE ${`%${mots[0]}%`}`);
          parNom = await db
            .select(selectionVariante)
            .from(produits)
            .innerJoin(produitArticles, eq(produitArticles.id, produits.articleId))
            .where(and(
              input.categorieId ? eq(produitArticles.categorieId, input.categorieId) : undefined,
              or(...conds)!,
            )!);
        }
      }

      // 8) Marque + référence fabricant
      let parMarque: typeof exacts = [];
      if (input.marque?.trim() && input.reference.trim()) {
        parMarque = await db
          .select(selectionVariante)
          .from(produits)
          .innerJoin(produitArticles, eq(produitArticles.id, produits.articleId))
          .where(and(
            sql`lower(coalesce(${produits.marque}, '')) = ${input.marque.trim().toLowerCase()}`,
            sql`(lower(regexp_replace(coalesce(${produits.referenceFabricant}, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE ${`%${norm.slice(0, Math.max(4, Math.floor(norm.length * 0.6)))}%`} OR lower(regexp_replace(coalesce(${produits.referencePrincipale}, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE ${`%${norm.slice(0, Math.max(4, Math.floor(norm.length * 0.6)))}%`})`,
          )!);
      }

      // 9) Caractéristiques techniques (EAV variante OU article, même catégorie)
      let parCaracteristiques: ((typeof exacts)[number] & { critere: string })[] = [];
      const carac = (input.caracteristiques ?? []).filter((c) => c.cle.trim() && c.valeur.trim());
      if (carac.length) {
        const base = await db
          .select(selectionVariante)
          .from(produits)
          .innerJoin(produitArticles, eq(produitArticles.id, produits.articleId))
          .where(input.categorieId ? eq(produitArticles.categorieId, input.categorieId) : undefined);
        const caracParId: Map<number, string[]> = new Map();
        if (base.length) {
          const va = await db
            .select({ varianteId: varianteAttributs.varianteId, cle: varianteAttributs.cle, valeur: varianteAttributs.valeur })
            .from(varianteAttributs)
            .where(and(inArray(varianteAttributs.varianteId, base.map((b) => b.id)), inArray(varianteAttributs.cle, carac.map((c) => c.cle.trim()))));
          for (const row of va) {
            const arr = caracParId.get(row.varianteId) ?? [];
            arr.push(`${row.cle}=${row.valeur ?? ""}`);
            caracParId.set(row.varianteId, arr);
          }
        }
        for (const b of base) {
          const mailles = caracParId.get(b.id) ?? [];
          const criteres = carac.filter((c) => {
            const row = mailles.find((m) => m.startsWith(`${c.cle.trim()}=`));
            const val = row ? row.split("=").slice(1).join("=").toLowerCase() : "";
            return val && val.includes(c.valeur.trim().toLowerCase());
          });
          if (criteres.length) parCaracteristiques.push({ ...b, critere: criteres.map((c) => `${c.cle}: ${c.valeur}`).join(" · ") });
        }
      }

      // 10) Synthèse : grille de candidats dédupliqués par discipline avec scores
      const candidats = new Map<number, (typeof exacts)[number] & { raisons: string[]; criteres: string[]; strategiePrincipale: string }>();
      const ajout = (v: (typeof exacts)[number], strategie: string, raison: string, critere?: string) => {
        const ex = candidats.get(v.id);
        if (ex) {
          ex.raisons.push(raison);
          if (critere) ex.criteres.push(critere);
        } else {
          candidats.set(v.id, { ...v, raisons: [raison], criteres: critere ? [critere] : [], strategiePrincipale: strategie });
        }
      };
      for (const e of exacts) ajout(e, "reference_exacte", "Référence identique (principale, fabricant, OEM, code-barres ou code article)", e.referencePrincipale ?? e.referenceFabricant ?? e.refOem ?? e.codeBarre);
      for (const c of croisees) ajout(c, "reference_croisee", `Référence croisée ${c.reflexType ?? ""} « ${c.reflexValeur ?? ""} »`);
      for (const f of parFournisseur) ajout(f, "reference_fournisseur", `Référence fournisseur « ${f.refFournisseur ?? ""} »`);
      for (const e of equivalents) {
        const vids = await db.select({ id: produits.id }).from(produits).where(eq(produits.articleId, e.articleId)).limit(5);
        for (const v of vids) {
          const [row] = await db.select(selectionVariante).from(produits).innerJoin(produitArticles, eq(produitArticles.id, produits.articleId)).where(eq(produits.id, v.id)).limit(1);
          if (row) ajout(row, "reference_equivalente", `Référence équivalente article « ${e.reference} »`);
        }
      }
      for (const n of parNom) ajout(n, "nom_similaire", "Nom similaire dans la même catégorie");
      for (const m of parMarque) ajout(m, "marque_reference", `Même marque « ${m.marque ?? ""} » + référence proche`);
      for (const c of parCaracteristiques) ajout(c, "caracteristiques", `Caractéristiques communes : ${c.critere}`, c.critere);

      const liste = [...candidats.values()].sort((a, b) => b.raisons.length - a.raisons.length);
      const scores = liste.map((c) => {
        const s = c.raisons.length + (c.strategiePrincipale === "reference_exacte" ? 3 : 0) + (c.criteres.length > 0 ? c.criteres.length : 0);
        return { ...c, score: Math.min(10, s) };
      });
      const maxScore = scores.length ? Math.max(...scores.map((s) => s.score)) : 0;
      const probabilite = scores.length === 0 ? null
        : maxScore >= 8 ? "FORTE" : maxScore >= 4 ? "MOYENNE" : "FAIBLE";

      return {
        // Rétro-compatibilité (ancien UI)
        exacts,
        equivalents,
        supersessions: supersessions.map((s) => ({ ...s, message: `Référence remplacée — utiliser ${s.nouvelleReference}` })),
        // Nouveau moteur multi-critères
        strategies: {
          referenceExacte: exacts.length,
          referenceCroisee: croisees.length,
          referenceFournisseur: parFournisseur.length,
          referenceEquivalente: equivalents.length,
          supersessions: supersessions.length,
          nomSimilaire: parNom.length,
          marqueReference: parMarque.length,
          caracteristiques: parCaracteristiques.length,
          substitutes: substitutes.length,
        },
        candidats: scores,
        probabilite,
        note: "Aucune fusion automatique n'est jamais effectuée (GF5) : les variantes distinctes restent distinctes. Un doublon est signalé, jamais fusionné.",
      };
    }),

  // ─── Vérification avant commande (anti-commande) ───
  verifierAvantCommande: requirePermissionProcedure("stock.consulter")
    .input(z.object({ reference: z.string().min(1), besoin: z.number().min(0).optional() }))
    .query(async ({ ctx, input }) => {
      // Candidats via le moteur (exact + références croisées)
      const candidats = await db
        .select({ id: produits.id, titre: produits.titre, referencePrincipale: produits.referencePrincipale, marque: produits.marque })
        .from(produits)
        .where(or(
          sql`lower(regexp_replace(coalesce(${produits.referencePrincipale}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${normaliserRef(input.reference)}`,
          sql`lower(regexp_replace(coalesce(${produits.referenceFabricant}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${normaliserRef(input.reference)}`,
          sql`lower(regexp_replace(coalesce(${produits.codeBarre}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${normaliserRef(input.reference)}`,
        )!)
        .limit(10);
      const resultats = [];
      for (const c of candidats) {
        const [et] = await db
          .select({ physique: sql<number>`COALESCE(SUM(${stocks.quantite}),0)::int`, bloque: sql<number>`COALESCE(SUM(${stocks.quantiteBloquee}),0)::int`, reserve: sql<number>`COALESCE(SUM(${stocks.quantiteReservee}),0)::int` })
          .from(stocks)
          .where(and(eq(stocks.produitId, c.id), eq(stocks.agenceId, ctx.user.agenceId)));
        const physique = et?.physique ?? 0;
        const disponible = Math.max(0, physique - (et?.bloque ?? 0) - (et?.reserve ?? 0));
        resultats.push({ ...c, physique, bloque: et?.bloque ?? 0, reserve: et?.reserve ?? 0, disponible });
      }
      const supersessions = await db
        .select()
        .from(produitSupersessions)
        .where(sql`lower(regexp_replace(${produitSupersessions.ancienneReference}, '[^a-zA-Z0-9]', '', 'g')) = ${normaliserRef(input.reference)}`)
        .limit(5);
      const besoin = input.besoin ?? 0;
      const totalDispo = resultats.reduce((s, r) => s + r.disponible, 0);
      const decision = totalDispo >= besoin && besoin > 0 ? "Commande inutile — stock suffisant" : totalDispo > 0 ? `Commander ${Math.max(0, besoin - totalDispo)} unité(s)` : "Aucune référence en stock — commander";
      return { candidats: resultats, supersessions, decision, besoin };
    }),

  // ─── Unité à la volée ───
  createUnite: requirePermissionProcedure("stock.modifier")
    .input(z.object({ code: z.string().min(1), libelle: z.string().min(1), symbole: z.string().optional(), type: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(unitesMesure)
        .values({ code: input.code.trim().toUpperCase(), libelle: input.libelle.trim(), symbole: input.symbole ?? null, type: input.type ?? "QUANTITE", isActive: true } as any)
        .onConflictDoNothing({ target: unitesMesure.code })
        .returning({ id: unitesMesure.id });
      if (!row) {
        const [ex] = await db.select({ id: unitesMesure.id }).from(unitesMesure).where(eq(unitesMesure.code, input.code.trim().toUpperCase())).limit(1);
        return { uniteId: ex?.id };
      }
      return { uniteId: row.id };
    }),

  // ─── Emplacement à la volée (hiérarchie Magasin→Rayon→Étagère→Casier) ───
  createEmplacement: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      code: z.string().min(1),
      libelle: z.string().optional(),
      parentId: z.number().int().optional(),
      profondeur: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(emplacements)
        .values({
          agenceId: ctx.user.agenceId,
          type: "RAYON",
          code: input.code.trim().toUpperCase(),
          libelle: input.libelle ?? null,
          parentId: input.parentId ?? null,
          profondeur: input.profondeur ?? 0,
          ordre: 0,
        } as any)
        .onConflictDoNothing()
        .returning({ id: emplacements.id });
      if (!row) {
        const [ex] = await db.select({ id: emplacements.id }).from(emplacements).where(eq(emplacements.code, input.code.trim().toUpperCase())).limit(1);
        return { emplacementId: ex?.id };
      }
      return { emplacementId: row.id };
    }),

  // ─── Compatibilité véhicules d'une variante (article + variante, avec portée) ───
  compatibilitesVariante: requirePermissionProcedure("stock.consulter")
    .input(z.object({ varianteId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [prod] = await db
        .select({ articleId: produits.articleId })
        .from(produits)
        .where(eq(produits.id, input.varianteId))
        .limit(1);
      if (!prod?.articleId) return [];
      return db
        .select({
          id: compatibilitesProduits.id,
          typeCompat: compatibilitesProduits.typeCompat,
          marque: compatibilitesProduits.marque,
          modele: compatibilitesProduits.modele,
          anneeDe: compatibilitesProduits.anneeDe,
          anneeA: compatibilitesProduits.anneeA,
          motorisation: compatibilitesProduits.motorisation,
          version: compatibilitesProduits.version,
          codeMoteur: compatibilitesProduits.codeMoteur,
          codeChassis: compatibilitesProduits.codeChassis,
          position: compatibilitesProduits.position,
          portee: sql<"ARTICLE" | "VARIANTE">`CASE WHEN ${compatibilitesProduits.produitId} IS NOT NULL THEN 'VARIANTE' ELSE 'ARTICLE' END`,
        })
        .from(compatibilitesProduits)
        .where(or(eq(compatibilitesProduits.articleId, prod.articleId), eq(compatibilitesProduits.produitId, input.varianteId)))
        .orderBy(asc(compatibilitesProduits.marque));
    }),

  // ─── Unités & conversions d'une variante (bloc 3) ───
  unitesVariante: requirePermissionProcedure("stock.consulter")
    .input(z.object({ varianteId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [prod] = await db
        .select({ uniteBaseId: produits.uniteBaseId })
        .from(produits)
        .where(eq(produits.id, input.varianteId))
        .limit(1);
      const baseId = prod?.uniteBaseId ?? null;
      const rows = await db
        .select({
          id: produitUnites.id,
          uniteId: produitUnites.uniteId,
          code: unitesMesure.code,
          libelle: unitesMesure.libelle,
          symbole: unitesMesure.symbole,
          facteurVersBase: produitUnites.facteurVersBase,
          estUniteBase: produitUnites.estUniteBase,
          estUniteAchatDefaut: produitUnites.estUniteAchatDefaut,
          estUniteVenteDefaut: produitUnites.estUniteVenteDefaut,
          prixAchat: produitUnites.prixAchat,
          prixVente: produitUnites.prixVente,
          statut: produitUnites.statut,
          autoriserDeconditionnementVente: produitUnites.autoriserDeconditionnementVente,
        })
        .from(produitUnites)
        .innerJoin(unitesMesure, eq(produitUnites.uniteId, unitesMesure.id))
        .where(eq(produitUnites.produitId, input.varianteId))
        .orderBy(sql`COALESCE(${produitUnites.facteurVersBase}, 1) ASC`);
      return { baseId, unites: rows };
    }),

  ajouterUniteVariante: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      varianteId: z.number().int(),
      uniteId: z.string().uuid(),
      facteurVersBase: z.number().min(0.000001),
      prixAchat: z.number().min(0).nullable().optional(),
      prixVente: z.number().min(0).nullable().optional(),
      estUniteBase: z.boolean().optional(),
      estUniteAchatDefaut: z.boolean().optional(),
      estUniteVenteDefaut: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const duplicate = await db
        .select({ id: produitUnites.id })
        .from(produitUnites)
        .where(and(eq(produitUnites.produitId, input.varianteId), eq(produitUnites.uniteId, input.uniteId)))
        .limit(1);
      if (duplicate.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette unité est déjà associée à la variante." });
      const [row] = await db
        .insert(produitUnites)
        .values({
          produitId: input.varianteId,
          uniteId: input.uniteId,
          facteurVersBase: String(input.facteurVersBase),
          facteurVersParent: "1",
          estUniteBase: input.estUniteBase ?? false,
          estUniteAchatDefaut: input.estUniteAchatDefaut ?? false,
          estUniteVenteDefaut: input.estUniteVenteDefaut ?? false,
          prixAchat: input.prixAchat != null ? String(input.prixAchat) : null,
          prixVente: input.prixVente != null ? String(input.prixVente) : null,
          statut: "CREE",
        } as any)
        .returning({ id: produitUnites.id });
      const id = row?.id;
      if (!id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erreur lors de l'association de l'unité." });
      if (input.estUniteBase || input.estUniteAchatDefaut || input.estUniteVenteDefaut) {
        await db.transaction(async (tx) => {
          for (const [flag] of [["estUniteBase"], ["estUniteAchatDefaut"], ["estUniteVenteDefaut"]] as const) {
            if (input[flag] !== true) continue;
            await tx.update(produitUnites).set({ estUniteBase: false, estUniteAchatDefaut: false, estUniteVenteDefaut: false } as any).where(and(eq(produitUnites.produitId, input.varianteId), ne(produitUnites.id, id)));
            await tx.update(produitUnites).set({ [flag]: true } as any).where(eq(produitUnites.id, id));
          }
          if (input.estUniteBase) {
            await tx.update(produits).set({ uniteBaseId: input.uniteId } as any).where(eq(produits.id, input.varianteId));
          }
        });
      }
      return { unitesId: id };
    }),

  modifierUniteVariante: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      unitesId: z.string().uuid(),
      varianteId: z.number().int(),
      facteurVersBase: z.number().min(0.000001).optional(),
      prixAchat: z.number().min(0).nullable().optional(),
      prixVente: z.number().min(0).nullable().optional(),
      estUniteBase: z.boolean().optional(),
      estUniteAchatDefaut: z.boolean().optional(),
      estUniteVenteDefaut: z.boolean().optional(),
      autoriserDeconditionnementVente: z.boolean().optional(),
      statut: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { unitesId, varianteId, ...rest } = input;
      await db.transaction(async (tx) => {
        if (rest.estUniteBase) {
          await tx.update(produitUnites).set({ estUniteBase: false } as any).where(eq(produitUnites.produitId, varianteId));
          const [row] = await tx.select({ uniteId: produitUnites.uniteId }).from(produitUnites).where(eq(produitUnites.id, unitesId)).limit(1);
          if (row) await tx.update(produits).set({ uniteBaseId: row.uniteId } as any).where(eq(produits.id, varianteId));
        } else if (rest.estUniteBase === false) {
          const [row] = await tx.select({ uniteId: produitUnites.uniteId }).from(produitUnites).where(eq(produitUnites.id, unitesId)).limit(1);
          if (row) await tx.update(produits).set({ uniteBaseId: null } as any).where(eq(produits.id, varianteId));
        }
        if (rest.estUniteAchatDefaut === true) {
          await tx.update(produitUnites).set({ estUniteAchatDefaut: false } as any).where(eq(produitUnites.produitId, varianteId));
        }
        if (rest.estUniteVenteDefaut === true) {
          await tx.update(produitUnites).set({ estUniteVenteDefaut: false } as any).where(eq(produitUnites.produitId, varianteId));
        }
        const updates: Record<string, any> = {};
        if (rest.facteurVersBase != null) updates.facteurVersBase = String(rest.facteurVersBase);
        if (rest.prixAchat !== undefined) updates.prixAchat = rest.prixAchat != null ? String(rest.prixAchat) : null;
        if (rest.prixVente !== undefined) updates.prixVente = rest.prixVente != null ? String(rest.prixVente) : null;
        if (rest.estUniteBase != null) updates.estUniteBase = rest.estUniteBase;
        if (rest.estUniteAchatDefaut != null) updates.estUniteAchatDefaut = rest.estUniteAchatDefaut;
        if (rest.estUniteVenteDefaut != null) updates.estUniteVenteDefaut = rest.estUniteVenteDefaut;
        if (rest.autoriserDeconditionnementVente != null) updates.autoriserDeconditionnementVente = rest.autoriserDeconditionnementVente;
        if (rest.statut != null) updates.statut = rest.statut;
        if (Object.keys(updates).length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune donnée à mettre à jour." });
        await tx.update(produitUnites).set(updates).where(eq(produitUnites.id, unitesId));
      });
      return { success: true };
    }),

  supprimerUniteVariante: requirePermissionProcedure("stock.modifier")
    .input(z.object({ unitesId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .select({ estUniteBase: produitUnites.estUniteBase })
        .from(produitUnites)
        .where(eq(produitUnites.id, input.unitesId))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Unité de la variante introuvable." });
      if (row.estUniteBase) throw new TRPCError({ code: "BAD_REQUEST", message: "Impossible de supprimer l'unité de base — changez-la d'abord." });
      await db.delete(produitUnites).where(eq(produitUnites.id, input.unitesId));
      return { success: true };
    }),
});