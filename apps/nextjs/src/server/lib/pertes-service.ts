import { db } from "~/server/db";
import { pertesFinancieres } from "@atelierone/db";
import { eq, and, desc, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export type TypePerte =
  | "CASSE"
  | "VOL"
  | "AVARIE"
  | "INVENTAIRE_NEGATIF"
  | "REBUT"
  | "REJET_RECEPTION"
  | "ECART_CAISSE";

export interface EnregistrerPerteParams {
  agenceId: number;
  produitId?: number | null;
  lotId?: number | null;
  quantite?: number;
  coutUnitaire?: number;
  montantPerte: number;
  typePerte: TypePerte;
  motif?: string;
  reference?: string;
  referenceType?: string;
  effectuePar: number;
}

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

export class PertesService {
  static async enregistrerPerte(params: EnregistrerPerteParams, tx?: Tx) {
    const client = (tx ?? db) as any;
    if (!Number.isFinite(params.montantPerte) || params.montantPerte < 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Montant de perte invalide" });
    }
    const [perte] = await client.insert(pertesFinancieres).values({
      agenceId: params.agenceId,
      produitId: params.produitId ?? null,
      lotId: params.lotId ?? null,
      quantite: params.quantite != null ? String(params.quantite) : "0",
      coutUnitaire: params.coutUnitaire != null ? String(params.coutUnitaire) : "0",
      montantPerte: String(params.montantPerte),
      typePerte: params.typePerte,
      motif: params.motif || null,
      reference: params.reference || null,
      referenceType: params.referenceType || null,
      effectuePar: params.effectuePar,
    }).returning();
    return perte;
  }

  static async listerPertes(agenceId: number, depuis?: Date, limit = 200) {
    const conditions = [eq(pertesFinancieres.agenceId, agenceId)];
    if (depuis) conditions.push(gte(pertesFinancieres.datePerte, depuis));
    return db.select().from(pertesFinancieres)
      .where(and(...conditions))
      .orderBy(desc(pertesFinancieres.datePerte))
      .limit(limit);
  }
}
