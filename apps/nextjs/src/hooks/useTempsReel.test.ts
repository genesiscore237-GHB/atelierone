import { describe, it, expect } from "vitest";
import {
  borneIntervalle,
  intervalleEffectif,
  DELAI_TEMPS_REEL_MIN_MS,
} from "./useTempsReel";

/**
 * Le temps réel repose sur une règle simple : rafraîchir quand quelqu'un
 * regarde, ne rien payer quand personne ne regarde.
 *
 * Ce qui suit n'est pas de la 구현 — c'est la preuve que la règle tient, et
 * surtout qu'elle ne peut pas être contournée par une valeur aberrante.
 */
describe("useTempsReel — intervalle effectif", () => {
  it("rafraîchit quand l'onglet est visible", () => {
    expect(intervalleEffectif(true, 5_000)).toBe(5_000);
  });

  it("ne rafraîchit PAS quand l'onglet est masqué", () => {
    // Le cœur du gain : un onglet au fond d'un onglet ne coûte plus de
    // requêtes. À 5 s, c'est 17 280 par jour et par onglet économisées.
    expect(intervalleEffectif(false, 5_000)).toBe(false);
  });

  it("coupe complètement quand l'écran n'est pas concerné", () => {
    expect(intervalleEffectif(true, 5_000, false)).toBe(false);
    expect(intervalleEffectif(false, 5_000, false)).toBe(false);
  });

  it("ne descend jamais sous le plancher — même sur une valeur absurde", () => {
    // 500 ms sur un parc de 200 véhicules = une requête toutes les demi-
    // secondes, en boucle. Le plancher rend ce réglage impossible plutôt que
    // de faire confiance à chaque appelant.
    expect(borneIntervalle(500)).toBe(DELAI_TEMPS_REEL_MIN_MS);
    expect(borneIntervalle(1)).toBe(DELAI_TEMPS_REEL_MIN_MS);
    expect(borneIntervalle(0)).toBe(DELAI_TEMPS_REEL_MIN_MS);
    expect(borneIntervalle(-1_000)).toBe(DELAI_TEMPS_REEL_MIN_MS);
    expect(borneIntervalle(Number.NaN)).toBe(DELAI_TEMPS_REEL_MIN_MS);
    expect(borneIntervalle(undefined)).toBe(DELAI_TEMPS_REEL_MIN_MS);
    expect(borneIntervalle(Number.POSITIVE_INFINITY)).toBe(DELAI_TEMPS_REEL_MIN_MS);
  });

  it("laisse passer un délai raisonnable, arrondi au sol", () => {
    expect(borneIntervalle(10_000)).toBe(10_000);
    expect(borneIntervalle(5_500.7)).toBe(5_500);
  });

  it("le plancher s'applique aussi via l'intervalle effectif", () => {
    expect(intervalleEffectif(true, 300)).toBe(DELAI_TEMPS_REEL_MIN_MS);
  });
});