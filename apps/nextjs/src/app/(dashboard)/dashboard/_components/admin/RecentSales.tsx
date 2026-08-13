"use client";

import { api } from "~/trpc/react";

export function RecentSales() {
  const { data } = api.sales.list.useQuery({ limit: 5 }, { staleTime: 30_000 });

  if (!data || data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-border/10 bg-accent/20 text-sm text-muted-foreground">
        Aucune vente récente
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/10 bg-accent/20 p-4 md:p-6 shadow-xl">
      <h3 className="mb-4 text-xs font-black tracking-widest text-muted-foreground uppercase">
        Dernières ventes
      </h3>
      <div className="space-y-2">
        {data.slice(0, 5).map((sale: any) => (
          <div
            key={sale.id}
            className="flex items-center justify-between rounded-xl border border-border/5 bg-muted/50 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {sale.client?.nom || "Client libre"}
              </p>
              <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
                {new Date(sale.dateVente || sale.createdAt).toLocaleString("fr-FR", {
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
            <span className="shrink-0 text-sm font-black text-foreground">
              {Number(sale.total).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} F
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
