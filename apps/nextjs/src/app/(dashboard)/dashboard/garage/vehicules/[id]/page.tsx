"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
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
  ArrowLeft,
  Check,
  Camera,
  Printer,
  Download,
  FileSpreadsheet,
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
import { vehiculeVersFormModel } from "../../_components/vehicule-form-model";
import { ExportVehiculesDialog } from "../../_components/ExportVehiculesDialog";

export default function GarageVehiculeFichePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const idNum = Number(id);
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();

  const canExporter = hasPermission("parking.vehicule.exporter");
  const [exportOuvert, setExportOuvert] = useState(false);

  // Feuille de style d'impression : mise en page dédiée pour la fiche véhicule
  // avec photo principale, informations structurées, et masquage des éléments UI.
  useMemo(() => {
    if (typeof document === "undefined") return;
    const existing = document.getElementById("print-fiche-style");
    if (existing) return;
    const style = document.createElement("style");
    style.id = "print-fiche-style";
    style.textContent = `
      @media print {
        /* ========== MASQUAGE UI ========== */
        nav[aria-label="Fil d'Ariane"],
        .no-print,
        button,
        [role="dialog"],
        [data-radix-portal],
        .sr-only,
        [class*="PhotoLightbox"] { display: none !important; }

        /* ========== LAYOUT PAGE ========== */
        @page { margin: 1.5cm; size: A4; }
        html, body { background: white !important; color: black !important; font-size: 11pt; line-height: 1.4; }
        main, .container, [class*="max-w"] { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }

        /* ========== EN-TETE VEHICULE ========== */
        .print-header {
          display: flex !important;
          align-items: center !important;
          gap: 1rem !important;
          padding-bottom: 1rem !important;
          border-bottom: 2px solid #1f2937 !important;
          margin-bottom: 1.5rem !important;
        }
        .print-header-photo {
          flex: 0 0 160px !important;
          height: 120px !important;
          object-fit: cover !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 4px !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .print-header-info { flex: 1 !important; }
        .print-header-info h1 { font-size: 1.75rem !important; font-weight: 700 !important; margin: 0 0 0.25rem !important; }
        .print-header-info .immat { font-family: monospace; background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 3px; font-size: 0.875rem; }
        .print-header-info .statut { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-top: 0.5rem; }
        .print-header-info .statut-EN_PARKING { background: #dbeafe; color: #1e40af; }
        .print-header-info .statut-SORTI { background: #fee2e2; color: #991b1b; }
        .print-header-info .statut-EN_ATTENTE { background: #fef3c7; color: #92400e; }
        .print-header-info .statut-EN_COURS { background: #dbeafe; color: #1e40af; }
        .print-header-info .statut-EN_REPARATION { background: #fef3c7; color: #92400e; }
        .print-header-info .statut-VENDU { background: #e0e7ff; color: #3730a3; }
        .print-header-info .statut-CASSE { background: #fee2e2; color: #991b1b; }
        .print-header-info .num-registre { font-size: 1.25rem !important; font-weight: 700 !important; color: #1f2937 !important; background: #f3f4f6 !important; padding: 0.5rem 1rem !important; border-radius: 8px !important; display: inline-block !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

        /* ========== CARTES / SECTIONS ========== */
        [class*="Card"] { border: 1px solid #e5e7eb !important; box-shadow: none !important; break-inside: avoid !important; page-break-inside: avoid !important; margin-bottom: 1rem !important; }
        [class*="CardHeader"] { border-bottom: 1px solid #e5e7eb !important; padding-bottom: 0.5rem !important; margin-bottom: 0.75rem !important; }
        [class*="CardHeader"] h3 { font-size: 1rem !important; font-weight: 600 !important; margin: 0 !important; }
        [class*="CardContent"] { padding: 0 !important; }

        /* ========== GRILLE INFOS 2 COLONNES ========== */
        .print-info-grid { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 0.5rem 1.5rem !important; }
        .print-info-grid > div { break-inside: avoid !important; }
        .print-info-label { font-size: 0.7rem !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; color: #6b7280 !important; margin-bottom: 0.125rem !important; }
        .print-info-value { font-size: 0.875rem !important; font-weight: 500 !important; color: #1f2937 !important; }

        /* ========== PHOTOS ========== */
        .print-photos-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 0.5rem !important; margin-top: 0.5rem !important; }
        .print-photo-item { break-inside: avoid !important; text-align: center !important; }
        .print-photo-item img { width: 100% !important; height: auto !important; border: 1px solid #e5e7eb !important; border-radius: 4px !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .print-photo-label { font-size: 0.625rem !important; color: #6b7280 !important; margin-top: 0.25rem !important; text-transform: capitalize !important; }

        /* ========== MOUVEMENTS / TACHES / ALERTES ========== */
        .print-list { margin: 0 !important; padding: 0 !important; list-style: none !important; }
        .print-list-item { padding: 0.5rem 0 !important; border-bottom: 1px solid #f3f4f6 !important; }
        .print-list-item:last-child { border-bottom: none !important; }
        .print-list-header { display: flex !important; justify-content: space-between !important; margin-bottom: 0.25rem !important; }
        .print-list-title { font-weight: 600 !important; font-size: 0.875rem !important; }
        .print-list-date { font-size: 0.75rem !important; color: #6b7280 !important; white-space: nowrap !important; }
        .print-list-desc { font-size: 0.8125rem !important; color: #374151 !important; margin-top: 0.125rem !important; }
        .print-list-meta { font-size: 0.6875rem !important; color: #9ca3af !important; margin-top: 0.125rem !important; }

        /* ========== ALERTES BADGES ========== */
        .print-alerte-badge { display: inline-block !important; padding: 0.125rem 0.375rem !important; border-radius: 9999px !important; font-size: 0.625rem !important; font-weight: 600 !important; text-transform: uppercase !important; margin-right: 0.375rem !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .print-alerte-INFO { background: #dbeafe !important; color: #1e40af !important; }
        .print-alerte-ATTENTION { background: #fef3c7 !important; color: #92400e !important; }
        .print-alerte-URGENT { background: #fee2e2 !important; color: #991b1b !important; }
        .print-alerte-CRITIQUE { background: #fecaca !important; color: #7f1d1d !important; }

        /* ========== FORCER AFFICHAGE IMAGES ========== */
        img { max-width: 100% !important; height: auto !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

        /* ========== EVITER COUPURES ========== */
        .print-info-grid > div, .print-photo-item, .print-list-item { page-break-inside: avoid !important; }
        [class*="Card"] { page-break-inside: avoid !important; }

        /* ========== META DOCUMENT ========== */
        .print-meta {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          padding: 0.5rem 0 1rem !important;
          border-bottom: 1px solid #e5e7eb !important;
          margin-bottom: 1rem !important;
          font-size: 0.7rem !important;
          color: #6b7280 !important;
        }
        .print-meta-left { display: flex !important; align-items: center !important; gap: 1rem !important; }
        .print-meta-logo { height: 24px !important; width: auto !important; }
        .print-meta-right { display: flex !important; flex-direction: column !important; align-items: flex-end !important; gap: 0.125rem !important; text-align: right !important; }
        .print-meta-label { font-weight: 600 !important; color: #374151 !important; }
      }

      /* ========== STYLES ECRAN (pour aperçu avant impression) ========== */
      @media screen {
        .print-header { display: flex; align-items: center; gap: 1rem; padding-bottom: 1rem; border-bottom: 2px solid #e5e7eb; margin-bottom: 1.5rem; }
        .print-header-photo { flex: 0 0 160px; height: 120px; object-fit: cover; border: 1px solid #e5e7eb; border-radius: 4px; }
        .print-header-info h1 { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.25rem; }
        .print-header-info .immat { font-family: monospace; background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 3px; font-size: 0.875rem; }
        .print-header-info .statut { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-top: 0.5rem; }
        .print-header-info .statut-EN_PARKING { background: #dbeafe; color: #1e40af; }
        .print-header-info .statut-SORTI { background: #fee2e2; color: #991b1b; }
        .print-header-info .statut-EN_ATTENTE { background: #fef3c7; color: #92400e; }
        .print-header-info .statut-EN_COURS { background: #dbeafe; color: #1e40af; }
        .print-header-info .statut-EN_REPARATION { background: #fef3c7; color: #92400e; }
        .print-header-info .statut-VENDU { background: #e0e7ff; color: #3730a3; }
        .print-header-info .statut-CASSE { background: #fee2e2; color: #991b1b; }
        .print-header-info .num-registre { font-size: 1.25rem; font-weight: 700; color: #1f2937; background: #f3f4f6; padding: 0.5rem 1rem; border-radius: 8px; display: inline-block; }
        .print-info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem 1.5rem; }
        .print-info-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 0.125rem; }
        .print-info-value { font-size: 0.875rem; font-weight: 500; color: #1f2937; }
        .print-photos-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-top: 0.5rem; }
        .print-photo-item { text-align: center; }
        .print-photo-item img { width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 4px; }
        .print-photo-label { font-size: 0.625rem; color: #6b7280; margin-top: 0.25rem; text-transform: capitalize; }
        .print-list { margin: 0; padding: 0; list-style: none; }
        .print-list-item { padding: 0.5rem 0; border-bottom: 1px solid #f3f4f6; }
        .print-list-item:last-child { border-bottom: none; }
        .print-list-header { display: flex; justify-content: space-between; margin-bottom: 0.25rem; }
        .print-list-title { font-weight: 600; font-size: 0.875rem; }
        .print-list-date { font-size: 0.75rem; color: #6b7280; white-space: nowrap; }
        .print-list-desc { font-size: 0.8125rem; color: #374151; margin-top: 0.125rem; }
        .print-list-meta { font-size: 0.6875rem; color: #9ca3af; margin-top: 0.125rem; }
        .print-alerte-badge { display: inline-block; padding: 0.125rem 0.375rem; border-radius: 9999px; font-size: 0.625rem; font-weight: 600; text-transform: uppercase; margin-right: 0.375rem; }
        .print-alerte-INFO { background: #dbeafe; color: #1e40af; }
        .print-alerte-ATTENTION { background: #fef3c7; color: #92400e; }
        .print-alerte-URGENT { background: #fee2e2; color: #991b1b; }
        .print-alerte-CRITIQUE { background: #fecaca; color: #7f1d1d; }

        .print-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0 1rem;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 1rem;
          font-size: 0.7rem;
          color: #6b7280;
        }
        .print-meta-left { display: flex; align-items: center; gap: 1rem; }
        .print-meta-logo { height: 24px; width: auto; }
        .print-meta-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.125rem; text-align: right; }
        .print-meta-label { font-weight: 600; color: #374151; }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Filtres memorises a l'entree dans la fiche, pour un retour fidele a la liste.
  const hrefRetour = useMemo(() => {
    const retour = searchParams.get("retour");
    return `/dashboard/garage/vehicules${retour ? `?${retour}` : ""}`;
  }, [searchParams]);

  const { data, isLoading, isError, error, refetch } = api.garage.vehicule.useQuery({ id: idNum }, { enabled: Number.isFinite(idNum) });

  const [editing, setEditing] = useState<VehiculeFormModel | null>(null);
  const [confirmSortie, setConfirmSortie] = useState(false);
  const [photoZoom, setPhotoZoom] = useState<number | null>(null);

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
    return vehiculeVersFormModel(data.vehicule);
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
  // photos est une colonne jsonb nullable : on la normalise une seule fois.
  const photos = v.photos ?? [];

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
    { label: "Site", value: v.site ?? "—" },
    { label: "Zone", value: v.zone ?? "—" },
    { label: "Emplacement", value: v.spot ?? "—" },
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
      <nav aria-label="Fil d'Ariane" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dashboard/garage" className="transition-colors hover:text-foreground">
          Parking
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={hrefRetour} className="transition-colors hover:text-foreground">
          Véhicules
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">n°{v.numRegistre}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 print-header">
          <Button asChild variant="ghost" size="sm" className="-ml-2 no-print" title="Retour à la liste des véhicules">
            <Link href={hrefRetour}>
              <ArrowLeft size={16} className="mr-1.5" /> Retour à la liste
            </Link>
          </Button>
          <div className="h-8 w-px bg-border hidden no-print" aria-hidden="true" />
          {photos.length > 0 && photos[0]?.url && (
            <img src={photos[0].url} alt={v.marque ?? "Véhicule"} className="print-header-photo no-print" style={{ display: 'none' }} />
          )}
          <div className="print-header-info">
            <span className="num-registre no-print" style={{ display: 'none' }}>n°{v.numRegistre}</span>
            <h1 className="text-xl font-bold text-foreground print-hidden">{v.marque ?? "Véhicule"} {v.modele ?? ""}</h1>
            {v.immatriculation && (
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground print-hidden">{v.immatriculation}</span>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium print-alerte-badge print-alerte-${v.statut} ${STATUTS_VEHICULE_COLORS[v.statut] ?? "bg-muted text-muted-foreground"}`}>
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
        {/* Métadonnées document (visibles à l'impression) */}
        <div className="print-meta no-print" style={{ display: 'none' }}>
          <div className="print-meta-left">
            <img src="/logo.png" alt="Logo" className="print-meta-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span className="print-meta-label">{v.agenceNom ?? "Garage"}</span>
          </div>
          <div className="print-meta-right">
            <span>Généré le {new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
            <span>Utilisateur : {data.user?.name ?? "—"}</span>
            <span>Fiche véhicule n°{v.numRegistre}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
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
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer size={15} className="mr-1.5" /> Imprimer / PDF
          </Button>
          <Button type="button" variant="outline" onClick={() => setExportOuvert(true)}>
            <FileSpreadsheet size={15} className="mr-1.5" /> Exporter
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="no-print">
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent className="print-info-grid">
              {infos.map((i) => (
                <div key={i.label}>
                  <p className="print-info-label">{i.label}</p>
                  <p className="print-info-value">{i.value}</p>
                </div>
              ))}
              <div>
                <p className="print-info-label">Dimensions</p>
                <p className="print-info-value">
                  {formatMeters(v.longueur)} × {formatMeters(v.largeur)}
                  {v.dimensionsEstimees && <span className="ml-1 text-[11px] font-normal text-muted-foreground">(estimées)</span>}
                </p>
              </div>
              <div>
                <p className="print-info-label">Poids</p>
                <p className="print-info-value">{v.poids != null ? `${formatNumber(v.poids)} kg` : "—"}</p>
              </div>
              {v.notes && (
                <div className="print-info-grid" style={{ gridColumn: 'span 2' }}>
                  <p className="print-info-label">Notes</p>
                  <p className="print-info-value whitespace-pre-wrap">{v.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between no-print">
              <CardTitle className="flex items-center gap-2">
                <Camera size={16} /> Photos
                {photos.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">({photos.length})</span>
                )}
              </CardTitle>
              {canModifier && (
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(editModel)}>
                  <Pencil size={13} className="mr-1.5" /> Modifier
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {photos.length === 0 ? (
                <p className="text-sm text-muted-foreground no-print">Aucune photo. Utilisez « Modifier » pour ajouter les photos des faces du véhicule.</p>
              ) : (
                <div className="print-photos-grid">
                  {photos.map((p, i) => (
                    <div key={`${p.categorie}-${i}`} className="print-photo-item no-print" style={{ display: 'block' }}>
                      <button
                        type="button"
                        onClick={() => setPhotoZoom(i)}
                        className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-border transition-transform hover:scale-[1.02]"
                        title={`Agrandir — ${PHOTO_CATEGORIE_LABELS[p.categorie] ?? p.categorie}`}
                      >
                        <img src={p.url} alt={PHOTO_CATEGORIE_LABELS[p.categorie] ?? p.categorie} className="size-full object-cover" />
                        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                          {PHOTO_CATEGORIE_LABELS[p.categorie] ?? p.categorie}
                        </span>
                        {photos.length > 1 && (
                          <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                            {i + 1}/{photos.length}
                          </span>
                        )}
                      </button>
                      <p className="print-photo-label">{PHOTO_CATEGORIE_LABELS[p.categorie] ?? p.categorie}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="no-print">
              <CardTitle className="flex items-center gap-2">
                <History size={16} /> Mouvements
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.mouvements.length === 0 && (
                <p className="text-sm text-muted-foreground no-print">Aucun mouvement enregistré.</p>
              )}
              <ul className="print-list">
                {data.mouvements.map((m) => (
                  <li key={m.id} className="print-list-item">
                    <div className="print-list-header">
                      <span className="print-list-title">{MOUVEMENT_LABELS[m.type] ?? m.type}</span>
                      <span className="print-list-date">{formatDateHeure(m.horodatage)}</span>
                    </div>
                    <p className="print-list-desc">{m.commentaire ?? m.motif ?? "—"}</p>
                    {m.motif && m.commentaire && m.motif !== m.commentaire && (
                      <p className="print-list-meta">Motif : {m.motif}</p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="no-print">
              <CardTitle className="flex items-center gap-2">
                <ListChecks size={16} /> Tâches ({data.taches.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="print-list">
              {data.taches.length === 0 && (
                <p className="text-sm text-muted-foreground no-print">Aucune tâche enregistrée pour ce véhicule.</p>
              )}
              {data.taches.map((t) => (
                <div key={t.id} className="print-list-item">
                  <div className="print-list-header">
                    <span className="print-list-title">{t.titre}</span>
                    <span className={`print-alerte-badge ${t.statut === "FAIT" ? "print-alerte-INFO" : "print-alerte-ATTENTION"}`}>
                      {t.statut ?? "A_FAIRE"}
                    </span>
                  </div>
                  {t.description && <p className="print-list-desc">{t.description}</p>}
                  <p className="print-list-meta">
                    {t.type ?? "ACTIONS"} · {t.responsable ?? "non assigné"}
                    {t.echeance ? ` · échéance ${formatDate(t.echeance)}` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between no-print">
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
            <CardContent className="print-list">
              {!v.hasAlertes && <p className="text-sm text-muted-foreground">Aucune alerte ouverte.</p>}
              {v.alertes.map((a) => (
                <div key={a.id} className="print-list-item">
                  <div className="print-list-header">
                    <span className={`print-alerte-badge print-alerte-${a.niveau ?? "INFO"}`}>
                      {ALERTE_NIVEAU_LABELS[a.niveau ?? "INFO"] ?? a.niveau}
                    </span>
                    <span className="print-list-date">{formatDateHeure(a.declencheeLe)}</span>
                  </div>
                  <p className="print-list-title">{ALERTE_CODE_LABELS[a.code] ?? a.code}</p>
                  {a.message && <p className="print-list-desc">{a.message}</p>}
                  {a.statut === "OUVERTE" && canGererAlertes && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="no-print mt-2 h-7 px-2 text-xs"
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

      <PhotoLightbox
        photos={photos}
        index={photoZoom}
        onIndexChange={setPhotoZoom}
        onClose={() => setPhotoZoom(null)}
        nomFichierBase={`vehicule-${v.numRegistre}${v.immatriculation ? `-${v.immatriculation}` : ""}`}
      />

      <ExportVehiculesDialog
        open={exportOuvert}
        onClose={() => setExportOuvert(false)}
        filtres={{ q: "", statut: "", site: "", nonPositionnes: false }}
        lignesVisibles={1}
      />

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
    </motion.div>
  );
}