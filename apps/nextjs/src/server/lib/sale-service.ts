import { db } from "~/server/db";
import { ventes, ventesLignes, produits, stocks, mouvementsStock, caisses, mouvementsCaisse, paiements, stocksUnites, sessionsCaisse, tarifs, clients, dettesClients, agences } from "@atelierone/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { ComptaService } from "./compta-service";
import { getFacteurVersBase } from "./stock-engine";
import { sortirStockFIFO } from "./lot-service";

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

export interface LigneVenteInput {
  produitId: number;
  quantite: number;
  prixUnitaire: number;
  uniteId?: string | null;
  facteurConversion?: number;
}

export const MAX_DISCOUNT_BY_ROLE: Record<string, number> = {
  operateur_pos: 15,
  caissier: 5,
  magasinier: 0,
  admin_reseau: 100,
  responsable_agence: 100,
  rh: 0,
  comptable: 0,
};

export function computeDiscountPercent(remise: number, lignes: LigneVenteInput[]): number {
  const subtotal = lignes.reduce((s, l) => s + l.prixUnitaire * l.quantite, 0);
  if (subtotal <= 0) return 0;
  return Math.round((remise / (subtotal + remise)) * 100);
}

export interface CreateSaleParams {
  agenceId: number;
  operateurId: number;
  operateurRole: string;
  caisseId?: number;
  modePaiement: string;
  lignes: LigneVenteInput[];
  clientId?: number | null;
  remise?: string;
  montantPaye?: string;
  notes?: string | null;
  reference?: string;
  statut?: string;
}

export interface LowStockWarning {
  produitId: number;
  titre: string;
  stockRestant: number;
  seuilAlerte: number;
}

export interface SaleResult {
  id: number;
  reference: string;
  montantTotal: number;
  warnings?: LowStockWarning[];
}

export class SaleService {
  static async createSale(params: CreateSaleParams): Promise<SaleResult> {
    return executeSaleTransaction(params);
  }

  static async convertPrefactureToSale(
    venteId: number,
    agenceId: number,
    options?: { modePaiement?: string; montantPaye?: string; encaissePar?: number },
  ): Promise<SaleResult> {
    return db.transaction(async (tx) => {
      const [vente] = await tx.select().from(ventes).where(and(eq(ventes.id, venteId), eq(ventes.agenceId, agenceId))).limit(1);
      if (!vente) throw new TRPCError({ code: "NOT_FOUND", message: "Préfacture non trouvée" });
      if (vente.statut !== "pre_facture") throw new TRPCError({ code: "BAD_REQUEST", message: "Seules les préfactures (pre_facture) peuvent être converties" });

      const lignes = await tx.select().from(ventesLignes).where(eq(ventesLignes.venteId, venteId));
      if (lignes.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune ligne à facturer" });

      const produitIds = lignes.map(l => l.produitId).filter((id): id is number => id != null);
      const stockRows = await tx.select().from(stocks).where(and(inArray(stocks.produitId, produitIds), eq(stocks.agenceId, agenceId)));
      const stockMap = new Map(stockRows.map(s => [s.produitId, s]));

      const uniteLignes = lignes.filter(l => l.uniteId);
      let suMap = new Map<string, typeof stocksUnites.$inferSelect>();
      if (uniteLignes.length > 0) {
        const suRows = await tx.select().from(stocksUnites)
          .where(and(inArray(stocksUnites.produitId, produitIds), eq(stocksUnites.agenceId, agenceId)));
        suMap = new Map(suRows.map(s => [`${s.produitId}-${s.uniteId}`, s]));
      }

      const mouvementsData: any[] = [];
      const stockUpdates: { id: number; quantite: number }[] = [];
      const suUpdates: { id: number; quantite: number }[] = [];
      const lotInfoByLigne = new Map<number, { lotId: number; coutUnitaireBase: number; facteur: number }>();

      let montantTotal = 0;
      for (const ligne of lignes) {
        if (!ligne.produitId) continue;
        const qte = Number(ligne.quantite ?? 0);
        montantTotal += Number(ligne.totalLigne ?? 0);

        let facteur = Number(ligne.facteurConversion ?? 0);
        if (facteur <= 1 && ligne.uniteId) {
          facteur = await getFacteurVersBase(tx as any, ligne.produitId, ligne.uniteId);
        }
        if (facteur <= 1) facteur = 1;
        const qteBase = qte * facteur;

        const stockRow = stockMap.get(ligne.produitId);
        if (!stockRow) throw new TRPCError({ code: "BAD_REQUEST", message: `Stock insuffisant pour le produit ${ligne.produitId}` });
        const stockAvant = Number(stockRow.quantite);
        if (stockAvant < qteBase) throw new TRPCError({ code: "BAD_REQUEST", message: `Stock insuffisant pour le produit ${ligne.produitId} (dispo: ${stockAvant}, requis: ${qteBase})` });
        const stockApres = stockAvant - qteBase;

        stockUpdates.push({ id: stockRow.id, quantite: stockApres });

        const fifoAllocs = await sortirStockFIFO(tx, {
          produitId: ligne.produitId,
          agenceId,
          quantite: qteBase,
          type: "VENTE",
          motif: "Vente (préfacture)",
          effectuePar: vente.operateurId,
          reference: vente.reference,
          referenceType: "VENTE",
        });

        if (fifoAllocs.length > 0) {
          lotInfoByLigne.set(ligne.id, {
            lotId: fifoAllocs[0].lotId,
            coutUnitaireBase: fifoAllocs[0].coutUnitaire,
            facteur: Number(ligne.facteurConversion ?? 1),
          });
        } else {
          mouvementsData.push({
            produitId: ligne.produitId,
            agenceId,
            type: "VENTE", sens: "S",
            quantite: String(qteBase),
            uniteId: ligne.uniteId || null,
            stockAvant: String(stockAvant),
            stockApres: String(stockApres),
            reference: vente.reference,
            referenceType: "VENTE",
            effectuePar: vente.operateurId,
          });
        }

        if (ligne.uniteId) {
          const su = suMap.get(`${ligne.produitId}-${ligne.uniteId}`);
          if (su) suUpdates.push({ id: su.id, quantite: Number(su.quantite) - qte });
        }
      }

      for (const u of stockUpdates) {
        await tx.update(stocks).set({ quantite: String(u.quantite) }).where(eq(stocks.id, u.id));
      }
      if (mouvementsData.length > 0) {
        await tx.insert(mouvementsStock).values(mouvementsData as any);
      }
      for (const u of suUpdates) {
        await tx.update(stocksUnites).set({ quantite: u.quantite }).where(eq(stocksUnites.id, u.id));
      }

      for (const [ligneId, infoLot] of lotInfoByLigne) {
        await tx.update(ventesLignes).set({
          lotId: infoLot.lotId,
          coutUnitaire: String(infoLot.coutUnitaireBase * (infoLot.facteur > 0 ? infoLot.facteur : 1)),
        } as any).where(eq(ventesLignes.id, ligneId)) as any;
      }

      const [sessionRow] = await tx.select({ id: sessionsCaisse.id, caisseId: sessionsCaisse.caisseId, soldeActuel: sessionsCaisse.soldeActuel }).from(sessionsCaisse)
        .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
        .where(and(
          eq(sessionsCaisse.statut, "ouverte"),
          vente.sessionCaisseId ? eq(sessionsCaisse.id, vente.sessionCaisseId) : eq(caisses.agenceId, agenceId),
        ))
        .limit(1);

      const montantPaye = options?.montantPaye ?? String(montantTotal);
      await tx.update(ventes).set({
        montantTotal: String(montantTotal),
        statut: "termine",
        modePaiement: options?.modePaiement ?? vente.modePaiement,
        montantPaye: montantPaye,
        sessionCaisseId: sessionRow?.id ?? null,
      }).where(eq(ventes.id, venteId));

      if (sessionRow) {
        await tx.insert(mouvementsCaisse).values({
          caisseId: sessionRow.caisseId,
          type: "vente",
          montant: String(montantTotal),
          reference: vente.reference,
          effectuePar: options?.encaissePar ?? vente.operateurId,
        });
        await tx.update(sessionsCaisse).set({ soldeActuel: String(Number(sessionRow.soldeActuel ?? 0) + montantTotal) }).where(eq(sessionsCaisse.id, sessionRow.id));
      }

      return { id: vente.id, reference: vente.reference, montantTotal };
    }) as any;
  }
}

async function executeSaleTransaction(params: CreateSaleParams): Promise<SaleResult> {
  const remiseNum = Number(params.remise ?? 0);
  const discPct = computeDiscountPercent(remiseNum, params.lignes);
  const maxDisc = MAX_DISCOUNT_BY_ROLE[params.operateurRole] ?? 0;
  if (discPct > maxDisc) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Remise maximale autorisée pour votre rôle: ${maxDisc}%. La remise saisie (${discPct}%) dépasse cette limite.`,
    });
  }

  return db.transaction(async (tx) => {
    const [agenceRow] = await tx.select({ prefixeFacture: agences.prefixeFacture }).from(agences).where(eq(agences.id, params.agenceId)).limit(1);
    const ref = params.reference ?? `${agenceRow?.prefixeFacture ?? "VEN"}-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    let clientCategoriePrix: string | null = null;
    if (params.clientId) {
      const [client] = await tx.select({ categoriePrix: clients.categoriePrix }).from(clients).where(eq(clients.id, params.clientId)).limit(1);
      if (client?.categoriePrix) clientCategoriePrix = client.categoriePrix;
    }

      const [sessionRow] = await tx.select({ id: sessionsCaisse.id, caisseId: sessionsCaisse.caisseId, soldeActuel: sessionsCaisse.soldeActuel }).from(sessionsCaisse)
        .leftJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
        .where(and(
          eq(sessionsCaisse.statut, "ouverte"),
          params.caisseId ? eq(sessionsCaisse.caisseId, params.caisseId) : eq(caisses.agenceId, params.agenceId),
        ))
        .limit(1);

    let montantTotal = 0;
    for (const ligne of params.lignes) {
      montantTotal += Number(ligne.quantite) * Number(ligne.prixUnitaire);
    }

    const [vente] = await tx.insert(ventes).values({
      agenceId: params.agenceId,
      reference: ref,
      operateurId: params.operateurId,
      clientId: params.clientId ?? null,
      sessionCaisseId: sessionRow?.id ?? null,
      modePaiement: params.modePaiement,
      remise: params.remise ?? "0",
      montantTotal: String(montantTotal),
      montantPaye: params.montantPaye ?? "0",
      statut: params.statut ?? "termine",
      notes: params.notes ?? null,
    }).returning();

    montantTotal = 0;
    const warnings: LowStockWarning[] = [];
    const lotInfoByProduit = new Map<number, { lotId: number; coutUnitaireBase: number }>();
    for (const ligne of params.lignes) {
      const qte = ligne.quantite;
      const pu = String(ligne.prixUnitaire);
      const prixNum = Number(pu);
      const total = qte * prixNum;
      montantTotal += total;

      if (clientCategoriePrix) {
        const [catTarif] = await tx
          .select({ prix: tarifs.prix })
          .from(tarifs)
          .where(and(
            eq(tarifs.produitId, ligne.produitId),
            eq(tarifs.type, clientCategoriePrix),
            eq(tarifs.isActive, true),
          ))
          .orderBy(tarifs.prix)
          .limit(1);
        if (catTarif && prixNum < Number(catTarif.prix)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Le prix pour ce client (catégorie ${clientCategoriePrix}) doit être ≥ ${catTarif.prix} (produit ${ligne.produitId})`,
          });
        }
      }

      const [minTarif] = await tx
        .select({ prix: tarifs.prix })
        .from(tarifs)
        .where(and(
          eq(tarifs.produitId, ligne.produitId),
          eq(tarifs.type, "minimum_vente"),
          eq(tarifs.isActive, true),
        ))
        .orderBy(tarifs.prix)
        .limit(1);
      if (minTarif && prixNum < Number(minTarif.prix)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Prix minimum de vente non respecté: ${prixNum} < ${minTarif.prix} (produit ${ligne.produitId})`,
        });
      }

      const [prod] = await tx.select({
        prixMinimumVente: produits.prixMinimumVente,
        typeProduit: produits.typeProduit,
        prixVente: produits.prixVente,
      }).from(produits).where(eq(produits.id, ligne.produitId)).limit(1);

      if (prod?.prixMinimumVente != null) {
        const minPrix = Number(prod.prixMinimumVente);
        if (prixNum < minPrix) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Prix inférieur au prix minimum de vente (${minPrix}) pour le produit ${ligne.produitId}`,
          });
        }
      }

      if (prod?.typeProduit === "MANUEL" && prod.prixVente != null) {
        if (prixNum !== Number(prod.prixVente)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Le prix d'un manuel scolaire ne peut pas être modifié (prix fixe: ${prod.prixVente})`,
          });
        }
      }

      let uniteId = ligne.uniteId;
      if (!uniteId) {
        const [uniteRow] = await tx.select({ uniteId: produits.uniteBaseId }).from(produits).where(eq(produits.id, ligne.produitId)).limit(1);
        uniteId = uniteRow?.uniteId ?? null;
      }

      const [cumpRow] = await tx
        .select({ cmup: stocks.coutUnitaireMoyen })
        .from(stocks)
        .where(and(eq(stocks.produitId, ligne.produitId), eq(stocks.agenceId, params.agenceId)))
        .limit(1);

      await tx.insert(ventesLignes).values({
        venteId: vente.id,
        produitId: ligne.produitId,
        quantite: qte,
        uniteId: uniteId,
        facteurConversion: ligne.facteurConversion ?? 1,
        prixUnitaire: pu,
        totalLigne: String(total),
        coutUnitaire: cumpRow?.cmup != null
          ? String(Number(cumpRow.cmup) * (ligne.facteurConversion ?? 1))
          : null,
      });

      if (params.statut === "brouillon") {
        const facteurReserve = uniteId
          ? await getFacteurVersBase(tx as any, ligne.produitId, uniteId)
          : 1;
        const qteReserveeBase = qte * facteurReserve;
        const [stockRow] = await tx.select().from(stocks).where(and(eq(stocks.produitId, ligne.produitId), eq(stocks.agenceId, params.agenceId))).limit(1);
        if (stockRow) {
          const stockAvant = Number(stockRow.quantite);
          const quantiteReserveeApres = Number(stockRow.quantiteReservee ?? 0) + qteReserveeBase;
          await tx.update(stocks).set({ quantiteReservee: String(quantiteReserveeApres) }).where(eq(stocks.id, stockRow.id));
        }
        continue;
      }

      const facteurVente = uniteId
        ? await getFacteurVersBase(tx as any, ligne.produitId, uniteId)
        : 1;
      const qteBase = qte * facteurVente;

      const [stockRow] = await tx.select().from(stocks).where(and(eq(stocks.produitId, ligne.produitId), eq(stocks.agenceId, params.agenceId))).limit(1);
      if (!stockRow) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Stock insuffisant pour le produit ${ligne.produitId}` });
      }
      const stockAvant = Number(stockRow.quantite);
      const stockDisponible = stockAvant - Number(stockRow.quantiteReservee ?? 0);
      if (stockDisponible < qteBase) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Stock insuffisant pour le produit ${ligne.produitId} (dispo: ${stockDisponible}, requis: ${qteBase})` });
      }
      const stockApres = stockAvant - qteBase;
      const quantiteReserveeApres = Math.max(0, Number(stockRow.quantiteReservee ?? 0) - qteBase);
      await tx.update(stocks).set({ quantite: String(stockApres), quantiteReservee: String(quantiteReserveeApres) }).where(eq(stocks.id, stockRow.id));

      const [prodInfo] = await tx.select({ titre: produits.titre, seuilAlerte: produits.seuilAlerte }).from(produits).where(eq(produits.id, ligne.produitId)).limit(1);
      if (prodInfo && prodInfo.seuilAlerte != null && stockApres <= prodInfo.seuilAlerte) {
        warnings.push({ produitId: ligne.produitId, titre: prodInfo.titre, stockRestant: stockApres, seuilAlerte: prodInfo.seuilAlerte });
      }

      const fifoAllocs = await sortirStockFIFO(tx, {
        produitId: ligne.produitId,
        agenceId: params.agenceId,
        quantite: qteBase,
        type: "VENTE",
        motif: "Vente caisse",
        effectuePar: params.operateurId,
        reference: ref,
        referenceType: "VENTE",
      });

      if (fifoAllocs.length > 0) {
        lotInfoByProduit.set(ligne.produitId, { lotId: fifoAllocs[0].lotId, coutUnitaireBase: fifoAllocs[0].coutUnitaire });
      } else {
        await tx.insert(mouvementsStock).values({
          produitId: ligne.produitId,
          agenceId: params.agenceId,
          type: "VENTE", sens: "S",
          quantite: String(qteBase),
          uniteId,
          stockAvant: String(stockAvant),
          stockApres: String(stockApres),
          reference: ref,
          referenceType: "VENTE",
          effectuePar: params.operateurId,
        });
      }

      if (uniteId) {
        const [su] = await tx.select().from(stocksUnites).where(
          and(eq(stocksUnites.produitId, ligne.produitId), eq(stocksUnites.agenceId, params.agenceId), eq(stocksUnites.uniteId, uniteId))
        ).limit(1);
        if (su && su.quantite >= qte) {
          await tx.update(stocksUnites).set({ quantite: su.quantite - qte }).where(eq(stocksUnites.id, su.id));
        }
      }
    }

    if (lotInfoByProduit.size > 0) {
      const lignesSaved = await tx.select().from(ventesLignes).where(eq(ventesLignes.venteId, vente.id));
      for (const vl of lignesSaved) {
        if (!vl.produitId) continue;
        const infoLot = lotInfoByProduit.get(vl.produitId);
        if (!infoLot) continue;
        const facteur = Number(vl.facteurConversion ?? 1);
        await tx.update(ventesLignes).set({
          lotId: infoLot.lotId,
          coutUnitaire: String(infoLot.coutUnitaireBase * (facteur > 0 ? facteur : 1)),
        } as any).where(eq(ventesLignes.id, vl.id)) as any;
      }
    }

    await tx.update(ventes).set({ montantTotal: String(montantTotal) }).where(eq(ventes.id, vente.id));

    if (params.modePaiement === "credit" && params.clientId) {
      const [clientRow] = await tx.select({ plafondCredit: clients.plafondCredit }).from(clients).where(eq(clients.id, params.clientId)).limit(1);
      if (clientRow) {
        const plafond = Number(clientRow.plafondCredit ?? 0);
        if (plafond > 0) {
          const [debtSum] = await tx.select({ total: sql<string>`coalesce(sum(${dettesClients.montantRestant}), 0)` }).from(dettesClients)
            .where(and(eq(dettesClients.clientId, params.clientId), eq(dettesClients.agenceId, params.agenceId), sql`${dettesClients.statut} != 'paye'`));
          const existingDebt = Number(debtSum?.total ?? 0);
          if (existingDebt + montantTotal > plafond) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Plafond crédit dépassé: solde dû ${existingDebt.toLocaleString()} + ${montantTotal.toLocaleString()} > plafond ${plafond.toLocaleString()}`,
            });
          }
        }
      }
    }

    if (params.statut !== "brouillon") {
      await ComptaService.genererEcritureVente({
        tx, agenceId: params.agenceId, reference: ref, montantTotal, operateurId: params.operateurId,
      });

      await tx.insert(paiements).values({
        venteId: vente.id,
        montant: params.montantPaye ?? String(montantTotal),
        modePaiement: params.modePaiement,
        statut: "valide",
      });

      if (sessionRow) {
        await tx.insert(mouvementsCaisse).values({
          caisseId: sessionRow.caisseId,
          type: "vente",
          montant: String(montantTotal),
          reference: ref,
          effectuePar: params.operateurId,
        });
        await tx.update(sessionsCaisse).set({ soldeActuel: String(Number(sessionRow.soldeActuel ?? 0) + montantTotal) }).where(eq(sessionsCaisse.id, sessionRow.id));
      }
    }

    return { id: vente.id, reference: ref, montantTotal, warnings: warnings.length > 0 ? warnings : undefined };
  }) as any;
}
