import { db, stocks, stocksUnites, mouvementsStock, produitUnites, unitesMesureProduits, produits } from "@atelierone/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

export const TYPES_MOUVEMENT = {
  // Solde d'ouverture tracé : stock initial saisi à la création du SKU (moteur catalogue universel).
  // Jamais utilisé pour un achat réel (→ ACHAT_RECEPTION) : type distinct pour l'audit des entrées initiales.
  INITIAL_RECEIPT: "INITIAL_RECEIPT",
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
// Specs V2 Â§04/Â§05 : sortie atelier liÃ©e Ã  un OR + retour atelier
  SORTIE_OR: "SORTIE_OR",
  RETOUR_ATELIER: "RETOUR_ATELIER",
  SORTIE_OUTIL: "SORTIE_OUTIL",
  RETOUR_OUTIL: "RETOUR_OUTIL",
  // Conception Stock + Bureau (MVP) : approvisionnement du bureau depuis un
  // grand magasin (transfert tracé) et dotation de consommable (sans retour)
  APPROVISIONNEMENT_BUREAU_SORTIE: "APPROVISIONNEMENT_BUREAU_SORTIE",
  APPROVISIONNEMENT_BUREAU_ENTREE: "APPROVISIONNEMENT_BUREAU_ENTREE",
  DOTATION_CONSOMMABLE: "DOTATION_CONSOMMABLE",
  // Specs V2 Â§04 processus 5 : rÃ©servation / libÃ©ration de stock
  RESERVATION: "RESERVATION",
  LIBERATION_RESERVATION: "LIBERATION_RESERVATION",
} as const;

export type TypeMouvement = (typeof TYPES_MOUVEMENT)[keyof typeof TYPES_MOUVEMENT];

export const SENS = {
  ENTREE: "E",
  SORTIE: "S",
} as const;

/** Types de mouvement exigeant un motif ÃƒÂ©crit (specs : perte / vol / casse / ajustement) */
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
  /**
   * Lot à PORTER sur le mouvement, sans servir à choisir la ligne de stock.
   *
   * `lotId` fait les deux choses : il filtre la ligne sur laquelle le stock
   * va bouger, ET il est recopié dans le mouvement. Or `stocks.lot_id` est
   * systématiquement NULL en pratique — un produit suivi par lot a sa ligne
   * globale sans lot, et le détail vit dans `stocks_lots`. Filtrer sur
   * `lotId` ne trouve donc RIEN, et l'écriture est refusée à tort.
   *
   * D'où ce champ : on trace le lot sans exiger qu'il pilote la ligne de
   * stock. C'est ce qu'il faut pour un déconditionnement — le mouvement dit
   * « ces 208 litres sortent du lot L1 », mais le stock à débiter est la ligne
   * globale du produit.
   */
  lotPourTracabilite?: number;
  orId?: number; // lien OR (specs V2 : Sortie_OR, traÃƒÂ§abilitÃƒÂ©)
  vehiculeId?: number; // lien vÃƒÂ©hicule (specs V2 : traÃƒÂ§abilitÃƒÂ©)
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
  // Synchroniser le stock par unité (stocks_unites) en plus du stock par emplacement.
  // Activé sur les entrées de stock (àchat, stock initial) afin que les transferts
  // et sorties par unité disposent d'une base stocks_unites.
  synchroniserStocksUnites?: boolean;
};

/**
 * Ligne de stock sur laquelle un mouvement doit porter.
 *
 * AVANT : `const [row] = await tx.select(…).where(where).for("update")`
 * Pas de `.limit(1)` — la requête renvoyait TOUTES les lignes du produit,
 * verrouillées, et `[row]` prenait la première dans un ordre que
 * PostgreSQL ne garantit pas. Une pièce rangée dans trois rayons pouvait
 * donc se voir refuser une sortie, ou en autoriser une, selon le plan
 * d'exécution du jour. C'était la garde de TOUTES les sorties et de TOUTES
 * les réservations du module.
 *
 * MAINTENANT : l'ordre est explicite et déterministe.
 *
 *  · emplacement et lot fournis → une seule ligne, aucune ambiguïté ;
 *  · emplacement non fourni → la ligne qui porte le plus de stock, puis
 *    la plus petite id. On sort d'où il y a du stock, et toujours de la
 *    même ligne. Un mouvement sans emplacement reste un raccourci
 *    volontaire : les flux qui doivent toucher une ligne précise
 *    (inventaire, transfert) passent l'emplacement.
 */
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
    .select({
      id: stocks.id,
      quantite: stocks.quantite,
      cmup: stocks.coutUnitaireMoyen,
      reserve: stocks.quantiteReservee,
      bloque: stocks.quantiteBloquee,
    })
    .from(stocks)
    .where(where)
    .orderBy(desc(sql`${stocks.quantite}`), asc(stocks.id))
    .limit(1)
    .for("update");
  return row;
}

/**
 * Stock DISPONIBLE — règle unique, appliquée partout (cadrage §7.7).
 *
 *   disponible = quantité − réservée − bloquée
 *
 * Le terme « bloquée » manquait. La colonne `stocks.quantite_bloquee`
 * existe depuis le schéma initial et n'a jamais été lue par ce calcul :
 * une pièce mise en quarantaine — contrôle qualité, litige, consignation —
 * restait annoncée comme disponible alors qu'elle ne pouvait pas sortir.
 */
export function stockDisponible(
  stockActuel: number,
  stockReserve: number | null,
  stockBloque: number | null = 0,
): number {
  return stockActuel - (stockReserve ?? 0) - (stockBloque ?? 0);
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

  // RÃƒÂ¨gle mÃƒÂ©tier (specs 05 Ã‚Â§3) : motif obligatoire pour perte / vol / casse / ajustement
  if (
    MOTIF_OBLIGATOIRE_TYPES.includes(params.type) &&
    (!params.motif || params.motif.trim().length < 3)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Motif obligatoire (min. 3 caractÃƒÂ¨res) pour le type de mouvement Ã‚Â« ${params.type} Ã‚Â».`,
    });
  }

  const stockRow = await verifierStockDisponible(
    tx, params.produitId, params.agenceId,
    qte, params.emplacementId, params.lotId,
  );
  const stockAvant = stockRow ? Number(stockRow.quantite) : 0;
  const reservee = stockRow ? Number(stockRow.reserve ?? 0) : 0;
  const bloquee = stockRow ? Number(stockRow.bloque ?? 0) : 0;

  // Cadrage §7.7 : une sortie ne peut pas dépasser le DISPONIBLE, c'est-à-dire
  // la quantité réelle moins ce qui est déjà engagé ailleurs (réservation pour
  // un autre OR) et ce qui est retenu (quarantaine, litige).
  //
  // La quarantinecounts désormais : `quantite_bloquee` existe depuis le
  // schéma initial et n'était pas lu. Une pièce bloquée était donc proposée
  // à la vente alors qu'elle ne pouvait pas sortir.
  if (params.sens === "S") {
    const disponible = stockDisponible(stockAvant, reservee, bloquee);
    if (disponible < qte) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          `Stock disponible insuffisant: ${disponible} disponible ` +
          `(${stockAvant} en stock, ${reservee} réservé, ${bloquee} bloqué) ` +
          `< ${qte} (produit ${params.produitId})`,
      });
    }
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
        message: `Stock maximum dÃƒÂ©passÃƒÂ©: ${stockApres} > ${prod.stockMaximum} (produit ${params.produitId})`,
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
      lotId: params.lotId ?? params.lotPourTracabilite ?? null,
      orId: params.orId || null,
      vehiculeId: params.vehiculeId || null,
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

  // Synchronisation du stock par unité (stocks_unites) : rend le stock entré
  // visible pour les transferts / sorties par unité (specs stock multi-unités).
  if (params.synchroniserStocksUnites && params.uniteId) {
    const [su] = await tx
      .select({ quantite: stocksUnites.quantite })
      .from(stocksUnites)
      .where(and(
        eq(stocksUnites.produitId, params.produitId),
        eq(stocksUnites.agenceId, params.agenceId),
        eq(stocksUnites.uniteId, params.uniteId),
      ))
      .for("update");
    const suAvant = su ? Number(su.quantite) : 0;
    const suApres = params.sens === "E" ? suAvant + qte : suAvant - qte;
    if (suApres < 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Stock unité insuffisant pour synchroniser la sortie.",
      });
    }
    if (su) {
      await tx
        .update(stocksUnites)
        .set({ quantite: String(suApres) } as any)
        .where(and(
          eq(stocksUnites.produitId, params.produitId),
          eq(stocksUnites.agenceId, params.agenceId),
          eq(stocksUnites.uniteId, params.uniteId),
        ));
    } else {
      await tx.insert(stocksUnites).values({
        produitId: params.produitId,
        agenceId: params.agenceId,
        uniteId: params.uniteId,
        quantite: String(suApres),
      } as any);
    }
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
      message: `Stock insuffisant pour l'unitÃƒÂ© ${params.uniteId}: ${stockAvant} < ${qteSortie}`,
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
 * OpÃƒÂ©ration double atomique : sortie source + entrÃƒÂ©e cible liÃƒÂ©es par groupeOperationId.
 * Supporte le reconditionnement INTER-ARTICLES (fÃƒÂ»t 200L Ã¢â€ â€™ bidons 5L) :
 * - produitCibleId par dÃƒÂ©faut = produitId (mÃƒÂªme article, ancien comportement)
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
  uniteId?: string | null,
): Promise<number> {
  // Aucun produit n'a d'unité de base configurée (210 sur 319 au relevé) :
  // ses quantités sont déjà exprimées dans l'unité de base, donc le facteur
  // de conversion vaut 1. On le dit explicitement plutôt que de laisser
  // PostgreSQL rejeter une comparaison sur « NULL ».
  if (!uniteId) return 1;

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

/**
 * SORTIE DE PIÃƒË†CE LIÃƒâ€°E Ãƒâ‚¬ UN OR (specs V2 Ã‚Â§04 processus 4, Ã‚Â§05 rÃƒÂ¨gle 6).
 * VÃƒÂ©rifie le stock DISPONIBLE (actuel Ã¢Ë†â€™ rÃƒÂ©servÃƒÂ©), dÃƒÂ©crÃƒÂ©mente, et trace le mouvement
 * SORTIE_OR avec or_id, vehicule_id et documentLie = "OR-{numero}".
 */
export async function sortirPourOR(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    quantite: number;
    orId?: number | null;
    vehiculeId?: number | null;
    numeroOR?: string | null;
    uniteId?: string;
    emplacementId?: number;
    motif?: string;
    commentaire?: string;
    effectuePar?: number;
    coutUnitaireBase?: number | string;
  },
) {
  const facteur = await getFacteurVersBase(tx, params.produitId, params.uniteId ?? (await uniteBaseId(tx, params.produitId)));
  const qteBase = params.quantite * facteur;

  // Sortie en unité : contrôle + décrément du stock par unité (stocks_unites)
  if (params.uniteId) {
    const [su] = await tx
      .select({ quantite: stocksUnites.quantite })
      .from(stocksUnites)
      .where(and(eq(stocksUnites.produitId, params.produitId), eq(stocksUnites.agenceId, params.agenceId), eq(stocksUnites.uniteId, params.uniteId)))
      .for("update");
    const dispo = su ? Number(su.quantite) : 0;
    if (dispo < params.quantite) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Stock insuffisant pour l'unité ${params.uniteId}: ${dispo} < ${params.quantite}` });
    }
    const apres = Math.round((dispo - params.quantite) * 100) / 100;
    if (su) {
      await tx.update(stocksUnites).set({ quantite: String(apres) } as any).where(and(eq(stocksUnites.produitId, params.produitId), eq(stocksUnites.agenceId, params.agenceId), eq(stocksUnites.uniteId, params.uniteId)));
    } else {
      await tx.insert(stocksUnites).values({ produitId: params.produitId, agenceId: params.agenceId, uniteId: params.uniteId, quantite: String(apres) } as any);
    }
  }

  const res = await enregistrerMouvement(tx, {
    type: TYPES_MOUVEMENT.SORTIE_OR as any,
    sens: "S",
    produitId: params.produitId,
    agenceId: params.agenceId,
    quantite: qteBase,
    uniteId: params.uniteId,
    emplacementId: params.emplacementId,
    orId: params.orId ?? null,
    vehiculeId: params.vehiculeId ?? null,
    documentLie: params.numeroOR ? `OR-${params.numeroOR}` : "UTILISATION_INTERNE",
    motif: params.motif ?? (params.numeroOR ? `Sortie pièce liée OR-${params.numeroOR}` : "Sortie pour utilisation (chercher avant de commander)"),
    commentaire: params.commentaire,
    effectuePar: params.effectuePar,
    coutUnitaireBase: params.coutUnitaireBase,
  });

  // La sortie CONSOMME la réservation : sans cette étape, une pièce
  // réservée puis sortie gardait sa quantité réservée positive pour
  // toujours. Voir `consommerReservation`.
  await consommerReservation(tx, {
    produitId: params.produitId,
    agenceId: params.agenceId,
    quantiteBase: qteBase,
    orId: params.orId ?? null,
    vehiculeId: params.vehiculeId ?? null,
    numeroOR: params.numeroOR ?? null,
    emplacementId: params.emplacementId ?? null,
    effectuePar: params.effectuePar ?? null,
  });

  return res;
}

/**
 * CONSOMMATION D'UNE RÉSERVATION au moment où la pièce sort.
 *
 * AVANT : `sortirPourOR` décrémentait `quantite` et laissait
 * `quantite_reservee` intacte. Une pièce réservée puis sortie conservait
 * donc une quantité réservée positive POUR TOUS — seul `libererStock`
 * pouvait la corriger, et rien ne l'appelait automatiquement à la sortie.
 * Le stock disponible baissait à chaque sortie, indéfiniment.
 *
 * C'est le défaut le plus coûteux du module parce qu'il est invisible :
 * la quantité affichée reste juste, seule la DISPONIBILITÉ se dégrade, et
 * le magasinier conclut qu'il n'a plus de pièces.
 *
 * Le mouvement tracé est un LIBERATION_RESERVATION, avec `stock_avant` et
 * `stock_apres` identiques : un engagement qui se libère n'est pas une
 * quantité qui rentre. C'est la convention déjà utilisée par les autres
 * mouvements de réservation, et elle évite qu'un rapport de flux
 * interpretent cette ligne comme une entrée de marchandise.
 */
async function consommerReservation(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    quantiteBase: number;
    orId?: number | null;
    vehiculeId?: number | null;
    numeroOR?: string | null;
    emplacementId?: number | null;
    motif?: string;
    effectuePar?: number | null;
  },
) {
  // Même ligne que celle ciblée par la sortie : même règle de sélection.
  const stockRow = await verifierStockDisponible(
    tx, params.produitId, params.agenceId, params.quantiteBase,
    params.emplacementId ?? undefined,
  );
  if (!stockRow) return { libere: 0, reserveeRestante: 0 };

  const reservee = Number(stockRow.reserve ?? 0);
  if (reservee <= 0) return { libere: 0, reserveeRestante: reservee };

  // Jamais plus que la réservation réellement ouverte.
  const libere = Math.min(reservee, params.quantiteBase);
  const reste = Math.max(0, reservee - libere);

  await tx.update(stocks)
    .set({ quantiteReservee: String(reste) } as any)
    .where(eq(stocks.id, stockRow.id)) as any;

  await tx.insert(mouvementsStock).values({
    produitId: params.produitId,
    agenceId: params.agenceId,
    type: TYPES_MOUVEMENT.LIBERATION_RESERVATION as any,
    sens: "E",
    quantite: String(libere),
    emplacementId: params.emplacementId || null,
    orId: params.orId ?? null,
    vehiculeId: params.vehiculeId ?? null,
    stockAvant: String(stockRow.quantite),
    stockApres: String(stockRow.quantite),
    documentLie: params.numeroOR ? `OR-${params.numeroOR}` : null,
    motif: params.motif ?? (params.numeroOR
      ? `Reservation consommee par la sortie OR-${params.numeroOR}`
      : "Reservation consommee par la sortie"),
    effectuePar: params.effectuePar ?? null,
  } as any);

  return { libere, reserveeRestante: reste };
}

/**
 * RETOUR DE PIÃƒË†CE DEPUIS L'ATELIER (specs V2 processus 4, cas particulier V1 Ã‚Â§05).
 * RÃƒÂ©intÃƒÂ¨gre la piÃƒÂ¨ce non utilisÃƒÂ©e au stock et trace le mouvement RETOUR_ATELIER
 * liÃƒÂ© ÃƒÂ  l'OR d'origine.
 */
export async function retourAtelier(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    quantite: number;
    orId: number;
    vehiculeId: number;
    numeroOR: string;
    uniteId?: string;
    emplacementId?: number;
    motif?: string;
    commentaire?: string;
    effectuePar?: number;
  },
) {
  const facteur = await getFacteurVersBase(tx, params.produitId, params.uniteId ?? (await uniteBaseId(tx, params.produitId)));
  const qteBase = params.quantite * facteur;
  const res = await enregistrerMouvement(tx, {
    type: TYPES_MOUVEMENT.RETOUR_ATELIER as any,
    sens: "E",
    produitId: params.produitId,
    agenceId: params.agenceId,
    quantite: qteBase,
    uniteId: params.uniteId,
    emplacementId: params.emplacementId,
    orId: params.orId,
    vehiculeId: params.vehiculeId,
    documentLie: `OR-${params.numeroOR}`,
    motif: params.motif ?? `Retour piÃƒÂ¨ce atelier OR-${params.numeroOR}`,
    commentaire: params.commentaire,
    effectuePar: params.effectuePar,
  });
  return res;
}

async function uniteBaseId(tx: Tx, produitId: number): Promise<string | null> {
  const [pu] = await tx
    .select({ uniteId: produitUnites.uniteId })
    .from(produitUnites)
    .where(and(eq(produitUnites.produitId, produitId), eq(produitUnites.estUniteBase, true)))
    .limit(1);
  if (pu?.uniteId) return pu.uniteId;
  const [p] = await tx
    .select({ uniteBaseId: produits.uniteBaseId })
    .from(produits)
    .where(eq(produits.id, produitId))
    .limit(1);
  // NULL, et surtout pas « » : cette valeur partait ensuite dans une
  // comparaison sur une colonne `uuid`, et PostgreSQL répondait
  // « syntaxe en entrée invalide pour le type uuid : "" ».
  //
  // Le relevé compte 210 produits sur 319 sans `unite_base_id` : toutes
  // leurs sorties, réservations et libérations échouaient. Le défaut n'était
  // pas visible parce qu'il concernait la majorité du catalogue et que les
  // quelques produits pourvus d'une unité fonctionnaient — ce qui donne
  // l'impression que le module marche, à moitié.
  return p?.uniteBaseId ?? null;
}

/**
 * RÃ‰SERVATION DE STOCK pour un OR (specs V2 Â§04 processus 5, Â§05 rÃ¨gle 4).
 * Augmente quantite_reservee (le stock disponible diminue) et trace un
 * mouvement RESERVATION liÃ© Ã  l'OR. Ne modifie pas le stock actuel.
 */
export async function reserverStock(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    quantite: number;
    orId: number;
    vehiculeId: number;
    numeroOR: string;
    uniteId?: string;
    emplacementId?: number;
    motif?: string;
    effectuePar?: number;
  },
) {
  const facteur = await getFacteurVersBase(tx, params.produitId, params.uniteId ?? (await uniteBaseId(tx, params.produitId)));
  const qteBase = params.quantite * facteur;

  const stockRow = await verifierStockDisponible(tx, params.produitId, params.agenceId, qteBase, params.emplacementId);
  const stockActuel = stockRow ? Number(stockRow.quantite) : 0;
  const reservee = stockRow ? Number(stockRow.reserve ?? 0) : 0;
  const bloquee = stockRow ? Number(stockRow.bloque ?? 0) : 0;
  const disponible = stockDisponible(stockActuel, reservee, bloquee);

  if (disponible < qteBase) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Stock disponible insuffisant pour rÃ©servation: ${disponible} disponible (${stockActuel} en stock, ${reservee} rÃ©servÃ©) < ${qteBase}`,
    });
  }

  if (stockRow) {
    await tx.update(stocks)
      .set({ quantiteReservee: String(reservee + qteBase) } as any)
      .where(eq(stocks.id, stockRow.id)) as any;
  } else {
    await tx.insert(stocks).values({
      produitId: params.produitId,
      agenceId: params.agenceId,
      quantite: "0",
      quantiteReservee: String(qteBase),
      emplacementId: params.emplacementId || null,
      uniteReferenceId: params.uniteId || null,
    } as any);
  }

  await tx.insert(mouvementsStock).values({
    produitId: params.produitId,
    agenceId: params.agenceId,
    type: TYPES_MOUVEMENT.RESERVATION as any,
    sens: "S",
    quantite: String(qteBase),
    uniteId: params.uniteId || null,
    emplacementId: params.emplacementId || null,
    orId: params.orId,
    vehiculeId: params.vehiculeId,
    stockAvant: String(stockActuel),
    stockApres: String(stockActuel),
    documentLie: `OR-${params.numeroOR}`,
    motif: params.motif ?? `RÃ©servation pour OR-${params.numeroOR}`,
    effectuePar: params.effectuePar || null,
  } as any);

  return { stockActuel, reservee: reservee + qteBase, disponible: disponible - qteBase };
}

/**
 * LIBÃ‰RATION DE RÃ‰SERVATION (specs V2 Â§04 processus 5).
 * Diminue quantite_reservee (le stock disponible remonte) et trace un mouvement
 * LIBERATION_RESERVATION. Ã€ utiliser quand la piÃ¨ce rÃ©servÃ©e est rendue
 * disponible (OR annulÃ©, piÃ¨ce non utilisÃ©e, etc.).
 */
export async function libererStock(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    quantite: number;
    orId: number;
    vehiculeId: number;
    numeroOR: string;
    uniteId?: string;
    emplacementId?: number;
    motif?: string;
    effectuePar?: number;
  },
) {
  const facteur = await getFacteurVersBase(tx, params.produitId, params.uniteId ?? (await uniteBaseId(tx, params.produitId)));
  const qteBase = params.quantite * facteur;

  const stockRow = await verifierStockDisponible(tx, params.produitId, params.agenceId, qteBase, params.emplacementId);
  const stockActuel = stockRow ? Number(stockRow.quantite) : 0;
  const reservee = stockRow ? Number(stockRow.reserve ?? 0) : 0;
  const bloquee = stockRow ? Number(stockRow.bloque ?? 0) : 0;
  const reserveeApres = reservee - qteBase;

  // Garde-fau : on ne libère jamais plus que ce qui est réservé. Sans ce
  // contrôle, une double libération rendrait la quantité réservée négative
  // et le disponible supérieur au stock réel.
  if (reservee < qteBase) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Quantite reservee insuffisante pour liberation: ${reservee} reserve < ${qteBase}`,
    });
  }

  if (stockRow) {
    await tx.update(stocks)
      .set({ quantiteReservee: String(reserveeApres) } as any)
      .where(eq(stocks.id, stockRow.id)) as any;
  }

  await tx.insert(mouvementsStock).values({
    produitId: params.produitId,
    agenceId: params.agenceId,
    type: TYPES_MOUVEMENT.LIBERATION_RESERVATION as any,
    sens: "E",
    quantite: String(qteBase),
    uniteId: params.uniteId || null,
    emplacementId: params.emplacementId || null,
    orId: params.orId,
    vehiculeId: params.vehiculeId,
    stockAvant: String(stockActuel),
    stockApres: String(stockActuel),
    documentLie: `OR-${params.numeroOR}`,
    motif: params.motif ?? `LibÃ©ration rÃ©servation OR-${params.numeroOR}`,
    effectuePar: params.effectuePar || null,
  } as any);

  return { stockActuel, reservee: reserveeApres, disponible: stockDisponible(stockActuel, reserveeApres, bloquee) };
}
