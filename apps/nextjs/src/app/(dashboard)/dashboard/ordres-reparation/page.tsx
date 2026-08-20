"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  ArrowLeft,
  Car,
  ClipboardList,
  Package,
  Plus,
  Search,
  Undo2,
  Wrench,
  RefreshCw,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const STATUTS_BADGE: Record<string, string> = {
  ouvert: "bg-muted text-muted-foreground",
  en_cours: "bg-info/10 text-info-foreground",
  attente_piece: "bg-warning/10 text-warning-foreground",
  termine: "bg-success/10 text-success-foreground",
  facture: "bg-primary/10 text-primary",
  annule: "bg-destructive/10 text-destructive",
};

/**
 * ORDRES DE RÉPARATION — specs GPJ / Architecture §3.2.
 * Liste + fiche détail (lignes pièces/main d'œuvre) + sortie/retour de pièces
 * liés à l'OR (stock.sortirPourOR / stock.retourAtelier).
 */
export default function OrdresReparationPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading, refetch } = api.or.list.useQuery({ search: search || undefined });
  const { data: vehicules } = api.or.listVehicules.useQuery({});
  const { data: clients } = api.customers.list.useQuery({ limit: 100 });
  const clientList = (clients as any[]) ?? [];

  const create = api.or.create.useMutation({
    onSuccess: () => { toast.success("OR créé"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const [createForm, setCreateForm] = useState({ vehiculeId: 0, clientId: 0, plainte: "" });

  const liste = data?.items ?? [];

  const saveCreate = () => {
    if (!createForm.vehiculeId) { toast.error("Véhicule requis"); return; }
    create.mutate({
      vehiculeId: createForm.vehiculeId,
      clientId: createForm.clientId || undefined,
      plainte: createForm.plainte || undefined,
    });
    setCreateForm({ vehiculeId: 0, clientId: 0, plainte: "" });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Ordres de Réparation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cycle complet : plainte → diagnostic → devis → travaux → pièces → clôture.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <Input placeholder="Rechercher (n°, immatriculation, client)..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>

      {/* Création rapide */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Nouvel ordre de réparation</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">Véhicule *</Label>
            <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={createForm.vehiculeId} onChange={(e) => setCreateForm({ ...createForm, vehiculeId: Number(e.target.value) })}>
              <option value={0}>Véhicule...</option>
              {(vehicules ?? []).map((v: any) => (
                <option key={v.id} value={v.id}>{v.immatriculation} — {v.marque} {v.modele}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Client</Label>
            <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={createForm.clientId} onChange={(e) => setCreateForm({ ...createForm, clientId: Number(e.target.value) })}>
              <option value={0}>Client (auto si véhicule)...</option>
              {clientList.map((c: any) => (
                <option key={c.id} value={Number(c.id)}>{c.prenom} {c.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Plainte / demande</Label>
            <Input value={createForm.plainte} onChange={(e) => setCreateForm({ ...createForm, plainte: e.target.value })} placeholder="Ex: Vidange + freins" className="mt-1" />
          </div>
        </div>
        <Button onClick={saveCreate} className="mt-3 gap-2" disabled={create.isPending}>
          <Plus size={14} /> {create.isPending ? "Création..." : "Créer l'OR"}
        </Button>
      </div>

      {selectedId ? (
        <OrDetail id={selectedId} onBack={() => setSelectedId(null)} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          {isLoading ? (
            <div className="h-40 animate-pulse bg-muted/50" />
          ) : liste.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList size={36} className="mb-2 opacity-40" />
              <p className="font-medium">Aucun ordre de réparation</p>
              <p className="text-sm text-muted-foreground">Créez le premier OR ci-dessus.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">N°</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Véhicule</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plainte</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Statut</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total TTC</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((or: any) => (
                  <tr key={or.id} className="border-t border-border hover:bg-accent/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{or.numero}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Car size={14} className="text-primary" />
                        <span className="font-medium">{or.immatriculation}</span>
                        {or.marque && <span className="text-xs text-muted-foreground">({or.marque} {or.modele})</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{or.clientPrenom} {or.clientNom}</td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground">{or.plainte ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUTS_BADGE[or.statut] ?? "bg-muted"}`}>{or.statut}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{Number(or.totalTTC).toLocaleString("fr-FR")} F</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelectedId(Number(or.id))}>
                        <Wrench size={13} className="mr-1" /> Détail
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Fiche détail d'un OR : lignes + sortie/retour de pièces ───
function OrDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const utils = api.useUtils();
  const { data: or, isLoading } = api.or.getById.useQuery({ id });
  const { data: produits } = api.catalog.list.useQuery({ limit: 200 });
  const { data: employes } = api.rh.list.useQuery({ limit: 100, statut: "actif" });

  const [sortieForm, setSortieForm] = useState({ produitId: 0, quantite: 1, motif: "" });
  const [retourForm, setRetourForm] = useState({ produitId: 0, quantite: 1, motif: "" });
  const [reservationForm, setReservationForm] = useState({ produitId: 0, quantite: 1, motif: "" });
  const [coreForm, setCoreForm] = useState({ produitId: 0, quantite: 1, valeurCore: 0, motif: "" });

  const addLigne = api.or.addLigne.useMutation({
    onSuccess: () => { toast.success("Ligne ajoutée"); utils.or.getById.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateStatut = api.or.update.useMutation({
    onSuccess: () => { toast.success("OR mis à jour"); utils.or.getById.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const sortir = api.stock.sortirPourOR.useMutation({
    onSuccess: (r: any) => { toast.success(`Pièce sortie (stock ${r.stockApres})`); utils.or.getById.invalidate(); utils.stock.listMouvementsParOR.invalidate(); setSortieForm({ produitId: 0, quantite: 1, motif: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const retour = api.stock.retourAtelier.useMutation({
    onSuccess: (r: any) => { toast.success(`Pièce réintégrée (stock ${r.stockApres})`); utils.or.getById.invalidate(); utils.stock.listMouvementsParOR.invalidate(); setRetourForm({ produitId: 0, quantite: 1, motif: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const reserver = api.stock.reserverStock.useMutation({
    onSuccess: (r: any) => { toast.success(`Pièce réservée (dispo ${r.disponible})`); utils.or.getById.invalidate(); utils.stock.listMouvementsParOR.invalidate(); setReservationForm({ produitId: 0, quantite: 1, motif: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const liberer = api.stock.libererStock.useMutation({
    onSuccess: (r: any) => { toast.success(`Réservation libérée (dispo ${r.disponible})`); utils.or.getById.invalidate(); utils.stock.listMouvementsParOR.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const { data: coresOR } = api.stock.listerCores.useQuery({ orId: id }, { enabled: !!id });
  const creerCore = api.stock.creerEchangeCore.useMutation({
    onSuccess: (r: any) => { toast.success(`Échange core créé (dépôt ${r.echangeId})`); utils.stock.listerCores.invalidate(); utils.or.getById.invalidate(); utils.stock.listMouvementsParOR.invalidate(); setCoreForm({ produitId: 0, quantite: 1, valeurCore: 0, motif: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const retournerCore = api.stock.retournerCoquille.useMutation({
    onSuccess: () => { toast.success("Coquille traitée"); utils.stock.listerCores.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const { data: mvts } = api.stock.listMouvementsParOR.useQuery({ orId: id });

  if (isLoading) return <div className="h-60 animate-pulse rounded-xl bg-muted" />;
  if (!or) return <p>OR introuvable</p>;

  const listeProduits = (produits?.items ?? []) as any[];
  const lignes = or.lignes ?? [];
  const listeMvts = mvts ?? [];

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Retour à la liste
      </button>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">OR {or.numero}</h2>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUTS_BADGE[or.statut] ?? "bg-muted"}`}>{or.statut}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              <Car size={12} className="inline" /> {or.immatriculation} — {or.marque} {or.modele} · Client : {or.clientPrenom} {or.clientNom}
            </p>
            {or.plainte && <p className="mt-1 text-sm">Plainte : <span className="text-foreground/80">{or.plainte}</span></p>}
            {or.diagnostic && <p className="mt-1 text-sm">Diagnostic : <span className="text-foreground/80">{or.diagnostic}</span></p>}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={or.statut}
              onChange={(e) => updateStatut.mutate({ id, statut: e.target.value as any })}
            >
              {["ouvert", "en_cours", "attente_piece", "termine", "facture", "annule"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-muted/50 p-2"><span className="text-muted-foreground">Pièces : </span><b>{Number(or.totalPieces).toLocaleString("fr-FR")} F</b></div>
          <div className="rounded-lg bg-muted/50 p-2"><span className="text-muted-foreground">Main d'œuvre : </span><b>{Number(or.totalMainOeuvre).toLocaleString("fr-FR")} F</b></div>
          <div className="rounded-lg bg-primary/10 p-2"><span className="text-muted-foreground">Total TTC : </span><b>{Number(or.totalTTC).toLocaleString("fr-FR")} F</b></div>
        </div>
      </div>

      {/* Sortie / Retour / Réservation de pièces */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Package size={14} className="text-primary" /> Sortir une pièce (liée à l'OR)
          </div>
          <div className="grid gap-2">
            <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={sortieForm.produitId} onChange={(e) => setSortieForm({ ...sortieForm, produitId: Number(e.target.value) })}>
              <option value={0}>Produit...</option>
              {listeProduits.map((p: any) => <option key={p.id} value={Number(p.id)}>{p.titre} ({p.codeArticle ?? p.codeBarre})</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min={1} placeholder="Quantité" value={sortieForm.quantite} onChange={(e) => setSortieForm({ ...sortieForm, quantite: Number(e.target.value) })} />
              <Input placeholder="Motif (min 3)" value={sortieForm.motif} onChange={(e) => setSortieForm({ ...sortieForm, motif: e.target.value })} />
            </div>
            <Button onClick={() => { if (!sortieForm.produitId) { toast.error("Produit requis"); return; } sortir.mutate({ orId: id, produitId: sortieForm.produitId, quantite: sortieForm.quantite, motif: sortieForm.motif || undefined }); }} disabled={sortir.isPending} className="gap-2">
              <Package size={14} /> {sortir.isPending ? "Sortie..." : "Sortir la pièce"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Undo2 size={14} className="text-warning-foreground" /> Retour de pièce (atelier → stock)
          </div>
          <div className="grid gap-2">
            <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={retourForm.produitId} onChange={(e) => setRetourForm({ ...retourForm, produitId: Number(e.target.value) })}>
              <option value={0}>Produit...</option>
              {listeProduits.map((p: any) => <option key={p.id} value={Number(p.id)}>{p.titre}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min={1} placeholder="Quantité" value={retourForm.quantite} onChange={(e) => setRetourForm({ ...retourForm, quantite: Number(e.target.value) })} />
              <Input placeholder="Motif (min 3)" value={retourForm.motif} onChange={(e) => setRetourForm({ ...retourForm, motif: e.target.value })} />
            </div>
            <Button onClick={() => { if (!retourForm.produitId) { toast.error("Produit requis"); return; } retour.mutate({ orId: id, produitId: retourForm.produitId, quantite: retourForm.quantite, motif: retourForm.motif || undefined }); }} disabled={retour.isPending} className="gap-2">
              <Undo2 size={14} /> {retour.isPending ? "Retour..." : "Réintégrer au stock"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Package size={14} className="text-info-foreground" /> Réservation de pièce (pour l'OR)
          </div>
          <div className="grid gap-2">
            <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={reservationForm.produitId} onChange={(e) => setReservationForm({ ...reservationForm, produitId: Number(e.target.value) })}>
              <option value={0}>Produit...</option>
              {listeProduits.map((p: any) => <option key={p.id} value={Number(p.id)}>{p.titre}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min={1} placeholder="Quantité" value={reservationForm.quantite} onChange={(e) => setReservationForm({ ...reservationForm, quantite: Number(e.target.value) })} />
              <Input placeholder="Motif (min 3)" value={reservationForm.motif} onChange={(e) => setReservationForm({ ...reservationForm, motif: e.target.value })} />
            </div>
            <Button onClick={() => { if (!reservationForm.produitId) { toast.error("Produit requis"); return; } reserver.mutate({ orId: id, produitId: reservationForm.produitId, quantite: reservationForm.quantite, motif: reservationForm.motif || undefined }); }} disabled={reserver.isPending} className="gap-2">
              <Package size={14} /> {reserver.isPending ? "Réservation..." : "Réserver la pièce"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs"
              onClick={() => { if (!reservationForm.produitId) { toast.error("Produit requis"); return; } liberer.mutate({ orId: id, produitId: reservationForm.produitId, quantite: reservationForm.quantite, motif: "Libération manuelle" }); }}
              disabled={liberer.isPending}>
              Libérer la réservation
            </Button>
            <p className="text-[10px] text-muted-foreground">La réservation met la pièce de côté (stock disponible − réservé). À libérer si la pièce n'est finalement pas utilisée.</p>
          </div>
        </div>
      </div>

      {/* Historique des mouvements de l'OR */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <ClipboardList size={14} className="text-primary" /> Mouvements de stock liés à l'OR
        </div>
        {listeMvts.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Aucun mouvement pour cet OR.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Article</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Qté</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Stock</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Motif</th>
              </tr>
            </thead>
            <tbody>
              {listeMvts.map((m: any) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${m.type === "SORTIE_OR" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success-foreground"}`}>{m.type}</span>
                  </td>
                  <td className="px-3 py-2">{m.produitTitre ?? `#${m.produitId}`}</td>
                  <td className="px-3 py-2 text-center font-mono">{m.sens === "S" ? "-" : "+"}{m.quantite}</td>
                  <td className="px-3 py-2 text-center font-mono">{m.stockAvant} → {m.stockApres}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{m.dateMouvement ? new Date(m.dateMouvement).toLocaleString("fr-FR") : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{m.motif ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Lignes de l'OR */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Wrench size={14} className="text-primary" /> Lignes (pièces & main d'œuvre)
          </div>
        </div>
        {lignes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Aucune ligne. Ajoutez des pièces via la sortie ci-dessus, ou une ligne de main d'œuvre.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Libellé</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Qté</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">PU</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Statut</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l: any) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.type}</td>
                  <td className="px-3 py-2 font-medium">{l.libelle}</td>
                  <td className="px-3 py-2 text-center">{l.quantite}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(l.prixUnitaire).toLocaleString("fr-FR")} F</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(l.totalLigne).toLocaleString("fr-FR")} F</td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">{l.statut}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Échanges standard (cores) — specs V2 processus 8 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <RefreshCw size={14} className="text-primary" /> Échanges standard (cores)
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2">
            <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={coreForm.produitId} onChange={(e) => { const p = listeProduits.find((x: any) => Number(x.id) === Number(e.target.value)); setCoreForm({ ...coreForm, produitId: Number(e.target.value), valeurCore: p?.valeurCore ? Number(p.valeurCore) : 0 }); }}>
              <option value={0}>Pièce en échange standard (core)...</option>
              {listeProduits.filter((p: any) => p.estCore).map((p: any) => <option key={p.id} value={Number(p.id)}>{p.titre}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <Input type="number" min={1} placeholder="Qté" value={coreForm.quantite} onChange={(e) => setCoreForm({ ...coreForm, quantite: Number(e.target.value) })} />
              <Input type="number" min={0} placeholder="Dépôt (F)" value={coreForm.valeurCore || ""} onChange={(e) => setCoreForm({ ...coreForm, valeurCore: Number(e.target.value) })} />
              <Input placeholder="Motif" value={coreForm.motif} onChange={(e) => setCoreForm({ ...coreForm, motif: e.target.value })} />
            </div>
            <Button onClick={() => { if (!coreForm.produitId) { toast.error("Produit core requis"); return; } creerCore.mutate({ orId: id, produitId: coreForm.produitId, quantite: coreForm.quantite, valeurCore: coreForm.valeurCore, motif: coreForm.motif || undefined }); }} disabled={creerCore.isPending} className="gap-2">
              <RefreshCw size={14} /> {creerCore.isPending ? "Création..." : "Créer l'échange (sort la pièce neuve)"}
            </Button>
            <p className="text-[10px] text-muted-foreground">La pièce neuve est sortie du stock (SORTIE_OR) et le dépôt (valeur_core) est enregistré jusqu'au retour de la coquille.</p>
          </div>
          <div className="space-y-2">
            {!coresOR?.length ? (
              <p className="text-sm text-muted-foreground">Aucun échange pour cet OR.</p>
            ) : (
              coresOR.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{c.produitTitre}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${c.statut === "EN_ATTENTE" ? "bg-warning/10 text-warning-foreground" : "bg-success/10 text-success-foreground"}`}>{c.statut === "EN_ATTENTE" ? "Coquille à rendre" : c.statut === "COQUILLE_RETOURNEE" ? "Coquille rendue" : "Coquille perdue"}</span>
                    <span className="ml-2 text-xs text-muted-foreground">dépôt {Number(c.valeurCore).toLocaleString("fr-FR")} F × {c.quantite}</span>
                  </div>
                  {c.statut === "EN_ATTENTE" && (
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => retournerCore.mutate({ echangeId: c.id, perdue: false })} disabled={retournerCore.isPending}>Rendre la coquille</Button>
                      <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => retournerCore.mutate({ echangeId: c.id, perdue: true })} disabled={retournerCore.isPending}>Perdue</Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
