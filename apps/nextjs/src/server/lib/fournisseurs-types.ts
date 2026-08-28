/**
 * MODULE FOURNISSEURS & FACTURES — constantes partagées (router + UI).
 * Socle commun tous prestataires : pièces (circuit PIECES) et services (circuit CHARGES).
 */

export const TYPES_SERVICE = [
  "PIECES_AUTO", "PEINTURE", "OUTILLAGE", "NETTOYAGE", "INFORMATIQUE", "ENERGIE",
  "ASSURANCE", "SOUS_TRAITANCE", "EXPERTISE", "COMPTABILITE", "PUBLICITE", "AUTRE",
] as const;

export const CATEGORIES_DEPENSE = [
  "ELECTRICITE", "EAU", "NETTOYAGE", "EXPERTISE", "COMPTABILITE", "OUTILLAGE",
  "PUBLICITE", "SOUS_TRAITANCE", "LOYER", "INFORMATIQUE", "TRANSPORT", "AUTRE",
] as const;

export const TYPES_SERVICE_LABELS: Record<string, string> = {
  PIECES_AUTO: "Pièces auto", PEINTURE: "Peinture / Carrosserie", OUTILLAGE: "Outillage / Équipement",
  NETTOYAGE: "Nettoyage", INFORMATIQUE: "Informatique", ENERGIE: "Énergie / Électricité",
  ASSURANCE: "Assurance", SOUS_TRAITANCE: "Sous-traitance", EXPERTISE: "Expertise / Contrôle",
  COMPTABILITE: "Comptabilité", PUBLICITE: "Publicité / Communication", AUTRE: "Autre",
};

export const CATEGORIES_LABELS: Record<string, string> = {
  ELECTRICITE: "Électricité", EAU: "Eau", NETTOYAGE: "Nettoyage", EXPERTISE: "Expertise",
  COMPTABILITE: "Comptabilité", OUTILLAGE: "Outillage", PUBLICITE: "Publicité",
  SOUS_TRAITANCE: "Sous-traitance", LOYER: "Loyer", INFORMATIQUE: "Informatique",
  TRANSPORT: "Transport", AUTRE: "Autre",
};

export const MODES_PAIEMENT = ["especes", "carte", "momo", "om", "virement", "cheque"] as const;
export const MODES_PAIEMENT_LABELS: Record<string, string> = {
  especes: "Espèces", carte: "Carte", momo: "Mobile Money", om: "Orange Money", virement: "Virement", cheque: "Chèque",
};