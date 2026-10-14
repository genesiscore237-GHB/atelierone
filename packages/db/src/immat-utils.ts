import { sql, type SQL } from "drizzle-orm";
import type { Column } from "drizzle-orm";

/**
 * LOT R1 — Normalisation d'immatriculation, source unique de vérité.
 *
 * Une même plaque peut être saisie différemment selon l'opérateur
 * (« AB-123-CD », « ab 123 cd », « AB123CD »). Pour empêcher les doublons,
 * chaque plaque est réduite à une forme normalisée :
 *   trim → suppression de tous les espaces/caractères de contrôle → majuscules.
 * La ponctuation (tirets, points) est CONSERVÉE : elle fait partie du libellé
 * officiel de la plaque et la retirer fusionnerait à tort « AB-123-CD » et
 * « AB123CD » qui peuvent être deux plaques distinctes au Cameroun.
 *
 * Cette fonction JS est LA référence. Son équivalent SQL exact est
 * `immatNormaleSql` (colonne) et `immatNormaleCondition` (comparaison) — les
 * deux doivent rester alignés.
 */

/** Forme normalisée d'une plaque (côté JS). Chaîne vide si absente. */
export function normaliserImmat(immat: string | null | undefined): string {
  return (immat ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

/**
 * Expression SQL produisant la plaque normalisée à partir d'une colonne.
 * Alignée sur `normaliserImmat` : btrim + regexp_replace(espaces) + upper.
 */
export function immatNormaleSql(col: SQL | Column): SQL {
  return sql`upper(regexp_replace(btrim(${col as SQL}), '\s+', '', 'g'))`;
}

/**
 * Construit une condition SQL comparant une colonne plaque à une valeur brute,
 * en normalisant les DEUX côtés. Usage :
 *   .where(immatNormaleCondition(vehicules.immatriculation, "ab 123 cd"))
 * Équivalent à : normaliserImmat(col) === normaliserImmat(valeur).
 */
export function immatNormaleCondition(col: SQL | Column, valeur: string): SQL {
  const norm = normaliserImmat(valeur);
  if (!norm) return sql`false`;
  return sql`${immatNormaleSql(col as SQL)} = ${norm}`;
}

/**
 * Ordre de préférence quand plusieurs lignes portent la même plaque normalisée.
 *
 * La colonne dérivée `immat_norm` n'est renseignée que par les écritures
 * récentes (et par le backfill dedup-vehicules-immat) : une ligne héritée
 * (fixtures, import) peut encore l'avoir à NULL tout en portant une plaque
 * valide. On privilégie donc la ligne dont `immat_norm` est déjà renseignée
 * (c'est celle qui est couverte par l'index unique partiel), puis la plus
 * ancienne (`id` croissant) — règle de fusion retenue par le dedup.
 *
 * Usage : .orderBy(immatNormPreferenceSql(vehicules.immatNorm))
 */
export function immatNormPreferenceSql(normCol: SQL | Column): SQL {
  return sql`(${normCol as SQL} IS NULL), ${normCol as SQL}`;
}
