/** Mapping vehicule -> formulaire / modele d'edition.
 *
 * Ce fichier exporte une fonction unique `vehiculeVersFormModel` qui transforme
 * une entite vehicule (telle que retournee par le serveur / TRPC) en un modele
 * plat exploitable par les composants de formulaire (Create / Update).
 *
 * Le modele est intentionnellement plat (pas de nested objects) pour simplifier
 * la composition avec React Hook Form / Zod. Les champs a complexite (photos,
 * positions geo) sont exposes comme des tableaux de data URI ou de coordonnées.
 *
 * Utilisation :
 *   const form = useForm<FormModel>({ resolver: zResolver(z.object({...})) });
 *   const initial = vehiculeVersFormModel(voitureServeur);
 */

import type { LigneExportVehicule } from "./parking-export";

/** Toutes les clefs possibles issue du catalogue CHAMPS_EXPORT_VEHICULE,
 *  presentes aussi bien dans le modele d'entree que dans les formulaires. */
export type ChampForm = keyof Pick<
  LigneExportVehicule,
  | "numRegistre"
  | "immatriculation"
  | "marque"
  | "modele"
  | "version"
  | "couleur"
  | "vin"
  | "clientNom"
  | "clientTelephone"
  | "statut"
  | "motif"
  | "provenance"
  | "centreX"
  | "centreY"
  | "rotation"
  | "longueur"
  | "largeur"
  | "hauteur"
  | "poids"
  | "dimensionsEstimees"
  | "dateEntree"
  | "dateDerniereAction"
  | "dateDevis"
  | "dateCommande"
  | "dateFinTravaux"
  | "dateDerniereRelance"
  | "nbPhotos"
  | "notes"
  | "site"
  | "zone"
  | "spot"
>;

/** Modele plat exploitable par un formulaire de creation / edition.
 *
 * Remarques :
 *   - `photos` contient des data URI (base64 encodees) pour etre directement
 *     injectees dans un <img src> sans aller serveur.
 *   - Les dates sont des objets Date JavaScript (ou strings ISO).
 *   - `poids` est un nombre (kg), `dimensionsEstimees` un boolen.
 */
export interface FormModelVehicule {
  numRegistre: number;
  immatriculation: string;
  marque: string;
  modele: string;
  version: string;
  couleur: string;
  vin: string;
  clientNom: string;
  clientTelephone: string;
  statut: string;
  motif: string;
  provenance: string;
  centreX: number | null;
  centreY: number | null;
  rotation: number | null;
  longueur: number | null;
  largeur: number | null;
  hauteur: number | null;
  poids: number | null;
  dimensionsEstimees: boolean;
  dateEntree: Date | string | null;
  dateDerniereAction: Date | string | null;
  dateDevis: Date | string | null;
  dateCommande: Date | string | null;
  dateFinTravaux: Date | string | null;
  dateDerniereRelance: Date | string | null;
  nbPhotos: number;
  notes: string;
  site: string;
  zone: string;
  spot: string;
  photos: Array<{ url: string; categorie?: string; date?: string; auteur?: string }>;
}

/** Convertit un objet LigneExportVehicule (serveur) en FormModelVehicule (formulaire).
 *
 * @param src Objet tel que retournee par la procedure garage.exportVehicules
 *            ou par le query vehicles.
 * @returns FormModelVehicule complet, prP'etre utilise comme initialValues
 *          dans un formulaire React Hook Form.
 */
export function vehiculeVersFormModel(src: LigneExportVehicule): FormModelVehicule {
  const toDate = (v: Date | string | null): Date | string | null => {
    if (v == null || v === "") return null;
    if (v instanceof Date) return v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  return {
    numRegistre: src.numRegistre,
    immatriculation: src.immatriculation ?? "",
    marque: src.marque ?? "",
    modele: src.modele ?? "",
    version: src.version ?? "",
    couleur: src.couleur ?? "",
    vin: src.vin ?? "",
    clientNom: src.clientNom ?? "",
    clientTelephone: src.clientTelephone ?? "",
    statut: src.statut,
    motif: src.motif ?? "",
    provenance: src.provenance ?? "",
    centreX: src.centreX ?? null,
    centreY: src.centreY ?? null,
    rotation: src.rotation ?? null,
    longueur: src.longueur ?? null,
    largeur: src.largeur ?? null,
    hauteur: src.hauteur ?? null,
    poids: src.poids ?? null,
    dimensionsEstimees: src.dimensionsEstimees ?? false,
    dateEntree: toDate(src.dateEntree),
    dateDerniereAction: toDate(src.dateDerniereAction),
    dateDevis: toDate(src.dateDevis),
    dateCommande: toDate(src.dateCommande),
    dateFinTravaux: toDate(src.dateFinTravaux),
    dateDerniereRelance: toDate(src.dateDerniereRelance),
    nbPhotos: src.nbPhotos,
    notes: src.notes ?? "",
    site: src.site ?? "",
    zone: src.zone ?? "",
    spot: src.spot ?? "",
    photos: src.photos ?? [],
  };
}