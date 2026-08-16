import { describe, it, expect } from "vitest";
import {
  countWarningsInWindow,
  windowStart,
  detectRecidivism,
  severityLabel,
  detectAllRecidivism,
} from "./disciplinary-engine";

const base = (over: Partial<{ id: number; severityLevel: number; dateSanction: string; decision: string; appliquee: boolean }> = {}) => ({
  id: 1,
  employeId: 5,
  typeSanction: "AVERT_ECRIT",
  severityLevel: 2,
  dateSanction: "2026-03-10",
  decision: "notifiee",
  appliquee: true,
  ...over,
});

describe("countWarningsInWindow", () => {
  const today = new Date("2026-08-15");
  const start = windowStart(today, 12); // 2025-08-15

  it("compte uniquement les avertissements (severity 1-2) notifiés dans la fenêtre", () => {
    const records = [
      base({ id: 1, dateSanction: "2026-03-10", severityLevel: 2 }), // dans fenêtre ✓
      base({ id: 2, dateSanction: "2025-09-01", severityLevel: 1 }), // dans fenêtre ✓
      base({ id: 3, dateSanction: "2025-01-01", severityLevel: 2 }), // hors fenêtre ✗
      base({ id: 4, dateSanction: "2026-06-01", severityLevel: 4 }), // mise à pied ≠ avertissement ✗
      base({ id: 5, dateSanction: "2026-06-02", decision: "non_notifiee" }), // non notifiée ✗
    ];
    expect(countWarningsInWindow(records, start)).toBe(2);
  });

  it("aucun avertissement → 0", () => {
    expect(countWarningsInWindow([], start)).toBe(0);
  });
});

describe("windowStart", () => {
  it("calcule le début de la période glissante (N mois en arrière)", () => {
    expect(windowStart(new Date("2026-08-15"), 12)).toBe("2025-08-15");
    expect(windowStart(new Date("2026-01-15"), 6)).toBe("2025-07-15");
  });
});

describe("detectRecidivism", () => {
  const today = new Date("2026-08-15");

  it("2 avertissements dans la fenêtre → récidive", () => {
    const records = [
      base({ id: 1, dateSanction: "2026-01-10" }),
      base({ id: 2, dateSanction: "2026-07-20" }),
    ];
    const r = detectRecidivism(records, today);
    expect(r.warningsInWindow).toBe(2);
    expect(r.isRecidivism).toBe(true);
    expect(r.windowStart).toBe("2025-08-15");
    expect(r.threshold).toBe(2);
  });

  it("1 seul avertissement → pas de récidive", () => {
    const r = detectRecidivism([base({ id: 1 })], today);
    expect(r.warningsInWindow).toBe(1);
    expect(r.isRecidivism).toBe(false);
  });

  it("seuil paramétrable (3 avertissements requis)", () => {
    const records = [base({ id: 1 }), base({ id: 2 }), base({ id: 3 })];
    const r = detectRecidivism(records, today, { months: 12, minCount: 3 });
    expect(r.isRecidivism).toBe(true);
    const r2 = detectRecidivism(records.slice(0, 2), today, { months: 12, minCount: 3 });
    expect(r2.isRecidivism).toBe(false);
  });

  it("fenêtre paramétrable (3 mois → avertissements plus anciens ignorés)", () => {
    const records = [
      base({ id: 1, dateSanction: "2026-01-10" }),
      base({ id: 2, dateSanction: "2026-07-20" }),
    ];
    const r = detectRecidivism(records, today, { months: 3, minCount: 2 });
    expect(r.warningsInWindow).toBe(1); // seul juillet dans la fenêtre 3 mois
    expect(r.isRecidivism).toBe(false);
  });
});

describe("severityLabel", () => {
  it("mappe les niveaux 1-5", () => {
    expect(severityLabel(1)).toBe("Léger");
    expect(severityLabel(3)).toBe("Grave");
    expect(severityLabel(5)).toBe("Licenciement");
  });
});

describe("detectAllRecidivism", () => {
  it("traite tous les employés", () => {
    const byEmp = {
      5: [base({ id: 1, dateSanction: "2026-01-10" }), base({ id: 2, dateSanction: "2026-07-20" })],
      6: [base({ id: 3, dateSanction: "2026-02-01" })],
    };
    const out = detectAllRecidivism(byEmp, new Date("2026-08-15"));
    expect(out[5].isRecidivism).toBe(true);
    expect(out[6].isRecidivism).toBe(false);
  });
});
