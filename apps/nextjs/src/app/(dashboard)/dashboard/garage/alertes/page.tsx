"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BellRing, Check, RefreshCw, Search, Loader2 } from "lucide-react";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { Button } from "~/components/ui/button";
import { usePermissions } from "~/hooks/usePermissions";
import { toast } from "sonner";
import {
  ALERTE_CODE_LABELS,
  ALERTE_NIVEAU_LABELS,
  ALERTE_NIVEAU_COLORS,
  formatDateHeure,
} from "../_components/statuts";

export default function GarageAlertesPage() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const canGererAlertes = hasPermission("parking.alertes.gerer");

  const [statut, setStatut] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error, refetch } = api.garage.alertes.useQuery({
    statut: (statut === "OUVERTE" || statut === "CLOTUREE" ? statut : undefined) as "OUVERTE" | "CLOTUREE" | undefined,
    limit: 200,
  });

  const analyser = api.garage.analyser.useMutation({
    onSuccess: (r) => {
      utils.garage.alertes.invalidate();
      utils.garage.vehicles.invalidate();
      utils.garage.overview.invalidate();
      toast.success(`Analyse de ${r.vehiculesAnalyses} véhicule(s) : ${r.creees} alerte(s) créée(s), ${r.cloturees} clôturée(s)`);
    },
    onError: (e) => toast.error(e.message),
  });

  const fermerAlerte = api.garage.fermerAlerte.useMutation({
    onSuccess: () => {
      utils.garage.alertes.invalidate();
      utils.garage.vehicles.invalidate();
      utils.garage.overview.invalidate();
      toast.success("Alerte clôturée");
    },
    onError: (e) => toast.error(e.message),
  });

  const alertes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.alertes ?? []).filter((a) => {
      if (!q) return true;
      const cible = `${a.vehicule.numRegistre} ${a.vehicule.marque ?? ""} ${a.vehicule.modele ?? ""} ${a.vehicule.immatriculation ?? ""} ${a.message ?? ""} ${ALERTE_CODE_LABELS[a.code] ?? a.code}`.toLowerCase();
      return cible.includes(q);
    });
  }, [data?.alertes, search]);

  const nbOuvertes = useMemo(() => (data?.alertes ?? []).filter((a) => a.statut === "OUVERTE").length, [data?.alertes]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Alertes du moteur de règles</h2>
          <p className="text-sm text-muted-foreground">
            {nbOuvertes} alerte(s) ouverte(s){data ? ` · ${data.total} affichée(s)` : ""}
          </p>
        </div>
        {canGererAlertes && (
          <Button type="button" variant="outline" disabled={analyser.isPending} onClick={() => analyser.mutate({})}>
            {analyser.isPending ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <RefreshCw size={15} className="mr-1.5" />}
            Analyser toutes les alertes
          </Button>
        )}
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-background p-3 sm:grid-cols-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (véhicule, message, règle…)"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
        >
          <option value="">Ouvertes et clôturées</option>
          <option value="OUVERTE">Ouvertes</option>
          <option value="CLOTUREE">Clôturées</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Chargement des alertes…
        </div>
      )}

      {isError && !isLoading && (
        <ErrorState message={error?.message ?? "Impossible de charger les alertes."} retryAction={() => void refetch()} />
      )}

      {!isLoading && !isError && alertes.length === 0 && (
        <EmptyState
          icon={<BellRing size={40} />}
          title="Aucune alerte"
          description={
            search || statut
              ? "Aucune alerte ne correspond à ces critères."
              : "Le moteur de règles n'a déclenché aucune alerte. Lancez une analyse pour vérifier."
          }
        />
      )}

      {!isLoading && !isError && alertes.length > 0 && (
        <div className="space-y-3">
          {alertes.map((a) => (
            <Card key={a.id}>
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <BellRing size={16} className="text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/garage/vehicules/${a.vehicleId}`}
                          className="font-semibold text-foreground hover:text-primary hover:underline"
                        >
                          #{a.vehicule.numRegistre}
                        </Link>
                        <span className="text-sm text-muted-foreground">
                          {a.vehicule.marque ?? "—"} {a.vehicule.modele ?? ""}
                          {a.vehicule.immatriculation ? ` · ${a.vehicule.immatriculation}` : ""}
                        </span>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${ALERTE_NIVEAU_COLORS[a.niveau] ?? "bg-muted text-muted-foreground"}`}
                        >
                          {ALERTE_NIVEAU_LABELS[a.niveau] ?? a.niveau}
                        </span>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            a.statut === "OUVERTE"
                              ? "bg-red-500/10 text-red-600 dark:text-red-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {a.statut === "OUVERTE" ? "Ouverte" : "Clôturée"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-foreground">{ALERTE_CODE_LABELS[a.code] ?? a.code}</p>
                      <p className="text-sm text-muted-foreground">{a.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Déclenchée le {formatDateHeure(a.declencheeLe)}
                        {a.clotureeLe ? ` · clôturée le ${formatDateHeure(a.clotureeLe)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {a.statut === "OUVERTE" && canGererAlertes && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={fermerAlerte.isPending}
                        onClick={() => fermerAlerte.mutate({ alertId: a.id })}
                      >
                        <Check size={14} className="mr-1.5" /> Clôturer
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}