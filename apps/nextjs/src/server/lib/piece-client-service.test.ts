import { describe, it, expect } from "vitest";
import { validerPieceClient } from "./piece-client-service";

describe("Pièces fournies par le client (specs V2 §04 processus 8, règle 10)", () => {
  it("quantité positive + libellé -> valide", () => {
    expect(validerPieceClient({ libelle: "Plaquette fournie", quantite: 1 }).ok).toBe(true);
    expect(validerPieceClient({ produitId: 3, libelle: "X", quantite: 2 }).ok).toBe(true);
  });

  it("quantité nulle ou négative -> refus", () => {
    expect(validerPieceClient({ libelle: "P", quantite: 0 }).ok).toBe(false);
    expect(validerPieceClient({ libelle: "P", quantite: -2 }).ok).toBe(false);
  });

  it("ni produit ni libellé -> refus", () => {
    const r = validerPieceClient({ libelle: "", quantite: 1 });
    expect(r.ok).toBe(false);
  });

  it("libellé blanc (espaces) seul -> refus", () => {
    expect(validerPieceClient({ libelle: "   ", quantite: 1 }).ok).toBe(false);
  });

  it("quantité acceptée en chaîne numérique non (exigence nombre)", () => {
    expect(validerPieceClient({ produitId: 5, libelle: "P", quantite: 1 }).ok).toBe(true);
  });
});