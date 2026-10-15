/**
 * Bornes de période — source unique de vérité.
 *
 * Une date de fin saisie par un utilisateur est une **date de calendrier** :
 * « jusqu'au 15 » inclut tout le 15. Or `new Date("2026-01-15")` vaut
 * `2026-01-15T00:00:00` en UTC, et une comparaison `<=` exclut donc tout ce
 * qui s'est passé dans la journée du 15.
 *
 * Concrètement : une vente enregistrée le 15 à 14h n'était jamais comptée dans
 * un rapport « jusqu'au 15 ». Le dernier jour tombe, silencieusement — et c'est
 * précisément le jour où l'utilisateur s'attend à voir le résultat. Plus grave
 * sur une clôture mensuelle : la dernière journée de ventes disparaît du
 * chiffre d'affaires.
 *
 * Ce module est PUR (aucun accès base) : il est importable par un composant
 * client sans risque de rupture de frontière, conformément à la règle de
 * `AGENTS.md`.
 */

/** Fin de journée incluse : 23:59:59.999 en heure locale. */
export function finDeJournee(valeur: string | Date): Date {
  if (valeur instanceof Date) {
    // Un Date déjà construit garde son heure : on ne touche pas à une
    // précision qu'on ne maîtrise pas (etimes analytiques, exports).
    return valeur;
  }
  // Une chaîne qui porte déjà une heure (« 2026-01-15T14:30:00 ») est
  // respectée telle quelle : seules les dates pures reçoivent la fin de journée.
  if (/[T ]\d{2}/.test(valeur)) return new Date(valeur);
  return new Date(`${valeur}T23:59:59.999`);
}

/** Début de journée : 00:00:00.000 en heure locale. */
export function debutDeJournee(valeur: string | Date): Date {
  if (valeur instanceof Date) return valeur;
  if (/[T ]\d{2}/.test(valeur)) return new Date(valeur);
  return new Date(`${valeur}T00:00:00.000`);
}

/** Borne haute d'une période : `dateFin` incluse jusqu'à la fin de la journée. */
export function borneFin(valeur: string | Date | undefined): Date | undefined {
  return valeur === undefined ? undefined : finDeJournee(valeur);
}

/** Borne basse d'une période : `dateDebut` depuis le début de la journée. */
export function borneDebut(valeur: string | Date | undefined): Date | undefined {
  return valeur === undefined ? undefined : debutDeJournee(valeur);
}