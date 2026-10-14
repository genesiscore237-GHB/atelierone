"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Building2, CarFront, Loader2, MapPin, Pencil, Search, SquareParking } from "lucide-react";
import { api } from "~/trpc/react";
import { Card, CardContent } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { usePermissions } from "~/hooks/usePermissions";
import { toast } from "sonner";

export default function GarageEspacesPage() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const canGererSites = hasPermission("parking.site.gerer");

  const [rechercheSite, setRechercheSite] = useState("");
  const [siteSelectionne, setSiteSelectionne] = useState<number | null>(null);
  const [rechercheZone, setRechercheZone] = useState("");
  const [edition, setEdition] = useState<{ id: number; nom: string; description: string; isActive: boolean } | null>(null);
  const [formNom, setFormNom] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formActif, setFormActif] = useState(true);

  const { data, isLoading, isError, error, refetch } = api.garage.espaces.useQuery();
  const { data: plan, isLoading: chargementPlan } = api.garage.plan.useQuery(
    { id: siteSelectionne ?? 0 },
    { enabled: siteSelectionne != null },
  );

  const sites = useMemo(() => {
    const q = rechercheSite.trim().toLowerCase();
    const liste = data?.sites ?? [];
    if (!q) return liste;
    return liste.filter((s) => `${s.code} ${s.nom} ${s.description ?? ""}`.toLowerCase().includes(q));
  }, [data?.sites, rechercheSite]);

  const zones = useMemo(() => {
    const list = plan?.zones ?? [];
    const q = rechercheZone.trim().toLowerCase();
    if (!q) return list;
    return list.filter((z) => `${z.code} ${z.nom} ${z.type}`.toLowerCase().includes(q));
  }, [plan?.zones, rechercheZone]);

  const spotsParZone = useMemo(() => {
    type SpotPlan = NonNullable<typeof plan>["spots"][number];
    const map = new Map<number, SpotPlan[]>();
    for (const s of plan?.spots ?? []) {
      const arr = map.get(s.zoneId) ?? [];
      arr.push(s);
      map.set(s.zoneId, arr);
    }
    return map;
  }, [plan?.spots]);

  const vehiculesParZone = useMemo(() => {
    const map = new Map<number, number>();
    for (const v of plan?.vehicules ?? []) {
      if (v.zoneId == null) continue;
      map.set(v.zoneId, (map.get(v.zoneId) ?? 0) + 1);
    }
    return map;
  }, [plan?.vehicules]);

  const ouvrirEdition = (site: { id: number; nom: string; description: string | null; isActive: boolean }) => {
    setEdition({ id: site.id, nom: site.nom, description: site.description ?? "", isActive: site.isActive });
    setFormNom(site.nom);
    setFormDescription(site.description ?? "");
    setFormActif(site.isActive);
  };

  const modifier = api.garage.siteModifier.useMutation({
    onSuccess: () => {
      void utils.garage.espaces.invalidate();
      void utils.garage.sites.invalidate();
      toast.success("Site mis à jour");
      setEdition(null);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Espaces & Sites</h2>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.sites.length} site(s) · ${data.totalVehicules} véhicule(s)${data.vehiculesNonPositionnes > 0 ? ` · ${data.vehiculesNonPositionnes} non affecté(s) à un site` : ""}`
              : "Sites, zones et emplacements du parking"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={rechercheSite}
            onChange={(e) => setRechercheSite(e.target.value)}
            placeholder="Rechercher un site (code, nom, description…)"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Chargement des espaces…
        </div>
      )}

      {isError && !isLoading && (
        <ErrorState message={error?.message ?? "Impossible de charger les espaces."} retryAction={() => void refetch()} />
      )}

      {!isLoading && !isError && sites.length === 0 && (
        <EmptyState
          icon={<Building2 size={40} />}
          title="Aucun site"
          description={rechercheSite ? "Aucun site ne correspond à cette recherche." : "Aucun site de parking configuré."}
        />
      )}

      {!isLoading && !isError && sites.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((s) => (
            <Card
              key={s.id}
              className={`cursor-pointer transition-colors ${siteSelectionne === s.id ? "border-ring" : ""}`}
            >
              <CardContent className="pt-5" onClick={() => setSiteSelectionne(s.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{s.code}</span>
                      {s.isPrimary && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Principal
                        </span>
                      )}
                      {!s.isActive && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Inactif
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium text-foreground">{s.nom}</p>
                    {s.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>}
                  </div>
                  {canGererSites && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        ouvrirEdition(s);
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground">
                  <div>
                    <div className="flex items-center justify-center"><MapPin size={13} className="mr-1" />{s.nbZones}</div>
                    zones
                  </div>
                  <div>
                    <div className="flex items-center justify-center"><SquareParking size={13} className="mr-1" />{s.nbSpots}</div>
                    emplacements
                  </div>
                  <div>
                    <div className="flex items-center justify-center"><CarFront size={13} className="mr-1" />{s.nbVehicules}</div>
                    véhicules
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">{s.nbAPositionner}</span>
                    à placer
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Détail du site sélectionné ───────────────────────────────────── */}
      {siteSelectionne != null && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">
                  Zones & emplacements — {plan?.site?.code ?? ""}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {plan ? `${plan.zones.length} zone(s) · ${plan.spots.length} emplacement(s) · ${plan.vehicules.length} véhicule(s) sur le site` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={rechercheZone}
                    onChange={(e) => setRechercheZone(e.target.value)}
                    placeholder="Rechercher une zone…"
                    className="rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setSiteSelectionne(null)}>
                  Fermer
                </Button>
              </div>
            </div>

            {chargementPlan && (
              <div className="flex min-h-[15vh] items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 size-5 animate-spin" /> Chargement du plan…
              </div>
            )}

            {!chargementPlan && plan && zones.length === 0 && (
              <EmptyState
                icon={<MapPin size={40} />}
                title="Aucune zone"
                description={rechercheZone ? "Aucune zone ne correspond à cette recherche." : "Ce site ne contient aucune zone."}
              />
            )}

            {!chargementPlan && plan && zones.length > 0 && (
              <div className="mt-4 space-y-3">
                {zones.map((z) => {
                  const spots = spotsParZone.get(z.id) ?? [];
                  const occupes = spots.filter((s) => s.statut === "OCCUPE").length;
                  const bloques = spots.filter((s) => s.statut === "BLOQUE").length;
                  return (
                    <div key={z.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-semibold text-foreground">{z.code}</span>
                          <span className="ml-2 text-sm text-muted-foreground">{z.nom}</span>
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {z.type}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {spots.length} emplacement(s) · {occupes} occupé(s)
                          {bloques > 0 ? ` · ${bloques} bloqué(s)` : ""}
                          {vehiculesParZone.get(z.id) ? ` · ${vehiculesParZone.get(z.id)} véhicule(s) placé(s)` : ""}
                        </div>
                      </div>
                      {spots.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {spots.map((sp) => (
                            <span
                              key={sp.id}
                              title={`${sp.code} — ${sp.statut}`}
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                                sp.statut === "OCCUPE"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : sp.statut === "BLOQUE"
                                    ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                                    : "border-border bg-background text-muted-foreground"
                              }`}
                            >
                              {sp.code}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Dialogue d'édition de site ───────────────────────────────────── */}
      <Dialog open={edition != null} onOpenChange={(o) => !o && setEdition(null)} ariaLabel="Modifier le site">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le site</DialogTitle>
            <DialogDescription>Les dimensions du plan et la géométrie des zones ne sont pas modifiables ici.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nom</label>
              <input
                type="text"
                value={formNom}
                onChange={(e) => setFormNom(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={formActif} onChange={(e) => setFormActif(e.target.checked)} />
              Site actif (visible sur la carte et disponible comme destination de transfert)
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEdition(null)}>
                Fermer
              </Button>
              <Button
                type="button"
                disabled={formNom.trim().length < 2 || modifier.isPending}
                onClick={() =>
                  edition &&
                  modifier.mutate({
                    siteId: edition.id,
                    nom: formNom.trim(),
                    description: formDescription.trim() || null,
                    isActive: formActif,
                  })
                }
              >
                {modifier.isPending && <Loader2 size={15} className="mr-1.5 animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
