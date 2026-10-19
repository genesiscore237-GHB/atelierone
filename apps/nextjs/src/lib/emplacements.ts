/**
 * ZONES FONCTIONNELLES DE STOCKAGE (Lot 1, étape 4).
 *
 * Source UNIQUE des valeurs — importée par le serveur (router stock,
 * z.enum) ET par les composants client (selects, badges, étiquettes).
 * Module pur : ni base, ni serveur, ni React — les deux mondes peuvent
 * l'importer sans risquer de tirer un moteur de base dans le bundle client.
 *
 * Le vocabulaire est restreint à ce que la colonne `zone_stockage` accepte
 * (`0029_emplacements_stockage.sql`) : libellés affichés accentués,
 * valeurs stockées sans accents.
 */
export const ZONES_STOCKAGE = ["NORMAL", "RECEPTION", "QUARANTAINE", "REBUTS", "PERIMES"] as const;

export type ZoneStockage = (typeof ZONES_STOCKAGE)[number];

export const LABELS_ZONE_STOCKAGE: Record<ZoneStockage, string> = {
  NORMAL: "Stockage normal",
  RECEPTION: "Réception (approche)",
  QUARANTAINE: "Quarantaine",
  REBUTS: "Rebuts",
  PERIMES: "Périmés",
};

/** Lève la valeur telle quelle si la zone est inconnue (défaut de lecture). */
export function libelleZone(v: string | null | undefined): string {
  const z = (v ?? "NORMAL") as ZoneStockage;
  return LABELS_ZONE_STOCKAGE[z] ?? v ?? "NORMAL";
}
