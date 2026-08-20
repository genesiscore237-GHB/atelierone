/**
 * MOTEUR DE CALCULS STOCK (pur, sans DB) — specs module Stock.
 * PMP, disponibilité, reconditionnement, écarts d'inventaire, alertes, valorisation.
 */

// ─── PMP (Prix Moyen Pondéré) ───

/**
 * Nouveau PMP après une entrée valorisée.
 * Formule : (stockAvant × cmupAvant + quantite × coutUnitaire) / stockApres
 */
export function calculerPmp(
  stockAvant: number,
  cmupAvant: number,
  quantiteEntree: number,
  coutUnitaire: number
): number {
  const stockApres = stockAvant + quantiteEntree;
  if (stockApres <= 0) return 0;
  if (stockAvant <= 0) return coutUnitaire;
  return (stockAvant * cmupAvant + quantiteEntree * coutUnitaire) / stockApres;
}

/** Stock disponible après une sortie (0 si insuffisant, négatif sinon) */
export function stockApresSortie(stockActuel: number, quantiteSortie: number): number {
  return stockActuel - quantiteSortie;
}

/** Le stock est-il suffisant pour une sortie ? */
export function stockSuffisant(stockActuel: number, quantiteSortie: number): boolean {
  return stockActuel >= quantiteSortie;
}

/** Stock disponible = stock actuel − stock réservé (specs V2 §05 règle 4) */
export function stockDisponible(stockActuel: number, stockReserve: number | null): number {
  return stockActuel - (stockReserve ?? 0);
}

/** Une sortie est-elle autorisée sur le stock disponible (pas seulement actuel) ? */
export function stockDisponibleSuffisant(
  stockActuel: number,
  stockReserve: number | null,
  quantiteSortie: number
): boolean {
  return stockDisponible(stockActuel, stockReserve) >= quantiteSortie;
}

// ─── Reconditionnement (fût → unités) ───

export interface ResultatReconditionnement {
  quantiteGeneree: number;
  resteSource: number; // fraction non reconditionnée (perte de conversion)
  ratio: number; // 1 unité source = N unités cibles
}

/**
 * Quantité produite lors d'un reconditionnement.
 * qteGeneree = (quantiteSource × facteurSource) / facteurCible (arrondi à l'unité inférieure).
 * resteSource = fraction perdue (ex. 200L source → 39 bidons 5L + 5L de reste).
 */
export function calculerReconditionnement(
  quantiteSource: number,
  facteurSource: number,
  facteurCible: number
): ResultatReconditionnement {
  if (facteurCible <= 0) return { quantiteGeneree: 0, resteSource: quantiteSource, ratio: 0 };
  const ratio = facteurSource / facteurCible;
  const quantiteGeneree = Math.floor(quantiteSource * ratio);
  return {
    quantiteGeneree,
    resteSource: quantiteSource - quantiteGeneree / ratio,
    ratio,
  };
}

/**
 * Vérifie la cohérence du ratio fourni vs ratio théorique.
 * Retourne l'écart relatif ; > tolerance → incohérent.
 */
export function verifierRatio(
  quantiteSource: number,
  quantiteCible: number,
  facteurSource: number,
  facteurCible: number,
  tolerance = 0.05
): { coherent: boolean; ratioTheorique: number; ratioSaisi: number; ecartRelatif: number } {
  const ratioTheorique = facteurSource / facteurCible;
  const ratioSaisi = quantiteCible / quantiteSource;
  const ecartRelatif =
    ratioTheorique > 0 ? Math.abs(ratioSaisi - ratioTheorique) / ratioTheorique : Infinity;
  return { coherent: ecartRelatif <= tolerance, ratioTheorique, ratioSaisi, ecartRelatif };
}

// ─── Inventaire ───

/** Écart entre quantité physique et théorique */
export function calculerEcartInventaire(quantiteTheorique: number, quantitePhysique: number): number {
  return quantitePhysique - quantiteTheorique;
}

/** L'inventaire est-il clos (toutes les lignes comptées) ? */
export function inventaireComplet(
  totalLignes: number,
  lignesComptees: number
): boolean {
  return totalLignes > 0 && lignesComptees >= totalLignes;
}

// ─── Alertes (rupture / bas / surstock / dormant) ───

export type NiveauAlerteStock = "rupture" | "critique" | "bas" | "ok" | "surstock";

/**
 * Niveau d'alerte d'un article selon son stock et ses seuils.
 * Rupture : qte ≤ 0 · Critique : qte ≤ seuilCritique · Bas : qte ≤ seuilAlerte
 * Surstock : qte > stockMaximum · Sinon ok.
 */
export function niveauAlerteStock(
  quantite: number,
  seuilAlerte: number,
  seuilCritique: number,
  stockMaximum: number | null
): NiveauAlerteStock {
  if (quantite <= 0) return "rupture";
  if (quantite <= seuilCritique) return "critique";
  if (quantite <= seuilAlerte) return "bas";
  if (stockMaximum != null && quantite > stockMaximum) return "surstock";
  return "ok";
}

/** Article dormant : aucun mouvement depuis X jours */
export function estDormant(
  dernierMouvement: Date | string | null,
  jours: number,
  aujourdhui: Date = new Date()
): boolean {
  if (!dernierMouvement) return true; // jamais de mouvement = dormant
  const d = typeof dernierMouvement === "string" ? new Date(dernierMouvement) : dernierMouvement;
  if (Number.isNaN(d.getTime())) return true;
  const ecartJours = (aujourdhui.getTime() - d.getTime()) / 86400000;
  return ecartJours >= jours;
}

// ─── Valorisation ───

/** Valeur d'une ligne de stock (quantité × CMUP) */
export function valeurStock(quantite: number, cmup: number | null): number {
  return quantite * (cmup ?? 0);
}

/** Valeur totale d'un ensemble de lignes */
export function valeurStockTotale(
  lignes: Array<{ quantite: number; cmup: number | null }>
): number {
  return lignes.reduce((s, l) => s + valeurStock(l.quantite, l.cmup), 0);
}
