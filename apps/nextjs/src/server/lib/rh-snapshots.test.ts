import { describe, it, expect } from "vitest";
import { prochaineVersion, comparerLignes } from "./rh-snapshots";

interface Ligne {
  code: string;
  montant: string;
}

const ligne = (code: string, montant: string): Ligne => ({ code, montant });

describe("P13/N13 — snapshot métier : versionnement", () => {
  it("prochaineVersion renvoie 1 sans historique", () => {
    expect(prochaineVersion(undefined)).toBe(1);
    expect(prochaineVersion([])).toBe(1);
  });

  it("prochaineVersion = max + 1", () => {
    expect(prochaineVersion([1])).toBe(2);
    expect(prochaineVersion([1, 3, 7])).toBe(8);
  });
});

describe("P13 — comparaison avant/après (preuve « aucun écrasement »)", () => {
  it("détecte ajout, suppression et modification de lignes", () => {
    const avant: Ligne[] = [ligne("BASE", "150000"), ligne("PRIME_PRESENCE", "15000"), ligne("AVANCE", "-50000")];
    const apres: Ligne[] = [ligne("BASE", "150000"), ligne("PRIME_PRESENCE", "12000"), ligne("CNPS", "-12000")];
    const diff = comparerLignes(avant, apres, (l) => l.code);
    expect(diff.inchangees).toBe(1); // BASE
    expect(diff.ajoutees.map((l) => l.code)).toEqual(["CNPS"]);
    expect(diff.supprimees.map((l) => l.code)).toEqual(["AVANCE"]);
    expect(diff.modifiees.map((l) => l.code)).toEqual(["PRIME_PRESENCE"]);
  });

  it("liste vide après → toutes les lignes sont supprimées", () => {
    const avant = [ligne("BASE", "150000"), ligne("CNPS", "-12000")];
    const diff = comparerLignes(avant, [], (l) => l.code);
    expect(diff.inchangees).toBe(0);
    expect(diff.ajoutees).toHaveLength(0);
    expect(diff.supprimees).toHaveLength(2);
    expect(diff.modifiees).toHaveLength(0);
  });

  it("liste vide avant → toutes les lignes sont ajoutées", () => {
    const apres = [ligne("BASE", "150000")];
    const diff = comparerLignes([], apres, (l) => l.code);
    expect(diff.inchangees).toBe(0);
    expect(diff.ajoutees).toHaveLength(1);
    expect(diff.supprimees).toHaveLength(0);
  });

  it("null en entrée est traité comme liste vide", () => {
    const diff = comparerLignes<Ligne>(null, undefined, (l) => l.code);
    expect(diff.ajoutees).toHaveLength(0);
    expect(diff.supprimees).toHaveLength(0);
    expect(diff.modifiees).toHaveLength(0);
    expect(diff.inchangees).toBe(0);
  });

  it("les clés fonctionnent aussi avec criterionId (évaluations)", () => {
    const avant = [{ criterionId: 4, score: "8" }, { criterionId: 7, score: "5" }];
    const apres = [{ criterionId: 4, score: "9" }, { criterionId: 9, score: "6" }];
    const diff = comparerLignes(avant, apres, (l) => String(l.criterionId));
    expect(diff.modifiees.map((l) => l.criterionId)).toEqual([4]);
    expect(diff.ajoutees.map((l) => l.criterionId)).toEqual([9]);
    expect(diff.supprimees.map((l) => l.criterionId)).toEqual([7]);
  });
});