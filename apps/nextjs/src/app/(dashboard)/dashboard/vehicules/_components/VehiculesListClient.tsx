"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Car, CheckCircle2, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { STATUT_LABELS, STATUT_STYLE, CARBURANTS, TYPES_VEHICULE } from "~/server/lib/vehicule-service";
import { usePermissions } from "~/hooks/usePermissions";

const TYPE_LABELS: Record<string, string> = {
  voiture: "Voiture", utilitaire: "Utilitaire", poids_lourd: "Poids lourd", moto: "Moto", autocar: "Autocar", autre: "Autre",
};

const EMPTY_FORM = {
  immatriculation: "",
  clientId: 0,
  marque: "",
  modele: "",
  annee: "",
  couleur: "",
  numeroChassis: "",
  kilometrage: "",
  carburant: "diesel",
  typeVehicule: "voiture",
  notes: "",
};

export function VehiculesListClient() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading } = api.vehicules.list.useQuery({
    search: search || undefined,
    statut: statutFilter || undefined,
    limit: 100,
  });
  const { data: clientsData } = api.clients.list.useQuery({ statut: "ACTIF", limit: 200 });
  const create = api.vehicules.create.useMutation({
    onSuccess: () => {
      toast.success("Véhicule créé (en réception)");
      utils.vehicules.list.invalidate();
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error(e.message),
  });

  const list = (data?.vehicules ?? []) as unknown as Array<{
    id: number; immatriculation: string; marque: string | null; modele: string | null; annee: number | null;
    typeVehicule: string | null; carburant: string | null; kilometrage: number | null;
    statutImmobilisation: string; clientNom: string | null; clientPrenom: string | null; clientRaisonSociale: string | null;
  }>;
  const clientsList = (clientsData?.clients ?? []) as any[];
  const canCreer = hasPermission("vehicules.creer");

  const submit = () => {
    if (!form.immatriculation.trim()) {
      toast.error("L'immatriculation est requise");
      return;
    }
    create.mutate({
      immatriculation: form.immatriculation.trim(),
      clientId: form.clientId || undefined,
      marque: form.marque || undefined,
      modele: form.modele || undefined,
      annee: form.annee ? Number(form.annee) : undefined,
      couleur: form.couleur || undefined,
      numeroChassis: form.numeroChassis || undefined,
      kilometrage: form.kilometrage ? Number(form.kilometrage) : undefined,
      carburant: form.carburant as any,
      typeVehicule: form.typeVehicule as any,
      notes: form.notes || undefined,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Parc véhicules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chaque véhicule appartient à un client. Un ordre de réparation s'ouvre sur un véhicule — statuts d'immobilisation suivis de la réception à la sortie.
          </p>
        </div>
        {canCreer && (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus size={16} /> Nouveau véhicule
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Immatriculation, marque, propriétaire…" className="w-80 pl-9" />
        </div>
        <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k} className="bg-background">{v}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Véhicule</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Propriétaire</th>
              <th className="px-4 py-2.5 text-right">Kilométrage</th>
              <th className="px-4 py-2.5 text-center">Statut</th>
              <th className="px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Chargement…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                <Car size={32} className="mx-auto mb-2 opacity-40" />
                Aucun véhicule au parc. Enregistrez le premier véhicule.
              </td></tr>
            ) : (
              list.map((v) => (
                <tr key={v.id} className="text-sm text-foreground hover:bg-accent/30">
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard/vehicules/${v.id}`} className="font-mono font-semibold hover:text-primary">{v.immatriculation}</Link>
                    <div className="text-xs text-muted-foreground">{v.marque} {v.modele}{v.annee ? ` · ${v.annee}` : ""}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      {TYPE_LABELS[v.typeVehicule ?? "voiture"] ?? v.typeVehicule}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{v.clientRaisonSociale ?? (`${v.clientPrenom ?? ""} ${v.clientNom ?? ""}`.trim() || "—")}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{v.kilometrage ? `${v.kilometrage.toLocaleString("fr-FR")} km` : "—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUT_STYLE[v.statutImmobilisation] ?? ""}`}>
                      {STATUT_LABELS[v.statutImmobilisation] ?? v.statutImmobilisation}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/dashboard/vehicules/${v.id}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Fiche</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Car size={18} className="text-primary" /> Nouveau véhicule
              </h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 hover:bg-accent">✕</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Immatriculation *</Label>
                  <Input className="mt-1 font-mono" value={form.immatriculation} onChange={(e) => setForm({ ...form, immatriculation: e.target.value })} placeholder="LT-1234-AB" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Propriétaire (client)</Label>
                  <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value={0}>— Aucun —</option>
                    {clientsList.map((cl: any) => (
                      <option key={cl.id} value={cl.id}>{cl.raisonSociale ?? `${cl.prenom ?? ""} ${cl.nom}`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Marque</Label>
                  <Input className="mt-1" value={form.marque} onChange={(e) => setForm({ ...form, marque: e.target.value })} placeholder="Toyota" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Modèle</Label>
                  <Input className="mt-1" value={form.modele} onChange={(e) => setForm({ ...form, modele: e.target.value })} placeholder="Hilux" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <select value={form.typeVehicule} onChange={(e) => setForm({ ...form, typeVehicule: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Carburant</Label>
                  <select value={form.carburant} onChange={(e) => setForm({ ...form, carburant: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {CARBURANTS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Année</Label>
                  <Input type="number" className="mt-1" value={form.annee} onChange={(e) => setForm({ ...form, annee: e.target.value })} placeholder="2020" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Kilométrage</Label>
                  <Input type="number" min={0} className="mt-1" value={form.kilometrage} onChange={(e) => setForm({ ...form, kilometrage: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Couleur</Label>
                  <Input className="mt-1" value={form.couleur} onChange={(e) => setForm({ ...form, couleur: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">N° de châssis</Label>
                  <Input className="mt-1" value={form.numeroChassis} onChange={(e) => setForm({ ...form, numeroChassis: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button onClick={submit} disabled={create.isPending} className="gap-2">
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 size={15} />}
                Créer le véhicule
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}