"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, MapPin, Pencil, LogOut, ArrowRight, Loader2, Car, FilterX, ZoomIn, Download, Printer } from "lucide-react";
import { api } from "~/trpc/react";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { Button } from "~/components/ui/button";
import { ConfirmationDialog } from "~/components/ui/confirmation-dialog";
import { usePermissions } from "~/hooks/usePermissions";
import { toast } from "sonner";
import { keepPreviousData } from "@tanstack/react-query";
import {
  STATUTS_VEHICULE_OPTIONS,
  STATUTS_VEHICULE_LABELS,
  STATUTS_VEHICULE_COLORS,
  ALERTE_CODE_LABELS,
  ALERTE_NIVEAU_COLORS,
  formatDate,
} from "../_components/statuts";
import { VehiculeFormDialog, type VehiculeFormModel } from "../_components/VehiculeFormDialog";
import { PhotoLightbox } from "../_components/PhotoLightbox";
import { ExportVehiculesDialog } from "../_components/ExportVehiculesDialog";
import { vehiculeVersFormModel } from "../_components/vehicule-form-model";
import {
  lireFiltres,
  ecrireFiltres,
  compterFiltres,
  type FiltresVehicules,
} from "../_components/filtres";
import { PrintVehiculesList } from "@/lib/PrintVehiculesList";

export default function GarageVehiculesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();

  const [search, setSearch] = useState(() => lireFiltres(searchParams).q);
const [debouncedSearch, setDebouncedSearch] = useState(() => lireFiltres(searchParams).q);
const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);
  const [statut, setStatut] = useState(() => lireFiltres(searchParams).statut);
  const [siteId, setSiteId] = useState(() => lireFiltres(searchParams).site);
  const [nonPositionnes, setNonPositionnes] = useState(() => lireFiltres(searchParams).nonPositionnes);
  const nouveauDemande = searchParams.get("nouveau") === "1";
  const [formOpen, setFormOpen] = useState(nouveauDemande);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [aSortir, setASortir] = useState<{ id: number; numRegistre: number } | null>(null);
  // Visionneuse ouverte depuis la liste : on charge le jeu complet de photos du
  // vehicule au moment du clic, pas pour toute la liste.
  const [visionneuse, setVisionneuse] = useState<number | null>(null);
  const [photoOuverte, setPhotoOuverte] = useState(0);
  const [exportOuvert, setExportOuvert] = useState(false);
  const [printOuvert, setPrintOuvert] = useState(false);
  const { data: photosVisionneuse, isFetching: chargementPhotos } = api.garage.vehiculePhotos.useQuery(
    { id: visionneuse ?? 0 },
    { enabled: visionneuse != null, staleTime: 60_000 },
  );

  const ouvrirVisionneuse = useCallback((id: number) => {
    setVisionneuse(id);
    setPhotoOuverte(0);
  }, []);

  // Les filtres sont persistes dans l'URL : la liste est partageable et survit au
  // rechargement, et le retour depuis une fiche peut les restaurer.
  const filtres = useMemo<FiltresVehicules>(
    () => ({ q: debouncedSearch, statut, site: siteId, nonPositionnes }),
    [debouncedSearch, statut, siteId, nonPositionnes],
  );
  const filtresQs = useMemo(() => ecrireFiltres(filtres), [filtres]);

  useEffect(() => {
    const qs = filtresQs ? `${filtresQs}${nouveauDemande ? "&nouveau=1" : ""}` : nouveauDemande ? "nouveau=1" : "";
    router.replace(qs ? `/dashboard/garage/vehicules?${qs}` : "/dashboard/garage/vehicules", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtresQs]);

  // Vers une fiche, en memorisant les filtres pour pouvoir revenir dessus.
  const hrefVehicule = useCallback(
    (id: number) =>
      filtresQs
        ? `/dashboard/garage/vehicules/${id}?retour=${encodeURIComponent(filtresQs)}`
        : `/dashboard/garage/vehicules/${id}`,
    [filtresQs],
  );

  const { data: editDetail } = api.garage.vehicule.useQuery(
    { id: editingId as number },
    { enabled: editingId !== null },
  );

  const editModel = useMemo<VehiculeFormModel | null>(() => {
    if (!editDetail?.vehicule) return null;
    return vehiculeVersFormModel(editDetail.vehicule);
  }, [editDetail]);

  const { data: sites } = api.garage.sites.useQuery();
  const { data, isLoading, isError, error, refetch } = api.garage.vehicles.useQuery({
    search: debouncedSearch.trim() || undefined,
    statut: statut || undefined,
    siteId: siteId ? Number(siteId) : undefined,
    nonPositionnes: nonPositionnes ? true : undefined,
    limit: 200,
  }, { placeholderData: keepPreviousData });

  const canCreer = hasPermission("parking.vehicule.creer");
  const canModifier = hasPermission("parking.vehicule.modifier");
  const canExporter = true;

  const sortie = api.garage.sortie.useMutation({
    onSuccess: () => {
      utils.garage.overview.invalidate();
      utils.garage.vehicles.invalidate();
      utils.garage.vehicule.invalidate();
      utils.garage.plan.invalidate();
      toast.success("Véhicule sorti du parking");
      setASortir(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const vehicules = useMemo(() => (data?.vehicules ?? []).concat(), [data]);

  const statutCounts = useMemo(() => {
    const totals = new Map<string, number>();
    for (const v of data?.vehicules ?? []) {
      totals.set(v.statut, (totals.get(v.statut) ?? 0) + 1);
    }
    return totals;
  }, [data]);

  const nbFiltres = compterFiltres(filtres);
  const aFiltres = nbFiltres > 0;

  const reinitialiserFiltres = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatut("");
    setSiteId("");
    setNonPositionnes(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Registre des véhicules</h2>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} véhicule(s) affiché(s)
            {aFiltres ? ` · ${nbFiltres} filtre(s) actif(s)` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {aFiltres && (
            <Button type="button" variant="ghost" size="sm" onClick={reinitialiserFiltres}>
              <FilterX size={15} className="mr-1.5" /> Réinitialiser les filtres
            </Button>
          )}
          {canCreer && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus size={16} className="mr-1.5" /> Enregistrer un véhicule
            </Button>
          )}
          {canExporter && vehicules.length > 0 && (
            <Button type="button" variant="outline" onClick={() => setExportOuvert(true)}>
              <Download size={16} className="mr-1.5" /> Exporter
            </Button>
          )}
          {canExporter && vehicules.length > 0 && (
            <Button type="button" variant="outline" onClick={() => setPrintOuvert(true)}>
              <Printer size={16} className="mr-1.5" /> Imprimer
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (marque, modèle, immat, client, n°…)"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
        >
          <option value="">Tous les statuts</option>
          {STATUTS_VEHICULE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUTS_VEHICULE_LABELS[s] ?? s} ({statutCounts.get(s) ?? 0})
            </option>
          ))}
        </select>
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
        >
          <option value="">Tous les sites</option>
          {(sites ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={nonPositionnes}
            onChange={(e) => setNonPositionnes(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Non positionnés sur la carte
        </label>
      </div>

      {isLoading && (
        <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Chargement…
        </div>
      )}

      {isError && !isLoading && (
        <ErrorState message={error?.message ?? "Impossible de charger les véhicules."} retryAction={() => void refetch()} />
      )}

      {!isLoading && !isError && vehicules.length === 0 && (
        <EmptyState
          icon={<Car size={40} />}
          title="Aucun véhicule"
          description="Aucun véhicule ne correspond aux critères. Utilisez « Enregistrer un véhicule » pour entrer une nouvelle immatriculation."
          actionButton={
            canCreer ? (
              <Button onClick={() => setFormOpen(true)}>
                <Plus size={16} className="mr-1.5" /> Enregistrer un véhicule
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !isError && vehicules.length > 0 && (
        <Card hover={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">N°</th>
                  <th className="px-4 py-3 font-semibold">Photo</th>
                  <th className="px-4 py-3 font-semibold">Véhicule</th>
                  <th className="px-4 py-3 font-semibold">Immatriculation</th>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold">Position</th>
                  <th className="px-4 py-3 font-semibold">Emplacement</th>
                  <th className="px-4 py-3 font-semibold">Alertes</th>
                  <th className="px-4 py-3 font-semibold">Entrée</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicules.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">{v.numRegistre}</td>
                    <td className="px-4 py-3">
                      {v.photo ? (
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            onClick={() => ouvrirVisionneuse(v.id)}
                            title="Agrandir les photos"
                            className="group relative block overflow-hidden rounded-md border border-border transition-transform hover:scale-[1.04]"
                          >
                            <img
                              src={v.photo.url}
                              alt="Véhicule"
                              className="aspect-[4/3] w-16 object-cover"
                            />
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                              <ZoomIn className="size-4" />
                            </span>
                          </button>
                          <Link href={hrefVehicule(v.id)} className="text-[11px] text-muted-foreground hover:text-primary hover:underline">
                            Fiche
                          </Link>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={hrefVehicule(v.id)} className="font-medium text-foreground hover:text-primary hover:underline">
                        {v.marque ? v.marque : "—"} {v.modele ?? ""}
                      </Link>
                      {v.version && <span className="ml-1 text-xs text-muted-foreground">{v.version}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {v.immatriculation ? (
                        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">{v.immatriculation}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.clientNom ? (
                        <div>
                          {v.clientNom}
                          {v.clientTelephone && <div className="text-xs text-muted-foreground/70">{v.clientTelephone}</div>}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUTS_VEHICULE_COLORS[v.statut] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUTS_VEHICULE_LABELS[v.statut] ?? v.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.zoneId != null && v.centreX != null ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <MapPin size={12} /> Positionné
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400">À placer</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.spot ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <MapPin size={11} className="text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{v.spot}</span>
                          {v.zone && <span className="text-muted-foreground"> / {v.zone}</span>}
                          {v.site && <span className="text-muted-foreground"> / {v.site}</span>}
                        </span>
                      ) : v.zone ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin size={11} className="text-amber-500" />
                          <span>{v.zone}</span>
                          {v.site && <span className="text-muted-foreground"> / {v.site}</span>}
                        </span>
                      ) : v.site ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin size={11} className="text-blue-500" />
                          <span>{v.site}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400">Non défini</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {v.alertes.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        {v.alertes.map((a, i) => (
                          <span
                            key={i}
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${ALERTE_NIVEAU_COLORS[a.niveau] ?? "bg-muted text-muted-foreground"}`}
                            title={a.code}
                          >
                            {ALERTE_CODE_LABELS[a.code] ?? a.code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(v.dateEntree)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {canModifier && v.statut !== "SORTI" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setASortir({ id: v.id, numRegistre: v.numRegistre })}
                            className="text-destructive hover:text-destructive"
                            title="Sortir du parking"
                          >
                            <LogOut size={15} />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(v.id)}
                          title="Modifier"
                          disabled={!canModifier}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/dashboard/garage/carte?placer=${v.id}`)}
                          title="Placer sur la carte"
                          disabled={!canModifier || v.zoneId != null}
                        >
                          <MapPin size={15} />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" asChild title="Fiche">
                          <Link href={hrefVehicule(v.id)}>
                            <ArrowRight size={15} />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <VehiculeFormDialog
        open={formOpen}
        vehicule={null}
        onClose={() => {
          setFormOpen(false);
          if (searchParams.get("nouveau") === "1") router.replace("/dashboard/garage/vehicules", { scroll: false });
        }}
      />

      <VehiculeFormDialog open={editingId !== null} vehicule={editModel} onClose={() => setEditingId(null)} />

      <ConfirmationDialog
        isOpen={aSortir !== null}
        onClose={() => setASortir(null)}
        onConfirm={(motif) => aSortir && sortie.mutate({ vehicleId: aSortir.id, motif })}
        title={`Sortir le véhicule n°${aSortir?.numRegistre ?? ""} ?`}
        description="Le véhicule quittera le parking et passera au statut « Sorti ». Action irréversible."
        confirmText="Sortir"
        variant="destructive"
        requiresReason
      />

      {/* Visionneuse ouverte depuis la vignette de la liste : le tableau complet
          de photos est charge a la demande pour la seule ligne concernee. */}
      {visionneuse !== null && (
        <div className="sr-only" aria-live="polite">
          {chargementPhotos ? "Chargement des photos…" : `${photosVisionneuse?.photos.length ?? 0} photo(s)`}
        </div>
      )}
      <PhotoLightbox
        photos={photosVisionneuse?.photos ?? []}
        index={visionneuse !== null ? photoOuverte : null}
        onIndexChange={setPhotoOuverte}
        onClose={() => setVisionneuse(null)}
        nomFichierBase={
          data?.vehicules.find((x) => x.id === visionneuse)?.numRegistre != null
            ? `vehicule-${data.vehicules.find((x) => x.id === visionneuse)!.numRegistre}`
            : "vehicule"
        }
      />
      <ExportVehiculesDialog
        open={exportOuvert}
        onClose={() => setExportOuvert(false)}
        filtres={filtres}
        lignesVisibles={data?.total ?? 0}
      />
      <PrintVehiculesList
        vehicules={vehicules as never}
        filtres={{
          search: debouncedSearch.trim() || undefined,
          statut: statut || undefined,
          siteId: siteId ? Number(siteId) : undefined,
          nonPositionnes: nonPositionnes || undefined,
        }}
        garageNom="Garage"
        utilisateur="Utilisateur"
        isOpen={printOuvert}
        onClose={() => setPrintOuvert(false)}
      />
    </motion.div>
  );
}