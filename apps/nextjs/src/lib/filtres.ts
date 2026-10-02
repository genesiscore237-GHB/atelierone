/** Filtres persistants pour la page vehicules (liste et fiche).
 *
 * Ces fonctions lisent / ecrivent les filtres dans l'URL via useSearchParams,
 * de sorte que le partage d'un lien conserve l'etat de filtrage (statut, date,
 * provenance, etc.).
 *
 * Toutes les valeurs lues sont strings (depuis l'URL). Le composant appelant
 * fera le cast vers le type attendu (number, Date, boolean).
 */

import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";

/** Type unifie pour toutes les valeurs de filtre. */
export type ValeurFiltre =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;

/** Clefs de filtre connues, correspondants aux params de l'URL. */
export type CleFiltre =
  | "statut"
  | "provenance"
  | "client"
  | "dateEntreeDeb"
  | "dateEntreeFin"
  | "marque"
  | "modele"
  | "immatriculation";

/** Interface decrite : chaque composant peut importer seulement ce dont il a besoin. */
export interface FiltresVehicules {
  statut: string | null;
  provenance: string | null;
  client: string | null;
  dateEntreeDeb: Date | null;
  dateEntreeFin: Date | null;
  marque: string | null;
  modele: string | null;
  immatriculation: string | null;
}

/** Lit les filtres depuis l'URL et retourne un objet FiltresVehicules type. */
export function lireFiltres(searchParams: URLSearchParams): FiltresVehicules {
  const get = (key: string) => searchParams.get(key) ?? null;
  const getDate = (key: string): Date | null => {
    const v = searchParams.get(key);
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  return {
    statut: get("statut"),
    provenance: get("provenance"),
    client: get("client"),
    dateEntreeDeb: getDate("dateEntreeDeb"),
    dateEntreeFin: getDate("dateEntreeFin"),
    marque: get("marque"),
    modele: get("modele"),
    immatriculation: get("immatriculation"),
  };
}

/** Ecrit les filtres dans l'URL (remplace les params existants). */
export function ecrireFiltres(
  searchParams: URLSearchParams,
  filtres: Partial<FiltresVehicules>,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(filtres)) {
    if (value === null || value === undefined || value === "") {
      next.delete(key);
    } else if (value instanceof Date) {
      next.set(key, value.toISOString().split("T")[0]);
    } else {
      next.set(key, String(value));
    }
  }
  return next;
}

/** Compte le nombre de filtres actifs (non null/vides). */
export function compterFiltres(filtres: FiltresVehicules): number {
  return Object.values(filtres).filter((v) => v !== null && v !== undefined && v !== "").length;
}

/** Genere un label lisible pour un filtre donne. */
export function libelleFiltre(key: string, value: string): string {
  const labels: Record<string, string> = {
    statut: "Statut",
    provenance: "Provenance",
    client: "Client",
    dateEntreeDeb: "Entrée ≥",
    dateEntreeFin: "Entrée ≤",
    marque: "Marque",
    modele: "Modèle",
    immatriculation: "Immatriculation",
  };
  return `${labels[key] ?? key} : ${value}`;
}

/** Hook React pour lire/gerer les filtres via l'URL. */
export function useFiltresVehicules() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filtres = React.useMemo(() => lireFiltres(searchParams), [searchParams]);

  const setFiltre = React.useCallback(
    (key: CleFiltre, value: ValeurFiltre) => {
      const next = ecrireFiltres(searchParams, { [key]: value as string | Date | null });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const clearFiltre = React.useCallback(
    (key: CleFiltre) => {
      const next = new URLSearchParams(searchParams);
      next.delete(key);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const clearAll = React.useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  return {
    filtres,
    setFiltre,
    clearFiltre,
    clearAll,
    nbFiltresActifs: compterFiltres(lireFiltres(searchParams)),
  };
}

// Re-export React for useFiltresVehicules
import * as React from "react";