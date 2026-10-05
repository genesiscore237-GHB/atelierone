/**
 * RH-04 — Avances sur salaire : règles métier pures (§4-§7, contrôles MISSION §18).
 * Extract — aucun accès DB : testable unitairement (tests obligatoires §19).
 */

export const ADVANCE_STATUTS = [
  "DEMANDÉE",
  "APPROUVÉE",
  "VERSÉE",
  "PARTIELLEMENT_RÉCUPÉRÉE",
  "RÉCUPÉRÉE",
  "ANNULÉE",
] as const;

export const ACTIFS = ["DEMANDÉE", "APPROUVÉE", "VERSÉE", "PARTIELLEMENT_RÉCUPÉRÉE"] as const;

export interface ContexteEmployeAvance {
  statut: string | null;
  salaireBase: number;
  forfaitHebdomadaire: number;
}

export interface AvanceActive {
  statut: string;
  periodeConcerneeDebut: string | null;
  periodeConcerneeFin: string | null;
}

export interface ControleSaisieAvance {
  montant: number;
  periodeConcerneeDebut: string | null;
  periodeConcerneeFin: string | null;
  avancesActives: AvanceActive[];
  employe: ContexteEmployeAvance;
}

/** Contrôles §18 : retourne un message d'erreur (ou null si valide). */
export function validerSaisieAvance(opts: ControleSaisieAvance): string | null {
  const { montant, periodeConcerneeDebut, periodeConcerneeFin, avancesActives, employe } = opts;

  // §7 : avance après sortie → refusée (dette éventuelle conservée)
  if (employe.statut === "sorti") {
    return "Impossible : avance refusée pour un employé sorti (dette éventuelle conservée).";
  }
  // §18 : avance doublée sur la même période concernée
  const aPeriode = periodeConcerneeDebut && periodeConcerneeFin;
  if (aPeriode) {
    const doublon = avancesActives.some(
      (a) => a.periodeConcerneeDebut === periodeConcerneeDebut && a.periodeConcerneeFin === periodeConcerneeFin
    );
    if (doublon) return "Avance doublée : une avance active existe déjà sur la même période.";
  }
  // §18 : plafond = salaire mensuel (base ou forfait hebdo × 4)
  const baseMensuelle = employe.salaireBase > 0 ? employe.salaireBase : employe.forfaitHebdomadaire * 4;
  if (baseMensuelle > 0 && montant > baseMensuelle) {
    return `Avance (${montant} F) supérieure au salaire mensuel (${baseMensuelle} F).`;
  }
  return null;
}

/** Contrôle §18 de récupération : jamais dépasser le montant initial, jamais après clôture. */
export function validerRecuperation(opts: {
  montant: number;
  montantRecupereAvant: number;
  montantInitial: number;
  statut: string;
}): string | null {
  const { montant, montantRecupereAvant, montantInitial, statut } = opts;
  if (statut === "ANNULÉE" || statut === "RÉCUPÉRÉE") {
    return "Avance déjà récupérée ou annulée : aucune récupération possible.";
  }
  const nouveauCumul = montantRecupereAvant + montant;
  if (nouveauCumul > montantInitial) {
    return `Récupération refusée : le cumul (${nouveauCumul} F) dépasserait le montant de l'avance (${montantInitial} F).`;
  }
  return null;
}

/** Statut et solde après une récupération acceptée (déterministe). */
export function apresRecuperation(montantInitial: number, nouveauCumul: number): { soldeRestant: number; statut: "RÉCUPÉRÉE" | "PARTIELLEMENT_RÉCUPÉRÉE" } {
  const soldeRestant = montantInitial - nouveauCumul;
  return { soldeRestant, statut: soldeRestant <= 0 ? "RÉCUPÉRÉE" : "PARTIELLEMENT_RÉCUPÉRÉE" };
}

/** Contrôle §18 d'annulation : jamais si déjà récupérée (totalement ou partiellement). */
export function validerAnnulation(opts: { montantRecupere: number; statut: string }): string | null {
  const { montantRecupere, statut } = opts;
  if (montantRecupere > 0) {
    return "Annulation refusée : des récupérations ont déjà été enregistrées. Nettoyez d'abord les lignes de récupération.";
  }
  if (statut === "RÉCUPÉRÉE") {
    return "Annulation refusée : avance intégralement récupérée.";
  }
  return null;
}

/** Base mensuelle de référence pour le plafond d'avance (base ou forfait hebdo × 4). */
export function baseMensuelleEmploye(employe: Pick<ContexteEmployeAvance, "salaireBase" | "forfaitHebdomadaire">): number {
  return employe.salaireBase > 0 ? employe.salaireBase : employe.forfaitHebdomadaire * 4;
}

/** Contrôle §18 de transition : DEMANDÉE → APPROUVÉE. */
export function validerApprobation(statut: string): string | null {
  if (statut !== "DEMANDÉE") {
    return `Impossible d'approuver : avance au statut « ${statut} » (attendue : DEMANDÉE).`;
  }
  return null;
}

/** Contrôle §18 de transition : APPROUVÉE → VERSÉE. */
export function validerVersement(statut: string): string | null {
  if (statut !== "APPROUVÉE") {
    return `Impossible de verser : avance au statut « ${statut} » (attendue : APPROUVÉE).`;
  }
  return null;
}

/** Contrôle §18 de transition : DEMANDÉE ou APPROUVÉE → ANNULÉE (refus). */
export function validerRefus(statut: string): string | null {
  if (statut !== "DEMANDÉE" && statut !== "APPROUVÉE") {
    return `Impossible de refuser : avance au statut « ${statut} » (refus possible sur DEMANDÉE ou APPROUVÉE).`;
  }
  return null;
}

/**
 * Éligibilité d'une avance à la récupération automatique de paie (P02).
 * Règle : statut VERSÉE ou PARTIELLEMENT_RÉCUPÉRÉE, solde restant strictement positif,
 * et fenêtre de récupération couvrant la période (NULL = jamais bornée).
 */
export function estEligibleRecuperationPaie(opts: {
  statut: string;
  soldeRestant: number;
  debut: string | null;
  fin: string | null;
  periodeDebut: string;
  periodeFin: string;
}): boolean {
  if (opts.statut !== "VERSÉE" && opts.statut !== "PARTIELLEMENT_RÉCUPÉRÉE") return false;
  if (opts.soldeRestant <= 0) return false;
  const debutCouvre = !opts.debut || opts.debut <= opts.periodeFin;
  const finCouvre = !opts.fin || opts.fin >= opts.periodeDebut;
  return debutCouvre && finCouvre;
}

/** Montant restant à récupérer pour la paie (borné par le solde). */
export function montantRecuperationPaie(avance: { montant: number; montantRecupere: number; soldeRestant: number }): number {
  const restant = Math.min(avance.soldeRestant, avance.montant - avance.montantRecupere);
  return restant > 0 ? restant : 0;
}

/** Génère la référence déterministe d'une avance : ADV-<yyyymm>-<id>. */
export function genererReferenceAvance(now: Date, id: number): string {
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `ADV-${yyyymm}-${id}`;
}

export interface LigneSyntheseAvance {
  montant: number | null | undefined;
  montantRecupere: number | null | undefined;
  soldeRestant: number | null | undefined;
  statut: string | null | undefined;
}

export interface SyntheseAvances {
  totalAccorde: number;
  totalRecupere: number;
  totalRestant: number;
  actives: number;
  partielles: number;
  soldees: number;
  annulees: number;
}

/** Synthèse agrégée des avances d'une liste (cards UI, §11). */
export function syntheseAvances(rows: LigneSyntheseAvance[]): SyntheseAvances {
  const out: SyntheseAvances = { totalAccorde: 0, totalRecupere: 0, totalRestant: 0, actives: 0, partielles: 0, soldees: 0, annulees: 0 };
  for (const r of rows) {
    out.totalAccorde += Number(r.montant) || 0;
    out.totalRecupere += Number(r.montantRecupere) || 0;
    out.totalRestant += Number(r.soldeRestant) || 0;
    if (r.statut === "DEMANDÉE" || r.statut === "APPROUVÉE" || r.statut === "VERSÉE") out.actives += 1;
    if (r.statut === "PARTIELLEMENT_RÉCUPÉRÉE") out.partielles += 1;
    if (r.statut === "RÉCUPÉRÉE") out.soldees += 1;
    if (r.statut === "ANNULÉE") out.annulees += 1;
  }
  return out;
}