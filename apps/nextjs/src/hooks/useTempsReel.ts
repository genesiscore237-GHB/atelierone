"use client";

import { useEffect, useState } from "react";

/**
 * TEMPS RÉEL — rafraîchissement automatique, suspendu quand personne ne regarde.
 *
 * ## Ce que ce n'est pas
 *
 * Un WebSocket ou un SSE imposerait un runtime serveur dédié (les fonctions
 * serverless ont une durée de vie courte), donc un déploiement différent de
 * celui du reste de l'application, donc une deuxième chose à maintenir pour le
 * même bénéfice observable.
 *
 * ## Ce que c'est
 *
 * `refetchInterval` conditionnel. L'état du véhicule, les constats et les
 * opérations se mettent à jour sans rechargement manuel — ce que l'agent
 * attend réellement (« est-ce que quelqu'un a fait quelque chose pendant que je
 * regardais ? »).
 *
 * ## La partie qui compte : la suspension
 *
 * Un `refetchInterval` inconditionnel interroge la base toutes les N secondes
 * **même onglet fermé**. Sur un écran de garage ouvert en permanence sur un
 * téléphone posé sur l'établi, c'est du trafic payé pour rien : une requête
 * toutes les 5 s, 17 280 par jour et par onglet.
 *
 * Suspendre hors visibilité rend le coût proportionnel à l'usage réel. Un agent
 * qui regarde l'écran reçoit les mises à jour ; un onglet oublié au fond
 * d'un onglet ne coûte plus rien.
 *
 * La reprise n'a rien à faire ici : `refetchOnWindowFocus` est actif par
 * défaut côté react-query, donc revenir sur l'onglet rafraîchit déjà
 * immédiatement, sans attendre le prochain tour. Réécrire ce mécanisme ici
 * serait dupliquer un comportement existant — et le pire endroit pour
 * dupliquer un comportement, c'est une logique d'invalidation.
 *
 * ## Le délai plancher
 *
 * En dessous de 2 secondes, on ne « rafraîchit plus », on martèle la base :
 * chaque réponse peut déclencher la suivante, et un parc de 200 véhicules voit
 * partir autant de requêtes en une seconde. Verrouiller le plancher empêche
 * qu'un réglage local raisonnable — ou une multiplication arithmétique — produise
 * une charge absurde sans que personne ne s'en aperçoive.
 */

export const DELAI_TEMPS_REEL_MIN_MS = 2_000;

/** Refus de descendre sous le plancher. Voir la note ci-dessus. */
export function borneIntervalle(delaiMs: number | undefined, plancher = DELAI_TEMPS_REEL_MIN_MS): number {
  if (!delaiMs || !Number.isFinite(delaiMs) || delaiMs <= 0) return plancher;
  return Math.max(plancher, Math.floor(delaiMs));
}

/**
 * Intervalle effectif : `false` quand l'onglet n'est pas visible.
 *
 * Fonction pure et séparée du hook pour être testable sans DOM — c'est elle
 * qui porte la règle, le hook ne fait que l'écouter.
 */
export function intervalleEffectif(
  visible: boolean,
  delaiMs: number | undefined,
  actif = true,
): number | false {
  if (!actif) return false;
  if (!visible) return false;
  return borneIntervalle(delaiMs);
}

/** Vrai si le document est visible. `true` par défaut s'il n'y en a pas. */
function documentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

/**
 * `refetchInterval` prêt à l'emploi pour `@tanstack/react-query`.
 *
 * @param delaiMs délai souhaité ; toute valeur < 2 s est relevée au plancher
 * @param actif   false pour couper le rafraîchissement (écran non pertinent)
 */
export function useTempsReel(delaiMs: number, actif = true): number | false {
  const [visible, setVisible] = useState(documentVisible);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setVisible(documentVisible());
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return intervalleEffectif(visible, delaiMs, actif);
}