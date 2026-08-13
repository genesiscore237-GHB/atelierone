import { db } from "~/server/db";
import { retours, lignesRetour, avoirs, ventes, ventesLignes, produits, stocks, stocksUnites, mouvementsStock, paiements, lots } from "@atelierone/db";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { ComptaService } from "./compta-service";
import { getFacteurVersBase } from "./stock-engine";
import { CaisseService } from "./caisse-service";
import { PertesService } from "./pertes-service";
import { entrerStockLot } from "./lot-service";

export interface CreateReturnParams {
  agenceId: number;
  venteId: number;
  operateurId: number;
  typeRetour: "REMBOURSEMENT" | "AVOIR" | "ECHANGE";
  motif?: string;
  lignes: Array<{
    venteLigneId: number;
    produitId: number;
    quantite: number;
    prixUnitaire: number;
    uniteId?: string | null;
    facteurConversion?: number;
    disposition?: "STOCK" | "MISE_AU_REBUT";
  }>;
}

export interface ReturnResult {
  id: number;
  montantTotal: number;
  avoirId?: number;
}

export class ReturnService {
  static async createReturn(params: CreateReturnParams): Promise<ReturnResult> {
    return db.transaction(async (tx) => {
      const [vente] = await tx.select().from(ventes).where(eq(ventes.id, params.venteId)).limit(1);
      if (!vente) throw new TRPCError({ code: "NOT_FOUND", message: "Vente non trouvée" });

      let montantTotal = 0;
      for (const ligne of params.lignes) {
        const [vl] = await tx.select().from(ventesLignes).where(eq(ventesLignes.id, ligne.venteLigneId)).limit(1);
        if (!vl) throw new TRPCError({ code: "NOT_FOUND", message: `Ligne de vente ${ligne.venteLigneId} non trouvée` });
        const total = ligne.quantite * Number(ligne.prixUnitaire);
        montantTotal += total;
      }

      const [retour] = await tx.insert(retours).values({
        venteId: params.venteId,
        clientId: vente.clientId,
        montantTotal: String(montantTotal),
        typeRetour: params.typeRetour,
        statut: "termine",
        motif: params.motif || null,
        effectuePar: params.operateurId,
      }).returning();

      for (const ligne of params.lignes) {
        let uniteId = ligne.uniteId;
        if (!uniteId) {
          const [ur] = await tx.select({ uniteBaseId: produits.uniteBaseId }).from(produits).where(eq(produits.id, ligne.produitId)).limit(1);
          uniteId = ur?.uniteBaseId ?? null;
        }

        const [vlOrig] = await tx
          .select({
            coutUnitaire: ventesLignes.coutUnitaire,
            facteurConversion: ventesLignes.facteurConversion,
            lotId: ventesLignes.lotId,
          })
          .from(ventesLignes)
          .where(eq(ventesLignes.id, ligne.venteLigneId))
          .limit(1);

        let numeroLotOrig: string | null = null;
        if (vlOrig?.lotId != null) {
          const [lotInfo] = await tx.select({ numeroLot: lots.numeroLot }).from(lots).where(eq(lots.id, vlOrig.lotId)).limit(1);
          numeroLotOrig = lotInfo?.numeroLot ?? null;
        }

        await tx.insert(lignesRetour).values({
          retourId: retour.id,
          venteLigneId: ligne.venteLigneId,
          produitId: ligne.produitId,
          quantite: ligne.quantite,
          uniteId: uniteId,
          facteurConversion: ligne.facteurConversion ?? 1,
          prixUnitaire: String(ligne.prixUnitaire),
          totalLigne: String(ligne.quantite * ligne.prixUnitaire),
          coutUnitaire: vlOrig?.coutUnitaire != null
            ? String((Number(vlOrig.coutUnitaire) * (ligne.facteurConversion ?? 1)) / (vlOrig.facteurConversion ?? 1))
            : null,
        });

        if (ligne.disposition !== "MISE_AU_REBUT") {
          let facteur = Number(ligne.facteurConversion ?? 0);
          if (facteur <= 1 && uniteId) {
            facteur = await getFacteurVersBase(tx as any, ligne.produitId, uniteId);
          }
          if (facteur <= 1) facteur = 1;
          const qteBase = ligne.quantite * facteur;

          if (vlOrig?.lotId != null) {
            await entrerStockLot(tx as any, {
              lotId: vlOrig.lotId,
              produitId: ligne.produitId,
              agenceId: params.agenceId,
              quantite: qteBase,
            });
          }

          const [stockRow] = await tx.select().from(stocks).where(and(eq(stocks.produitId, ligne.produitId), eq(stocks.agenceId, params.agenceId))).for("update").limit(1);
          if (stockRow) {
            const stockAvant = Number(stockRow.quantite);
            const stockApres = stockAvant + qteBase;
            await tx.update(stocks).set({ quantite: String(stockApres) }).where(eq(stocks.id, stockRow.id));

            await tx.insert(mouvementsStock).values({
              produitId: ligne.produitId,
              agenceId: params.agenceId,
              type: "RETOUR_CLIENT", sens: "E",
              quantite: String(qteBase),
              uniteId,
              lotId: vlOrig?.lotId ?? null,
              stockAvant: String(stockAvant),
              stockApres: String(stockApres),
              reference: vente.reference,
              referenceType: "RETOUR",
              motif: params.motif || "Retour client",
              effectuePar: params.operateurId,
            });

            if (uniteId) {
              const [su] = await tx.select().from(stocksUnites).where(
                and(eq(stocksUnites.produitId, ligne.produitId), eq(stocksUnites.agenceId, params.agenceId), eq(stocksUnites.uniteId, uniteId))
              ).limit(1);
              if (su) {
                await tx.update(stocksUnites).set({ quantite: su.quantite + ligne.quantite }).where(eq(stocksUnites.id, su.id));
              }
            }
          }
        } else {
          const coutUnitaire = vlOrig?.coutUnitaire != null
            ? (Number(vlOrig.coutUnitaire) * (ligne.facteurConversion ?? 1)) / (vlOrig.facteurConversion ?? 1)
            : 0;
          const montantPerte = ligne.quantite * coutUnitaire;
          if (montantPerte > 0) {
            await PertesService.enregistrerPerte({
              agenceId: params.agenceId,
              produitId: ligne.produitId,
              quantite: ligne.quantite,
              coutUnitaire,
              montantPerte,
              typePerte: "REBUT",
              motif: params.motif || "Marchandise retournée mise au rebut",
              reference: numeroLotOrig ?? vente.reference,
              referenceType: numeroLotOrig ? "LOT" : "RETOUR",
              effectuePar: params.operateurId,
            }, tx as any);
          }
        }
      }

      let avoirId: number | undefined;
      if (params.typeRetour === "REMBOURSEMENT" || params.typeRetour === "AVOIR") {
        const [avoir] = await tx.insert(avoirs).values({
          retourId: retour.id,
          venteId: params.venteId,
          clientId: vente.clientId,
          montantInitial: String(montantTotal),
          montantRestant: String(montantTotal),
          statut: "actif",
        }).returning();
        avoirId = avoir.id;
      }

      if (params.typeRetour === "REMBOURSEMENT") {
        await tx.insert(paiements).values({
          venteId: params.venteId,
          retourId: retour.id,
          montant: String(montantTotal),
          modePaiement: vente.modePaiement,
          statut: "valide",
          reference: `REMBOURS-${retour.id}`,
        });

        const caisse = await CaisseService.trouverCaisseOuverte(params.agenceId, tx as any);
        await CaisseService.enregistrerFlux({
          caisseId: caisse.caisseId,
          agenceId: params.agenceId,
          type: "remboursement",
          montant: montantTotal,
          motif: params.motif || `Remboursement retour #${retour.id}`,
          reference: vente.reference,
          entiteType: "RETOUR",
          entiteId: retour.id,
          effectuePar: params.operateurId,
        }, tx as any);
      }

      await ComptaService.genererEcritureRetour({
        tx, agenceId: params.agenceId,
        reference: vente.reference,
        montantTotal,
        typeRetour: params.typeRetour,
        operateurId: params.operateurId,
      });

      return { id: retour.id, montantTotal, avoirId };
    }) as any;
  }
}
