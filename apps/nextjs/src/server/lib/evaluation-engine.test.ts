import { describe, it, expect } from "vitest";
import { weightedScore, bonusForScore } from "./evaluation-engine";

// Grille Technicien : 6 critères pondérés (seed RH-05)
const TECHNICIEN_CRITERIA = [
  { weight: 30, maxScore: 5 },
  { weight: 20, maxScore: 5 },
  { weight: 15, maxScore: 5 },
  { weight: 15, maxScore: 5 },
  { weight: 10, maxScore: 5 },
  { weight: 10, maxScore: 5 },
];

describe("RH-05 — moteur d'évaluation", () => {
  it("CAS 3 : note globale pondérée (4, 5, 3, 4, 5, 4 → 4,15/5)", () => {
    const scores = TECHNICIEN_CRITERIA.map((c, i) => ({
      ...c,
      score: [4, 5, 3, 4, 5, 4][i],
    }));
    expect(weightedScore(scores)).toBe(4.15);
  });

  it("tous 5/5 → 5,00", () => {
    const scores = TECHNICIEN_CRITERIA.map((c) => ({ ...c, score: 5 }));
    expect(weightedScore(scores)).toBe(5);
  });

  it("tous 1/5 → 1,00", () => {
    const scores = TECHNICIEN_CRITERIA.map((c) => ({ ...c, score: 1 }));
    expect(weightedScore(scores)).toBe(1);
  });

  it("CAS 4 : note ≥ 4/5 → prime 15 000 FCFA (barème)", () => {
    const rules = [
      { minScore: 4.5, maxScore: 5, bonusAmount: 20000 },
      { minScore: 4.0, maxScore: 4.49, bonusAmount: 15000 },
      { minScore: 3.5, maxScore: 3.99, bonusAmount: 10000 },
      { minScore: 3.0, maxScore: 3.49, bonusAmount: 5000 },
      { minScore: 0, maxScore: 2.99, bonusAmount: 0 },
    ];
    expect(bonusForScore(4.15, rules)).toBe(15000);
    expect(bonusForScore(4.8, rules)).toBe(20000);
    expect(bonusForScore(3.2, rules)).toBe(5000);
    expect(bonusForScore(2.5, rules)).toBe(0);
  });
});
