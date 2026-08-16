import { db, stocks, stocksUnites, mouvementsStock, produitUnites, unitesMesureProduits, produits } from "@atelierone/db";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

export const TYPES_MOUVEMENT = {
  ACHAT_RECEPTION: "ACHAT_RECEPTION",
  DECONDITIONNEMENT_SORTIE: "DECONDITIONNEMENT_SORTIE",
  DECONDITIONNEMENT_ENTREE: "DECONDITIONNEMENT_ENTREE",
  RECONDITIONNEMENT_SORTIE: "RECONDITIONNEMENT_SORTIE",
  RECONDITIONNEMENT_ENTREE: "RECONDITIONNEMENT_ENTREE",
  TRANSFERT_SORTIE: "TRANSFERT_SORTIE",
  TRANSFERT_ENTREE: "TRANSFERT_ENTREE",
  VENTE: "VENTE",
  RETOUR_CLIENT: "RETOUR_CLIENT",
  RETOUR_FOURNISSEUR: "RETOUR_FOURNISSEUR",
  AJUSTEMENT_INVENTAIRE_POSITIF: "AJUSTEMENT_INVENTAIRE_POSITIF",
  AJUSTEMENT_INVENTAIRE_NEGATIF: "AJUSTEMENT_INVENTAIRE_NEGATIF",
  CASSE_PERTE: "CASSE_PERTE",
  PERTE: "PERTE",
  VOL: "VOL",
  CASSE: "CASSE",
} as const;

export type TypeMouvement = (typeof TYPES_MOUVEMENT)[keyof typeof TYPES_MOUVEMENT];

export const SENS = {
  ENTREE: "E",
  SORTIE: "S",
} as const;

/** Types de mouvement exigeant un motif écrit (specs : perte / vol / casse / ajustement) */
export const MOTIF_OBLIGATOIRE_TYPES: TypeMouvement[] = [
  TYPES_MOUVEMENT.PERTE,
  TYPES_MOUVEMENT.VOL,
  TYPES_MOUVEMENT.CASSE,
  TYPES_MOUVEMENT.CASSE_PERTE,
  TYPES_MOUVEMENT.AJUSTEMENT_INVENTAIRE_NEGATIF,
  TYPES_MOUVEMENT.AJUSTEMENT_INVENTAIRE_POSITIF,
];

type MouvementParams = {
  type: TypeMouvement;
  sens: "E" | "S";
  produitId: number;
  agenceId: number;
  quantite: number | string;
  uniteId?: string;
  emplacementId?: number;
  lotId?: number;
  coutUnitaireBase?: number | string;
  groupeOperationId?: string;
  reference?: string;
  referenceType?: string;
  documentLie?: string;
  motif?: string;
  commentaire?: string;
  effectuePar?: number;
  validePar?: number;
  audit?: boolean;
};

async function verifierStockDisponible(
  tx: Tx,
  produitId: number,
  agenceId: number,
  quantite: number,
  emplacementId?: number,
  lotId?: number,
) {
  const where = and(
    eq(stocks.produitId, produitId),
    eq(stocks.agenceId, agenceId),
    emplacementId ? eq(stocks.emplacementId, emplacementId) : undefined,
    lotId ? eq(stocks.lotId, lotId) : undefined,
  );
  const [row] = await tx
    .select({ id: stocks.id, quantite: stocks.quantite, cmup: stocks.coutUnitaireMoyen })
    .from(stocks)
    .where(where)
    .for("update");
  return row;
}

async function getCoutUnitaireMoyen(tx: Tx, produitId: number, agenceId: number): Promise<string | null> {
  const [row] = await tx
    .select({ cmup: stocks.coutUnitaireMoyen })
    .from(stocks)
    .where(and(eq(stocks.produitId, produitId), eq(stocks.agenceId, agenceId)))
    .limit(1);
  return row?.cmup ?? null;
}

export async function enregistrerMouvement(tx: Tx, params: MouvementParams) {
  const qte = Number(params.quantite);

  // Règle métier (specs 05 §3) : motif obligatoire pour perte / vol / casse / ajustement
  if (
    MOTIF_OBLIGATOIRE_TYPES.includes(params.type) &&
    (!params.motif || params.motif.trim().length < 3)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Motif obligatoire (min. 3 caractères) pour le type de mouvement « ${params.type} ».`,
    });
  }

  const stockRow = await verifierStockDisponible(
    tx, params.produitId, params.agenceId,
    qte, params.emplacementId, params.lotId,
  );
  const stockAvant = stockRow ? Number(stockRow.quantite) : 0;

  if (params.sens === "S" && stockAvant < qte) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Stock insuffisant: ${stockAvant} < ${qte} (produit ${params.produitId})`,
    });
  }

  const stockApres = params.sens === "E" ? stockAvant + qte : stockAvant - qte;

  if (params.sens === "E") {
    const [prod] = await tx
      .select({ stockMaximum: produits.stockMaximum })
      .from(produits)
      .where(eq(produits.id, params.produitId))
      .limit(1);
    if (prod?.stockMaximum && stockApres > prod.stockMaximum) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Stock maximum dépassé: ${stockApres} > ${prod.stockMaximum} (produit ${params.produitId})`,
      });
    }
  }

  const [mvt] = params.audit === false
    ? [{ id: null }]
    : await tx
    .insert(mouvementsStock)
    .values({
      produitId: params.produitId,
      agenceId: params.agenceId,
      type: params.type,
      sens: params.sens,
      quantite: String(qte),
      uniteId: params.uniteId || null,
      emplacementId: params.emplacementId || null,
      lotId: params.lotId || null,
      coutUnitaireBase: params.coutUnitaireBase ? String(params.coutUnitaireBase) : null,
      stockAvant: String(stockAvant),
      stockApres: String(stockApres),
      groupeOperationId: params.groupeOperationId || null,
      reference: params.reference || null,
      referenceType: params.referenceType || null,
      documentLie: params.documentLie || null,
      motif: params.motif || null,
      commentaire: params.commentaire || null,
      effectuePar: params.effectuePar || null,
      validePar: params.validePar || null,
    } as any);

  if (stockRow) {
    const updateData: any = { quantite: String(stockApres) };
    if (params.sens === "E" && params.coutUnitaireBase) {
      const cmupActuel = stockRow.cmup ? Number(stockRow.cmup) : 0;
      updateData.coutUnitaireMoyen = String(
        stockAvant > 0
          ? (stockAvant * cmupActuel + qte * Number(params.coutUnitaireBase)) / stockApres
          : Number(params.coutUnitaireBase)
      );
    }
    await tx.update(stocks).set(updateData).where(eq(stocks.id, stockRow.id)) as any;
  } else {
    await tx.insert(stocks).values({
      produitId: params.produitId,
      agenceId: params.agenceId,
      quantite: String(stockApres),
      emplacementId: params.emplacementId || null,
      lotId: params.lotId || null,
      uniteReferenceId: params.uniteId || null,
      coutUnitaireMoyen: params.coutUnitaireBase ? String(params.coutUnitaireBase) : null,
    } as any);
  }

  return { stockAvant, stockApres, mouvementId: mvt?.id };
}

export async function mouvementSortieUnite(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    uniteId: string;
    quantite: number;
    type: TypeMouvement;
    motif?: string;
    commentaire?: string;
    effectuePar?: number;
    groupeOperationId?: string;
    coutUnitaireBase?: number | string;
    audit?: boolean;
  },
) {
  const qteSortie = params.quantite;

  const [srcRow] = await tx
    .select({ quantite: stocksUnites.quantite })
    .from(stocksUnites)
    .where(and(
      eq(stocksUnites.produitId, params.produitId),
      eq(stocksUnites.agenceId, params.agenceId),
      eq(stocksUnites.uniteId, params.uniteId),
    ))
    .for("update");

  const stockAvant = srcRow ? Number(srcRow.quantite) : 0;
  if (stockAvant < qteSortie) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Stock insuffisant pour l'unité ${params.uniteId}: ${stockAvant} < ${qteSortie}`,
    });
  }

  const stockApres = stockAvant - qteSortie;
  await tx
    .update(stocksUnites)
    .set({ quantite: stockApres })
    .where(and(
      eq(stocksUnites.produitId, params.produitId),
      eq(stocksUnites.agenceId, params.agenceId),
      eq(stocksUnites.uniteId, params.uniteId),
    )) as any;

  if (params.audit !== false) {
    await tx.insert(mouvementsStock).values({
      produitId: params.produitId,
      agenceId: params.agenceId,
      type: params.type,
      sens: "S",
      quantite: String(qteSortie),
      uniteId: params.uniteId,
      stockAvant: String(stockAvant),
      stockApres: String(stockApres),
      groupeOperationId: params.groupeOperationId || null,
      motif: params.motif || null,
      commentaire: params.commentaire || null,
      effectuePar: params.effectuePar || null,
      emplacementId: null,
      lotId: null,
      coutUnitaireBase: params.coutUnitaireBase ? String(params.coutUnitaireBase) : await getCoutUnitaireMoyen(tx, params.produitId, params.agenceId),
      reference: null,
      referenceType: null,
      documentLie: null,
      validePar: null,
    } as any);
  }
}

export async function mouvementEntreeUnite(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    uniteId: string;
    quantite: number;
    type: TypeMouvement;
    motif?: string;
    commentaire?: string;
    effectuePar?: number;
    groupeOperationId?: string;
    coutUnitaireBase?: number | string;
    audit?: boolean;
  },
) {
  const qteEntree = params.quantite;

  const [existing] = await tx
    .select({ quantite: stocksUnites.quantite })
    .from(stocksUnites)
    .where(and(
      eq(stocksUnites.produitId, params.produitId),
      eq(stocksUnites.agenceId, params.agenceId),
      eq(stocksUnites.uniteId, params.uniteId),
    ))
    .for("update");

  const stockAvant = existing ? Number(existing.quantite) : 0;
  const stockApres = stockAvant + qteEntree;

  if (existing) {
    await tx
      .update(stocksUnites)
      .set({ quantite: stockApres })
      .where(and(
        eq(stocksUnites.produitId, params.produitId),
        eq(stocksUnites.agenceId, params.agenceId),
        eq(stocksUnites.uniteId, params.uniteId),
      )) as any;
  } else {
    await tx.insert(stocksUnites).values({
      produitId: params.produitId,
      agenceId: params.agenceId,
      uniteId: params.uniteId,
      quantite: stockApres,
    } as any);
  }

  if (params.audit !== false) {
    await tx.insert(mouvementsStock).values({
      produitId: params.produitId,
      agenceId: params.agenceId,
      type: params.type,
      sens: "E",
      quantite: String(qteEntree),
      uniteId: params.uniteId,
      stockAvant: String(stockAvant),
      stockApres: String(stockApres),
      groupeOperationId: params.groupeOperationId || null,
      motif: params.motif || null,
      commentaire: params.commentaire || null,
      effectuePar: params.effectuePar || null,
      emplacementId: null,
      lotId: null,
      coutUnitaireBase: params.coutUnitaireBase ? String(params.coutUnitaireBase) : await getCoutUnitaireMoyen(tx, params.produitId, params.agenceId),
      reference: null,
      referenceType: null,
      documentLie: null,
      validePar: null,
    } as any);
  }

  return { stockAvant, stockApres };
}

/**
 * Opération double atomique : sortie source + entrée cible liées par groupeOperationId.
 * Supporte le reconditionnement INTER-ARTICLES (fût 200L → bidons 5L) :
 * - produitCibleId par défaut = produitId (même article, ancien comportement)
 * - sinon produitCibleId = article destination distinct
 */
export async function operationDouble(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    typeSortie: TypeMouvement;
    typeEntree: TypeMouvement;
    uniteSourceId: string;
    quantiteSource: number;
    uniteCibleId: string;
    quantiteCible: number;
    produitCibleId?: number; // article destination (reconditionnement inter-articles)
    emplacementSourceId?: number;
    emplacementCibleId?: number;
    motif?: string;
    effectuePar?: number;
    coutUnitaireBase?: number | string;
    getFacteurVersBase: (uniteId: string) => Promise<number>;
  },
) {
  const groupeOperationId = crypto.randomUUID();
  const produitCibleId = params.produitCibleId ?? params.produitId;

  await mouvementSortieUnite(tx, {
    produitId: params.produitId,
    agenceId: params.agenceId,
    uniteId: params.uniteSourceId,
    quantite: params.quantiteSource,
    type: params.typeSortie,
    motif: params.motif,
    effectuePar: params.effectuePar,
    groupeOperationId,
    coutUnitaireBase: params.coutUnitaireBase,
  });

  await mouvementEntreeUnite(tx, {
    produitId: produitCibleId,
    agenceId: params.agenceId,
    uniteId: params.uniteCibleId,
    quantite: params.quantiteCible,
    type: params.typeEntree,
    motif: params.motif,
    effectuePar: params.effectuePar,
    groupeOperationId,
    coutUnitaireBase: params.coutUnitaireBase,
  });

  return { groupeOperationId };
}

export async function getFacteurVersBase(
  tx: Tx,
  produitId: number,
  uniteId: string,
): Promise<number> {
  const [pu] = await tx
    .select({ facteurVersBase: produitUnites.facteurVersBase })
    .from(produitUnites)
    .where(and(
      eq(produitUnites.produitId, produitId),
      eq(produitUnites.uniteId, uniteId),
    ))
    .limit(1);
  if (!pu || !pu.facteurVersBase) {
    const [ump] = await tx
      .select({ facteur: unitesMesureProduits.facteurConversion })
      .from(unitesMesureProduits)
      .where(and(
        eq(unitesMesureProduits.produitId, produitId),
        eq(unitesMesureProduits.uniteId, uniteId),
      ))
      .limit(1);
    return ump ? Number(ump.facteur) : 1;
  }
  return Number(pu.facteurVersBase);
}
