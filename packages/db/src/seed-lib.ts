import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import {
  unitesMesure,
  categories,
  emplacements,
  produitArticles,
  produits,
  codesBarres,
  produitUnites,
  produitReferences,
  produitReferencesEquiv,
  compatibilitesProduits,
  produitsFournisseurs,
  lots,
  stocks,
  stocksLots,
  mouvementsStock,
  utilisateurs,
  articleAttributs,
  varianteAttributs,
} from "./schema";
import { eq, like, and, sql } from "drizzle-orm";

/** Librairie partagée des seeds de démonstration (reference / demo / scenarios). */
export const AGENCE_ID = 1;
export const DT = (s: string | Date) => (s instanceof Date ? s : new Date(s));
/** Date pure « YYYY-MM-DD » (colonnes `date`) — le driver rejette les objets Date. */
export const DSTR = (s: string | Date) => (s instanceof Date ? s.toISOString().slice(0, 10) : s);

export type Rec = Record<string, unknown>;

export async function prepare(seedLabel: string) {
  requireLocalOrForced(seedLabel);

  const adminId =
    (
      await db
        .select({ id: utilisateurs.id })
        .from(utilisateurs)
        .where(eq(utilisateurs.email, "admin@gpj.cm"))
        .limit(1)
        .catch(() => [])
    )[0]?.id ?? null;

  const units = new Map<string, string>();
  for (const r of await db.select({ id: unitesMesure.id, code: unitesMesure.code }).from(unitesMesure)) units.set(r.code, r.id);

  const addUnite = async (code: string, libelle: string, symbole: string, type: string) => {
    if (units.has(code)) return units.get(code)!;
    await db.insert(unitesMesure).values({ code, libelle, symbole, type }).onConflictDoNothing({ target: unitesMesure.code });
    const [r] = await db.select({ id: unitesMesure.id }).from(unitesMesure).where(eq(unitesMesure.code, code)).limit(1);
    if (r) units.set(code, r.id);
    return r?.id ?? "";
  };

  const cats = new Map<string, number>();
  for (const r of await db.select({ id: categories.id, code: categories.code }).from(categories)) cats.set(r.code, r.id);

  const ensureCategory = async (o: Rec) => {
    const code = o.code as string;
    const found = cats.get(code);
    if (found) return found;
    const parentId = o.parentCode ? (cats.get(o.parentCode as string) ?? null) : null;
    const [row] = await db
      .insert(categories)
      .values({
        code,
        nom: o.nom,
        parentId: parentId ?? null,
        niveauOntologie: o.niveau ?? "CATEGORIE",
        typeBranche: o.typeBranche ?? null,
        description: o.description ?? null,
        isActive: true,
      } as any)
      .onConflictDoNothing({ target: categories.code })
      .returning({ id: categories.id });
    const id = row?.id ?? (await db.select({ id: categories.id }).from(categories).where(eq(categories.code, code)).limit(1))[0]!.id;
    cats.set(code, id);
    return id;
  };

  const ensureArticle = async (o: Rec) => {
    const code = o.code as string;
    const [row] = await db
      .insert(produitArticles)
      .values({
        code,
        designation: o.designation,
        categorieId: o.categorieId ?? null,
        typeProduit: o.typeProduit ?? "PIECE",
        isActive: true,
      } as any)
      .onConflictDoNothing({ target: produitArticles.code })
      .returning({ id: produitArticles.id });
    const id = row?.id ?? (await db.select({ id: produitArticles.id }).from(produitArticles).where(eq(produitArticles.code, code)).limit(1))[0]!.id;
    return id;
  };

  const findProduitId = async (codeBarre: string) => {
    const [r] = await db.select({ id: produits.id }).from(produits).where(eq(produits.codeBarre, codeBarre)).limit(1);
    return r?.id ?? null;
  };

  const hasAnyProduct = async (prefix: string) => {
    const rows = await db.select({ cb: produits.codeBarre }).from(produits).where(like(produits.codeBarre, `${prefix}%`)).limit(1);
    return rows.length > 0;
  };

  const addCodeBarre = async (produitId: number, type: string, valeur: string, estDefaut = false) => {
    await db.insert(codesBarres).values({ produitId, type, valeur, estDefaut }).onConflictDoNothing({ target: codesBarres.valeur });
  };

  const addProduitUnite = async (produitId: number, uniteId: string, opts: Rec = {}) => {
    await db
      .insert(produitUnites)
      .values({
        produitId,
        uniteId,
        facteurVersParent: opts.facteurVersParent ?? "1",
        facteurVersBase: opts.facteurVersBase ?? "1",
        estUniteBase: opts.estUniteBase ?? true,
        estUniteAchatDefaut: opts.estUniteAchatDefaut ?? true,
        estUniteVenteDefaut: opts.estUniteVenteDefaut ?? true,
      } as any)
      .onConflictDoNothing({ target: [produitUnites.produitId, produitUnites.uniteId] });
  };

  const attachSku = async (produitId: number, sku: string, uniteId?: string) => {
    await addCodeBarre(produitId, "REFERENCE", sku, true);
    if (uniteId) await addProduitUnite(produitId, uniteId);
  };

  const addRef = async (varianteId: number, typeRef: string, valeur: string, isPrincipale = false) => {
    await db.insert(produitReferences).values({ varianteId, typeRef, valeur, isPrincipale }).onConflictDoNothing({ target: [produitReferences.varianteId, produitReferences.valeur] });
  };

  const addRefEquiv = async (articleId: number, marque: string, reference: string, note?: string) => {
    await db.insert(produitReferencesEquiv).values({ articleId, marque, reference, note: note ?? null }).onConflictDoNothing({ target: [produitReferencesEquiv.articleId, produitReferencesEquiv.reference] });
  };

  const addFournisseur = async (produitId: number, fournisseurId: number, referenceFournisseur: string, prixAchat?: string, opts: Rec = {}) => {
    await db
      .insert(produitsFournisseurs)
      .values({
        produitId,
        fournisseurId,
        uniteId: opts.uniteId ?? null,
        referenceFournisseur,
        prixAchat: prixAchat ?? null,
        delaiApprovisionnement: opts.delai ?? 5,
        estPrincipal: opts.estPrincipal ?? false,
        isActive: true,
      } as any)
      .onConflictDoNothing();
  };

  const addAttribut = async (portee: "ARTICLE" | "VARIANTE", id: number, cle: string, valeur: string, opts: Rec = {}) => {
    const tbl = portee === "ARTICLE" ? articleAttributs : varianteAttributs;
    const fk = portee === "ARTICLE" ? "articleId" : "varianteId";
    await db
      .insert(tbl)
      .values({
        [fk]: id,
        cle,
        valeur,
        ordre: opts.ordre ?? 0,
        typeAttribut: opts.typeAttribut ?? "TEXTE",
        unite: opts.unite ?? null,
        uniteId: opts.uniteId ?? null,
        portee,
        statutValeur: "RENSEIGNE",
        searchable: opts.searchable ?? true,
        filtrable: opts.filtrable ?? true,
      } as any)
      .onConflictDoNothing();
    void and;
  };

  const addCompat = async (o: Rec) => {
    await db.insert(compatibilitesProduits).values({ ...o, articleId: o.articleId ?? null, produitId: o.produitId ?? null } as any).onConflictDoNothing();
  };

  const locs = new Map<string, number>();
  const locDepths = new Map<string, number>();
  for (const r of await db.select({ id: emplacements.id, code: emplacements.code }).from(emplacements)) locs.set(r.code, r.id);

  const ensureEmplacement = async (o: Rec) => {
    const code = o.code as string;
    const found = locs.get(code);
    if (found) return { id: found, depth: locDepths.get(code) ?? 0 };
    const parentId = o.parentCode ? (locs.get(o.parentCode as string) ?? null) : null;
    const depth = parentId ? (locDepths.get(o.parentCode as string) ?? 0) + 1 : 0;
    const [row] = await db
      .insert(emplacements)
      .values({
        agenceId: AGENCE_ID,
        type: o.type ?? "RAYON",
        code,
        libelle: o.libelle,
        parentId: parentId ?? null,
        profondeur: depth,
        ordre: o.ordre ?? 0,
        isActive: true,
      } as any)
      .returning({ id: emplacements.id });
    const id = row?.id ?? (await db.select({ id: emplacements.id }).from(emplacements).where(eq(emplacements.code, code)).limit(1))[0]!.id;
    locs.set(code, id);
    locDepths.set(code, depth);
    return { id, depth };
  };

  const emplacementId = (code: string) => locs.get(code) ?? null;

  const setStock = async (produitId: number, emplacementCode: string | null, o: Rec) => {
    const emplacementIdV = emplacementCode ? locs.get(emplacementCode) ?? null : null;
    await db
      .insert(stocks)
      .values({
        produitId,
        agenceId: AGENCE_ID,
        emplacementId: emplacementIdV,
        lotId: o.lotId ?? null,
        quantite: o.quantite,
        quantiteReservee: o.reservee ?? "0",
        quantiteBloquee: o.bloquee ?? "0",
        quantiteRayon: o.rayon ?? "0",
        seuilAlerteLocal: o.seuilLocal ?? null,
        uniteReferenceId: o.uniteReferenceId ?? null,
        coutUnitaireMoyen: o.coutMoyen ?? null,
      } as any)
      .onConflictDoNothing();
    const [ex] = await db
      .select({ id: stocks.id })
      .from(stocks)
      .where(
        and(
          eq(stocks.produitId, produitId),
          eq(stocks.agenceId, AGENCE_ID),
          emplacementIdV ? eq(stocks.emplacementId, emplacementIdV) : sql`${stocks.emplacementId} is null`,
          o.lotId ? eq(stocks.lotId, o.lotId) : sql`${stocks.lotId} is null`
        )
      )
      .limit(1);
    return ex?.id ?? null;
  };

  const addLot = async (o: Rec) => {
    const produitId = o.produitId as number;
    const numeroLot = o.numeroLot as string;
    const [exists] = await db.select({ id: lots.id }).from(lots).where(and(eq(lots.produitId, produitId), eq(lots.numeroLot, numeroLot))).limit(1);
    if (exists) return exists.id;
    const [row] = await db
      .insert(lots)
      .values({
        produitId,
        numeroLot,
        fournisseurId: o.fournisseurId ?? null,
        statut: o.statut ?? "disponible",
        dateReception: o.dateReception ? DT(o.dateReception as string) : null,
        quantiteInitiale: o.quantiteInitiale ?? null,
        coutUnitaire: o.coutUnitaire ?? null,
        dateFabrication: o.dateFabrication ? DSTR(o.dateFabrication as string) : null,
        datePeremption: o.datePeremption ? DSTR(o.datePeremption as string) : null,
        provenance: o.provenance ?? null,
        qualite: o.qualite ?? null,
        fabricant: o.fabricant ?? null,
        isActive: true,
      } as any)
      .returning({ id: lots.id });
    return row!.id;
  };

  const addStockLot = async (produitId: number, lotId: number, quantite: string) => {
    await db.insert(stocksLots).values({ produitId, agenceId: AGENCE_ID, lotId, quantite }).onConflictDoNothing({ target: [stocksLots.produitId, stocksLots.agenceId, stocksLots.lotId] });
  };

  const empreinte = new Map<number, number>();
  const journal = async (produitId: number, type: string, sens: "E" | "S", quantite: number, opts: Rec = {}) => {
    const cur = empreinte.get(produitId) ?? 0;
    const delta = sens === "E" ? quantite : -quantite;
    const apres = cur + delta;
    await db
      .insert(mouvementsStock)
      .values({
        produitId,
        agenceId: AGENCE_ID,
        type,
        sens,
        quantite: String(quantite),
        uniteId: opts.uniteId ?? null,
        emplacementId: opts.emplacementId ?? null,
        lotId: opts.lotId ?? null,
        vehiculeId: opts.vehiculeId ?? null,
        stockAvant: String(cur),
        stockApres: String(apres),
        reference: opts.reference ?? "SEED-DEMO",
        commentaire: opts.motif ?? null,
        effectuePar: adminId,
        dateMouvement: DT((opts.date as string) ?? new Date().toISOString()),
      } as any)
      .onConflictDoNothing();
    empreinte.set(produitId, apres);
  };

  return {
    db,
    adminId,
    units,
    cats,
    locs,
    locDepths,
    addUnite,
    ensureCategory,
    ensureArticle,
    findProduitId,
    hasAnyProduct,
    addCodeBarre,
    addProduitUnite,
    attachSku,
    addRef,
    addRefEquiv,
    addFournisseur,
    addAttribut,
    addCompat,
    ensureEmplacement,
    emplacementId,
    setStock,
    addLot,
    addStockLot,
    journal,
  };
}