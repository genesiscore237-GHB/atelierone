"use client";

import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";

export default function PartnerFacturesPage() {
  const { data, isLoading } = api.partner.listFactures.useQuery({ limit: 50 });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <FileText className="size-5 text-destructive" />
          Factures partenaires
        </h1>
        <Link href="/dashboard/partner/factures/new">
          <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            <Plus className="size-4 mr-1" /> Nouvelle facture
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
              <th className="text-right px-4 py-3 font-medium">Ã‰cart</th>
              <th className="text-right px-4 py-3 font-medium">Total facture</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Chargement...</td></tr>
            ) : data?.items?.length ? data.items.map((f: any) => (
              <tr key={f.id} className="border-b border-border/50 hover:bg-accent">
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {f.dateFacture ? new Date(f.dateFacture).toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-3 text-foreground">{f.partenaire?.nom ?? f.partenaireId}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">#{f.venteId}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {f.ecart != null ? (
                    Number(f.ecart) >= 0
                      ?                   <span className="text-success-foreground">+{Number(f.ecart).toLocaleString()} F</span>
                      : <span className="text-destructive">{Number(f.ecart).toLocaleString()} F</span>
                  ) : <span className="text-muted-foreground">-</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-foreground">
                  {f.total ? `${Number(f.total).toLocaleString()} F` : "-"}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Aucune facture partenaire</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
