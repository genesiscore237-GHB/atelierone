import type { PgColumn } from "drizzle-orm/pg-core";
import { employes, departments } from "@atelierone/db";

export type ColonnesEmployeRecherche = {
  id?: PgColumn;
  nom?: PgColumn;
  prenom?: PgColumn;
  matricule?: PgColumn;
  fonction?: PgColumn;
  telephone?: PgColumn;
  emailPersonnel?: PgColumn;
};

/**
 * P18 — recherche globale : les colonnes téléphone/email des employés ne sont
 * jetées dans le SELECT que si l'appelant détient `rh.employe.consulter`.
 * Sans la permission, les clés sont absentes du résultat (=> null après map).
 */
export function selectionEmployesRecherche(canSeeContacts: boolean): Record<string, PgColumn> {
  const base: Record<string, PgColumn> = {
    id: employes.id,
    nom: employes.nom,
    prenom: employes.prenom,
    matricule: employes.matricule,
    fonction: employes.fonction,
  };
  if (canSeeContacts) {
    base.telephone = employes.telephone;
    base.emailPersonnel = employes.emailPersonnel;
  }
  return base;
}

/**
 * N02 — endpoint `rh.roster` destiné aux rôles opérationnels (Outillage, Planning
 * atelier, Travaux, listes OR) : profil annuaire minimal uniquement. Garantie
 * structurelle : AUCUNE colonne téléphone / email / salaire dans ce SELECT.
 */
export function selectionRoster(): Record<string, PgColumn> {
  return {
    id: employes.id,
    matricule: employes.matricule,
    nom: employes.nom,
    prenom: employes.prenom,
    fonction: employes.fonction,
    typeEmploye: employes.typeEmploye,
    statut: employes.statut,
    photoUrl: employes.photoUrl,
    departmentName: departments.name,
  };
}

/**
 * N12/F04 — préconditions de la réembauche : seul un employé sorti dont le
 * dossier est marqué réembauchable peut repasser actif. Retourne le message de
 * refus (null si la réembauche est autorisée).
 */
export function verifierReembauche(candidat: { statut: string | null; reembauchable: boolean | null }): string | null {
  if (candidat.statut !== "sorti") {
    return "Seul un employé sorti peut être réembauché.";
  }
  if (candidat.reembauchable === false) {
    return "Cet employé n'est pas réembauchable.";
  }
  return null;
}