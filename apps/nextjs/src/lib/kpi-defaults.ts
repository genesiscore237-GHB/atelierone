/**
 * Défauts d'affichage et de jugement des KPI, partagés client/serveur.
 *
 * La table `kpi_cibles` a des défauts SQL (`%` / `HAUT`). Ils sont faux pour un
 * délai : sans cette table unique, l'écran de saisie créerait une cible « 3 % »
 * jugée « plus haut = mieux » pour le délai de livraison des pièces.
 */
export const KPI_DEFAUTS: Record<string, { unite: string; sens: "HAUT" | "BAS" }> = {
  PONCTUALITE: { unite: "%", sens: "HAUT" },
  FTQ: { unite: "%", sens: "HAUT" },
  TAUX_RETOUR_SAV: { unite: "%", sens: "BAS" },
  RAPIDITE_DIAG_JOURS: { unite: "j", sens: "BAS" },
  FIABILITE_APPRO: { unite: "%", sens: "HAUT" },
  DELAI_PIECES_JOURS: { unite: "j", sens: "BAS" },
  SATISFACTION_CLIENT: { unite: "/5", sens: "HAUT" },
  TAUX_REPRISE: { unite: "%", sens: "BAS" },
  TAUX_REACHAT: { unite: "%", sens: "HAUT" },
  TAUX_TRANSFORMATION_DEVIS: { unite: "%", sens: "HAUT" },
  PRODUCTIVITE_TECHNICIEN: { unite: "%", sens: "HAUT" },
};
