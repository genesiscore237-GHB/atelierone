"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { ArrowLeftRight, Plus, Trash2, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type LigneTransfert = {
  produitId: string;
  produitTitre: string;
  uniteId: string;
  uniteCode: string;
  quantite: number;
  stockAvant: number;
};

export default function TransfertPage() {
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [lignes, setLignes] = useState<LigneTransfert[]>([]);
  const [produitSearch, setProduitSearch] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const utils = api.useUtils();
  const { data: rayons } = api.stock.listRayons.useQuery();
  const { data: produits } = api.catalog.listProducts.useQuery();
  const { data: allUnites } = api.reference.listUnitesMesure.useQuery();

  const mutation = api.stock.transferer.useMutation({
    onSuccess: () => {
      utils.stock.getDashboard.invalidate();
      setShowSuccess(true);
      setLignes([]);
      setProduitSearch("");
      setTimeout(() => setShowSuccess(false), 3000);
      toast.success("Transfert effectué");
    },
    onError: (e) => toast.error(e.message),
  });

  const produitsFiltres = produits?.filter(p =>
    p.titre?.toLowerCase().includes(produitSearch.toLowerCase()) && !lignes.some(l => l.produitId === p.id)
  ) ?? [];

  function ajouterLigne(produitId: string) {
    const p = produits?.find(p => p.id === produitId);
    if (!p) return;
    setLignes(prev => [...prev, {
      produitId,
      produitTitre: p.titre ?? "",
      uniteId: "",
      uniteCode: "",
      quantite: 1,
      stockAvant: 0,
    }]);
    setProduitSearch("");
  }

  function updateLigne(idx: number, updates: Partial<LigneTransfert>) {
    setLignes(prev => prev.map((l, i) => i === idx ? { ...l, ...updates } : l));
  }

  function supprimerLigne(idx: number) {
    setLignes(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleConfirm() {
    const promises = lignes.map(l =>
      mutation.mutateAsync({
        produitId: l.produitId,
        uniteId: l.uniteId,
        quantite: l.quantite,
        emplacementSourceId: Number(sourceId),
        emplacementCibleId: Number(destId),
      })
    );
    await Promise.all(promises);
  }

  const peutConfirmer = lignes.every(l => l.uniteId && l.quantite > 0) && sourceId && destId;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground dark:text-foreground">Transfert entre rayons</h2>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground">Déplacer des produits d'un rayon à un autre</p>
        </div>
      </div>

      {showSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-success/20 dark:bg-success/10 p-3 text-sm text-success-foreground dark:text-success-foreground">
          <CheckCircle size={16} /> Transfert effectué avec succès
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-4">
            <div className="flex items-center gap-3 mb-4">
              <ArrowLeftRight size={20} className="text-primary shrink-0" />
              <select
                className="flex-1 rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                <option value="">Rayon source</option>
                {rayons?.map(r => <option key={r.id} value={r.id}>{r.code} - {r.libelle}</option>)}
              </select>
              <ArrowLeftRight size={16} className="text-muted-foreground shrink-0" />
              <select
                className="flex-1 rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
              >
                <option value="">Rayon destination</option>
                {rayons?.filter(r => String(r.id) !== sourceId).map(r => <option key={r.id} value={r.id}>{r.code} - {r.libelle}</option>)}
              </select>
            </div>

            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Rechercher un produit à transférer..."
                className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted pl-10 pr-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                value={produitSearch}
                onChange={(e) => setProduitSearch(e.target.value)}
              />
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              {produitSearch && produitsFiltres.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted shadow-lg max-h-48 overflow-y-auto">
                  {produitsFiltres.slice(0, 10).map(p => (
                    <button
                      key={p.id}
                      className="w-full px-4 py-2 text-left text-sm text-foreground/80 dark:text-foreground/80 hover:bg-accent dark:hover:bg-accent"
                      onClick={() => ajouterLigne(p.id)}
                    >
                      {p.titre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {lignes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border dark:border-border bg-background dark:bg-card p-12 text-center">
              <ArrowLeftRight size={48} className="mx-auto mb-3 text-muted-foreground dark:text-muted-foreground" />
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">Ajoutez des produits à transférer</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted dark:bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Produit</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Unité</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Quantité</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-border">
                  {lignes.map((ligne, idx) => (
                    <tr key={idx} className="hover:bg-accent dark:hover:bg-accent/30">
                      <td className="px-4 py-3 text-sm font-medium text-foreground dark:text-foreground max-w-[200px] truncate">{ligne.produitTitre}</td>
                      <td className="px-4 py-3">
                        <select
                          className="w-32 rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-3 py-1.5 text-xs text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                          value={ligne.uniteId}
                          onChange={(e) => {
                            const u = allUnites?.find(u => u.id === e.target.value);
                            updateLigne(idx, { uniteId: e.target.value, uniteCode: u?.code ?? "" });
                          }}
                        >
                          <option value="">Unité</option>
                          {allUnites?.map(u => <option key={u.id} value={u.id}>{u.libelle} ({u.code})</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min={1}
                          className="w-20 rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-3 py-1.5 text-xs text-foreground dark:text-foreground text-right outline-none focus:ring-2 focus:ring-primary/30"
                          value={ligne.quantite || ""}
                          onChange={(e) => updateLigne(idx, { quantite: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/10 transition-colors"
                          onClick={() => supprimerLigne(idx)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-4">
            <h3 className="font-semibold text-foreground dark:text-foreground mb-3">Résumé</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground dark:text-muted-foreground">
                <span>Source</span>
                <span className="font-medium text-foreground dark:text-foreground">
                  {rayons?.find(r => String(r.id) === sourceId)?.code ?? "-"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground dark:text-muted-foreground">
                <span>Destination</span>
                <span className="font-medium text-foreground dark:text-foreground">
                  {rayons?.find(r => String(r.id) === destId)?.code ?? "-"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground dark:text-muted-foreground">
                <span>Produits</span>
                <span className="font-medium text-foreground dark:text-foreground">{lignes.length}</span>
              </div>
              <div className="flex justify-between text-muted-foreground dark:text-muted-foreground">
                <span>Total unités</span>
                <span className="font-medium text-foreground dark:text-foreground">
                  {lignes.reduce((s, l) => s + l.quantite, 0)}
                </span>
              </div>
            </div>
          </div>

          {!peutConfirmer && (
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 dark:bg-warning/5 p-3 text-xs text-warning-foreground dark:text-warning-foreground">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <p>Sélectionnez source, destination et remplissez les lignes</p>
            </div>
          )}

          <button
            className="w-full rounded-lg bg-gradient-to-r from-primary to-primary py-2.5 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 disabled:opacity-50 transition-colors"
            disabled={!peutConfirmer || mutation.isPending}
            onClick={async () => {
              try {
                await handleConfirm();
              } catch {}
            }}
          >
            {mutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-transparent" />
                Traitement...
              </span>
            ) : (
              "Confirmer le transfert"
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function SearchIcon({ className, size }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size ?? 16} height={size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}
