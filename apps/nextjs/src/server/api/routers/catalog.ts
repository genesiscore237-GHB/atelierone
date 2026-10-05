import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure, stockProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, produitArticles, produits, categories, codesBarres, tarifs, auditLogs, unitesMesureProduits, stocks, produitUnites, unitesMesure, unitesDomaines, modelesEmballage, fournisseurs, produitsFournisseurs, agences, articleEquivalences, kitsLignes, mouvementsStock, emplacements, compatibilitesProduits, pretsOutils } from "@atelierone/db";
import { eq, ilike, and, desc, sql, inArray, ne, getTableColumns, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { generateBarcode, autoGenerateBarcode, ensureBarcodeSequence } from "@atelierone/db/utils";
import { appendFileSync } from "fs";
import { join } from "path";
import { listerKitLignes } from "~/server/lib/kit-service";
import { getCatalogueQualite, getQualiteDetail } from "~/server/lib/catalog-service";

const ADMIN_ROLES = ["superadmin", "directeur", "admin"];

function detectBarcodeType(v: string): string {
  if (/^\d{13}$/.test(v)) return "EAN13";
  if (/^\d{8}$/.test(v)) return "EAN8";
  return "INTERNE";
}

// Bornes de validation commune (create + update) : le type de produit doit être
// une valeur connue et le prix de vente strictement positif (0 FCFA interdit).
// PIECE = pièce de rechange · SERVICE = main d'œuvre · OUTIL = outillage prêté aux techniciens · CONSOMMABLE = huiles, EPI, fournitures
const typeProduitEnum = z.enum(["PIECE", "SERVICE", "OUTIL", "CONSOMMABLE", "EQUIPEMENT", "FOURNITURE", "KIT"]);
const prixVenteRefine = z.string().refine(v => Number(v) > 0, { message: "Le prix de vente doit être strictement positif" });
const photoDataUrl = z.string().refine(v => v.startsWith("data:image/") && v.length <= 3_000_000, { message: "Photo invalide ou trop volumineuse (max 2 Mo)" });
const photosInput = z.array(photoDataUrl).max(3, "3 photos maximum").optional();

const unitesInput = z.array(z.object({
  unite_id: z.string().min(1, "Unité requise").nullable(),
  facteur_conversion: z.number().int("Le facteur de conversion doit être un entier (RG-017)").positive("Le facteur de conversion doit être strictement positif (RG-017)").default(1),
  prix_achat: z.number().optional(),
  prix_vente: z.number().optional(),
  est_unite_achat_defaut: z.boolean().optional(),
  est_unite_vente_defaut: z.boolean().optional(),
  est_unite_base: z.boolean().optional(),
})).transform(units => units.filter(u => u.unite_id !== null && u.unite_id !== "")).superRefine((units, ctx) => {
  const bases = units.filter(u => u.est_unite_base);
  if (bases.length === 0) ctx.addIssue({ code: "custom", message: "Au moins une unité de base est requise (RG-012)" });
  if (bases.length > 1) ctx.addIssue({ code: "custom", message: "Une seule unité de base autorisée" });
  if (bases.length === 1 && bases[0].facteur_conversion !== 1) ctx.addIssue({ code: "custom", message: "L'unité de base doit avoir un facteur de conversion = 1 (RG-012)" });
  if (units.filter(u => u.est_unite_achat_defaut).length > 1) ctx.addIssue({ code: "custom", message: "Une seule unité d'achat par défaut autorisée (RG-013)" });
  if (units.filter(u => u.est_unite_vente_defaut).length > 1) ctx.addIssue({ code: "custom", message: "Une seule unité de vente par défaut autorisée (RG-014)" });
});
function formatProduct(p: typeof produits.$inferSelect) {
    return {
      id: String(p.id),
      typeProduit: p.typeProduit,
      codeBarre: p.codeBarre,
      codeArticle: p.codeArticle,
      designationCourte: p.designationCourte,
      titre: p.titre,
      editeur: p.editeur,
      etat: p.etat,
      description: p.description,
      categorieId: p.categorieId,
      fournisseurId: p.fournisseurId,
      uniteBaseId: p.uniteBaseId,
      prixVente: String(p.prixVente),
      prixMinimumVente: p.prixMinimumVente ? String(p.prixMinimumVente) : null,
      prixAchat: p.prixAchat ? String(p.prixAchat) : null,
      dernierPrixAchat: p.dernierPrixAchat ? String(p.dernierPrixAchat) : null,
      tva: String(p.tva ?? "0"),
      seuilAlerte: p.seuilAlerte,
      seuilCritique: p.seuilCritique,
      stockMaximum: p.stockMaximum,
      statutCycleVie: p.statutCycleVie,
      motifSuspension: p.motifSuspension,
      dateDiscontinuation: p.dateDiscontinuation,
      modeleEmballageId: p.modeleEmballageId,
      statut: p.statut,
      uniteVente: p.uniteVente,
      uniteAchat: p.uniteAchat,
      refOem: p.refOem,
      refAftermarket: p.refAftermarket,
      emplacementPrincipalId: p.emplacementPrincipalId,
      estReconditionnable: p.estReconditionnable,
      origineQualite: p.origineQualite,
      dlcJours: p.dlcJours,
      estCore: p.estCore,
      valeurCore: p.valeurCore,
      notes: p.notes,
      classeAbc: p.classeAbc,
      poidsKg: p.poidsKg,
      dimensions: p.dimensions,
      garantieMois: p.garantieMois,
      suiviSerie: p.suiviSerie,
      suiviLot: p.suiviLot,
    marque: p.marque,
    referenceFabricant: p.referenceFabricant,
    couleur: p.couleur,
    format: p.format,
    matiereComposition: p.matiereComposition,
    photos: p.photos ?? [],
    imageUrl: p.imageUrl,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    name: p.titre,
    title: p.titre,
    sku: p.codeBarre ?? "",
    barcode: p.codeBarre ?? "",
    defaultPrice: Number(p.prixVente),
    salePrice: Number(p.prixVente),
    purchasePrice: Number(p.prixAchat ?? 0),
    status: p.statut ?? "actif",
    categoryId: p.categorieId ? String(p.categorieId) : null,
  };
}

export const catalogRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({
      query: z.string().optional(),
      categorieId: z.string().optional(),
      statut: z.string().optional(),
      etat: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
      type: z.enum(["PIECE", "SERVICE"]).optional(),
      stockBas: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      // Les selects « Tous » du frontend envoient "all"/"__all__" : on ignore
      // ces valeurs sentinelles pour ne pas casser les filtres uuid (RG-010).
      const uuidFiltre = (v?: string) => (v && v !== "all" && v !== "__all__" ? v : undefined);
      const conditions = [
        eq(produits.isActive, true),
        // Standard : par défaut seuls les produits validés sont exploitables.
        // La page de gestion peut demander BROUILLON/SUSPENDU/... explicitement.
        eq(produits.statutCycleVie, input.statut ?? "ACTIF"),
      ];
      // TC-011 : la recherche matche aussi le code-barres (tape/scan code-barres exact)
      if (input.query) {
        const orExpr = or(ilike(produits.titre, `%${input.query}%`), ilike(produits.codeBarre, `%${input.query}%`), ilike(produits.nomCode, `%${input.query}%`));
        if (orExpr) conditions.push(orExpr);
      }
      if (uuidFiltre(input.categorieId)) conditions.push(eq(produits.categorieId, Number(uuidFiltre(input.categorieId))));
      if (input.etat) conditions.push(eq(produits.etat, input.etat));
      if (input.type) conditions.push(eq(produits.typeProduit, input.type));
      if (input.stockBas) {
        conditions.push(
          sql`(SELECT COALESCE(SUM(${stocks.quantite}), 0) FROM ${stocks} WHERE ${stocks.produitId} = ${produits.id}) < ${produits.seuilAlerte}`
        );
      }

      const rows = await db.select({
        ...getTableColumns(produits),
        totalCount: sql<number>`count(*) over()`,
      })
        .from(produits)
        .where(and(...conditions))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit)
        .orderBy(desc(produits.createdAt));
      const items = rows.map(({ totalCount, ...p }) => p);
      const total = Number(rows[0]?.totalCount ?? 0);

      const productIds = items.map(p => p.id).filter(Boolean);
      let stockMap = new Map<string, number>();
      let catMap = new Map<string, string>();
      let unitsMap = new Map<string, any[]>();

      if (productIds.length > 0) {
        const catIds = items.map(p => p.categorieId).filter((x): x is number => x !== null && x !== undefined);
        const branches: ReturnType<typeof sql>[] = [
          sql`SELECT 'stock' AS kind, s.produit_id::text AS pid, COALESCE(SUM(s.quantite), 0)::text AS v
          FROM stocks s
          WHERE s.produit_id IN (${sql.join(productIds.map(id => sql`${Number(id)}`), sql`, `)})
          GROUP BY s.produit_id`,
          ...(catIds.length > 0 ? [sql`SELECT 'cat' AS kind, c.id::text AS pid, c.nom AS v
            FROM categories c
            WHERE c.id IN (${sql.join(catIds.map(id => sql`${Number(id)}`), sql`, `)})`] : []),
          sql`SELECT 'unit' AS kind, pu.produit_id::text AS pid,
            pu.unite_id || '|' || um.libelle || '|' || COALESCE(um.symbole, '') || '|' || COALESCE(pu.facteur_vers_base::text, '1') AS v
          FROM produit_unites pu
          JOIN unites_mesure um ON um.id = pu.unite_id
          WHERE pu.statut = 'ACTIF' AND pu.produit_id IN (${sql.join(productIds.map(id => sql`${Number(id)}`), sql`, `)})`,
        ];
        const enrich = (await db.execute(sql`${sql.join(branches, sql` UNION ALL `)}`)) as unknown as { kind: string; pid: string; v: string }[];
        for (const r of enrich) {
          if (r.kind === "stock") {
            stockMap.set(r.pid, Number(r.v));
          } else if (r.kind === "cat") {
            catMap.set(r.pid, r.v);
          } else if (r.kind === "unit") {
            const [uniteId, libelle, symbole, facteur] = r.v.split("|");
            const list = unitsMap.get(r.pid) ?? [];
            list.push({ uniteId, libelle, symbole, facteurVersBase: Number(facteur ?? 1) });
            unitsMap.set(r.pid, list);
          }
        }
      }

      const result = {
        items: items.map(p => ({
          ...formatProduct(p),
          stockTotal: stockMap.get(String(p.id)) ?? 0,
          categorieNom: catMap.get(String(p.categorieId ?? "")) ?? "",
          unites: unitsMap.get(String(p.id)) ?? [],
        })),
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
      };
      return result;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const query = db.select()
        .from(produits)
        .where(eq(produits.id, input.id))
        .limit(1);
      const [item] = await query;
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      const [barres, productUnits, extras, fournisseurRows, compatibilites, stockRows] = await Promise.all([
        db.select().from(codesBarres).where(eq(codesBarres.produitId, input.id)),
        db.select().from(produitUnites)
          .where(and(eq(produitUnites.produitId, Number(input.id)), eq(produitUnites.statut, "ACTIF"))),
        db.select({
          categorieNom: categories.nom,
          fournisseurNom: fournisseurs.nom,
        })
          .from(produits)
          .leftJoin(categories, eq(categories.id, produits.categorieId))
          .leftJoin(fournisseurs, eq(fournisseurs.id, produits.fournisseurId))
          .where(eq(produits.id, input.id))
          .limit(1),
        db.select({
          id: produitsFournisseurs.id,
          fournisseurId: produitsFournisseurs.fournisseurId,
          fournisseurNom: fournisseurs.nom,
          uniteId: produitsFournisseurs.uniteId,
          referenceFournisseur: produitsFournisseurs.referenceFournisseur,
          prixAchat: produitsFournisseurs.prixAchat,
          delaiApprovisionnement: produitsFournisseurs.delaiApprovisionnement,
          estPrincipal: produitsFournisseurs.estPrincipal,
        })
          .from(produitsFournisseurs)
          .innerJoin(fournisseurs, eq(fournisseurs.id, produitsFournisseurs.fournisseurId))
          .where(and(eq(produitsFournisseurs.produitId, Number(input.id)), eq(produitsFournisseurs.isActive, true))),
        db.select()
          .from(compatibilitesProduits)
          .where(eq(compatibilitesProduits.produitId, Number(input.id))),
        db.select({ emplacementId: stocks.id, quantite: stocks.quantite, emplacementCode: emplacements.code })
          .from(stocks)
          .leftJoin(emplacements, eq(emplacements.id, stocks.emplacementId))
          .where(and(eq(stocks.produitId, Number(input.id)), eq(stocks.agenceId, ctx.user!.agenceId))),
      ]);
      return {
        ...formatProduct(item),
        codesBarres: barres,
        productUnits,
        categorieNom: extras[0]?.categorieNom ?? null,
        fournisseurNom: extras[0]?.fournisseurNom ?? null,
        fournisseurs: fournisseurRows,
        compatibilites,
        stockTotal: stockRows.reduce((s, r) => s + Number(r.quantite ?? 0), 0),
        stockParEmplacement: stockRows,
      };
    }),

  /** Compatibilités véhicule d'un produit (wireframe). */
  listCompatibilites: protectedProcedure
    .input(z.object({ produitId: z.number().int() }))
    .query(async ({ input }) => {
      return db.select()
        .from(compatibilitesProduits)
        .where(eq(compatibilitesProduits.produitId, input.produitId))
        .orderBy(compatibilitesProduits.marque);
    }),

  addCompatibilite: stockProcedure
    .input(z.object({
      produitId: z.number().int(),
      marque: z.string().min(1),
      modele: z.string().min(1),
      anneeDe: z.number().int().optional(),
      anneeA: z.number().int().optional(),
      motorisation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [existing] = await db
        .select({ id: compatibilitesProduits.id })
        .from(compatibilitesProduits)
        .where(and(
          eq(compatibilitesProduits.produitId, input.produitId),
          eq(compatibilitesProduits.marque, input.marque.trim()),
          eq(compatibilitesProduits.modele, input.modele.trim()),
          input.motorisation ? eq(compatibilitesProduits.motorisation, input.motorisation.trim()) : eq(compatibilitesProduits.motorisation, null),
        ))
        .limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Cette compatibilité existe déjà." });
      const [row] = await db.insert(compatibilitesProduits).values({
        produitId: input.produitId,
        marque: input.marque.trim(),
        modele: input.modele.trim(),
        anneeDe: input.anneeDe ?? null,
        anneeA: input.anneeA ?? null,
        motorisation: input.motorisation?.trim() || null,
      } as any).returning();
      return row;
    }),

  removeCompatibilite: stockProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await db.delete(compatibilitesProduits).where(eq(compatibilitesProduits.id, input.id));
      return { success: true };
    }),

  /** Unités de mesure disponibles (pour sorties, déconditionnements…). */
  listUnites: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const q = input?.search?.trim();
      const conditions = q
        ? [sql`(${unitesMesure.code} ILIKE ${`%${q}%`} OR ${unitesMesure.libelle} ILIKE ${`%${q}%`})`]
        : [];
      return db
        .select({ id: unitesMesure.id, code: unitesMesure.code, libelle: unitesMesure.libelle, symbole: unitesMesure.symbole, type: unitesMesure.type })
        .from(unitesMesure)
        .where(and(...conditions))
        .orderBy(unitesMesure.code);
    }),

  getByBarcode: protectedProcedure
    .input(z.object({ codeBarre: z.string() }))
    .query(async ({ input }) => {
      const [item] = await db.select()
        .from(produits)
        .where(eq(produits.codeBarre, input.codeBarre))
        .limit(1);
      if (item) return formatProduct(item);
      const [barre] = await db.select()
        .from(codesBarres)
        .where(eq(codesBarres.valeur, input.codeBarre))
        .limit(1);
      if (!barre) return null;
      const [p] = await db.select()
        .from(produits)
        .where(eq(produits.id, barre.produitId))
        .limit(1);
      return p ? formatProduct(p) : null;
    }),

  create: stockProcedure
    .input(z.object({
      codeBarre: z.string().optional(),
      nomCode: z.string().optional(),
      // Specs 02 §2.1 : code article métier unique (ex. FIL-HUI-001)
      codeArticle: z.string().optional(),
      titre: z.string().min(1),
      // Ajout rapide : stock initial à la création (le produit arrive directement en stock)
      stockInitial: z.number().min(0).optional(),
      emplacementStockId: z.number().int().optional(),
      uniteStockId: z.string().optional(),
      // Classification ABC (référentiel garage)
      classeAbc: z.enum(["A", "B", "C"]).optional(),
      // Wireframe produit : infos complémentaires
      poidsKg: z.number().min(0).optional(),
      dimensions: z.string().optional(),
      garantieMois: z.number().int().min(0).optional(),
      suiviSerie: z.boolean().optional(),
      suiviLot: z.boolean().optional(),
      referenceFournisseur: z.string().optional(),
      delaiFournisseur: z.number().int().min(0).optional(),
      // Compatibilité véhicule (wireframe)
      compatibilites: z.array(z.object({
        marque: z.string().min(1),
        modele: z.string().min(1),
        anneeDe: z.number().int().optional(),
        anneeA: z.number().int().optional(),
        motorisation: z.string().optional(),
      })).optional(),
      // Specs 02 §2.1 : désignation courte
      designationCourte: z.string().optional(),
      editeur: z.string().optional(),
      etat: z.string().default("neuf"),
      description: z.string().optional(),
      categorieId: z.string().optional(),
      fournisseurId: z.string().optional(),
      prixVente: prixVenteRefine.optional(),
      prixMinimumVente: z.string().optional(),
      prixAchat: z.string().optional(),
      tva: z.string().default("0").refine(v => Number(v) >= 0 && Number(v) <= 100, { message: "La TVA doit être comprise entre 0 et 100" }),
      seuilAlerte: z.number().default(5),
      seuilCritique: z.number().optional(),
      stockMaximum: z.number().optional().nullable(),
      statut: z.string().default("actif"),
      uniteVente: z.string().default("unite"),
      uniteAchat: z.string().default("unite"),
      typeProduit: typeProduitEnum.optional(),
      statutCycleVie: z.enum(["BROUILLON", "ACTIF", "SUSPENDU", "DISCONTINUE", "ARCHIVE"]).optional(),
      uniteBaseId: z.string().optional(),
      marque: z.string().optional(),
      // Specs 02 §2.1 : références constructeur
      referenceFabricant: z.string().optional(),
      refOem: z.string().optional(),
      refAftermarket: z.string().optional(),
      couleur: z.string().optional(),
      format: z.string().optional(),
      matiereComposition: z.string().optional(),
      // Specs 02 §2.1 : emplacement principal + reconditionnable + notes
      emplacementPrincipalId: z.number().int().optional(),
      estReconditionnable: z.boolean().default(false),
      // Specs V2 §02 : origine / qualité (Constructeur / OEM / Aftermarket / Autre)
      origineQualite: z.enum(["CONSTRUCTEUR", "OEM", "AFTERMARKET", "AUTRE"]).optional(),
      // Specs V2 §02/§05 : DLC — délai d'alerte avant péremption (jours)
      dlcJours: z.number().int().positive().optional(),
      // Specs V2 §02 règle 9 : échange standard (core) + valeur du dépôt
      estCore: z.boolean().default(false),
      valeurCore: z.number().nonnegative().optional(),
      notes: z.string().optional(),
      fournisseurs: z.array(z.object({
        fournisseurId: z.number(),
        uniteId: z.string().optional(),
        referenceFournisseur: z.string().optional(),
        prixAchat: z.string().optional(),
        delaiApprovisionnement: z.number().optional(),
        estPrincipal: z.boolean().default(false),
      })).optional(),
      unites: unitesInput,
      photos: photosInput,
    }))
    .mutation(async ({ ctx, input }) => {
      const { codeBarre: inputCodeBarre, unites, fournisseurs: inputFournisseurs, photos, ...rest } = input;
      const values: any = { ...rest };

      // OUTIL / CONSOMMABLE : pas de prix de vente requis (non vendus)
      if ((values.typeProduit === "OUTIL" || values.typeProduit === "CONSOMMABLE") && values.prixVente === undefined) {
        values.prixVente = "0";
      }

      // Un produit créé est directement exploitable par défaut (ACTIF).
      // Le flux validation BROUILLON → ACTIF reste disponible via setStatutCycleVie.
      if (!values.statutCycleVie) values.statutCycleVie = "ACTIF";

      if (values.categorieId) {
        const [cat] = await db.select({ typeBranche: categories.typeBranche, parentId: categories.parentId })
          .from(categories)
          .where(eq(categories.id, Number(values.categorieId)))
          .limit(1);
        let branche = cat?.typeBranche ?? null;
        if (!branche && cat?.parentId) {
          const [parent] = await db.select({ typeBranche: categories.typeBranche })
            .from(categories)
            .where(eq(categories.id, cat.parentId))
            .limit(1);
          branche = parent?.typeBranche ?? null;
        }
        if (branche && branche !== values.typeProduit) {
          // Référentiel garage : PIECE et CONSOMMABLE interchangeables (filtres = pièces,
          // huiles = consommables) ; SERVICE et OUTIL restent stricts.
          const interchangeable = ["PIECE", "CONSOMMABLE"];
          const ok = interchangeable.includes(branche) && interchangeable.includes(values.typeProduit);
          if (!ok) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `La catégorie choisie (${branche}) n'est pas cohérente avec le type de produit ${values.typeProduit} (RG-002)` });
          }
        }
      }

      if (inputCodeBarre) {
        const [dupBarcode] = await db.select({ id: produits.id }).from(produits).where(eq(produits.codeBarre, inputCodeBarre)).limit(1);
        if (dupBarcode) throw new TRPCError({ code: "CONFLICT", message: "Ce code-barres est déjà utilisé par un autre produit (RG-010)" });
      }

      // Specs 02 §2.1 / US1.1 : code article unique (code interne métier ex. FIL-HUI-001)
      if (values.codeArticle) {
        const [dupCodeArticle] = await db.select({ id: produits.id }).from(produits).where(eq(produits.codeArticle, values.codeArticle)).limit(1);
        if (dupCodeArticle) throw new TRPCError({ code: "CONFLICT", message: "Ce code article est déjà utilisé par un autre produit (specs : code unique)" });
      }

      // Specs : initialiser le dernier prix d'achat au premier prix d'achat saisi
      if (values.prixAchat && !values.dernierPrixAchat) {
        values.dernierPrixAchat = values.prixAchat;
      }

      let barcode = inputCodeBarre;
      if (!barcode) {
        const [agence] = await db.select({ code: agences.code }).from(agences).where(eq(agences.id, ctx.user.agenceId)).limit(1);
        const prefix = `GPJ-${(agence?.code ?? "").replace(/[^A-Za-z0-9]/g, "") || "AG"}`;
        await ensureBarcodeSequence(prefix);
        barcode = await generateBarcode(prefix);
      }
      values.codeBarre = barcode;
      values.photos = photos ?? null;
      if (values.prixAchat && !values.prixAchatReference) {
        values.prixAchatReference = values.prixAchat;
      }

      let p: typeof produits.$inferSelect;
      try {
        const result = await db.insert(produits).values(values).returning();
        p = result[0];
      } catch (err: any) {
        if (String(err.message ?? "").includes("code_barre") && String(err.message ?? "").includes("duplicate")) {
          throw new TRPCError({ code: "CONFLICT", message: "Ce code-barres est déjà utilisé par un autre produit (RG-010)" });
        }
        throw err;
      }
      if (!p) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        await db.insert(codesBarres).values({
          produitId: p.id,
          type: inputCodeBarre ? detectBarcodeType(inputCodeBarre) : "INTERNE",
          valeur: barcode,
          estDefaut: true,
        });
      } catch (err: any) {
        if (String(err.message ?? "").includes("duplicate")) {
          throw new TRPCError({ code: "CONFLICT", message: "Ce code-barres est déjà utilisé par un autre produit (RG-010)" });
        }
        throw err;
      }

      if (unites.length > 0) {
        const base = unites.find(u => u.est_unite_base);
        let basePuid: string | null = null;
        if (base) {
          const [inserted] = await db.insert(produitUnites).values({
            produitId: Number(p.id),
            uniteId: base.unite_id,
            parentId: null,
            facteurVersParent: "1",
            facteurVersBase: "1",
            prixAchat: base.prix_achat ? String(base.prix_achat) : null,
            prixVente: base.prix_vente ? String(base.prix_vente) : null,
            estUniteBase: true,
            estUniteAchatDefaut: base.est_unite_achat_defaut ?? false,
            estUniteVenteDefaut: base.est_unite_vente_defaut ?? false,
            statut: "ACTIF",
          }).returning();
          basePuid = inserted!.id;
        }
        for (const u of unites.filter(u => !u.est_unite_base)) {
          await db.insert(produitUnites).values({
            produitId: Number(p.id),
            uniteId: u.unite_id,
            parentId: basePuid,
            facteurVersParent: String(u.facteur_conversion ?? 1),
            facteurVersBase: String(u.facteur_conversion ?? 1),
            prixAchat: u.prix_achat ? String(u.prix_achat) : null,
            prixVente: u.prix_vente ? String(u.prix_vente) : null,
            estUniteBase: false,
            estUniteAchatDefaut: u.est_unite_achat_defaut ?? false,
            estUniteVenteDefaut: u.est_unite_vente_defaut ?? false,
            statut: "ACTIF",
          });
        }
      }

      if (inputFournisseurs && inputFournisseurs.length > 0) {
        for (const f of inputFournisseurs) {
          await db.insert(produitsFournisseurs).values({
            produitId: p.id,
            fournisseurId: f.fournisseurId,
            uniteId: f.uniteId || null,
            referenceFournisseur: f.referenceFournisseur || null,
            prixAchat: f.prixAchat || null,
            delaiApprovisionnement: f.delaiApprovisionnement || null,
            estPrincipal: f.estPrincipal,
          } as any);
        }
      }

      // Fournisseur principal : référence + délai (wireframe)
      if (input.fournisseurId && (input.referenceFournisseur || input.delaiFournisseur)) {
        const [pf] = await db.select({ id: produitsFournisseurs.id }).from(produitsFournisseurs)
          .where(and(eq(produitsFournisseurs.produitId, p.id), eq(produitsFournisseurs.fournisseurId, Number(input.fournisseurId)), eq(produitsFournisseurs.estPrincipal, true)))
          .limit(1);
        const pfValues = { referenceFournisseur: input.referenceFournisseur ?? null, delaiApprovisionnement: input.delaiFournisseur ?? null } as any;
        if (pf) {
          await db.update(produitsFournisseurs).set(pfValues).where(eq(produitsFournisseurs.id, pf.id));
        } else if (input.fournisseurId) {
          await db.insert(produitsFournisseurs).values({ produitId: p.id, fournisseurId: Number(input.fournisseurId), estPrincipal: true, ...pfValues } as any);
        }
      }

      // Compatibilités véhicule (wireframe)
      if (input.compatibilites && input.compatibilites.length > 0) {
        for (const c of input.compatibilites) {
          await db.insert(compatibilitesProduits).values({
            produitId: p.id,
            marque: c.marque.trim(),
            modele: c.modele.trim(),
            anneeDe: c.anneeDe ?? null,
            anneeA: c.anneeA ?? null,
            motorisation: c.motorisation?.trim() || null,
          } as any);
        }
      }

      await db.insert(auditLogs).values({
        userId: ctx.user!.id,
        action: "catalog.create",
        entityType: "produit",
        entityId: p.id,
        details: JSON.stringify({ titre: input.titre, codeBarre: barcode, prixVente: input.prixVente }),
      });

      const [updated] = await db.select()
        .from(produits)
        .where(eq(produits.id, p.id))
        .limit(1);

      // Ajout rapide : quantité initiale → le produit est directement en stock (tracé)
      if (input.stockInitial != null && input.stockInitial > 0 && p.typeProduit !== "SERVICE") {
        const emplacementFinal = input.emplacementStockId ?? p.emplacementPrincipalId ?? 2;
        const [stockRow] = await db
          .select({ id: stocks.id, quantite: stocks.quantite, cmup: stocks.coutUnitaireMoyen })
          .from(stocks)
          .where(and(eq(stocks.produitId, Number(p.id)), eq(stocks.agenceId, ctx.user!.agenceId), eq(stocks.emplacementId, emplacementFinal)))
          .limit(1);
        const stockAvant = stockRow ? Number(stockRow.quantite) : 0;
        if (stockRow) {
          await db.update(stocks).set({ quantite: String(stockAvant + input.stockInitial), coutUnitaireMoyen: input.prixAchat ? String(input.prixAchat) : stockRow.cmup }).where(eq(stocks.id, stockRow.id));
        } else {
          await db.insert(stocks).values({
            produitId: Number(p.id),
            agenceId: ctx.user!.agenceId,
            emplacementId: emplacementFinal,
            quantite: String(input.stockInitial),
            quantiteReservee: 0,
            coutUnitaireMoyen: input.prixAchat ? String(input.prixAchat) : null,
          } as any);
        }
        await db.insert(mouvementsStock).values({
          produitId: Number(p.id),
          agenceId: ctx.user!.agenceId,
          type: "AJUSTEMENT_INVENTAIRE_POSITIF",
          sens: "E",
          quantite: String(input.stockInitial),
          uniteId: input.uniteStockId || null,
          emplacementId: emplacementFinal,
          stockAvant: String(stockAvant),
          stockApres: String(stockAvant + input.stockInitial),
          coutUnitaireBase: input.prixAchat ? String(input.prixAchat) : null,
          reference: "STOCK-INITIAL",
          referenceType: "CREATION",
          documentLie: "CREATION-PRODUIT",
          motif: "Quantité initiale à la création (enregistrement progressif)",
          effectuePar: Number(ctx.user!.id),
        } as any);
      }

      return formatProduct(updated!);
    }),

  update: stockProcedure
    .input(z.object({
      id: z.string(),
      codeBarre: z.string().optional(),
      nomCode: z.string().optional(),
      // Classification ABC (référentiel garage)
      classeAbc: z.enum(["A", "B", "C"]).optional().nullable(),
      // Wireframe produit : infos complémentaires
      poidsKg: z.number().min(0).optional().nullable(),
      dimensions: z.string().optional().nullable(),
      garantieMois: z.number().int().min(0).optional().nullable(),
      suiviSerie: z.boolean().optional(),
      suiviLot: z.boolean().optional(),
      referenceFournisseur: z.string().optional(),
      delaiFournisseur: z.number().int().min(0).optional(),
      // Compatibilité véhicule (wireframe)
      compatibilites: z.array(z.object({
        marque: z.string().min(1),
        modele: z.string().min(1),
        anneeDe: z.number().int().optional(),
        anneeA: z.number().int().optional(),
        motorisation: z.string().optional(),
      })).optional(),
      // Specs 02 §2.1 : code article métier unique
      codeArticle: z.string().optional(),
      titre: z.string().optional(),
      designationCourte: z.string().optional(),
      editeur: z.string().optional(),
      etat: z.string().optional(),
      description: z.string().optional(),
      categorieId: z.string().optional(),
      fournisseurId: z.string().optional(),
      prixVente: prixVenteRefine.optional(),
      prixMinimumVente: z.string().optional(),
      prixAchat: z.string().optional(),
      tva: z.string().optional().refine(v => v === undefined || (Number(v) >= 0 && Number(v) <= 100), { message: "La TVA doit être comprise entre 0 et 100" }),
      seuilAlerte: z.number().optional(),
      seuilCritique: z.number().optional(),
      stockMaximum: z.number().optional().nullable(),
      statut: z.string().optional(),
      uniteVente: z.string().optional(),
      uniteAchat: z.string().optional(),
      photos: photosInput,
      imageUrl: z.string().optional(),
      isActive: z.boolean().optional(),
      typeProduit: typeProduitEnum.optional(),
      uniteBaseId: z.string().optional(),
      marque: z.string().optional(),
      referenceFabricant: z.string().optional(),
      refOem: z.string().optional(),
      refAftermarket: z.string().optional(),
      couleur: z.string().optional(),
      format: z.string().optional(),
      matiereComposition: z.string().optional(),
      // Specs 02 §2.1 : emplacement principal + reconditionnable + notes
      emplacementPrincipalId: z.number().int().nullable().optional(),
      estReconditionnable: z.boolean().optional(),
      // Specs V2 §02 : origine / qualité
      origineQualite: z.enum(["CONSTRUCTEUR", "OEM", "AFTERMARKET", "AUTRE"]).optional(),
      // Specs V2 §02/§05 : DLC — délai d'alerte avant péremption (jours)
      dlcJours: z.number().int().positive().optional(),
      // Specs V2 §02 règle 9 : échange standard (core) + valeur du dépôt
      estCore: z.boolean().optional(),
      valeurCore: z.number().nonnegative().optional(),
      notes: z.string().optional(),
      unites: z.array(z.object({
          unite_id: z.string().nullable(),
          facteur_conversion: z.number().optional(),
          prix_achat: z.number().optional(),
          prix_vente: z.number().optional(),
          est_unite_achat_defaut: z.boolean().optional(),
          est_unite_vente_defaut: z.boolean().optional(),
          est_unite_base: z.boolean().optional(),
        })).optional(),
      fournisseurs: z.array(z.object({
        fournisseurId: z.number(),
        uniteId: z.string().optional(),
        referenceFournisseur: z.string().optional(),
        prixAchat: z.string().optional(),
        delaiApprovisionnement: z.number().optional(),
        estPrincipal: z.boolean().default(false),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, unites, fournisseurs: inputFournisseurs, photos, codeBarre: inputCodeBarre, referenceFournisseur, delaiFournisseur, ...data } = input;

      const [old] = await db.select()
        .from(produits)
        .where(eq(produits.id, id))
        .limit(1);
      if (!old) throw new TRPCError({ code: "NOT_FOUND" });

      if (data.categorieId && String(data.categorieId) !== String(old.categorieId)) {
        const [cat] = await db.select({ typeBranche: categories.typeBranche, parentId: categories.parentId })
          .from(categories)
          .where(eq(categories.id, Number(data.categorieId)))
          .limit(1);
        let branche = cat?.typeBranche ?? null;
        if (!branche && cat?.parentId) {
          const [parent] = await db.select({ typeBranche: categories.typeBranche })
            .from(categories)
            .where(eq(categories.id, cat.parentId))
            .limit(1);
          branche = parent?.typeBranche ?? null;
        }
        if (branche && branche !== (data.typeProduit ?? old.typeProduit)) {
          // Référentiel garage : PIECE et CONSOMMABLE interchangeables
          const interchangeable = ["PIECE", "CONSOMMABLE"];
          const ok = interchangeable.includes(branche) && interchangeable.includes(data.typeProduit ?? old.typeProduit);
          if (!ok) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `La catégorie choisie (${branche}) n'est pas cohérente avec le type de produit (RG-002)` });
          }
        }
      }

      if (inputCodeBarre && inputCodeBarre !== old.codeBarre) {
        const [dupBarcode] = await db.select({ id: produits.id }).from(produits).where(and(eq(produits.codeBarre, inputCodeBarre), ne(produits.id, Number(id)))).limit(1);
        if (dupBarcode) throw new TRPCError({ code: "CONFLICT", message: "Ce code-barres est déjà utilisé par un autre produit (RG-010)" });
      }

      // Specs 02 §2.1 / US1.1 : code article unique (sauf pour ce produit)
      if (data.codeArticle && data.codeArticle !== old.codeArticle) {
        const [dupCodeArticle] = await db.select({ id: produits.id }).from(produits).where(and(eq(produits.codeArticle, data.codeArticle), ne(produits.id, Number(id)))).limit(1);
        if (dupCodeArticle) throw new TRPCError({ code: "CONFLICT", message: "Ce code article est déjà utilisé par un autre produit (specs : code unique)" });
      }

      if (photos !== undefined) (data as any).photos = photos;
      if (data.prixAchat && !(data as any).prixAchatReference) {
        (data as any).prixAchatReference = data.prixAchat;
      }
      // Specs : dernier prix d'achat mis à jour quand le prix d'achat change
      if (data.prixAchat && data.prixAchat !== old.prixAchat) {
        (data as any).dernierPrixAchat = data.prixAchat;
      }

      const result = await db.update(produits)
        .set({ ...data, updatedAt: sql`now()` })
        .where(eq(produits.id, id))
        .returning();
      const p = result[0];
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });

      if (inputCodeBarre !== undefined && inputCodeBarre !== old.codeBarre) {
        const [defaut] = await db.select().from(codesBarres)
          .where(and(eq(codesBarres.produitId, Number(id)), eq(codesBarres.estDefaut, true)))
          .limit(1);
        if (defaut) {
          await db.update(codesBarres)
            .set({ valeur: inputCodeBarre, type: inputCodeBarre ? detectBarcodeType(inputCodeBarre) : defaut.type })
            .where(eq(codesBarres.id, defaut.id));
        } else {
          await db.insert(codesBarres).values({
            produitId: Number(id),
            type: detectBarcodeType(inputCodeBarre),
            valeur: inputCodeBarre,
            estDefaut: true,
          });
        }
      }

      if (unites) {
          // Ignorer les lignes d'unités vides (unite_id null) — cohérent avec unitesInput
          unites = unites.filter(u => u.unite_id !== null && u.unite_id !== "");
          // Désactivation des unités retirées de la liste (les unités encore
          // présentes sont réactivées/upsertées ci-dessous pour respecter
          // unq_produit_unites_produit_unite)
          await db.update(produitUnites)
            .set({ statut: "INACTIF", dateFinValidite: new Date() })
            .where(and(eq(produitUnites.produitId, Number(id)), eq(produitUnites.statut, "ACTIF")));
        const base = unites.find(u => u.est_unite_base);
        let basePuid: string | null = null;
        if (base) {
          const [upserted] = await db.insert(produitUnites).values({
            produitId: Number(id),
            uniteId: base.unite_id,
            parentId: null,
            facteurVersParent: "1",
            facteurVersBase: "1",
            prixAchat: base.prix_achat ? String(base.prix_achat) : null,
            prixVente: base.prix_vente ? String(base.prix_vente) : null,
            estUniteBase: true,
            estUniteAchatDefaut: base.est_unite_achat_defaut ?? false,
            estUniteVenteDefaut: base.est_unite_vente_defaut ?? false,
            statut: "ACTIF",
          }).onConflictDoUpdate({
            target: [produitUnites.produitId, produitUnites.uniteId],
            set: {
              parentId: null,
              facteurVersParent: "1",
              facteurVersBase: "1",
              prixAchat: base.prix_achat ? String(base.prix_achat) : null,
              prixVente: base.prix_vente ? String(base.prix_vente) : null,
              estUniteBase: true,
              estUniteAchatDefaut: base.est_unite_achat_defaut ?? false,
              estUniteVenteDefaut: base.est_unite_vente_defaut ?? false,
              statut: "ACTIF",
              dateFinValidite: null,
            },
          }).returning();
          basePuid = upserted!.id;
        }
        for (const u of unites.filter(u => !u.est_unite_base)) {
          await db.insert(produitUnites).values({
            produitId: Number(id),
            uniteId: u.unite_id,
            parentId: basePuid,
            facteurVersParent: String(u.facteur_conversion ?? 1),
            facteurVersBase: String(u.facteur_conversion ?? 1),
            prixAchat: u.prix_achat ? String(u.prix_achat) : null,
            prixVente: u.prix_vente ? String(u.prix_vente) : null,
            estUniteBase: false,
            estUniteAchatDefaut: u.est_unite_achat_defaut ?? false,
            estUniteVenteDefaut: u.est_unite_vente_defaut ?? false,
            statut: "ACTIF",
          }).onConflictDoUpdate({
            target: [produitUnites.produitId, produitUnites.uniteId],
            set: {
              parentId: basePuid,
              facteurVersParent: String(u.facteur_conversion ?? 1),
              facteurVersBase: String(u.facteur_conversion ?? 1),
              prixAchat: u.prix_achat ? String(u.prix_achat) : null,
              prixVente: u.prix_vente ? String(u.prix_vente) : null,
              estUniteBase: false,
              estUniteAchatDefaut: u.est_unite_achat_defaut ?? false,
              estUniteVenteDefaut: u.est_unite_vente_defaut ?? false,
              statut: "ACTIF",
              dateFinValidite: null,
            },
          });
        }
      }

      if (inputFournisseurs !== undefined) {
        await db.delete(produitsFournisseurs).where(eq(produitsFournisseurs.produitId, Number(id)));
        if (inputFournisseurs.length > 0) {
          for (const f of inputFournisseurs) {
            await db.insert(produitsFournisseurs).values({
              produitId: Number(id),
              fournisseurId: f.fournisseurId,
              uniteId: f.uniteId || null,
              referenceFournisseur: f.referenceFournisseur || null,
              prixAchat: f.prixAchat || null,
              delaiApprovisionnement: f.delaiApprovisionnement || null,
              estPrincipal: f.estPrincipal,
            } as any);
          }
        }
      }

      // Fournisseur principal : référence + délai (wireframe)
      if (data.fournisseurId && (referenceFournisseur || delaiFournisseur)) {
        const [pf] = await db.select({ id: produitsFournisseurs.id }).from(produitsFournisseurs)
          .where(and(eq(produitsFournisseurs.produitId, Number(id)), eq(produitsFournisseurs.fournisseurId, Number(data.fournisseurId)), eq(produitsFournisseurs.estPrincipal, true)))
          .limit(1);
        const pfValues = { referenceFournisseur: referenceFournisseur ?? null, delaiApprovisionnement: delaiFournisseur ?? null } as any;
        if (pf) {
          await db.update(produitsFournisseurs).set(pfValues).where(eq(produitsFournisseurs.id, pf.id));
        } else {
          await db.insert(produitsFournisseurs).values({ produitId: Number(id), fournisseurId: Number(data.fournisseurId), estPrincipal: true, ...pfValues } as any);
        }
      }

      // Compatibilités véhicule : remplacement complet si fournies (wireframe)
      if (input.compatibilites !== undefined) {
        await db.delete(compatibilitesProduits).where(eq(compatibilitesProduits.produitId, Number(id)));
        for (const c of input.compatibilites) {
          await db.insert(compatibilitesProduits).values({
            produitId: Number(id),
            marque: c.marque.trim(),
            modele: c.modele.trim(),
            anneeDe: c.anneeDe ?? null,
            anneeA: c.anneeA ?? null,
            motorisation: c.motorisation?.trim() || null,
          } as any);
        }
      }

      await db.insert(auditLogs).values({
        userId: ctx.user!.id,
        action: "catalog.update",
        entityType: "produit",
        entityId: id,
        details: JSON.stringify({ before: old, after: p }),
      });

      return formatProduct(p);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(produits)
        .set({ isActive: false, statut: "archive", updatedAt: sql`now()` })
        .where(eq(produits.id, input.id));

      await db.insert(auditLogs).values({
        userId: ctx.user!.id,
        action: "catalog.delete",
        entityType: "produit",
        entityId: input.id,
        details: JSON.stringify({ archive: true }),
      });

      return { success: true };
    }),

  // Categories
  listCategories: protectedProcedure.query(async () => {
    const rows = await db.select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(categories.nom);

    const childrenCounts = await db.select({
      parentId: categories.parentId,
      count: sql<number>`count(*)`,
    })
      .from(categories)
      .where(and(sql`parent_id IS NOT NULL`, eq(categories.isActive, true)))
      .groupBy(categories.parentId);

    const countMap = new Map(childrenCounts.map(c => [c.parentId, Number(c.count)]));

    return rows.map(c => ({
      id: String(c.id),
      nom: c.nom,
      code: c.code,
      description: c.description,
      parentId: c.parentId ? String(c.parentId) : null,
      typeBranche: c.typeBranche,
      domaine: c.domaine,
      niveauOntologie: c.niveauOntologie,
      rendererHint: c.rendererHint,
      isActive: c.isActive,
      name: c.nom,
      childrenCount: countMap.get(c.id) ?? 0,
    }));
  }),

  getCategoryTree: protectedProcedure.query(async () => {
    const rows = await db.select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(categories.nom);

    const childrenCounts = await db.select({
      parentId: categories.parentId,
      count: sql<number>`count(*)`,
    })
      .from(categories)
      .where(sql`parent_id IS NOT NULL`)
      .groupBy(categories.parentId);

    const countMap = new Map(childrenCounts.map(c => [c.parentId, Number(c.count)]));

    const map = new Map<string, any>();
    const roots: any[] = [];

    for (const c of rows) {
      const node = {
        id: String(c.id),
        nom: c.nom,
        code: c.code,
        description: c.description,
        parentId: c.parentId,
        typeBranche: c.typeBranche,
        domaine: c.domaine,
        niveauOntologie: c.niveauOntologie,
        rendererHint: c.rendererHint,
        isActive: c.isActive,
        name: c.nom,
        childrenCount: countMap.get(c.id) ?? 0,
        children: [] as any[],
      };
      map.set(c.id, node);
    }

    for (const c of rows) {
      const node = map.get(c.id);
      if (c.parentId && map.has(c.parentId)) {
        map.get(c.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }),

  createCategory: adminProcedure
    .input(z.object({
      nom: z.string().min(1),
      code: z.string().min(1),
      description: z.string().optional(),
      parentId: z.string().optional(),
      domaine: z.string().optional(),
      niveauOntologie: z.enum(["FAMILLE", "CATEGORIE", "SOUS", "TYPE"]).optional(),
      rendererHint: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.select()
        .from(categories)
        .where(eq(categories.code, input.code))
        .limit(1);
      if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "Ce code existe déjà" });
      if (input.domaine) {
        const [dom] = await db.select({ code: unitesDomaines.code }).from(unitesDomaines).where(eq(unitesDomaines.code, input.domaine)).limit(1);
        if (!dom) throw new TRPCError({ code: "BAD_REQUEST", message: `Domaine d'unité inconnu : ${input.domaine}` });
      }
      const result = await db.insert(categories).values({
        nom: input.nom,
        code: input.code,
        description: input.description ?? null,
        parentId: input.parentId ? Number(input.parentId) : null,
        domaine: input.domaine ?? null,
        niveauOntologie: input.niveauOntologie ?? null,
        rendererHint: input.rendererHint ?? null,
      }).returning();
      const c = result[0];
      if (!c) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return {
        id: String(c.id),
        nom: c.nom,
        code: c.code,
        description: c.description,
        parentId: c.parentId,
        typeBranche: c.typeBranche,
        domaine: c.domaine,
        niveauOntologie: c.niveauOntologie,
        rendererHint: c.rendererHint,
        isActive: c.isActive,
        name: c.nom,
      };
    }),

  updateCategory: adminProcedure
    .input(z.object({
      id: z.string(),
      nom: z.string().min(1).optional(),
      code: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      parentId: z.string().nullable().optional(),
      domaine: z.string().nullable().optional(),
      niveauOntologie: z.enum(["FAMILLE", "CATEGORIE", "SOUS", "TYPE"]).nullable().optional(),
      rendererHint: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (data.code) {
        const [dup] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.code, data.code), ne(categories.id, Number(id)))).limit(1);
        if (dup) throw new TRPCError({ code: "CONFLICT", message: "Ce code existe déjà" });
      }
      if (data.parentId && String(data.parentId) === id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Une catégorie ne peut pas être son propre parent" });
      }
      if (data.domaine) {
        const [dom] = await db.select({ code: unitesDomaines.code }).from(unitesDomaines).where(eq(unitesDomaines.code, data.domaine)).limit(1);
        if (!dom) throw new TRPCError({ code: "BAD_REQUEST", message: `Domaine d'unité inconnu : ${data.domaine}` });
      }
      const set: any = { ...data, updatedAt: sql`now()` };
      if (set.parentId != null) set.parentId = Number(set.parentId);
      const result = await db.update(categories)
        .set(set)
        .where(eq(categories.id, id))
        .returning();
      const c = result[0];
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: String(c.id), nom: c.nom, code: c.code, description: c.description, parentId: c.parentId, typeBranche: c.typeBranche, domaine: c.domaine, niveauOntologie: c.niveauOntologie, rendererHint: c.rendererHint, isActive: c.isActive, name: c.nom };
    }),

  deleteCategory: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const children = await db.select()
        .from(categories)
        .where(eq(categories.parentId, input.id))
        .limit(1);
      if (children[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Supprimez d'abord les sous-catégories" });
      const products = await db.select()
        .from(produits)
        .where(eq(produits.categorieId, input.id))
        .limit(1);
      if (products[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Des produits sont liés à cette catégorie" });
      await db.update(categories).set({ isActive: false }).where(eq(categories.id, input.id));
      return { success: true };
    }),

  // Code-barres management
  listBarres: protectedProcedure
    .input(z.object({ produitId: z.string() }))
    .query(async ({ input }) => {
      return db.select()
        .from(codesBarres)
        .where(eq(codesBarres.produitId, input.produitId))
        .orderBy(desc(codesBarres.estDefaut));
    }),

  addBarcode: stockProcedure
    .input(z.object({
      produitId: z.string(),
      type: z.enum(["EAN13", "EAN8", "ISBN", "QR", "CODE128", "INTERNE", "FOURNISSEUR", "SYSTEME"]),
      valeur: z.string().min(1).max(100),
      estDefaut: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      if (input.estDefaut) {
        await db.update(codesBarres)
          .set({ estDefaut: false })
          .where(eq(codesBarres.produitId, input.produitId));
      }
      const [barre] = await db.insert(codesBarres).values(input).returning();
      if (input.estDefaut || !barre) {
        await db.update(produits)
          .set({ codeBarre: input.valeur })
          .where(eq(produits.id, input.produitId));
      }
      return barre;
    }),

  setDefaultBarcode: stockProcedure
    .input(z.object({ id: z.string(), produitId: z.string() }))
    .mutation(async ({ input }) => {
      await db.update(codesBarres)
        .set({ estDefaut: false })
        .where(eq(codesBarres.produitId, input.produitId));
      await db.update(codesBarres)
        .set({ estDefaut: true })
        .where(eq(codesBarres.id, input.id));
      const [barre] = await db.select()
        .from(codesBarres)
        .where(eq(codesBarres.id, input.id))
        .limit(1);
      if (barre) {
        await db.update(produits)
          .set({ codeBarre: barre.valeur })
          .where(eq(produits.id, input.produitId));
      }
      return { success: true };
    }),

  deleteBarcode: stockProcedure
    .input(z.object({ id: z.string(), produitId: z.string() }))
    .mutation(async ({ input }) => {
      const [barre] = await db.select()
        .from(codesBarres)
        .where(eq(codesBarres.id, input.id))
        .limit(1);
      if (barre?.estDefaut) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Impossible de supprimer le code-barres par défaut" });
      }
      await db.delete(codesBarres).where(eq(codesBarres.id, input.id));
      return { success: true };
    }),

  // Legacy compatibility
  createProduct: stockProcedure
    .input(z.object({
      name: z.string().min(1),
      sku: z.string().optional(),
      barcode: z.string().optional(),
      defaultPrice: z.number().min(0),
      isStockTracked: z.boolean().default(true),
      openingStock: z.object({
        quantity: z.number().min(0).optional(),
        siteId: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const barcode = input.barcode ?? await generateBarcode();
      const result = await db.insert(produits).values({
        titre: input.name,
        codeBarre: barcode,
        prixVente: String(input.defaultPrice),
        referenceFabricant: input.sku ?? null,
      }).returning();
      const p = result[0];
      if (!p) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (!input.barcode) {
        await ensureBarcodeSequence();
        await db.insert(codesBarres).values({
          produitId: p.id,
          type: "SYSTEME",
          valeur: barcode,
          estDefaut: true,
        });
      }
      await db.insert(auditLogs).values({
        userId: ctx.user!.id,
        action: "catalog.createProduct",
        entityType: "produit",
        entityId: p.id,
        details: JSON.stringify({ titre: input.name, codeBarre: barcode, prixVente: String(input.defaultPrice) }),
      });

      const [updated] = await db.select()
        .from(produits)
        .where(eq(produits.id, p.id))
        .limit(1);
      return formatProduct(updated!);
    }),

  listProducts: protectedProcedure
    .input(z.object({
      query: z.string().optional(),
      limit: z.number().int().max(500).default(100),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const { limit = 100, offset = 0, query } = input ?? {};
      const conditions = [eq(produits.isActive, true), eq(produits.statutCycleVie, "ACTIF")];
      const q = query?.trim();
      if (q && q.length > 0) {
        const like = `%${q}%`;
        conditions.push(sql`(${produits.titre} ILIKE ${like} OR ${produits.designationCourte} ILIKE ${like} OR ${produits.codeBarre} ILIKE ${like} OR ${produits.codeArticle} ILIKE ${like} OR ${produits.marque} ILIKE ${like} OR ${produits.referenceFabricant} ILIKE ${like} OR ${produits.nomCode} ILIKE ${like})`);
      }
      const [items, total] = await Promise.all([
        db.select()
          .from(produits)
          .where(and(...conditions))
          .orderBy(desc(produits.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)` })
          .from(produits)
          .where(and(...conditions)),
      ]);
      return { items: items.map(formatProduct), total: Number(total[0]?.count ?? 0) };
    }),


  // Tarifs
  listTarifs: protectedProcedure
    .input(z.object({ produitId: z.string() }))
    .query(async ({ input }) => {
      return db.select()
        .from(tarifs)
        .where(and(eq(tarifs.produitId, input.produitId), eq(tarifs.isActive, true)))
        .orderBy(tarifs.type);
    }),

  setTarif: stockProcedure
    .input(z.object({
      produitId: z.string(),
      type: z.enum(["public", "ecole", "grossiste", "revendeur", "partenaire", "promotionnel", "minimum_vente", "maximum_rachat"]),
      prix: z.string(),
      label: z.string().optional(),
      quantiteMin: z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      const existing = await db.select()
        .from(tarifs)
        .where(and(eq(tarifs.produitId, input.produitId), eq(tarifs.type, input.type)))
        .limit(1);
      if (existing[0]) {
        const [t] = await db.update(tarifs)
          .set({ prix: input.prix, label: input.label, quantiteMin: input.quantiteMin, updatedAt: sql`now()` })
          .where(eq(tarifs.id, existing[0].id))
          .returning();
        return t;
      }
      const [t] = await db.insert(tarifs).values({
        produitId: input.produitId,
        type: input.type,
        prix: input.prix,
        label: input.label,
        quantiteMin: input.quantiteMin,
      }).returning();
      return t;
    }),

  deleteTarif: stockProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.update(tarifs).set({ isActive: false }).where(eq(tarifs.id, input.id));
      return { success: true };
    }),

  products: protectedProcedure
    .input(z.object({
      query: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async () => {
      const items = await db.select()
        .from(produits)
        .where(and(eq(produits.isActive, true), eq(produits.statutCycleVie, "ACTIF")))
        .orderBy(desc(produits.createdAt));
      return items.map(formatProduct);
    }),

  // Lifecycle transitions
  suspendreProduit: stockProcedure
    .input(z.object({
      id: z.string(),
      motif: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [old] = await db.select().from(produits).where(eq(produits.id, input.id)).limit(1);
      if (!old) throw new TRPCError({ code: "NOT_FOUND" });
      if (old.statutCycleVie === "DISCONTINUE") throw new TRPCError({ code: "BAD_REQUEST", message: "Produit déjà discontinué" });
      const result = await db.update(produits).set({
        statutCycleVie: "SUSPENDU",
        motifSuspension: input.motif || null,
        statut: "suspendu",
        updatedAt: sql`now()`,
      }).where(eq(produits.id, input.id)).returning();
      await db.insert(auditLogs).values({
        userId: ctx.user!.id, action: "catalog.suspendre", entityType: "produit",
        entityId: input.id,
        details: JSON.stringify({ before: old, after: result[0], motif: input.motif }),
      });
      return formatProduct(result[0]!);
    }),

  activerProduit: stockProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [old] = await db.select().from(produits).where(eq(produits.id, input.id)).limit(1);
      if (!old) throw new TRPCError({ code: "NOT_FOUND" });
      const result = await db.update(produits).set({
        statutCycleVie: "ACTIF",
        motifSuspension: null,
        dateDiscontinuation: null,
        statut: "actif",
        updatedAt: sql`now()`,
      }).where(eq(produits.id, input.id)).returning();
      await db.insert(auditLogs).values({
        userId: ctx.user!.id, action: "catalog.activer", entityType: "produit",
        entityId: input.id,
        details: JSON.stringify({ before: old, after: result[0] }),
      });
      return formatProduct(result[0]!);
    }),

  discontinuerProduit: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [old] = await db.select().from(produits).where(eq(produits.id, input.id)).limit(1);
      if (!old) throw new TRPCError({ code: "NOT_FOUND" });
      const result = await db.update(produits).set({
        statutCycleVie: "DISCONTINUE",
        dateDiscontinuation: new Date(),
        isActive: false,
        statut: "archive",
        updatedAt: sql`now()`,
      }).where(eq(produits.id, input.id)).returning();
      await db.insert(auditLogs).values({
        userId: ctx.user!.id, action: "catalog.discontinuer", entityType: "produit",
        entityId: input.id,
        details: JSON.stringify({ before: old, after: result[0] }),
      });
      return formatProduct(result[0]!);
    }),

  // ─── Arbre d'emballage ───
  getArbreEmballage: protectedProcedure
    .input(z.object({ produitId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db.select({
        id: produitUnites.id,
        produitId: produitUnites.produitId,
        uniteId: produitUnites.uniteId,
        parentId: produitUnites.parentId,
        facteurVersParent: produitUnites.facteurVersParent,
        facteurVersBase: produitUnites.facteurVersBase,
        prixAchat: produitUnites.prixAchat,
        prixVente: produitUnites.prixVente,
        estUniteBase: produitUnites.estUniteBase,
        estUniteAchatDefaut: produitUnites.estUniteAchatDefaut,
        estUniteVenteDefaut: produitUnites.estUniteVenteDefaut,
        statut: produitUnites.statut,
        unite: {
          id: unitesMesure.id,
          code: unitesMesure.code,
          libelle: unitesMesure.libelle,
        },
      })
        .from(produitUnites)
        .innerJoin(unitesMesure, eq(produitUnites.uniteId, unitesMesure.id))
        .where(eq(produitUnites.produitId, Number(input.produitId)))
        .orderBy(produitUnites.createdAt);

      const map = new Map<string, any>();
      const roots: any[] = [];
      for (const r of rows) {
        map.set(r.id, { ...r, children: [] });
      }
      for (const r of rows) {
        const node = map.get(r.id);
        if (r.parentId && map.has(r.parentId)) {
          map.get(r.parentId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }
      return roots;
    }),

  setStatutCycleVie: stockProcedure
    .input(z.object({
      produitId: z.string(),
      nouveauStatut: z.enum(["BROUILLON", "ACTIF", "SUSPENDU", "DISCONTINUE", "ARCHIVE"]),
      motif: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [old] = await db.select().from(produits).where(eq(produits.id, input.produitId)).limit(1);
      if (!old) throw new TRPCError({ code: "NOT_FOUND" });

      const current = old.statutCycleVie ?? "BROUILLON";
      const allowed: Record<string, string[]> = {
        BROUILLON: ["ACTIF"],
        ACTIF: ["SUSPENDU", "DISCONTINUE"],
        SUSPENDU: ["ACTIF"],
        DISCONTINUE: ["ARCHIVE"],
        ARCHIVE: ["ACTIF"],
      };
      const next = allowed[current] ?? [];
      if (!next.includes(input.nouveauStatut)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Transition ${current} → ${input.nouveauStatut} non autorisée` });
      }

      const updates: Record<string, any> = { statutCycleVie: input.nouveauStatut, updatedAt: sql`now()` };
      if (input.nouveauStatut === "ACTIF") {
        updates.motifSuspension = null;
        updates.dateDiscontinuation = null;
        updates.isActive = true;
        updates.statut = "actif";
      } else if (input.nouveauStatut === "SUSPENDU") {
        updates.motifSuspension = input.motif || null;
        updates.statut = "suspendu";
      } else if (input.nouveauStatut === "DISCONTINUE") {
        updates.dateDiscontinuation = new Date();
        updates.isActive = false;
        updates.statut = "archive";
      } else if (input.nouveauStatut === "ARCHIVE") {
        updates.isActive = false;
        updates.statut = "archive";
      }

      const result = await db.update(produits).set(updates).where(eq(produits.id, input.produitId)).returning();
      await db.insert(auditLogs).values({
        userId: ctx.user!.id, action: `catalog.cycle.${input.nouveauStatut}`, entityType: "produit",
        entityId: input.produitId,
        details: JSON.stringify({ from: old.statutCycleVie, to: input.nouveauStatut, motif: input.motif }),
      });
      return { from: old.statutCycleVie, to: input.nouveauStatut, product: formatProduct(result[0]!) };
    }),

  addUnite: stockProcedure
    .input(z.object({
      produitId: z.string(),
      uniteId: z.string(),
      parentId: z.string().nullable().optional(),
      facteurVersParent: z.number().positive().default(1),
      prixVente: z.number().optional(),
      prixAchat: z.number().optional(),
      estUniteBase: z.boolean().default(false),
      estUniteVenteDefaut: z.boolean().default(false),
      estUniteAchatDefaut: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select()
        .from(produitUnites)
        .where(and(eq(produitUnites.produitId, Number(input.produitId)), eq(produitUnites.uniteId, input.uniteId)))
        .limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Cette unité existe déjà pour ce produit" });

      const [row] = await db.insert(produitUnites).values({
        produitId: Number(input.produitId),
        uniteId: input.uniteId,
        parentId: input.parentId || null,
        facteurVersParent: String(input.facteurVersParent),
        prixVente: input.prixVente ? String(input.prixVente) : null,
        prixAchat: input.prixAchat ? String(input.prixAchat) : null,
        estUniteBase: input.estUniteBase,
        estUniteVenteDefaut: input.estUniteVenteDefaut,
        estUniteAchatDefaut: input.estUniteAchatDefaut,
        statut: "ACTIF",
      }).returning() as any;
      return { id: String(row.id) };
    }),

  updateUnite: stockProcedure
    .input(z.object({
      id: z.string(),
      facteurVersParent: z.number().positive().optional(),
      prixVente: z.number().nullable().optional(),
      prixAchat: z.number().nullable().optional(),
      estUniteBase: z.boolean().optional(),
      estUniteVenteDefaut: z.boolean().optional(),
      estUniteAchatDefaut: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updates: Record<string, any> = {};
      if (data.facteurVersParent !== undefined) updates.facteurVersParent = String(data.facteurVersParent);
      if (data.prixVente !== undefined) updates.prixVente = data.prixVente ? String(data.prixVente) : null;
      if (data.prixAchat !== undefined) updates.prixAchat = data.prixAchat ? String(data.prixAchat) : null;
      if (data.estUniteBase !== undefined) updates.estUniteBase = data.estUniteBase;
      if (data.estUniteVenteDefaut !== undefined) updates.estUniteVenteDefaut = data.estUniteVenteDefaut;
      if (data.estUniteAchatDefaut !== undefined) updates.estUniteAchatDefaut = data.estUniteAchatDefaut;
      if (Object.keys(updates).length === 0) return { success: true };
      await db.update(produitUnites).set(updates).where(eq(produitUnites.id, id)) as any;
      return { success: true };
    }),

  deleteUnite: stockProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const [row] = await db.select().from(produitUnites).where(eq(produitUnites.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Unité introuvable" });
      const children = await db.select().from(produitUnites).where(eq(produitUnites.parentId, input.id)).limit(1);
      if (children[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Supprimez d'abord les sous-unités" });
      await db.update(produitUnites).set({ statut: "INACTIF", dateFinValidite: new Date() }).where(eq(produitUnites.id, input.id)) as any;
      return { success: true };
    }),

  // ─── Équivalences / Supersession (specs V2 §02) ───
  listEquivalences: stockProcedure
    .input(z.object({ produitId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: articleEquivalences.id,
          articleId: articleEquivalences.articleId,
          articleEquivalentId: articleEquivalences.articleEquivalentId,
          type: articleEquivalences.type,
          priorite: articleEquivalences.priorite,
          notes: articleEquivalences.notes,
          titre: produits.titre,
          codeArticle: produits.codeArticle,
          codeBarre: produits.codeBarre,
          origineQualite: produits.origineQualite,
        })
        .from(articleEquivalences)
        .innerJoin(produits, eq(articleEquivalences.articleEquivalentId, produits.id))
        .where(and(eq(articleEquivalences.agenceId, ctx.user.agenceId), eq(articleEquivalences.articleId, input.produitId)))
        .orderBy(articleEquivalences.priorite);
      return rows;
    }),

  addEquivalence: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      articleId: z.number().int(),
      articleEquivalentId: z.number().int(),
      type: z.enum(["SUPERSESSION", "INTERCHANGEABLE", "KIT_COMPOSANT"]).default("SUPERSESSION"),
      priorite: z.number().int().default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.articleId === input.articleEquivalentId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Un article ne peut pas être équivalent à lui-même." });
      }
      const [existing] = await db
        .select({ id: articleEquivalences.id })
        .from(articleEquivalences)
        .where(and(
          eq(articleEquivalences.agenceId, ctx.user.agenceId),
          eq(articleEquivalences.articleId, input.articleId),
          eq(articleEquivalences.articleEquivalentId, input.articleEquivalentId),
        ))
        .limit(1);
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette équivalence existe déjà." });
      const [row] = await db
        .insert(articleEquivalences)
        .values({
          agenceId: ctx.user.agenceId,
          articleId: input.articleId,
          articleEquivalentId: input.articleEquivalentId,
          type: input.type,
          priorite: input.priorite,
          notes: input.notes ?? null,
        } as any)
        .returning();
      return row;
    }),

  deleteEquivalence: requirePermissionProcedure("stock.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(articleEquivalences).where(eq(articleEquivalences.id, input.id));
      return { success: true };
    }),

  listKitLignes: stockProcedure
    .input(z.object({ kitId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return listerKitLignes(input.kitId);
    }),

  listKits: stockProcedure
    .query(async ({ ctx }) => {
      const rows = await db
        .select({ id: produits.id, titre: produits.titre, codeArticle: produits.codeArticle })
        .from(kitsLignes)
        .innerJoin(produits, eq(kitsLignes.kitId, produits.id))
        .groupBy(produits.id, produits.titre, produits.codeArticle)
        .orderBy(produits.titre);
      return rows;
    }),

  addKitLigne: requirePermissionProcedure("stock.modifier")
    .input(z.object({ kitId: z.number().int(), composantId: z.number().int(), quantite: z.number().positive().default(1) }))
    .mutation(async ({ ctx, input }) => {
      if (input.kitId === input.composantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Un kit ne peut pas être composant de lui-même." });
      }
      const [existing] = await db
        .select({ id: kitsLignes.id })
        .from(kitsLignes)
        .where(and(eq(kitsLignes.kitId, input.kitId), eq(kitsLignes.composantId, input.composantId)))
        .limit(1);
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce composant est déjà dans la composition du kit." });
      const composantEnKit = await listerKitLignes(input.composantId);
      if (composantEnKit.some((l) => l.composantId === input.kitId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Boucle de composition interdite (le composant est lui-même un kit contenant ce kit)." });
      }
      const [row] = await db
        .insert(kitsLignes)
        .values({ kitId: input.kitId, composantId: input.composantId, quantite: input.quantite } as any)
        .returning();
      return row;
    }),

  deleteKitLigne: requirePermissionProcedure("stock.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(kitsLignes).where(eq(kitsLignes.id, input.id));
      return { success: true };
    }),

  // ─── CAT-01 : Vue d'ensemble agrégée ───
  apercu: requirePermissionProcedure("stock.consulter").query(async ({ ctx }) => {
    const start = Date.now();

    // 1. Compteurs catalogue (exhaustifs, server-side)
    const [articleCountRes] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(produitArticles)
      .where(eq(produitArticles.isActive, true));

    const [varianteCountRes] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(produits)
      .where(and(eq(produits.isActive, true), sql`${produits.niveau} = 'VARIANTE'`));

    const [modeleCountRes] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(produits)
      .where(and(
        eq(produits.isActive, true),
        sql`${produits.typeProduit} IN ('OUTIL', 'EQUIPEMENT')`,
        sql`${produits.niveau} = 'EXEMPLAIRE'`
      ));

    const totalArticles = articleCountRes?.total ?? 0;
    const totalVariantes = varianteCountRes?.total ?? 0;
    const totalModeles = modeleCountRes?.total ?? 0;

    // 2. Qualité (service avec snapshot, TTL 10 min)
    const qualite = await getCatalogueQualite();

    // 3. Stock : articles hors stock + sous seuil + mouvements aujourd'hui
    const [horsStockRes] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(produits)
      .where(and(
        eq(produits.isActive, true),
        sql`COALESCE((SELECT SUM(s.quantite) FROM stocks s WHERE s.produit_id = ${produits.id}), 0) = 0`
      ));
    const outOfStock = horsStockRes?.total ?? 0;

    const [sousSeuilRes] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(produits)
      .where(and(
        eq(produits.isActive, true),
        sql`${produits.seuilAlerte} IS NOT NULL`,
        sql`COALESCE((SELECT SUM(s.quantite) FROM stocks s WHERE s.produit_id = ${produits.id}), 0) < ${produits.seuilAlerte}`
      ));
    const belowThreshold = sousSeuilRes?.total ?? 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [mouvementsJourRes] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(mouvementsStock)
      .where(sql`${mouvementsStock.dateMouvement} >= ${todayStart.toISOString()}`);
    const movementsToday = mouvementsJourRes?.total ?? 0;

    // 4. Outillage : prêts en retard + calibration due
    const [pretsRetardRes] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(pretsOutils)
      .where(and(
        eq(pretsOutils.actif, true),
        sql`${pretsOutils.dateRetour} < now()`
      ));
    const overdueLoans = pretsRetardRes?.total ?? 0;

    const [calibrationDueRes] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(produits)
      .where(and(
        eq(produits.isActive, true),
        sql`${produits.calibrable} = true`,
        sql`EXISTS (SELECT 1 FROM outillage_calibration oc WHERE oc.outil_id = ${produits.id} AND oc.prochaine_calibration < now())`
      ));
    const calibrationDue = calibrationDueRes?.total ?? 0;

    // 5. Répartition par type
    const typeRepRes = await db
      .select({
        type: produits.typeProduit,
        count: sql<number>`count(*)::int`,
      })
      .from(produits)
      .where(eq(produits.isActive, true))
      .groupBy(produits.typeProduit);
    const typeRepartition = typeRepRes.map(r => ({ type: r.type ?? "INCONNU", count: r.count }));

    // 6. Activité récente (derniers produits créés/modifiés)
    const recentActivity = await db
      .select({
        id: produits.id,
        titre: produits.titre,
        codeArticle: produits.codeArticle,
        typeProduit: produits.typeProduit,
        statutCycleVie: produits.statutCycleVie,
        updatedAt: produits.updatedAt,
      })
      .from(produits)
      .where(eq(produits.isActive, true))
      .orderBy(desc(produits.updatedAt))
      .limit(8);

    return {
      catalogue: {
        articles: totalArticles,
        variantes: totalVariantes,
        toolModels: totalModeles,
        toolInstances: totalModeles, // en attente distinction claire
        equipment: null as null, // En construction
        services: null as null, // En construction
      },
      quality: {
        incompleteArticles: qualite.problemes.find(p => p.code === "INCOMPLETE_ARTICLE")?.count ?? 0,
        duplicateCandidates: qualite.problemes.find(p => p.code === "DUPLICATE_CANDIDATE")?.count ?? 0,
        missingCategory: qualite.problemes.find(p => p.code === "MISSING_CATEGORY")?.count ?? 0,
        missingPrimaryReference: qualite.problemes.find(p => p.code === "MISSING_PRIMARY_REFERENCE")?.count ?? 0,
        missingBrand: qualite.problemes.find(p => p.code === "MISSING_BRAND")?.count ?? 0,
        score: qualite.score,
        generatedAt: qualite.generatedAt.toISOString(),
        problemsSummary: qualite.problemes,
      },
      stock: {
        outOfStock,
        belowThreshold,
        movementsToday,
      },
      outillage: {
        overdueLoans,
        calibrationDue,
      },
      typeRepartition,
      recentActivity,
      serverDurationMs: Date.now() - start,
    };
  }),

  // ─── CAT-01 : Drill-down qualité ───
  qualiteDetail: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      code: z.enum(["INCOMPLETE_ARTICLE", "MISSING_CATEGORY", "MISSING_BRAND", "MISSING_PRIMARY_REFERENCE", "DUPLICATE_CANDIDATE"]),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      return getQualiteDetail(input.code, input.page, input.limit);
    }),
});
