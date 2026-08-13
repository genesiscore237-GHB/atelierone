"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { formatCurrency, formatDateTime } from "~/lib/format";
import { CalendarDays, Download, Search, Filter, Eye, ArrowRight } from "lucide-react";
import { api } from "~/trpc/react";
import { toast } from "sonner";

const statutBadge: Record<string, { label: string; cls: string }> = {
  termine: { label: "Terminée", cls: "bg-success/10 text-success-foreground border-success/20" },
  annule: { label: "Annulée", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  suspendue: { label: "Suspendue", cls: "bg-warning/10 text-warning-foreground border-warning/20" },
};

export default function SalesPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: sales = [], isLoading, error } = api.sales.list.useQuery(
    { search: searchTerm },
  );

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Ventes Historiques
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consultez et gérez l'historique des ventes
          </p>
        </div>
        <Link href="/dashboard/pos">
          <Button className="bg-primary text-foreground hover:bg-primary/80">
            Nouvelle vente <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Rechercher par numéro de vente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>
          <Button variant="ghost" size="sm" className="border border-border bg-accent/30 text-foreground hover:bg-accent/50">
            <CalendarDays className="w-4 h-4 mr-2" />
            Période
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h3 className="text-sm font-semibold text-foreground">Ventes ({sales.length})</h3>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : sales.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg font-medium text-muted-foreground">Aucune vente trouvée</p>
            <p className="text-sm text-muted-foreground">Les ventes apparaîtront ici une fois qu'elles seront créées.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Référence</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Paiement</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Montant</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Statut</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sales.map((sale) => {
                const badge = statutBadge[sale.statut ?? "termine"] ?? { label: sale.statut, cls: "bg-muted text-muted-foreground" };
                return (
                  <tr key={sale.id} className="hover:bg-accent transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{sale.reference}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{sale.createdAt ? formatDateTime(sale.createdAt) : "—"}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground capitalize">{sale.modePaiement}</td>
                    <td className="px-6 py-4 text-sm font-mono text-right text-foreground">{formatCurrency(sale.montantTotal)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right"></td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
