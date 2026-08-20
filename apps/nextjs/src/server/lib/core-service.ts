import { db, echangesCores, produits, ordresReparation } from "@atelierone/db";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { sortirPourOR } from "~/server/lib/stock-engine";

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/**
 * ÉCHANGE STANDARD (CORES) — specs V2 §04 processus 8, §05 règle 9.
 * Sortie de la pièce neuve (liée à un OR) + enregistrement de la coquille
 * retournée (valeur_core = dépôt) → suivi du dépôt.
 */
export async function creerEchangeCore(
  tx: Tx,
  params: {
    produitId: number;
    agenceId: number;
    quantite: number;
    orId: number;
    vehiculeId: number;
    numeroOR: string;
    valeurCore: number;
    motif?: string;
    effectuePar?: number;
  },
) {
  const [prod] = await tx
    .select({ id: produits.id, titre: produits.titre, estCore: produits.estCore })
    .from(produits)
    .where(eq(produits.id, params.produitId))
    .limit(1);
  if (!prod) throw new TRPCError({ code: "BAD_REQUEST", message: "Produit introuvable." });
  if (!prod.estCore) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `« ${prod.titre} » n'est pas une pièce en échange standard (est_core non activé).` });
  }
  if (params.valeurCore <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "La valeur du dépôt (coquille) doit être positive." });
  }

  const res = await sortirPourOR(tx as any, {
    produitId: params.produitId,
    agenceId: params.agenceId,
    quantite: params.quantite,
    orId: params.orId,
    vehiculeId: params.vehiculeId,
    numeroOR: params.numeroOR,
    motif: params.motif ?? `Échange standard core OR-${params.numeroOR}`,
    effectuePar: params.effectuePar,
  });

  const [echange] = await tx.insert(echangesCores).values({
    agenceId: params.agenceId,
    produitId: params.produitId,
    orId: params.orId,
    quantite: String(params.quantite),
    valeurCore: String(params.valeurCore),
    statut: "EN_ATTENTE",
    dateEchange: new Date(),
    mouvementId: res.mouvementId ?? null,
    motif: params.motif || null,
    creePar: params.effectuePar || null,
  } as any).returning() as any[];

  return { echangeId: echange.id, stockAvant: res.stockAvant, stockApres: res.stockApres, mouvementId: res.mouvementId };
}

/** Retour de coquille : remboursement du dépôt (ou perte → dépôt conservé). */
export async function retournerCoquille(
  tx: Tx,
  params: { echangeId: number; agenceId: number; perdue: boolean; effectuePar?: number },
) {
  const [echange] = await tx
    .select({ id: echangesCores.id, statut: echangesCores.statut })
    .from(echangesCores)
    .where(and(eq(echangesCores.id, params.echangeId), eq(echangesCores.agenceId, params.agenceId)))
    .for("update")
    .limit(1) as any[];
  if (!echange) throw new TRPCError({ code: "BAD_REQUEST", message: "Échange core introuvable." });
  if (echange.statut !== "EN_ATTENTE") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Échange déjà traité (${echange.statut}).` });
  }

  const statut = params.perdue ? "COQUILLE_PERDUE" : "COQUILLE_RETOURNEE";
  await tx.update(echangesCores)
    .set({ statut, dateRetourCoquille: params.perdue ? null : new Date() } as any)
    .where(eq(echangesCores.id, params.echangeId));

  return { echangeId: params.echangeId, statut };
}

/** Suivi des dépôts : liste des échanges (filtre par statut / OR). */
export async function listerCores(
  agenceId: number,
  params: { orId?: number; statut?: string; limit?: number },
) {
  const conditions = [
    eq(echangesCores.agenceId, agenceId),
    params.orId ? eq(echangesCores.orId, params.orId) : undefined,
    params.statut ? eq(echangesCores.statut, params.statut) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: echangesCores.id,
      produitId: echangesCores.produitId,
      produitTitre: produits.titre,
      orId: echangesCores.orId,
      numeroOR: ordresReparation.numero,
      quantite: echangesCores.quantite,
      valeurCore: echangesCores.valeurCore,
      statut: echangesCores.statut,
      dateEchange: echangesCores.dateEchange,
      dateRetourCoquille: echangesCores.dateRetourCoquille,
    })
    .from(echangesCores)
    .innerJoin(produits, eq(produits.id, echangesCores.produitId))
    .leftJoin(ordresReparation, eq(ordresReparation.id, echangesCores.orId))
    .where(and(...conditions))
    .orderBy(desc(echangesCores.dateEchange))
    .limit(params.limit ?? 100);

  return rows.map((r) => ({
    ...r,
    quantite: Number(r.quantite),
    valeurCore: Number(r.valeurCore),
  }));
}