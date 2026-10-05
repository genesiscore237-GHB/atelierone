"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Car, Search, Plus, Loader2, AlertTriangle, UserRound, X, Wrench, ExternalLink } from "lucide-react";
import { useOrPermissions } from "../_hooks/useOrPermissions";
import {
  STATUT_LABELS as VEH_STATUT_LABELS,
  STATUT_STYLE as VEH_STATUT_STYLE,
} from "~/server/lib/vehicule-service";

type VehiculeResultat = {
  id: number;
  immatriculation: string;
  marque: string | null;
  modele: string | null;
  annee: number | null;
  couleur: string | null;
  kilometrage: number | null;
  typeVehicule: string | null;
  statutImmobilisation: string;
  clientId: number | null;
  clientNom: string | null;
  clientPrenom: string | null;
  clientRaisonSociale: string | null;
  clientTelephone: string | null;
  orEnCours: { id: number; numero: string; statut: string } | null;
  eligible: boolean;
  raison: string | null;
};

function useDebounce(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const clientLabel = (v: VehiculeResultat) =>
  v.clientRaisonSociale || `${v.clientPrenom ?? ""} ${v.clientNom ?? ""}`.trim() || null;

/** Recherche de véhicule (à la demande) + création d'OR. Les refus sont expliqués avec leur raison. */
export function VehiculeRecherche({ onCree }: { onCree?: () => void }) {
  const { flags } = useOrPermissions();
  const utils = api.useUtils();

  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const [selection, setSelection] = useState<VehiculeResultat | null>(null);
  const [confirmerOR, setConfirmerOR] = useState<VehiculeResultat | null>(null);
  const [refus, setRefus] = useState<VehiculeResultat | null>(null);
  const [plainte, setPlainte] = useState("");

  const rechercheActive = debounced.trim().length >= 2;
  const { data: resultats, isFetching, isError, refetch } = api.or.rechercheVehicules.useQuery(
    { search: debounced.trim() || undefined },
    { enabled: !!flags.consult && rechercheActive }
  );

  const create = api.or.create.useMutation({
    onSuccess: () => {
      toast.success("Ordre de réparation créé");
      setSelection(null);
      setConfirmerOR(null);
      setRefus(null);
      setPlainte("");
      setSearch("");
      utils.or.list.invalidate();
      onCree?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const [showNouveau, setShowNouveau] = useState(false);
  const [nv, setNv] = useState({ immatriculation: "", marque: "", modele: "", annee: "", couleur: "", clientId: 0 });
  const [nvClientSearch, setNvClientSearch] = useState("");
  const nvClientDebounced = useDebounce(nvClientSearch);
  const { data: nvClients } = api.clients.list.useQuery(
    { search: nvClientDebounced.trim() || undefined, limit: 10 },
    { enabled: showNouveau }
  );

  const createVehicule = api.or.createVehicule.useMutation({
    onSuccess: (v: any) => {
      toast.success("Véhicule créé");
      setShowNouveau(false);
      setNv({ immatriculation: "", marque: "", modele: "", annee: "", couleur: "", clientId: 0 });
      setNvClientSearch("");
      refetch();
      setSearch(v.immatriculation);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!flags.creer) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <AlertTriangle size={15} />
        Vous n'avez pas la permission de créer un ordre de réparation (or.creer).
      </div>
    );
  }

  const choisir = (v: VehiculeResultat) => {
    if (!v.eligible) {
      setRefus(v);
      return;
    }
    if (v.orEnCours) {
      setConfirmerOR(v);
      return;
    }
    setSelection(v);
  };

  const confirmerCreation = () => {
    if (!selection) return;
    create.mutate({
      vehiculeId: selection.id,
      clientId: selection.clientId ?? undefined,
      plainte: plainte.trim() || undefined,
    });
  };

  const saveNouveau = () => {
    if (!nv.immatriculation.trim()) {
      toast.error("Immatriculation requise");
      return;
    }
    createVehicule.mutate({
      immatriculation: nv.immatriculation.trim(),
      marque: nv.marque.trim() || undefined,
      modele: nv.modele.trim() || undefined,
      annee: nv.annee ? Number(nv.annee) : undefined,
      couleur: nv.couleur.trim() || undefined,
      clientId: nv.clientId || undefined,
    });
  };

  const liste = resultats ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">
        Créer un OR — rechercher le véhicule
      </div>

      {/* Recherche véhicule */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <Input
            placeholder="Rechercher : immatriculation, marque, modèle, client, téléphone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            disabled={!!selection}
            autoComplete="off"
          />
        </div>
        <Button type="button" variant="outline" onClick={() => setShowNouveau(true)} disabled={!!selection}>
          <Plus size={14} className="mr-1" /> Véhicule
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Saisissez au moins 2 caractères. Les véhicules non réceptionnables sont signalés avec leur raison.
      </p>

      {/* Résultats (recherche uniquement) */}
      {!selection && rechercheActive && (isFetching || isError || liste.length > 0) && (
        <div className="mt-3 space-y-1.5">
          {isFetching && (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 size={13} className="animate-spin" /> Recherche…
            </div>
          )}
          {isError && (
            <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Erreur lors de la recherche.
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Réessayer</Button>
            </div>
          )}
          {!isFetching && !isError && liste.length === 0 && (
            <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              <span>Aucun véhicule trouvé pour « {search} ».</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNouveau(true)}>
                <Plus size={12} className="mr-1" /> Créer le véhicule
              </Button>
            </div>
          )}
          {liste.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => choisir(v)}
              className="flex w-full items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition hover:border-primary/40 hover:bg-accent/40"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Car size={14} className="shrink-0 text-primary" />
                  <span className="font-mono text-sm font-semibold">{v.immatriculation}</span>
                  {(v.marque || v.modele) && (
                    <span className="text-xs text-muted-foreground">
                      {v.marque ?? ""} {v.modele ?? ""}
                      {v.annee ? ` · ${v.annee}` : ""}
                      {v.couleur ? ` · ${v.couleur}` : ""}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {clientLabel(v) && (
                    <span className="inline-flex items-center gap-1">
                      <UserRound size={11} /> {clientLabel(v)}
                      {v.clientTelephone ? ` — ${v.clientTelephone}` : ""}
                    </span>
                  )}
                  {typeof v.kilometrage === "number" && <span>{v.kilometrage.toLocaleString("fr-FR")} km</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${VEH_STATUT_STYLE[v.statutImmobilisation] ?? "bg-muted text-muted-foreground"}`}>
                  {VEH_STATUT_LABELS[v.statutImmobilisation] ?? v.statutImmobilisation}
                </span>
                {v.orEnCours && (
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold uppercase text-warning-foreground">
                    OR en cours {v.orEnCours.numero}
                  </span>
                )}
                {!v.eligible && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
                    Non réceptionnable
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Refus : véhicule non réceptionnable */}
      {refus && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="font-medium">{refus.immatriculation}</p>
              <p className="text-xs text-destructive/90">{refus.raison}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRefus(null)}>
              <X size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation OR en cours (avec lien vers l'OR existant) */}
      {confirmerOR && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning-foreground" />
            <div className="flex-1">
              <p className="font-medium">
                {confirmerOR.immatriculation} a déjà un ordre en cours ({confirmerOR.orEnCours?.numero}).
              </p>
              <p className="text-xs text-muted-foreground">Créer un nouvel OR sur ce véhicule ?</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Link
              href={`/dashboard/ordres-reparation/${confirmerOR.orEnCours?.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink size={13} className="mr-1" /> Ouvrir l'OR {confirmerOR.orEnCours?.numero}
            </Link>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmerOR(null)}>
              <X size={13} className="mr-1" /> Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setSelection(confirmerOR);
                setConfirmerOR(null);
              }}
            >
              <Wrench size={13} className="mr-1" /> Créer quand même
            </Button>
          </div>
        </div>
      )}

      {/* Récap sélection + création */}
      {selection && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Car size={14} className="text-primary" />
                  <span className="font-mono text-sm font-semibold">{selection.immatriculation}</span>
                  {(selection.marque || selection.modele) && (
                    <span className="text-xs text-muted-foreground">
                      {selection.marque ?? ""} {selection.modele ?? ""}
                      {selection.annee ? ` · ${selection.annee}` : ""}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {clientLabel(selection) ? (
                    <span className="inline-flex items-center gap-1">
                      <UserRound size={11} /> {clientLabel(selection)}
                      {selection.clientTelephone ? ` — ${selection.clientTelephone}` : ""}
                    </span>
                  ) : (
                    "Aucun client lié"
                  )}
                  {selection.orEnCours && (
                    <span className="ml-2 inline-flex items-center gap-1 font-semibold text-warning-foreground">
                      <AlertTriangle size={11} /> OR en cours : {selection.orEnCours.numero}
                    </span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelection(null);
                  setPlainte("");
                }}
              >
                <X size={14} /> Changer
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Plainte / demande</Label>
            <Input
              value={plainte}
              onChange={(e) => setPlainte(e.target.value)}
              placeholder="Ex : Vidange + freins"
              className="mt-1"
            />
          </div>
          <Button onClick={confirmerCreation} className="gap-2" disabled={create.isPending}>
            {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
            {create.isPending ? "Création…" : "Créer l'OR"}
          </Button>
        </div>
      )}

      {/* Mini-formulaire nouveau véhicule */}
      <Dialog open={showNouveau} onOpenChange={setShowNouveau}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau véhicule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Immatriculation *</Label>
                <Input
                  value={nv.immatriculation}
                  onChange={(e) => setNv({ ...nv, immatriculation: e.target.value })}
                  placeholder="Ex : LT 4582 CB"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Marque</Label>
                <Input value={nv.marque} onChange={(e) => setNv({ ...nv, marque: e.target.value })} placeholder="Toyota" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Modèle</Label>
                <Input value={nv.modele} onChange={(e) => setNv({ ...nv, modele: e.target.value })} placeholder="Corolla" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Année</Label>
                <Input
                  type="number"
                  value={nv.annee}
                  onChange={(e) => setNv({ ...nv, annee: e.target.value })}
                  placeholder="2020"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Couleur</Label>
                <Input value={nv.couleur} onChange={(e) => setNv({ ...nv, couleur: e.target.value })} placeholder="Noir" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Client</Label>
                <Input
                  value={nvClientSearch}
                  onChange={(e) => setNvClientSearch(e.target.value)}
                  placeholder="Rechercher un client…"
                  className="mt-1"
                />
                {nvClientDebounced.trim().length >= 2 && (nvClients?.clients ?? []).length > 0 && (
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-1">
                    {(nvClients?.clients ?? []).map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setNv({ ...nv, clientId: Number(c.id) });
                          setNvClientSearch(`${c.prenom ?? ""} ${c.nom ?? ""}`.trim() || c.raisonSociale || "");
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent/40"
                      >
                        <span>{(c.prenom ?? "") + " " + (c.nom ?? "") || c.raisonSociale}</span>
                        {c.telephone && <span className="text-muted-foreground">{c.telephone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowNouveau(false)}>
                Annuler
              </Button>
              <Button type="button" onClick={saveNouveau} disabled={createVehicule.isPending}>
                {createVehicule.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {createVehicule.isPending ? "Création…" : "Créer le véhicule"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}