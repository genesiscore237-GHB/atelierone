import { describe, it, expect } from "vitest";
import {
  skillGaps,
  suggestTrainings,
  categoryMastery,
  monthsSinceLastTraining,
} from "./skills-engine";

describe("skillGaps", () => {
  const requirements = [
    { skillId: 1, skillName: "Diagnostic électronique", requiredLevel: 4 },
    { skillId: 2, skillName: "Mécanique moteur", requiredLevel: 4 },
    { skillId: 3, skillName: "Climatisation", requiredLevel: 3 },
    { skillId: 4, skillName: "Soudure", requiredLevel: 3 },
  ];

  it("détecte l'écart quand le niveau est inférieur au requis", () => {
    const gaps = skillGaps(requirements, [
      { skillId: 1, currentLevel: 2 },
      { skillId: 2, currentLevel: 4 },
      { skillId: 3, currentLevel: 3 },
      { skillId: 4, currentLevel: 0 },
    ]);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatchObject({ skillId: 1, gap: 2, critical: true });
    expect(gaps[1]).toMatchObject({ skillId: 4, gap: 3, critical: true });
  });

  it("ignore les compétences non évaluées quand elles sont acquises", () => {
    const gaps = skillGaps(requirements, [
      { skillId: 1, currentLevel: 4 },
      { skillId: 2, currentLevel: 4 },
      { skillId: 3, currentLevel: 3 },
    ]);
    expect(gaps).toHaveLength(1); // soudure requise mais jamais évaluée (0)
    expect(gaps[0]).toMatchObject({ skillId: 4, gap: 3 });
  });

  it("aucun écart quand tout est au niveau", () => {
    const gaps = skillGaps(requirements, [
      { skillId: 1, currentLevel: 4 },
      { skillId: 2, currentLevel: 4 },
      { skillId: 3, currentLevel: 3 },
      { skillId: 4, currentLevel: 3 },
    ]);
    expect(gaps).toHaveLength(0);
  });

  it("écart de 1 = manquant mais non critique", () => {
    const gaps = skillGaps(requirements, [
      { skillId: 1, currentLevel: 3 },
      { skillId: 2, currentLevel: 4 },
      { skillId: 3, currentLevel: 3 },
      { skillId: 4, currentLevel: 3 },
    ]);
    expect(gaps[0]).toMatchObject({ gap: 1, critical: false });
  });
});

describe("suggestTrainings", () => {
  const trainings = [
    { trainingId: 10, title: "Diagnostic embarqué", skillIds: [1] },
    { trainingId: 11, title: "Clim + soudure", skillIds: [3, 4] },
    { trainingId: 12, title: "Mécanique avancée", skillIds: [2] },
    { trainingId: 13, title: "Accueil client", skillIds: [99] },
  ];

  it("suggère la formation qui couvre les écarts, triée par impact", () => {
    const gaps = [
      { skillId: 1, skillName: "D", requiredLevel: 4, currentLevel: 2, gap: 2, critical: true },
      { skillId: 3, skillName: "C", requiredLevel: 3, currentLevel: 0, gap: 3, critical: true },
      { skillId: 4, skillName: "S", requiredLevel: 3, currentLevel: 0, gap: 3, critical: true },
    ];
    const suggestions = suggestTrainings(gaps, trainings);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].trainingId).toBe(11); // clim+soudure couvre 2 écarts
    expect(suggestions[0].gap).toBe(6);
    expect(suggestions[1].trainingId).toBe(10);
  });

  it("ignore les formations sans lien avec les écarts", () => {
    const gaps = [
      { skillId: 2, skillName: "M", requiredLevel: 4, currentLevel: 1, gap: 3, critical: true },
    ];
    const suggestions = suggestTrainings(gaps, trainings);
    expect(suggestions).toEqual([{ trainingId: 12, title: "Mécanique avancée", gap: 3 }]);
  });

  it("seuil minGap: pas de suggestion si l'écart est trop faible", () => {
    const gaps = [
      { skillId: 1, skillName: "D", requiredLevel: 4, currentLevel: 3, gap: 1, critical: false },
    ];
    expect(suggestTrainings(gaps, trainings, 2)).toHaveLength(0);
    expect(suggestTrainings(gaps, trainings, 1)).toHaveLength(1);
  });
});

describe("categoryMastery", () => {
  it("moyenne des niveaux par catégorie", () => {
    const levels = [
      { level: 4, category: "Atelier" },
      { level: 3, category: "Atelier" },
      { level: 0, category: "Atelier" },
      { level: 2, category: "Accueil" },
    ];
    expect(categoryMastery(levels, "Atelier")).toBe(3.5); // 0 exclu (jamais évalué)
    expect(categoryMastery(levels, "Accueil")).toBe(2);
    expect(categoryMastery(levels, "Finance")).toBe(0);
  });
});

describe("monthsSinceLastTraining", () => {
  it("compte les mois écoulés depuis la dernière formation", () => {
    expect(monthsSinceLastTraining("2026-01-15", new Date("2026-08-15"))).toBe(7);
    expect(monthsSinceLastTraining("2026-08-01", new Date("2026-08-15"))).toBe(0);
  });

  it("jamais formé → 0", () => {
    expect(monthsSinceLastTraining(null, new Date("2026-08-15"))).toBe(0);
    expect(monthsSinceLastTraining("", new Date("2026-08-15"))).toBe(0);
  });

  it("date invalide → 0", () => {
    expect(monthsSinceLastTraining("pas-une-date", new Date("2026-08-15"))).toBe(0);
  });
});
