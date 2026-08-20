import { db, kitsLignes, produits } from "@atelierone/db";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { enregistrerMouvement, TYPES_MOUVEMENT } from "~/server/lib/stock-engine";

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/** Calcul des besoins composants : quantité ligne × quantité kit (pur, testable). */
export function calculerBesoinComposants(lignes: Array<{ composantId: number; quantite: number | string }>, quantiteKit: number) {
  return lignes.map((l) => ({ composantId: l.composantId, quantite: Number(l.quantite) * quantiteKit }));
}

/**
 * SORTIE DE KIT — specs V2 §02, US18 (Epic C).
 * Sort le kit ET ses composants dans une transaction atomique :
 * chaque composant est décrémenté (quantité ligne × quantité kit) avec un
 * mouvement SORTIE_OR lié à l'OR, tous les mouvements partagent le même
 * groupeOperationId (traçabilité complète).
 */
export async function sortirKit(
  tx: Tx,
  params: {
    kitId: number;
    agenceId: number;
    quantite: number;
    orId: number;
    vehiculeId: number;
    numeroOR: string;
    motif?: string;
    effectuePar?: number;
  },
) {
  const [kit] = await tx
    .select({ id: produits.id, titre: produits.titre })
    .from(produits)
    .where(eq(produits.id, params.kitId))
    .limit(1);
  if (!kit) throw new TRPCError({ code: "BAD_REQUEST", message: "Kit introuvable." });

  const lignes = await tx
    .select({
      composantId: kitsLignes.composantId,
      quantite: kitsLignes.quantite,
      titre: produits.titre,
    })
    .from(kitsLignes)
    .innerJoin(produits, eq(produits.id, kitsLignes.composantId))
    .where(eq(kitsLignes.kitId, params.kitId)) as any[];

  if (lignes.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `« ${kit.titre} » n'a aucune composition de kit définie.` });
  }

  const groupeOperationId = randomUUID();
  const documentLie = `OR-${params.numeroOR}`;
  const motif = params.motif ?? `Sortie kit ${kit.titre} liée OR-${params.numeroOR}`;
  const composants: Array<{ composantId: number; titre: string; quantite: number; stockApres: number }> = [];

  for (const ligne of lignes) {
    const qteComposant = Number(ligne.quantite) * params.quantite;
    const res = await enregistrerMouvement(tx as any, {
      type: TYPES_MOUVEMENT.SORTIE_OR as any,
      sens: "S",
      produitId: ligne.composantId,
      agenceId: params.agenceId,
      quantite: qteComposant,
      orId: params.orId,
      vehiculeId: params.vehiculeId,
      documentLie,
      groupeOperationId,
      motif: `[Kit ${kit.titre}] ${motif}`,
      effectuePar: params.effectuePar,
    });
    composants.push({ composantId: ligne.composantId, titre: ligne.titre, quantite: qteComposant, stockApres: res.stockApres });
  }

  const resKit = await enregistrerMouvement(tx as any, {
    type: TYPES_MOUVEMENT.SORTIE_OR as any,
    sens: "S",
    produitId: params.kitId,
    agenceId: params.agenceId,
    quantite: params.quantite,
    orId: params.orId,
    vehiculeId: params.vehiculeId,
    documentLie,
    groupeOperationId,
    motif,
    effectuePar: params.effectuePar,
  });

  return { kitId: params.kitId, kitTitre: kit.titre, stockApres: resKit.stockApres, composants };
}

/** Liste des lignes de composition d'un kit (avec titres). */
export async function listerKitLignes(kitId: number) {
  const rows = await db
    .select({
      id: kitsLignes.id,
      composantId: kitsLignes.composantId,
      quantite: kitsLignes.quantite,
      titre: produits.titre,
      codeBarre: produits.codeBarre,
    })
    .from(kitsLignes)
    .innerJoin(produits, eq(produits.id, kitsLignes.composantId))
    .where(eq(kitsLignes.kitId, kitId))
    .orderBy(kitsLignes.id);
  return rows.map((r) => ({ ...r, quantite: Number(r.quantite) }));
}