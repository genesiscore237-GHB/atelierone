/**
 * Serialisation des filtres du registre des vehicules.
 *
 * Les filtres vivent dans l'URL : ils sont donc partageables, survivant au
 * rechargement, et surtout preserves lorsqu'on ouvre une fiche puis qu'on
 * revient a la liste (parametre `retour`).
 */

export interface FiltresVehicules {
  q: string;
  statut: string;
  site: string;
  nonPositionnes: boolean;
}

export const FILTRES_VIDES: FiltresVehicules = {
  q: "",
  statut: "",
  site: "",
  nonPositionnes: false,
};

/** Lit les filtres depuis un objet URLSearchParams (ou une query string). */
export function lireFiltres(params: URLSearchParams | string): FiltresVehicules {
  const p = typeof params === "string" ? new URLSearchParams(params) : params;
  return {
    q: p.get("q") ?? "",
    statut: p.get("statut") ?? "",
    site: p.get("site") ?? "",
    nonPositionnes: p.get("np") === "1",
  };
}

/** Serialise les filtres en query string (vide si aucun filtre). */
export function ecrireFiltres(f: FiltresVehicules): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.statut) p.set("statut", f.statut);
  if (f.site) p.set("site", f.site);
  if (f.nonPositionnes) p.set("np", "1");
  return p.toString();
}

/** Nombre de filtres actifs, pour l'indication « N filtre(s) » de la liste. */
export function compterFiltres(f: FiltresVehicules): number {
  return (f.q.trim() ? 1 : 0) + (f.statut ? 1 : 0) + (f.site ? 1 : 0) + (f.nonPositionnes ? 1 : 0);
}

/** Libelle humain d'un filtre, utilise dans le nom de fichier exporte. */
export function libelleFiltre(f: FiltresVehicules, libellesStatuts?: Record<string, string>): string {
  const parts: string[] = [];
  if (f.statut) parts.push((libellesStatuts?.[f.statut] ?? f.statut).toLowerCase().replace(/[\s/]+/g, "-"));
  if (f.nonPositionnes) parts.push("non-places");
  return parts.length > 0 ? parts.join("-") : "tous";
}