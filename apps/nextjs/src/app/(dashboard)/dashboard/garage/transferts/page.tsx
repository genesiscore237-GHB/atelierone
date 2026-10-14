"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeftRight, Loader2, PlaneTakeoff, PackageCheck, Plus, Search, XCircle } from "lucide-react";
import { api } from "~/trpc/react";
import { Card, CardContent } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { ConfirmationDialog } from "~/components/ui/confirmation-dialog";
import { usePermissions } from "~/hooks/usePermissions";
import { toast } from "sonner";
import { formatDateHeure } from "../_components/statuts";

const STATUT_LABELS: Record<string, string> = {
  EN_ATTENTE: "À expédier",
  EN_TRANSIT: "En transit",
  RECU: "Reçu",
  ANNULE: "Annulé",
};

const STATUT_COLORS: Record<string, string> = {
  EN_ATTENTE: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  EN_TRANSIT: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  RECU: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  ANNULE: "bg-muted text-muted-foreground",
};

type Action = { type: "expedier" | "recevoir" | "annuler"; id: number };

export default function GarageTransfertsPage() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const canCreer = hasPermission("parking.transfert.creer");
  const canRecevoir = hasPermission("parking.transfert.recevoir");

  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState("");
  const [siteId, setSiteId] = useState("");
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [action, setAction] = useState<Action | null>(null);

  // Formulaire de création
  const [vehiculeId, setVehiculeId] = useState<number | null>(null);
  const [rechercheVehicule, setRechercheVehicule] = useState("");
  const [siteDestinationId, setSiteDestinationId] = useState<number | null>(null);
  const [motif, setMotif] = useState("");
  const [commentaire, setCommentaire] = useState("");

  const { data, isLoading, isError, error, refetch } = api.garage.transferts.useQuery({
    recherche: recherche.trim() || undefined,
    statut: (statut || undefined) as "EN_ATTENTE" | "EN_TRANSIT" | "RECU" | "ANNULE" | undefined,
    siteId: siteId ? Number(siteId) : undefined,
  });
  const { data: sites } = api.garage.sites.useQuery();
  const { data: rechercheVehicules } = api.garage.vehicles.useQuery(
    { search: rechercheVehicule.trim() || undefined, limit: 20 },
    { enabled: creationOuverte },
  );
  const vehiculesFournis = useMemo(
    () => (rechercheVehicules?.vehicules ?? []).filter((v) => v.siteId != null),
    [rechercheVehicules],
  );

  const transferts = data ?? [];
  const nbEnAttente = useMemo(() => transferts.filter((t) => t.statut === "EN_ATTENTE").length, [transferts]);
  const nbEnTransit = useMemo(() => transferts.filter((t) => t.statut === "EN_TRANSIT").length, [transferts]);

  const invalider = () => {
    void utils.garage.transferts.invalidate();
    void utils.garage.vehicles.invalidate();
    void utils.garage.overview.invalidate();
    void utils.garage.plan.invalidate();
    void utils.garage.espaces.invalidate();
  };

  const creer = api.garage.transfertCreer.useMutation({
    onSuccess: () => {
      invalider();
      toast.success("Transfert créé (en attente d'expédition)");
      setCreationOuverte(false);
      setVehiculeId(null);
      setRechercheVehicule("");
      setSiteDestinationId(null);
      setMotif("");
      setCommentaire("");
    },
    onError: (e) => toast.error(e.message),
  });

  const expedier = api.garage.transfertExpedier.useMutation({
    onSuccess: () => {
      invalider();
      toast.success("Transfert expédié : le véhicule est en transit.");
    },
    onError: (e) => toast.error(e.message),
  });

  const recevoir = api.garage.transfertRecevoir.useMutation({
    onSuccess: () => {
      invalider();
      toast.success("Transfert réceptionné : le véhicule est arrivé sur le site destination.");
    },
    onError: (e) => toast.error(e.message),
  });

  const annuler = api.garage.transfertAnnuler.useMutation({
    onSuccess: () => {
      invalider();
      toast.success("Transfert annulé");
    },
    onError: (e) => toast.error(e.message),
  });

  const enCours = expedier.isPending || recevoir.isPending || annuler.isPending || creer.isPending;

  const soumettreCreation = () => {
    if (!vehiculeId || !siteDestinationId || motif.trim().length < 3) return;
    creer.mutate({
      vehicleId: vehiculeId,
      siteDestinationId,
      motif: motif.trim(),
      commentaire: commentaire.trim() || null,
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Transferts entre sites</h2>
          <p className="text-sm text-muted-foreground">
            {nbEnAttente} à expédier · {nbEnTransit} en transit{data ? ` · ${transferts.length} affiché(s)` : ""}
          </p>
        </div>
        {canCreer && (
          <Button type="button" onClick={() => setCreationOuverte(true)}>
            <Plus size={15} className="mr-1.5" /> Nouveau transfert
          </Button>
        )}
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-background p-3 sm:grid-cols-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher (immatriculation, marque, client, motif…)"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
        >
          <option value="">Tous les statuts</option>
          <option value="EN_ATTENTE">À expédier</option>
          <option value="EN_TRANSIT">En transit</option>
          <option value="RECU">Reçus</option>
          <option value="ANNULE">Annulés</option>
        </select>
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
        >
          <option value="">Tous les sites</option>
          {(sites ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.nom}
            </option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Chargement des transferts…
        </div>
      )}

      {isError && !isLoading && (
        <ErrorState message={error?.message ?? "Impossible de charger les transferts."} retryAction={() => void refetch()} />
      )}

      {!isLoading && !isError && transferts.length === 0 && (
        <EmptyState
          icon={<ArrowLeftRight size={40} />}
          title="Aucun transfert"
          description={
            recherche || statut || siteId
              ? "Aucun transfert ne correspond à ces critères."
              : "Créez un transfert pour déplacer un véhicule du Site 1 vers le Site 2."
          }
        />
      )}

      {!isLoading && !isError && transferts.length > 0 && (
        <div className="space-y-3">
          {transferts.map((t) => (
            <Card key={t.id}>
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/garage/vehicules/${t.vehicleId}`}
                        className="font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        #{t.numRegistre}
                      </Link>
                      <span className="text-sm text-muted-foreground">
                        {t.marque ?? "—"} {t.modele ?? ""}
                        {t.immatriculation ? ` · ${t.immatriculation}` : ""}
                      </span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_COLORS[t.statut] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUT_LABELS[t.statut] ?? t.statut}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {t.siteSource?.code ?? "?"} → {t.siteDestination?.code ?? "?"}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {t.siteSource?.nom ?? ""} → {t.siteDestination?.nom ?? ""}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">Motif : {t.motif}</p>
                    {t.commentaire && <p className="text-sm text-muted-foreground">{t.commentaire}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Créé le {formatDateHeure(t.createdAt)}
                      {t.creePar ? ` par ${t.creePar.nom}` : ""}
                      {t.dateExpedition ? ` · expédié le ${formatDateHeure(t.dateExpedition)}${t.expediePar ? ` par ${t.expediePar.nom}` : ""}` : ""}
                      {t.dateReception ? ` · reçu le ${formatDateHeure(t.dateReception)}${t.recuPar ? ` par ${t.recuPar.nom}` : ""}` : ""}
                      {t.dateAnnulation ? ` · annulé le ${formatDateHeure(t.dateAnnulation)}${t.annulePar ? ` par ${t.annulePar.nom}` : ""}` : ""}
                    </p>
                    {t.statut === "ANNULE" && t.motifAnnulation && (
                      <p className="text-xs text-muted-foreground">Annulation : {t.motifAnnulation}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {t.statut === "EN_ATTENTE" && canCreer && (
                      <Button type="button" variant="outline" size="sm" disabled={enCours} onClick={() => setAction({ type: "expedier", id: t.id })}>
                        <PlaneTakeoff size={14} className="mr-1.5" /> Expédier
                      </Button>
                    )}
                    {t.statut === "EN_TRANSIT" && canRecevoir && (
                      <Button type="button" size="sm" disabled={enCours} onClick={() => setAction({ type: "recevoir", id: t.id })}>
                        <PackageCheck size={14} className="mr-1.5" /> Réceptionner
                      </Button>
                    )}
                    {(t.statut === "EN_ATTENTE" || t.statut === "EN_TRANSIT") && canCreer && (
                      <Button type="button" variant="outline" size="sm" disabled={enCours} onClick={() => setAction({ type: "annuler", id: t.id })}>
                        <XCircle size={14} className="mr-1.5" /> Annuler
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Dialogue de création ─────────────────────────────────────────── */}
      <Dialog open={creationOuverte} onOpenChange={setCreationOuverte} ariaLabel="Nouveau transfert">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau transfert de véhicule</DialogTitle>
            <DialogDescription>
              Le véhicule quitte son site actuel (il sera détaché de son emplacement à l'expédition).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Véhicule (affecté à un site)</label>
              <input
                type="text"
                value={rechercheVehicule}
                onChange={(e) => setRechercheVehicule(e.target.value)}
                placeholder="Rechercher un véhicule (immat, marque, n° registre…)"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              <select
                value={vehiculeId ?? ""}
                onChange={(e) => setVehiculeId(e.target.value ? Number(e.target.value) : null)}
                className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="">— Sélectionner un véhicule —</option>
                {vehiculesFournis.map((v) => (
                  <option key={v.id} value={v.id}>
                    #{v.numRegistre} · {v.marque ?? ""} {v.modele ?? ""} {v.immatriculation ? `· ${v.immatriculation}` : ""}
                  </option>
                ))}
              </select>
              {(rechercheVehicules?.vehicules ?? []).some((v) => v.siteId == null) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Les véhicules sans site affecté ne peuvent pas être transférés.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Site destination</label>
              <select
                value={siteDestinationId ?? ""}
                onChange={(e) => setSiteDestinationId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="">— Sélectionner un site —</option>
                {(sites ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.nom}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Motif (obligatoire)</label>
              <textarea
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                rows={2}
                placeholder="Ex. : remisage saisonnier, réparation spécialisée…"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Commentaire (optionnel)</label>
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreationOuverte(false)}>
                Fermer
              </Button>
              <Button
                type="button"
                disabled={!vehiculeId || !siteDestinationId || motif.trim().length < 3 || creer.isPending}
                onClick={soumettreCreation}
              >
                {creer.isPending && <Loader2 size={15} className="mr-1.5 animate-spin" />}
                Créer le transfert
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirmations (expédier / réceptionner / annuler avec motif) ───── */}
      <ConfirmationDialog
        isOpen={action?.type === "expedier"}
        onClose={() => setAction(null)}
        onConfirm={() => action && expedier.mutate({ transferId: action.id })}
        title="Expédier le transfert ?"
        description="Le véhicule sera détaché de son emplacement et passera en transit (statut « À transférer »)."
        confirmText="Expédier"
        variant="default"
      />
      <ConfirmationDialog
        isOpen={action?.type === "recevoir"}
        onClose={() => setAction(null)}
        onConfirm={() => action && recevoir.mutate({ transferId: action.id })}
        title="Réceptionner le transfert ?"
        description="Le véhicule sera affecté au site destination, non positionné : à placer via la carte."
        confirmText="Réceptionner"
        variant="default"
      />
      <ConfirmationDialog
        isOpen={action?.type === "annuler"}
        onClose={() => setAction(null)}
        onConfirm={(reason) => action && annuler.mutate({ transferId: action.id, motifAnnulation: (reason ?? "").trim() })}
        title="Annuler le transfert ?"
        description={
          action
            ? "Le véhicule retrouvera son état d'origine sur le site source."
            : ""
        }
        confirmText="Annuler le transfert"
        variant="destructive"
        requiresReason
      />
    </motion.div>
  );
}
