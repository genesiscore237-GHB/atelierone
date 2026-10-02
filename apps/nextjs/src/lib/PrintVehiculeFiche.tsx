/**
 * Composant d'impression : Fiche detaillee vehicule (A4 portrait).
 *
 * Usage :
 *   <PrintVehiculeFiche
 *     vehicule={vehicule}
 *     garageNom="Garage Central"
 *     utilisateur="Jean Dupont"
 *   />
 */

import * as React from "react";
import { LigneExportVehicule } from "./parking-export";
import { formatDate, formatDateHeure, formatNumber, formatMeters } from "~/app/(dashboard)/dashboard/garage/_components/statuts";

interface Props {
  vehicule: LigneExportVehicule;
  garageNom?: string;
  utilisateur?: string;
  logoUrl?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function PrintVehiculeFiche({
  vehicule,
  garageNom = "Garage",
  utilisateur = "Utilisateur",
  logoUrl,
  isOpen = true,
  onClose,
}: Props) {
  if (!isOpen) return null;
  const v = vehicule;
  const dateGeneration = new Date().toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const estPositionne = v.centreX != null && v.centreY != null;

  // Infos grille 2 colonnes
  const infos = [
    { label: "Marque", value: v.marque ?? "—" },
    { label: "Modèle", value: v.modele ?? "—" },
    { label: "Version", value: v.version ?? "—" },
    { label: "Couleur", value: v.couleur ?? "—" },
    { label: "VIN", value: v.vin ?? "—" },
    { label: "Immatriculation", value: v.immatriculation ?? "—" },
    { label: "Client", value: v.clientNom ?? "—" },
    { label: "Téléphone", value: v.clientTelephone ?? "—" },
    { label: "Motif", value: v.motif ?? "—" },
    { label: "Date d'entrée", value: formatDate(v.dateEntree) },
    { label: "Dernière action", value: formatDateHeure(v.dateDerniereAction) },
    { label: "Devis", value: formatDate(v.dateDevis) },
    { label: "Commande pièce", value: formatDate(v.dateCommande) },
    { label: "Fin travaux", value: formatDate(v.dateFinTravaux) },
    { label: "Dernière relance", value: formatDate(v.dateDerniereRelance) },
    { label: "Provenance", value: v.provenance ?? "—" },
    { label: "Longueur", value: formatMeters(v.longueur) },
    { label: "Largeur", value: formatMeters(v.largeur) },
    { label: "Hauteur", value: formatMeters(v.hauteur) },
    { label: "Poids", value: v.poids != null ? `${formatNumber(v.poids)} kg` : "—" },
    { label: "Dimensions estimées", value: v.dimensionsEstimees ? "OUI" : "NON" },
  ];

  // Mouvements (simplifies pour impression)
  const mouvements = v.photos // placeholder - en realite via relation vehicule
    ? []
    : [];

  return (
    <div className="print-container screen-only" style={{ padding: "20px" }}>
      <div className="print-fiche">
        <div className="print-fiche__header">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              className="print-fiche__logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
              style={{ width: "60px", height: "60px", objectFit: "contain" }}
            />
          )}
          <div className="print-fiche__title-block">
            <p className="print-fiche__num">N° {v.numRegistre}</p>
            <h1 className="print-fiche__title">
              {v.marque ?? "Véhicule"} {v.modele ?? ""}
            </h1>
            {v.immatriculation && (
              <p style={{ fontSize: "9pt", color: "#3b82f6", fontWeight: 600, margin: "4px 0 0" }}>
                {v.immatriculation}
              </p>
            )}
            <div className="print-fiche__badges">
              <span className={`print-fiche__badge print-fiche__badge--statut`}>
                {getStatutLabel(v.statut)}
              </span>
              {estPositionne ? (
                <span className="print-fiche__badge print-fiche__badge--position">
                  Positionné sur la carte
                </span>
              ) : (
                <span className="print-fiche__badge print-fiche__badge--position print-fiche__badge--position--absent">
                  À placer sur la carte
                </span>
              )}
            </div>
          </div>
        </div>

        {v.photos && v.photos.length > 0 ? (
          <img
            src={v.photos[0].url}
            alt={v.marque ?? "Véhicule"}
            className="print-fiche__photo"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.classList?.remove("hidden");
            }}
          />
        ) : (
          <div className="print-fiche__photo-placeholder">
            Aucune photo
          </div>
        )}

        <div className="print-fiche__section">
          <h2 className="print-fiche__section-title">Informations</h2>
          <div className="print-fiche__grid">
            {infos.map((i) => (
              <div key={i.label} className="print-fiche__field">
                <span className="print-fiche__label">{i.label}</span>
                <span className={`print-fiche__value ${i.value === "—" ? "print-fiche__value--empty" : ""}`}>
                  {i.value}
                </span>
              </div>
            ))}
            {v.notes && (
              <div className="print-fiche__field print-fiche__field--full">
                <span className="print-fiche__label">Notes</span>
                <span className="print-fiche__value print-fiche__notes">{v.notes}</span>
              </div>
            )}
          </div>
        </div>

        {v.photos && v.photos.length > 1 && (
          <div className="print-fiche__section">
            <h2 className="print-fiche__section-title">Photos ({v.photos.length})</h2>
            <div className="print-fiche__photos-grid">
              {v.photos.slice(0, 6).map((p, i) => (
                <div key={`${p.categorie}-${i}`} className="print-fiche__photo-item">
                  <img
                    src={p.url}
                    alt={p.categorie}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).nextElementSibling?.classList?.remove("hidden");
                    }}
                  />
                  <span className="print-fiche__photo-caption">
                    {p.categorie}
                    {p.date && ` — ${new Date(p.date).toLocaleDateString("fr-FR")}`}
                    {p.auteur && ` — ${p.auteur}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="print-footer">
          <div className="print-footer__left">
            <span>{garageNom}</span>
            <span>Généré le {dateGeneration} par {utilisateur}</span>
          </div>
          <div className="print-footer__right">
            <span className="print-footer__page">Page 1 / 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getStatutLabel(statut: string): string {
  const labels: Record<string, string> = {
    EN_PARKING: "En parking",
    EN_ATTENTE_DEVIS: "En attente de devis",
    EN_ATTENTE_DIAGNOSTIC: "En attente de diagnostic",
    EN_ATTENTE_PIECE: "En attente de pièce",
    EN_TRAVAUX: "En travaux",
    TERMINE_A_RECUPERER: "Terminé - À récupérer",
    EN_VENTE: "En vente",
    ACCIDENTE: "Accidenté",
    A_TRANSFERER: "À transférer",
    SORTI: "Sorti",
    DONNEES_INCOMPLETES: "Données incomplètes",
  };
  return labels[statut] ?? statut;
}