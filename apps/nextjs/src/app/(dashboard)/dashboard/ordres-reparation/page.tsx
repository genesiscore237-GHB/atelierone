"use client";

import { useState, useRef, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  ArrowLeft,
  Car,
  ClipboardList,
  X,
  Package,
  Plus,
  Search,
  Undo2,
  Wrench,
  RefreshCw,
  Receipt,
  Loader2,
  Check,
  History,
  UserRound,
  AlertTriangle,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { usePermissions } from "~/hooks/usePermissions";
import {
  STATUT_BADGE,
  STATUT_LABELS,
  PRIORITE_META,
  ALERTE_META,
  transitionStatutAtelierValide,
  STATUTS_ATELIER,
} from "~/server/lib/atelier-service";
import { VehiculeRecherche } from "./_components/VehiculeRecherche";

/**
 * ORDRES DE RÉPARATION — specs GPJ / Architecture §3.2.
 * Liste + fiche détail (lignes pièces/main d'œuvre) + sortie/retour de pièces
 * liés à l'OR (stock.sortirPourOR / stock.retourAtelier) + cycle de vie V2.
 */
export default function OrdresReparationPage() {
  const [search, setSearch] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyId = searchParams?.get("or");
  const showLegacy = legacyId != null && legacyId !== "";
  const legacyIdNum = showLegacy ? Number(legacyId) : null;

  const { data, isLoading, refetch } = api.or.list.useQuery({ search: search || undefined });

  const liste = data?.items ?? [];

  return (
    <div className="space-y-5">
      {showLegacy && legacyIdNum && !Number.isNaN(legacyIdNum) ? (
        <OrDetail id={legacyIdNum} onBack={() => router.replace("/dashboard/ordres-reparation")} />
      ) : (
        <>
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

      <VehiculeRecherche onCree={() => refetch()} />

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
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUT_BADGE[or.statut] ?? "bg-muted"}`}>{STATUT_LABELS[or.statut] ?? or.statut}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{Number(or.totalTTC).toLocaleString("fr-FR")} F</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/ordres-reparation/${or.id}`)}>
                      <Wrench size={13} className="mr-1" /> Détail
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
        </>
      )}
    </div>
  );
}

// ─── Fiche détail d'un OR : lignes + sortie/retour de pièces ───
function OrDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const utils = api.useUtils();
  const { data: or, isLoading } = api.or.getById.useQuery({ id });
  const { data: produits } = api.catalog.list.useQuery({ limit: 200 });
  const { data: employes } = api.rh.roster.useQuery({ statut: "actif" });

  const [sortieForm, setSortieForm] = useState({ produitId: 0, quantite: 1, motif: "" });
  const [retourForm, setRetourForm] = useState({ produitId: 0, quantite: 1, motif: "" });
  const [reservationForm, setReservationForm] = useState({ produitId: 0, quantite: 1, motif: "" });
  const [coreForm, setCoreForm] = useState({ produitId: 0, quantite: 1, valeurCore: 0, motif: "" });
  const [kitForm, setKitForm] = useState({ kitId: 0, quantite: 1, motif: "" });
  const [pcForm, setPcForm] = useState({ produitId: 0, libelle: "", quantite: 1, motif: "" });
  const [showFacture, setShowFacture] = useState(false);
  const [factureForm, setFactureForm] = useState({ modePaiement: "especes", remisePourcent: "", notes: "" });

  const facturer = api.or.facturer.useMutation({
    onSuccess: (r: any) => { toast.success(`OR facturé — ${r.reference} (${r.montantTotal.toLocaleString("fr-FR")} F)`); utils.or.getById.invalidate(); utils.or.list.invalidate(); setShowFacture(false); setFactureForm({ modePaiement: "especes", remisePourcent: "", notes: "" }); },
    onError: (e) => toast.error(e.message),
  });

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
  const { data: kitsDispo } = api.catalog.listKits.useQuery();
  const { data: piecesClient } = api.or.listerPiecesClient.useQuery({ orId: id }, { enabled: !!id });
  const addPieceClient = api.or.addPieceClient.useMutation({
    onSuccess: (r: any) => { toast.success(`Pièce client enregistrée (${r.libelle}) — stock non impacté`); utils.or.listerPiecesClient.invalidate(); utils.or.getById.invalidate(); setPcForm({ produitId: 0, libelle: "", quantite: 1, motif: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const remettrePiece = api.or.remettrePieceClient.useMutation({
    onSuccess: () => { toast.success("Ancienne pièce remise au client"); utils.or.listerPiecesClient.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const sortirKit = api.stock.sortirKit.useMutation({
    onSuccess: () => { toast.success("Kit sorti (composants décomptés)"); utils.or.getById.invalidate(); utils.stock.listMouvementsParOR.invalidate(); setKitForm({ kitId: 0, quantite: 1, motif: "" }); },
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
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">OR {or.numero}</h2>
              <span className={`rounded px-2 py-0.5 text-[11px] font-black text-white ${or.priorite === "P1" ? "bg-destructive" : or.priorite === "P2" ? "bg-warning" : or.priorite === "P3" ? "bg-success" : "bg-muted text-muted-foreground"}`}>{or.priorite}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUT_BADGE[or.statut] ?? "bg-muted"}`}>{STATUT_LABELS[or.statut] ?? or.statut}</span>
              {or.alerte && or.alerte !== "OK" && (
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${ALERTE_META[or.alerte]?.badge ?? ""}`}>{ALERTE_META[or.alerte]?.libelle ?? or.alerte}</span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              <Car size={12} className="inline" /> {or.immatriculation} — {or.marque} {or.modele} · Client : {or.clientPrenom} {or.clientNom}
            </p>
            {or.plainte && <p className="mt-1 text-sm">Plainte : <span className="text-foreground/80">{or.plainte}</span></p>}
            {or.diagnostic && <p className="mt-1 text-sm">Diagnostic : <span className="text-foreground/80">{or.diagnostic}</span></p>}
            <p className="mt-1 text-xs text-muted-foreground">
              Entrée : {or.dateOuverture ? new Date(or.dateOuverture).toLocaleDateString("fr-FR") : "—"}
              {or.datePromesse && <> · Promesse : {new Date(or.datePromesse).toLocaleDateString("fr-FR")}</>}
              {or.joursImmobilisation !== undefined && <> · Immobilisation : <b className="text-warning-foreground">{or.joursImmobilisation} j</b></>}
              {or.retardJours > 0 && <> · <b className="text-destructive">Retard {or.retardJours} j</b></>}
              {or.emplacement && <> · {or.emplacement}</>}
            </p>
            {or.raisonBlocage && (
              <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-destructive">
                <AlertTriangle size={12} /> Bloqué : {or.raisonBlocage}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatutSelector or={or} id={id} />
            <PrioriteSelector or={or} id={id} />
            {or.statut === "PRET_A_LIVRER" && !or.venteId && (
              <Button onClick={() => setShowFacture(true)} className="gap-1.5 text-xs">
                <Receipt size={14} /> Facturer
              </Button>
            )}
            {or.venteId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-bold uppercase text-success-foreground">
                <Check size={11} /> Facturé
              </span>
            )}
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

      {/* Sortie de kit (specs V2 §02, US18) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Package size={14} className="text-primary" /> Sortie de kit
        </div>
        <div className="grid gap-2 lg:grid-cols-4">
          <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={kitForm.kitId} onChange={(e) => setKitForm({ ...kitForm, kitId: Number(e.target.value) })}>
            <option value={0}>Kit (avec composition)...</option>
            {(kitsDispo ?? []).map((k: any) => <option key={k.id} value={Number(k.id)}>{k.titre}</option>)}
          </select>
          <Input type="number" min={1} placeholder="Qté" value={kitForm.quantite} onChange={(e) => setKitForm({ ...kitForm, quantite: Number(e.target.value) })} />
          <Input placeholder="Motif" value={kitForm.motif} onChange={(e) => setKitForm({ ...kitForm, motif: e.target.value })} />
          <Button onClick={() => { if (!kitForm.kitId) { toast.error("Sélectionnez un kit"); return; } sortirKit.mutate({ orId: id, kitId: kitForm.kitId, quantite: kitForm.quantite, motif: kitForm.motif || undefined }); }} disabled={sortirKit.isPending} className="gap-2">
            <Package size={14} /> {sortirKit.isPending ? "Sortie..." : "Sortir le kit"}
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">Le kit et ses composants (composition définie dans la fiche article) sont sortis du stock avec des mouvements liés à l'OR.</p>
      </div>

      {/* Pièces fournies par le client (specs V2 §04 processus 8, règle 10) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <ClipboardList size={14} className="text-primary" /> Pièces fournies par le client
        </div>
        <div className="grid gap-2 lg:grid-cols-4">
          <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={pcForm.produitId} onChange={(e) => setPcForm({ ...pcForm, produitId: Number(e.target.value) })}>
            <option value={0}>Article du catalogue (optionnel)...</option>
            {listeProduits.map((p: any) => <option key={p.id} value={Number(p.id)}>{p.titre}</option>)}
          </select>
          <Input placeholder="Libellé (ex. frein fourni par le client)" value={pcForm.libelle} onChange={(e) => setPcForm({ ...pcForm, libelle: e.target.value })} />
          <Input type="number" min={1} placeholder="Qté" value={pcForm.quantite} onChange={(e) => setPcForm({ ...pcForm, quantite: Number(e.target.value) })} />
          <Button onClick={() => { if (!pcForm.produitId && !pcForm.libelle.trim()) { toast.error("Choisissez un article ou un libellé"); return; } addPieceClient.mutate({ orId: id, produitId: pcForm.produitId || undefined, libelle: pcForm.libelle.trim() || undefined, quantite: pcForm.quantite, motif: pcForm.motif || undefined }); }} disabled={addPieceClient.isPending} className="gap-2">
            <ClipboardList size={14} /> {addPieceClient.isPending ? "Enregistrement..." : "Enregistrer la pièce client"}
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">Pièce apportée par le client : tracée sur l'OR (type PIECE_CLIENT) sans décrémenter le stock.</p>
        <div className="mt-3 space-y-2">
          {!piecesClient?.length ? (
            <p className="text-sm text-muted-foreground">Aucune pièce fournie par le client pour cet OR.</p>
          ) : (
            piecesClient.map((pc: any) => (
              <div key={pc.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{pc.libelle}</span>
                  <span className="ml-2 text-xs text-muted-foreground">× {pc.quantite}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${pc.remiseAuClient ? "bg-success/10 text-success-foreground" : "bg-warning/10 text-warning-foreground"}`}>
                    {pc.remiseAuClient ? "Ancienne pièce remise au client" : "En attente"}
                  </span>
                  {pc.motifClient && <span className="ml-2 text-xs text-muted-foreground">· {pc.motifClient}</span>}
                </div>
                {!pc.remiseAuClient && (
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => remettrePiece.mutate({ ligneId: pc.id, orId: id })} disabled={remettrePiece.isPending}>
                    Remettre l'ancienne pièce au client
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {showFacture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowFacture(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Receipt size={16} className="text-primary" /> Facturer l'OR {or.numero}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">Total TTC : <b className="text-foreground">{Number(or.totalTTC).toLocaleString("fr-FR")} F</b></p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Mode de paiement</label>
                <select value={factureForm.modePaiement} onChange={(e) => setFactureForm({ ...factureForm, modePaiement: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="especes">Espèces</option>
                  <option value="om">Orange Money</option>
                  <option value="momo">MTN MoMo</option>
                  <option value="carte">Carte</option>
                  <option value="virement">Virement</option>
                  <option value="credit">Crédit (créance)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Remise (%) — défaut : contrat ou client</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={factureForm.remisePourcent}
                  onChange={(e) => setFactureForm({ ...factureForm, remisePourcent: e.target.value })}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <input
                  value={factureForm.notes}
                  onChange={(e) => setFactureForm({ ...factureForm, notes: e.target.value })}
                  placeholder="Optionnel"
                  className="mt-1 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFacture(false)}>Annuler</Button>
              <Button onClick={() => facturer.mutate({ id: Number(id), modePaiement: factureForm.modePaiement as any, remisePourcent: factureForm.remisePourcent ? Number(factureForm.remisePourcent) : undefined, notes: factureForm.notes || undefined })} disabled={facturer.isPending} className="gap-2">
                {facturer.isPending ? <Loader2 className="size-4 animate-spin" /> : <Receipt size={14} />}
                Facturer
              </Button>
            </div>
          </div>
        </div>
      )}

      <CycleAtelierSections or={or} id={id} />

      {/* E5/E4 — Accusé de réception client + marge */}
      <AccuseReceptionBlock or={or} id={id} />

      {/* Photos du véhicule */}
      <PhotosBlock photos={or.photos ?? []} orId={Number(id)} />

      {/* Historique du cycle de vie */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <History size={14} className="text-primary" /> Historique du cycle de vie
        </div>
        {(or.historique ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun changement enregistré.</p>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {(or.historique ?? []).map((h: any) => (
              <div key={h.id} className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                <span className={`mt-0.5 w-20 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[9px] font-black uppercase ${
                  h.type === "STATUT" ? "bg-primary/10 text-primary" : h.type === "PRIORITE" ? "bg-warning/10 text-warning-foreground" : h.type === "RESPONSABLE" ? "bg-sky-500/10 text-sky-400" : "bg-muted text-muted-foreground"
                }`}>{h.type}</span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">
                    {h.type === "PRIORITE"
                      ? `${h.ancienneValeur ?? "—"} → ${h.nouvelleValeur}`
                      : h.type === "RESPONSABLE"
                        ? `Technicien #${h.ancienneValeur ?? "non assigné"} → #${h.nouvelleValeur ?? "non assigné"}`
                        : `${STATUT_LABELS[h.ancienneValeur ?? ""] ?? h.ancienneValeur ?? "—"} → ${STATUT_LABELS[h.nouvelleValeur ?? ""] ?? h.nouvelleValeur}`}
                  </span>
                  {h.commentaire && <span className="ml-2 text-muted-foreground">· {h.commentaire}</span>}
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(h.changeLe).toLocaleString("fr-FR")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── E5/E4 — Accusé de réception client + marge par OR ───
function PhotosBlock({ photos, orId }: { photos: any[]; orId: number }) {
  const utils = api.useUtils();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const ajouter = api.or.ajouterPhoto.useMutation({
    onSuccess: () => {
      toast.success("Photo ajoutée");
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files).slice(0, 5)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", `or-${orId}`);
        const res = await fetch("/api/uploads", { method: "POST", body: formData });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        const data = await res.json();
        const type = file.type.startsWith("video") ? "VIDEO" : "PHOTO";
        await new Promise<void>((resolve, reject) => {
          ajouter.mutate({ id: orId, url: data.url, type: type as any }, {
            onSettled: () => resolve(),
          });
        });
      } catch (e: any) {
        toast.error(e.message ?? "Erreur upload");
      }
    }
    setUploading(false);
    toast.success(`${files.length} fichier(s) téléversé(s)`);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Photos & vidéos</h3>
        <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4" className="hidden" onChange={(e) => handleUpload(e.target.files)} />
        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading} className="gap-1.5 text-xs">
          {uploading ? <Loader2 className="size-3 animate-spin" /> : <Plus size={13} />} Ajouter
        </Button>
      </div>
      {(photos ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune photo. Ajoutez des photos de l&apos;état du véhicule à la réception.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {(photos ?? []).map((p: any) => (
            <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="group relative overflow-hidden rounded-lg border border-border">
              {p.type === "PHOTO" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
              ) : (
                <div className="flex aspect-square items-center justify-center bg-muted text-xs">🎬</div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── E5/E4 — Accusé de réception client + marge par OR ───
function AccuseReceptionBlock({ or, id }: { or: any; id: number }) {
  const { data: ar } = api.or.accuseReception.useQuery({ orId: Number(id) });
  const { data: marge, isLoading: margeLoading } = api.or.getMargeOr.useQuery(
    { orId: Number(id) },
    { enabled: !!or.venteId }
  );
  const [copie, setCopie] = useState(false);
  if (!ar) return null;

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(ar.texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      toast.error("Copie impossible");
    }
  };

  const margeData = (marge ?? {}) as any;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">Accusé de réception client</h3>
        <p className="rounded-lg bg-muted/30 px-3 py-2 text-sm text-foreground/90">{ar.texte}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ar.whatsappUrl && (
            <a href={ar.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-xs font-semibold text-success-foreground hover:bg-success/25">
              💬 Envoyer par WhatsApp
            </a>
          )}
          <button onClick={copier} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent">
            {copie ? "✓ Copié" : "Copier le texte"}
          </button>
        </div>
      </div>

      {or.venteId && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">Marge de l'intervention</h3>
          {margeLoading ? (
            <div className="h-12 animate-pulse rounded-lg bg-muted" />
          ) : margeData?.facture ? (
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Revenu</p>
                <p className="font-bold">{Number(margeData.revenu).toLocaleString("fr-FR")} F</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Coût pièces</p>
                <p className="font-bold text-warning-foreground">{Number(margeData.coutPieces).toLocaleString("fr-FR")} F</p>
              </div>
              <div className={`rounded-lg p-2 ${Number(margeData.marge) >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                <p className="text-[10px] uppercase text-muted-foreground">Marge</p>
                <p className="font-bold">{Number(margeData.marge).toLocaleString("fr-FR")} F{margeData.pourcentMarge != null && ` (${margeData.pourcentMarge} %)`}</p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Sélecteur de statut (transitions contrôlées + raison obligatoire) ───
function StatutSelector({ or, id }: { or: any; id: number }) {
  const utils = api.useUtils();
  const [showRaison, setShowRaison] = useState<string | null>(null);
  const [raison, setRaison] = useState("");
  const changerStatut = api.or.changerStatut.useMutation({
    onSuccess: () => {
      toast.success("Statut mis à jour");
      utils.or.getById.invalidate();
      utils.or.list.invalidate();
      setShowRaison(null);
      setRaison("");
    },
    onError: (e) => toast.error(e.message),
  });

  const transitions = STATUTS_ATELIER.filter((s) => s !== or.statut && transitionStatutAtelierValide(or.statut, s).ok);
  const besoinRaison = (s: string) => s === "BLOQUE" || s === "ANNULE";

  return (
    <div className="flex items-center gap-1">
      <select
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        value=""
        onChange={(e) => {
          const s = e.target.value;
          if (!s) return;
          if (besoinRaison(s)) { setShowRaison(s); setRaison(""); } else { changerStatut.mutate({ id, nouveauStatut: s as any, commentaire: undefined }); }
        }}
      >
        <option value="">Statut : {STATUT_LABELS[or.statut] ?? or.statut}…</option>
        {transitions.map((s) => <option key={s} value={s} className="bg-background">{STATUT_LABELS[s]}</option>)}
      </select>
      {showRaison && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowRaison(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <AlertTriangle size={16} className="text-destructive" /> {showRaison === "BLOQUE" ? "Bloquer ce véhicule" : "Annuler cet OR"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">La raison est obligatoire pour {STATUT_LABELS[showRaison]}.</p>
            <input
              value={raison}
              onChange={(e) => setRaison(e.target.value)}
              placeholder={showRaison === "BLOQUE" ? "Pièces manquantes, validation client…" : "Motif de l'annulation"}
              className="mt-3 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRaison(null)}>Annuler</Button>
              <Button
                className={showRaison === "BLOQUE" ? "bg-destructive text-destructive-foreground" : ""}
                disabled={raison.trim().length < 3 || changerStatut.isPending}
                onClick={() => changerStatut.mutate({ id, nouveauStatut: showRaison as any, raison: raison.trim(), commentaire: raison.trim() })}
              >
                Confirmer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sélecteur de priorité (historisation obligatoire) ───
function PrioriteSelector({ or, id }: { or: any; id: number }) {
  const utils = api.useUtils();
  const changerPriorite = api.or.changerPriorite.useMutation({
    onSuccess: (r) => {
      toast.success(`Priorité ${r.priorite}`);
      utils.or.getById.invalidate();
      utils.or.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const p = or.priorite ?? "P3";
  return (
    <div className="flex items-center gap-1">
      <span className={`rounded px-2 py-0.5 text-[11px] font-black text-white ${p === "P1" ? "bg-destructive" : p === "P2" ? "bg-warning" : p === "P3" ? "bg-success" : "bg-muted text-muted-foreground"}`}>{p}</span>
      <select
        className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
        value=""
        onChange={(e) => e.target.value && changerPriorite.mutate({ id, priorite: e.target.value as any, motif: "Changement depuis la fiche" })}
      >
        <option value="">Priorité…</option>
        {(["P1", "P2", "P3", "P4"] as const).filter((x) => x !== p).map((x) => <option key={x} value={x} className="bg-background">{x} — {PRIORITE_META[x]?.libelle}</option>)}
      </select>
    </div>
  );
}

// ─── Cycle d'atelier : diagnostic & devis, demandes pièces, commandes, retours ───
function CycleAtelierSections({ or, id }: { or: any; id: number }) {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const canValider = hasPermission("or.valider");
  const canServir = hasPermission("or.pieces.servir");
  const canModifier = hasPermission("or.modifier");
  const { data: produitsData } = api.catalog.list.useQuery({ limit: 200 });
  const { data: fournisseurs } = api.reference.listFournisseurs.useQuery();
  const produitsList = (produitsData?.items ?? []) as any[];
  const fournisseursList = (fournisseurs ?? []) as any[];
  const { data: demandes } = api.or.listerDemandesPieces.useQuery({ orId: id }, { enabled: !!id });
  const { data: commandes } = api.or.listerCommandesFournisseur.useQuery({ orId: id }, { enabled: !!id });
  const { data: retours } = api.or.listerRetoursFournisseur.useQuery({ orId: id }, { enabled: !!id });

  const rapport = or.rapportDiagnostic ?? null;
  const invalidateAll = () => { utils.or.getById.invalidate(); };

  // Diagnostics & devis
  const [diagForm, setDiagForm] = useState<{ constat: string; cause: string; lignes: Array<{ type: string; libelle: string; produitId: number; quantite: number; prixUnitaire: number }> }>({ constat: "", cause: "", lignes: [{ type: "PIECE", libelle: "", produitId: 0, quantite: 1, prixUnitaire: 0 }] });
  const [showDiag, setShowDiag] = useState(false);
  const [renvoiMotif, setRenvoiMotif] = useState("");
  const [confirmRenvoi, setConfirmRenvoi] = useState<string | null>(null);
  const [refusMotif, setRefusMotif] = useState("");
  const [confirmRefus, setConfirmRefus] = useState(false);

  const creerRapport = api.or.creerRapportDiagnostic.useMutation({
    onSuccess: () => { toast.success("Diagnostic soumis — en attente de validation"); invalidateAll(); setShowDiag(false); },
    onError: (e) => toast.error(e.message),
  });
  const validerDiag = api.or.validerDiagnostic.useMutation({
    onSuccess: () => { toast.success("Diagnostic validé — devis disponible"); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });
  const renvoyerDiag = api.or.retournerDiagnostic.useMutation({
    onSuccess: () => { toast.success("Diagnostic renvoyé au technicien"); invalidateAll(); setConfirmRenvoi(null); setRenvoiMotif(""); },
    onError: (e) => toast.error(e.message),
  });
  const soumettreDevis = api.or.soumettreDevis.useMutation({
    onSuccess: () => { toast.success("Devis soumis au client"); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });
  const validerDevis = api.or.validerDevis.useMutation({
    onSuccess: (r) => { toast.success(r.accepte ? "Devis accepté — travaux autorisés" : "Devis refusé"); invalidateAll(); setConfirmRefus(false); setRefusMotif(""); },
    onError: (e) => toast.error(e.message),
  });

  // Demandes de pièces
  const [showDemande, setShowDemande] = useState(false);
  const [demandeForm, setDemandeForm] = useState<Array<{ produitId: number; quantite: number; note: string }>>([{ produitId: 0, quantite: 1, note: "" }]);
  const creerDemande = api.or.creerDemandePieces.useMutation({
    onSuccess: () => { toast.success("Demande envoyée au magasin"); invalidateAll(); setShowDemande(false); setDemandeForm([{ produitId: 0, quantite: 1, note: "" }]); },
    onError: (e) => toast.error(e.message),
  });
  const traiterDemande = api.or.traiterDemandePieces.useMutation({
    onSuccess: (r) => { toast.success(`Demande traitée → ${r.statut}`); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });

  // Commandes fournisseur
  const [showCmd, setShowCmd] = useState(false);
  const [cmdForm, setCmdForm] = useState<{ fournisseurId: number; livraisonAttendue: string; lignes: Array<{ produitId: number; quantite: number; prixUnitaire: number }> }>({ fournisseurId: 0, livraisonAttendue: "", lignes: [{ produitId: 0, quantite: 1, prixUnitaire: 0 }] });
  const creerCmd = api.or.creerCommandeFournisseur.useMutation({
    onSuccess: (r) => { toast.success(`Commande ${r.reference} envoyée au fournisseur`); invalidateAll(); setShowCmd(false); },
    onError: (e) => toast.error(e.message),
  });

  // Retours fournisseur
  const [showRetour, setShowRetour] = useState(false);
  const [retourForm, setRetourForm] = useState<{ fournisseurId: number; motif: string; commentaire: string; lignes: Array<{ produitId: number; quantite: number; note: string }> }>({ fournisseurId: 0, motif: "DEFAILLANTE", commentaire: "", lignes: [{ produitId: 0, quantite: 1, note: "" }] });
  const creerRetour = api.or.creerRetourFournisseur.useMutation({
    onSuccess: (r) => { toast.success(`Retour fournisseur #${r.retourId} enregistré`); invalidateAll(); setShowRetour(false); },
    onError: (e) => toast.error(e.message),
  });
  const remplacerRetour = api.or.enregistrerRemplacement.useMutation({
    onSuccess: () => { toast.success("Pièce de remplacement reçue"); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });
  const cloturerRetour = api.or.cloturerRetour.useMutation({
    onSuccess: () => { toast.success("Retour clôturé"); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });

  const statutRapport = rapport?.statut ?? null;
  const dem = (demandes ?? []) as any[];
  const cmd = (commandes ?? []) as any[];
  const ret = (retours ?? []) as any[];

  // Cycle de vie complet (DMS) : DVI, devis versionné + autorisation ligne par ligne, QC, restitution
  const { data: inspections } = api.or.listerInspections.useQuery({ orId: id }, { enabled: !!id });
  const { data: devisVersions } = api.or.listerDevisVersions.useQuery({ orId: id }, { enabled: !!id });
  const { data: autorisations } = api.or.listerAutorisations.useQuery({ orId: id }, { enabled: !!id });
  const { data: controles } = api.or.listerControlesQualite.useQuery({ orId: id }, { enabled: !!id });
  const { data: restitutions } = api.or.listerRestitutions.useQuery({ orId: id }, { enabled: !!id });
  const [showDvi, setShowDvi] = useState(false);
  const [dviForm, setDviForm] = useState<{ groupe: string; libelle: string; statut: string; mesure: string; notes: string; priorite: string }>({ groupe: "Extérieur", libelle: "", statut: "OK", mesure: "", notes: "", priorite: "CONSEIL" });
  const [dviPoints, setDviPoints] = useState<Array<{ groupe: string; libelle: string; statut: string; mesure: string; notes: string; priorite: string }>>([]);
  const [autorisationLignes, setAutorisationLignes] = useState<Record<number, string>>({});
  const [methodeAutorisation, setMethodeAutorisation] = useState("ORAL");
  const [quiAutorisation, setQuiAutorisation] = useState("");
  const [showQc, setShowQc] = useState(false);
  const [qcChecklist, setQcChecklist] = useState<Array<{ libelle: string; ok: boolean }>>([
    { libelle: "Travaux conformes au devis autorisé", ok: false },
    { libelle: "Niveaux de liquides", ok: false },
    { libelle: "Absence de fuite", ok: false },
    { libelle: "Codes défaut effacés / recontrôlés", ok: false },
    { libelle: "Essai des systèmes réparés", ok: false },
    { libelle: "Propreté intérieure / extérieure", ok: false },
    { libelle: "Outils et protections retirés", ok: false },
  ]);
  const [qcEssai, setQcEssai] = useState(false);
  const [qcObservations, setQcObservations] = useState("");
  const [showRestitution, setShowRestitution] = useState(false);
  const [restitForm, setRestitForm] = useState<{ kilometrageSortie: string; carburantSortie: string; recuperateur: string; signature: string; motifNonRepare: string; travauxNonRealises: string; observations: string; checklist: Array<{ libelle: string; ok: boolean }> }>({
    kilometrageSortie: "", carburantSortie: "", recuperateur: "", signature: "", motifNonRepare: "", travauxNonRealises: "", observations: "",
    checklist: [
      { libelle: "Outillage / accessoires vérifiés (vs entrée)", ok: false },
      { libelle: "Clés (nombre de jeux rendus)", ok: false },
      { libelle: "Documents du véhicule (carte grise, assurance…)", ok: false },
      { libelle: "Anciennes pièces remises si demandé", ok: false },
      { libelle: "Propreté OK", ok: false },
      { libelle: "Objets personnels remis", ok: false },
    ],
  });
  const sauverInspection = api.or.sauvegarderInspection.useMutation({
    onSuccess: () => { toast.success("Inspection DVI enregistrée"); invalidateAll(); setShowDvi(false); setDviPoints([]); },
    onError: (e) => toast.error(e.message),
  });
  const envoyerInspection = api.or.envoyerInspection.useMutation({ onSuccess: () => { toast.success("Inspection envoyée (figée)"); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const convertirPoints = api.or.convertirPointsEnLignes.useMutation({
    onSuccess: (r) => { toast.success(`${r.lignes} recommandation(s) converties en lignes de devis`); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });
  const creerVersion = api.or.creerVersionDevis.useMutation({ onSuccess: (r) => { toast.success(`Devis v${r.version} créé`); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const envoyerVersion = api.or.envoyerVersionDevis.useMutation({ onSuccess: () => { toast.success("Devis envoyé au client"); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const autoriser = api.or.autoriserLignes.useMutation({
    onSuccess: (r) => { toast.success(`Autorisation : ${r.autorises} autorisée(s), ${r.declines} déclinée(s), ${r.reportes} reportée(s)`); invalidateAll(); setAutorisationLignes({}); },
    onError: (e) => toast.error(e.message),
  });
  const validerQc = api.or.validerControleQualite.useMutation({ onSuccess: (r) => { toast.success(r.resultat === "VALIDE" ? "Contrôle qualité validé — prêt pour restitution" : "Contrôle rejeté — retour en travaux"); invalidateAll(); setShowQc(false); }, onError: (e) => toast.error(e.message) });
  const restituer = api.or.restituerVehicule.useMutation({ onSuccess: () => { toast.success("Véhicule restitué — dossier livré"); invalidateAll(); setShowRestitution(false); }, onError: (e) => toast.error(e.message) });

  return (
    <div className="space-y-4">
      {/* Diagnostic & devis */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Diagnostic & devis</h3>
          {canModifier && or.statut === "EN_ATTENTE_DIAGNOSTIC" && (
            <Button size="sm" variant="outline" onClick={() => setShowDiag(true)}>Soumettre le diagnostic</Button>
          )}
        </div>
        {rapport ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                statutRapport === "VALIDE" ? "bg-success/15 text-success-foreground" : statutRapport === "SOUMIS" ? "bg-sky-500/15 text-sky-400" : statutRapport === "RETOURNE" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
              }`}>{statutRapport}</span>
              <span className="text-xs text-muted-foreground">soumis le {rapport.dateSoumission ? new Date(rapport.dateSoumission).toLocaleString("fr-FR") : "—"}</span>
              {rapport.valideLe && <span className="text-xs text-success-foreground">validé le {new Date(rapport.valideLe).toLocaleString("fr-FR")}</span>}
            </div>
            <p><b>Constat :</b> {rapport.constat}</p>
            {rapport.cause && <p><b>Cause probable :</b> {rapport.cause}</p>}
            {rapport.commentaireValidateur && <p className="text-xs text-muted-foreground">Commentaire validateur : {rapport.commentaireValidateur}</p>}
            <div className="flex flex-wrap gap-2">
              {statutRapport === "SOUMIS" && canValider && (
                <>
                  <Button size="sm" onClick={() => validerDiag.mutate({ rapportId: rapport.id })}><Check size={13} /> Valider le diagnostic</Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmRenvoi(rapport.id)}>Renvoyer au technicien</Button>
                </>
              )}
              {statutRapport === "VALIDE" && canValider && (
                <Button size="sm" onClick={() => soumettreDevis.mutate({ orId: id })}>Soumettre le devis au client</Button>
              )}
              {or.statut === "EN_ATTENTE_VALIDATION" && canValider && (
                <>
                  <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90" onClick={() => validerDevis.mutate({ orId: id, accepte: true })}>
                    <Check size={13} /> Approuver le devis
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmRefus(true)}>Refuser le devis</Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun rapport de diagnostic. Le technicien qualifié soumet son constat, ses préconisations et les pièces nécessaires.</p>
        )}
      </div>

      {/* Inspection DVI (Digital Vehicle Inspection) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Inspection DVI (preuve visuelle)</h3>
          {canModifier && <Button size="sm" variant="outline" onClick={() => setShowDvi(true)}>Nouvelle inspection</Button>}
        </div>
        {(inspections ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune inspection. L'inspection multi-points avec photos sert de preuve visuelle pour l'autorisation client.</p>
        ) : (
          <div className="space-y-2">
            {(inspections ?? []).map((insp: any) => (
              <div key={insp.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${insp.statut === "ENVOYE" ? "bg-sky-500/15 text-sky-400" : "bg-muted text-muted-foreground"}`}>{insp.statut}</span>
                  <span className="font-semibold">{insp.titre}</span>
                  {insp.statut !== "ENVOYE" && canModifier && <Button size="sm" variant="outline" className="ml-auto h-6 px-2 text-[10px]" onClick={() => envoyerInspection.mutate({ inspectionId: insp.id })}>Envoyer (figer)</Button>}
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {(insp.points ?? []).map((p: any) => (
                    <div key={p.id} className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${p.statut === "URGENT" ? "bg-destructive/10 text-destructive" : p.statut === "DEFECTUEUX" ? "bg-orange-500/10 text-orange-600" : p.statut === "SURVEILLER" ? "bg-warning/10 text-warning-foreground" : ""}`}>
                      <span className={`size-2 shrink-0 rounded-full ${p.statut === "OK" ? "bg-success" : p.statut === "SURVEILLER" ? "bg-warning" : p.statut === "URGENT" ? "bg-destructive" : p.statut === "DEFECTUEUX" ? "bg-orange-500" : "bg-muted"}`} />
                      <span className="font-semibold">[{p.groupe}]</span> {p.libelle}
                      {p.mesure && <span className="font-mono text-[10px] text-muted-foreground">· {p.mesure}</span>}
                      {p.notes && <span className="text-muted-foreground">· {p.notes}</span>}
                    </div>
                  ))}
                </div>
                {insp.statut === "BROUILLON" && (insp.points ?? []).some((p: any) => p.statut === "DEFECTUEUX" || p.statut === "URGENT") && canModifier && (
                  <Button size="sm" variant="outline" className="mt-2 h-6 px-2 text-[10px]" onClick={() => convertirPoints.mutate({ orId: id, pointIds: (insp.points ?? []).filter((p: any) => p.statut === "DEFECTUEUX" || p.statut === "URGENT").map((p: any) => p.id), prixUnitaire: 0 })}>
                    Convertir les défauts en lignes de devis
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Devis : versions + autorisation ligne par ligne */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Devis (versions) & autorisation ligne par ligne</h3>
          <div className="flex gap-2">
            {canModifier && <Button size="sm" variant="outline" onClick={() => creerVersion.mutate({ orId: id })}>Créer une version</Button>}
            {(devisVersions ?? []).length > 0 && canValider && (or.statut === "EN_ATTENTE_VALIDATION" || (devisVersions ?? []).some((v: any) => v.statut === "BROUILLON")) && (
              <Button size="sm" variant="outline" onClick={() => envoyerVersion.mutate({ devisVersionId: (devisVersions ?? []).find((v: any) => v.statut !== "ENVOYE" && v.statut !== "AUTORISE_TOTAL" && v.statut !== "AUTORISE_PARTIEL" && v.statut !== "REFUSE")?.id ?? (devisVersions ?? [])[0].id })}>
                Envoyer la version
              </Button>
            )}
          </div>
        </div>
        {(devisVersions ?? []).length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {(devisVersions ?? []).map((v: any) => (
              <span key={v.id} className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${v.statut === "AUTORISE_TOTAL" ? "bg-success/15 text-success-foreground" : v.statut === "AUTORISE_PARTIEL" ? "bg-warning/15 text-warning-foreground" : v.statut === "REFUSE" ? "bg-destructive/15 text-destructive" : v.statut === "ENVOYE" ? "bg-sky-500/15 text-sky-400" : "bg-muted text-muted-foreground"}`}>
                v{v.version} — {v.statut} — {Number(v.montantTTC).toLocaleString("fr-FR")} F
              </span>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          {((or.lignes ?? []) as any[]).map((l: any) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-1.5 text-xs">
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${l.statutAutorisation === "AUTORISE" ? "bg-success/15 text-success-foreground" : l.statutAutorisation === "DECLINE" ? "bg-destructive/15 text-destructive" : l.statutAutorisation === "REPORTE" ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground"}`}>{l.statutAutorisation}</span>
              <span className={`font-semibold ${l.statutAutorisation === "DECLINE" ? "line-through opacity-60" : ""}`}>{l.libelle}</span>
              <span className="font-mono text-muted-foreground">{Number(l.quantite)} × {Number(l.prixUnitaire).toLocaleString("fr-FR")} F</span>
              <span className="text-[10px] text-muted-foreground">· {l.origine}</span>
              {l.statutAutorisation === "DECLINE" && <span className="text-[10px] italic text-muted-foreground">travail décliné (conservé dans l'historique)</span>}
              {canValider && or.statut === "EN_ATTENTE_VALIDATION" && (
                <select
                  value={autorisationLignes[l.id] ?? ""}
                  onChange={(e) => setAutorisationLignes({ ...autorisationLignes, [l.id]: e.target.value })}
                  className="ml-auto h-7 rounded border border-border bg-background px-2 text-[11px]"
                >
                  <option value="">— autoriser —</option>
                  <option value="AUTORISE">Autoriser</option>
                  <option value="DECLINE">Décliner</option>
                  <option value="REPORTE">Reporter</option>
                </select>
              )}
            </div>
          ))}
        </div>
        {canValider && or.statut === "EN_ATTENTE_VALIDATION" && Object.keys(autorisationLignes).length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <select value={methodeAutorisation} onChange={(e) => setMethodeAutorisation(e.target.value)} className="h-8 rounded border border-border bg-background px-2 text-xs">
              {["ORAL", "SIGNATURE", "SMS", "WEB", "EMAIL"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input value={quiAutorisation} onChange={(e) => setQuiAutorisation(e.target.value)} placeholder="Qui a autorisé (client) ?" className="h-8 w-52 rounded border border-border bg-background px-2 text-xs" />
            <Button size="sm" onClick={() => autoriser.mutate({ orId: id, devisVersionId: ((devisVersions ?? []) as any[])[0]?.id, lignes: Object.entries(autorisationLignes).map(([ligneId, statut]) => ({ ligneId: Number(ligneId), statut: statut as any })), methode: methodeAutorisation as any, qui: quiAutorisation || undefined })}>
              Enregistrer l'autorisation
            </Button>
          </div>
        )}
        {(autorisations ?? []).length > 0 && (
          <div className="mt-2 text-[10px] text-muted-foreground">
            Historique des autorisations : {(autorisations ?? []).slice(0, 6).map((a: any) => `${a.libelle} → ${a.statut} (${a.methode}${a.qui ? `, ${a.qui}` : ""})`).join(" · ")}
          </div>
        )}
      </div>

      {/* Contrôle qualité */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Contrôle qualité (QC)</h3>
          {canModifier && (or.statut === "EN_COURS" || or.statut === "CONTROLE_QUALITE") && <Button size="sm" variant="outline" onClick={() => setShowQc(true)}>Saisir le contrôle</Button>}
        </div>
        {(controles ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun contrôle. Un véhicule ne doit pas être restitué sans contrôle qualité formalisé.</p>
        ) : (
          <div className="space-y-1">
            {(controles ?? []).map((qc: any) => (
              <div key={qc.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-1.5 text-xs">
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${qc.resultat === "VALIDE" ? "bg-success/15 text-success-foreground" : "bg-destructive/15 text-destructive"}`}>{qc.resultat}</span>
                <span className="ml-1">contrôle du {new Date(qc.dateControle).toLocaleString("fr-FR")}{qc.essaiRoutier ? " · essai routier" : ""}</span>
                {qc.observations && <span className="text-muted-foreground"> · {qc.observations}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restitution (handover) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Restitution du véhicule</h3>
          {canModifier && or.statut === "PRET_A_LIVRER" && <Button size="sm" variant="outline" onClick={() => setShowRestitution(true)}>Restituer le véhicule</Button>}
        </div>
        {(restitutions ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune restitution. La check-list de sortie (km, carburant, outillage, clés, documents) et la signature client sont obligatoires.</p>
        ) : (
          <div className="space-y-1">
            {(restitutions ?? []).map((r: any) => (
              <div key={r.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-1.5 text-xs">
                <span className="font-semibold">{r.recuperateurNom}</span> · km sortie <b className="font-mono">{r.kilometrageSortie}</b>{r.niveauCarburantSortie ? ` · carburant ${r.niveauCarburantSortie}` : ""}
                {r.motifNonRepare && <span className="ml-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">NON RÉPARÉ — {r.motifNonRepare}</span>}
                <span className="block text-[10px] text-muted-foreground">signé par {r.signatureClient} le {new Date(r.dateRestitution).toLocaleString("fr-FR")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Demandes de pièces au magasin */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Demandes de pièces (magasin)</h3>
          {canModifier && (
            <Button size="sm" variant="outline" onClick={() => setShowDemande(true)}>Nouvelle demande</Button>
          )}
        </div>
        {dem.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune demande. Les pièces préconisées au diagnostic sont demandées au magasin ici.</p>
        ) : (
          <div className="space-y-2">
            {dem.map((d: any) => (
              <div key={d.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Demande #{d.id}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                      d.statut === "SERVIE" ? "bg-success/15 text-success-foreground" : d.statut === "MANQUANTE" ? "bg-destructive/15 text-destructive" : d.statut === "PARTIELLE" ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground"
                    }`}>{d.statut}</span>
                    <span className="text-xs text-muted-foreground">{d.demandeurPrenom} {d.demandeurNom} · {new Date(d.createdAt).toLocaleDateString("fr-FR")}</span>
                  </div>
                </div>
                <div className="mt-1.5 space-y-1">
                  {d.lignes.map((l: any) => (
                    <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate">
                        {l.titre ?? `#${l.produitId}`}
                        <span className="ml-1 text-muted-foreground">× {l.quantite}{Number(l.quantiteServie) > 0 && ` (servi ${l.quantiteServie})`}</span>
                        {l.manquant && <span className="ml-1 font-bold text-destructive">⛔ {l.motifManquant ?? "manquant"}</span>}
                      </span>
                      {canServir && d.statut !== "SERVIE" && d.statut !== "ANNULEE" && (
                        <span className="flex items-center gap-1">
                          {!l.manquant && Number(l.quantiteServie) < Number(l.quantite) && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => traiterDemande.mutate({ demandeId: d.id, actions: [{ ligneId: l.id, servir: true }] })}>
                              Servir
                            </Button>
                          )}
                          {!l.manquant && (
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-destructive" onClick={() => traiterDemande.mutate({ demandeId: d.id, actions: [{ ligneId: l.id, servir: false, motifManquant: "Indisponible en stock" }] })}>
                              Manquant
                            </Button>
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commandes fournisseur liées à l'OR */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Commandes fournisseur (traçabilité OR)</h3>
          {canModifier && (
            <Button size="sm" variant="outline" onClick={() => setShowCmd(true)}>Commander au fournisseur</Button>
          )}
        </div>
        {cmd.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune commande liée à cet OR. Une pièce manquante en stock se commande ici, liée au véhicule.</p>
        ) : (
          <div className="space-y-2">
            {cmd.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <div>
                  <span className="font-mono text-xs font-bold">{c.reference}</span>
                  <span className="ml-2">{c.fournisseurNom}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                    c.statut === "recu" ? "bg-success/15 text-success-foreground" : c.statut === "commande" ? "bg-sky-500/15 text-sky-400" : c.statut === "annulee" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
                  }`}>{c.statut}</span>
                </div>
                <span className="font-mono text-xs">{Number(c.totalTTC ?? 0).toLocaleString("fr-FR")} F{c.livraisonAttendue ? ` · livraison ${c.livraisonAttendue}` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Retours fournisseur (pièces défaillantes / non conformes) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Retours fournisseur</h3>
          {canServir && (
            <Button size="sm" variant="outline" onClick={() => setShowRetour(true)}>Retourner une pièce</Button>
          )}
        </div>
        {ret.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun retour. Une pièce défaillante ou non conforme est renvoyée au fournisseur ici, en attendant le remplacement.</p>
        ) : (
          <div className="space-y-2">
            {ret.map((r: any) => (
              <div key={r.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Retour #{r.id}</span>
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[9px] font-black uppercase text-destructive">{r.motif}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                      r.statut === "CLOTURE" ? "bg-muted text-muted-foreground" : r.statut === "REMPLACE" ? "bg-success/15 text-success-foreground" : "bg-warning/15 text-warning-foreground"
                    }`}>{r.statut}</span>
                    <span className="text-xs text-muted-foreground">{r.fournisseurNom ?? "—"}</span>
                  </div>
                  {canServir && r.statut === "RETOURNE" && (
                    <span className="flex gap-1">
                      <Button size="sm" className="h-6 text-[10px]" onClick={() => remplacerRetour.mutate({ retourId: r.id })}>Reçu le remplacement</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => cloturerRetour.mutate({ retourId: r.id })}>Clôturer</Button>
                    </span>
                  )}
                  {canServir && r.statut === "REMPLACE" && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => cloturerRetour.mutate({ retourId: r.id })}>Clôturer</Button>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {(r.lignes ?? []).map((l: any) => `${l.titre ?? l.libelle ?? `#${l.produitId}`} ×${l.quantite}`).join(" · ")}
                  {r.commentaire && <span className="ml-1">— {r.commentaire}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal : soumettre le diagnostic */}
      {showDiag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowDiag(false)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-foreground">Rapport de diagnostic</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Constat / symptômes confirmés *</Label>
                <textarea rows={2} value={diagForm.constat} onChange={(e) => setDiagForm({ ...diagForm, constat: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Cause probable</Label>
                <textarea rows={1} value={diagForm.cause} onChange={(e) => setDiagForm({ ...diagForm, cause: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Préconisations (travaux & pièces nécessaires) *</div>
                <div className="space-y-2">
                  {diagForm.lignes.map((l, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2">
                      <select value={l.type} onChange={(e) => { const lignes = [...diagForm.lignes]; lignes[i] = { ...l, type: e.target.value }; setDiagForm({ ...diagForm, lignes }); }} className="col-span-2 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                        <option value="PIECE">Pièce</option>
                        <option value="SERVICE">Main-d'œuvre</option>
                      </select>
                      <select value={l.produitId} onChange={(e) => { const lignes = [...diagForm.lignes]; lignes[i] = { ...l, produitId: Number(e.target.value) }; setDiagForm({ ...diagForm, lignes }); }} className="col-span-4 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                        <option value={0}>Article (optionnel)</option>
                        {produitsList.map((p: any) => <option key={p.id} value={p.id} className="bg-background">{p.titre}</option>)}
                      </select>
                      <input value={l.libelle} onChange={(e) => { const lignes = [...diagForm.lignes]; lignes[i] = { ...l, libelle: e.target.value }; setDiagForm({ ...diagForm, lignes }); }} placeholder="Libellé *" className="col-span-3 h-9 rounded-lg border border-border bg-accent/30 px-2 text-xs text-foreground outline-none" />
                      <input type="number" min={1} value={l.quantite} onChange={(e) => { const lignes = [...diagForm.lignes]; lignes[i] = { ...l, quantite: Number(e.target.value) }; setDiagForm({ ...diagForm, lignes }); }} className="col-span-1 h-9 rounded-lg border border-border bg-accent/30 px-2 text-xs text-foreground outline-none" />
                      <input type="number" min={0} value={l.prixUnitaire} onChange={(e) => { const lignes = [...diagForm.lignes]; lignes[i] = { ...l, prixUnitaire: Number(e.target.value) }; setDiagForm({ ...diagForm, lignes }); }} placeholder="PU" className="col-span-2 h-9 rounded-lg border border-border bg-accent/30 px-2 text-xs text-foreground outline-none" />
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setDiagForm({ ...diagForm, lignes: [...diagForm.lignes, { type: "PIECE", libelle: "", produitId: 0, quantite: 1, prixUnitaire: 0 }] })}>+ Ligne</Button>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDiag(false)}>Annuler</Button>
              <Button
                disabled={creerRapport.isPending || diagForm.constat.trim().length < 3 || diagForm.lignes.some((l) => !l.libelle.trim())}
                onClick={() => creerRapport.mutate({ orId: id, constat: diagForm.constat, cause: diagForm.cause || undefined, lignes: diagForm.lignes.map((l) => ({ type: l.type as any, produitId: l.produitId || undefined, libelle: l.libelle, quantite: l.quantite, prixUnitaire: l.prixUnitaire })) })}
              >
                Soumettre pour validation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : nouvelle demande de pièces */}
      {showDemande && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowDemande(false)}>
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-foreground">Demande de pièces au magasin</h3>
            <div className="space-y-2">
              {demandeForm.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <select value={l.produitId} onChange={(e) => { const lignes = [...demandeForm]; lignes[i] = { ...l, produitId: Number(e.target.value) }; setDemandeForm(lignes); }} className="col-span-7 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                    <option value={0}>Article *</option>
                    {produitsList.map((p: any) => <option key={p.id} value={p.id} className="bg-background">{p.titre}</option>)}
                  </select>
                  <input type="number" min={1} value={l.quantite} onChange={(e) => { const lignes = [...demandeForm]; lignes[i] = { ...l, quantite: Number(e.target.value) }; setDemandeForm(lignes); }} className="col-span-2 h-9 rounded-lg border border-border bg-accent/30 px-2 text-xs text-foreground outline-none" />
                  <input value={l.note} onChange={(e) => { const lignes = [...demandeForm]; lignes[i] = { ...l, note: e.target.value }; setDemandeForm(lignes); }} placeholder="Note" className="col-span-3 h-9 rounded-lg border border-border bg-accent/30 px-2 text-xs text-foreground outline-none" />
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setDemandeForm([...demandeForm, { produitId: 0, quantite: 1, note: "" }])}>+ Ligne</Button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDemande(false)}>Annuler</Button>
              <Button
                disabled={creerDemande.isPending || demandeForm.some((l) => !l.produitId)}
                onClick={() => creerDemande.mutate({ orId: id, lignes: demandeForm.map((l) => ({ produitId: l.produitId, quantite: l.quantite, note: l.note || undefined })) })}
              >
                Envoyer au magasin
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : commande fournisseur */}
      {showCmd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowCmd(false)}>
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-foreground">Commande fournisseur (liée à l'OR)</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Fournisseur *</Label>
                <select value={cmdForm.fournisseurId} onChange={(e) => setCmdForm({ ...cmdForm, fournisseurId: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value={0}>Sélectionner…</option>
                  {fournisseursList.map((f: any) => <option key={f.id} value={f.id} className="bg-background">{f.nom}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                {cmdForm.lignes.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2">
                    <select value={l.produitId} onChange={(e) => { const lignes = [...cmdForm.lignes]; lignes[i] = { ...l, produitId: Number(e.target.value) }; setCmdForm({ ...cmdForm, lignes }); }} className="col-span-6 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                      <option value={0}>Article *</option>
                      {produitsList.map((p: any) => <option key={p.id} value={p.id} className="bg-background">{p.titre}</option>)}
                    </select>
                    <input type="number" min={1} value={l.quantite} onChange={(e) => { const lignes = [...cmdForm.lignes]; lignes[i] = { ...l, quantite: Number(e.target.value) }; setCmdForm({ ...cmdForm, lignes }); }} className="col-span-2 h-9 rounded-lg border border-border bg-accent/30 px-2 text-xs text-foreground outline-none" />
                    <input type="number" min={0} value={l.prixUnitaire} onChange={(e) => { const lignes = [...cmdForm.lignes]; lignes[i] = { ...l, prixUnitaire: Number(e.target.value) }; setCmdForm({ ...cmdForm, lignes }); }} placeholder="PU" className="col-span-4 h-9 rounded-lg border border-border bg-accent/30 px-2 text-xs text-foreground outline-none" />
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setCmdForm({ ...cmdForm, lignes: [...cmdForm.lignes, { produitId: 0, quantite: 1, prixUnitaire: 0 }] })}>+ Ligne</Button>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Livraison attendue</Label>
                <Input type="date" className="mt-1" value={cmdForm.livraisonAttendue} onChange={(e) => setCmdForm({ ...cmdForm, livraisonAttendue: e.target.value })} />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCmd(false)}>Annuler</Button>
              <Button
                disabled={creerCmd.isPending || !cmdForm.fournisseurId || cmdForm.lignes.some((l) => !l.produitId)}
                onClick={() => creerCmd.mutate({ orId: id, fournisseurId: cmdForm.fournisseurId, livraisonAttendue: cmdForm.livraisonAttendue || undefined, lignes: cmdForm.lignes.map((l) => ({ produitId: l.produitId, quantite: l.quantite, prixUnitaire: l.prixUnitaire })) })}
              >
                Passer la commande
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : retour fournisseur */}
      {showRetour && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowRetour(false)}>
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-foreground">Retour fournisseur (pièce défaillante / non conforme)</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Fournisseur</Label>
                  <select value={retourForm.fournisseurId} onChange={(e) => setRetourForm({ ...retourForm, fournisseurId: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value={0}>—</option>
                    {fournisseursList.map((f: any) => <option key={f.id} value={f.id} className="bg-background">{f.nom}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Motif</Label>
                  <select value={retourForm.motif} onChange={(e) => setRetourForm({ ...retourForm, motif: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="DEFAILLANTE">Pièce défaillante</option>
                    <option value="NON_CONFORME">Non conforme</option>
                    <option value="ERREUR_COMMANDE">Erreur de commande</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                {retourForm.lignes.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2">
                    <select value={l.produitId} onChange={(e) => { const lignes = [...retourForm.lignes]; lignes[i] = { ...l, produitId: Number(e.target.value) }; setRetourForm({ ...retourForm, lignes }); }} className="col-span-7 h-9 rounded-lg border border-border bg-background px-2 text-xs">
                      <option value={0}>Article (optionnel)</option>
                      {produitsList.map((p: any) => <option key={p.id} value={p.id} className="bg-background">{p.titre}</option>)}
                    </select>
                    <input type="number" min={1} value={l.quantite} onChange={(e) => { const lignes = [...retourForm.lignes]; lignes[i] = { ...l, quantite: Number(e.target.value) }; setRetourForm({ ...retourForm, lignes }); }} className="col-span-2 h-9 rounded-lg border border-border bg-accent/30 px-2 text-xs text-foreground outline-none" />
                    <input value={l.note} onChange={(e) => { const lignes = [...retourForm.lignes]; lignes[i] = { ...l, note: e.target.value }; setRetourForm({ ...retourForm, lignes }); }} placeholder="Note" className="col-span-3 h-9 rounded-lg border border-border bg-accent/30 px-2 text-xs text-foreground outline-none" />
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setRetourForm({ ...retourForm, lignes: [...retourForm.lignes, { produitId: 0, quantite: 1, note: "" }] })}>+ Ligne</Button>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Commentaire</Label>
                <Input className="mt-1" value={retourForm.commentaire} onChange={(e) => setRetourForm({ ...retourForm, commentaire: e.target.value })} />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRetour(false)}>Annuler</Button>
              <Button
                disabled={creerRetour.isPending || retourForm.lignes.some((l) => !l.produitId && !l.note)}
                onClick={() => creerRetour.mutate({ orId: id, fournisseurId: retourForm.fournisseurId || undefined, motif: retourForm.motif as any, commentaire: retourForm.commentaire || undefined, lignes: retourForm.lignes.map((l) => ({ produitId: l.produitId || undefined, quantite: l.quantite, note: l.note || undefined })) })}
              >
                Enregistrer le retour
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : renvoi diagnostic */}
      {confirmRenvoi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setConfirmRenvoi(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground">Renvoyer le diagnostic au technicien</h3>
            <input value={renvoiMotif} onChange={(e) => setRenvoiMotif(e.target.value)} placeholder="Motif du renvoi *" className="mt-3 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmRenvoi(null)}>Annuler</Button>
              <Button disabled={renvoiMotif.trim().length < 3} onClick={() => renvoyerDiag.mutate({ rapportId: Number(confirmRenvoi), commentaire: renvoiMotif.trim() })}>Renvoyer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : refus devis */}
      {confirmRefus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setConfirmRefus(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground">Refuser le devis (client)</h3>
            <input value={refusMotif} onChange={(e) => setRefusMotif(e.target.value)} placeholder="Motif du refus *" className="mt-3 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmRefus(false)}>Annuler</Button>
              <Button className="bg-destructive text-destructive-foreground" disabled={refusMotif.trim().length < 3} onClick={() => validerDevis.mutate({ orId: id, accepte: false, motif: refusMotif.trim() })}>Refuser</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : nouvelle inspection DVI */}
      {showDvi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowDvi(false)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold text-foreground">Inspection DVI — ajouter des points</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <select value={dviForm.groupe} onChange={(e) => setDviForm({ ...dviForm, groupe: e.target.value })} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
                {["Extérieur", "Moteur", "Habitacle", "Freinage", "Pneumatiques", "Suspension", "Éclairage", "Autre"].map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <input value={dviForm.libelle} onChange={(e) => setDviForm({ ...dviForm, libelle: e.target.value })} placeholder="Point inspecté *" className="h-9 rounded-lg border border-border bg-background px-2 text-sm" />
              <select value={dviForm.statut} onChange={(e) => setDviForm({ ...dviForm, statut: e.target.value })} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
                {["OK", "SURVEILLER", "DEFECTUEUX", "URGENT", "NON_INSPECTE"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="flex gap-2">
                <input value={dviForm.mesure} onChange={(e) => setDviForm({ ...dviForm, mesure: e.target.value })} placeholder="Mesure" className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm" />
                <Button size="icon" className="h-9 w-9 shrink-0" onClick={() => { if (!dviForm.libelle.trim()) return; setDviPoints([...dviPoints, { ...dviForm, libelle: dviForm.libelle.trim() }]); setDviForm({ groupe: dviForm.groupe, libelle: "", statut: "OK", mesure: "", notes: "", priorite: "CONSEIL" }); }}><Plus className="size-4" /></Button>
              </div>
            </div>
            {dviPoints.length > 0 && (
              <div className="mt-3 space-y-1">
                {dviPoints.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-1.5 text-xs">
                    <span className={`size-2 shrink-0 rounded-full ${p.statut === "OK" ? "bg-success" : p.statut === "SURVEILLER" ? "bg-warning" : p.statut === "URGENT" ? "bg-destructive" : p.statut === "DEFECTUEUX" ? "bg-orange-500" : "bg-muted"}`} />
                    <span className="font-semibold">[{p.groupe}]</span> {p.libelle}{p.mesure ? ` — ${p.mesure}` : ""}
                    <Button size="sm" variant="ghost" className="ml-auto h-6 px-1" onClick={() => setDviPoints(dviPoints.filter((_, j) => j !== i))}><X className="size-3" /></Button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDvi(false)}>Annuler</Button>
              <Button disabled={dviPoints.length === 0 || sauverInspection.isPending} onClick={() => sauverInspection.mutate({ orId: id, template: "MULTI_POINTS", points: dviPoints as any })}>
                Enregistrer l'inspection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : contrôle qualité */}
      {showQc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowQc(false)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold text-foreground">Contrôle qualité</h3>
            <div className="space-y-1.5">
              {qcChecklist.map((c, i) => (
                <label key={i} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <input type="checkbox" checked={c.ok} onChange={(e) => setQcChecklist(qcChecklist.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)))} className="size-4 accent-primary" />
                  {c.libelle}
                </label>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={qcEssai} onChange={(e) => setQcEssai(e.target.checked)} className="size-4 accent-primary" /> Essai routier effectué</label>
            <input value={qcObservations} onChange={(e) => setQcObservations(e.target.value)} placeholder="Observations" className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowQc(false)}>Annuler</Button>
              <Button variant="destructive" className="mr-auto" onClick={() => validerQc.mutate({ orId: id, checklist: qcChecklist, essaiRoutier: qcEssai, observations: qcObservations || undefined, resultat: "REJETE" })}>Rejeter (retour travaux)</Button>
              <Button disabled={qcChecklist.some((c) => !c.ok)} onClick={() => validerQc.mutate({ orId: id, checklist: qcChecklist, essaiRoutier: qcEssai, observations: qcObservations || undefined, resultat: "VALIDE" })}>Valider le contrôle</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : restitution */}
      {showRestitution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowRestitution(false)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-bold text-foreground">Restitution du véhicule</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-muted-foreground">Kilométrage de sortie *</Label><Input type="number" value={restitForm.kilometrageSortie} onChange={(e) => setRestitForm({ ...restitForm, kilometrageSortie: e.target.value })} /></div>
              <div><Label className="text-xs text-muted-foreground">Niveau carburant</Label>
                <select value={restitForm.carburantSortie} onChange={(e) => setRestitForm({ ...restitForm, carburantSortie: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                  <option value="">—</option>{["vide", "1/4", "1/2", "3/4", "plein"].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div><Label className="text-xs text-muted-foreground">Récupérateur (si différent du propriétaire)</Label><Input value={restitForm.recuperateur} onChange={(e) => setRestitForm({ ...restitForm, recuperateur: e.target.value })} /></div>
              <div><Label className="text-xs text-muted-foreground">Signature client *</Label><Input value={restitForm.signature} onChange={(e) => setRestitForm({ ...restitForm, signature: e.target.value })} placeholder="Nom tapé" /></div>
            </div>
            <div className="mt-3 space-y-1.5">
              {restitForm.checklist.map((c, i) => (
                <label key={i} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                  <input type="checkbox" checked={c.ok} onChange={(e) => setRestitForm({ ...restitForm, checklist: restitForm.checklist.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)) })} className="size-4 accent-primary" />
                  {c.libelle}
                </label>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-muted-foreground">Motif si NON réparé</Label>
                <select value={restitForm.motifNonRepare} onChange={(e) => setRestitForm({ ...restitForm, motifNonRepare: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                  <option value="">Véhicule réparé</option>
                  {["REFUS_CLIENT", "PIECES_INDISPONIBLES", "ABANDON", "AUTRE"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div><Label className="text-xs text-muted-foreground">Travaux non réalisés</Label><Input value={restitForm.travauxNonRealises} onChange={(e) => setRestitForm({ ...restitForm, travauxNonRealises: e.target.value })} /></div>
            </div>
            <input value={restitForm.observations} onChange={(e) => setRestitForm({ ...restitForm, observations: e.target.value })} placeholder="Observations" className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRestitution(false)}>Annuler</Button>
              <Button disabled={!Number(restitForm.kilometrageSortie) || restitForm.signature.trim().length < 2 || restitForm.checklist.some((c) => !c.ok)} onClick={() => restituer.mutate({ orId: id, kilometrageSortie: Number(restitForm.kilometrageSortie), niveauCarburantSortie: restitForm.carburantSortie || undefined, checklist: restitForm.checklist, recuperateurNom: restitForm.recuperateur.trim() || restitForm.signature.trim(), signatureClient: restitForm.signature.trim(), observations: restitForm.observations || undefined, motifNonRepare: restitForm.motifNonRepare || undefined, travauxNonRealises: restitForm.travauxNonRealises || undefined })}>
                Restituer le véhicule
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
