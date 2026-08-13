"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { TrendingUp, Calendar, BarChart3, PieChart as PieIcon, AlertTriangle, RotateCcw, Download, Search, Package, Boxes, HelpCircle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart as RechartsPieChart, Pie, Cell, Legend } from "recharts";
import LotsTab from "./lots-tab";
import ProduitsTab from "./produits-tab";
import BeneficeTab from "./benefice-tab";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

const COLORS = ["#22c55e", "#eab308", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

export default function MargePage() {
  const [dateDebut, setDateDebut] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
  const [dateFin, setDateFin] = useState(new Date().toISOString().split("T")[0]);
  const [tout, setTout] = useState(false);
  const [typeProduit, setTypeProduit] = useState<string>("");
  const [operateurId, setOperateurId] = useState<string>("");
  const [groupBy, setGroupBy] = useState<"day" | "month">("day");
  const [groupePar, setGroupePar] = useState<"type" | "niveau">("type");
  const [sortBy, setSortBy] = useState<"marge" | "ca" | "quantite" | "tauxMarge" | "cout">("marge");
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [onglet, setOnglet] = useState<"apercu" | "lots" | "produits" | "benefice">("apercu");
  const [aideOuverte, setAideOuverte] = useState(false);

  const filters = { dateDebut, dateFin, typeProduit: typeProduit || undefined, operateurId: operateurId || undefined };

  const { data: kpis, isLoading: kpisLoading } = api.marge.getMargeKpis.useQuery({ dateDebut, dateFin });
  const { data: series, isLoading: seriesLoading } = api.marge.getMargeSeries.useQuery({ dateDebut, dateFin, groupBy });
  const { data: repartition, isLoading: repartitionLoading } = api.marge.getMargeParType.useQuery({ dateDebut, dateFin, groupePar });
  const { data: table, isLoading: tableLoading } = api.marge.getMargeParProduit.useQuery({ ...filters, sortBy, limit: 50, offset });
  const { data: sousCout, isLoading: sousCoutLoading } = api.marge.getVentesSousCout.useQuery({ dateDebut, dateFin, limit: 10 });
  const { data: retoursData, isLoading: retoursLoading } = api.marge.getMargeRetours.useQuery({ dateDebut, dateFin });
  const { data: operateurs } = api.marge.listOperateurs.useQuery();
  const exportMutation = api.export.requestExport.useMutation();
  const [jobId, setJobId] = useState<string | null>(null);
  const statusQuery = api.export.getExportStatus.useQuery({ jobId: jobId ?? "" }, { enabled: false });
  const downloadQuery = api.export.downloadExport.useQuery({ jobId: jobId ?? "" }, { enabled: false });

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XAF", maximumFractionDigits: 0 }).format(amount);
  }

  function formatPercent(value: number) {
    return `${value.toFixed(1)}%`;
  }

  async function handleExport(format: "csv" | "xlsx") {
    setExporting(true);
    try {
      const { jobId: id } = await exportMutation.mutateAsync({
        type: "analytics",
        format,
        startDate: dateDebut,
        endDate: dateFin,
      });
      setJobId(id);
      let status = "pending";
      for (let i = 0; i < 20 && status !== "completed" && status !== "failed"; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const res = await statusQuery.refetch();
        status = res.data?.status ?? "pending";
      }
      const final = await statusQuery.refetch();
      if (!final.data || final.data.status !== "completed") {
        throw new Error(final.data?.error ?? "Export échoué");
      }
      const file = await downloadQuery.refetch();
      if (!file.data) throw new Error("Export non disponible");
      const blob = new Blob([Uint8Array.from(atob(file.data.data), (c) => c.charCodeAt(0))], { type: file.data.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Échec de l'export. Réessayez.");
    } finally {
      setExporting(false);
    }
  }

  const sortLabels: Record<string, string> = {
    marge: "Marge",
    ca: "CA",
    quantite: "Qté",
    cout: "Coût",
    tauxMarge: "% Marge",
  };

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Marge & Bénéfices</h1>
          <p className="mt-1 text-sm text-muted-foreground">Rentabilité des ventes : coût d'achat réel (lot/FIFO) au moment de la vente</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport("csv")}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/50 disabled:opacity-50"
          >
            <Download size={15} /> CSV
          </button>
          <button
            onClick={() => handleExport("xlsx")}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/50 disabled:opacity-50"
          >
            <Download size={15} /> XLSX
          </button>
        </div>
      </div>

      {/* Aide : comprendre les chiffres */}
      <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <button onClick={() => setAideOuverte(!aideOuverte)} className="flex w-full items-center justify-between text-sm font-semibold text-foreground">
          <span className="flex items-center gap-2"><HelpCircle size={16} className="text-primary" /> Comprendre mes chiffres</span>
          <span className="text-xs text-muted-foreground">{aideOuverte ? "Masquer ▲" : "Afficher ▼"}</span>
        </button>
        {aideOuverte && (
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
            <div className="rounded-lg bg-background dark:bg-card border border-border p-3">
              <p className="font-semibold text-foreground">Chiffre d'affaires</p>
              <p className="mt-1">Tout ce qui a été vendu sur la période. Le CA <strong>encaissé réel</strong> = l'argent effectivement reçu (crédits clients et remboursements de retours exclus).</p>
            </div>
            <div className="rounded-lg bg-background dark:bg-card border border-border p-3">
              <p className="font-semibold text-foreground">Marge brute</p>
              <p className="mt-1">Prix de vente − prix d'achat. Pour un manuel scolaire, c'est exactement <strong>la remise que te fait le fournisseur</strong> sur le prix homologué.</p>
            </div>
            <div className="rounded-lg bg-background dark:bg-card border border-border p-3">
              <p className="font-semibold text-foreground">Marge nette</p>
              <p className="mt-1">Marge brute − remises accordées aux clients − retours. Ce que le produit rapporte vraiment.</p>
            </div>
            <div className="rounded-lg bg-background dark:bg-card border border-border p-3">
              <p className="font-semibold text-foreground">Bénéfice net & aléas</p>
              <p className="mt-1">Marge nette − dépenses − pertes. Un vol ou une casse <strong>déduit le stock du lot</strong> et le bénéfice estimé du lot.</p>
            </div>
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="mb-6 flex gap-1 rounded-xl border border-border bg-muted/30 p-1 w-fit">
        {(["apercu", "lots", "produits", "benefice"] as const).map((o) => (
          <button
            key={o}
            onClick={() => setOnglet(o)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${onglet === o ? "bg-background dark:bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {o === "apercu" ? <BarChart3 size={15} /> : o === "lots" ? <Package size={15} /> : o === "produits" ? <Boxes size={15} /> : <TrendingUp size={15} />}
            {o === "apercu" ? "Vue d'ensemble" : o === "lots" ? "Par lot" : o === "produits" ? "Par produit" : "Bénéfice net"}
          </button>
        ))}
      </div>

      {/* Période — visible sur tous les onglets */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background dark:bg-card p-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-muted-foreground" />
          <input
            type="date"
            disabled={tout}
            className="rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted text-foreground disabled:opacity-50"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
          />
          <span className="text-muted-foreground">à</span>
          <input
            type="date"
            disabled={tout}
            className="rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted text-foreground disabled:opacity-50"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={tout}
              onChange={(e) => {
                const actif = e.target.checked;
                setTout(actif);
                if (actif) {
                  setDateDebut("");
                  setDateFin("");
                } else {
                  setDateDebut(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
                  setDateFin(new Date().toISOString().split("T")[0]);
                }
              }}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            Depuis toujours
          </label>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {tout ? "Période : depuis le début (cumul complet)" : `Période : 30 derniers jours`}
        </span>
      </div>

      {onglet === "apercu" ? (
        <>
      {/* Filters (vue d'ensemble uniquement) */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          className="rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted text-foreground"
          value={typeProduit}
          onChange={(e) => setTypeProduit(e.target.value)}
        >
          <option value="">Tous les types</option>
          <option value="FOURNITURE">Fourniture</option>
          <option value="MANUEL">Manuel</option>
        </select>
        <select
          className="rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted text-foreground"
          value={operateurId}
          onChange={(e) => setOperateurId(e.target.value)}
        >
          <option value="">Tous les opérateurs</option>
          {operateurs?.map((o) => (
            <option key={o.id} value={o.id}>{o.nom}</option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground" title="Total facturé des ventes terminées sur la période (crédits clients inclus). L'argent réellement reçu = CA encaissé, visible dans l'onglet Bénéfice net.">Chiffre d'affaires (facturé) <span className="ml-1 cursor-help">?</span></p>
          <p className="text-2xl font-bold text-foreground mt-1">{kpisLoading ? "..." : formatCurrency(kpis?.ca ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">{kpis?.nbVentes ?? 0} ventes · CA encaissé : voir onglet « Bénéfice net »</p>
        </motion.div>
        <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground" title="Coût d'achat des produits vendus, valorisé au coût réel de leur lot (FIFO) au moment de la vente. Soustrait du CA pour obtenir la marge brute.">Coût des ventes <span className="ml-1 cursor-help">?</span></p>
          <p className="text-2xl font-bold text-foreground mt-1">{kpisLoading ? "..." : formatCurrency(kpis?.cout ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1" title="Produits vendus à un prix inférieur à leur coût d'achat : une perte directe, détaillée plus bas.">dont <span className="font-medium text-destructive">{formatCurrency(kpis?.pertes ?? 0)}</span> vendus sous coût</p>
        </motion.div>
        <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground" title="Prix de vente − prix d'achat. Pour un manuel scolaire : c'est la remise que te fait le fournisseur sur le prix homologué.">Marge brute <span className="ml-1 cursor-help">?</span></p>
          <p className="text-2xl font-bold text-success-foreground mt-1">{kpisLoading ? "..." : formatCurrency(kpis?.margeBrute ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">Taux: {kpisLoading ? "..." : formatPercent(kpis?.tauxMarge ?? 0)} (prix vente − prix achat)</p>
        </motion.div>
        <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground" title="Marge brute − remises accordées aux clients − valeur des retours. Ce que les ventes rapportent vraiment.">Marge nette <span className="ml-1 cursor-help">?</span></p>
          <p className="text-2xl font-bold text-foreground mt-1">{kpisLoading ? "..." : formatCurrency(kpis?.margeNet ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            après {formatCurrency(kpis?.remises ?? 0)} remises et {formatCurrency(kpis?.margeRetours ?? 0)} retours
          </p>
        </motion.div>
      </motion.div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <motion.div variants={item} initial="hidden" animate="show" className="rounded-xl border border-border bg-background p-6 dark:bg-card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Évolution de la marge</h3>
              <p className="text-sm text-muted-foreground">CA vs coût vs marge par période</p>
            </div>
            <div className="flex gap-1">
              {(["day", "month"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${groupBy === g ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/50"}`}
                >
                  {g === "day" ? "Jour" : "Mois"}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            {seriesLoading ? (
              <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="periode" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ca" name="CA" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cout" name="Coût" fill="#f87171" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="marge" name="Marge" fill="#22c55e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div variants={item} initial="hidden" animate="show" className="rounded-xl border border-border bg-background p-6 dark:bg-card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Répartition de la marge</h3>
              <p className="text-sm text-muted-foreground">Par type de produit ou niveau</p>
            </div>
            <div className="flex gap-1">
              {(["type", "niveau"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupePar(g)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${groupePar === g ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/50"}`}
                >
                  {g === "type" ? "Type" : "Niveau"}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            {repartitionLoading ? (
              <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : (repartition ?? []).length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Aucune vente sur la période</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie data={repartition} dataKey="marge" nameKey="libelle" cx="50%" cy="50%" outerRadius={90} label={(e: any) => e.libelle}>
                    {repartition?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>

      {/* Products Table */}
      <motion.div variants={item} initial="hidden" animate="show" className="rounded-xl border border-border bg-background dark:bg-card mb-8">
        <div className="border-b border-border p-6">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-[var(--module-marge)]" />
            <h3 className="text-lg font-semibold text-foreground">Marge par produit</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Tri par {sortLabels[sortBy]} — {table?.total ?? 0} produits vendus</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 dark:bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Produit</th>
                {(["quantite", "ca", "cout", "marge", "tauxMarge"] as const).map((key) => (
                  <th key={key} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">
                    <button onClick={() => setSortBy(key)} className={`hover:text-foreground ${sortBy === key ? "text-primary" : "text-muted-foreground"}`}>
                      {key === "quantite" ? "Qté" : key === "ca" ? "CA" : key === "cout" ? "Coût" : key === "marge" ? "Marge" : "% Marge"}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Prix moy.</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Coût moy.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-border">
              {tableLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                ))
              ) : (table?.produits ?? []).length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune vente sur la période</td></tr>
              ) : (
                table?.produits.map((p) => (
                  <tr key={p.produitId} className="hover:bg-accent/30 dark:hover:bg-accent/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{p.titre}</p>
                      {p.codeBarre && <p className="text-xs text-muted-foreground">{p.codeBarre}</p>}
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
                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">{formatCurrency(p.prixMoyen)}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">{formatCurrency(p.coutMoyen)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {(table?.produits ?? []).length >= 50 && (
          <div className="border-t border-border p-4 text-center">
            <button
              onClick={() => setOffset(offset + 50)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/50"
            >
              Charger plus
            </button>
          </div>
        )}
      </motion.div>

      {/* Alerts + Returns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div variants={item} initial="hidden" animate="show" className="rounded-xl border border-destructive/30 bg-background p-6 dark:bg-card">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-destructive" />
            <h3 className="text-lg font-semibold text-foreground">Vendus sous coût</h3>
          </div>
          {sousCoutLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-4 bg-muted dark:bg-muted rounded animate-pulse" />)}</div>
          ) : (sousCout ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun produit vendu sous son coût sur la période.</p>
          ) : (
            <div className="space-y-2">
              {sousCout?.map((p) => (
                <div key={p.produitId} className="flex items-center justify-between rounded-lg bg-destructive/5 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.titre}</p>
                    <p className="text-xs text-muted-foreground">{p.quantite} unités · perte moy. {formatCurrency(p.perteMoyenne)}/unité</p>
                  </div>
                  <span className="text-sm font-mono text-destructive">{formatCurrency(p.perte)}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div variants={item} initial="hidden" animate="show" className="rounded-xl border border-border bg-background p-6 dark:bg-card">
          <div className="mb-4 flex items-center gap-2">
            <RotateCcw size={18} className="text-[var(--module-returns)]" />
            <h3 className="text-lg font-semibold text-foreground">Impact des retours</h3>
          </div>
          {retoursLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-4 bg-muted dark:bg-muted rounded animate-pulse" />)}</div>
          ) : (retoursData ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun retour sur la période.</p>
          ) : (
            <div className="space-y-2">
              {retoursData?.map((r) => (
                <div key={r.produitId} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.titre}</p>
                    <p className="text-xs text-muted-foreground">{r.quantite} unités retournées</p>
                  </div>
                  <span className="text-sm font-mono text-destructive">{formatCurrency(r.marge)}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Search size={11} className="inline mr-1" />
        Coût = coût réel du lot (FIFO) au moment de la vente (fallback prix d'achat pour l'historique). Marge brute = CA − coût. Marge nette = marge brute − remises − retours. Bénéfice net = marge nette − dépenses − pertes.
      </p>
        </>
      ) : onglet === "lots" ? (
        <LotsTab dateDebut={dateDebut} dateFin={dateFin} />
      ) : onglet === "produits" ? (
        <ProduitsTab dateDebut={dateDebut} dateFin={dateFin} />
      ) : (
        <BeneficeTab dateDebut={dateDebut} dateFin={dateFin} />
      )}
    </div>
  );
}
