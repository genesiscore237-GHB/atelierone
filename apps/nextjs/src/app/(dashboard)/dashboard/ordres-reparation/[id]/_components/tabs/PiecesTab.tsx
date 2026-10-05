"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Package, PackageOpen, Undo2, Loader2, Plus, Trash2, History, Boxes, ClipboardList,
  RefreshCw, UserRound, Truck, ArrowLeftRight, Lock, Send,
} from "lucide-react";
import { useOrPermissions } from "../../../_hooks/useOrPermissions";
import { SelectSearch } from "~/components/ui/select-search";

const MOTIFS_RETOUR = ["DEFAILLANTE", "NON_CONFORME", "ERREUR_COMMANDE"] as const;
const MOTIF_RETOUR_LABELS: Record<string, string> = {
  DEFAILLANTE: "Pièce défaillante",
  NON_CONFORME: "Non conforme",
  ERREUR_COMMANDE: "Erreur de commande",
};

/** Onglet 4 — Pièces : demandes, réservations, sorties, retours, cores, kits, pièces client, commandes. */
export function PiecesTab({ or }: { or: any }) {
  const id = Number(or.id);
  const utils = api.useUtils();
  const { flags } = useOrPermissions();
  const peutGererStock = flags.canPieces;

  const { data: produits } = api.catalog.list.useQuery({ limit: 200 });
  const produitsList = (produits?.items ?? []) as any[];
  const { data: fournisseurs } = api.reference.listFournisseurs.useQuery();
  const fournisseursList = (fournisseurs ?? []) as any[];
  const { data: demandes, refetch: refetchDemandes } = api.or.listerDemandesPieces.useQuery({ orId: id });
  const { data: commandes } = api.or.listerCommandesFournisseur.useQuery({ orId: id });
  const { data: retours, refetch: refetchRetours } = api.or.listerRetoursFournisseur.useQuery({ orId: id });
  const { data: cores } = api.stock.listerCores.useQuery({ orId: id });
  const { data: mvts } = api.stock.listMouvementsParOR.useQuery({ orId: id });
  const { data: piecesClient, refetch: refetchPC } = api.or.listerPiecesClient.useQuery({ orId: id });

  const invalidateAll = () => {
    utils.or.getById.invalidate();
    refetchDemandes();
    refetchRetours();
    refetchPC();
  };

  const optProduits = produitsList.map((p: any) => ({ value: p.id, label: `${p.codeArticle ?? ""} ${p.titre}`.trim(), hint: p.typeProduit }));
  const optFournisseurs = fournisseursList.map((f: any) => ({ value: f.id, label: f.nom }));

  // ─── Formulaires génériques stock ───
  const [stockForm, setStockForm] = useState({ produitId: 0, quantite: "1", motif: "" });
  const [reservationForm, setReservationForm] = useState({ produitId: 0, quantite: "1", motif: "" });
  const [coreForm, setCoreForm] = useState({ produitId: 0, quantite: "1", valeurCore: "", motif: "" });
  const [kitForm, setKitForm] = useState({ kitId: 0, quantite: "1", motif: "" });
  const [pcForm, setPcForm] = useState({ produitId: 0, libelle: "", quantite: "1", motif: "" });
  const [demandeForm, setDemandeForm] = useState<Array<{ produitId: number; quantite: string; note: string }>>([{ produitId: 0, quantite: "1", note: "" }]);
  const [showDemande, setShowDemande] = useState(false);
  const [cmdForm, setCmdForm] = useState<{ fournisseurId: number; livraisonAttendue: string; lignes: Array<{ produitId: number; quantite: string; prixUnitaire: string }> }>({ fournisseurId: 0, livraisonAttendue: "", lignes: [{ produitId: 0, quantite: "1", prixUnitaire: "" }] });
  const [showCmd, setShowCmd] = useState(false);
  const [retourForm, setRetourForm] = useState<{ fournisseurId: number; motif: string; impacteStock: boolean; lignes: Array<{ produitId: number; quantite: string; note: string }> }>({ fournisseurId: 0, motif: "DEFAILLANTE", impacteStock: false, lignes: [{ produitId: 0, quantite: "1", note: "" }] });
  const [showRetour, setShowRetour] = useState(false);

  const sortir = api.stock.sortirPourOR.useMutation({ onSuccess: (r: any) => { toast.success(`Pièce sortie (stock ${r.stockApres})`); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const retourner = api.stock.retourAtelier.useMutation({ onSuccess: (r: any) => { toast.success(`Pièce réintégrée (stock ${r.stockApres})`); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const reserver = api.stock.reserverStock.useMutation({ onSuccess: () => { toast.success("Réservation enregistrée"); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const liberer = api.stock.libererStock.useMutation({ onSuccess: () => { toast.success("Réservation libérée"); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const creerCore = api.stock.creerEchangeCore.useMutation({ onSuccess: () => { toast.success("Échange core enregistré"); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const retournerCoquille = api.stock.retournerCoquille.useMutation({ onSuccess: () => { toast.success("Coquille retournée"); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const sortirKit = api.stock.sortirKit.useMutation({ onSuccess: () => { toast.success("Kit sorti (composants décomposés)"); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const addPC = api.or.addPieceClient.useMutation({ onSuccess: () => { toast.success("Pièce client enregistrée"); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const remettrePC = api.or.remettrePieceClient.useMutation({ onSuccess: () => { toast.success("Pièce remise au client"); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const creerDemande = api.or.creerDemandePieces.useMutation({ onSuccess: () => { toast.success("Demande de pièces créée"); setShowDemande(false); setDemandeForm([{ produitId: 0, quantite: "1", note: "" }]); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const traiterDemande = api.or.traiterDemandePieces.useMutation({ onSuccess: () => { toast.success("Demande traitée"); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const creerCmd = api.or.creerCommandeFournisseur.useMutation({ onSuccess: (r: any) => { toast.success(`Commande ${r.reference} créée`); setShowCmd(false); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const creerRetour = api.or.creerRetourFournisseur.useMutation({ onSuccess: () => { toast.success("Retour fournisseur créé"); setShowRetour(false); invalidateAll(); }, onError: (e) => toast.error(e.message) });
  const cloturerRetour = api.or.cloturerRetour.useMutation({ onSuccess: () => { toast.success("Retour clôturé"); invalidateAll(); }, onError: (e) => toast.error(e.message) });

  const doSortir = () => {
    if (!stockForm.produitId) { toast.error("Produit requis"); return; }
    sortir.mutate({ orId: id, produitId: stockForm.produitId, quantite: Number(stockForm.quantite) || 1, motif: stockForm.motif || undefined });
  };
  const doRetourner = () => {
    if (!stockForm.produitId) { toast.error("Produit requis"); return; }
    retourner.mutate({ orId: id, produitId: stockForm.produitId, quantite: Number(stockForm.quantite) || 1, motif: stockForm.motif || undefined });
  };
  const doReserver = () => {
    if (!reservationForm.produitId) { toast.error("Produit requis"); return; }
    reserver.mutate({ orId: id, produitId: reservationForm.produitId, quantite: Number(reservationForm.quantite) || 1, motif: reservationForm.motif || undefined });
  };
  const doLiberer = () => {
    if (!reservationForm.produitId) { toast.error("Produit requis"); return; }
    liberer.mutate({ orId: id, produitId: reservationForm.produitId, quantite: Number(reservationForm.quantite) || 1, motif: reservationForm.motif || undefined });
  };
  const doCore = () => {
    if (!coreForm.produitId) { toast.error("Produit requis"); return; }
    creerCore.mutate({ orId: id, produitId: coreForm.produitId, quantite: Number(coreForm.quantite) || 1, valeurCore: Number(coreForm.valeurCore) || 0, motif: coreForm.motif || undefined });
  };
  const doKit = () => {
    if (!kitForm.kitId) { toast.error("Kit requis"); return; }
    sortirKit.mutate({ orId: id, kitId: kitForm.kitId, quantite: Number(kitForm.quantite) || 1, motif: kitForm.motif || undefined });
  };
  const doPC = () => {
    if (!pcForm.produitId && !pcForm.libelle.trim()) { toast.error("Produit ou désignation requis"); return; }
    addPC.mutate({ orId: id, produitId: pcForm.produitId || undefined, libelle: pcForm.libelle.trim() || undefined, quantite: Number(pcForm.quantite) || 1, motif: pcForm.motif || undefined });
  };
  const doDemande = () => {
    const lignes = demandeForm.filter((l) => l.produitId);
    if (lignes.length === 0) { toast.error("Ajoutez au moins un produit"); return; }
    creerDemande.mutate({ orId: id, lignes: lignes.map((l) => ({ produitId: l.produitId, quantite: Number(l.quantite) || 1, note: l.note || undefined })) });
  };
  const doCmd = () => {
    const lignes = cmdForm.lignes.filter((l) => l.produitId);
    if (!cmdForm.fournisseurId) { toast.error("Fournisseur requis"); return; }
    if (lignes.length === 0) { toast.error("Ajoutez au moins un produit"); return; }
    creerCmd.mutate({ orId: id, fournisseurId: cmdForm.fournisseurId, livraisonAttendue: cmdForm.livraisonAttendue || undefined, lignes: lignes.map((l) => ({ produitId: l.produitId, quantite: Number(l.quantite) || 1, prixUnitaire: Number(l.prixUnitaire) || 0 })) });
  };
  const doRetour = () => {
    const lignes = retourForm.lignes.filter((l) => l.produitId);
    if (lignes.length === 0) { toast.error("Ajoutez au moins un produit"); return; }
    creerRetour.mutate({ orId: id, fournisseurId: retourForm.fournisseurId || undefined, motif: retourForm.motif as any, impacteStock: retourForm.impacteStock, lignes: lignes.map((l) => ({ produitId: l.produitId, quantite: Number(l.quantite) || 1, note: l.note || undefined })) });
  };

  const kits = produitsList.filter((p: any) => (p.titre ?? "").toLowerCase().includes("kit") || (p.codeArticle ?? "").toLowerCase().includes("kit"));
  const optKits = kits.map((p: any) => ({ value: p.id, label: `${p.codeArticle ?? ""} ${p.titre}`.trim() }));
  const badgesDemande: Record<string, string> = {
    EN_ATTENTE: "bg-warning/10 text-warning-foreground", PARTIELLE: "bg-warning/10 text-warning-foreground",
    SERVIE: "bg-success/10 text-success-foreground", MANQUANTE: "bg-destructive/10 text-destructive", ANNULEE: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      {!peutGererStock && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <Lock size={13} /> Vous n'avez pas la permission de gérer le stock des OR — consultation seule.
        </p>
      )}

      {/* ─── Demandes de pièces ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <ClipboardList size={15} className="text-primary" /> Demandes de pièces (magasin)
          </h3>
          {peutGererStock && !showDemande && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setShowDemande(true)}>
              <Plus size={13} /> Créer une demande
            </Button>
          )}
        </div>
        {showDemande && (
          <div className="mb-3 space-y-2 rounded-lg border border-dashed border-border p-3">
            {demandeForm.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-1.5">
                <SelectSearch
                  value={l.produitId || null}
                  onChange={(v) => setDemandeForm(demandeForm.map((x, idx) => (idx === i ? { ...x, produitId: Number(v) } : x)))}
                  options={optProduits}
                  placeholder="Produit…"
                  searchPlaceholder="Code, désignation…"
                  size="sm"
                  className="col-span-6"
                />
                <input type="number" min={1} value={l.quantite} onChange={(e) => setDemandeForm(demandeForm.map((x, idx) => (idx === i ? { ...x, quantite: e.target.value } : x)))} placeholder="Qté" className="col-span-2 rounded border border-border bg-background px-1 py-1.5 text-xs" />
                <input value={l.note} onChange={(e) => setDemandeForm(demandeForm.map((x, idx) => (idx === i ? { ...x, note: e.target.value } : x)))} placeholder="Note" className="col-span-3 rounded border border-border bg-background px-2 py-1.5 text-xs" />
                <button type="button" className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive" onClick={() => setDemandeForm(demandeForm.filter((_, idx) => idx !== i))}><Trash2 size={13} /></button>
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setDemandeForm([...demandeForm, { produitId: 0, quantite: "1", note: "" }])} className="gap-1 text-xs"><Plus size={12} /> Ligne</Button>
              <Button size="sm" className="gap-1" disabled={creerDemande.isPending} onClick={doDemande}>
                {creerDemande.isPending ? <Loader2 className="size-3 animate-spin" /> : <Send size={12} />} Envoyer au magasin
              </Button>
            </div>
          </div>
        )}
        {(demandes ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune demande de pièces.</p>
        ) : (
          <div className="space-y-2">
            {(demandes ?? []).map((d: any) => (
              <div key={d.id} className="rounded-lg border border-border bg-background p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badgesDemande[d.statut] ?? "bg-muted text-muted-foreground"}`}>{d.statut}</span>
                  <span className="text-muted-foreground">{new Date(d.createdAt).toLocaleString("fr-FR")}</span>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {(d.lignes ?? []).map((l: any) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{l.produitTitre ?? l.produitLibelle}</span>
                      <span className="text-xs text-muted-foreground">×{l.quantite}{l.quantiteServie ? ` (servie ${l.quantiteServie})` : ""}</span>
                      {l.statutLigne && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${l.statutLigne === "SERVIE" ? "bg-success/10 text-success-foreground" : l.statutLigne === "MANQUANTE" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning-foreground"}`}>{l.statutLigne}</span>}
                      {flags.servirPieces && l.statutLigne !== "SERVIE" && (
                        <span className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-6 gap-0.5 px-2 text-[10px]" disabled={traiterDemande.isPending} onClick={() => traiterDemande.mutate({ demandeId: d.id, actions: [{ ligneId: l.id, servir: true, quantiteServie: Number(l.quantite) }] })}>
                            <PackageOpen size={11} /> Servir
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-destructive" disabled={traiterDemande.isPending} onClick={() => traiterDemande.mutate({ demandeId: d.id, actions: [{ ligneId: l.id, servir: false, motifManquant: "Rupture de stock" }] })}>
                            Manquant
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Sortie / Retour / Réservation ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Package size={15} className="text-primary" /> Sortie / Retour / Réservation
        </h3>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <Label className="text-xs text-muted-foreground">Produit</Label>
            <SelectSearch
              value={stockForm.produitId || null}
              onChange={(v) => setStockForm({ ...stockForm, produitId: Number(v) })}
              options={optProduits}
              placeholder="Produit…"
              searchPlaceholder="Code, désignation…"
              size="sm"
              className="mt-1"
              disabled={!peutGererStock}
            />
            <div className="flex gap-2">
              <Input type="number" min={1} value={stockForm.quantite} onChange={(e) => setStockForm({ ...stockForm, quantite: e.target.value })} className="w-20" disabled={!peutGererStock} />
              <Input value={stockForm.motif} onChange={(e) => setStockForm({ ...stockForm, motif: e.target.value })} placeholder="Motif" className="flex-1" disabled={!peutGererStock} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 gap-1 text-xs" disabled={!peutGererStock || sortir.isPending} onClick={doSortir}>
                {sortir.isPending ? <Loader2 className="size-3 animate-spin" /> : <PackageOpen size={12} />} Sortir
              </Button>
              <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" disabled={!peutGererStock || retourner.isPending} onClick={doRetourner}>
                <Undo2 size={12} /> Retour
              </Button>
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <Label className="text-xs text-muted-foreground">Réservation</Label>
            <SelectSearch
              value={reservationForm.produitId || null}
              onChange={(v) => setReservationForm({ ...reservationForm, produitId: Number(v) })}
              options={optProduits}
              placeholder="Produit…"
              searchPlaceholder="Code, désignation…"
              size="sm"
              className="mt-1"
              disabled={!peutGererStock}
            />
            <div className="flex gap-2">
              <Input type="number" min={1} value={reservationForm.quantite} onChange={(e) => setReservationForm({ ...reservationForm, quantite: e.target.value })} className="w-20" disabled={!peutGererStock} />
              <Input value={reservationForm.motif} onChange={(e) => setReservationForm({ ...reservationForm, motif: e.target.value })} placeholder="Motif" className="flex-1" disabled={!peutGererStock} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 gap-1 text-xs" disabled={!peutGererStock || reserver.isPending} onClick={doReserver}>
                <Boxes size={12} /> Réserver
              </Button>
              <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" disabled={!peutGererStock || liberer.isPending} onClick={doLiberer}>
                <RefreshCw size={12} /> Libérer
              </Button>
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <Label className="text-xs text-muted-foreground">Échange core (coquille)</Label>
            <SelectSearch
              value={coreForm.produitId || null}
              onChange={(v) => setCoreForm({ ...coreForm, produitId: Number(v) })}
              options={optProduits}
              placeholder="Produit…"
              searchPlaceholder="Code, désignation…"
              size="sm"
              className="mt-1"
              disabled={!peutGererStock}
            />
            <div className="flex gap-2">
              <Input type="number" min={1} value={coreForm.quantite} onChange={(e) => setCoreForm({ ...coreForm, quantite: e.target.value })} className="w-20" disabled={!peutGererStock} />
              <Input type="number" min={0} value={coreForm.valeurCore} onChange={(e) => setCoreForm({ ...coreForm, valeurCore: e.target.value })} placeholder="Valeur core" className="flex-1" disabled={!peutGererStock} />
            </div>
            <Button size="sm" className="w-full gap-1 text-xs" disabled={!peutGererStock || creerCore.isPending} onClick={doCore}>
              {creerCore.isPending ? <Loader2 className="size-3 animate-spin" /> : <ArrowLeftRight size={12} />} Enregistrer l'échange core
            </Button>
            {(cores ?? []).length > 0 && (
              <ul className="space-y-1 text-xs">
                {(cores ?? []).map((c: any) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
                    <span className="truncate">{c.produitTitre ?? "Core"}</span>
                    <span className="flex items-center gap-1">
                      <span className="text-muted-foreground">{c.statut}</span>
                      {flags.canPieces && c.statut !== "RETOURNEE" && c.statut !== "PERDUE" && (
                        <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px]" onClick={() => retournerCoquille.mutate({ echangeId: c.id })}>Retourner</Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Kits */}
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <Label className="text-xs text-muted-foreground">Sortie de kit (décomposition automatique)</Label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <SelectSearch
              value={kitForm.kitId || null}
              onChange={(v) => setKitForm({ ...kitForm, kitId: Number(v) })}
              options={optKits}
              placeholder="Kit…"
              searchPlaceholder="Rechercher un kit…"
              size="sm"
              className="min-w-56 flex-1"
              disabled={!peutGererStock}
            />
            <Input type="number" min={1} value={kitForm.quantite} onChange={(e) => setKitForm({ ...kitForm, quantite: e.target.value })} className="w-20" disabled={!peutGererStock} />
            <Button size="sm" variant="outline" className="gap-1 text-xs" disabled={!peutGererStock || sortirKit.isPending} onClick={doKit}>
              {sortirKit.isPending ? <Loader2 className="size-3 animate-spin" /> : <Package size={12} />} Sortir le kit
            </Button>
          </div>
        </div>

        {/* Pièces fournies par le client */}
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <Label className="text-xs text-muted-foreground">Pièce fournie par le client</Label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <SelectSearch
              value={pcForm.produitId || null}
              onChange={(v) => setPcForm({ ...pcForm, produitId: Number(v) })}
              options={optProduits}
              placeholder="Produit (ou libellé libre)…"
              searchPlaceholder="Code, désignation…"
              size="sm"
              className="min-w-44 flex-1"
              disabled={!peutGererStock}
            />
            <Input value={pcForm.libelle} onChange={(e) => setPcForm({ ...pcForm, libelle: e.target.value })} placeholder="Libellé libre" className="min-w-40 flex-1" disabled={!peutGererStock} />
            <Input type="number" min={1} value={pcForm.quantite} onChange={(e) => setPcForm({ ...pcForm, quantite: e.target.value })} className="w-20" disabled={!peutGererStock} />
            <Button size="sm" className="gap-1 text-xs" disabled={!peutGererStock || addPC.isPending} onClick={doPC}>
              {addPC.isPending ? <Loader2 className="size-3 animate-spin" /> : <UserRound size={12} />} Enregistrer
            </Button>
          </div>
          {(piecesClient ?? []).length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {(piecesClient ?? []).map((p: any) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
                  <span className="truncate">{p.libelle} ×{p.quantite}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">{p.remiseAuClient ? "remise" : "en stock atelier"}</span>
                    {flags.canPieces && !p.remiseAuClient && (
                      <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px]" onClick={() => remettrePC.mutate({ ligneId: p.id, orId: id })}>Remettre au client</Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ─── Commandes & retours fournisseur ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Truck size={15} className="text-primary" /> Commandes & retours fournisseur
          </h3>
          <div className="flex gap-2">
            {peutGererStock && (
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowCmd(true)}>
                <Plus size={12} /> Commande
              </Button>
            )}
            {peutGererStock && (
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowRetour(true)}>
                <Undo2 size={12} /> Retour
              </Button>
            )}
          </div>
        </div>

        {showCmd && (
          <div className="mb-3 space-y-2 rounded-lg border border-dashed border-border p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <SelectSearch
                value={cmdForm.fournisseurId || null}
                onChange={(v) => setCmdForm({ ...cmdForm, fournisseurId: Number(v) })}
                options={optFournisseurs}
                placeholder="Fournisseur…"
                searchPlaceholder="Rechercher…"
                size="sm"
              />
              <Input type="date" value={cmdForm.livraisonAttendue} onChange={(e) => setCmdForm({ ...cmdForm, livraisonAttendue: e.target.value })} />
            </div>
            {cmdForm.lignes.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-1.5">
                <SelectSearch
                  value={l.produitId || null}
                  onChange={(v) => setCmdForm({ ...cmdForm, lignes: cmdForm.lignes.map((x, idx) => (idx === i ? { ...x, produitId: Number(v) } : x)) })}
                  options={optProduits}
                  placeholder="Produit…"
                  searchPlaceholder="Code, désignation…"
                  size="sm"
                  className="col-span-7"
                />
                <input type="number" min={1} value={l.quantite} onChange={(e) => setCmdForm({ ...cmdForm, lignes: cmdForm.lignes.map((x, idx) => (idx === i ? { ...x, quantite: e.target.value } : x)) })} className="col-span-2 rounded border border-border bg-background px-1 py-1.5 text-xs" />
                <input type="number" min={0} value={l.prixUnitaire} onChange={(e) => setCmdForm({ ...cmdForm, lignes: cmdForm.lignes.map((x, idx) => (idx === i ? { ...x, prixUnitaire: e.target.value } : x)) })} className="col-span-2 rounded border border-border bg-background px-1 py-1.5 text-xs" />
                <button type="button" className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive" onClick={() => setCmdForm({ ...cmdForm, lignes: cmdForm.lignes.filter((_, idx) => idx !== i) })}><Trash2 size={13} /></button>
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setCmdForm({ ...cmdForm, lignes: [...cmdForm.lignes, { produitId: 0, quantite: "1", prixUnitaire: "" }] })} className="gap-1 text-xs"><Plus size={12} /> Ligne</Button>
              <Button size="sm" className="gap-1" disabled={creerCmd.isPending} onClick={doCmd}>
                {creerCmd.isPending ? <Loader2 className="size-3 animate-spin" /> : <Truck size={12} />} Créer la commande
              </Button>
            </div>
          </div>
        )}

        {showRetour && (
          <div className="mb-3 space-y-2 rounded-lg border border-dashed border-destructive/30 p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <select value={retourForm.motif} onChange={(e) => setRetourForm({ ...retourForm, motif: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {MOTIFS_RETOUR.map((m) => <option key={m} value={m}>{MOTIF_RETOUR_LABELS[m]}</option>)}
              </select>
              <SelectSearch
                value={retourForm.fournisseurId || null}
                onChange={(v) => setRetourForm({ ...retourForm, fournisseurId: Number(v) })}
                options={optFournisseurs}
                placeholder="Fournisseur (optionnel)…"
                searchPlaceholder="Rechercher…"
                size="sm"
              />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={retourForm.impacteStock} onChange={(e) => setRetourForm({ ...retourForm, impacteStock: e.target.checked })} className="size-4" />
                Sortir du stock (pièce reçue non montée)
              </label>
            </div>
            {retourForm.lignes.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-1.5">
                <SelectSearch
                  value={l.produitId || null}
                  onChange={(v) => setRetourForm({ ...retourForm, lignes: retourForm.lignes.map((x, idx) => (idx === i ? { ...x, produitId: Number(v) } : x)) })}
                  options={optProduits}
                  placeholder="Produit…"
                  searchPlaceholder="Code, désignation…"
                  size="sm"
                  className="col-span-7"
                />
                <input type="number" min={1} value={l.quantite} onChange={(e) => setRetourForm({ ...retourForm, lignes: retourForm.lignes.map((x, idx) => (idx === i ? { ...x, quantite: e.target.value } : x)) })} className="col-span-2 rounded border border-border bg-background px-1 py-1.5 text-xs" />
                <input value={l.note} onChange={(e) => setRetourForm({ ...retourForm, lignes: retourForm.lignes.map((x, idx) => (idx === i ? { ...x, note: e.target.value } : x)) })} placeholder="Note" className="col-span-2 rounded border border-border bg-background px-1 py-1.5 text-xs" />
                <button type="button" className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive" onClick={() => setRetourForm({ ...retourForm, lignes: retourForm.lignes.filter((_, idx) => idx !== i) })}><Trash2 size={13} /></button>
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setRetourForm({ ...retourForm, lignes: [...retourForm.lignes, { produitId: 0, quantite: "1", note: "" }] })} className="gap-1 text-xs"><Plus size={12} /> Ligne</Button>
              <Button size="sm" className="gap-1" disabled={creerRetour.isPending} onClick={doRetour}>
                {creerRetour.isPending ? <Loader2 className="size-3 animate-spin" /> : <Undo2 size={12} />} Créer le retour
              </Button>
            </div>
          </div>
        )}

        {(commandes ?? []).length === 0 && (retours ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune commande ni retour fournisseur pour cet OR.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              {(commandes ?? []).map((c: any) => (
                <div key={c.id} className="rounded-lg border border-border bg-background p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{c.reference ?? `Cmd #${c.id}`}</span>
                    <span className="text-muted-foreground">{c.fournisseurNom ?? ""}</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">Statut : {c.statut ?? "créée"}{c.livraisonAttendue ? ` · livraison ${c.livraisonAttendue}` : ""}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              {(retours ?? []).map((r: any) => (
                <div key={r.id} className="rounded-lg border border-border bg-background p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{MOTIF_RETOUR_LABELS[r.motif] ?? r.motif}</span>
                    <span className="text-muted-foreground">{r.fournisseurNom ?? ""}</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">Statut : {r.statut}</p>
                  {(r.statut === "EN_ATTENTE" || r.statut === "EN_COURS") && (
                    <div className="mt-1 flex gap-1">
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={cloturerRetour.isPending} onClick={() => cloturerRetour.mutate({ retourId: r.id })}>
                        Clôturer (remplacement / avoir)
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Mouvements de stock ─── */}
      {(mvts ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <History size={15} className="text-primary" /> Mouvements de stock liés à l'OR
          </h3>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {(mvts ?? []).map((m: any) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${m.type === "SORTIE_OR" ? "bg-destructive/10 text-destructive" : m.type === "RETOUR_ATELIER" ? "bg-success/10 text-success-foreground" : m.type === "RESERVATION" ? "bg-warning/10 text-warning-foreground" : "bg-muted text-muted-foreground"}`}>
                  {m.type}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.produitTitre ?? m.libelle}</span>
                <span>×{m.quantite}</span>
                {m.motif && <span className="text-muted-foreground">· {m.motif}</span>}
                <span className="text-[10px] text-muted-foreground">{new Date(m.createdAt ?? m.date).toLocaleString("fr-FR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}