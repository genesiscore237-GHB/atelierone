"use client";

import { api } from "~/trpc/react";

export function TopProducts() {
  const { data } = api.analytics.getTopArticles.useQuery({ limit: 5 }, { staleTime: 30_000 });

  if (!data || data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-border/10 bg-accent/20 text-sm text-muted-foreground">
        Aucun produit vendu
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/10 bg-accent/20 p-4 md:p-6 shadow-xl">
      <h3 className="mb-4 text-xs font-black tracking-widest text-muted-foreground uppercase">
        Top produits (semaine)
      </h3>
      <div className="space-y-2">
        {(data as any[]).slice(0, 5).map((item: any, i: number) => (
          <div
            key={item.produitId ?? i}
            className="flex items-center gap-3 rounded-xl border border-border/5 bg-muted/50 px-3 py-2.5"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-black text-primary">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {item.titre ?? item.productTitle ?? `Produit #${item.produitId}`}
              </p>
              <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
                {item.quantiteVendue ?? item.totalSold ?? 0} vendus
              </p>
            </div>
            <span className="shrink-0 text-sm font-black text-foreground">
              {Number(item.caTotal ?? item.totalRevenue ?? 0).toLocaleString("fr-FR", {
                minimumFractionDigits: 0, maximumFractionDigits: 0,
              })} F
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
