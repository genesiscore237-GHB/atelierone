"use client";

import { api } from "~/trpc/react";

/**
 * Données nécessaires à la fiche OR.
 *
 * Le layout n'a besoin que du dossier, de l'équipe et des **preuves d'état**
 * des étapes. Les anciennes requêtes catalogue / stock / cores / pièces client
 * étaient chargées ici alors qu'aucun composant du layout ne les lisait : elles
 * sont supprimées. Les onglets qui en ont besoin gardent leurs propres requêtes.
 */
export function useOrQueries(id: number) {
  const { data: or, isLoading, refetch } = api.or.getById.useQuery({ id });
  const { data: employes } = api.rh.roster.useQuery({ statut: "actif" });

  // Preuves d'état pour le stepper réel. React Query déduplique ces appels
  // avec ceux des onglets qui utilisent déjà les mêmes clés.
  const { data: devisVersions } = api.or.listerDevisVersions.useQuery({ orId: id });
  const { data: demandesPieces } = api.or.listerDemandesPieces.useQuery({ orId: id });
  const { data: pointages } = api.or.listerPointages.useQuery({ orId: id });
  const { data: controlesQualite } = api.or.listerControlesQualite.useQuery({ orId: id });
  const { data: restitutions } = api.or.listerRestitutions.useQuery({ orId: id });

  return {
    or,
    employes: (employes ?? []) as any[],
    devisVersions: devisVersions ?? [],
    demandesPieces: demandesPieces ?? [],
    pointages: pointages ?? [],
    controlesQualite: controlesQualite ?? [],
    restitutions: restitutions ?? [],
    isLoading,
    refetch,
    utils: api.useUtils(),
  };
}
