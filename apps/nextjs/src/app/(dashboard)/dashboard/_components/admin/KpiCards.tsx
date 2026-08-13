"use client";

import { api } from "~/trpc/react";

export function KpiCards() {
  const { data: stats } = api.dashboard.getStats.useQuery(undefined, { staleTime: 30_000 });
  const { data: alerts } = api.stock.getDashboard.useQuery(undefined, { staleTime: 30_000 });

  const cards = [
    {
      label: "CA Jour",
      value: stats?.todaySales != null
        ? `${stats.todaySales.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} F`
        : "…",
      icon: "📊",
      color: "text-[var(--module-finance)]",
      bg: "bg-[var(--module-finance-bg)]",
    },
    {
      label: "Ventes",
      value: stats?.todaySalesCount != null ? `${stats.todaySalesCount}` : "…",
      icon: "🛒",
      color: "text-[var(--module-sales)]",
      bg: "bg-[var(--module-sales-bg)]",
    },
    {
      label: "Alertes Stock",
      value: alerts?.alertesStock != null ? `${alerts.alertesStock}` : "…",
      icon: "⚠️",
      color: "text-[var(--module-alerts)]",
      bg: "bg-[var(--module-alerts-bg)]",
    },
    {
      label: "Caisses actives",
      value: stats?.activeCashSessions != null ? `${stats.activeCashSessions}` : "…",
      icon: "💳",
      color: "text-[var(--module-cash)]",
      bg: "bg-[var(--module-cash-bg)]",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-2xl border border-border/10 ${c.bg} p-4 md:p-5 shadow-xl`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
              {c.label}
            </span>
            <span className="text-lg">{c.icon}</span>
          </div>
          <p className={`mt-2 text-2xl md:text-3xl font-black ${c.color}`}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
