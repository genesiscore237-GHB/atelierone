"use client";

import { useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Search, Download, Coins, TrendingUp, AlertTriangle, Boxes, Filter, Check } from "lucide-react";

type SortKey = "marge" | "ca" | "quantite" | "cout" | "tauxMarge" | "nbVentes" | "stock" | "pertes";

const sortLabels: Record<SortKey, string> = {
  marge: "Marge",
  ca: "CA",
  quantite: "Qté",
  cout: "Coût",
  tauxMarge: "% Marge",
  nbVentes: "Ventes",
  stock: "Stock",
  pertes: "Pertes",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XAF", maximumFractionDigits: 0 }).format(amount);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-muted-foreground">—</span>;
  const up = delta >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${up ? "bg-success/10 text-success-foreground" : "bg-destructive/10 text-destructive"}`}>
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

const typePertesLabels: Record<string, string> = {
  REBUT: "Rebut",
  PEREMPTION: "Péremption",
  CASSE: "Casse",
  PERTE: "Perte",
  AUTRE: "Autre",
};

export default function ProduitsTab({ dateDebut, dateFin }: { dateDebut: string; dateFin: string }) {
  const [recherche, setRecherche] = useState("");
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [pickerOuvert, setPickerOuvert] = useState(false);
  const [pickerRecherche, setPickerRecherche] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("marge");
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);

  const produitIds = selection.size > 0 ? Array.from(selection) : undefined;

  const { data, isLoading, isError, refetch } = api.marge.getAnalyseProduits.useQuery({
    dateDebut,
    dateFin,
    produitIds,
    sortBy,
    limit: 50,
    offset,
  });

  const { data: catalogue, isLoading: catalogueLoading } = api.marge.getAnalyseProduits.useQuery({
    dateDebut,
    dateFin,
    sortBy: "ca",
    limit: 500,
    offset: 0,
  });

  const produits = data?.produits ?? [];
  const resume = data?.resume;
  const delta = data?.delta ?? null;

  const produitsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return produits;
    return produits.filter((p) =>
      p.titre.toLowerCase().includes(q) ||
      p.codeBarre.toLowerCase().includes(q) ||
      (p.typeProduit ?? "").toLowerCase().includes(q),
    );
  }, [produits, recherche]);

  const produitsDisponibles = useMemo(() => {
    const q = pickerRecherche.trim().toLowerCase();
    const all = catalogue?.produits ?? [];
    if (!q) return all;
    return all.filter((p) =>
      p.titre.toLowerCase().includes(q) ||
      p.codeBarre.toLowerCase().includes(q),
    );
  }, [catalogue, pickerRecherche]);

  function toggleSelection(id: number) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setOffset(0);
  }

  function handleExportCsv() {
    if (produitsFiltres.length === 0) {
      toast.error("Aucun produit à exporter");
      return;
    }
    setExporting(true);
    try {
      const header = ["Produit", "Code barre", "Type", "Qté", "CA", "Coût", "Marge", "% Marge", "Ventes", "Panier moy.", "Prix moy.", "Dernier prix", "Stock", "Valeur stock", "Retours (qté)", "Retours (montant)", "Marge retours", "Pertes", "Sous coût"];
      const lignes = produitsFiltres.map((p) => [
        p.titre, p.codeBarre, p.typeProduit ?? "", String(p.quantite), p.ca.toFixed(2), p.cout.toFixed(2),
        p.marge.toFixed(2), `${p.tauxMarge.toFixed(1)} %`, String(p.nbVentes), p.panierMoyen.toFixed(2),
        p.prixMoyen.toFixed(2), p.dernierPrixVente != null ? p.dernierPrixVente.toFixed(2) : "", String(p.stockQte),
        p.stockValeur.toFixed(2), String(p.retoursQte), p.retoursMontant.toFixed(2), p.margeRetours.toFixed(2),
        p.pertes.toFixed(2), p.sousCout.toFixed(2),
      ]);
      const csv = "\uFEFF" + [header, ...lignes]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analyse-produits-${dateDebut || "cumul"}_${dateFin || "aujourdhui"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${produitsFiltres.length} produits exportés`);
    } catch (e) {
      console.error("Export produits failed:", e);
      toast.error("Échec de l'export CSV");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Résumé */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><Coins size={14} /> Chiffre d'affaires</p>
          <p className="text-2xl font-bold text-foreground mt-1">{isLoading ? "..." : formatCurrency(resume?.ca ?? 0)}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">{resume?.quantite ?? 0} articles · {resume?.nbVentes ?? 0} ventes</span>
            <DeltaBadge delta={delta?.ca ?? null} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground">Coût des ventes</p>
          <p className="text-2xl font-bold text-foreground mt-1">{isLoading ? "..." : formatCurrency(resume?.cout ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><TrendingUp size={14} /> Marge brute</p>
          <p className={`text-2xl font-bold mt-1 ${(resume?.marge ?? 0) >= 0 ? "text-success-foreground" : "text-destructive"}`}>
            {isLoading ? "..." : formatCurrency(resume?.marge ?? 0)}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">Taux: {isLoading ? "..." : formatPercent(resume?.tauxMarge ?? 0)}</span>
            <DeltaBadge delta={delta?.marge ?? null} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground">Bénéfice net</p>
          <p className={`text-2xl font-bold mt-1 ${(resume?.beneficeNet ?? 0) >= 0 ? "text-success-foreground" : "text-destructive"}`}>
            {isLoading ? "..." : formatCurrency(resume?.beneficeNet ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            après {formatCurrency(resume?.margeRetours ?? 0)} retours et {formatCurrency(resume?.pertes ?? 0)} pertes
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><AlertTriangle size={14} /> Pertes</p>
          <p className={`text-2xl font-bold mt-1 ${(resume?.pertes ?? 0) > 0 ? "text-destructive" : "text-foreground"}`}>
            {isLoading ? "..." : formatCurrency(resume?.pertes ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><Boxes size={14} /> Stock (valeur)</p>
          <p className="text-2xl font-bold text-foreground mt-1">{isLoading ? "..." : formatCurrency(resume?.stockValeur ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">{resume?.nbProduits ?? 0} produits analysés</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher produit, code barre, type…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm dark:bg-muted text-foreground"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setPickerOuvert(!pickerOuvert)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${selection.size > 0 ? "border-success/40 bg-success/10 text-success-foreground" : "border-border hover:bg-accent/50"}`}
          >
            <Filter size={15} />
            {selection.size > 0 ? `${selection.size} produit(s) sélectionné(s)` : "Tous les produits"}
          </button>
          {pickerOuvert && (
            <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-border bg-background shadow-lg dark:bg-card">
              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Rechercher dans le catalogue…"
                    value={pickerRecherche}
                    onChange={(e) => setPickerRecherche(e.target.value)}
                    className="w-full rounded-lg border border-border py-1.5 pl-8 pr-3 text-sm dark:bg-muted text-foreground"
                  />
                </div>
              </div>
              <div className="flex gap-2 p-3 pb-2">
                <button
                  onClick={() => { setSelection(new Set()); setOffset(0); }}
                  className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/50"
                >
                  Tous
                </button>
                <button
                  onClick={() => { setSelection(new Set(produitsDisponibles.map((p) => Number(p.produitId)))); setOffset(0); }}
                  className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/50"
                >
                  Sélectionner la liste
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto p-2">
                {catalogueLoading ? (
                  <p className="px-2 py-4 text-center text-sm text-muted-foreground">Chargement…</p>
                ) : produitsDisponibles.length === 0 ? (
                  <p className="px-2 py-4 text-center text-sm text-muted-foreground">Aucun produit.</p>
                ) : (
                  produitsDisponibles.map((p) => {
                    const id = Number(p.produitId);
                    const checked = selection.has(id);
                    return (
                      <label key={id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/30">
                        <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-success bg-success/20 text-success-foreground" : "border-border"}`}>
                          {checked && <Check size={12} />}
                        </span>
                        <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleSelection(id)} />
                        <span className="flex-1 truncate text-sm text-foreground">{p.titre}</span>
                        {p.codeBarre && <span className="text-xs text-muted-foreground font-mono truncate max-w-[90px]">{p.codeBarre}</span>}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/50 disabled:opacity-50"
        >
          <Download size={15} /> CSV
        </button>
      </div>

      {/* Erreur serveur */}
      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center justify-between gap-4">
          <span>Impossible de charger l'analyse des produits. Réessayez.</span>
          <button onClick={() => refetch()} className="rounded-lg border border-destructive/40 px-3 py-1.5 font-medium hover:bg-destructive/10">
            Réessayer
          </button>
        </div>
      )}

      {/* Tableau */}
      <div className="rounded-xl border border-border bg-background dark:bg-card">
        <div className="border-b border-border p-5">
          <h3 className="text-lg font-semibold text-foreground">Analyse produit 360°</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.total ?? 0} produits · tri par {sortLabels[sortBy]}
            {selection.size > 0 ? ` · ${selection.size} sélectionné(s)` : ""}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 dark:bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Produit</th>
                {(["quantite", "ca", "cout", "marge", "tauxMarge", "nbVentes", "stock", "pertes"] as const).map((key) => (
                  <th key={key} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">
                    <button onClick={() => { setSortBy(key); setOffset(0); }} className={`hover:text-foreground ${sortBy === key ? "text-primary" : "text-muted-foreground"}`}>
                      {key === "quantite" ? "Qté" : key === "ca" ? "CA" : key === "cout" ? "Coût" : key === "marge" ? "Marge" : key === "tauxMarge" ? "% Marge" : key === "nbVentes" ? "Ventes" : key === "stock" ? "Stock" : "Pertes"}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Retours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={13} className="px-4 py-3"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                ))
              ) : produitsFiltres.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {recherche ? "Aucun produit ne correspond à la recherche." : "Aucun produit sur la période."}
                  </td>
                </tr>
              ) : (
                produitsFiltres.map((p) => (
                  <tr key={p.produitId} className="hover:bg-accent/30 dark:hover:bg-accent/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{p.titre}</p>
                      {p.codeBarre && <p className="text-xs text-muted-foreground font-mono">{p.codeBarre}</p>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">{p.quantite}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono">{formatCurrency(p.ca)}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">{formatCurrency(p.cout)}</td>
                    <td className={`px-4 py-3 text-right text-sm font-mono ${p.marge >= 0 ? "text-success-foreground" : "text-destructive"}`}>
                      {formatCurrency(p.marge)}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-mono ${p.tauxMarge >= 0 ? "text-success-foreground" : "text-destructive"}`}>
                      {formatPercent(p.tauxMarge)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">
                      {p.nbVentes}
                      {p.panierMoyen > 0 && <span className="block text-xs">{formatCurrency(p.panierMoyen)} / vente</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">
                      {p.stockQte}
                      {p.stockValeur > 0 && <span className="block text-xs">{formatCurrency(p.stockValeur)}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.pertes > 0 ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm font-mono text-destructive">{formatCurrency(p.pertes)}</span>
                          <div className="flex flex-wrap justify-end gap-1">
                            {p.pertesParType.map((t) => (
                              <span key={t.type} className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                                {typePertesLabels[t.type] ?? t.type} {formatCurrency(t.montant)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">
                      {p.retoursQte > 0 ? (
                        <>
                          {p.retoursQte} × {formatCurrency(p.retoursMontant)}
                          <span className={`block text-xs ${p.margeRetours >= 0 ? "text-success-foreground" : "text-destructive"}`}>
                            {formatCurrency(p.margeRetours)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && (data?.total ?? 0) > offset + 50 && (
          <div className="border-t border-border p-4 text-center">
            <button
              onClick={() => setOffset(offset + 50)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/50"
            >
              Charger plus
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
