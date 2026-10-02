"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Loader2,
  Pencil,
  LogOut,
  MapPin,
  BellRing,
  RefreshCw,
  Phone,
  Ruler,
  Weight,
  History,
  ListChecks,
  CornerDownRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Camera,
  X,
} from "lucide-react";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { Button } from "~/components/ui/button";
import { ConfirmationDialog } from "~/components/ui/confirmation-dialog";
import { usePermissions } from "~/hooks/usePermissions";
import { toast } from "sonner";
import {
  STATUTS_VEHICULE_LABELS,
  STATUTS_VEHICULE_COLORS,
  ALERTE_CODE_LABELS,
  ALERTE_NIVEAU_LABELS,
  ALERTE_NIVEAU_COLORS,
  MOUVEMENT_LABELS,
  PHOTO_CATEGORIE_LABELS,
  formatDate,
  formatDateHeure,
  formatNumber,
  formatMeters,
} from "../../_components/statuts";
import { VehiculeFormDialog, type VehiculeFormModel } from "../../_components/VehiculeFormDialog";
import { PhotoLightbox } from "../../_components/PhotoLightbox";
import { ExportVehiculesDialog, type LigneExportVehicule } from "@/lib/ExportVehiculesDialog";
import { PrintVehiculeFiche } from "@/lib/PrintVehiculeFiche";
import { Printer } from "lucide-react";

export default function GarageVehiculeFichePage() {
  const { id } = useParams<{ id: string }>();
  const idNum = Number(id);
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();

  const { data, isLoading, isError, error, refetch } = api.garage.vehicule.useQuery({ id: idNum }, { enabled: Number.isFinite(idNum) });

  const [editing, setEditing] = useState<VehiculeFormModel | null>(null);
  const [confirmSortie, setConfirmSortie] = useState(false);
  const [photoZoom, setPhotoZoom] = useState<string | null>(null);
  const [exportFicheOpen, setExportFicheOpen] = useState(false);
  const [printFicheOpen, setPrintFicheOpen] = useState(false);

  const canModifier = hasPermission("parking.vehicule.modifier");
  const canGererAlertes = hasPermission("parking.alertes.gerer");

  const analyser = api.garage.analyser.useMutation({
    onSuccess: (r) => {
      utils.garage.vehicule.invalidate();
      utils.garage.alertes.invalidate();
      utils.garage.overview.invalidate();
      toast.success(`Analyse : ${r.creees} alerte(s) créée(s), ${r.cloturees} clôturée(s)`);
    },
    onError: (e) => toast.error(e.message),
  });

  const fermerAlerte = api.garage.fermerAlerte.useMutation({
    onSuccess: () => {
      utils.garage.vehicule.invalidate();
      utils.garage.alertes.invalidate();
      utils.garage.overview.invalidate();
      toast.success("Alerte clôturée");
    },
    onError: (e) => toast.error(e.message),
  });

  const sortie = api.garage.sortie.useMutation({
    onSuccess: () => {
      utils.garage.overview.invalidate();
      utils.garage.vehicles.invalidate();
      utils.garage.vehicule.invalidate();
      utils.garage.plan.invalidate();
      toast.success("Véhicule sorti du parking");
      setConfirmSortie(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const editModel = useMemo<VehiculeFormModel | null>(() => {
    if (!data?.vehicule) return null;
    const v = data.vehicule;
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
  }, [data]);

  if (isLoading || !Number.isFinite(idNum)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Chargement du véhicule…
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState message={error?.message ?? "Véhicule introuvable."} retryAction={() => void refetch()} />;
  }

  const v = data.vehicule;
  const estSorti = v.statut === "SORTI";

  const infos: { label: string; value: string }[] = [
    { label: "Marque", value: v.marque ?? "—" },
    { label: "Modèle", value: v.modele ?? "—" },
    { label: "Version", value: v.version ?? "—" },
    { label: "Couleur", value: v.couleur ?? "—" },
    { label: "VIN", value: v.vin ?? "—" },
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
  ];

  function movementIcon(type: string) {
    switch (type) {
      case "ENTREE":
        return <ArrowDownToLine size={14} className="text-emerald-500" />;
      case "SORTIE":
        return <ArrowUpFromLine size={14} className="text-red-500" />;
      case "PLACEMENT":
        return <MapPin size={14} className="text-cyan-500" />;
      default:
        return <CornerDownRight size={14} className="text-muted-foreground" />;
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--module-garage-bg)] text-lg font-black text-[var(--module-garage)]">
            #{v.numRegistre}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">{v.marque ?? "Véhicule"} {v.modele ?? ""}</h2>
              {v.immatriculation && (
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">{v.immatriculation}</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUTS_VEHICULE_COLORS[v.statut] ?? "bg-muted text-muted-foreground"}`}>
                {STATUTS_VEHICULE_LABELS[v.statut] ?? v.statut}
              </span>
              {v.zoneId != null && v.centreX != null ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <MapPin size={12} /> Positionné sur la carte
                </span>
              ) : (
                <span className="text-xs text-amber-600 dark:text-amber-400">À placer sur la carte</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!estSorti && canModifier && (
            <Button asChild variant="outline">
              <Link href={`/dashboard/garage/carte?placer=${v.id}`}>
                <MapPin size={15} className="mr-1.5" /> Placer sur la carte
              </Link>
            </Button>
          )}
          {!estSorti && canModifier && (
            <Button type="button" variant="outline" onClick={() => setConfirmSortie(true)} className="text-destructive">
              <LogOut size={15} className="mr-1.5" /> Sortir
            </Button>
          )}
          {canModifier && (
            <Button type="button" onClick={() => setEditing(editModel)}>
              <Pencil size={15} className="mr-1.5" /> Modifier
            </Button>
          )}
          {hasPermission("parking.vehicule.exporter") && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setExportFicheOpen(true)}
              className="ml-2"
            >
              <Export size={16} className="mr-1" /> Exporter
            </Button>
          )}
          {hasPermission("parking.vehicule.exporter") && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setPrintFicheOpen(true)}
              className="ml-2"
            >
              <Print size={16} className="mr-1" /> Imprimer
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {infos.map((i) => (
                <div key={i.label}>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{i.label}</p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">{i.value}</p>
                </div>
              ))}
              <div>
                <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <Ruler size={11} /> Dimensions
                </p>
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {formatMeters(v.longueur)} × {formatMeters(v.largeur)}
                  {v.dimensionsEstimees && <span className="ml-1 text-[11px] font-normal text-muted-foreground">(estimées)</span>}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <Weight size={11} /> Poids
                </p>
                <p className="mt-0.5 text-sm font-medium text-foreground">{v.poids != null ? `${formatNumber(v.poids)} kg` : "—"}</p>
              </div>
              {v.notes && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{v.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Camera size={16} /> Photos
                {v.photos && v.photos.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">({v.photos.length})</span>
                )}
              </CardTitle>
              {canModifier && (
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(editModel)}>
                  <Pencil size={13} className="mr-1.5" /> Modifier
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!v.photos || v.photos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune photo. Utilisez « Modifier » pour ajouter les photos des faces du véhicule.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {v.photos.map((p, i) => (
                    <button
                      key={`${p.categorie}-${i}`}
                      type="button"
                      onClick={() => setPhotoZoom(p.url)}
                      className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-border transition-transform hover:scale-[1.02]"
                      title={`Agrandir — ${PHOTO_CATEGORIE_LABELS[p.categorie] ?? p.categorie}`}
                    >
                      <img src={p.url} alt={PHOTO_CATEGORIE_LABELS[p.categorie] ?? p.categorie} className="size-full object-cover" />
                      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                        {PHOTO_CATEGORIE_LABELS[p.categorie] ?? p.categorie}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History size={16} /> Mouvements
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.mouvements.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun mouvement enregistré.</p>
              )}
              <ol className="space-y-4">
                {data.mouvements.map((m) => (
                  <li key={m.id} className="flex gap-3">
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      {movementIcon(m.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-sm font-semibold text-foreground">{MOUVEMENT_LABELS[m.type] ?? m.type}</span>
                        <span className="text-xs text-muted-foreground">{formatDateHeure(m.horodatage)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{m.commentaire ?? m.motif ?? "—"}</p>
                      {m.motif && m.commentaire && m.motif !== m.commentaire && (
                        <p className="text-xs text-muted-foreground/70">Motif : {m.motif}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks size={16} /> Tâches ({data.taches.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.taches.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucune tâche enregistrée pour ce véhicule.</p>
              )}
              {data.taches.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.titre}</p>
                    {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t.type ?? "ACTIONS"} · {t.responsable ?? "non assigné"}
                      {t.echeance ? ` · échéance ${formatDate(t.echeance)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      t.statut === "FAIT"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {t.statut ?? "A_FAIRE"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BellRing size={16} /> Alertes
              </CardTitle>
              {canGererAlertes && v.statut !== "SORTI" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={analyser.isPending}
                  onClick={() => analyser.mutate({ vehicleId: v.id })}
                >
                  {analyser.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  <span className="ml-1.5">Analyser</span>
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {!v.hasAlertes && <p className="text-sm text-muted-foreground">Aucune alerte ouverte.</p>}
              {v.alertes.map((a) => (
                <div key={a.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${ALERTE_NIVEAU_COLORS[a.niveau] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {ALERTE_NIVEAU_LABELS[a.niveau] ?? a.niveau}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{formatDateHeure(a.declencheeLe)}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-foreground">{ALERTE_CODE_LABELS[a.code] ?? a.code}</p>
                  {a.message && <p className="mt-0.5 text-xs text-muted-foreground">{a.message}</p>}
                  {a.statut === "OUVERTE" && canGererAlertes && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 px-2 text-xs"
                      disabled={fermerAlerte.isPending}
                      onClick={() => fermerAlerte.mutate({ alertId: a.id })}
                    >
                      <Check size={13} className="mr-1" /> Clôturer
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {photoZoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPhotoZoom(null)}
        >
          <img src={photoZoom} alt="Véhicule (zoom)" className="max-h-[90vh] max-w-full rounded-xl object-contain" />
          <button
            type="button"
            onClick={() => setPhotoZoom(null)}
            className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
            title="Fermer"
          >
            <X className="size-5" />
          </button>
        </div>
      )}

      <VehiculeFormDialog open={editing !== null} vehicule={editing} onClose={() => setEditing(null)} />

      <ConfirmationDialog
        isOpen={confirmSortie}
        onClose={() => setConfirmSortie(false)}
        onConfirm={(motif) => sortie.mutate({ vehicleId: v.id, motif })}
        title={`Sortir le véhicule n°${v.numRegistre} ?`}
        description="Le véhicule quittera le parking et passera au statut « Sorti ». Action irréversible."
        confirmText="Sortir"
        variant="destructive"
        requiresReason
      />
      <PrintVehiculeFiche
        vehicule={v}
        garageNom="Garage"
        utilisateur="Utilisateur"
        isOpen={printFicheOpen}
        onClose={() => setPrintFicheOpen(false)}
      />
    </motion.div>
  );
}