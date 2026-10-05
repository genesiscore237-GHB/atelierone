/**
 * RPT-05 — Point unique de decision sur la visibilite des donnees sensibles RH.
 *
 * Pourquoi ce module existe : `canSeeSalary` etait defini en double (dans
 * `rh-centre-rapports.ts` et dans `rh-history.ts`), et plusieurs endpoints ont
 * oublie l'appel — d'ou des fuites. Une seule definition, appelee partout.
 *
 * Deux contrats distincts, a ne pas confondre :
 *
 *  1. `canSeeSalary` : QUESTION de droit. Reponse oui/non.
 *  2. `sansChamps(...)` / `purgerJson` : PROJECTION. Le contrat est que le champ
 *     soit ABSENT de l'objet, jamais `null`, `0` ou `"***"` : ces valeurs sont
 *     indiscernables d'une donnee reelle et cassent le contrat de sortie.
 */

import { RBACService } from "~/server/lib/rbac-service";

export type CtxRh = { user: { id: string; agenceId: number } };

/** Autorite sur les montants salariaux. Question binaire, sans valeur par defaut. */
export async function canSeeSalary(ctx: CtxRh): Promise<boolean> {
  if (await RBACService.isSuperAdmin(ctx.user.id)) return true;
  return RBACService.hasPermission(ctx.user.id, "rh.salaire.consulter", String(ctx.user.agenceId));
}

/** Variante synchrone pour les contextes ou l'on a deja les droits sous la main. */
export function peutVoirSalaires(droits: readonly string[] | undefined | null): boolean {
  if (!droits) return false;
  return droits.includes("rh.salaire.consulter");
}

/**
 * Retire les champs interdits. `null` et `""` sont traites comme ABSENTS : une
 * valeur vide ne peut pas non plus bearer d'information.
 */
export function sansChamps<T extends Record<string, unknown>>(
  objet: T,
  champs: readonly string[]
): Partial<T> {
  if (!objet) return objet;
  const copie: Record<string, unknown> = { ...objet };
  for (const champ of champs) {
    const valeur = copie[champ];
    if (valeur === undefined || valeur === null || valeur === "") delete copie[champ];
  }
  return copie as Partial<T>;
}

/**
 * Version stricte : le champ disparait MEME s'il porte une valeur. C'est le
 * comportement attendu pour un montant : la seule presence de la cle indique
 * deja qu'une donnee sensible existe pour cet employe.
 */
export function sansChampsStrict<T extends Record<string, unknown>>(
  objet: T,
  champs: readonly string[]
): Partial<T> {
  if (!objet) return objet;
  const copie: Record<string, unknown> = { ...objet };
  for (const champ of champs) delete copie[champ];
  return copie as Partial<T>;
}

/** Colonnes d'identification bancaire, sociale et piece d'identite. */
export const CHAMPS_SENSIBLES_IDENTITE = [
  "numCnss",
  "niu",
  "numCompteBancaire",
  "banque",
  "typePieceIdentite",
  "numPieceIdentite",
  "pieceExpireLe",
] as const;

/**
 * Fiche employee complete : identite bancaire/sociale + remuneration. Ces
 * donnees sont des coefficients de majoration sociale (CNSS/NIU), des vecteurs
 * de fraude (RIB) et des supports d'usurpation (piece d'identite).
 */
export const CHAMPS_SENSIBLES_FICHE = [
  ...CHAMPS_SENSIBLES_IDENTITE,
  "salaireBase",
  "forfaitHebdomadaire",
] as const;

/** Coordonnees personnelles. Protegees par un droit distinct du salaire. */
export const CHAMPS_SENSIBLES_CONTACT = [
  "adresse",
  "telephone",
  "telephoneSecondaire",
  "contactUrgenceNom",
  "contactUrgenceTelephone",
  "dateNaissance",
  "lieuNaissance",
] as const;

/** Valeurs monetees d'une fiche employe. */
export const CHAMPS_SENSIBLES_REMUNERATION_FICHE = [
  "salaireBase",
  "baseSalary",
  "forfaitHebdomadaire",
  "netPay",
  "avantages",
  "prime",
] as const;

/**
 * `sansChamps` pour des objets dont le TYPE declare tous les champs comme
 * obligatoires (les projections de moteur : `EtatSalaire.baseSalary: number`).
 *
 * Ce type est faux : apres projection, la cle n'existe plus. On ne peut pas le
 * corriger ici sans modifier les types de sortie des moteurs, qui sont
 * partages avec le calcul de paie — un changement de ce type se propage a
 * toute la chaine. Le cast est donc local et assume, et le contrat runtime
 * (cle absente) reste verifie par les tests d'integration.
 */
export function sansChampsTypeGenerique<T extends object>(objet: T, champs: readonly string[]): T {
  return sansChampsStrict(objet as Record<string, unknown>, champs) as T;
}

/**
 * Nettoie un JSON d'audit. Un audit enregistre l'etat AVANT/APRES d'une
 * modification : sans ce nettoyage, une correction de salaire laisse le montant
 * dans `apresJson`, et l'endpoint d'audit devient un canal de fuite contournant
 * le droit salarial.
 */
export function purgerJsonSensibles(valeur: unknown, show: boolean): unknown {
  if (valeur === null || valeur === undefined) return valeur;
  if (typeof valeur === "string") {
    try {
      return purgerJsonSensibles(JSON.parse(valeur), show);
    } catch {
      return valeur;
    }
  }
  if (Array.isArray(valeur)) return valeur.map((v) => purgerJsonSensibles(v, show));
  if (typeof valeur !== "object") return valeur;

  const source = valeur as Record<string, unknown>;
  if (show) return source;
  return sansChampsStrict(source, [
    ...CHAMPS_SENSIBLES_REMUNERATION_FICHE,
    ...CHAMPS_SENSIBLES_IDENTITE,
    ...CHAMPS_SENSIBLES_CONTACT,
  ]);
}