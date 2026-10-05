/**
 * P04 — navigation contextuelle : les pages RH (congés, présences, pointage, paie,
 * compétences, évaluations, sanctions, contrats, documents) pré-sélectionnent
 * l'employé pointé par le paramètre d'URL `?employeId=`.
 *
 * `parseEmployeId` est pur et testable : retourne null si le paramètre est absent,
 * non entier, mal formé ("12abc"), nul ou négatif → état vide (pas de pré-sélection).
 */
export function parseEmployeId(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(n) || String(n) !== trimmed) return null;
  return n > 0 ? n : null;
}