import type { VehiculeFormModel } from "./VehiculeFormDialog";
import type { RouterOutputs } from "~/trpc/react";

type VehiculeApiOutput = RouterOutputs["garage"]["vehicule"];
type VehiculeAvecRelations = VehiculeApiOutput["vehicule"];

/** Transforme la sortie de l'API garage.vehicule en modèle du formulaire. */
export function vehiculeVersFormModel(v: VehiculeAvecRelations): VehiculeFormModel {
  const iso = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  return {
    id: v.id,
    numRegistre: v.numRegistre,
    marque: v.marque ?? null,
    modele: v.modele ?? null,
    version: v.version ?? null,
    couleur: v.couleur ?? null,
    immatriculation: v.immatriculation ?? null,
    vin: v.vin ?? null,
    clientNom: v.clientNom ?? null,
    clientTelephone: v.clientTelephone ?? null,
    statut: v.statut ?? "EN_PARKING",
    motif: v.motif ?? null,
    longueur: v.longueur ?? null,
    largeur: v.largeur ?? null,
    hauteur: v.hauteur ?? null,
    poids: v.poids ?? null,
    dimensionsEstimees: v.dimensionsEstimees ?? false,
    provenance: v.provenance ?? null,
    notes: v.notes ?? null,
    photos: v.photos ?? [],
    dateEntree: iso(v.dateEntree),
    dateDevis: iso(v.dateDevis),
    dateCommande: iso(v.dateCommande),
    dateFinTravaux: iso(v.dateFinTravaux),
    dateDerniereRelance: iso(v.dateDerniereRelance),
  };
}