/**
 * RH-05 — MOTEUR D'ÉVALUATION (pur, sans DB).
 * Note globale pondérée + barème de prime de performance.
 */

export interface CriterionScore {
  weight: number; // %
  score: number; // note attribuée
  maxScore: number; // échelle du critère (ex. 5)
}

export interface BonusRule {
  minScore: number;
  maxScore: number;
  bonusAmount: number;
}

/** Note globale pondérée, normalisée sur l'échelle (ex. /5) */
export function weightedScore(scores: CriterionScore[]): number {
  if (!scores.length) return 0;
  const totalWeight = scores.reduce((s, c) => s + c.weight, 0);
  if (totalWeight <= 0) return 0;
  const weighted = scores.reduce(
    (s, c) => s + (c.score / (c.maxScore || 1)) * c.weight,
    0
  );
  // Normalisé sur l'échelle maximale des critères (moyenne pondérée des max)
  const scale =
    scores.reduce((s, c) => s + (c.maxScore || 1) * c.weight, 0) / totalWeight;
  return Math.round((weighted / totalWeight) * scale * 100) / 100;
}

/** Prime de performance selon la note (barème paramétrable) */
export function bonusForScore(
  score: number,
  rules: BonusRule[]
): number {
  const rule = rules.find((r) => score >= r.minScore && score <= r.maxScore);
  return rule?.bonusAmount ?? 0;
}
