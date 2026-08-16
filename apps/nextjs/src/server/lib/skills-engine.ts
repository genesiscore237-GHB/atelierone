/**
 * RH-06 — MOTEUR COMPÉTENCES & FORMATIONS (pur, sans DB).
 * Écarts de compétences, suggestions de formation, antécédents.
 */

export interface PositionSkillRequirement {
  skillId: number;
  skillName: string;
  requiredLevel: number; // 1-5
}

export interface EmployeeSkillLevel {
  skillId: number;
  currentLevel: number; // 1-5, 0 = jamais évalué
}

export interface SkillGap {
  skillId: number;
  skillName: string;
  requiredLevel: number;
  currentLevel: number;
  gap: number; // required - current (≥1 = manquant)
  critical: boolean; // compétence critique manquante
}

/** Écart(s) entre le requis du poste et le niveau actuel de l'employé */
export function skillGaps(
  requirements: PositionSkillRequirement[],
  current: EmployeeSkillLevel[]
): SkillGap[] {
  const byId = new Map(current.map((c) => [c.skillId, c.currentLevel]));
  return requirements
    .map((r) => {
      const currentLevel = byId.get(r.skillId) ?? 0;
      const gap = r.requiredLevel - currentLevel;
      return {
        skillId: r.skillId,
        skillName: r.skillName,
        requiredLevel: r.requiredLevel,
        currentLevel,
        gap,
        critical: gap >= 2,
      };
    })
    .filter((g) => g.gap > 0);
}

/** Suggestion(s) de formation pour combler des écarts */
export function suggestTrainings(
  gaps: SkillGap[],
  trainings: Array<{ trainingId: number; title: string; skillIds: number[] }>,
  minGap = 1
): Array<{ trainingId: number; title: string; gap: number }> {
  const gapBySkill = new Map(gaps.filter((g) => g.gap >= minGap).map((g) => [g.skillId, g]));
  const scored = trainings
    .map((t) => {
      const covered = (t.skillIds ?? []).filter((s) => gapBySkill.has(s));
      if (!covered.length) return null;
      const gap = covered.reduce((sum, s) => sum + (gapBySkill.get(s)?.gap ?? 0), 0);
      return { trainingId: t.trainingId, title: t.title, gap, covered };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort((a, b) => b.gap - a.gap);
  return scored.map(({ trainingId, title, gap }) => ({ trainingId, title, gap }));
}

/** Note de maîtrise moyenne sur les compétences d'une catégorie */
export function categoryMastery(
  levels: Array<{ level: number; category: string }>,
  category: string
): number {
  const cats = levels.filter((l) => l.category === category && l.level > 0);
  if (!cats.length) return 0;
  return Math.round((cats.reduce((s, l) => s + l.level, 0) / cats.length) * 100) / 100;
}

/** Dernière formation suivie : mois écoulés (0 si jamais formé) */
export function monthsSinceLastTraining(
  lastTrainingDate: string | null,
  today: Date
): number {
  if (!lastTrainingDate) return 0;
  const d = new Date(lastTrainingDate);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(
    0,
    (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth())
  );
}
