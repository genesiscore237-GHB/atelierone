import { db, lignesOrdreReparation, ordresReparation } from "@atelierone/db";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/** Validation d'une pièce client (pur, testable) — specs V2 §04 processus 8. */
export function validerPieceClient(params: { produitId?: number | null; libelle: string; quantite: number }) {
  if (!params.quantite || params.quantite <= 0) {
    return { ok: false as const, message: "La quantité doit être positive." };
  }
  if (!params.produitId && !params.libelle?.trim()) {
    return { ok: false as const, message: "Choisissez un article ou saisissez un libellé." };
  }
  return { ok: true as const };
}

/**
 * TRACE D'UNE PIÈCE FOURNIE PAR LE CLIENT — specs V2 §04 processus 8, §05 règle 10.
 * La pièce est enregistrée sur l'OR (ligne type PIECE_CLIENT, fournie_par_client=true)
 * SANS impact sur le stock (elle appartient au client).
 */
export async function tracerPieceClient(
  tx: Tx,
  params: {
    orId: number;
    agenceId: number;
    produitId?: number;
    libelle: string;
    quantite: number;
    motif: string;
    effectuePar?: number;
  },
) {
  const validation = validerPieceClient({ produitId: params.produitId, libelle: params.libelle, quantite: params.quantite });
  if (!validation.ok) throw new TRPCError({ code: "BAD_REQUEST", message: validation.message });

  const [or] = await tx
    .select({ id: ordresReparation.id, numero: ordresReparation.numero, statut: ordresReparation.statut })
    .from(ordresReparation)
    .where(and(eq(ordresReparation.id, params.orId), eq(ordresReparation.agenceId, params.agenceId)))
    .limit(1);
  if (!or) throw new TRPCError({ code: "BAD_REQUEST", message: "Ordre de réparation introuvable." });
  if (or.statut === "cloture" || or.statut === "annule") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `OR ${or.numero} est ${or.statut} : ajout impossible.` });
  }

  const libelle = params.produitId ? params.libelle : params.libelle.trim();
  const [ligne] = await tx
    .insert(lignesOrdreReparation)
    .values({
      ordreId: params.orId,
      type: "PIECE_CLIENT",
      produitId: params.produitId ?? null,
      libelle,
      quantite: params.quantite,
      prixUnitaire: 0,
      totalLigne: 0,
      statut: "en_cours",
      fournieParClient: true,
      remiseAuClient: false,
      motifClient: params.motif,
      createdAt: new Date(),
    } as any)
    .returning() as any[];

  return {
    ligneId: ligne.id,
    numeroOR: or.numero,
    produitId: ligne.produitId,
    libelle: ligne.libelle,
    quantite: Number(ligne.quantite),
    fournieParClient: true,
    stockImpacte: false,
  };
}

/** Retour de l'ancienne pièce au client en fin de travaux (remise_au_client=true). */
export async function remettrePieceClient(
  tx: Tx,
  params: { ligneId: number; orId: number; agenceId: number; effectuePar?: number },
) {
  const [ligne] = await tx
    .select({ id: lignesOrdreReparation.id })
    .from(lignesOrdreReparation)
    .innerJoin(ordresReparation, eq(ordresReparation.id, lignesOrdreReparation.ordreId))
    .where(and(
      eq(lignesOrdreReparation.id, params.ligneId),
      eq(lignesOrdreReparation.ordreId, params.orId),
      eq(ordresReparation.agenceId, params.agenceId),
      eq(lignesOrdreReparation.type, "PIECE_CLIENT"),
    ))
    .limit(1);
  if (!ligne) throw new TRPCError({ code: "BAD_REQUEST", message: "Ligne pièce client introuvable." });
  await tx.update(lignesOrdreReparation).set({ remiseAuClient: true } as any).where(eq(lignesOrdreReparation.id, ligne.id));
  return { ligneId: ligne.id, remiseAuClient: true };
}

/** Liste des pièces client d'un OR (pour l'affichage). */
export async function listerPiecesClient(orId: number, agenceId: number) {
  const rows = await db
    .select({
      id: lignesOrdreReparation.id,
      type: lignesOrdreReparation.type,
      produitId: lignesOrdreReparation.produitId,
      libelle: lignesOrdreReparation.libelle,
      quantite: lignesOrdreReparation.quantite,
      statut: lignesOrdreReparation.statut,
      fournieParClient: lignesOrdreReparation.fournieParClient,
      remiseAuClient: lignesOrdreReparation.remiseAuClient,
      motifClient: lignesOrdreReparation.motifClient,
    })
    .from(lignesOrdreReparation)
    .innerJoin(ordresReparation, eq(ordresReparation.id, lignesOrdreReparation.ordreId))
    .where(and(eq(lignesOrdreReparation.ordreId, orId), eq(ordresReparation.agenceId, agenceId), eq(lignesOrdreReparation.type, "PIECE_CLIENT")))
    .orderBy(lignesOrdreReparation.id);
  return rows.map((r) => ({ ...r, quantite: Number(r.quantite) }));
}