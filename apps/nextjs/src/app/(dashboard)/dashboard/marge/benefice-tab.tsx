"use client";

import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import Link from "next/link";
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, PieChart as PieIcon, Loader2, ReceiptText, HandCoins } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

const TYPE_PERTE_LABELS: Record<string, string> = {
  CASSE: "Casse",
  VOL: "Vol",
  AVARIE: "Avarie",
  INVENTAIRE_NEGATIF: "Inventaire négatif",
  REBUT: "Mise au rebut",
  REJET_RECEPTION: "Rejet de réception",
  ECART_CAISSE: "Écart de caisse",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XAF", maximumFractionDigits: 0 }).format(amount);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export default function BeneficeTab({ dateDebut, dateFin }: { dateDebut: string; dateFin: string }) {
  const { data: kpis, isLoading, error } = api.profit.getProfitKpis.useQuery({ dateDebut, dateFin });
  const { data: series, isLoading: seriesLoading } = api.profit.getProfitSeries.useQuery({ dateDebut, dateFin });

  const cards: { label: string; value: number; icon: React.ReactNode; loading: boolean; note?: string }[] = [
    {
      label: "CA facturé",
      value: kpis?.ca ?? 0,
      icon: <Wallet size={18} className="text-primary" />,
      loading: isLoading,
    },
    {
      label: "CA encaissé réel",
      value: kpis?.caEncaisse ?? 0,
      icon: <Wallet size={18} className="text-primary" />,
      loading: isLoading,
      note: "reçu − remboursements retours",
    },
    {
      label: "Marge brute",
      value: kpis?.margeBrute ?? 0,
      icon: <TrendingUp size={18} className="text-success" />,
      loading: isLoading,
    },
    {
      label: "Marge nette (après remises & retours)",
      value: kpis?.margeNet ?? 0,
      icon: <TrendingUp size={18} className="text-success" />,
      loading: isLoading,
    },
    {
      label: "Dépenses d'exploitation",
      value: kpis?.depenses ?? 0,
      icon: <TrendingDown size={18} className="text-danger" />,
      loading: isLoading,
    },
    {
      label: "Paiements fournisseurs",
      value: kpis?.paiementsFournisseurs ?? 0,
      icon: <TrendingDown size={18} className="text-danger" />,
      loading: isLoading,
    },
    {
      label: "Pertes",
      value: kpis?.pertes ?? 0,
      icon: <AlertTriangle size={18} className="text-warning" />,
      loading: isLoading,
    },
    {
      label: "Sorties totales",
      value: kpis?.sortiesTotal ?? 0,
      icon: <TrendingDown size={18} className="text-danger" />,
      loading: isLoading,
    },
    {
      label: "Résultat de trésorerie",
      value: kpis?.resultatTresorerie ?? 0,
      icon: <Wallet size={18} className="text-primary" />,
      loading: isLoading,
      note: "CA encaissé − sorties",
    },
    {
      label: "Écarts de caisse",
      value: kpis?.ecartsCaisse ?? 0,
      icon: <AlertTriangle size={18} className="text-warning" />,
      loading: isLoading,
    },
  ];

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
          Erreur de chargement : {error.message}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {cards.map((c) => (
              <motion.div key={c.label} variants={item} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
                  {c.icon}
                </div>
                <p className="mt-2 text-xl font-bold text-foreground">
                  {c.loading ? <Loader2 className="animate-spin" size={18} /> : formatCurrency(c.value)}
                </p>
                {c.note && <p className="mt-0.5 text-[10px] text-muted-foreground">{c.note}</p>}
              </motion.div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <motion.div variants={item} className={`rounded-xl border p-6 shadow-sm ${(kpis?.beneficeNet ?? 0) >= 0 ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Bénéfice net (économique) — principal</p>
                  <p className="mt-1 text-3xl font-bold text-foreground">{formatCurrency(kpis?.beneficeNet ?? 0)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Σ marges nettes des ventes (coût d'achat déjà déduit) − dépenses d'exploitation
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-muted-foreground">Taux de bénéfice</p>
                  <p className={`mt-1 text-xl font-bold ${(kpis?.tauxBenefice ?? 0) >= 0 ? "text-success" : "text-danger"}`}>
                    {formatPercent(kpis?.tauxBenefice ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{kpis?.nbVentes ?? 0} ventes</p>
                </div>
              </div>
            </motion.div>

            <motion.div variants={item} className={`rounded-xl border p-6 shadow-sm ${(kpis?.resultatTresorerie ?? 0) >= 0 ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Résultat de trésorerie — complément</p>
                  <p className="mt-1 text-3xl font-bold text-foreground">{formatCurrency(kpis?.resultatTresorerie ?? 0)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    CA encaissé − (paiements fournisseurs + dépenses + pertes). Écart avec le bénéfice net = achats de lots non encore vendus.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/finance"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              <ReceiptText size={14} /> Historique détaillé des dépenses
            </Link>
            <Link
              href="/dashboard/procurement"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              <HandCoins size={14} /> Dettes & paiements fournisseurs
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <motion.div variants={item} className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
              <h2 className="mb-4 text-sm font-semibold text-foreground">Évolution mensuelle</h2>
              {seriesLoading || !series || series.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  {seriesLoading ? <Loader2 className="animate-spin" size={20} /> : "Aucune donnée sur la période"}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={series} margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="periode" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(Number(value ?? 0))}
                      contentStyle={{ backgroundColor: "var(--background)", border: "1px solid var(--border)", borderRadius: 8 }}
                    />
                    <Legend />
                    <Bar dataKey="caEncaisse" name="CA encaissé" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="benefice" name="Bénéfice net" fill="var(--color-success-500)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="depenses" name="Dépenses" fill="var(--color-danger-400)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="pertes" name="Pertes" fill="var(--color-warning-400)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </motion.div>

            <div className="space-y-6">
              <motion.div variants={item} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-foreground">Dépenses par catégorie</h2>
                {!kpis || kpis.depensesParCategorie.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Aucune dépense</p>
                ) : (
                  <ul className="space-y-2">
                    {kpis.depensesParCategorie.map((d) => (
                      <li key={d.categorie} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{d.categorie}</span>
                        <span className="font-medium text-foreground">{formatCurrency(d.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>

              <motion.div variants={item} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <PieIcon size={15} className="text-warning" /> Pertes par type
                </h2>
                {!kpis || kpis.pertesParType.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Aucune perte</p>
                ) : (
                  <ul className="space-y-2">
                    {kpis.pertesParType.map((p) => (
                      <li key={p.typePerte} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{TYPE_PERTE_LABELS[p.typePerte] ?? p.typePerte}</span>
                        <span className="font-medium text-foreground">{formatCurrency(p.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
