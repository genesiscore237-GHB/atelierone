import { describe, it, expect } from "vitest";
import { computeParkingAlerts, DEFAULT_PARKING_CONFIG_SEUILS, type VehiculeAlertable } from "./parking-alerts";

const NOW = new Date("2026-09-16T12:00:00Z");

function makeVehicle(overrides: Partial<VehiculeAlertable> = {}): VehiculeAlertable {
  return {
    id: 1,
    numRegistre: 5,
    statut: "EN_PARKING",
    dateEntree: null,
    dateDerniereAction: null,
    dateDevis: null,
    dateCommande: null,
    dateFinTravaux: null,
    dateDerniereRelance: null,
    createdAt: null,
    ...overrides,
  };
}

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000);
}

describe("Moteur d'alertes parking", () => {
  it("aucune alerte quand il n'y a aucune donnée exploitable (aucune date inventée)", () => {
    expect(computeParkingAlerts(makeVehicle(), DEFAULT_PARKING_CONFIG_SEUILS, NOW)).toEqual([]);
  });

  it("PRET_POUR_SORTIE déclenche au-delà du seuil et expire en dessous", () => {
    const base = { statut: "TERMINE_A_RECUPERER" as const };
    const avant = computeParkingAlerts(makeVehicle({ ...base, dateFinTravaux: daysAgo(2) }), DEFAULT_PARKING_CONFIG_SEUILS, NOW);
    expect(avant.some((a) => a.code === "PRET_POUR_SORTIE")).toBe(false);

    const apres = computeParkingAlerts(makeVehicle({ ...base, dateFinTravaux: daysAgo(5) }), DEFAULT_PARKING_CONFIG_SEUILS, NOW);
    const alerte = apres.find((a) => a.code === "PRET_POUR_SORTIE");
    expect(alerte).toBeDefined();
    expect(alerte!.niveau).toBe("HAUTE");
    expect(alerte!.criteres.depuisJours).toBe(5);
  });

  it("ATTENTE_CLIENT déclenche via dateDevis, sinon repli sur dateEntree", () => {
    const v = makeVehicle({ statut: "EN_ATTENTE_DEVIS", dateDevis: daysAgo(20) });
    const a = computeParkingAlerts(v, DEFAULT_PARKING_CONFIG_SEUILS, NOW).find((x) => x.code === "ATTENTE_CLIENT");
    expect(a?.criteres.depuisJours).toBe(20);

    const v2 = makeVehicle({ statut: "EN_ATTENTE_DEVIS", dateEntree: daysAgo(16) });
    const a2 = computeParkingAlerts(v2, DEFAULT_PARKING_CONFIG_SEUILS, NOW).find((x) => x.code === "ATTENTE_CLIENT");
    expect(a2).toBeDefined();
    expect(a2!.criteres.base).toBe((v2.dateEntree as Date).toISOString());
  });

  it("ATTENTE_PIECE utilise la chaîne commande → action → entrée", () => {
    const v = makeVehicle({ statut: "EN_ATTENTE_PIECE", dateCommande: daysAgo(30), dateDerniereAction: daysAgo(2) });
    const a = computeParkingAlerts(v, DEFAULT_PARKING_CONFIG_SEUILS, NOW).find((x) => x.code === "ATTENTE_PIECE");
    expect(a).toBeDefined();
    expect(a!.criteres.depuisJours).toBe(30);
  });

  it("SANS_EVOLUTION : aucune action depuis le seuil, repli createdAt", () => {
    const v = makeVehicle({ dateDerniereAction: null, createdAt: daysAgo(16) });
    const a = computeParkingAlerts(v, DEFAULT_PARKING_CONFIG_SEUILS, NOW).find((x) => x.code === "SANS_EVOLUTION");
    expect(a).toBeDefined();
    expect(a!.criteres.depuisJours).toBe(16);

    const v2 = makeVehicle({ dateDerniereAction: daysAgo(5) });
    expect(computeParkingAlerts(v2, DEFAULT_PARKING_CONFIG_SEUILS, NOW).some((x) => x.code === "SANS_EVOLUTION")).toBe(false);
  });

  it("SANS_EVOLUTION ignoré pour un véhicule SORTI", () => {
    const v = makeVehicle({ statut: "SORTI", dateDerniereAction: daysAgo(60) });
    expect(computeParkingAlerts(v, DEFAULT_PARKING_CONFIG_SEUILS, NOW).some((x) => x.code === "SANS_EVOLUTION")).toBe(false);
  });

  it("IMMOBILISATION_LONGUE au-delà de 90 jours, niveau CRITIQUE", () => {
    const v = makeVehicle({ dateEntree: daysAgo(95) });
    const a = computeParkingAlerts(v, DEFAULT_PARKING_CONFIG_SEUILS, NOW).find((x) => x.code === "IMMOBILISATION_LONGUE");
    expect(a?.niveau).toBe("CRITIQUE");
    expect(a?.criteres.depuisJours).toBe(95);
  });

  it("DOSSIER_INCOMPLET est déclenché par le statut", () => {
    const a = computeParkingAlerts(makeVehicle({ statut: "DONNEES_INCOMPLETES" }), DEFAULT_PARKING_CONFIG_SEUILS, NOW).find((x) => x.code === "DOSSIER_INCOMPLET");
    expect(a?.niveau).toBe("BASSE");
  });

  it("TRANSFERT_A_ETUDIER est déclenché par le statut", () => {
    const a = computeParkingAlerts(makeVehicle({ statut: "A_TRANSFERER", dateEntree: daysAgo(200) }), DEFAULT_PARKING_CONFIG_SEUILS, NOW).find((x) => x.code === "TRANSFERT_A_ETUDIER");
    expect(a).toBeDefined();
    expect(a!.criteres.joursImmobilisation).toBe(200);
  });

  it("un véhicule peut cumuler plusieurs alertes", () => {
    const v = makeVehicle({ statut: "EN_ATTENTE_PIECE", dateCommande: daysAgo(100), dateEntree: daysAgo(100), dateDerniereAction: null, createdAt: daysAgo(100) });
    const codes = computeParkingAlerts(v, DEFAULT_PARKING_CONFIG_SEUILS, NOW).map((a) => a.code);
    expect(codes).toContain("ATTENTE_PIECE");
    expect(codes).toContain("IMMOBILISATION_LONGUE");
    expect(codes).toContain("SANS_EVOLUTION");
  });

  it("repecte un seuil personnalisé (config éditable)", () => {
    const v = makeVehicle({ statut: "TERMINE_A_RECUPERER", dateFinTravaux: daysAgo(20) });
    const strict = { ...DEFAULT_PARKING_CONFIG_SEUILS, seuilPretSortieJour: 30 };
    expect(computeParkingAlerts(v, strict, NOW).some((a) => a.code === "PRET_POUR_SORTIE")).toBe(false);
    expect(computeParkingAlerts(v, DEFAULT_PARKING_CONFIG_SEUILS, NOW).some((a) => a.code === "PRET_POUR_SORTIE")).toBe(true);
  });
});