"use client";

import { api } from "~/trpc/react";

export function StockAlerts() {
  const { data } = api.stock.getAlertes.useQuery(undefined, { staleTime: 30_000 });

  if (!data || data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-border/10 bg-accent/20 text-sm text-muted-foreground">
        Aucune alerte stock
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/10 bg-accent/20 p-4 md:p-6 shadow-xl">
      <h3 className="mb-4 text-xs font-black tracking-widest text-muted-foreground uppercase">
        Alertes stock {data.length > 0 && `(${data.length})`}
      </h3>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {data.slice(0, 8).map((alert: any) => (
          <div
            key={alert.id}
            className="flex items-center justify-between rounded-xl border border-border/5 bg-muted/50 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {alert.titre || alert.produit?.titre || "Produit"}
              </p>
              <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
                Stock: {alert.quantite} / Seuil: {alert.seuilAlerte ?? alert.seuil}
              </p>
            </div>
            <span
              className={`shrink-0 text-[10px] font-black uppercase tracking-wider ${
                alert.niveau === "critique" ? "text-red-400" : "text-amber-400"
              }`}
            >
              {alert.niveau === "critique" ? "Critique" : "Faible"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
