import { db, stocksLots, lots, mouvementsStock, produits } from "@atelierone/db";
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, sum } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

export type AllocationLot = {
  lotId: number;
  numeroLot: string;
  quantite: number;
  coutUnitaire: number;
};

export type TypeMouvementLot =
  | "ACHAT_RECEPTION"
  | "VENTE"
  | "RETOUR_CLIENT"
  | "REJET_RECEPTION"
  | "CASSE_PERTE"
  | "AJUSTEMENT_INVENTAIRE_NEGATIF";

// I1.2 — Création d'un lot + ligne de stock par lot (quantité en unité de base).
// La ligne globale de `stocks` (lotId NULL) reste la source de vérité des lectures
// existantes (.limit(1)); stocks_lots porte la traçabilité par lot.
export async function creerLotEtStock(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    quantite: number;
    coutUnitaire: number;
    fournisseurId?: number;
    numeroLot?: string;
    reference: string;
    datePeremption?: Date | null;
  },
): Promise<{ lotId: number; numeroLot: string }> {
  const numeroLot = params.numeroLot || `LOT-${params.reference}`;

  const [lotExistant] = await tx.select({ id: lots.id }).from(lots)
    .where(and(eq(lots.produitId, params.produitId), eq(lots.numeroLot, numeroLot)))
    .limit(1) as any[];
  let lotId = lotExistant?.id;

  if (!lotId) {
    const [lot] = await tx.insert(lots).values({
      produitId: params.produitId,
      numeroLot,
      fournisseurId: params.fournisseurId || null,
      statut: "disponible",
      dateReception: new Date(),
      quantiteInitiale: Math.round(params.quantite),
      coutUnitaire: String(params.coutUnitaire),
      datePeremption: params.datePeremption || null,
      dateEntree: new Date(),
      isActive: true,
    } as any).returning() as any[];
    lotId = lot.id;
  }

  const [sl] = await tx.select({ id: stocksLots.id, quantite: stocksLots.quantite }).from(stocksLots)
    .where(and(
      eq(stocksLots.produitId, params.produitId),
      eq(stocksLots.agenceId, params.agenceId),
      eq(stocksLots.lotId, lotId),
    ))
    .for("update") as any[];

  if (sl) {
    await tx.update(stocksLots).set({ quantite: String(Number(sl.quantite) + params.quantite) } as any)
      .where(eq(stocksLots.id, sl.id));
  } else {
    await tx.insert(stocksLots).values({
      produitId: params.produitId,
      agenceId: params.agenceId,
      lotId,
      quantite: String(params.quantite),
    } as any);
  }

  return { lotId, numeroLot };
}

// I1.4 — Sortie FIFO par lot (lots les plus anciens d'abord). Insère un mouvement
// par lot consommé (avec lotId + coût unitaire du lot). Retourne [] si aucun lot
// ne porte de stock (comportement legacy conservé chez l'appelant).
export async function sortirStockFIFO(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    quantite: number;
    type: TypeMouvementLot;
    motif?: string;
    effectuePar?: number;
    reference?: string;
    referenceType?: string;
  },
): Promise<AllocationLot[]> {
  if (params.quantite <= 0) return [];

  const lotsDispo = await tx.select({
    stockLotId: stocksLots.id,
    lotId: stocksLots.lotId,
    numeroLot: lots.numeroLot,
    quantite: stocksLots.quantite,
    coutUnitaire: lots.coutUnitaire,
    dateEntree: lots.dateEntree,
  })
    .from(stocksLots)
    .innerJoin(lots, eq(lots.id, stocksLots.lotId))
    .where(and(
      eq(stocksLots.produitId, params.produitId),
      eq(stocksLots.agenceId, params.agenceId),
    ))
    .orderBy(asc(lots.dateEntree), asc(lots.id))
    .for("update") as any[];

  let reste = params.quantite;
  const allocations: AllocationLot[] = [];

  for (const lot of lotsDispo) {
    if (reste <= 0) break;
    const qteLot = Number(lot.quantite ?? 0);
    if (qteLot <= 0) continue;
    const qteSortie = Math.min(qteLot, reste);

    await tx.update(stocksLots).set({ quantite: String(qteLot - qteSortie) } as any)
      .where(eq(stocksLots.id, lot.stockLotId));

    await tx.insert(mouvementsStock).values({
      produitId: params.produitId,
      agenceId: params.agenceId,
      type: params.type,
      sens: "S",
      quantite: String(qteSortie),
      lotId: lot.lotId,
      coutUnitaireBase: lot.coutUnitaire != null ? String(lot.coutUnitaire) : null,
      stockAvant: String(qteLot),
      stockApres: String(qteLot - qteSortie),
      reference: params.reference || null,
      referenceType: params.referenceType || null,
      motif: params.motif || null,
      effectuePar: params.effectuePar || null,
    } as any);

    allocations.push({
      lotId: lot.lotId,
      numeroLot: lot.numeroLot,
      quantite: qteSortie,
      coutUnitaire: Number(lot.coutUnitaire ?? 0),
    });
    reste -= qteSortie;
  }

  return allocations;
}

// I1.5 — Sortie d'un lot précis (retour MISE_AU_REBUT, rejet de réception).
export async function sortirLotSpecifique(
  tx: Tx,
  params: {
    lotId: number;
    produitId: number;
    agenceId: number;
    quantite: number;
    type: TypeMouvementLot;
    motif?: string;
    effectuePar?: number;
    reference?: string;
    referenceType?: string;
  },
): Promise<{ coutUnitaire: number; quantiteSortie: number } | null> {
  const [sl] = await tx.select({
    id: stocksLots.id,
    quantite: stocksLots.quantite,
    coutUnitaire: lots.coutUnitaire,
    numeroLot: lots.numeroLot,
  })
    .from(stocksLots)
    .innerJoin(lots, eq(lots.id, stocksLots.lotId))
    .where(and(
      eq(stocksLots.lotId, params.lotId),
      eq(stocksLots.produitId, params.produitId),
      eq(stocksLots.agenceId, params.agenceId),
    ))
    .for("update") as any[];

  if (!sl || Number(sl.quantite) <= 0) return null;

  const qte = Math.min(Number(sl.quantite), params.quantite);
  const stockApres = Number(sl.quantite) - qte;

  await tx.update(stocksLots).set({ quantite: String(stockApres) } as any).where(eq(stocksLots.id, sl.id));

  await tx.insert(mouvementsStock).values({
    produitId: params.produitId,
    agenceId: params.agenceId,
    type: params.type,
    sens: "S",
    quantite: String(qte),
    lotId: params.lotId,
    coutUnitaireBase: sl.coutUnitaire != null ? String(sl.coutUnitaire) : null,
    stockAvant: String(Number(sl.quantite)),
    stockApres: String(stockApres),
    reference: params.reference || null,
    referenceType: params.referenceType || null,
    motif: params.motif || null,
    effectuePar: params.effectuePar || null,
  } as any);

  return { coutUnitaire: Number(sl.coutUnitaire ?? 0), quantiteSortie: qte };
}

// I1.4 — Ré-entrée de stock dans un lot existant (retour client, annulation vente).
export async function entrerStockLot(
  tx: Tx,
  params: {
    lotId: number;
    produitId: number;
    agenceId: number;
    quantite: number;
  },
): Promise<void> {
  if (params.quantite <= 0) return;

  const [sl] = await tx.select({ id: stocksLots.id, quantite: stocksLots.quantite }).from(stocksLots)
    .where(and(
      eq(stocksLots.produitId, params.produitId),
      eq(stocksLots.agenceId, params.agenceId),
      eq(stocksLots.lotId, params.lotId),
    ))
    .for("update") as any[];

  if (sl) {
    await tx.update(stocksLots).set({ quantite: String(Number(sl.quantite) + params.quantite) } as any)
      .where(eq(stocksLots.id, sl.id));
  } else {
    await tx.insert(stocksLots).values({
      produitId: params.produitId,
      agenceId: params.agenceId,
      lotId: params.lotId,
      quantite: String(params.quantite),
    } as any);
  }
}

// I1.3 — Retrouve le lot créé par un mouvement d'entrée donné (ex. lot d'un BON_RECEPTION).
export async function trouverLotParReference(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    reference: string;
    referenceType: string;
  },
): Promise<number | null> {
  const [mvt] = await tx.select({ lotId: mouvementsStock.lotId }).from(mouvementsStock)
    .where(and(
      eq(mouvementsStock.produitId, params.produitId),
      eq(mouvementsStock.agenceId, params.agenceId),
      eq(mouvementsStock.reference, params.reference),
      eq(mouvementsStock.referenceType, params.referenceType),
      eq(mouvementsStock.sens, "E"),
      isNotNull(mouvementsStock.lotId),
    ))
    .orderBy(desc(mouvementsStock.id))
    .limit(1) as any[];
  return mvt?.lotId ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Specs V2 §05 règle 8 — DLC / PÉREMPTION
// ─────────────────────────────────────────────────────────────────────────────

export type DlcStatus = "perime" | "proche" | "ok" | "aucune";

/** Statut de péremption d'une date (aucune si non renseignée). */
export function statutDlc(datePeremption: Date | string | null, seuilJours = 30): DlcStatus {
  if (!datePeremption) return "aucune";
  const d = typeof datePeremption === "string" ? new Date(`${datePeremption}T00:00:00`) : new Date(datePeremption);
  if (Number.isNaN(d.getTime())) return "aucune";
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  if (d < aujourdhui) return "perime";
  const seuil = new Date(aujourdhui);
  seuil.setDate(seuil.getDate() + seuilJours);
  if (d <= seuil) return "proche";
  return "ok";
}

/**
 * Vérifie qu'il reste assez de stock NON PÉRIMÉ pour une sortie/réservation.
 * Les articles suivis par lots (au moins un lot en stock) sont contrôlés :
 * si tout le stock restant est périmé, la sortie est bloquée (specs §05 règle 8).
 * Les articles sans lot (pas de suivi DLC) ne sont pas bloqués.
 */
export async function verifierDispoNonPerimee(
  tx: Tx,
  params: { produitId: number; agenceId: number; quantite: number; seuilJours?: number },
): Promise<void> {
  const [row] = await tx
    .select({ total: sum(stocksLots.quantite) })
    .from(stocksLots)
    .where(and(
      eq(stocksLots.produitId, params.produitId),
      eq(stocksLots.agenceId, params.agenceId),
    )) as any[];
  const totalLot = Number(row?.total ?? 0);
  if (totalLot <= 0) return; // produit non suivi par lot → pas de contrôle DLC

  const auj = new Date();
  auj.setHours(0, 0, 0, 0);
  const aujStr = auj.toISOString().slice(0, 10);
  const [ok] = await tx
    .select({ dispo: sum(stocksLots.quantite) })
    .from(stocksLots)
    .innerJoin(lots, eq(lots.id, stocksLots.lotId))
    .where(and(
      eq(stocksLots.produitId, params.produitId),
      eq(stocksLots.agenceId, params.agenceId),
      gte(lots.datePeremption, aujStr),
    )) as any[];
  const dispoNonPerimee = Number(ok?.dispo ?? 0);

  if (dispoNonPerimee < params.quantite) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Stock disponible non périmé insuffisant : ${dispoNonPerimee} < ${params.quantite} (tout ou partie du stock est périmé) — sortie bloquée (specs DLC).`,
    });
  }
}

/**
 * Liste des alertes DLC pour le tableau de bord : lots périmés (rouge) ou
 * proches de la péremption (orange), avec produit et quantité en stock.
 */
export async function listerAlertesDlc(
  agenceId: number,
  seuilJours = 30,
): Promise<Array<{
  lotId: number;
  numeroLot: string;
  produitId: number;
  titre: string;
  codeBarre: string | null;
  datePeremption: string | null;
  quantite: number;
  statut: DlcStatus;
}>> {
  const auj = new Date();
  auj.setHours(0, 0, 0, 0);
  const seuil = new Date(auj);
  seuil.setDate(seuil.getDate() + seuilJours);
  const seuilStr = seuil.toISOString().slice(0, 10);

  const rows = await db
    .select({
      lotId: lots.id,
      numeroLot: lots.numeroLot,
      produitId: stocksLots.produitId,
      titre: produits.titre,
      codeBarre: produits.codeBarre,
      datePeremption: lots.datePeremption,
      quantite: stocksLots.quantite,
    })
    .from(stocksLots)
    .innerJoin(lots, eq(lots.id, stocksLots.lotId))
    .innerJoin(produits, eq(produits.id, stocksLots.produitId))
    .where(and(
      eq(stocksLots.agenceId, agenceId),
      isNotNull(lots.datePeremption),
      lt(lots.datePeremption, seuilStr),
    ))
    .orderBy(asc(lots.datePeremption)) as any[];

  return rows
    .map((r) => ({
      lotId: r.lotId,
      numeroLot: r.numeroLot,
      produitId: r.produitId,
      titre: r.titre,
      codeBarre: r.codeBarre,
      datePeremption: r.datePeremption,
      quantite: Number(r.quantite ?? 0),
      statut: statutDlc(r.datePeremption, seuilJours),
    }))
    .filter((a) => a.statut === "perime" || a.statut === "proche");
}