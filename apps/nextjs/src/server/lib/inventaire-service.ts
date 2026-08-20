import { db, inventairesSessions } from "@atelierone/db";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * CYCLE DE VIE SESSION INVENTAIRE — specs V2 Annexe Statuts.
 * Brouillon → En cours → Validé → Clôturé.
 * - brouillon : session créée, le comptage est bloqué
 * - en_cours  : comptage autorisé
 * - valide    : écarts appliqués au stock (validation), comptage bloqué
 * - cloture   : archivage définitif, tout est bloqué
 */

export const STATUTS_SESSION_INVENTAIRE = ["brouillon", "en_cours", "valide", "cloture"] as const;

/** Comptage autorisé uniquement en "en_cours" (pur, testable). */
export function comptageAutorise(statut: string | null | undefined) {
  return statut === "en_cours";
}

/** Transitions autorisées (pur, testable). */
export function transitionAutorisee(de: string | null | undefined, vers: string) {
  switch (de) {
    case "brouillon": return vers === "en_cours";
    case "en_cours": return vers === "valide";
    case "valide": return vers === "cloture";
    default: return false;
  }
}

/** Passage brouillon → en_cours : démarre le comptage de la session. */
export async function demarrerSessionInventaire(params: { id: number; agenceId: number }) {
  const [session] = await db
    .select({ id: inventairesSessions.id, statut: inventairesSessions.statut })
    .from(inventairesSessions)
    .where(and(eq(inventairesSessions.id, params.id), eq(inventairesSessions.agenceId, params.agenceId)))
    .limit(1);
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session introuvable" });
  if (!transitionAutorisee(session.statut, "en_cours")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible de démarrer une session en statut « ${session.statut} ».` });
  }
  await db.update(inventairesSessions).set({ statut: "en_cours" } as any).where(eq(inventairesSessions.id, session.id));
  return { id: String(session.id), statut: "en_cours" };
}

/** Passage valide → cloture : archive définitivement la session (tout est bloqué). */
export async function cloturerSessionInventaire(params: { id: number; agenceId: number; cloturePar: number }) {
  const [session] = await db
    .select({ id: inventairesSessions.id, statut: inventairesSessions.statut })
    .from(inventairesSessions)
    .where(and(eq(inventairesSessions.id, params.id), eq(inventairesSessions.agenceId, params.agenceId)))
    .limit(1);
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session introuvable" });
  if (!transitionAutorisee(session.statut, "cloture")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Seule une session validée peut être clôturée (statut actuel « ${session.statut} »).` });
  }
  await db.update(inventairesSessions).set({ statut: "cloture", dateFin: new Date(), validePar: params.cloturePar } as any).where(eq(inventairesSessions.id, session.id));
  return { id: String(session.id), statut: "cloture" };
}