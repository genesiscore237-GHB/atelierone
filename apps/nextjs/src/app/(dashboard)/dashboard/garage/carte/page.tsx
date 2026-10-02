"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin, Target, Undo2, LogOut, RefreshCw, Loader2, Info } from "lucide-react";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { Button } from "~/components/ui/button";
import { ConfirmationDialog } from "~/components/ui/confirmation-dialog";
import { usePermissions } from "~/hooks/usePermissions";
import { toast } from "sonner";
import { PlanSvg } from "./_plan/PlanSvg";
import {
  STATUTS_VEHICULE_LABELS,
  ZONE_TYPE_LABELS,
} from "../_components/statuts";

export default function GarageCartePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  const { data: sites } = api.garage.sites.useQuery();
  const siteParam = searchParams.get("site");
  const placerParam = searchParams.get("placer");

  const [localSiteId, setLocalSiteId] = useState<number | null>(null);
  const siteId = localSiteId ?? (siteParam ? Number(siteParam) : null) ?? sites?.[0]?.id ?? null;

  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [hoveredVehicleId, setHoveredVehicleId] = useState<number | null>(null);
  const [actionMode, setActionMode] = useState<{ vehicleId: number; isMove: boolean } | null>(null);
  const [rotationInput, setRotationInput] = useState("0");
  const [confirmDetacher, setConfirmDetacher] = useState(false);
  const [confirmSortie, setConfirmSortie] = useState(false);

  const planQ = api.garage.plan.useQuery({ id: siteId as number }, { enabled: siteId != null });

  const utils = api.useUtils();
  const canModifier = hasPermission("parking.vehicule.modifier");

  const place = api.garage.place.useMutation({
    onSuccess: (r) => {
      utils.garage.plan.invalidate();
      utils.garage.overview.invalidate();
      utils.garage.vehicles.invalidate();
      toast.success(`Véhicule positionné sur la carte`);
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  const detacher = api.garage.detacher.useMutation({
    onSuccess: () => {
      utils.garage.plan.invalidate();
      utils.garage.overview.invalidate();
      utils.garage.vehicles.invalidate();
      setSelectedVehicleId(null);
      toast.success("Véhicule retiré de la carte (à replacer)");
    },
    onError: (e) => toast.error(e.message),
  });

  const sortie = api.garage.sortie.useMutation({
    onSuccess: () => {
      utils.garage.plan.invalidate();
      utils.garage.overview.invalidate();
      utils.garage.vehicles.invalidate();
      utils.garage.alertes.invalidate();
      setSelectedVehicleId(null);
      toast.success("Véhicule sorti du parking");
    },
    onError: (e) => toast.error(e.message),
  });

  // Active un placement demandé depuis la liste (URL ?placer=).
  useEffect(() => {
    const placerId = Number(placerParam);
    if (Number.isFinite(placerId) && sites && siteId != null) {
      setActionMode({ vehicleId: placerId, isMove: false });
      setRotationInput("0");
      if (siteParam !== String(siteId)) {
        router.replace(`/dashboard/garage/carte?site=${siteId}`, { scroll: false });
      }
    }
  }, [placerParam, sites, siteId, siteParam, router]);

  const plan = planQ.data;

  const vehiclesById = useMemo(() => {
    const m = new Map<number, any>();
    for (const v of planQ.data?.vehicules ?? []) m.set(v.id, v);
    return m;
  }, [planQ.data]);

  // Conversion centre -> coin pour l'API `place` (attend centreX/centreY en coins)
  const handlePlace = useCallback(async (
    vehicleId: number,
    cx: number,
    cy: number,
    rotation: number,
    zoneId: number,
    spotId: number | null
  ) => {
    const v = vehiclesById.get(vehicleId);
    if (!v) {
      toast.error("Véhicule introuvable sur le plan.");
      return;
    }
    const l = v.largeur ?? 1.8;
    const L = v.longueur ?? 4.5;
    place.mutate({ vehicleId, zoneId, spotId: spotId ?? undefined, centreX: cx - l / 2, centreY: cy - L / 2, rotation, motif: "" });
  }, [vehiclesById]);

  const handleDetacher = useCallback(async (vehicleId: number, motif: string) => {
    detacher.mutate({ vehicleId, motif });
  }, []);

  const handleSortie = useCallback(async (vehicleId: number, motif: string) => {
    sortie.mutate({ vehicleId, motif });
}, []);

  const selectedVehicle = selectedVehicleId != null ? vehiclesById.get(selectedVehicleId) : undefined;
  const actionVehicle = actionMode != null ? vehiclesById.get(actionMode.vehicleId) : undefined;

  const vehiculesNonPositionnes = [...(plan?.vehiculesNonPositionnes ?? [])].sort((a, b) => a.numRegistre - b.numRegistre);

  const handleVehicleClick = (v: any) => {
    setSelectedVehicleId(v.id);
  };

  const handleVehicleDragStart = (e: React.MouseEvent, vehicule: any) => {
    // Le PlanSvg gère le drag via ses propres handlers
    e.stopPropagation();
  };

  return (
    <div className="space-y-6">
      {/* Sélecteur de site */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-lg border border-border bg-background px-2 py-1">
          <select
            value={siteId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v) {
                setLocalSiteId(Number(v));
                router.replace(`/dashboard/garage/carte?site=${v}`, { scroll: false });
              }
            }}
            className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"
          >
            {(sites ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom} ({s.code})
              </option>
            ))}
          </select>
        </div>
        <span className="text-sm text-muted-foreground">
          {plan ? `${plan.site.planLargeur} m × ${plan.site.planHauteur} m` : ""}
        </span>
      </div>

      {plan && (
        <PlanSvg
          plan={plan}
          vehicules={plan.vehicules}
          zones={plan.zones}
          spots={plan.spots}
          vehiculesNonPositionnes={vehiculesNonPositionnes}
          selectedVehicleId={selectedVehicleId}
          setSelectedVehicleId={setSelectedVehicleId}
          hoveredVehicleId={hoveredVehicleId}
          setHoveredVehicleId={setHoveredVehicleId}
          actionMode={actionMode}
          setActionMode={setActionMode}
          rotationInput={rotationInput}
          setRotationInput={setRotationInput}
          canModifier={canModifier}
          onPlace={handlePlace}
          onDetacher={detacher.mutate}
          onSortie={sortie.mutate}
        />
      )}

      {!plan && planQ.isLoading && (
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Chargement du plan…
        </div>
      )}

      {!plan && planQ.isError && (
        <ErrorState message={planQ.error?.message ?? "Impossible de charger la carte."} retryAction={() => void planQ.refetch()} />
      )}

      {!plan && !planQ.isLoading && !planQ.isError && (!sites || sites.length === 0) && (
        <EmptyState
          icon={<Info size={40} />}
          title="Aucun site actif"
          description="Un site avec des zones stationnables est requis pour afficher la carte."
        />
      )}

      {/* Panneau « À placer » */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">À placer ({vehiculesNonPositionnes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {vehiculesNonPositionnes.length === 0 && (
              <p className="text-sm text-muted-foreground">Tous les véhicules ont une position sur la carte.</p>
            )}
            {vehiculesNonPositionnes.map((v) => (
              <div
                key={v.id}
                className={`rounded-lg border p-2.5 transition-colors ${
                  actionMode?.vehicleId === v.id ? "border-cyan-500 bg-cyan-500/5" : "border-border bg-background"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      #{v.numRegistre} <span className="text-muted-foreground">{v.marque} {v.modele}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">{STATUTS_VEHICULE_LABELS[v.statut] ?? v.statut}</p>
                  </div>
                  {canModifier && (
                    <Button
                      type="button"
                      size="sm"
                      variant={actionMode?.vehicleId === v.id ? "default" : "outline"}
                      onClick={() => {
                        setActionMode({ vehicleId: v.id, isMove: false });
                        setRotationInput("0");
                      }}
                    >
                      <MapPin size={13} className="mr-1" /> Placer
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {selectedVehicle && (
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Détails véhicule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-semibold text-foreground">
                #{selectedVehicle.numRegistre} · {selectedVehicle.marque ?? "—"} {selectedVehicle.modele ?? ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {STATUTS_VEHICULE_LABELS[selectedVehicle.statut] ?? selectedVehicle.statut}
                {selectedVehicle.spotId ? " · emplacement réservé" : " · position libre"}
              </p>
            </div>
            
            {selectedVehicle.photos?.length && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Photos</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {selectedVehicle.photos.slice(0, 6).map((photo: any, i: number) => (
                    <img
                      key={i}
                      src={photo.url}
                      alt={`${photo.categorie}`}
                      className="w-20 h-20 object-cover rounded-lg border border-border"
                    />
                  ))}
                </div>
              </div>
            )}

            {canModifier && selectedVehicle.statut !== "SORTI" && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setRotationInput(String(selectedVehicle.rotation ?? 0));
                    setActionMode({ vehicleId: selectedVehicle.id, isMove: true });
                  }}
                >
                  <MapPin size={14} className="mr-1.5" /> Déplacer
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDetacher(true)}>
                  <Undo2 size={14} className="mr-1.5" /> Retirer de la carte
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmSortie(true)} className="text-destructive">
                  <LogOut size={14} className="mr-1.5" /> Sortir
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmationDialog
        isOpen={confirmDetacher}
        onClose={() => setConfirmDetacher(false)}
        onConfirm={(motif) => selectedVehicle && detacher.mutate({ vehicleId: selectedVehicle.id, motif })}
        title="Retirer de la carte ?"
        description="Le véhicule sera marqué « à replacer ». Sa position actuelle sera libérée."
        confirmText="Retirer"
        variant="destructive"
        requiresReason
      />
      <ConfirmationDialog
        isOpen={confirmSortie}
        onClose={() => setConfirmSortie(false)}
        onConfirm={(motif) => selectedVehicle && sortie.mutate({ vehicleId: selectedVehicle.id, motif })}
        title="Sortir le véhicule ?"
        description="Le véhicule quittera le parking et passera au statut « Sorti ». Action irréversible."
        confirmText="Sortir"
        variant="destructive"
        requiresReason
      />
    </div>
  );
}