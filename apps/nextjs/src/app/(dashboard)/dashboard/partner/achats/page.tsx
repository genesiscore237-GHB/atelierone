"use client";

import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";

export default function PartnerAchatsPage() {
  const { data, isLoading } = api.partner.listAchats.useQuery({ limit: 50 });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Building2 className="size-5 text-primary" />
          Achats partenaires
        </h1>
        <Link href="/dashboard/partner/achats/new">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4 mr-1" /> Nouvel achat
          </Button>
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs uppercase">
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Partenaire</th>
              <th className="text-left px-4 py-3 font-medium">RÃ©f. vente</th>
              <th className="text-left px-4 py-3 font-medium">Commission</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Chargement...</td></tr>
            ) : data?.items?.length ? data.items.map((a: any) => (
              <tr key={a.id} className="border-b border-border/50 hover:bg-accent">
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-3 text-foreground">{a.partenaire?.nom ?? a.partenaireId}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">#{a.venteId}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {a.commissionAgent != null ? (
                    <span className="text-warning-foreground">{Number(a.commissionAgent).toLocaleString()} F</span>
                  ) : <span className="text-muted-foreground">-</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-foreground">
                  {a.total ? `${Number(a.total).toLocaleString()} F` : "-"}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Aucun achat partenaire</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
