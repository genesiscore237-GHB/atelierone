/** Dialogue modale de selection d'export vehicules.
 *
 *  Composant autonome :
 *  - Affiche le catalogue de 31 champs reglables par groupes.
 *  - Permet la selection du format (XLSX/CSV/PDF).
 *  - Choix du nombre de photos par vehicule (0=Aucun/1=Couverture/2=3/3=Toutes).
 *  - Estimation du poids fichier en temps reel.
 *  - Navigation keyboard-friendly et accesibilité (focus management, ARIA).
 *  - Annulation / validation persistante via bouton Enregistrer.
 */

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
// Checkbox component inline (not available in UI lib)
const Checkbox = React.forwardRef<HTMLInputElement, { checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean }>(
  ({ checked, onCheckedChange, disabled, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      disabled={disabled}
      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { toast } from "sonner";
import {
  CHAMPS_EXPORT_VEHICULE,
  type OptionsGenerationExport,
  type ResultatExport,
  type LigneExportVehicule,
  type ChampsExportVehicule,
  genererEtTelechargerExport,
  estimerPoidsExport,
} from "@/lib/parking-export";
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

/** Props de la modale. */
interface Props {
  /** Vehicules selectionnes (tableau ou identifiant unique). */
  vehicules: LigneExportVehicule[];
  /** Si la modale doit etre ouverte. */
  isOpen: boolean;
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

export function ExportVehiculesDialog({ vehicules, isOpen, onExport, onClose }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Etat local de la modale
  const [selection, setSelection] = React.useState<{
    champsSelectionnes: string[];
    format: "xlsx" | "pdf" | "csv";
    photosParVehicule: 0 | 1 | 2 | 3;
    contexte: string;
  }>({
    champsSelectionnes: CHAMPS_EXPORT_VEHICULE.map((c) => c.cle),
    format: "xlsx",
    photosParVehicule: 1,
    contexte: "",
  });

  // Mise a jour searchParams => URL persistante (contexte uniquement)
  useEffect(() => {
    const ps = new URLSearchParams();
    if (selection.contexte) ps.set("contexte", selection.contexte);
    const newUrl = `${pathname}?${ps.toString()}`;
    router.replace(newUrl, { scroll: false });
  }, [selection.contexte, router, pathname]);

  // Construction du tableau de champs actifs a partir de la selection
  const champsActifs = React.useMemo(() => {
    return CHAMPS_EXPORT_VEHICULE.filter((c) => selection.champsSelectionnes.includes(c.cle));
  }, [selection.champsSelectionnes]);

  // Estimation poids
  const poidsEstime = React.useMemo(
    () => estimerPoidsExport(vehicules, champsActifs, selection.photosParVehicule),
    [vehicules, champsActifs, selection.photosParVehicule],
  );

  // Toggle d'un champ individuel
  const toggleChamp = (cle: string) => {
    setSelection((s) => ({
      ...s,
      champsSelectionnes: s.champsSelectionnes.includes(cle)
        ? s.champsSelectionnes.filter((c) => c !== cle)
        : [...s.champsSelectionnes, cle],
    }));
  };

  // Toggle tout un groupe
  const toggleGroupe = (groupe: GroupeEnum) => {
    const champsDuGroupe = CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === groupe);
    const tousSelectionnes = champsDuGroupe.every((c) => selection.champsSelectionnes.includes(c.cle));
    setSelection((s) => ({
      ...s,
      champsSelectionnes: tousSelectionnes
        ? s.champsSelectionnes.filter((c) => !champsDuGroupe.some((gc) => gc.cle === c))
        : [...s.champsSelectionnes, ...champsDuGroupe.map((gc) => gc.cle)],
    }));
  };

  // Tout selectionner / deselectionner
  const toggleTous = () => {
    setSelection((s) => ({
      ...s,
      champsSelectionnes: s.champsSelectionnes.length === CHAMPS_EXPORT_VEHICULE.length
        ? []
        : CHAMPS_EXPORT_VEHICULE.map((c) => c.cle),
    }));
  };

  // Groupes pour l'affichage
  const groupesAffichage: { groupe: GroupeEnum; label: string; champs: typeof CHAMPS_EXPORT_VEHICULE }[] = [
    { groupe: "identification", label: "Identification", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "identification") },
    { groupe: "client", label: "Client", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "client") },
    { groupe: "situation", label: "Situation", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "situation") },
    { groupe: "localisation", label: "Localisation", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "localisation") },
    { groupe: "dimensions", label: "Dimensions", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "dimensions") },
    { groupe: "dates", label: "Dates", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "dates") },
    { groupe: "photos", label: "Photos", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "photos") },
    { groupe: "divers", label: "Divers", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "divers") },
  ];

  const handleGenerer = async () => {
    if (champsActifs.length === 0) {
      toast({ title: "Erreur", description: "Selectionnez au moins un champ.", variant: "destructive" });
      return;
    }

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
      toast({ title: "Erreur d'export", description: "Impossible de generer le fichier.", variant: "destructive" });
    }
  };

  // Render
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl sm:max-w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export du registre vehicules</DialogTitle>
          <DialogDescription>
            Selectionnez les champs, le format et les options d'exportation.
          </DialogDescription>
        </DialogHeader>

        {/* ---------- SELECTION GLOBALE ---------- */}
        <div className="mb-4 p-3 rounded-md border border-border bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Champs selectionnes : {champsActifs.length} / {CHAMPS_EXPORT_VEHICULE.length}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={toggleTous} className="text-xs">
                {selection.champsSelectionnes.length === CHAMPS_EXPORT_VEHICULE.length ? "Tout deselectionner" : "Tout selectionner"}
              </Button>
            </div>
          </div>
        </div>

        {/* ---------- GROUPES DE CHAMP ---------- */}
        <div className="space-y-4 pt-4 max-h-[50vh] overflow-y-auto">
          {[
            { groupe: "identification", label: "Identification", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "identification") },
            { groupe: "client", label: "Client", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "client") },
            { groupe: "situation", label: "Situation", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "situation") },
            { groupe: "localisation", label: "Localisation", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "localisation") },
            { groupe: "dimensions", label: "Dimensions", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "dimensions") },
            { groupe: "dates", label: "Dates", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "dates") },
            { groupe: "photos", label: "Photos", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "photos") },
            { groupe: "divers", label: "Divers", champs: CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === "divers") },
          ].map((g) => {
            const champsGroupe = g.champs;
            const nbSelectionnes = champsGroupe.filter((c) => selection.champsSelectionnes.includes(c.cle)).length;
            const tousSelectionnes = champsGroupe.length > 0 && nbSelectionnes === champsGroupe.length;

            return (
              <fieldset
                key={g.groupe}
                className="border rounded-md p-3"
                style={{
                  borderColor: nbSelectionnes > 0 ? "var(--primary)" : "var(--border)",
                }}
              >
                <legend className="flex items-center justify-between mb-2">
                  <span className="font-medium">{g.label}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const champsGroupe = CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === g.groupe);
                      const tousSelectionnes = champsGroupe.every((c) => selection.champsSelectionnes.includes(c.cle));
                      setSelection((s) => ({
                        ...s,
                        champsSelectionnes: tousSelectionnes
                          ? s.champsSelectionnes.filter((c) => !champsGroupe.some((gc) => gc.cle === c))
                          : [...s.champsSelectionnes, ...champsGroupe.map((gc) => gc.cle)],
                      }));
                    }}
                    className="text-xs p-1"
                    aria-label={tousSelectionnes ? `Deselectionner ${g.label}` : `Selectionner ${g.label}`}
                  >
                    {tousSelectionnes ? "✓" : "✚"}
                  </Button>
                </legend>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {CHAMPS_EXPORT_VEHICULE.filter((c) => c.groupe === g.groupe).map((c) => (
                    <label key={c.cle} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selection.champsSelectionnes.includes(c.cle)}
                        onCheckedChange={() => toggleChamp(c.cle)}
                      />
                      <span className="text-sm font-medium">{c.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>

        {/* ---------- FORMAT ---------- */}
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">Format</label>
          <Select onValueChange={(v) => setSelection((s) => ({ ...s, format: v as "xlsx" | "pdf" | "csv" }))} value={selection.format}>
            <SelectTrigger>
              <SelectValue placeholder="Selectionner un format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key="xlsx" value="xlsx">Excel (.xlsx)</SelectItem>
              <SelectItem key="pdf" value="pdf">PDF (.pdf)</SelectItem>
              <SelectItem key="csv" value="csv">CSV (.csv)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ---------- PHOTOS ---------- */}
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">
            Photos par vehicule
            {selection.photosParVehicule > 0 && ` (${poidsEstime > 0 ? `${Math.round(poidsEstime / 1024)} Ko estime` : ""})`}
          </label>
          <div className="space-y-1 mt-1">
            {[
              { valeur: 0, label: "Aucune" },
              { valeur: 1, label: "Couverture seulement" },
              { valeur: 2, label: "3 photos max" },
              { valeur: 3, label: "Toutes" },
            ].map((opt) => (
              <label key={opt.valeur} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value={opt.valeur.toString()}
                  checked={selection.photosParVehicule === opt.valeur}
                  onChange={() => setSelection((s) => ({ ...s, photosParVehicule: opt.valeur }))}
                  className="rounded border-primary"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ---------- CONTEXTE ---------- */}
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">Contexte (optionnel)</label>
          <input
            type="text"
            placeholder="ex: Agence Principale, Session Hiver 2025..."
            value={selection.contexte}
            onChange={(e) => setSelection((s) => ({ ...s, contexte: e.target.value.trim() }))}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>

        {/* ---------- ESTIMATION POIDS ---------- */}
        <div className="mt-3 p-3 rounded bg-yellow-50 text-yellow-800 text-sm">
          Estimated file size: {poidsEstime > 0 ? `${Math.round(poidsEstime / 1024)} Ko` : "Aucun poids (pas de photos)"}
        </div>

        {/* ---------- BOUTONS ---------- */}
        <div className="flex justify-end gap-3 pt-6 border-t border-border mt-4">
          <Button variant="outline" onClick={onClose} style={{ minWidth: "100px" }}>
            Annuler
          </Button>
          <Button onClick={handleGenerer} disabled={champsActifs.length === 0} style={{ minWidth: "120px" }}>
            Exporter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}