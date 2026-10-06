"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Download, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Dialog, DialogTitle } from "~/components/ui/dialog";
import { api } from "~/trpc/react";
import {
  estimerPoidsExport,
  genererEtTelechargerExport,
  type LigneExportVehicule,
} from "~/lib/parking-export";
import {
  CHAMPS_EXPORT_DEFAUT,
  CHAMPS_EXPORT_VEHICULE,
  FORMATS_EXPORT,
  LIBELLES_FORMAT_EXPORT,
  MAX_CHAMPS_EXPORT,
  MAX_LIGNES_EXPORT,
  MAX_LIGNES_EXPORT_AVEC_PHOTOS,
  getChampExport,
  type FormatExport,
} from "./export-champs";
import { STATUTS_VEHICULE_LABELS } from "./statuts";
import type { FiltresVehicules } from "./filtres";

interface ExportVehiculesDialogProps {
  open: boolean;
  onClose: () => void;
  /** Filtres actuellement appliqués a la liste : l'export les respecte. */
  filtres: FiltresVehicules;
  /** Nombre de véhicules affichés, pour annoncer l'ordre de grandeur. */
  lignesVisibles: number;
}

const PHOTOS_PAR_VEHICULE = [
  { valeur: 0, label: "Aucune photo" },
  { valeur: 1, label: "1 photo (couverture)" },
  { valeur: 2, label: "2 photos" },
  { valeur: 3, label: "3 photos" },
  { valeur: 6, label: "Toutes les photos" },
] as const;

function formatOctets(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

export function ExportVehiculesDialog({
  open,
  onClose,
  filtres,
  lignesVisibles,
}: ExportVehiculesDialogProps) {
  const exportMutation = api.garage.exportVehicules.useMutation();

  const [champs, setChamps] = useState<string[]>(CHAMPS_EXPORT_DEFAUT);
  const [format, setFormat] = useState<FormatExport>("xlsx");
  const [photosParVehicule, setPhotosParVehicule] = useState(1);
  const [includeSortis, setIncludeSortis] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [progression, setProgression] = useState<{ fait: number; total: number } | null>(null);
  const [nombreExport, setNombreExport] = useState(50);

  // photosActives doit être calculé AVANT limiteLignes et le useEffect
  const photosActives = format !== "csv" && champs.includes("photos");
  const limiteLignes = photosActives ? MAX_LIGNES_EXPORT_AVEC_PHOTOS : MAX_LIGNES_EXPORT;

  // Repartir d'une selection propre a chaque ouverture : un export précédent ne
  // doit pas influencer le suivant.
  useEffect(() => {
    if (open) {
      setChamps(CHAMPS_EXPORT_DEFAUT);
      setFormat("xlsx");
      setPhotosParVehicule(1);
      setIncludeSortis(false);
      setRecherche("");
      setProgression(null);
      setNombreExport(Math.min(lignesVisibles, limiteLignes));
    }
  }, [open, lignesVisibles, limiteLignes]);

  const champsSelectionnes = useMemo(
    () => champs.map((c) => getChampExport(c)).filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [champs],
  );

  const champsFiltres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    const source =
      terme.length === 0
        ? CHAMPS_EXPORT_VEHICULE
        : CHAMPS_EXPORT_VEHICULE.filter(
            (c) =>
              c.label.toLowerCase().includes(terme) ||
              c.cle.toLowerCase().includes(terme) ||
              c.groupe.toLowerCase().includes(terme),
          );
    const parGroupe = new Map<string, typeof source>();
    for (const champ of source) {
      const liste = parGroupe.get(champ.groupe) ?? [];
      liste.push(champ);
      parGroupe.set(champ.groupe, liste);
    }
    return [...parGroupe.entries()].map(([groupe, champsDuGroupe]) => ({ groupe, champs: champsDuGroupe }));
  }, [recherche]);

  const basculer = useCallback((cle: string) => {
    setChamps((actuels) =>
      actuels.includes(cle) ? actuels.filter((c) => c !== cle) : [...actuels, cle],
    );
  }, []);

  const basculerGroupe = useCallback((cles: string[]) => {
    setChamps((actuels) => {
      const toutSelectionne = cles.every((c) => actuels.includes(c));
      return toutSelectionne ? actuels.filter((c) => !cles.includes(c)) : [...new Set([...actuels, ...cles])];
    });
  }, []);

  const lignesEffctives = Math.min(nombreExport, limiteLignes, lignesVisibles);

  const poidsEstime = useMemo(
    () =>
      estimerPoidsExport(
        new Array(lignesEffctives) as LigneExportVehicule[],
        champsSelectionnes,
        photosActives ? photosParVehicule : 0,
      ),
    [lignesEffctives, champsSelectionnes, photosActives, photosParVehicule],
  );

  const exportPossible =
    champsSelectionnes.length > 0 &&
    champsSelectionnes.length <= MAX_CHAMPS_EXPORT &&
    lignesVisibles > 0 &&
    !enCours;

  const contexte = useMemo(() => {
    const parties: string[] = [];
    const terme = filtres.q.trim();
    if (terme.length > 0) parties.push(`recherche « ${terme} »`);
    if (filtres.statut) {
      parties.push(`statut : ${STATUTS_VEHICULE_LABELS[filtres.statut] ?? filtres.statut}`);
    }
    if (filtres.site) parties.push(`site n° ${filtres.site}`);
    if (filtres.nonPositionnes) parties.push("non positionnés uniquement");
    if (includeSortis) parties.push("véhicules sortis inclus");
    return parties.length > 0 ? `Filtre : ${parties.join(" · ")}` : "Aucun filtre appliqué";
  }, [filtres, includeSortis]);

  const lancerExport = useCallback(async () => {
    if (!exportPossible) return;
    setEnCours(true);
    setProgression(null);
    try {
      const data = await exportMutation.mutateAsync({
        champs,
        search: filtres.q.trim() || undefined,
        statut: filtres.statut || undefined,
        siteId: filtres.site ? Number(filtres.site) : undefined,
        nonPositionnes: filtres.nonPositionnes || undefined,
        includeSortis,
        withPhotos: photosActives,
        limit: lignesEffctives,
      });

      if (data.vehicules.length === 0) {
        toast.error("Aucun véhicule ne correspond à ces critères.");
        return;
      }

      const resultat = await genererEtTelechargerExport(
        data.vehicules as unknown as LigneExportVehicule[],
        {
          format,
          champs: data.champs,
          photosParVehicule: photosActives ? photosParVehicule : 0,
          contexte,
        },
        "registre-vehicules",
        (fait, total) => setProgression({ fait, total }),
      );

      const details = [
        `${resultat.lignes} ligne${resultat.lignes > 1 ? "s" : ""}`,
        formatOctets(resultat.octets),
        resultat.photosIntegrees > 0 ? `${resultat.photosIntegrees} photo(s)` : null,
      ].filter(Boolean);

      if (data.tronque) {
        toast.warning(
          `Export limité à ${lignesEffctives} véhicule${lignesEffctives > 1 ? "s" : ""}. Affinez vos filtres pour tout récupérer.`,
          { description: details.join(" · ") },
        );
      } else {
        toast.success(`Export « ${resultat.nomFichier} » prêt.`, { description: details.join(" · ") });
      }
      if (resultat.photosInvalides && resultat.photosInvalides > 0) {
        toast.warning(
          `${resultat.photosInvalides} photo(s) indisponible(s) — remplacées par un placeholder.`,
        );
      }
      onClose();
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
      toast.error("L'export a échoué.", { description: message });
    } finally {
      setEnCours(false);
      setProgression(null);
    }
  }, [
    exportPossible,
    exportMutation,
    champs,
    filtres,
    includeSortis,
    photosActives,
    photosParVehicule,
    format,
    contexte,
    onClose,
    lignesEffctives,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !enCours) onClose();
      }}
      className="max-w-3xl"
      ariaLabel="Exporter le registre des véhicules"
    >
      <div className="flex max-h-[85vh] flex-col gap-4 p-6">
        <DialogTitle className="text-lg font-semibold">Exporter le registre des véhicules</DialogTitle>

        {lignesVisibles === 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Aucun véhicule ne correspond aux filtres actuels. Modifiez les filtres avant d'exporter.
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {lignesVisibles > limiteLignes
              ? `Les ${lignesVisibles} véhicules affichés seront exportés (max ${nombreExport}).`
              : `${nombreExport} véhicule${nombreExport > 1 ? "s" : ""} seront exportés.`}{" "}
            <span className="text-xs">{contexte}</span>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="export-format" className="text-sm font-medium">
              Format
            </label>
            <select
              id="export-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as FormatExport)}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              disabled={enCours}
            >
              {FORMATS_EXPORT.map((f) => (
                <option key={f} value={f}>
                  {LIBELLES_FORMAT_EXPORT[f]}
                </option>
              ))}
            </select>
            {format === "csv" && (
              <p className="text-xs text-muted-foreground">
                Le CSV ne peut pas contenir d&apos;images : la colonne « Photos » sera ignorée.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="export-photos" className="text-sm font-medium">
              Photos par véhicule
            </label>
            <select
              id="export-photos"
              value={photosParVehicule}
              onChange={(e) => setPhotosParVehicule(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              disabled={enCours || !champs.includes("photos") || format === "csv"}
            >
              {PHOTOS_PAR_VEHICULE.map((p) => (
                <option key={p.valeur} value={p.valeur}>
                  {p.label}
                </option>
              ))}
            </select>
            {!champs.includes("photos") && (
              <p className="text-xs text-muted-foreground">
                Cochez la colonne « Photos » plus bas pour intégrer les images.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="export-limit" className="text-sm font-medium">
            Nombre de véhicules à exporter
          </label>
          <div className="flex items-center gap-2">
            <input
              id="export-limit"
              type="number"
              min={1}
              max={limiteLignes}
              value={nombreExport}
              onChange={(e) => setNombreExport(Math.min(Math.max(1, Number(e.target.value) || 1), limiteLignes))}
              className="h-9 w-24 rounded-md border border-input bg-background px-2.5 text-sm"
              disabled={enCours}
            />
            <span className="text-xs text-muted-foreground">
              max {limiteLignes} ({photosActives ? "avec photos" : "sans photos"})
            </span>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeSortis}
            onChange={(e) => setIncludeSortis(e.target.checked)}
            disabled={enCours}
            className="size-4 rounded border-input"
          />
          Inclure les véhicules sortis (masqués par défaut dans la liste)
        </label>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="export-recherche-champs" className="text-sm font-medium">
              Colonnes à exporter
            </label>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setChamps(CHAMPS_EXPORT_DEFAUT)}
                disabled={enCours}
              >
                Par défaut
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setChamps([])}
                disabled={enCours}
              >
                Tout désélectionner
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="export-recherche-champs"
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Filtrer les colonnes…"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm"
              disabled={enCours}
            />
            {recherche.length > 0 && (
              <button
                type="button"
                onClick={() => setRecherche("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Effacer le filtre des colonnes"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border border-border p-3">
            {champsFiltres.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Aucune colonne ne correspond à « {recherche} ».
              </p>
            ) : (
              champsFiltres.map(({ groupe, champs: champsDuGroupe }) => {
                const cles = champsDuGroupe.map((c) => c.cle);
                const selectionnes = cles.filter((c) => champs.includes(c)).length;
                const tout = selectionnes === cles.length;
                const aucun = selectionnes === 0;
                return (
                  <div key={groupe} className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => basculerGroupe(cles)}
                      disabled={enCours}
                      className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    >
                      <span
                        className={`inline-flex size-3.5 items-center justify-center rounded border ${
                          tout
                            ? "border-primary bg-primary text-primary-foreground"
                            : aucun
                              ? "border-input"
                              : "border-primary bg-primary/40"
                        }`}
                      >
                        {tout && <Check className="size-2.5" />}
                      </span>
                      {groupe}
                      <span className="font-normal normal-case tracking-normal">
                        ({selectionnes}/{cles.length})
                      </span>
                    </button>
                    <div className="grid gap-1 pl-5 sm:grid-cols-2">
                      {champsDuGroupe.map((champ) => {
                        const actif = champs.includes(champ.cle);
                        return (
                          <label
                            key={champ.cle}
                            className="flex cursor-pointer items-start gap-2 text-sm"
                            title={champ.aide}
                          >
                            <input
                              type="checkbox"
                              checked={actif}
                              onChange={() => basculer(champ.cle)}
                              disabled={enCours}
                              className="mt-0.5 size-4 shrink-0 rounded border-input"
                            />
                            <span className="min-w-0">
                              <span className={actif ? "text-foreground" : "text-muted-foreground"}>
                                {champ.label}
                              </span>
                              {champ.aide && (
                                <span className="block text-xs text-muted-foreground">{champ.aide}</span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {champsSelectionnes.length} colonne{champsSelectionnes.length > 1 ? "s" : ""} sélectionnée
            {champsSelectionnes.length > 1 ? "s" : ""} · poids estimé ≈ {formatOctets(poidsEstime)}
            {photosActives && photosParVehicule > 0 && (
              <> · les photos sont réduites en vignettes pour ne pas alourdir le fichier</>
            )}
          </p>
          {poidsEstime > 40 * 1024 * 1024 && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Cet export risque d&apos;être très lourd. Réduisez le nombre de photos ou de véhicules.
            </p>
          )}
          {champsSelectionnes.length > MAX_CHAMPS_EXPORT && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Maximum {MAX_CHAMPS_EXPORT} colonnes acceptées.
            </p>
          )}
          {photosActives && nombreExport > MAX_LIGNES_EXPORT_AVEC_PHOTOS && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Export avec photos limité à {MAX_LIGNES_EXPORT_AVEC_PHOTOS} véhicules
              {nombreExport > MAX_LIGNES_EXPORT_AVEC_PHOTOS && (() => {
                const diff = nombreExport - MAX_LIGNES_EXPORT_AVEC_PHOTOS;
                return <> · {diff} véhicule{diff > 1 ? "s" : ""} ignoré{diff > 1 ? "s" : ""}</>;
              })()}
              . Affinez les filtres ou exportez sans photo.
            </p>
          )}
        </div>

        {progression && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Préparation des photos {progression.fait}/{progression.total}…
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={enCours}>
            Annuler
          </Button>
          <Button type="button" onClick={lancerExport} disabled={!exportPossible}>
            {enCours ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Export en cours…
              </>
            ) : (
              <>
                <Download className="mr-2 size-4" />
                Exporter
              </>
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}