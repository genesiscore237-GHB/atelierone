"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { api } from "~/trpc/react";
import {
  Plus, Search, Package, Upload, BarChart3, BookOpen, ChevronDown,
  Download, Printer, Camera, ChevronLeft, ChevronRight,
  Eye, Pencil, AlertTriangle, RotateCcw,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "~/components/ui/select";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { usePermissions } from "~/hooks/usePermissions";
import { CommanderProduitDialog } from "./_components/CommanderProduitDialog";

type Filters = {
  query: string;
  debouncedQuery: string;
  type: "PIECE" | "SERVICE" | "";
  categorieParentId: string;
  categorieId: string;
  statut: string;
};

const defaultFilters: Filters = {
  query: "", debouncedQuery: "", type: "",
  categorieParentId: "", categorieId: "",
  statut: "",
};

export default function CatalogPage() {
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function decomposeStock(total: number, unites: { facteurVersBase: number; libelle: string }[]): string {
    const triees = [...unites]
      .filter(u => u.facteurVersBase > 1)
      .sort((a, b) => b.facteurVersBase - a.facteurVersBase);
    if (triees.length === 0) return String(total);
    let reste = total;
    const parts: string[] = [];
    for (const u of triees) {
      const q = Math.floor(reste / u.facteurVersBase);
      if (q > 0) { parts.push(`${q} ${u.libelle}`); reste = reste % u.facteurVersBase; }
    }
    if (reste > 0) parts.push(`${reste} unité${reste > 1 ? "s" : ""}`);
    return parts.length > 0 ? parts.join(" + ") : String(total);
  }

  const [f, setF] = useState<Filters>({ ...defaultFilters });

  const setFilter = useCallback(<K extends keyof Filters>(key: K, val: Filters[K]) => {
    setF(prev => ({ ...prev, [key]: val }));
    if (key !== "query" && key !== "debouncedQuery") setPage(1);
  }, []);

  const resetFilters = () => { setF({ ...defaultFilters }); setPage(1); };

  const utils = api.useUtils();

  const queryInput = useMemo(() => ({
    query: f.debouncedQuery || undefined,
    type: f.type || undefined,
    categorieId: f.categorieId || undefined,
    statut: f.statut && f.statut !== "all" ? f.statut : undefined,
    page,
    limit: 20,
  }), [f, page]);

  const { data, isLoading, error } = api.catalog.list.useQuery(queryInput);
  const refStaleTime = 15 * 60 * 1000;
  const { data: categories } = api.catalog.listCategories.useQuery(undefined, { staleTime: refStaleTime, gcTime: 60 * 60 * 1000 });

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const parentCats = useMemo(() =>
    categories?.filter((c: { parentId: number | string | null }) => !c.parentId) ?? [], [categories]);
  const childCats = useMemo(() =>
    categories?.filter((c: { parentId: number | string | null }) => String(c.parentId) === f.categorieParentId) ?? [], [categories, f.categorieParentId]);

  const hasActiveFilters = Object.values(f).some(v => v && v !== "");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const { hasPermission } = usePermissions();
  const [commanderProduit, setCommanderProduit] = useState<{ id: string; titre: string; stock: number } | null>(null);

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Catalogue produits</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Chargement..." : `${data?.total ?? 0} produit${(data?.total ?? 0) > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/catalog/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20">
            <BarChart3 className="size-4" /> Tableau de bord
          </Link>
                  <Link href="/dashboard/catalog/categories"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
            <BookOpen className="size-4" /> Catégories
          </Link>
          <Link href="/dashboard/catalog/produits/nouveau" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-foreground hover:bg-primary/80">
            <Plus className="size-4" /> Nouveau
          </Link>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Sidebar Filters */}
        <aside className="hidden w-64 shrink-0 flex-col gap-4 lg:flex">
          <div className="rounded-xl border border-border bg-card/50 p-4">
            <button onClick={() => setFiltersOpen(o => !o)} className="flex w-full items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Filtres</h3>
              <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${filtersOpen ? "" : "-rotate-90"}`} />
            </button>

            {filtersOpen && (<>
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Type de produit</label>
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {(["", "PIECE", "SERVICE"] as const).map(t => (
                  <button key={t} onClick={() => {
                    setFilter("type", t);
                    setFilter("categorieParentId", "");
                    setFilter("categorieId", "");
                  }}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${f.type === t
                      ? "bg-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                      }`}>
                    {t === "" ? "Tous" : t === "PIECE" ? "Pièces" : "Services"}
                  </button>
                ))}
              </div>
            </div>

            {/* Catégorie */}
            <div className="space-y-2.5 mb-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Catégorie</label>
                <Select value={f.categorieParentId} onValueChange={v => { setFilter("categorieParentId", v); setFilter("categorieId", ""); }}>
                  <SelectTrigger className="h-8 border-border bg-muted text-xs text-foreground"><SelectValue placeholder="Toutes" /></SelectTrigger>
                  <SelectContent className="border-border bg-card text-foreground">
                    <SelectItem value="all">Toutes</SelectItem>
                    {parentCats.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {f.categorieParentId && (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Sous-catégorie</label>
                  <Select value={f.categorieId} onValueChange={v => setFilter("categorieId", v)}>
                    <SelectTrigger className="h-8 border-border bg-muted text-xs text-foreground"><SelectValue placeholder="Toutes" /></SelectTrigger>
                    <SelectContent className="border-border bg-card text-foreground">
                      <SelectItem value="all">Toutes</SelectItem>
                      {childCats.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Statut</label>
                <Select value={f.statut} onValueChange={v => setFilter("statut", v)}>
                  <SelectTrigger className="h-8 border-border bg-muted text-xs text-foreground"><SelectValue placeholder="Tous" /></SelectTrigger>
                  <SelectContent className="border-border bg-card text-foreground">
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="BROUILLON">Brouillon</SelectItem>
                    <SelectItem value="ACTIF">Actif</SelectItem>
                    <SelectItem value="SUSPENDU">Suspendu</SelectItem>
                    <SelectItem value="DISCONTINUE">Discontinué</SelectItem>
                    <SelectItem value="ARCHIVE">Archivé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {hasActiveFilters && (
              <button onClick={resetFilters}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-colors">
                <RotateCcw className="size-3" /> Réinitialiser
              </button>
            )}
            </>)}
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Search + Actions bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/50 p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={f.query}
                onChange={e => {
                  setFilter("query", e.target.value);
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  debounceRef.current = setTimeout(() => {
                    setF(prev => ({ ...prev, debouncedQuery: e.target.value }));
                    setPage(1);
                  }, 300);
                }}
                placeholder="Rechercher un produit..."
                className="w-full rounded-lg border border-border bg-muted py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30" />
            </div>
            <button title="Scanner code-barres"
              className="rounded-lg border border-border bg-muted p-2 text-muted-foreground hover:text-foreground transition-colors">
              <Camera className="size-4" />
            </button>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground/80 hover:text-foreground transition-colors">
                <Download className="size-3.5" /> Export
              </button>
              <button className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground/80 hover:text-foreground transition-colors">
                <Printer className="size-3.5" /> Étiquettes
              </button>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertTriangle className="mb-3 size-10 text-destructive" />
              <p className="text-sm text-muted-foreground">Erreur de chargement</p>
              <Button onClick={() => window.location.reload()} className="mt-3 bg-primary hover:bg-primary/80">Recharger</Button>
            </div>
          ) : !data?.items.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="mb-3 size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{hasActiveFilters ? "Aucun produit ne correspond aux filtres" : "Aucun produit dans le catalogue"}</p>
              {hasActiveFilters && (
                <button onClick={resetFilters} className="mt-2 text-xs text-primary hover:text-primary/80">Réinitialiser les filtres</button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-[700px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-card/80 text-xs font-semibold uppercase text-muted-foreground">
                      <th className="w-24 px-3 py-3 text-left">Réf.</th>
                      <th className="px-3 py-3 text-left">Désignation</th>
                      <th className="w-28 px-3 py-3 text-left">Catégorie</th>
                      <th className="w-24 px-3 py-3 text-right">Stock</th>
                      <th className="w-28 px-3 py-3 text-right">Prix vente</th>
                      <th className="w-24 px-3 py-3 text-center">Statut</th>
                      <th className="w-20 px-2 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.items.map((p) => {
                      const stock = p.stockTotal ?? 0;
                      const seuil = p.seuilAlerte ?? 5;
                      const stockLow = stock > 0 && stock <= seuil;
                      const stockOut = stock <= 0;
                      return (
                        <tr key={p.id} className="group hover:bg-accent/40 transition-colors">
                          <td className="max-w-24 truncate px-3 py-3 font-mono text-xs text-muted-foreground" title={p.codeBarre || p.id}>
                            {p.codeBarre || p.id?.slice(0, 8) || "—"}
                          </td>
                          <td className="px-3 py-3">
                            <Link href={`/dashboard/catalog/${p.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                              {p.titre}
                            </Link>
                                                    </td>
                          <td className="max-w-28 truncate px-3 py-3 text-xs text-muted-foreground" title={p.categorieNom || ""}>
                            {p.categorieNom || "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">
                            <span className={`font-mono text-sm ${stockOut ? "text-destructive" : stockLow ? "text-warning-foreground" : "text-foreground/80"}`}>
                              {stock}
                            </span>
                            {stockLow && !stockOut && (
                              <span className="ml-1 inline-flex items-center rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning-foreground">Bas</span>
                            )}
                            {stockOut && (
                              <span className="ml-1 inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">Rupture</span>
                            )}
                            {p.unites && p.unites.length > 1 && stock > 0 && (
                              <p className="text-[10px] text-muted-foreground mt-0.5" title={p.unites.map((u: any) => `${u.libelle} ×${u.facteurVersBase}`).join(", ")}>
                                ≈ {decomposeStock(stock, p.unites)}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm text-primary">
                            {Number(p.prixVente).toLocaleString()} F
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              p.statutCycleVie === "ACTIF" ? "bg-success/10 text-success-foreground" :
                              p.statutCycleVie === "BROUILLON" ? "bg-muted/30 text-muted-foreground" :
                              p.statutCycleVie === "SUSPENDU" ? "bg-warning/10 text-warning-foreground" :
                              p.statutCycleVie === "DISCONTINUE" ? "bg-destructive/10 text-destructive" :
                              p.statutCycleVie === "ARCHIVE" ? "bg-destructive/20 text-destructive" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {p.statutCycleVie ?? "—"}
                            </span>
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex justify-center gap-0.5">
                              {(stockLow || stockOut) && hasPermission("achats.commander") && (
                                <button
                                  onClick={() => setCommanderProduit({ id: String(p.id), titre: p.titre, stock })}
                                  className={`rounded p-1 transition-colors ${
                                    p.fournisseurId
                                      ? "text-primary hover:bg-accent hover:text-primary"
                                      : "cursor-not-allowed text-muted-foreground/40"
                                  }`}
                                  title={p.fournisseurId
                                    ? "Commander ce produit"
                                    : "Aucun fournisseur lié : commande impossible depuis le catalogue"}
                                  disabled={!p.fournisseurId}
                                >
                                  <ShoppingCart className="size-3.5" />
                                </button>
                              )}
                              <Link href={`/dashboard/catalog/${p.id}`}
                                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                title="Voir">
                                <Eye className="size-3.5" />
                              </Link>
                              <Link href={`/dashboard/catalog/produits/${p.id}/editer`}
                                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                title="Modifier">
                                <Pencil className="size-3.5" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data.totalPages && data.totalPages > 1 && (
                <div className="flex items-center justify-between rounded-xl border border-border bg-card/50 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Page {page} sur {data.totalPages} ({data.total} produits)
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                      className="rounded-lg border border-border bg-muted p-2 text-muted-foreground disabled:opacity-40 hover:text-foreground transition-colors">
                      <ChevronLeft className="size-4" />
                    </button>
                    {Array.from({ length: Math.min(data.totalPages, 5) }, (_, i) => {
                      const start = Math.max(1, page - 2);
                      const pNum = start + i;
                      if (pNum > data.totalPages!) return null;
                      return (
                        <button key={pNum} onClick={() => setPage(pNum)}
                          className={`min-w-[32px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                            pNum === page ? "bg-primary text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}>
                          {pNum}
                        </button>
                      );
                    })}
                    <button onClick={() => setPage(p => Math.min(data.totalPages ?? 1, p + 1))} disabled={page >= (data.totalPages ?? 1)}
                      className="rounded-lg border border-border bg-muted p-2 text-muted-foreground disabled:opacity-40 hover:text-foreground transition-colors">
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <CommanderProduitDialog
        produitId={commanderProduit?.id ?? ""}
        titre={commanderProduit?.titre}
        stock={commanderProduit?.stock}
        open={!!commanderProduit}
        onOpenChange={(o) => { if (!o) setCommanderProduit(null); }}
      />
    </div>
  );
}
