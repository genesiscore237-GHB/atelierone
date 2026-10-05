/**
 * R6 — Chargement DB des situations ACTIF d'une agence sur une période,
 * projetées en `SituationLike[]` pour les moteurs purs (situations-engine).
 * Point d'entrée unique pour la PAIE (R4) et la PROJECTION (rh-situation) :
 * « R6 fournit les événements, R4 calcule » (§20-22).
 */
import { db } from "~/server/db";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { employeeSituations } from "@atelierone/db";
import type { SituationLike } from "~/server/lib/situations-engine";

const toIso = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
};

/** Situations ACTIF dont l'intervalle d'effet croise [debut, fin], par employé. */
export async function chargerSituationsActives(
  agenceId: number,
  debut: string,
  fin: string
): Promise<Map<number, SituationLike[]>> {
  const rows = await db
    .select()
    .from(employeeSituations)
    .where(
      and(
        eq(employeeSituations.agenceId, agenceId),
        eq(employeeSituations.statutWorkflow, "ACTIF"),
        lte(sql`COALESCE(${employeeSituations.dateEffet}, ${employeeSituations.dateDebut})`, fin),
        or(
          isNull(employeeSituations.dateFin),
          gte(employeeSituations.dateFin, debut),
        ),
      )
    );

  const map = new Map<number, SituationLike[]>();
  for (const r of rows) {
    const like: SituationLike = {
      id: r.id,
      category: r.category,
      type: r.type,
      subType: r.subType ?? null,
      dateDebut: toIso(r.dateDebut) as string,
      dateFin: toIso(r.dateFin),
      dateEffet: toIso(r.dateEffet),
      dureeJours: r.dureeJours ?? null,
      impactContrat: r.impactContrat,
      impactPresence: r.impactPresence,
      impactPlanning: r.impactPlanning,
      impactPaie: r.impactPaie,
      modeCalculPaie: r.modeCalculPaie ?? null,
      validationRequise: r.validationRequise,
      statutWorkflow: r.statutWorkflow,
      notificationEcrite: r.notificationEcrite,
      communicationInspection: r.communicationInspection,
      montantRetenue: r.montantRetenue as string | null,
      anomalie: r.anomalie ?? null,
    };
    const arr = map.get(r.employeeId) ?? [];
    arr.push(like);
    map.set(r.employeeId, arr);
  }
  return map;
}