"use client";

import { useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { Sparkles, PackagePlus, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

type AchalandageRow = {
  produitId: string;
  titre: string;
  codeBarre: string;
  prixVente: string;
  cible: number;
  priorite: string;
  enRayon: number;
  enReserve: number;
  enStock: number;
  manquantRayon: number;
  manquantTotal: number;
  enRupture: boolean;
};

const PRIORITY_LABELS: Record<string, string> = {
  obligatoire: "Obligatoire",
  conseille: "Conseillé",
  facultatif: "Facultatif",
};

export function AchalandageTable({
  emplacementId,
  libelle,
  code,
  onClose,
}: {
  emplacementId: number;
  libelle: string;
  code: string;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const [lignes, setLignes] = useState<Record<string, number>>({});

  const { data, isLoading } = api.rayons.achalandage.useQuery({ emplacementId });
  const { data: allUnites } = api.reference.listUnitesMesure.useQuery();
  const [unites, setUnites] = useState<Record<string, string>>({});

  const mettreEnRayon = api.stock.mettreEnRayon.useMutation({
    onSuccess: () => {
      utils.rayons.achalandage.invalidate();
      utils.rayons.suivi.invalidate();
      utils.rayons.stats.invalidate();
      utils.stock.getDashboard.invalidate();
      toast.success("Mise en rayon effectuée");
    },
    onError: (e) => toast.error(e.message),
  });

  const resume = data?.resume;
  const lignesData = useMemo(() => data?.lignes ?? [], [data]);

  function quantitePour(l: AchalandageRow): number {
    const saisie = lignes[l.produitId];
    if (saisie != null && saisie > 0) return saisie;
    return Math.min(l.manquantRayon, l.enReserve);
  }

  function peutTransferer(l: AchalandageRow): boolean {
    const unite = unites[l.produitId];
    return Boolean(unite) && quantitePour(l) > 0 && l.enReserve > 0 && !mettreEnRayon.isPending;
  }

  async function transferer(l: AchalandageRow) {
    const unite = unites[l.produitId];
    const quantite = quantitePour(l);
    if (!unite || quantite <= 0) return;
    try {
      await mettreEnRayon.mutateAsync({
        produitId: l.produitId,
        uniteId: unite,
        quantite,
        emplacementRayonId: emplacementId,
      });
      setLignes((prev) => ({ ...prev, [l.produitId]: 0 }));
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Achalandage — {libelle}</h3>
              <p className="text-xs text-muted-foreground font-mono">{code}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>

        {resume && (
          <div className="grid grid-cols-2 gap-3 px-6 py-4 sm:grid-cols-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] text-muted-foreground">Produits requis</p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">{resume.requis}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] text-muted-foreground">En rayon</p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">{resume.enRayon}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] text-muted-foreground">Couverture</p>
              <p className={`mt-0.5 text-lg font-semibold ${resume.couverture >= 100 ? "text-emerald-600 dark:text-emerald-400" : resume.couverture >= 50 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>
                {Math.round(resume.couverture)}%
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] text-muted-foreground">Ruptures obligatoires</p>
              <p className={`mt-0.5 text-lg font-semibold ${resume.ruptures > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                {resume.ruptures}
              </p>
            </div>
          </div>
        )}

        <div className="max-h-[52vh] overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="space-y-2 py-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : lignesData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <CheckCircle2 className="size-10 text-emerald-500" />
              <p className="mt-3 text-sm font-medium text-foreground">Aucun produit requis pour cette classe</p>
              <p className="mt-1 text-xs text-muted-foreground">Aucun manuel n'est rattaché à cette étagère-classe.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Produit</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Cible</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">En rayon</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">En réserve</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Manquant</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Mise en rayon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lignesData.map((l: AchalandageRow) => (
                    <tr key={l.produitId} className={`hover:bg-accent/30 ${l.enRupture ? "bg-destructive/5" : ""}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground max-w-[240px]">{l.titre}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {PRIORITY_LABELS[l.priorite] ?? l.priorite}
                              {l.enRupture && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 text-destructive">
                                  <AlertTriangle className="size-2.5" /> rupture
                                </span>
                              )}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-foreground">{l.cible}</td>
                      <td className="px-3 py-2.5 text-right text-sm text-foreground">{l.enRayon}</td>
                      <td className="px-3 py-2.5 text-right text-sm text-foreground">{l.enReserve}</td>
                      <td className={`px-3 py-2.5 text-right text-sm font-semibold ${l.manquantRayon > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {l.manquantRayon > 0 ? l.manquantRayon : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {l.manquantRayon > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={Math.max(l.enReserve, 1)}
                              className="w-16 rounded-lg border border-border bg-muted/50 px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                              value={lignes[l.produitId] ?? Math.min(l.manquantRayon, l.enReserve)}
                              onChange={(e) => setLignes((prev) => ({ ...prev, [l.produitId]: Math.max(1, Number(e.target.value)) }))}
                            />
                            <select
                              className="w-28 rounded-lg border border-border bg-muted/50 px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                              value={unites[l.produitId] ?? ""}
                              onChange={(e) => setUnites((prev) => ({ ...prev, [l.produitId]: e.target.value }))}
                            >
                              <option value="">Unité</option>
                              {allUnites?.map((u) => <option key={u.id} value={u.id}>{u.libelle}</option>)}
                            </select>
                            <button
                              disabled={!peutTransferer(l)}
                              onClick={() => transferer(l)}
                              className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-primary to-primary px-2.5 py-1.5 text-xs font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 disabled:opacity-40 transition-colors"
                              title="Transférer réserve → rayon"
                            >
                              <PackagePlus className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">Complet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
