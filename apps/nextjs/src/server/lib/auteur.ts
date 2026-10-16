/**
 * ATTRIBUTION — qui a fait quoi.
 *
 * ## Le piège
 *
 * Un compte utilisateur (`utilisateurs.id`) et un employé (`employes.id`) sont
 * deux entités, deux tables, deux séries de nombres. `utilisateurs` porte
 * `employe_id` vers `employes` — c'est le pont.
 *
 * Or certaines colonnes métier nomment `technicienId` et attendent un
 * `employes.id`, tandis que `or_historique.change_par` attend un
 * `utilisateurs.id`. Aucune clé étrangère ne les distingue, aucune erreur ne
 * surgit : écrire l'un à la place de l'autre attribue l'action au mauvais
 * numéro. L'historique affiche alors un nom faux, ou rien.
 *
 * C'est l'exigence « qui l'a fait », cassée à la racine — et invisible, parce
 * que rien ne signale l'erreur.
 *
 * ## La règle
 *
 * On résout par le pont, une fois, ici. `technicienId` prend TOUJOURS un
 * `employes.id` ; `changePar` prend TOUJOURS un `utilisateurs.id`. Un
 * compteur de collisions de noms n'est pas un identifiant.
 *
 * ## ATTENTION — les trois colonnes ne se ressemblent pas
 *
 * Vérifié sur le catalogue (PostgreSQL 18) :
 *
 *   lignes_ordre_reparation.technicien_id  → FK **employes**
 *   or_rapports_diagnostic.technicien_id   → **AUCUNE FK** (colonne ambiguë)
 *   or_inspections.technicien_id           → FK **utilisateurs**
 *
 * La deuxième est le défaut : sans contrainte, rien ne distingue les deux
 * lectures, et rien ne signale une erreur. On l'interprète comme `employes`,
 * par cohérence avec `lignes_ordre_reparation` — c'est la seule des deux qui
 * soit employed pour qualifier UN TRAVAIL FAIT, alors qu'une inspection est
 * un acte d'utilisateur.
 *
 * La troisième DOIT rester un `utilisateurs.id` : la base la vérifierait, et
 * elle aurait raison.
 */

import { eq } from "drizzle-orm";
import { utilisateurs } from "@atelierone/db";

/**
 * `employes.id` correspondant à un compte utilisateur, ou `null`.
 *
 * `null` est une réponse LÉGITIME et doit rester visible : un compte sans
 * fiche employé (un compte d'administration, par exemple) n'a pas d'identité
 * professionnelle. On ne devine pas un numéro pour combler le vide.
 */
export async function employeDeUtilisateur(
  exec: any,
  utilisateurId: number | string | null | undefined,
): Promise<number | null> {
  if (utilisateurId == null) return null;
  const [u] = await exec
    .select({ employeId: utilisateurs.employeId })
    .from(utilisateurs)
    .where(eq(utilisateurs.id, Number(utilisateurId)))
    .limit(1);
  return (u?.employeId ?? null) as number | null;
}