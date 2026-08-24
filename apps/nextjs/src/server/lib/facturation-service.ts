/**
 * FACTURATION DU CYCLE — Client → Véhicule → OR → Pièces + MO → Facture.
 * Fonctions pures (testables) + transactions.
 */

/** Montant d'une ligne d'OR (totalLigne sinon quantité × PU). */
export function montantLigne(ligne: { quantite: number | string; prixUnitaire: number | string; totalLigne?: number | string | null; tva?: number | string | null }): number {
  const qte = Number(ligne.quantite);
  const pu = Number(ligne.prixUnitaire);
  const tva = Number(ligne.tva ?? 0) / 100;
  if (ligne.totalLigne != null && Number(ligne.totalLigne) > 0) return Math.round(Number(ligne.totalLigne) * 100) / 100;
  return Math.round(qte * pu * (1 + tva) * 100) / 100;
}

/** Total d'une facture = Σ lignes − remise %. */
export function calculerTotalFacture(
  lignes: Array<{ quantite: number | string; prixUnitaire: number | string; totalLigne?: number | string | null; tva?: number | string | null }>,
  remisePourcent = 0,
): number {
  const brut = lignes.reduce((s, l) => s + montantLigne(l), 0);
  return Math.round(brut * (1 - remisePourcent / 100) * 100) / 100;
}

/** Échéance d'une facture à crédit = date du jour + délai (jours). */
export function calculerEcheance(delaiJours: number, date = new Date()): string {
  const d = new Date(date);
  d.setDate(d.getDate() + delaiJours);
  return d.toISOString().slice(0, 10);
}

/** Vérification du plafond de crédit : encours + nouveau montant ≤ plafond. */
export function respectePlafondCredit(encours: number, montantFacture: number, plafond: number | null): boolean {
  if (!plafond || plafond <= 0) return true; // pas de plafond défini → illimité
  return encours + montantFacture <= plafond;
}

/** Référence de facture : FAC-{année}-{séquence 5}. */
export function genererReferenceFacture(sequence: number, date = new Date()): string {
  return `FAC-${date.getFullYear()}-${String(sequence).padStart(5, "0")}`;
}

/** Statuts d'OR facturables. */
export const STATUTS_OR_FACTURABLES = ["termine"] as const;

export const MODES_PAIEMENT = ["especes", "om", "momo", "carte", "virement", "credit"] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number];

/** Une facture à crédit est-elle comptant ? */
export function estComptant(mode: ModePaiement): boolean {
  return mode !== "credit";
}