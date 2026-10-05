"use client";

import { api } from "~/trpc/react";

/** Agrège les données nécessaires à la fiche OR (getById + flux complémentaires). */
export function useOrQueries(id: number) {
  const { data: or, isLoading, refetch } = api.or.getById.useQuery({ id });
  const { data: produits } = api.catalog.list.useQuery({ limit: 200 });
  const { data: employes } = api.rh.roster.useQuery({ statut: "actif" });
  const { data: mvts } = api.stock.listMouvementsParOR.useQuery({ orId: id });
  const { data: cores } = api.stock.listerCores.useQuery({ orId: id });
  const { data: piecesClient } = api.or.listerPiecesClient.useQuery({ orId: id });

  return {
    or,
    produits: (produits?.items ?? []) as any[],
    employes: (employes ?? []) as any[],
    mvts: (mvts ?? []) as any[],
    cores: cores ?? [],
    piecesClient: piecesClient ?? [],
    isLoading,
    refetch,
    utils: api.useUtils(),
  };
}
