import { describe, it, expect } from "vitest";
import {
  monthlyAcquisition,
  proRataAcquisition,
  calculateBalance,
  countWorkingDays,
  overlaps,
  garageWorkingDay,
} from "./leave-engine";

describe("RH-03 — moteur de soldes de congés", () => {
  it("acquisition mensuelle : 30 j/an → 2,5 j/mois", () => {
    expect(monthlyAcquisition(30)).toBe(2.5);
    expect(monthlyAcquisition(24)).toBe(2);
    expect(monthlyAcquisition(0)).toBe(0);
  });

  it("acquisition proratisée : 6 mois travaillés → 15 j", () => {
    expect(proRataAcquisition(30, 6)).toBe(15);
    expect(proRataAcquisition(30, 12)).toBe(30);
    expect(proRataAcquisition(30, 0)).toBe(0);
  });

  it("solde = acquis + ajustements − pris", () => {
    expect(calculateBalance(30, 10, 0)).toBe(20);
    expect(calculateBalance(30, 10, 2)).toBe(22);
    expect(calculateBalance(15, 5, -1)).toBe(9);
  });

  it("jours ouvrés : lun→sam (6 j) avec dimanche exclu", () => {
    // Semaine du 17 au 23 août 2026 : lun 17 … dim 23
    expect(countWorkingDays("2026-08-17", "2026-08-22", garageWorkingDay)).toBe(6);
    expect(countWorkingDays("2026-08-17", "2026-08-23", garageWorkingDay)).toBe(6);
  });

  it("jours ouvrés : période de 3 jours ouvrés", () => {
    expect(countWorkingDays("2026-08-19", "2026-08-21", garageWorkingDay)).toBe(3);
  });

  it("chevauchement de périodes", () => {
    expect(overlaps("2026-08-10", "2026-08-15", "2026-08-14", "2026-08-20")).toBe(true);
    expect(overlaps("2026-08-10", "2026-08-15", "2026-08-16", "2026-08-20")).toBe(false);
  });
});
