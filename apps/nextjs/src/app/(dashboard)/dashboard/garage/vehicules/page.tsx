"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, MapPin, Pencil, LogOut, ArrowRight, Loader2, Car } from "lucide-react";
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
import { ExportVehiculesDialog, type LigneExportVehicule } from "../_components/ExportVehiculesDialog";

export default function GarageVehiculesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);
  const [statut, setStatut] = useState("");
  const [siteId, setSiteId] = useState("");
  const [nonPositionnes, setNonPositionnes] = useState(false);
  const [formOpen, setFormOpen] = useState(searchParams.get("nouveau") === "1");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [aSortir, setASortir] = useState<{ id: number; numRegistre: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const { data: editDetail } = api.garage.vehicule.useQuery(
    { id: editingId as number },
    { enabled: editingId !== null },
  );

  const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
  const editModel = useMemo<VehiculeFormModel | null>(() => {
    if (!editDetail?.vehicule) return null;
    const v = editDetail.vehicule;
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Registre des véhicules</h2>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} véhicule(s) affiché(s){statut ? ` · filtre ${STATUTS_VEHICULE_LABELS[statut] ?? statut}` : ""}
          </p>
        </div>
        {canCreer && (
          <Button onClick={() => setFormOpen(true)}>
            <Plus size={16} className="mr-1.5" /> Enregistrer un véhicule
          </Button>
        )}
        {hasPermission("parking.vehicule.exporter") && (
          <Button
            onClick={() => setExportOpen(true)}
            variant="outline"
            size="sm"
            className="ml-2"
          >
            <Export size={16} className="mr-1" /> Exporter
          </Button>
        )}
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
                        <Link href={`/dashboard/garage/vehicules/${v.id}`} title="Voir en détail">
                          <img
                            src={v.photo.url}
                            alt="Véhicule"
                            className="aspect-[4/3] w-16 rounded-md border border-border object-cover"
                          />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/garage/vehicules/${v.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
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
                          <Link href={`/dashboard/garage/vehicules/${v.id}`}>
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
      <ExportVehiculesDialog
        vehicules={vehicules}
        onExport={(resultat) => {
          toast.success(
            `Export terminé : ${resultat.lignes} véhicule${resultat.lignes > 1 ? "s" : ""} • ${resultat.nomFichier}`
          );
          setExportOpen(false);
        }}
        onClose={() => setExportOpen(false)}
      />
    </motion.div>
  );
}