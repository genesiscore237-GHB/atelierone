import { describe, it, expect } from "vitest";
import {
  presenceRate,
  repartition,
  payrollMass,
  toCsv,
  workingDaysInMonth,
} from "./rh-stats-engine";

describe("presenceRate", () => {
  it("calcule le taux de présence arrondi à 0,1", () => {
    expect(presenceRate(20, 25)).toEqual({ presentDays: 20, paidDays: 25, rate: 80 });
    expect(presenceRate(10, 25)).toEqual({ presentDays: 10, paidDays: 25, rate: 40 });
  });

  it("0 jour ouvé → taux 0", () => {
    expect(presenceRate(5, 0)).toEqual({ presentDays: 5, paidDays: 0, rate: 0 });
  });
});

describe("repartition", () => {
  it("compte par label, tri décroissant, « Non défini » pour null", () => {
    const r = repartition([
      { key: "a", label: "Atelier" },
      { key: "b", label: "Atelier" },
      { key: "c", label: "Accueil" },
      { key: null, label: null },
    ]);
    expect(r).toEqual([
      { label: "Atelier", count: 2 },
      { label: "Accueil", count: 1 },
      { label: "Non défini", count: 1 },
    ]);
  });
});

describe("payrollMass", () => {
  it("somme les salaires", () => {
    expect(payrollMass([400000, "250000", null, undefined])).toBe(650000);
    expect(payrollMass([])).toBe(0);
  });
});

describe("toCsv", () => {
  it("échappe les virgules, points-virgules et guillemets", () => {
    const csv = toCsv(["Nom", "Motif"], [["Dupont, Jean", 'Il a dit "bonjour"']]);
    expect(csv).toContain('"Dupont, Jean"');
    expect(csv).toContain('"Il a dit ""bonjour"""');
    expect(csv).toContain("\r\n");
  });

  it("lignes simples sans échappement", () => {
    const csv = toCsv(["A", "B"], [[1, "x"]]);
    expect(csv).toBe("A;B\r\n1;x");
  });
});

describe("workingDaysInMonth", () => {
  it("août 2026 : 26 jours ouvrés (lun-sat, 5 dimanches)", () => {
    // août 2026 : 1er = samedi, 31 jours, 5 dimanches → 31-5 = 26
    expect(workingDaysInMonth(2026, 8)).toBe(26);
  });

  it("exclut les fériés", () => {
    expect(workingDaysInMonth(2026, 8, ["2026-08-15"])).toBe(25);
  });
});
