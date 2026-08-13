import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure, stockProcedure } from "~/server/api/trpc";
import { db, produits, categories, codesBarres, tarifs, auditLogs, unitesMesureProduits, stocks, produitUnites, unitesMesure, modelesEmballage, fournisseurs, ministeres, produitsFournisseurs, agences, niveaux, manuelScolaireDetail, classes, sousSystemes } from "@atelierone/db";
import { eq, ilike, and, desc, sql, inArray, ne, getTableColumns, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { generateBarcode, autoGenerateBarcode, ensureBarcodeSequence } from "@atelierone/db/utils";
import { appendFileSync } from "fs";
import { join } from "path";

const ADMIN_ROLES = ["admin_reseau", "responsable_agence"];
const SECONDARY_NIVEAU_CODES = ["SEC", "SECONDARY"];

function detectBarcodeType(v: string): string {
  if (/^97[89]\d{10}$/.test(v) || /^\d{9}[Xx]$/.test(v)) return "ISBN";
  if (/^\d{13}$/.test(v)) return "EAN13";
  if (/^\d{8}$/.test(v)) return "EAN8";
  return "INTERNE";
}

// Bornes de validation commune (create + update) : le type de produit doit être
// une valeur connue et le prix de vente strictement positif (0 FCFA interdit).
const typeProduitEnum = z.enum(["MANUEL", "FOURNITURE"]);
const prixVenteRefine = z.string().refine(v => Number(v) > 0, { message: "Le prix de vente doit être strictement positif" });
const photoDataUrl = z.string().refine(v => v.startsWith("data:image/") && v.length <= 3_000_000, { message: "Photo invalide ou trop volumineuse (max 2 Mo)" });
const photosInput = z.array(photoDataUrl).max(3, "3 photos maximum").optional();

const unitesInput = z.array(z.object({
  unite_id: z.string().min(1, "Unité requise"),
  facteur_conversion: z.number().int("Le facteur de conversion doit être un entier (RG-017)").positive("Le facteur de conversion doit être strictement positif (RG-017)").default(1),
  prix_achat: z.number().optional(),
  prix_vente: z.number().optional(),
  est_unite_achat_defaut: z.boolean().optional(),
  est_unite_vente_defaut: z.boolean().optional(),
  est_unite_base: z.boolean().optional(),
})).superRefine((units, ctx) => {
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
    isbn: p.isbn,
    titre: p.titre,
    auteur: p.auteur,
    editeur: p.editeur,
    collection: p.collection,
    niveauScolaire: p.niveauScolaire,
    matiere: p.matiere,
    langue: p.langue,
    etat: p.etat,
    description: p.description,
    categorieId: p.categorieId,
    fournisseurId: p.fournisseurId,
    sousSystemeId: p.sousSystemeId,
    niveauId: p.niveauId,
    filiereId: p.filiereId,
    classeId: p.classeId,
    matiereId: p.matiereId,
    anneeListeId: p.anneeListeId,
    ministereId: p.ministereId,
    statutOfficiel: p.statutOfficiel,
    prixReglemente: p.prixReglemente,
    prixReglementeValeur: p.prixReglementeValeur ? String(p.prixReglementeValeur) : null,
    uniteBaseId: p.uniteBaseId,
    prixVente: String(p.prixVente),
    prixMinimumVente: p.prixMinimumVente ? String(p.prixMinimumVente) : null,
    prixAchat: p.prixAchat ? String(p.prixAchat) : null,
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
    // FOURNITURE-specific
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
    author: p.auteur ?? "",
    status: p.statut ?? "actif",
    categoryId: p.categorieId ? String(p.categorieId) : null,
  };
}

export const catalogRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({
      query: z.string().optional(),
      categorieId: z.string().optional(),
      niveauScolaire: z.string().optional(),
      matiere: z.string().optional(),
      statut: z.string().optional(),
      etat: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
      type: z.enum(["MANUEL", "FOURNITURE"]).optional(),
      sousSystemeId: z.string().optional(),
      niveauId: z.string().optional(),
      filiereId: z.string().optional(),
      classeId: z.string().optional(),
      matiereId: z.string().optional(),
      anneeListeId: z.string().optional(),
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
      if (input.niveauScolaire) conditions.push(eq(produits.niveauScolaire, input.niveauScolaire));
      if (input.matiere) conditions.push(eq(produits.matiere, input.matiere));
      if (input.etat) conditions.push(eq(produits.etat, input.etat));
      if (input.type) conditions.push(eq(produits.typeProduit, input.type));
      if (uuidFiltre(input.sousSystemeId)) conditions.push(eq(produits.sousSystemeId, uuidFiltre(input.sousSystemeId)!));
      if (uuidFiltre(input.niveauId)) conditions.push(eq(produits.niveauId, uuidFiltre(input.niveauId)!));
      if (uuidFiltre(input.filiereId)) conditions.push(eq(produits.filiereId, uuidFiltre(input.filiereId)!));
      if (uuidFiltre(input.classeId)) conditions.push(eq(produits.classeId, uuidFiltre(input.classeId)!));
      if (uuidFiltre(input.matiereId)) conditions.push(eq(produits.matiereId, uuidFiltre(input.matiereId)!));
      if (uuidFiltre(input.anneeListeId)) conditions.push(eq(produits.anneeListeId, uuidFiltre(input.anneeListeId)!));
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
        const catIds = items.map(p => p.categorieId).filter(Boolean) as string[];
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
        const enrich = await db.execute(sql<{
          kind: string; pid: string; v: string;
        }[]>`${sql.join(branches, sql` UNION ALL `)}`);
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
    .query(async ({ input }) => {
      const query = db.select()
        .from(produits)
        .where(eq(produits.id, input.id))
        .limit(1);
      const [item] = await query;
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      const [barres, productUnits, extras, fournisseurRows, manuelDetail] = await Promise.all([
        db.select().from(codesBarres).where(eq(codesBarres.produitId, input.id)),
        db.select().from(produitUnites)
          .where(and(eq(produitUnites.produitId, Number(input.id)), eq(produitUnites.statut, "ACTIF"))),
        db.select({
          categorieNom: categories.nom,
          fournisseurNom: fournisseurs.nom,
          ministereNom: ministeres.libelle,
          classeNom: classes.libelle,
          sousSystemeNom: sousSystemes.libelle,
        })
          .from(produits)
          .leftJoin(categories, eq(categories.id, produits.categorieId))
          .leftJoin(fournisseurs, eq(fournisseurs.id, produits.fournisseurId))
          .leftJoin(ministeres, eq(ministeres.id, produits.ministereId))
          .leftJoin(classes, eq(classes.id, produits.classeId))
          .leftJoin(sousSystemes, eq(sousSystemes.id, produits.sousSystemeId))
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
        db.select().from(manuelScolaireDetail).where(eq(manuelScolaireDetail.produitId, Number(input.id))).limit(1),
      ]);
      return {
        ...formatProduct(item),
        codesBarres: barres,
        productUnits,
        categorieNom: extras[0]?.categorieNom ?? null,
        fournisseurNom: extras[0]?.fournisseurNom ?? null,
        ministereNom: extras[0]?.ministereNom ?? null,
        classeNom: extras[0]?.classeNom ?? null,
        sousSystemeNom: extras[0]?.sousSystemeNom ?? null,
        fournisseurs: fournisseurRows,
        manuelDetail: manuelDetail[0] ?? null,
      };
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
      isbn: z.string().optional(),
      titre: z.string().min(1),
      auteur: z.string().optional(),
      editeur: z.string().optional(),
      collection: z.string().optional(),
      niveauScolaire: z.string().optional(),
      matiere: z.string().optional(),
      langue: z.string().optional(),
      etat: z.string().default("neuf"),
      description: z.string().optional(),
      categorieId: z.string().optional(),
      fournisseurId: z.string().optional(),
      prixVente: prixVenteRefine,
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
      sousSystemeId: z.string().optional(),
      niveauId: z.string().optional(),
      filiereId: z.string().optional(),
      classeId: z.string().optional(),
      matiereId: z.string().optional(),
      anneeListeId: z.string().optional(),
      ministereId: z.string().optional(),
      prixReglemente: z.boolean().optional(),
      prixReglementeValeur: z.string().optional(),
      uniteBaseId: z.string().optional(),
      marque: z.string().optional(),
      referenceFabricant: z.string().optional(),
      couleur: z.string().optional(),
      format: z.string().optional(),
      matiereComposition: z.string().optional(),
      statutOfficiel: z.string().optional(),
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

      // Un produit créé est directement exploitable par défaut (ACTIF).
      // Le flux validation BROUILLON → ACTIF reste disponible via setStatutCycleVie.
      if (!values.statutCycleVie) values.statutCycleVie = "ACTIF";

      if (values.typeProduit === "MANUEL" && !values.prixMinimumVente) {
        values.prixMinimumVente = values.prixVente;
      }

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
          throw new TRPCError({ code: "BAD_REQUEST", message: `La catégorie choisie (${branche}) n'est pas cohérente avec le type de produit ${values.typeProduit} (RG-002)` });
        }
      }

      if (values.filiereId) {
        if (!values.niveauId) throw new TRPCError({ code: "BAD_REQUEST", message: "Une filière ne peut être sélectionnée que pour un niveau secondaire (RG-006)" });
        const [niveau] = await db.select({ code: niveaux.code }).from(niveaux).where(eq(niveaux.id, values.niveauId)).limit(1);
        if (!niveau || !SECONDARY_NIVEAU_CODES.includes(niveau.code)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Une filière ne peut être associée qu'à un niveau secondaire (RG-006)" });
        }
      }

      if (values.isbn) {
        const [dupIsbn] = await db.select({ id: produits.id }).from(produits).where(eq(produits.isbn, values.isbn)).limit(1);
        if (dupIsbn) throw new TRPCError({ code: "CONFLICT", message: "Un produit avec cet ISBN existe déjà (RG-009)" });
      }
      if (inputCodeBarre) {
        const [dupBarcode] = await db.select({ id: produits.id }).from(produits).where(eq(produits.codeBarre, inputCodeBarre)).limit(1);
        if (dupBarcode) throw new TRPCError({ code: "CONFLICT", message: "Ce code-barres est déjà utilisé par un autre produit (RG-010)" });
      }

      let barcode = inputCodeBarre;
      if (!barcode) {
        const [agence] = await db.select({ code: agences.code }).from(agences).where(eq(agences.id, ctx.user.agenceId)).limit(1);
        const prefix = `AO-${(agence?.code ?? "").replace(/[^A-Za-z0-9]/g, "") || "AG"}`;
        await ensureBarcodeSequence(prefix);
        barcode = await generateBarcode(prefix);
      }
      values.codeBarre = barcode;
      values.photos = photos ?? null;
      if (values.prixAchat && !values.prixAchatReference) {
        values.prixAchatReference = values.prixAchat;
      }
      if (values.prixReglemente && values.prixReglementeValeur && !values.prixVente) {
        values.prixVente = values.prixReglementeValeur;
      }

      let p: typeof produits.$inferSelect;
      try {
        const result = await db.insert(produits).values(values).returning();
        p = result[0];
      } catch (err: any) {
        if (String(err.message ?? "").includes("code_barre") && String(err.message ?? "").includes("duplicate")) {
          throw new TRPCError({ code: "CONFLICT", message: "Ce code-barres est déjà utilisé par un autre produit (RG-010)" });
        }
        if (String(err.message ?? "").includes("isbn") && String(err.message ?? "").includes("duplicate")) {
          throw new TRPCError({ code: "CONFLICT", message: "Un produit avec cet ISBN existe déjà (RG-009)" });
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

      if (input.typeProduit === "MANUEL") {
        await db.insert(manuelScolaireDetail).values({
          produitId: p.id,
          typeManuel: input.statutOfficiel ?? null,
          prixReglemente: input.prixReglemente ?? false,
          prixReglementeValeur: input.prixReglementeValeur ? String(input.prixReglementeValeur) : null,
          anneeImport: input.anneeListeId ?? null,
        } as any);
      }

      if (input.typeProduit === "MANUEL" && input.prixVente) {
        const prixRachat = String(Math.round(Number(input.prixVente) * 0.5 * 100) / 100);
        const [existingRachat] = await db.select().from(tarifs)
          .where(and(eq(tarifs.produitId, String(p.id)), eq(tarifs.type, "maximum_rachat")))
          .limit(1);
        if (existingRachat) {
          await db.update(tarifs).set({ prix: prixRachat }).where(eq(tarifs.id, existingRachat.id));
        } else {
          await db.insert(tarifs).values({
            produitId: String(p.id),
            type: "maximum_rachat",
            prix: prixRachat,
            label: "Rachat (50% du prix vente)",
            isActive: true,
          });
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
      return formatProduct(updated!);
    }),

  update: stockProcedure
    .input(z.object({
      id: z.string(),
      codeBarre: z.string().optional(),
      nomCode: z.string().optional(),
      isbn: z.string().optional(),
      titre: z.string().optional(),
      auteur: z.string().optional(),
      editeur: z.string().optional(),
      collection: z.string().optional(),
      niveauScolaire: z.string().optional(),
      matiere: z.string().optional(),
      langue: z.string().optional(),
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
      sousSystemeId: z.string().optional(),
      niveauId: z.string().optional(),
      filiereId: z.string().optional(),
      classeId: z.string().optional(),
      matiereId: z.string().optional(),
      anneeListeId: z.string().optional(),
      ministereId: z.string().optional(),
      prixReglemente: z.boolean().optional(),
      prixReglementeValeur: z.string().optional(),
      uniteBaseId: z.string().optional(),
      marque: z.string().optional(),
      referenceFabricant: z.string().optional(),
      couleur: z.string().optional(),
      format: z.string().optional(),
      matiereComposition: z.string().optional(),
      statutOfficiel: z.string().optional(),
      unites: z.array(z.object({
        unite_id: z.string(),
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
      const { id, unites, fournisseurs: inputFournisseurs, photos, codeBarre: inputCodeBarre, ...data } = input;

      const [old] = await db.select()
        .from(produits)
        .where(eq(produits.id, id))
        .limit(1);
      if (!old) throw new TRPCError({ code: "NOT_FOUND" });

      if (old.prixReglemente && data.prixVente && Number(data.prixVente) !== Number(old.prixVente)) {
        if (!ADMIN_ROLES.includes(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Le prix d'un produit réglementé ne peut être modifié que par un administrateur (RG-015)" });
        }
      }

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
          throw new TRPCError({ code: "BAD_REQUEST", message: `La catégorie choisie (${branche}) n'est pas cohérente avec le type de produit (RG-002)` });
        }
      }

      if (data.filiereId) {
        const niveauId = data.niveauId ?? old.niveauId;
        if (!niveauId) throw new TRPCError({ code: "BAD_REQUEST", message: "Une filière ne peut être sélectionnée que pour un niveau secondaire (RG-006)" });
        const [niveau] = await db.select({ code: niveaux.code }).from(niveaux).where(eq(niveaux.id, niveauId)).limit(1);
        if (!niveau || !SECONDARY_NIVEAU_CODES.includes(niveau.code)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Une filière ne peut être associée qu'à un niveau secondaire (RG-006)" });
        }
      }

      if (data.isbn && data.isbn !== old.isbn) {
        const [dupIsbn] = await db.select({ id: produits.id }).from(produits).where(and(eq(produits.isbn, data.isbn), ne(produits.id, Number(id)))).limit(1);
        if (dupIsbn) throw new TRPCError({ code: "CONFLICT", message: "Un produit avec cet ISBN existe déjà (RG-009)" });
      }
      if (inputCodeBarre && inputCodeBarre !== old.codeBarre) {
        const [dupBarcode] = await db.select({ id: produits.id }).from(produits).where(and(eq(produits.codeBarre, inputCodeBarre), ne(produits.id, Number(id)))).limit(1);
        if (dupBarcode) throw new TRPCError({ code: "CONFLICT", message: "Ce code-barres est déjà utilisé par un autre produit (RG-010)" });
      }

      if (data.typeProduit === "MANUEL" && data.prixVente && !data.prixMinimumVente) {
        data.prixMinimumVente = data.prixVente;
      }
      if (photos !== undefined) data.photos = photos;
      if (data.prixAchat && !data.prixAchatReference) {
        data.prixAchatReference = data.prixAchat;
      }
      if (data.prixReglemente && data.prixReglementeValeur && !data.prixVente) {
        data.prixVente = data.prixReglementeValeur;
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

      const isManuel = old?.typeProduit === "MANUEL" || input.typeProduit === "MANUEL";
      if (isManuel) {
        await db.insert(manuelScolaireDetail).values({
          produitId: Number(id),
          typeManuel: input.statutOfficiel ?? old.statutOfficiel ?? null,
          prixReglemente: data.prixReglemente ?? old.prixReglemente ?? false,
          prixReglementeValeur: data.prixReglementeValeur ?? (old.prixReglementeValeur ? String(old.prixReglementeValeur) : null),
          anneeImport: data.anneeListeId ?? old.anneeListeId ?? null,
        } as any).onConflictDoUpdate({
          target: manuelScolaireDetail.produitId,
          set: {
            typeManuel: sql`EXCLUDED.type_manuel`,
            prixReglemente: sql`EXCLUDED.prix_reglemente`,
            prixReglementeValeur: sql`EXCLUDED.prix_reglemente_valeur`,
            anneeImport: sql`EXCLUDED.annee_import`,
            updatedAt: sql`now()`,
          },
        });
      }

      if (isManuel && input.prixVente) {
        const prixRachat = String(Math.round(Number(input.prixVente) * 0.5 * 100) / 100);
        const [existingRachat] = await db.select().from(tarifs)
          .where(and(eq(tarifs.produitId, id), eq(tarifs.type, "maximum_rachat")))
          .limit(1);
        if (existingRachat) {
          await db.update(tarifs).set({ prix: prixRachat }).where(eq(tarifs.id, existingRachat.id));
        } else {
          await db.insert(tarifs).values({
            produitId: id,
            type: "maximum_rachat",
            prix: prixRachat,
            label: "Rachat (50% du prix vente)",
            isActive: true,
          });
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
    }))
    .mutation(async ({ input }) => {
      const existing = await db.select()
        .from(categories)
        .where(eq(categories.code, input.code))
        .limit(1);
      if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "Ce code existe déjà" });
      const result = await db.insert(categories).values(input).returning();
      const c = result[0];
      if (!c) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return {
        id: String(c.id),
        nom: c.nom,
        code: c.code,
        description: c.description,
        parentId: c.parentId,
        isActive: c.isActive,
        name: c.nom,
      };
    }),

  updateCategory: adminProcedure
    .input(z.object({
      id: z.string(),
      nom: z.string().min(1).optional(),
      code: z.string().min(1).optional(),
      description: z.string().optional(),
      parentId: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const result = await db.update(categories)
        .set({ ...data, updatedAt: sql`now()` })
        .where(eq(categories.id, id))
        .returning();
      const c = result[0];
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: String(c.id), nom: c.nom, code: c.code, description: c.description, parentId: c.parentId, isActive: c.isActive, name: c.nom };
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
        isbn: input.sku ?? null,
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
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const { limit = 50, offset = 0 } = input ?? {};
      const [items, total] = await Promise.all([
        db.select()
          .from(produits)
          .where(and(eq(produits.isActive, true), eq(produits.statutCycleVie, "ACTIF")))
          .orderBy(desc(produits.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)` })
          .from(produits)
          .where(and(eq(produits.isActive, true), eq(produits.statutCycleVie, "ACTIF"))),
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

  bulkImport: adminProcedure
    .input(z.object({
      items: z.array(z.object({
        titre: z.string().min(1),
        auteur: z.string().optional(),
        editeur: z.string().optional(),
        niveauScolaire: z.string().optional(),
        matiere: z.string().optional(),
        categorieCode: z.string().optional(),
      prixVente: prixVenteRefine,
        priorite: z.enum(["obligatoire", "suggere"]).default("obligatoire"),
      })).min(1).max(1000),
      nomListe: z.string().min(1),
      anneeScolaire: z.string().default("2026-2027"),
      ministere: z.enum(["MINESEC", "MINEDUB"]).default("MINESEC"),
    }))
    .mutation(async ({ input }) => {
      await ensureBarcodeSequence();
      let created = 0;
      let skipped = 0;
      const errors: { titre: string; raison: string }[] = [];

      // TC-020 : détection des doublons — intra-lot et contre le catalogue existant
      const titresUniques = [...new Set(input.items.map((i: { titre: string }) => i.titre.trim().toLowerCase()))];
      const existants = titresUniques.length
        ? await db.select({ titre: produits.titre })
          .from(produits)
          .where(inArray(sql`lower(${produits.titre})`, titresUniques))
          .limit(titresUniques.length)
        : [];
      const dejaEnBase = new Set(existants.map((p) => p.titre.toLowerCase()));
      const vus = new Set<string>();

      for (const item of input.items) {
        const titreNormalise = item.titre.trim().toLowerCase();
        let raison: string | null = null;
        if (!item.titre.trim()) raison = "Titre vide";
        else if (vus.has(titreNormalise)) raison = "Doublon dans le fichier";
        else if (dejaEnBase.has(titreNormalise)) raison = "Produit déjà existant";
        if (raison) {
          skipped++;
          errors.push({ titre: item.titre, raison });
          continue;
        }
        vus.add(titreNormalise);
        try {
          let catId: number | undefined;
          if (item.categorieCode) {
            const [existing] = await db.select()
              .from(categories)
              .where(eq(categories.code, item.categorieCode))
              .limit(1);
            if (existing) {
              catId = existing.id;
            }
          }

          const barcode = await generateBarcode();
          const [prod] = await db.insert(produits).values({
            titre: item.titre,
            auteur: item.auteur ?? null,
            editeur: item.editeur ?? null,
            niveauScolaire: item.niveauScolaire ?? null,
            matiere: item.matiere ?? null,
            prixVente: item.prixVente,
            codeBarre: barcode,
            categorieId: catId,
            statut: "actif",
          }).returning();

          if (prod) {
            await db.insert(codesBarres).values({
              produitId: prod.id,
              type: "SYSTEME",
              valeur: barcode,
              estDefaut: true,
            });
            created++;
          }
        } catch {
          skipped++;
          errors.push({ titre: item.titre, raison: "Échec d'insertion" });
        }
      }

      return { success: true, created, skipped, total: input.items.length, errors };
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
});
