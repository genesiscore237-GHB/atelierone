import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { eq, and, or, isNull } from "drizzle-orm";
import * as schema from "./schema";

requireLocalOrForced("db:seed:rh:situations (seed-rh-situations.ts)");

/**
 * R6 — SEED DU CATALOGUE DES SITUATIONS RH (`hr_situation_types`).
 * Idempotent : n'insère que ce qui manque (agence par agence).
 * Conforme au catalogue §4 de la conception R6 V2 et à la matrice de vérité §23.
 * Les règles juridiques ne sont jamais présentées comme « politique GPJ » :
 * source = LOI  (code du travail 92/007)
 *           CONV (convention collective)
 *           POL  (politique GPJ documentée)
 *           CFG  (paramétrage garage).
 */

interface SituationTypeSeed {
  category: string;
  type: string;
  subType?: string | null;
  name: string;
  impactContrat: string;
  impactPresence: string;
  impactPlanning: string;
  impactPaie: string;
  modeCalculPaie: string;
  validationRequise: boolean;
  approbationRequise: boolean;
  requiresDocument: boolean;
  source: string;
  baseJuridique?: string | null;
  dureeMaxJours?: number | null;
  notificationEcriteRequise?: boolean;
  communicationInspectionRequise?: boolean;
}

const SITUATION_TYPES: SituationTypeSeed[] = [
  // ─── ABSENCE (constat simple → saisie immédiate) ───
  { category: "ABSENCE", type: "ABSENCE_INJUSTIFIEE", name: "Absence injustifiée", impactContrat: "ACTIVE", impactPresence: "ABSENCE", impactPlanning: "ABSENT", impactPaie: "RETENUE", modeCalculPaie: "PRORATA_JOURS", validationRequise: true, approbationRequise: false, requiresDocument: false, source: "POL", baseJuridique: "politique d'assiduité", dureeMaxJours: null },
  { category: "ABSENCE", type: "ABSENCE_AUTORISEE", name: "Absence autorisée", impactContrat: "ACTIVE", impactPresence: "PRESENCE", impactPlanning: "PLANIFIE", impactPaie: "NORMAL", modeCalculPaie: "PRORATA_JOURS", validationRequise: false, approbationRequise: false, requiresDocument: false, source: "CFG" },
  { category: "ABSENCE", type: "PERMISSION_EXCEPTIONNELLE", name: "Permission exceptionnelle", impactContrat: "ACTIVE", impactPresence: "CONGE", impactPlanning: "NON_PLANIFIABLE", impactPaie: "MAINTIEN_REMUNERATION", modeCalculPaie: "PRORATA_JOURS", validationRequise: true, approbationRequise: true, requiresDocument: false, source: "CFG" },

  // ─── CONGE (gérés par rh-leave ; situation générée à l'approbation) ───
  { category: "CONGE", type: "CONGE_ANNUEL", name: "Congé annuel", impactContrat: "ACTIVE", impactPresence: "CONGE", impactPlanning: "NON_PLANIFIABLE", impactPaie: "MAINTIEN_REMUNERATION", modeCalculPaie: "PRORATA_JOURS", validationRequise: false, approbationRequise: true, requiresDocument: false, source: "LOI", baseJuridique: "art. 89" },
  { category: "CONGE", type: "CONGE_SANS_SOLDE", name: "Congé sans solde", impactContrat: "ACTIVE", impactPresence: "CONGE", impactPlanning: "NON_PLANIFIABLE", impactPaie: "NON_REMUNERE", modeCalculPaie: "SANS", validationRequise: false, approbationRequise: true, requiresDocument: false, source: "POL" },
  { category: "CONGE", type: "CONGE_EDUCATION", name: "Congé d'éducation ouvrière", impactContrat: "ACTIVE", impactPresence: "CONGE", impactPlanning: "NON_PLANIFIABLE", impactPaie: "MAINTIEN_REMUNERATION", modeCalculPaie: "PRORATA_JOURS", validationRequise: true, approbationRequise: true, requiresDocument: true, source: "LOI", baseJuridique: "art. 91" },
  { category: "CONGE", type: "CONGE_FORMATION", name: "Congé formation", impactContrat: "ACTIVE", impactPresence: "CONGE", impactPlanning: "NON_PLANIFIABLE", impactPaie: "MAINTIEN_REMUNERATION", modeCalculPaie: "PRORATA_JOURS", validationRequise: true, approbationRequise: true, requiresDocument: true, source: "POL" },

  // ─── MALADIE (art. 32-c : 6 mois) ───
  { category: "MALADIE", type: "MALADIE", name: "Maladie", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "MAINTIEN_REMUNERATION", modeCalculPaie: "PRORATA_JOURS", validationRequise: true, approbationRequise: true, requiresDocument: true, source: "LOI", baseJuridique: "art. 32-c", dureeMaxJours: 180 },
  { category: "MALADIE", type: "MALADIE", subType: "MALADIE_PROFESSIONNELLE", name: "Maladie professionnelle", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "INDEMNISATION_EXTERNE", modeCalculPaie: "PRORATA_JOURS", validationRequise: true, approbationRequise: true, requiresDocument: true, source: "LOI", baseJuridique: "art. 32-g" },

  // ─── ACCIDENT DU TRAVAIL (art. 32-g, CNPS) ───
  { category: "ACCIDENT_TRAVAIL", type: "ACCIDENT_TRAVAIL", name: "Accident du travail", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "INDEMNISATION_EXTERNE", modeCalculPaie: "PRORATA_JOURS", validationRequise: true, approbationRequise: true, requiresDocument: true, source: "LOI", baseJuridique: "art. 32-g" },
  { category: "ACCIDENT_TRAVAIL", type: "MALADIE_PROFESSIONNELLE", name: "Maladie professionnelle", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "INDEMNISATION_EXTERNE", modeCalculPaie: "PRORATA_JOURS", validationRequise: true, approbationRequise: true, requiresDocument: true, source: "LOI", baseJuridique: "art. 32-g" },

  // ─── MATERNITE (art. 84 : 14 semaines) ───
  { category: "MATERNITE", type: "MATERNITE", name: "Maternité", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "INDEMNISATION_EXTERNE", modeCalculPaie: "PRORATA_JOURS", validationRequise: true, approbationRequise: true, requiresDocument: true, source: "LOI", baseJuridique: "art. 84", dureeMaxJours: 98 },

  // ─── DISCIPLINAIRE — mise à pied (art. 30) ───
  { category: "DISCIPLINAIRE", type: "MISE_A_PIED", name: "Mise à pied disciplinaire", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "RETENUE", modeCalculPaie: "PRORATA_JOURS", validationRequise: true, approbationRequise: true, requiresDocument: true, source: "LOI", baseJuridique: "art. 30", dureeMaxJours: 8, notificationEcriteRequise: true, communicationInspectionRequise: true },
  { category: "DISCIPLINAIRE", type: "MISE_A_PIED_CONSERVATOIRE", name: "Mise à pied conservatoire", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "A_DETERMINER", modeCalculPaie: "SANS", validationRequise: true, approbationRequise: true, requiresDocument: true, source: "LOI", baseJuridique: "art. 30", dureeMaxJours: 8, notificationEcriteRequise: true },

  // ─── SUSPENSION autre cause légale (art. 32) ───
  { category: "SUSPENSION", type: "AUTRE_CAUSE_LEGALE", name: "Autre suspension (cause légale)", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "NON_REMUNERE", modeCalculPaie: "SANS", validationRequise: true, approbationRequise: true, requiresDocument: true, source: "LOI", baseJuridique: "art. 32" },
  { category: "SUSPENSION", type: "CHOMAGE_TECHNIQUE", name: "Chômage technique", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "A_DETERMINER", modeCalculPaie: "SANS", validationRequise: true, approbationRequise: true, requiresDocument: true, source: "LOI", baseJuridique: "art. 32-2" },

  // ─── SORTIE (transition dédiée §17) ───
  { category: "SORTIE", type: "SORTIE", name: "Sortie d'effectif", impactContrat: "TERMINE", impactPresence: "NON_COMPTABLE", impactPlanning: "ABSENT", impactPaie: "PARTIEL", modeCalculPaie: "PRORATA_JOURS", validationRequise: false, approbationRequise: true, requiresDocument: false, source: "POL" },

  // ─── AUTRE (relevés libres) ───
  { category: "AUTRE", type: "AUTRE", name: "Autre situation", impactContrat: "ACTIVE", impactPresence: "PRESENCE", impactPlanning: "PLANIFIE", impactPaie: "NORMAL", modeCalculPaie: "PRORATA_JOURS", validationRequise: false, approbationRequise: false, requiresDocument: false, source: "CFG" },
];

async function main() {
  const agences = await db.select().from(schema.agences).where(eq(schema.agences.isActive, true)).orderBy(schema.agences.id);
  if (agences.length === 0) {
    console.error("Aucune agence active — exécutez d'abord db:seed:install");
    process.exit(1);
  }

  for (const agence of agences) {
    console.log(`\n=== Catalogue des situations RH — ${agence.nom} (id ${agence.id}) ===`);
    let created = 0;
    for (const t of SITUATION_TYPES) {
      const existing = await db
        .select({ id: schema.hrSituationTypes.id })
        .from(schema.hrSituationTypes)
        .where(
          and(
            eq(schema.hrSituationTypes.agenceId, agence.id),
            eq(schema.hrSituationTypes.category, t.category),
            eq(schema.hrSituationTypes.type, t.type),
            or(eq(schema.hrSituationTypes.subType, t.subType ?? ""), isNull(schema.hrSituationTypes.subType)),
          )
        )
        .limit(1);
      if (existing.length === 0) {
        await db.insert(schema.hrSituationTypes).values({
          agenceId: agence.id,
          category: t.category,
          type: t.type,
          subType: t.subType ?? null,
          name: t.name,
          impactContrat: t.impactContrat,
          impactPresence: t.impactPresence,
          impactPlanning: t.impactPlanning,
          impactPaie: t.impactPaie,
          modeCalculPaie: t.modeCalculPaie,
          baseCalculPaie: null,
          validationRequise: t.validationRequise,
          approbationRequise: t.approbationRequise,
          requiresDocument: t.requiresDocument,
          source: t.source,
          baseJuridique: t.baseJuridique ?? null,
          dureeMaxJours: t.dureeMaxJours ?? null,
          notificationEcriteRequise: t.notificationEcriteRequise ?? false,
          communicationInspectionRequise: t.communicationInspectionRequise ?? false,
          active: true,
        } as any);
        created++;
      }
    }
    console.log(`Catalogue vérifié : ${SITUATION_TYPES.length - created} déjà présents, ${created} créés.`);
  }

  console.log("\n=== Seed situations RH terminé ===");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});