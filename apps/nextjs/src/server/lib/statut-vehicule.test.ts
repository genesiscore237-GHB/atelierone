import { describe, expect, it } from "vitest";
import {
  immobilisationDepuisDossier,
  STATUT_VEHICULE_PAR_DEFAUT,
} from "./statut-vehicule";

/**
 * LOT P0.1 — Traduction statut de dossier → statut d'immobilisation.
 *
 * Cette table est la pièce qui manquait. Elle n'existait nulle part : chaque
 * endpoint écrivait le statut qu'il jugeait bon, et deux endpoints voisins
 * n'étaient pas d'accord.
 */
describe("P0.1 — statut du véhicule déduit du dossier", () => {
  it("un dossier non clos donne un statut d'immobilisation", () => {
    expect(immobilisationDepuisDossier("EN_ATTENTE_DIAGNOSTIC")).toBe("en_reception");
    expect(immobilisationDepuisDossier("EN_ATTENTE_VALIDATION_DIAGNOSTIC")).toBe("en_diagnostic");
    expect(immobilisationDepuisDossier("EN_ATTENTE_PIECES")).toBe("attente_piece_locale");
    expect(immobilisationDepuisDossier("EN_ATTENTE_VALIDATION")).toBe("attente_validation_client");
  });

  it("PRET_A_LIVRER devient « terminée, attente paiement » — la chaîne d'alerte", () => {
    // C'est LA correction qui a le plus d'effet observable. Le moteur
    // d'alertes parking ne se déclenche que sur `TERMINE_A_RECUPERER`, et
    // aucun code n'écrivait ce statut depuis le chemin atelier : un véhicule
    // prêt depuis trente jours ne produisait aucune alerte, et la place
    // restait immobilisée sans que personne ne le sache.
    expect(immobilisationDepuisDossier("PRET_A_LIVRER")).toBe("terminee_attente_paiement");
  });

  it("les dossiers terminaux ne décident pas du statut du véhicule", () => {
    // `null` et non « en réception » : un dossier annulé ne dit rien du sort
    // du véhicule. C'est le registre parking qui répond, et à défaut le
    // repli. Inventer « en réception » ferait réapparaître dans le parc
    // d'atelier un véhicule parti ou vendu.
    expect(immobilisationDepuisDossier("LIVRE")).toBe("sorti");
    expect(immobilisationDepuisDossier("ANNULE")).toBeNull();
    expect(immobilisationDepuisDossier("ferme_definitif")).toBeNull();
  });

  it("un statut inconnu ne devient pas « en réception » par défaut", () => {
    // Non testé avant : un statut écrit à la main (ce que le varchar libre
    // permettait) ne doit pas faire basculer le véhicule dans le parc.
    expect(immobilisationDepuisDossier("N_IMPORTE_QUOI")).toBeNull();
    expect(immobilisationDepuisDossier("")).toBeNull();
    expect(immobilisationDepuisDossier(null)).toBeNull();
    expect(immobilisationDepuisDossier(undefined)).toBeNull();
  });

  it("le repli existe et est explicite", () => {
    expect(STATUT_VEHICULE_PAR_DEFAUT).toBe("en_reception");
  });
});