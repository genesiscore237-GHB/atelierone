import { db, rachats, rachatsLignes, produits, lots, stocks, agences, ventes, ventesLignes, clients, mouvementsStock } from "@atelierone/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { enregistrerMouvement, TYPES_MOUVEMENT } from "~/server/lib/stock-engine";

export interface BourseReventeInput {
  agenceId: number;
  operateurId: number;
  clientId?: number | null;
  lignes: {
    lotId: number;
    quantite: number;
    prixUnitaire: number;
  }[];
  modePaiement: string;
  montantPaye?: number;
}

export interface BourseEchangeInput {
  agenceId: number;
  operateurId: number;
  clientNom: string;
  clientContact?: string;
  rachatLignes: {
    produitId: number;
    quantite: number;
    etat: "neuf" | "bon" | "moyen" | "usage";
  }[];
  echangeLignes: {
    lotId: number;
    quantite: number;
  }[];
  montantPaye?: number;
}

export class BourseService {
  static async getBourseStock(agenceId: number, produitId: number) {
    const rows = await db.select({
      lotId: lots.id,
      numeroLot: lots.numeroLot,
      quantite: stocks.quantite,
      prixRevente: rachatsLignes.prixReseal,
      etat: rachatsLignes.etat,
      dateReception: lots.dateReception,
    })
      .from(stocks)
      .innerJoin(lots, eq(stocks.lotId, lots.id))
      .innerJoin(rachatsLignes, eq(rachatsLignes.lotId, lots.id))
      .where(and(
        eq(stocks.produitId, produitId),
        eq(stocks.agenceId, agenceId),
        sql`${stocks.quantite} > 0`,
        eq(rachatsLignes.vendu, false),
      ))
      .orderBy(lots.dateReception);

    return rows;
  }

  static async getBourseMargePourcent(agenceId: number): Promise<number> {
    const [agence] = await db.select({ bourseMargePourcent: agences.bourseMargePourcent })
      .from(agences).where(eq(agences.id, agenceId)).limit(1);
    return Number(agence?.bourseMargePourcent ?? 30);
  }

  static async calculerPrixRevente(agenceId: number, lotId: number): Promise<number> {
    const [ligne] = await db.select({ prixUnitaire: rachatsLignes.prixUnitaire })
      .from(rachatsLignes).where(eq(rachatsLignes.lotId, lotId)).limit(1);
    if (!ligne) throw new TRPCError({ code: "NOT_FOUND", message: "Lot non trouvé" });

    const marge = await BourseService.getBourseMargePourcent(agenceId);
    const prixAchat = Number(ligne.prixUnitaire);
    return Math.round(prixAchat * (1 + marge / 100) * 100) / 100;
  }

  static async vendreOccasion(params: BourseReventeInput) {
    return db.transaction(async (tx) => {
      const ref = `BRS-VEN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      let montantTotal = 0;

      const lotIds = params.lignes.map(l => l.lotId);
      const lotsData = await tx.select({
        id: lots.id,
        produitId: lots.produitId,
        numeroLot: lots.numeroLot,
      }).from(lots).where(inArray(lots.id, lotIds));

      const lignesVente: any[] = [];

      for (const ligne of params.lignes) {
        const lot = lotsData.find(l => l.id === ligne.lotId);
        if (!lot) throw new TRPCError({ code: "NOT_FOUND", message: `Lot ${ligne.lotId} introuvable` });

        const [stockRow] = await tx.select()
          .from(stocks)
          .where(and(
            eq(stocks.lotId, ligne.lotId),
            eq(stocks.produitId, lot.produitId),
            eq(stocks.agenceId, params.agenceId),
          ))
          .limit(1);

        if (!stockRow || Number(stockRow.quantite) < ligne.quantite) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Stock insuffisant pour le lot ${lot.numeroLot}` });
        }

        const totalLigne = Math.round(ligne.prixUnitaire * ligne.quantite * 100) / 100;
        montantTotal += totalLigne;

        const stockAvant = Number(stockRow.quantite);
        const stockApres = stockAvant - ligne.quantite;
        await tx.update(stocks).set({ quantite: String(stockApres) } as any).where(eq(stocks.id, stockRow.id));

        await tx.insert(mouvementsStock).values({
          produitId: lot.produitId,
          agenceId: params.agenceId,
          type: "VENTE",
          sens: "S",
          quantite: String(ligne.quantite),
          stockAvant: String(stockAvant),
          stockApres: String(stockApres),
          lotId: ligne.lotId,
          reference: ref,
          referenceType: "VENTE_BOURSE",
          effectuePar: params.operateurId,
        } as any);

        lignesVente.push({
          produitId: lot.produitId,
          quantite: ligne.quantite,
          prixUnitaire: String(ligne.prixUnitaire),
          totalLigne: String(totalLigne),
          lotId: ligne.lotId,
        });
      }

      const [vente] = await tx.insert(ventes).values({
        agenceId: params.agenceId,
        reference: ref,
        operateurId: params.operateurId,
        clientId: params.clientId ?? null,
        modePaiement: params.modePaiement,
        montantTotal: String(montantTotal),
        montantPaye: String(params.montantPaye ?? montantTotal),
        statut: "termine",
      } as any).returning();

      for (const lv of lignesVente) {
        const [vl] = await tx.insert(ventesLignes).values({
          venteId: vente.id,
          produitId: lv.produitId,
          quantite: lv.quantite,
          prixUnitaire: lv.prixUnitaire,
          totalLigne: lv.totalLigne,
          lotId: lv.lotId,
        } as any).returning();

        await tx.update(rachatsLignes)
          .set({
            vendu: true,
            venteLigneId: vl.id,
            prixReseal: lv.prixUnitaire,
          } as any)
          .where(eq(rachatsLignes.lotId, lv.lotId));
      }

      return { id: vente.id, reference: ref, montantTotal };
    }) as any;
  }

  static async echangeBourse(params: BourseEchangeInput) {
    const marge = await BourseService.getBourseMargePourcent(params.agenceId);

    return db.transaction(async (tx) => {
      const refRachat = `ECH-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      let montantRachat = 0;
      const rachatsLignesData: any[] = [];

      for (const ligne of params.rachatLignes) {
        const [prod] = await tx.select({ prixVente: produits.prixVente })
          .from(produits).where(eq(produits.id, ligne.produitId)).limit(1);
        if (!prod) throw new TRPCError({ code: "NOT_FOUND", message: `Produit ${ligne.produitId} introuvable` });

        const etatCoefficients: Record<string, number> = { neuf: 0.7, bon: 0.5, moyen: 0.35, usage: 0.2 };
        const coeff = etatCoefficients[ligne.etat] ?? 0.2;
        const prixVente = Number(prod.prixVente);
        const prixUnitaire = Math.round(Math.min(prixVente * coeff, prixVente * 0.50) * 100) / 100;
        const totalLigne = prixUnitaire * ligne.quantite;
        montantRachat += totalLigne;

        rachatsLignesData.push({
          produitId: ligne.produitId,
          quantite: ligne.quantite,
          prixUnitaire: String(prixUnitaire),
          etat: ligne.etat,
          totalLigne: String(totalLigne),
        });
      }

      let montantEchange = 0;
      const echangeItems: any[] = [];

      for (const ligne of params.echangeLignes) {
        const [ligneRachat] = await tx.select({
          produitId: rachatsLignes.produitId,
          prixUnitaire: rachatsLignes.prixUnitaire,
        })
          .from(rachatsLignes)
          .innerJoin(lots, eq(rachatsLignes.lotId, lots.id))
          .where(eq(rachatsLignes.lotId, ligne.lotId))
          .limit(1);

        if (!ligneRachat) throw new TRPCError({ code: "NOT_FOUND", message: `Lot ${ligne.lotId} introuvable` });

        const prixRevente = Math.round(Number(ligneRachat.prixUnitaire) * (1 + marge / 100) * 100) / 100;
        const totalLigne = prixRevente * ligne.quantite;
        montantEchange += totalLigne;

        const [stockRow] = await tx.select()
          .from(stocks)
          .where(and(eq(stocks.lotId, ligne.lotId), eq(stocks.agenceId, params.agenceId)))
          .limit(1);

        if (!stockRow || Number(stockRow.quantite) < ligne.quantite) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Stock insuffisant pour le lot ${ligne.lotId}` });
        }

        echangeItems.push({ lotId: ligne.lotId, quantite: ligne.quantite, prixRevente, totalLigne, produitId: ligneRachat.produitId });
      }

      const difference = Math.round((montantEchange - montantRachat) * 100) / 100;

      const [rachat] = await tx.insert(rachats).values({
        reference: refRachat,
        clientNom: params.clientNom,
        clientContact: params.clientContact || null,
        agenceId: params.agenceId,
        operateurId: params.operateurId,
        montantTotal: String(montantRachat),
        type: "echange_bourse",
        montantEchange: String(montantEchange),
        difference: String(difference),
        stocke: true,
      } as any).returning();

      for (const rd of rachatsLignesData) {
        await tx.insert(rachatsLignes).values({ ...rd, rachatId: rachat.id } as any);

        const [lot] = await tx.insert(lots).values({
          numeroLot: `BRS-${refRachat}-${rd.produitId}`,
          produitId: rd.produitId,
          dateReception: new Date(),
          statut: "disponible",
          quantiteInitiale: rd.quantite,
          coutUnitaire: rd.prixUnitaire,
        } as any).returning();

        await tx.update(rachatsLignes)
          .set({ lotId: lot.id } as any)
          .where(and(eq(rachatsLignes.rachatId, rachat.id), eq(rachatsLignes.produitId, rd.produitId)));

        await enregistrerMouvement(tx as any, {
          type: TYPES_MOUVEMENT.ACHAT_RECEPTION,
          sens: "E",
          produitId: rd.produitId,
          agenceId: params.agenceId,
          quantite: rd.quantite,
          lotId: lot.id,
          reference: refRachat,
          referenceType: "ECHANGE_BOURSE",
          effectuePar: params.operateurId,
        } as any);
      }

      for (const ei of echangeItems) {
        const [rachatLigne] = await tx.select({ id: rachatsLignes.id })
          .from(rachatsLignes)
          .where(eq(rachatsLignes.lotId, ei.lotId))
          .limit(1);

        const [stockRow] = await tx.select()
          .from(stocks)
          .where(and(eq(stocks.lotId, ei.lotId), eq(stocks.agenceId, params.agenceId)))
          .limit(1);

        if (stockRow) {
          const stockAvant = Number(stockRow.quantite);
          const stockApres = stockAvant - ei.quantite;
          await tx.update(stocks).set({ quantite: String(stockApres) } as any).where(eq(stocks.id, stockRow.id));
        }

        if (rachatLigne) {
          await tx.update(rachatsLignes)
            .set({ vendu: true } as any)
            .where(eq(rachatsLignes.id, rachatLigne.id));
        }
      }

      return {
        id: rachat.id,
        reference: refRachat,
        montantRachat,
        montantEchange,
        difference,
      };
    }) as any;
  }
}
