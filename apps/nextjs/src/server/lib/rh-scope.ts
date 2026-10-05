import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { employes } from "@atelierone/db";

/**
 * N01 — Durcissement multi-agence (Phase 3).
 * Vérifie qu'un employé appartient bien à l'agence courante avant toute
 * lecture/écriture transverse (tables sans colonne agenceId : postures,
 * soldes, sanctions, documents…). Toute accès invalide → 404 (aucune fuite,
 * aucun orin).
 *
 * `verifier` est injectable pour les tests unitaires (faux monde agence).
 */
export async function assertEmployeEnAgence(
  employeId: number,
  agenceId: number,
  verifier: (employeId: number, agenceId: number) => Promise<boolean> = employeEnAgence
): Promise<void> {
  const ok = await verifier(employeId, agenceId);
  if (!ok) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Employé introuvable." });
  }
}

/** Vraie requête : l'employé existe ET dépend de l'agence. */
export async function employeEnAgence(employeId: number, agenceId: number): Promise<boolean> {
  const rows = await db
    .select({ id: employes.id })
    .from(employes)
    .where(and(eq(employes.id, employeId), eq(employes.agenceId, agenceId)))
    .limit(1);
  return rows.length > 0;
}