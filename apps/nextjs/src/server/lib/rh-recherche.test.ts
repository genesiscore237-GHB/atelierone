import { describe, it, expect } from "vitest";
import { selectionEmployesRecherche, selectionRoster, verifierReembauche } from "./rh-recherche";

describe("P18 — recherche globale : téléphones/emails employés", () => {
  it("sans `rh.employe.consulter`, les colonnes téléphone/email sont absentes du SELECT", () => {
    const colonnes = selectionEmployesRecherche(false);
    expect(colonnes.id).toBeDefined();
    expect(colonnes.nom).toBeDefined();
    expect(colonnes.telephone).toBeUndefined();
    expect(colonnes.emailPersonnel).toBeUndefined();
  });

  it("avec `rh.employe.consulter`, les colonnes téléphone/email sont sélectionnées", () => {
    const colonnes = selectionEmployesRecherche(true);
    expect(colonnes.telephone).toBeDefined();
    expect(colonnes.emailPersonnel).toBeDefined();
  });

  it("les colonnes publiques restent toujours présentes (id/nom/prenom/matricule/fonction)", () => {
    for (const canSee of [true, false]) {
      const c = selectionEmployesRecherche(canSee);
      expect(["id", "nom", "prenom", "matricule", "fonction"].every((k) => c[k])).toBe(true);
    }
  });
});

describe("N02 — rh.roster (rôles opérationnels)", () => {
  it("expose le profil annuaire minimal (id/nom/prenom/matricule/fonction/statut/département)", () => {
    const c = selectionRoster();
    expect(["id", "matricule", "nom", "prenom", "fonction", "typeEmploye", "statut", "departmentName"].every((k) => c[k])).toBe(true);
  });

  it("ne contient JAMAIS de téléphone, email ni salaire (Outillage/Planning/Travaux ne voient pas de données confidentielles)", () => {
    const c = selectionRoster();
    expect(c.telephone).toBeUndefined();
    expect(c.emailPersonnel).toBeUndefined();
    expect((c as Record<string, unknown>).salaireBase).toBeUndefined();
    expect((c as Record<string, unknown>).email).toBeUndefined();
  });
});

describe("N12/F04 — réembauche : préconditions du passage à actif", () => {
  it("refuse un employé qui n'est pas sorti", () => {
    for (const statut of ["actif", "conge", "suspendu", "archive"]) {
      expect(verifierReembauche({ statut, reembauchable: true })).toMatch(/sorti/i);
    }
  });

  it("refuse un employé sorti non réembauchable", () => {
    expect(verifierReembauche({ statut: "sorti", reembauchable: false })).toMatch(/réembauchable/i);
  });

  it("autorise un employé sorti marqué réembauchable", () => {
    expect(verifierReembauche({ statut: "sorti", reembauchable: true })).toBeNull();
    expect(verifierReembauche({ statut: "sorti", reembauchable: null })).toBeNull();
  });
});