/**
 * RH — Snapshots métier (Phase 6 — P13/N13).
 * Helpers purs, testables sans DB :
 * - `prochaineVersion` : numéro de version du prochain snapshot (ancre l'historique rejouable) ;
 * - `comparerLignes` : comparaison avant/après de lignes de détail (preuve « aucun écrasement »).
 */

export interface DiffLignes<T> {
  /** Lignes présentes uniquement après la modification */
  ajoutees: T[];
  /** Lignes présentes uniquement avant la modification */
  supprimees: T[];
  /** Lignes au même liant mais au contenu différent */
  modifiees: T[];
  /** Lignes identiques avant/après */
  inchangees: number;
}

/** Version du prochain snapshot : max(versions) + 1 (1 s'il n'en existe aucune). */
export function prochaineVersion(versions: readonly number[] | null | undefined): number {
  if (!versions || versions.length === 0) return 1;
  return Math.max(...versions) + 1;
}

/**
 * Diff structurel entre deux états de lignes (avant → après).
 * `cle` identifie une ligne de manière stable (ex. itemCode, criterionId, employeId+date).
 */
export function comparerLignes<T>(
  avant: readonly T[] | null | undefined,
  apres: readonly T[] | null | undefined,
  cle: (ligne: T) => string
): DiffLignes<T> {
  const a = avant ?? [];
  const b = apres ?? [];
  const mapA = new Map(a.map((l) => [cle(l), l] as const));
  const mapB = new Map(b.map((l) => [cle(l), l] as const));

  const ajoutees: T[] = [];
  const modifiees: T[] = [];
  let inchangees = 0;
  for (const ligne of mapB.values()) {
    const old = mapA.get(cle(ligne));
    if (!old) {
      ajoutees.push(ligne);
    } else if (JSON.stringify(old) === JSON.stringify(ligne)) {
      inchangees++;
    } else {
      modifiees.push(ligne);
    }
  }
  const supprimees: T[] = [];
  for (const ligne of mapA.values()) {
    if (!mapB.has(cle(ligne))) supprimees.push(ligne);
  }
  return { ajoutees, supprimees, modifiees, inchangees };
}