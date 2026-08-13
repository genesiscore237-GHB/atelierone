"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { TrendingUp, DollarSign, Package, AlertTriangle, Calendar, BarChart3, PieChart, Users, ShoppingCart, Trophy, User, Box } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart as RechartsPieChart, Cell } from "recharts";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  const utils = api.useUtils();

  // Real-time KPIs
  const { data: realtimeKPIs, isLoading: kpisLoading } = api.analytics.getRealtimeKPIs.useQuery();

  // Sales summary
  const { data: salesSummary, isLoading: salesLoading } = api.analytics.getSalesSummary.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate
  });

  // Margin analysis
  const { data: marginAnalysis, isLoading: marginLoading } = api.analytics.getMarginAnalysis.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate
  });

  // Sales trends
  const { data: salesTrends, isLoading: trendsLoading } = api.analytics.getSalesTrends.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    groupBy: "day"
  });

  // Top products
  const { data: topProducts, isLoading: topLoading } = api.analytics.getTopProducts.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    limit: 10
  });

  // Stock turnover
  const { data: stockTurnover, isLoading: turnoverLoading } = api.analytics.getStockTurnover.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate
  });

  // Top Vendeurs
  const { data: topVendeurs, isLoading: vendeursLoading } = api.analytics.getTopVendeurs.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    limit: 10,
  });

  // Top Clients
  const { data: topClients, isLoading: clientsLoading } = api.analytics.getTopClients.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    limit: 10,
  });

  // Top Articles
  const { data: topArticles, isLoading: articlesLoading } = api.analytics.getTopArticles.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    limit: 10,
  });

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XAF" }).format(amount);
  }

  function formatPercent(value: number) {
    return `${value.toFixed(1)}%`;
  }

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1'];

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics & Reporting</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tableaux de bord et analyses de performance</p>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-muted-foreground" />
          <span className="text-sm font-medium text-foreground/80">Période:</span>
        </div>
        <div className="flex gap-3">
          <input
            type="date"
            className="rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border text-foreground"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
          />
          <span className="text-muted-foreground">à</span>
          <input
            type="date"
            className="rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border text-foreground"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
          />
        </div>
      </div>

      {/* Real-time KPIs */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ventes Aujourd'hui</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {kpisLoading ? "..." : formatCurrency(realtimeKPIs?.todaySales?.revenue || 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {realtimeKPIs?.todaySales?.count || 0} transactions
              </p>
            </div>
            <div className="rounded-lg bg-success/10 p-3 dark:bg-success/10">
              <DollarSign size={24} className="text-success-foreground" />
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ventes Mensuelles</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {kpisLoading ? "..." : formatCurrency(realtimeKPIs?.monthSales?.revenue || 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {realtimeKPIs?.monthSales?.count || 0} transactions
              </p>
            </div>
            <div className="rounded-lg bg-primary/10 p-3 dark:bg-primary/10">
              <TrendingUp size={24} className="text-primary" />
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Articles en Rupture</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {kpisLoading ? "..." : realtimeKPIs?.lowStockCount || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Nécessite réapprovisionnement
              </p>
            </div>
            <div className="rounded-lg bg-destructive/10 p-3 dark:bg-destructive/10">
              <AlertTriangle size={24} className="text-destructive" />
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Marge Brute</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {marginLoading ? "..." : formatCurrency(marginAnalysis?.resume?.margeBrute || 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Taux: {marginLoading ? "..." : formatPercent(marginAnalysis?.resume?.tauxMarge || 0)}
              </p>
            </div>
            <div className="rounded-lg bg-warning/10 p-3 dark:bg-warning/10">
              <BarChart3 size={24} className="text-warning-foreground" />
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        {/* Sales Trends Chart */}
        <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-foreground">Évolution des Ventes</h3>
            <p className="text-sm text-muted-foreground">Tendance sur la période sélectionnée</p>
          </div>
          <div className="h-64">
            {trendsLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesTrends}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: any) => [formatCurrency(value), "Revenus"]}
                    labelFormatter={(label) => `Période: ${label}`}
                  />
                  <Line type="monotone" dataKey="totalRevenue" stroke="#8884d8" strokeWidth={2} dot={{ fill: '#8884d8' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Top Products Chart */}
        <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-foreground">Top Produits</h3>
            <p className="text-sm text-muted-foreground">Par revenus générés</p>
          </div>
          <div className="h-64">
            {topLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts?.slice(0, 5)} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="productTitle" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip formatter={(value: any) => [formatCurrency(value), "Revenus"]} />
                  <Bar dataKey="totalRevenue" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>

      {/* Tables Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Margin Analysis Table */}
        <motion.div variants={item} className="rounded-xl border border-border bg-background dark:border-border dark:bg-card">
          <div className="border-b border-border p-6 dark:border-border">
            <h3 className="text-lg font-semibold text-foreground">Analyse de Marge</h3>
            <p className="text-sm text-muted-foreground mt-1">Performance par produit</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 dark:bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Produit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenus</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Marge</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">% Marge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border">
                {marginLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : marginAnalysis?.produits?.slice(0, 10).map((item) => {
                  const marginPercent = item.revenue > 0 ? (item.margin / item.revenue * 100) : 0;
                  return (
                    <tr key={item.productId} className="hover:bg-accent/30 dark:hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground">{item.productTitle}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono text-muted-foreground">{formatCurrency(item.revenue)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-mono ${item.margin >= 0 ? 'text-success-foreground' : 'text-destructive'}`}>
                          {formatCurrency(item.margin)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-mono ${marginPercent >= 0 ? 'text-success-foreground' : 'text-destructive'}`}>
                          {formatPercent(marginPercent)}
                        </span>
                      </td>
                    </tr>
                  );
                }) || []}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Stock Turnover Table */}
        <motion.div variants={item} className="rounded-xl border border-border bg-background dark:border-border dark:bg-card">
          <div className="border-b border-border p-6 dark:border-border">
            <h3 className="text-lg font-semibold text-foreground">Rotation Stock</h3>
            <p className="text-sm text-muted-foreground mt-1">Efficacité de gestion des stocks</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 dark:bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Produit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Stock Moyen</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendus</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Ratio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border">
                {turnoverLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : stockTurnover?.slice(0, 10).map((item) => (
                  <tr key={item.productId} className="hover:bg-accent/30 dark:hover:bg-accent/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{item.productTitle}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-mono text-muted-foreground">{item.averageStock?.toFixed(1) || 0}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-mono text-muted-foreground">{item.totalSold || 0}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-mono ${item.turnoverRatio && item.turnoverRatio > 2 ? 'text-success-foreground' : item.turnoverRatio && item.turnoverRatio < 1 ? 'text-destructive' : 'text-warning-foreground'}`}>
                        {item.turnoverRatio?.toFixed(1) || 0}
                      </span>
                    </td>
                  </tr>
                )) || []}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      {/* Top Rankings Row */}
      <div className="grid gap-6 lg:grid-cols-3 mt-8">
        {/* Top Vendeurs */}
        <motion.div variants={item} className="rounded-xl border border-border bg-background dark:border-border dark:bg-card">
          <div className="border-b border-border p-6 dark:border-border">
            <div className="flex items-center gap-2">
              <Trophy size={18} className="text-warning-foreground" />
              <h3 className="text-lg font-semibold text-foreground">Top Vendeurs</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Par chiffre d'affaires</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 dark:bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Vendeur</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Ventes</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">CA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border">
                {vendeursLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}><td colSpan={3} className="px-4 py-3"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : topVendeurs?.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune donnée</td></tr>
                ) : (
                  topVendeurs?.map((v, i) => (
                    <tr key={i} className="hover:bg-accent/30 dark:hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-warning/10 text-warning-foreground dark:bg-warning/20 dark:text-warning-foreground" : i === 1 ? "bg-muted text-foreground/80 dark:bg-muted dark:text-foreground" : i === 2 ? "bg-warning/10 text-warning-foreground dark:bg-warning/20 dark:text-warning-foreground" : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground"}`}>
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium text-foreground">
                            {v.prenom ?? ""} {v.nom ?? `#${v.vendeurId}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-muted-foreground">{v.nbVentes}</td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-foreground">{formatCurrency(Number(v.caTotal))}</td>
                    </tr>
                  )) || []
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Top Clients */}
        <motion.div variants={item} className="rounded-xl border border-border bg-background dark:border-border dark:bg-card">
          <div className="border-b border-border p-6 dark:border-border">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-primary" />
              <h3 className="text-lg font-semibold text-foreground">Top Clients</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Par chiffre d'affaires</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 dark:bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Client</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Achats</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">CA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border">
                {clientsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}><td colSpan={3} className="px-4 py-3"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : topClients?.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune donnée</td></tr>
                ) : (
                  topClients?.map((c, i) => (
                    <tr key={i} className="hover:bg-accent/30 dark:hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-warning/10 text-warning-foreground dark:bg-warning/20 dark:text-warning-foreground" : i === 1 ? "bg-muted text-foreground/80 dark:bg-muted dark:text-foreground" : i === 2 ? "bg-warning/10 text-warning-foreground dark:bg-warning/20 dark:text-warning-foreground" : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground"}`}>
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium text-foreground">
                            {c.nom ?? `Client #${c.clientId}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-muted-foreground">{c.nbAchats}</td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-foreground">{formatCurrency(Number(c.caTotal))}</td>
                    </tr>
                  )) || []
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Top Articles */}
        <motion.div variants={item} className="rounded-xl border border-border bg-background dark:border-border dark:bg-card">
          <div className="border-b border-border p-6 dark:border-border">
            <div className="flex items-center gap-2">
              <Box size={18} className="text-success-foreground" />
              <h3 className="text-lg font-semibold text-foreground">Top Articles</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Par quantité vendue</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 dark:bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Article</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Qté</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">CA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border">
                {articlesLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}><td colSpan={3} className="px-4 py-3"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : topArticles?.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune donnée</td></tr>
                ) : (
                  topArticles?.map((a, i) => (
                    <tr key={i} className="hover:bg-accent/30 dark:hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-warning/10 text-warning-foreground dark:bg-warning/20 dark:text-warning-foreground" : i === 1 ? "bg-muted text-foreground/80 dark:bg-muted dark:text-foreground" : i === 2 ? "bg-warning/10 text-warning-foreground dark:bg-warning/20 dark:text-warning-foreground" : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground"}`}>
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium text-foreground truncate max-w-[150px]">
                            {a.titre ?? `#${a.produitId}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-primary">{a.quantiteVendue}</td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-foreground">{formatCurrency(Number(a.caTotal))}</td>
                    </tr>
                  )) || []
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}