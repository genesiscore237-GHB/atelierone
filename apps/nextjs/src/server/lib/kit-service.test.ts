import { describe, it, expect } from "vitest";
import { calculerBesoinComposants } from "./kit-service";

describe("Kits (specs V2 §02, US18)", () => {
  it("besoin = quantité ligne × quantité kit", () => {
    const lignes = [
      { composantId: 1, quantite: 2 },
      { composantId: 2, quantite: 1 },
    ];
    expect(calculerBesoinComposants(lignes, 3)).toEqual([
      { composantId: 1, quantite: 6 },
      { composantId: 2, quantite: 3 },
    ]);
  });

  it("quantité ligne en chaîne (numeric DB) acceptée", () => {
    expect(calculerBesoinComposants([{ composantId: 5, quantite: "0.5" }], 4)).toEqual([{ composantId: 5, quantite: 2 }]);
  });

  it("kit vide -> aucun besoin", () => {
    expect(calculerBesoinComposants([], 5)).toEqual([]);
  });

  it("quantité kit 1 -> besoins identiques aux lignes", () => {
    expect(calculerBesoinComposants([{ composantId: 7, quantite: 3 }], 1)).toEqual([{ composantId: 7, quantite: 3 }]);
  });

  it("ordre des composants préservé (stabilité)", () => {
    const lignes = [
      { composantId: 10, quantite: 1 },
      { composantId: 20, quantite: 1 },
      { composantId: 30, quantite: 1 },
    ];
    const besoins = calculerBesoinComposants(lignes, 2).map((b) => b.composantId);
    expect(besoins).toEqual([10, 20, 30]);
  });
});