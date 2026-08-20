import { describe, it, expect } from "vitest";
import { comptageAutorise, transitionAutorisee } from "./inventaire-service";

describe("Cycle de vie session inventaire (specs V2 Annexe Statuts)", () => {
  it("comptage uniquement en statut en_cours", () => {
    expect(comptageAutorise("brouillon")).toBe(false);
    expect(comptageAutorise("en_cours")).toBe(true);
    expect(comptageAutorise("valide")).toBe(false);
    expect(comptageAutorise("cloture")).toBe(false);
    expect(comptageAutorise(null)).toBe(false);
    expect(comptageAutorise(undefined)).toBe(false);
  });

  it("transitions autorisées : brouillon→en_cours→valide→cloture", () => {
    expect(transitionAutorisee("brouillon", "en_cours")).toBe(true);
    expect(transitionAutorisee("en_cours", "valide")).toBe(true);
    expect(transitionAutorisee("valide", "cloture")).toBe(true);
  });

  it("transitions interdites", () => {
    expect(transitionAutorisee("brouillon", "valide")).toBe(false);
    expect(transitionAutorisee("brouillon", "cloture")).toBe(false);
    expect(transitionAutorisee("en_cours", "cloture")).toBe(false);
    expect(transitionAutorisee("valide", "en_cours")).toBe(false);
    expect(transitionAutorisee("cloture", "brouillon")).toBe(false);
    expect(transitionAutorisee("cloture", "en_cours")).toBe(false);
    expect(transitionAutorisee("cloture", "valide")).toBe(false);
    expect(transitionAutorisee("cloture", "cloture")).toBe(false);
    expect(transitionAutorisee("valide", "valide")).toBe(false);
    expect(transitionAutorisee(null, "en_cours")).toBe(false);
  });
});