import { describe, it, expect } from "vitest";
import { tauxHoraire, calculerSalaireIntervalle, gainJour } from "./rh-posture-engine";

describe("rh-posture-engine", () => {
  it("taux horaire = salaire ÷ 225,3 h", () => {
    expect(tauxHoraire(225300, 225.3)).toBeCloseTo(1000, 2);
    expect(tauxHoraire(250000, 225.3)).toBeCloseTo(1109.6, 1);
  });

  it("salaire sur intervalle : heures normales seules", () => {
    const r = calculerSalaireIntervalle({
      salaireBase: 225300,
      standardMonthlyHours: 225.3,
      overtimeMultiplier: 1.5,
      joursOuvresMois: 26,
      entries: [
        { workedMinutes: 8 * 60, overtimeMinutes: 0, taskBonus: 0, isAbsent: false },
        { workedMinutes: 8 * 60, overtimeMinutes: 0, taskBonus: 0, isAbsent: false },
      ],
    });
    expect(r.tauxHoraire).toBeCloseTo(1000, 0);
    expect(r.heuresNormales).toBe(16);
    expect(r.brutBase).toBe(16000);
    expect(r.brut).toBe(16000);
    expect(r.joursAbsents).toBe(0);
  });

  it("heures supplémentaires majorées ×1,5", () => {
    const r = calculerSalaireIntervalle({
      salaireBase: 225300,
      standardMonthlyHours: 225.3,
      overtimeMultiplier: 1.5,
      joursOuvresMois: 26,
      entries: [{ workedMinutes: 9 * 60, overtimeMinutes: 1 * 60, taskBonus: 0, isAbsent: false }],
    });
    expect(r.heuresSupplementaires).toBe(1);
    expect(r.brutHS).toBe(1500); // 1000 × 1 × 1,5
    expect(r.brut).toBe(10500);
  });

  it("prime de tâche ajoutée", () => {
    const r = calculerSalaireIntervalle({
      salaireBase: 225300,
      standardMonthlyHours: 225.3,
      overtimeMultiplier: 1.5,
      joursOuvresMois: 26,
      entries: [{ workedMinutes: 8 * 60, overtimeMinutes: 0, taskBonus: 2000, isAbsent: false }],
    });
    expect(r.primesTache).toBe(2000);
    expect(r.brut).toBe(10000);
  });

  it("retenue par jour d'absence (salaire/26)", () => {
    const r = calculerSalaireIntervalle({
      salaireBase: 260000,
      standardMonthlyHours: 225.3,
      overtimeMultiplier: 1.5,
      joursOuvresMois: 26,
      entries: [
        { workedMinutes: 8 * 60, overtimeMinutes: 0, taskBonus: 0, isAbsent: false },
        { workedMinutes: 0, overtimeMinutes: 0, taskBonus: 0, isAbsent: true },
      ],
    });
    expect(r.joursAbsents).toBe(1);
    expect(r.retenuesAbsences).toBe(10000); // 260000/26
    // 8 h × (260000/225,3) − 10000 = 9232,16 − 10000 = −767,84
    expect(r.brut).toBeCloseTo(-767.84, 1);
  });

  it("gainJour : estimation d'une journée en direct", () => {
    expect(gainJour(1000, 8 * 60, 0, 0, 1.5)).toBe(8000);
    expect(gainJour(1000, 8 * 60, 2 * 60, 500, 1.5)).toBe(11500); // 8000 + 3000 + 500
  });
});