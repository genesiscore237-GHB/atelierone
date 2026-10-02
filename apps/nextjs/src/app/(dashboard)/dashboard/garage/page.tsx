"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Car, MapPin, BellRing, ParkingCircle, Plus, Map, ArrowRight, Loader2 } from "lucide-react";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { Button } from "~/components/ui/button";
import { STATUTS_VEHICULE_LABELS, STATUTS_VEHICULE_COLORS } from "./_components/statuts";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

export default function GarageDashboardPage() {
  const { data, isLoading, isError, error, refetch } = api.garage.overview.useQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Chargement du registre…
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState message={error?.message ?? "Impossible de charger le registre."} retryAction={() => void refetch()} />;
  }

  const spotsParStatut = data.spots ?? {};
  const spotsLibres = spotsParStatut.LIBRE ?? 0;
  const spotsOccupes = spotsParStatut.OCCUPE ?? 0;
  const spotsBloques = (spotsParStatut.BLOQUE ?? 0) + (spotsParStatut.RESERVE ?? 0);
  const totalSpots = spotsLibres + spotsOccupes + spotsBloques;
  const tauxGlobal = totalSpots > 0 ? Math.round((spotsOccupes / totalSpots) * 100) : 0;

  const kpis = [
    { label: "Véhicules au registre", value: data.totalVehicules, icon: Car, tone: "text-[var(--module-garage)]" },
    { label: "Non positionnés", value: data.nonPositionnes, icon: MapPin, tone: "text-amber-500" },
    { label: "Alertes ouvertes", value: data.alertesOuvertes, icon: BellRing, tone: "text-red-500" },
    { label: "Occupation des places", value: `${tauxGlobal}%`, icon: ParkingCircle, tone: totalSpots > 0 ? "text-emerald-500" : "text-muted-foreground" },
  ];

  const parStatutTriee = [...(data.parStatut ?? [])].sort((a, b) => b.c - a.c);
  const maxStatut = Math.max(1, ...parStatutTriee.map((s) => s.c));

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center justify-between pt-5">
              <div>
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <p className="mt-1 text-3xl font-bold text-foreground tabular-nums">{k.value}</p>
              </div>
              <div className={`rounded-xl bg-muted/60 p-3 ${k.tone}`}>
                <k.icon size={22} />
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      <motion.div variants={item} className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/dashboard/garage/vehicules?nouveau=1">
            <Plus size={16} className="mr-1.5" /> Enregistrer un véhicule
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/garage/carte">
            <Map size={16} className="mr-1.5" /> Ouvrir la carte
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/garage/alertes">
            <BellRing size={16} className="mr-1.5" /> Alertes
          </Link>
        </Button>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div variants={item}>
          <Card>
            <CardHeader>
              <CardTitle>Répartition par statut</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {parStatutTriee.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun véhicule enregistré.</p>
              )}
              {parStatutTriee.map((s) => (
                <div key={s.statut} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`inline-block size-2 rounded-full ${STATUTS_VEHICULE_COLORS[s.statut] ?? "bg-muted"}`} />
                      {STATUTS_VEHICULE_LABELS[s.statut] ?? s.statut}
                    </span>
                    <span className="font-semibold text-foreground tabular-nums">{s.c}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-[var(--module-garage)]"
                      style={{ width: `${Math.max(4, Math.round((s.c / maxStatut) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card>
            <CardHeader>
              <CardTitle>Sites</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.sites.length === 0 && (
                <EmptyState title="Aucun site actif" description="Configurez un site parking pour afficher la carte." />
              )}
              {data.sites.map((site) => (
                <div key={site.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">
                        {site.nom} <span className="text-xs font-normal text-muted-foreground">({site.code})</span>
                        {site.isPrimary && <span className="ml-2 text-[11px] font-medium text-primary">Principal</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {site.nbVehicules} véhicule(s) · {site.nbZones} zone(s) · {site.nbSpots} place(s)
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/garage/carte?site=${site.id}`}
                      className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      Carte <ArrowRight size={14} />
                    </Link>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[var(--module-garage)]"
                        style={{ width: `${Math.min(100, site.tauxOccupation)}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {site.tauxOccupation}% <span className="font-normal text-muted-foreground">({site.spotsOccupes}/{site.nbSpots})</span>
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}