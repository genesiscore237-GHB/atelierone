import { describe, it, expect } from "vitest";
import {
  transitionStatutVehiculeValide,
  peutOuvrirOrdreVehicule,
  statutOuvertureOR,
  STATUT_LABELS,
  STATUTS_IMMOBILISATION,
} from "./vehicule-service";

describe("Véhicules & Atelier — cycle d'immobilisation", () => {
  it("réception → diagnostic / réparation / sorti", () => {
    expect(transitionStatutVehiculeValide("en_reception", "en_diagnostic")).toBe(true);
    expect(transitionStatutVehiculeValide("en_reception", "en_reparation")).toBe(true);
    expect(transitionStatutVehiculeValide("en_reception", "sorti")).toBe(true);
    expect(transitionStatutVehiculeValide("en_reception", "terminee_attente_paiement")).toBe(false);
  });

  it("réparation → attente pièce / validation client / terminée", () => {
    expect(transitionStatutVehiculeValide("en_reparation", "attente_piece_locale")).toBe(true);
    expect(transitionStatutVehiculeValide("en_reparation", "piece_commandee_import")).toBe(true);
    expect(transitionStatutVehiculeValide("en_reparation", "attente_validation_client")).toBe(true);
    expect(transitionStatutVehiculeValide("en_reparation", "terminee_attente_paiement")).toBe(true);
    expect(transitionStatutVehiculeValide("en_reparation", "sorti")).toBe(true);
  });

  it("attente pièce → retour atelier quand pièce arrivée", () => {
    expect(transitionStatutVehiculeValide("attente_piece_locale", "en_reparation")).toBe(true);
    expect(transitionStatutVehiculeValide("piece_commandee_import", "en_reparation")).toBe(true);
  });

  it("terminée → sorti ; client non venu → sorti", () => {
    expect(transitionStatutVehiculeValide("terminee_attente_paiement", "sorti")).toBe(true);
    expect(transitionStatutVehiculeValide("terminee_client_non_venu", "sorti")).toBe(true);
    expect(transitionStatutVehiculeValide("terminee_attente_paiement", "en_reparation")).toBe(true);
  });

  it("sorti : terminal sauf ré-entrée en réception", () => {
    expect(transitionStatutVehiculeValide("sorti", "en_reception")).toBe(true);
    expect(transitionStatutVehiculeValide("sorti", "en_reparation")).toBe(false);
    expect(transitionStatutVehiculeValide("sorti", "en_diagnostic")).toBe(false);
  });

  it("abandonné contentieux → sorti uniquement", () => {
    expect(transitionStatutVehiculeValide("abandonne_contentieux", "sorti")).toBe(true);
    expect(transitionStatutVehiculeValide("abandonne_contentieux", "en_reparation")).toBe(false);
  });

  it("toutes les transitions restent dans les 12 statuts", () => {
    for (const statut of STATUTS_IMMOBILISATION) {
      expect(STATUT_LABELS[statut]).toBeDefined();
    }
    expect(STATUTS_IMMOBILISATION).toHaveLength(11);
  });
});

describe("Véhicules & Atelier — règles d'ouverture d'OR", () => {
  it("un véhicule SORTI ne peut pas ouvrir d'OR", () => {
    expect(peutOuvrirOrdreVehicule("sorti")).toBe(false);
    expect(peutOuvrirOrdreVehicule("en_reception")).toBe(true);
    expect(peutOuvrirOrdreVehicule("en_reparation")).toBe(true);
    expect(peutOuvrirOrdreVehicule(null)).toBe(true);
  });

  it("l'ouverture d'un OR impose en_reparation", () => {
    expect(statutOuvertureOR("en_reception")).toBe("en_reparation");
    expect(statutOuvertureOR("terminee_client_non_venu")).toBe("en_reparation");
  });
});