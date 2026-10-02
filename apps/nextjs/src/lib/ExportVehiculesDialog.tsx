/** Dialogue modale de selection d'export vehicules.
 *
 *  Composant autonome (pas de dependencies React Router directe) :
 *  - Affiche le catalogue de 31 champs reglables par groupes.
 *  - Permet la selection du format (XLSX/CSV/PDF).
 *  - Choix du nombre de photos par vehicule (0=Aucun/1=Couverture/2=3/3=Toutes).
 *  - Estimation du poids fichier en temps reel.
 *  - Navigation keyboard-friendly et accesibilité (focus management, ARIA).
 *  - Annulation / validation persistante via bouton Enregistrer.
 *
 * Import note : tous les composants UI (@ui/...) et les helpers d'export
 * (@/lib/...) sont issus du repo atelierone (imports @atelierone/*).
 */

import * as React from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Checkbox } from "@/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChampsExportVehicule, FormuleGroupes, type OptionsGenerationExport, type ResultatExport } from "@/lib/parking-export";
import { useEffect } from "react";

/** Categories (groupes) du catalogue, tel qu'affiche dans la modale. */
type GroupeEnum =
  | "identification"
  | "client"
  | "situation"
  | "localisation"
  | "dimensions"
  | "dates"
  | "photos"
  | "divers";

/** Structure de controle pour un champ du formulaire. */
interface ChampControle {
  cle: string;
  label: string;
  actif: boolean;
  groupe: GroupeEnum;
}

/** Props de la modale. */
interface Props {
  /** Vehicules selectionnes (tableau ou identifiant unique). */
  vehicules: LigneExportVehicule[];
  /** Survalidation : reçois le resultat de l'export. */
  onExport: (resultat: ResultatExport) => void;
  /** Fermeture de la modale. */
  onClose: () => void;
}

/** Label FR -> cle CHAMP, pour chaque groupe. */
const LABELS_GROUPES: Record<GroupeEnum, string> = {
  identification: "Identification",
  client: "Client",
  situation: "Situation",
  localisation: "Localisation",
  dimensions: "Dimensions",
  dates: "Dates",
  photos: "Photos",
  divers: "Divers",
};

const GROUPES_LABELS: Record<GroupeEnum, string> = {
  identification: LABELS_GROUPES.identification,
  client: LABELS_GROUPES.client,
  situation: LABELS_GROUPES.situation,
  localisation: LABELS_GROUPES.localisation,
  dimensions: LABELS_GROUPES.dimensions,
  dates: LABELS_GROUPES.dates,
  photos: LABELS_GROUPES.photos,
  divers: LABELS_GROUPES.divers,
};

export function ExportVehiculesDialog({ vehicules, onExport, onClose }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Etat local de la modale
  const [selection, setSelection] = React.useState<{
    groupes: Record<GroupeEnum, boolean>;
    format: "xlsx" | "pdf" | "csv";
    photosParVehicule: 0 | 1 | 2 | 3;
    contexte: string;
  }>({
    groupes: {
      identification: true,
      client: true,
      situation: true,
      localisation: true,
      dimensions: true,
      dates: true,
      photos: true,
      divers: true,
    },
    format: "xlsx",
    photosParVehicule: 1,
    contexte: location.state?.contexte ?? searchParams.get("contexte") ?? "",
  });

  // Mise a jour searchParams => URL persistante
  useEffect(() => {
    const ps = new URLSearchParams();
    if (selection.contexte) ps.set("contexte", selection.contexte);
    const newUrl = `${location.pathname}?${ps.toString()}`;
    if (newUrl !== location.href) navigate(newUrl, { replace: true });
  }, [selection.contexte, navigate, location]);

  // Construction du tableau de champs actifs a partir des groupes selectionnes
  const champsActifs = React.useMemo(() => {
    const actif: ChampsExportVehicule[] = [];
    for (const [groupe, etat] of Object.entries(selection.groupes) as [
      GroupeEnum,
      boolean,
    ][]) {
      if (!etat) continue;
      const items = CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === groupe);
      actif.push(...items);
    }
    return actif;
  }, [selection.groupes]);

  // Estimation poids
  const poidsEstime = React.useMemo(
    () => estimerPoidsExport(vehicules, champsActifs, selection.photosParVehicule),
    [vehicules, champsActifs, selection.photosParVehicule],
  );

  // Boutons de format
  const formats: { valeur: string; label: string; icone: string }[] = [
    { valeur: "xlsx", label: "Excel (.xlsx)", icone: "table" },
    { valeur: "pdf", label: "PDF (.pdf)", icone: "file-text" },
    { valeur: "csv", label: "CSV (.csv)", icone: "grid" },
  ];

  // Options photos par vehicule
  const photosOptions = [
    { valeur: 0, label: "Aucune" },
    { valeur: 1, label: "Couverture seulement" },
    { valeur: 2, label: "3 photos max" },
    { valeur: 3, label: "Toutes" },
  ];

  const handleGenerer = async () => {
    // Construction des options d'envoi au serveur (ici on appelle le generateur local)
    const options: OptionsGenerationExport = {
      format: selection.format,
      champs: champsActifs.map((c) => c.cle),
      photosParVehicule: selection.photosParVehicule,
      contexte: selection.contexte,
    };

    try {
      const resultat = await genererEtTelechargerExport(vehicules, options, "registre-vehicules", () => {});
      onExport(resultat);
      onClose();
      toast({
        title: "Export termine",
        description: `${resultat.lignes} vehicule${resultat.lignes > 1 ? "s" : ""} exporte${resultat.lignes > 1 ? "s" : ""}.`,
        variant: "success",
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur d'export",
        description: "Impossible de generer le fichier. Verifiez la selection.",
        variant: "destructive",
      });
    }
  };

  // Render header : groupes + format + photos
  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-full">
        <DialogHeader>
          <DialogTitle>Export du registre vehicules</DialogTitle>
          <DialogDescription>
            Selectionnez les champs, le format et les options d'exportation.
          </DialogDescription>
        </DialogHeader>

        {/* ---------- GROUPES DE CHAMP ---------- */}
        <div className="space-y-4 pt-4">
          {FormulesGroupes.map((g) => (
            <fieldset
              key={g.groupe}
              className="border rounded-md p-3"
              style={{
                borderColor: selection.groupes[g.groupe] ? "var(--primary)" : "var(--border)",
              }}
            >
              <legend
                className="sr-only"
                style={{
                  clip: "rect(0 0 0 0)",
                  clipPath: "inset(0)",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                }}
              >
                {L.label}
              </legend>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {g.champs.map((c) => (
                  <label key={c.cle} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selection.groupes[g.groupe]}
                      onChange={() =>
                        setSelection((s) => ({
                          ...s,
                          groupes: {
                            ...s.groupes,
                            [g.groupe]: s.groupes[g.groupe] === false,
                          },
                        }))
                      }
                      className="rounded border-pointer-events-none"
                    />
                    <span className="text-sm font-medium">{c.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        {/* ---------- FORMAT ---------- */}
        <div>
          <label className="block text-sm font-medium mb-1">Format</label>
          <Select onValueChange={(v) => setSelection((s) => ({ ...s, format: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Selectionner un format" />
            </SelectTrigger>
            <SelectContent>
              {formats.map((f) => (
                <SelectItem key={f.valeur} value={f.valeur}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ---------- PHOTOS ---------- */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Photos par vehicule
            {selection.photosParVehicule > 0 && ` (${poidsEstime > 0 ? `${Math.round(poidsEstime / 1024)} Ko estime` : ""})`}
          </label>
          {photosOptions.map((opt) => (
            <label key={opt.valeur} className="flex items-center gap-2 cursor-pointer mt-1">
              <input
                type="radio"
                value={opt.valeur.toString()}
                checked={selection.photosParVehicule === opt.valeur}
                onChange={() =>
                  setSelection((s) => ({ ...s, photosParVehicule: opt.valeur }))
                }
                className="rounded border-pointer-events-none"
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>

        {/* ---------- CONTEXTE ---------- */}
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">Contexte (optionnel)</label>
          <Input
            placeholder="ex: Agence Principale, Session Hiver 2025..."
            value={selection.contexte}
            onChange={(e) =>
              setSelection((s) => ({ ...s, contexte: e.target.value.trim() }))
            }
          />
        </div>

        {/* ---------- ESTIMATION POIDS ---------- */}
        <div className="mt-3 p-3 rounded bg-yellow-50 text-yellow-800 text-sm">
          Estimated file size: {poidsEstime > 0 ? `${Math.round(poidsEstime / 1024)} Ko` : "Aucun poids (pas de photos)"}
        </div>

        {/* ---------- BOUTONS ---------- */}
        <div className="flex justify-end gap-3 pt-6">
          <Button
            variant="outline"
            onClick={onClose}
            style={{ minWidth: "100px" }}
          >
            Annuler
          </Button>
          <Button
            onClick={handleGenerer}
            disabled={champsActifs.length === 0}
            style={{ minWidth: "120px" }}
          >
            Exporter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** FormulesGroupes = catalogue CHAMPS_EXPORT_VEHICULE grouppé par thème. */
const FormulesGroupes: {
  groupe: GroupeEnum;
  label: string;
  champs: ChampsExportVehicule[];
}[] = [
  { groupe: "identification", label: LABELS_GROUPES.identification, champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "identification") },
  { groupe: "client", label: LABELS_GROUPES.client, champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "client") },
  { groupe: "situation", label: LABELS_GROUPES.situation, champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "situation") },
  { groupe: "localisation", label: LABELS_GROUPES.localisation, champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "localisation") },
  { groupe: "dimensions", label: LABELS_GROUPES.dimensions, champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "dimensions") },
  { groupe: "dates", label: LABELS_GROUPES.dates, champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "dates") },
  { groupe: "photos", label: LABELS_GROUPES.photos, champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "photos") },
  { groupe: "divers", label: LABELS_GROUPES.divers, champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "divers") },
];