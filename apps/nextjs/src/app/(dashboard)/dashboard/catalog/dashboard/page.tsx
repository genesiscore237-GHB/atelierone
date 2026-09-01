"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "~/trpc/react";
import { RefreshCw, Download, Wrench, Clock3, AlertTriangle, TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { toast } from "sonner";
import Link from "next/link";

const PERIODS = ["Aujourd'hui", "Cette semaine", "Ce mois", "Ce trimestre", "Cette année scolaire", "Personnalisé"];

function getCriticite(stock: number, seuil: number): { label: string; cls: string } {
  if (stock <= 0) return { label: "Rupture", cls: "text-destructive" };
  if (stock <= seuil * 0.5) return { label: "Critique", cls: "text-destructive" };
  return { label: "Bas", cls: "text-warning-foreground" };
}

const BGS = ["bg-primary", "bg-primary", "bg-success", "bg-warning", "bg-destructive", "bg-info"];

function computeDateRange(periode: string): { dateDebut?: string; dateFin?: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  switch (periode) {
    case "Aujourd'hui": return { dateDebut: fmt(now), dateFin: fmt(now) };
    case "Cette semaine": {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      return { dateDebut: fmt(start), dateFin: fmt(now) };
    }
    case "Ce mois": return { dateDebut: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), dateFin: fmt(now) };
    case "Ce trimestre": {
      const q = Math.floor(now.getMonth() / 3);
      return { dateDebut: fmt(new Date(now.getFullYear(), q * 3, 1)), dateFin: fmt(now) };
    }
    case "Cette année scolaire": return { dateDebut: fmt(new Date(now.getFullYear() - (now.getMonth() < 8 ? 1 : 0), 9, 1)), dateFin: fmt(now) };
    default: return {};
  }
}

export default function CatalogDashboardPage() {
  const [period, setPeriod] = useState("Ce mois");
  const [refreshing, setRefreshing] = useState(false);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  const [filterType, setFilterType] = useState<string | null>(null);

  const range = period === "Personnalisé" ? { dateDebut, dateFin } : computeDateRange(period);
  const queryInput = { periode: period, dateDebut: range.dateDebut, dateFin: range.dateFin };

  const { data: agg, refetch } = api.dashboard.getCatalogDashboard.useQuery(queryInput, { refetchOnWindowFocus: false });
  const { data: lowStock } = api.inventory.getLowStock.useQuery(undefined, { refetchOnWindowFocus: false });
  const exportMutation = api.dashboard.exportComparatif.useMutation();

  const caTotal = agg?.caTotal ?? 0;
  const totalItemsVendus = agg?.nbProduitsVendus ?? 0;
  const valeurStock = agg?.valeurStock ?? 0;

  const critiques = lowStock?.filter((i: any) => Number(i.quantite) <= Number(i.seuilAlerte) * 0.5)?.length ?? 0;
  const bas = lowStock?.filter((i: any) => Number(i.quantite) > Number(i.seuilAlerte) * 0.5)?.length ?? 0;

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
    setTimeout(() => setRefreshing(false), 1000);
    toast.success("Données actualisées");
  }, [refetch]);

  useEffect(() => {
    const timer = setInterval(() => refetch(), 60000);
    return () => clearInterval(timer);
  }, [refetch]);

  const totalCaParType = (agg?.caParType ?? []).reduce((s, r) => s + r.total, 0);
  const caPieces = (agg?.caParType ?? []).filter(r => r.type === "PIECE" || r.type === "MANUEL").reduce((s, r) => s + r.total, 0);
  const caServices = totalCaParType - caPieces;
  const pctPieces = totalCaParType > 0 ? Math.round(caPieces / totalCaParType * 100) : 0;
  const pctServices = totalCaParType > 0 ? 100 - pctPieces : 0;

  const ventesNiveau = agg?.ventesParNiveau ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Tableau de bord Catalogue</h1>

      {/* FILTRES */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-foreground/80 font-medium">Période :</span>
        <Select value={period} onValueChange={v => { setPeriod(v); }}>
          <SelectTrigger className="h-8 w-44 border-border bg-muted/50 text-foreground text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border bg-card text-foreground">
            {PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        {period === "Personnalisé" && (
          <div className="flex items-center gap-2">
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              className="h-8 rounded border border-border bg-muted/50 px-2 text-xs text-foreground" />
            <span className="text-muted-foreground">→</span>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
              className="h-8 rounded border border-border bg-muted/50 px-2 text-xs text-foreground" />
          </div>
        )}

        <button onClick={handleRefresh} disabled={refreshing}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs text-foreground/80 hover:text-foreground transition-colors">
          <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ROW 1 — KPI CARDS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">CA Total</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{caTotal.toLocaleString()} F</p>
          {agg?.comparatif?.evolution && (
            <p className="mt-0.5 text-xs text-success-foreground">vs N-1 : {agg.comparatif.evolution}</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Produits vendus</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{totalItemsVendus.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Valeur stock</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{valeurStock >= 1_000_000 ? `${(valeurStock / 1_000_000).toFixed(1)} M` : valeurStock.toLocaleString()} F</p>
          <p className="mt-0.5 text-xs text-muted-foreground">—</p>
        </div>
        <Link href="#alertes-stock" className="block rounded-xl border border-border bg-card/50 p-5 hover:border-border transition-colors">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Alertes stock</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{lowStock?.length ?? 0}</p>
          <div className="mt-1 flex gap-1.5 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">{critiques} critiques</span>
            <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground">{bas} à surveiller</span>
          </div>
        </Link>
      </div>

      {/* ROW 2 — GRAPHS */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <h4 className="text-sm font-semibold text-foreground mb-4">Répartition CA par type</h4>
          {totalCaParType > 0 ? (
            <div className="flex items-center gap-6">
              <div className="shrink-0 size-24 rounded-full"
                style={{ background: `conic-gradient(#3B82F6 0deg ${pctPieces * 3.6}deg, #F59E0B ${pctPieces * 3.6}deg 360deg)` }} />
              <div className="text-sm space-y-2">
                <button onClick={() => setFilterType(filterType === "manuels" ? null : "manuels")}
                  className={`flex items-center gap-2 transition-colors w-full text-left ${filterType === "manuels" ? "opacity-100" : filterType ? "opacity-40 hover:opacity-70" : "hover:opacity-80"}`}>
                  <span className="inline-block size-3 rounded-sm bg-primary" />
                  <span className="text-foreground/80"><Wrench className="inline size-3.5 mr-1" /> Pièces : {pctPieces}% ({caPieces.toLocaleString()} F)</span>
                </button>
                <button onClick={() => setFilterType(filterType === "fournitures" ? null : "fournitures")}
                  className={`flex items-center gap-2 transition-colors w-full text-left ${filterType === "fournitures" ? "opacity-100" : filterType ? "opacity-40 hover:opacity-70" : "hover:opacity-80"}`}>
                  <span className="inline-block size-3 rounded-sm bg-warning" />
                  <span className="text-foreground/80"><Clock3 className="inline size-3.5 mr-1" /> Main d'œuvre : {pctServices}% ({caServices.toLocaleString()} F)</span>
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune donnée pour la période</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <h4 className="text-sm font-semibold text-foreground mb-4">Ventes par niveau</h4>
          {ventesNiveau.length > 0 ? (
            <div className="space-y-3 text-sm">
              {ventesNiveau.map((item, i) => {
                const pct = totalCaParType > 0 ? Math.round(item.total / totalCaParType * 100) : 0;
                return (
                  <div key={item.typeProduit || i} className="block">
                    <div className="flex justify-between text-muted-foreground mb-1">
                      <span>{item.libelle}</span>
                      <span className="font-mono text-foreground">{item.total.toLocaleString()} F</span>
                    </div>
                    <div className="h-4 rounded bg-muted overflow-hidden">
                      <div className={`h-full rounded ${BGS[i % BGS.length]} text-[10px] text-foreground pl-1.5 leading-4`}
                        style={{ width: `${pct}%` }}>
                        {item.total.toLocaleString()} F
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune donnée pour la période</p>
          )}
        </div>
      </div>

      {/* ROW 3 — ALERTES STOCK BAS */}
      <div id="alertes-stock" className="rounded-xl border border-border bg-card/50 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4"><AlertTriangle className="inline size-4 mr-1.5 text-destructive" /> Alertes stock bas (triées par criticité)</h3>
        {!lowStock?.length ? (
          <p className="text-sm text-muted-foreground">Aucune alerte stock</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase">
                    <th className="text-left px-3 py-2">Produit</th>
                    <th className="text-right px-3 py-2">Stock</th>
                    <th className="text-right px-3 py-2">Seuil</th>
                    <th className="text-left px-3 py-2">Criticité</th>
                    <th className="text-left px-3 py-2">Dernière vente</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {[...(lowStock ?? [])].sort((a: any, b: any) => {
                    const ca = getCriticite(Number(a.quantite), Number(a.seuilAlerte ?? 5));
                    const cb = getCriticite(Number(b.quantite), Number(b.seuilAlerte ?? 5));
                    const order = { Rupture: 0, Critique: 1, Bas: 2 } as const;
                    return (order[ca.label as keyof typeof order] ?? 3) - (order[cb.label as keyof typeof order] ?? 3);
                  }).slice(0, 5).map((item: any) => {
                    const crit = getCriticite(Number(item.quantite), Number(item.seuilAlerte ?? 5));
                    const derniereVente = item.derniereVente ? new Date(item.derniereVente).toLocaleDateString("fr-FR") : "—";
                    return (
                      <tr key={item.id} className="text-foreground/80">
                        <td className="px-3 py-2">
                          <Link href={`/dashboard/catalog/${item.produitId}`} className="text-foreground hover:text-primary/80 transition-colors">
                            {item.titre}
                          </Link>
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${crit.cls}`}>{item.quantite}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{item.seuilAlerte ?? 5}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            crit.label === "Critique" || crit.label === "Rupture"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-warning/10 text-warning-foreground"
                          }`}>{crit.label}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{derniereVente}</td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/dashboard/catalog/${item.produitId}`}
                            className="inline-flex items-center rounded border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground/80 hover:text-foreground hover:border-border transition-colors">
                            Voir le produit
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {lowStock.length > 5 && (
              <Link href="/dashboard/alerts" className="mt-3 block text-center text-xs text-primary hover:text-primary/80">
                Voir toutes les alertes →
              </Link>
            )}
          </>
        )}
      </div>

      {/* ROW 4 — COMPARATIF N vs N-1 */}
      <div className="rounded-xl border border-border bg-card/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground"><TrendingUp className="inline size-4 mr-1.5 text-primary" /> Comparatif année N vs N-1</h3>
          <button onClick={async () => {
            try {
              const res = await exportMutation.mutateAsync();
              const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = res.filename; a.click();
              URL.revokeObjectURL(url);
              toast.success("Export téléchargé");
            } catch { toast.error("Erreur d'export"); }
          }}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
            <Download className="size-3" /> Exporter en Excel
          </button>
        </div>
        {agg?.comparatif ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase">
                  <th className="text-left px-3 py-2">Période</th>
                  <th className="text-right px-3 py-2">CA</th>
                  <th className="text-right px-3 py-2">Évolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <tr className="text-foreground/80">
                  <td className="px-3 py-2 text-foreground">N-1 (période équivalente)</td>
                  <td className="px-3 py-2 text-right font-mono">{agg.comparatif.anneePrecedente.toLocaleString()} F</td>
                  <td className="px-3 py-2 text-right font-mono text-success-foreground">
                    {agg.comparatif.evolution ? `▲ ${agg.comparatif.evolution}` : "—"}
                  </td>
                </tr>
                <tr className="text-foreground/80">
                  <td className="px-3 py-2 text-foreground">N (période courante)</td>
                  <td className="px-3 py-2 text-right font-mono">{agg.comparatif.anneeCourante.toLocaleString()} F</td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune donnée comparative</p>
        )}
      </div>
    </div>
  );
}
