"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { ArrowLeft, Car, FileSignature, Gauge, History } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { transitionStatutVehiculeValide, STATUT_LABELS, STATUT_STYLE, STATUTS_IMMOBILISATION } from "~/server/lib/vehicule-service";
import { usePermissions } from "~/hooks/usePermissions";

export function VehiculeDetail({ id }: { id: string }) {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const { data, isLoading, isError } = api.vehicules.get.useQuery({ id: Number(id) });
  const { data: clientsData } = api.clients.list.useQuery({ statut: "ACTIF", limit: 200 });
  const { data: contratsData } = api.vehicules.listContratsActifs.useQuery();
  const [clientId, setClientId] = useState(0);
  const [contratId, setContratId] = useState(0);
  const [statutMotif, setStatutMotif] = useState("");

  const changerStatut = api.vehicules.changerStatut.useMutation({
    onSuccess: (r) => { toast.success(`Statut : ${STATUT_LABELS[r.statut] ?? r.statut}`); utils.vehicules.get.invalidate(); utils.vehicules.list.invalidate(); setStatutMotif(""); },
    onError: (e) => toast.error(e.message),
  });
  const update = api.vehicules.update.useMutation({
    onSuccess: () => { toast.success("Véhicule mis à jour"); utils.vehicules.get.invalidate(); utils.vehicules.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const lierContrat = api.vehicules.lierContrat.useMutation({
    onSuccess: () => { toast.success("Véhicule couvert par le contrat"); utils.vehicules.get.invalidate(); setContratId(0); },
    onError: (e) => toast.error(e.message),
  });
  const retirerContrat = api.vehicules.retirerContrat.useMutation({
    onSuccess: () => { toast.success("Véhicule retiré du contrat"); utils.vehicules.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Véhicule introuvable.</p>
        <Link href="/dashboard/vehicules" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft size={14} /> Retour au parc
        </Link>
      </div>
    );
  }

  const v = data.vehicule as unknown as {
    id: number; immatriculation: string; marque: string | null; modele: string | null; annee: number | null;
    couleur: string | null; numeroChassis: string | null; kilometrage: number | null; carburant: string | null;
    typeVehicule: string | null; statutImmobilisation: string; notes: string | null;
  };
  const client = data.client as unknown as {
    id: number; nom: string; prenom: string | null; raisonSociale: string | null; codeClient: string | null;
  } | null;
  const historiqueOR = (data.historiqueOR ?? []) as any[];
  const contrats = (data.contrats ?? []) as any[];
  const clientsList = (clientsData?.clients ?? []) as any[];
  const contratsActifs = (contratsData ?? []) as any[];
  const canModifier = hasPermission("vehicules.modifier");

  const transitions = STATUTS_IMMOBILISATION.filter((s) => transitionStatutVehiculeValide(v.statutImmobilisation, s));
  const displayName = client ? (client.raisonSociale ?? `${client.prenom ?? ""} ${client.nom}`) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/vehicules" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" title="Retour">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 font-mono text-xl font-bold tracking-tight text-foreground">
              <Car size={18} className="text-primary" /> {v.immatriculation}
            </h1>
            <p className="text-xs text-muted-foreground">
              {v.marque} {v.modele}{v.annee ? ` · ${v.annee}` : ""}{v.couleur ? ` · ${v.couleur}` : ""}
              {v.carburant ? ` · ${v.carburant}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${STATUT_STYLE[v.statutImmobilisation] ?? ""}`}>
            {STATUT_LABELS[v.statutImmobilisation] ?? v.statutImmobilisation}
          </span>
          {canModifier && (
            <select
              value=""
              onChange={(e) => e.target.value && changerStatut.mutate({ id: v.id, nouveauStatut: e.target.value as any, motif: statutMotif || undefined })}
              className="h-8 rounded-lg border border-border bg-accent/30 px-2 text-xs text-foreground outline-none"
            >
              <option value="">Changer de statut…</option>
              {transitions.map((s) => <option key={s} value={s} className="bg-background">{STATUT_LABELS[s] ?? s}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Infos */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Fiche véhicule</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Field label="Propriétaire" value={displayName ? `${displayName} (${client?.codeClient})` : "—"} />
              <Field label="N° châssis" value={v.numeroChassis} />
              <Field label="Kilométrage" value={v.kilometrage ? `${v.kilometrage.toLocaleString("fr-FR")} km` : "—"} />
              <Field label="Type" value={v.typeVehicule} />
            </div>
            {canModifier && (
              <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border/60 pt-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Transférer à un autre client</label>
                  <select value={clientId} onChange={(e) => setClientId(Number(e.target.value))} className="mt-1 h-9 rounded-lg border border-border bg-background px-3 text-sm">
                    <option value={0}>Choisir un client…</option>
                    {clientsList.map((cl: any) => <option key={cl.id} value={cl.id}>{cl.raisonSociale ?? `${cl.prenom ?? ""} ${cl.nom}`}</option>)}
                  </select>
                </div>
                <Button size="sm" variant="outline" disabled={!clientId} onClick={() => update.mutate({ id: v.id, clientId })}>
                  Transférer
                </Button>
                <div className="ml-auto">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Motif de changement de statut (optionnel)</label>
                  <input
                    value={statutMotif}
                    onChange={(e) => setStatutMotif(e.target.value)}
                    placeholder="ex. pièce arrivée, client absent…"
                    className="mt-1 h-9 w-72 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Contrats couvrant ce véhicule */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
              <FileSignature size={14} className="text-primary" /> Contrats de maintenance couvrant ce véhicule
            </h3>
            {contrats.length === 0 && <p className="text-sm text-muted-foreground">Aucun contrat actif sur ce véhicule.</p>}
            <div className="space-y-2">
              {contrats.map((ct: any) => (
                <div key={ct.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{ct.libelle}</span>
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">{ct.numeroContrat}</span>
                    <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-success-foreground">{ct.statutContrat}</span>
                  </div>
                  {canModifier && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => retirerContrat.mutate({ id: ct.id })}>
                      Retirer
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {canModifier && contratsActifs.length > 0 && (
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
                <div className="min-w-64 flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Couvrir par un contrat actif</label>
                  <select value={contratId} onChange={(e) => setContratId(Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                    <option value={0}>Choisir un contrat…</option>
                    {contratsActifs.map((ct: any) => <option key={ct.id} value={ct.id}>{ct.numeroContrat} — {ct.libelle}</option>)}
                  </select>
                </div>
                <Button size="sm" disabled={!contratId} onClick={() => lierContrat.mutate({ vehiculeId: v.id, contratId })}>
                  Lier
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Historique OR */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <History size={14} className="text-primary" /> Ordres de réparation
          </h3>
          {historiqueOR.length === 0 && (
            <p className="text-sm text-muted-foreground">
              <Gauge size={16} className="mb-1 opacity-40" />
              Aucun OR sur ce véhicule.
            </p>
          )}
          <div className="space-y-2">
            {historiqueOR.map((or: any) => (
              <div key={or.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold">{or.numero}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    or.statut === "termine" || or.statut === "facture" ? "bg-success/10 text-success-foreground"
                    : or.statut === "annule" ? "bg-destructive/10 text-destructive"
                    : "bg-warning/10 text-warning-foreground"
                  }`}>{or.statut}</span>
                </div>
                {or.plainte && <p className="mt-1 truncate text-xs text-muted-foreground">{or.plainte}</p>}
                <p className="text-[10px] text-muted-foreground">{new Date(or.dateOuverture).toLocaleDateString("fr-FR")}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value ?? "—"}</p>
    </div>
  );
}