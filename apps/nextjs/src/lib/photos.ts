/**
 * SOCLE PHOTOS VÉHICULE — types et libellés, sans dépendance serveur.
 *
 * Ces définitions vivaient dans `app/(dashboard)/dashboard/garage/_components/statuts.ts`.
 * Elles sont PURES (des chaînes et une interface), donc les importer depuis un
 * composant client est sans risque — mais les y laisser rendait l'atelier
 * dépendant du dossier du parking : impossible d'afficher une photo côté atelier
 * sans importer depuis le module parking, et le jour où le garage bouge,
 * l'atelier casse.
 *
 * Même logique que pour `outillage.ts` : ce qui est partagé part dans `src/lib`,
 * ce qui est propre à un écran reste dans son dossier.
 *
 * `garage/_components/statuts.ts` réexporte ce module : les appels existants
 * continuent de fonctionner, et il n'y a donc qu'une seule source de vérité.
 */

export interface VehiculePhoto {
  url: string;
  categorie: string;
  date?: string | null;
  auteur?: string | null;
}

export const PHOTO_CATEGORIE_LABELS: Record<string, string> = {
  AVANT: "Avant",
  ARRIERE: "Arrière",
  COTE_GAUCHE: "Côté gauche",
  COTE_DROIT: "Côté droit",
  INTERIEUR: "Intérieur",
  PLAQUE_IMMATRICULATION: "Plaque",
  MOTEUR: "Moteur",
  AUTRE: "Autre",
};

/**
 * Nombre maximal de photos par véhicule.
 *
 * Au-delà, l'écran devient illisible et la fiche sature : on préfère
 * découper par catégories (AVANT, MOTEUR…) que d'empiler.
 */
export const PHOTO_MAX_TAILLE = 6;

export function libellePhotoCategorie(categorie: string | null | undefined): string {
  if (!categorie) return "Autre";
  return PHOTO_CATEGORIE_LABELS[categorie] ?? categorie;
}

/**
 * Filtre les photos exploitables.
 *
 * Une entrée sans URL est une entrée morte : elle fait une vignette cassée
 * dans la visionneuse et allonge la liste. Elle est écartée ici, une fois
 * pour toutes, plutôt que dans chaque écran.
 */
export function photosValides(photos: unknown): VehiculePhoto[] {
  if (!Array.isArray(photos)) return [];
  return (photos as VehiculePhoto[]).filter(
    (p): p is VehiculePhoto => !!p && typeof p.url === "string" && p.url.length > 0,
  );
}