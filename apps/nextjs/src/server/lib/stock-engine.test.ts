import { describe, it, expect } from "vitest";
import { TYPES_MOUVEMENT, SENS } from "./stock-engine";

describe("stock-engine constants", () => {
  it("TYPES_MOUVEMENT defines all expected movement types", () => {
    expect(TYPES_MOUVEMENT.ACHAT_RECEPTION).toBe("ACHAT_RECEPTION");
    expect(TYPES_MOUVEMENT.DECONDITIONNEMENT_SORTIE).toBe("DECONDITIONNEMENT_SORTIE");
    expect(TYPES_MOUVEMENT.DECONDITIONNEMENT_ENTREE).toBe("DECONDITIONNEMENT_ENTREE");
    expect(TYPES_MOUVEMENT.RECONDITIONNEMENT_SORTIE).toBe("RECONDITIONNEMENT_SORTIE");
    expect(TYPES_MOUVEMENT.RECONDITIONNEMENT_ENTREE).toBe("RECONDITIONNEMENT_ENTREE");
    expect(TYPES_MOUVEMENT.TRANSFERT_SORTIE).toBe("TRANSFERT_SORTIE");
    expect(TYPES_MOUVEMENT.TRANSFERT_ENTREE).toBe("TRANSFERT_ENTREE");
    expect(TYPES_MOUVEMENT.VENTE).toBe("VENTE");
    expect(TYPES_MOUVEMENT.RETOUR_CLIENT).toBe("RETOUR_CLIENT");
    expect(TYPES_MOUVEMENT.RETOUR_FOURNISSEUR).toBe("RETOUR_FOURNISSEUR");
    expect(TYPES_MOUVEMENT.AJUSTEMENT_INVENTAIRE_POSITIF).toBe("AJUSTEMENT_INVENTAIRE_POSITIF");
    expect(TYPES_MOUVEMENT.AJUSTEMENT_INVENTAIRE_NEGATIF).toBe("AJUSTEMENT_INVENTAIRE_NEGATIF");
    expect(TYPES_MOUVEMENT.CASSE_PERTE).toBe("CASSE_PERTE");
  });

  it("SENS defines entry and exit", () => {
    expect(SENS.ENTREE).toBe("E");
    expect(SENS.SORTIE).toBe("S");
  });

  it("all movement types are accounted for", () => {
    const values = Object.values(TYPES_MOUVEMENT);
    expect(values).toHaveLength(13);
    const unique = new Set(values);
    expect(unique.size).toBe(13);
  });
});
