/**
 * Composant d'impression : Liste inventaire vehicules (A4 paysage).
 *
 * Usage :
 *   <PrintVehiculesList
 *     vehicules={vehicules}
 *     filtres={filtresActifs}
 *     garageNom="Garage Central"
 *     utilisateur="Jean Dupont"
 *   />
 *
 * Impression : window.print() declenche l'impression de ce composant uniquement
 * grace aux styles @media print dans print.css.
 */

import * as React from "react";
import { LigneExportVehicule } from "./parking-export";
import { formatDate } from "~/app/(dashboard)/dashboard/garage/_components/statuts";

interface Props {
  vehicules: LigneExportVehicule[];
  filtres: Record<string, string | number | boolean | null | undefined>;
  garageNom?: string;
  utilisateur?: string;
  logoUrl?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function PrintVehiculesList({
  vehicules,
  filtres,
  garageNom = "Garage",
  utilisateur = "Utilisateur",
  logoUrl,
  isOpen = true,
  onClose,
}: Props) {
  if (!isOpen) return null;
  const dateGeneration = new Date().toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  // Colonnes a afficher dans le tableau (ordre fixe pour inventaire)
  const colonnes = [
    { cle: "numRegistre", label: "N°", largeur: "40px" },
    { cle: "photo", label: "Photo", largeur: "48px" },
    { cle: "immatriculation", label: "Immat.", largeur: "70px" },
    { cle: "vehicule", label: "Véhicule", largeur: "100px" },
    { cle: "client", label: "Client", largeur: "90px" },
    { cle: "statut", label: "Statut", largeur: "70px" },
    { cle: "position", label: "Position", largeur: "60px" },
    { cle: "dateEntree", label: "Entrée", largeur: "65px" },
  ] as const;

  // Filtres a afficher (exclure les vides)
  const filtresAffiches = Object.entries(filtres)
    .filter(([, v]) => v !== "" && v !== null && v !== undefined && v !== false)
    .map(([k, v]) => ({
      label: k
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase())
        .replace(/Id$/, " ID")
        .replace(/([a-z])([A-Z])/g, "$1 $2"),
      value: String(v),
    }));

  const totalVehicules = vehicules.length;

  return (
    <div className="print-container screen-only" style={{ padding: "20px" }}>
      <div className="print-header">
        <div className="print-header__left">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              className="print-header__logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="print-header__title-block">
            <h1 className="print-header__title">Inventaire des véhicules</h1>
            <p className="print-header__subtitle">{garageNom}</p>
          </div>
        </div>
        <div className="print-header__right">
          <div className="print-header__meta">
            <span className="print-header__meta-item">
              <span className="print-header__meta-label">Date : </span>
              <span className="print-header__meta-value">{dateGeneration}</span>
            </span>
            <span className="print-header__meta-item">
              <span className="print-header__meta-label">Utilisateur : </span>
              <span className="print-header__meta-value">{utilisateur}</span>
            </span>
            <span className="print-header__meta-item">
              <span className="print-header__meta-label">Total : </span>
              <span className="print-header__meta-value">{totalVehicules} véhicule{totalVehicules > 1 ? "s" : ""}</span>
            </span>
          </div>
        </div>
      </div>

      {filtresAffiches.length > 0 && (
        <div className="print-filters">
          <span className="print-filters__label">Filtres :</span>
          {filtresAffiches.map((f, i) => (
            <span key={i} className="print-filters__tag">
              {f.label} : {f.value}
            </span>
          ))}
        </div>
      )}

      <table className="print-table no-break">
        <colgroup>
          <col className="col-num" />
          <col className="col-photo" />
          <col className="col-immat" />
          <col className="col-vehicule" />
          <col className="col-client" />
          <col className="col-statut" />
          <col className="col-position" />
          <col className="col-entree" />
        </colgroup>
        <thead>
          <tr>
            {colonnes.map((c) => (
              <th key={c.cle} style={{ width: c.largeur }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vehicules.map((v, index) => (
            <tr key={v.id}>
              <td className="text-right" style={{ fontWeight: 600 }}>
                {v.numRegistre}
              </td>
              <td className="cell-photo text-center">
                {v.photos && v.photos.length > 0 ? (
                  <img
                    src={v.photos[0].url}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="placeholder">—</div>
                )}
              </td>
              <td>
                {v.immatriculation ? (
                  <span style={{ fontFamily: "monospace", fontSize: "7.5pt" }}>
                    {v.immatriculation}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td>
                <div style={{ fontWeight: 500 }}>
                  {v.marque ?? "—"} {v.modele ?? ""}
                </div>
                {v.version && (
                  <div style={{ fontSize: "6.5pt", color: "#64748b" }}>
                    {v.version}
                  </div>
                )}
              </td>
              <td>
                {v.clientNom ? (
                  <>
                    <div>{v.clientNom}</div>
                    {v.clientTelephone && (
                      <div style={{ fontSize: "6.5pt", color: "#64748b" }}>
                        {v.clientTelephone}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="text-center">
                <span
                  style={{
                    display: "inline-block",
                    padding: "1px 6px",
                    fontSize: "6.5pt",
                    fontWeight: 600,
                    borderRadius: "3px",
                    textTransform: "uppercase",
                    background: getStatutColor(v.statut),
                    color: getStatutTextColor(v.statut),
                  }}
                >
                  {getStatutLabel(v.statut)}
                </span>
              </td>
              <td className="text-center">
                {v.centreX != null && v.centreY != null ? (
                  <span style={{ color: "#059669", fontSize: "7.5pt" }}>
                    Positionné
                  </span>
                ) : (
                  <span style={{ color: "#d97706", fontSize: "7.5pt" }}>
                    À placer
                  </span>
                )}
              </td>
              <td className="text-center" style={{ fontSize: "7.5pt" }}>
                {formatDate(v.dateEntree)}
              </td>
            </tr>
          ))}
          {vehicules.length === 0 && (
            <tr>
              <td colSpan={colonnes.length} className="text-center" style={{ padding: "20px", color: "#64748b" }}>
                Aucun véhicule ne correspond aux critères.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="print-footer">
        <div className="print-footer__left">
          <span>AtelierOne — Inventaire véhicules</span>
          <span>Généré le {dateGeneration}</span>
        </div>
        <div className="print-footer__right">
          <span className="print-footer__page">Page 1 / 1</span>
        </div>
      </div>
    </div>
  );
}

function getStatutColor(statut: string): string {
  const colors: Record<string, string> = {
    EN_PARKING: "#dbeafe",
    EN_ATTENTE_DEVIS: "#fef3c7",
    EN_ATTENTE_DIAGNOSTIC: "#fef3c7",
    EN_ATTENTE_PIECE: "#fef3c7",
    EN_TRAVAUX: "#dbeafe",
    TERMINE_A_RECUPERER: "#dcfce7",
    EN_VENTE: "#fce7f3",
    ACCIDENTE: "#fee2e2",
    A_TRANSFERER: "#e0e7ff",
    SORTI: "#f1f5f9",
    DONNEES_INCOMPLETES: "#fee2e2",
  };
  return colors[statut] ?? "#e2e8f0";
}

function getStatutTextColor(statut: string): string {
  const colors: Record<string, string> = {
    EN_PARKING: "#1e40af",
    EN_ATTENTE_DEVIS: "#92400e",
    EN_ATTENTE_DIAGNOSTIC: "#92400e",
    EN_ATTENTE_PIECE: "#92400e",
    EN_TRAVAUX: "#1e40af",
    TERMINE_A_RECUPERER: "#166534",
    EN_VENTE: "#9d174d",
    ACCIDENTE: "#991b1b",
    A_TRANSFERER: "#3730a3",
    SORTI: "#64748b",
    DONNEES_INCOMPLETES: "#991b1b",
  };
  return colors[statut] ?? "#334155";
}

function getStatutLabel(statut: string): string {
  const labels: Record<string, string> = {
    EN_PARKING: "En parking",
    EN_ATTENTE_DEVIS: "Att. devis",
    EN_ATTENTE_DIAGNOSTIC: "Att. diag.",
    EN_ATTENTE_PIECE: "Att. pièce",
    EN_TRAVAUX: "En travaux",
    TERMINE_A_RECUPERER: "À récupérer",
    EN_VENTE: "En vente",
    ACCIDENTE: "Accidenté",
    A_TRANSFERER: "À transférer",
    SORTI: "Sorti",
    DONNEES_INCOMPLETES: "Incomplet",
  };
  return labels[statut] ?? statut;
}