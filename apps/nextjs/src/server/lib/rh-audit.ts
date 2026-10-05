/**
 * RH — Journal avant/après (Phase R7 §43).
 * Complète `audit_logs` (TRPC : action + input, sans avant/après) avec le couple
 * avant→après JSON des mutations sensibles RH + motif OBLIGATOIRE.
 * Écrit strictement : jamais de DELETE/UPDATE sur `rh_audit_logs` (immuable).
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { rhAuditLogs } from "@atelierone/db";

export interface JournalAvantApresParams {
  agenceId: number;
  entityType: string;
  entityId: number;
  action: string;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
  motif: string;
  userId?: number | null;
}

/**
 * Journalise une mutation sensible RH avec avant→après JSON et motif obligatoire.
 * Motif vide → aucune écriture (et l'erreur remonte à l'appelant qui doit fournir un motif).
 */
export async function journaliserAvantApres(
  db: PostgresJsDatabase<Record<string, unknown>>,
  params: JournalAvantApresParams
): Promise<void> {
  if (!params.motif?.trim()) {
    throw new Error("R7: un motif (justification) est obligatoire pour tracer une mutation RH.");
  }
  await db.insert(rhAuditLogs).values({
    agenceId: params.agenceId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    avantJson: params.avant ? (JSON.parse(JSON.stringify(params.avant)) as unknown) : null,
    apresJson: params.apres ? (JSON.parse(JSON.stringify(params.apres)) as unknown) : null,
    motif: params.motif.trim(),
    userId: params.userId ?? null,
  } as any);
}