/**
 * MODULE VÉHICULES & ATELIER — MOTEUR DE RÈGLES MÉTIER (pur, sans DB).
 * Cycle d'immobilisation du véhicule dans l'atelier + règles d'ouverture d'OR.
 */

/** Les 12 statuts d'immobilisation (schéma vehicules.statut_immobilisation). */
export const STATUTS_IMMOBILISATION = [
  "en_reception",
  "en_diagnostic",
  "en_reparation",
  "attente_validation_client",
  "attente_piece_locale",
  "piece_commandee_import",
  "terminee_attente_paiement",
  "terminee_client_non_venu",
  "transfere_site2",
  "abandonne_contentieux",
  "sorti",
] as const;

export const STATUT_LABELS: Record<string, string> = {
  en_reception: "En réception",
  en_diagnostic: "En diagnostic",
  en_reparation: "En réparation",
  attente_validation_client: "Attente validation client",
  attente_piece_locale: "Attente pièce (locale)",
  piece_commandee_import: "Pièce commandée (import)",
  terminee_attente_paiement: "Terminée — attente paiement",
  terminee_client_non_venu: "Terminée — client non venu",
  transfere_site2: "Transféré site 2",
  abandonne_contentieux: "Abandonné / contentieux",
  sorti: "Sorti",
};

/** Couleur sémantique par statut pour l'UI. */
export const STATUT_STYLE: Record<string, string> = {
  en_reception: "bg-muted text-muted-foreground",
  en_diagnostic: "bg-sky-500/10 text-sky-400",
  en_reparation: "bg-primary/10 text-primary",
  attente_validation_client: "bg-warning/10 text-warning-foreground",
  attente_piece_locale: "bg-warning/10 text-warning-foreground",
  piece_commandee_import: "bg-pink-500/10 text-pink-400",
  terminee_attente_paiement: "bg-success/10 text-success-foreground",
  terminee_client_non_venu: "bg-muted text-muted-foreground",
  transfere_site2: "bg-violet-500/10 text-violet-400",
  abandonne_contentieux: "bg-destructive/10 text-destructive",
  sorti: "bg-muted text-muted-foreground line-through",
};

/** Transitions autorisées du cycle d'immobilisation (workflow atelier). */
const TRANSITIONS: Record<string, string[]> = {
  en_reception: ["en_diagnostic", "en_reparation", "sorti"],
  en_diagnostic: ["en_reparation", "attente_piece_locale", "piece_commandee_import", "attente_validation_client", "sorti"],
  en_reparation: ["attente_piece_locale", "piece_commandee_import", "attente_validation_client", "terminee_attente_paiement", "transfere_site2", "sorti"],
  attente_piece_locale: ["en_reparation", "piece_commandee_import", "terminee_attente_paiement"],
  piece_commandee_import: ["en_reparation", "attente_piece_locale"],
  attente_validation_client: ["en_reparation", "terminee_attente_paiement", "terminee_client_non_venu"],
  terminee_attente_paiement: ["sorti", "terminee_client_non_venu", "en_reparation"],
  terminee_client_non_venu: ["sorti", "en_reparation"],
  transfere_site2: ["en_reparation", "sorti"],
  abandonne_contentieux: ["sorti"],
  sorti: ["en_reception"], // ré-entrée possible
};

export function transitionStatutVehiculeValide(de: string | null | undefined, vers: string): boolean {
  if (!de) return STATUTS_IMMOBILISATION.includes(vers as any);
  const autorisees = TRANSITIONS[de] ?? [];
  return autorisees.includes(vers);
}

/** Un véhicule SORTI ne peut plus ouvrir d'ordre de réparation (ré-entrée requise). */
export function peutOuvrirOrdreVehicule(statut: string | null | undefined): boolean {
  return statut !== "sorti";
}

/** Statut imposé à l'ouverture d'un OR (le véhicule entre en réparation). */
export function statutOuvertureOR(statutActuel: string | null | undefined): string {
  return "en_reparation";
}

/** Carburants acceptés. */
export const CARBURANTS = ["essence", "diesel", "electrique", "hybride", "gpl"] as const;

/** Types de véhicules. */
export const TYPES_VEHICULE = ["voiture", "utilitaire", "poids_lourd", "moto", "autocar", "autre"] as const;