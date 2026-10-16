"use client";

import { useEffect, useState } from "react";

/**
 * Anti-rebond : attend que la saisie se calme avant de déclencher.
 *
 * Sans lui, taper « 677001122 » — dix caractères — émet dix requêtes. Sur une
 * liste de parc, chacune compte un `count(*)` et des compteurs par statut :
 * c'est dix balayages de table pour une recherche.
 *
 * L'inventaire P1.1 a trouvé TROIS implémentations séparées de ce mécanisme,
 * dont une sans anti-rebond (la liste atelier) et une locale à un seul fichier.
 * Elles divergeaient sur le délai — 300 ms ici, aucun là. Une seule règle, donc
 * un seul comportement : ce qui est tapé est cherché partout de la même façon.
 *
 * Le délai de 300 ms est le compromis usuel : assez long pour éviter la rafale,
 * assez court pour ne pas faire attendre. Ce n'est pas un réglage cosmétique —
 * un délai différent par écran fait qu'un agent comparant deux écrans pense
 * que l'un des deux est en retard.
 */
export function useDebounce<T>(valeur: T, delai = 300): T {
  const [differee, setDifferee] = useState(valeur);

  useEffect(() => {
    const t = setTimeout(() => setDifferee(valeur), delai);
    return () => clearTimeout(t);
  }, [valeur, delai]);

  return differee;
}