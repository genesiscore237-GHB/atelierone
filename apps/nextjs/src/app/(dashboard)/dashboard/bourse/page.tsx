"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Plus, BookOpen, ArrowLeft, ShoppingBag, RefreshCw, Package } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { formatDate } from "~/lib/format";

export default function BoursePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { data, isLoading } = api.bourse.list.useQuery({ query: query || undefined, limit: 100 });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="rounded-lg border border-border/10 p-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <BookOpen className="size-5 text-warning-foreground" />
              Bourse aux livres
            </h1>
            <p className="text-xs text-muted-foreground">Rachat et revente de manuels scolaires d'occasion</p>
          </div>
        </div>
        <Link href="/dashboard/bourse/nouveau">
          <Button className="bg-warning text-foreground hover:bg-warning/80">
            <Plus className="size-4" /> Nouveau rachat
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">Total racheté</p>
          <p className="text-lg font-bold text-warning-foreground" data-testid="total-rachete">
            {data?.items?.reduce((s: number, r: any) => s + Number(r.montantTotal || 0), 0).toLocaleString() ?? 0} F
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">Total revendu</p>
          <p className="text-lg font-bold text-success-foreground" data-testid="total-revendu">0 F</p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase">Stock bourse</p>
          <p className="text-lg font-bold text-primary" data-testid="stock-bourse">0</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/dashboard/bourse/achat"
          className="rounded-xl border border-border bg-card/50 p-4 hover:bg-accent/50 transition-colors text-center">
          <BookOpen className="size-6 text-warning-foreground mx-auto mb-1" />
          <p className="text-xs font-medium text-foreground">Achat</p>
          <p className="text-[10px] text-muted-foreground">Rachat manuels</p>
        </Link>
        <Link href="/dashboard/bourse/echange"
          className="rounded-xl border border-border bg-card/50 p-4 hover:bg-accent/50 transition-colors text-center">
          <RefreshCw className="size-6 text-success-foreground mx-auto mb-1" />
          <p className="text-xs font-medium text-foreground">Échange</p>
          <p className="text-[10px] text-muted-foreground">Reprise + vente</p>
        </Link>
        <Link href="/dashboard/bourse/revente"
          className="rounded-xl border border-border bg-card/50 p-4 hover:bg-accent/50 transition-colors text-center">
          <ShoppingBag className="size-6 text-primary mx-auto mb-1" />
          <p className="text-xs font-medium text-foreground">Revente</p>
          <p className="text-[10px] text-muted-foreground">Vente occasion</p>
        </Link>
        <Link href="/dashboard/bourse/lots"
          className="rounded-xl border border-border bg-card/50 p-4 hover:bg-accent/50 transition-colors text-center">
          <Package className="size-6 text-primary mx-auto mb-1" />
          <p className="text-xs font-medium text-foreground">Lots</p>
          <p className="text-[10px] text-muted-foreground">Suivi des lots</p>
        </Link>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input value={query} onChange={e => setQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground"
          placeholder="Rechercher par référence..." />
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-border bg-card/50 p-12 text-center">
          <BookOpen className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Aucun rachat enregistré</p>
          <Link href="/dashboard/bourse/nouveau">
            <Button className="mt-4 bg-warning text-foreground hover:bg-warning/80">
              <Plus className="size-4" /> Premier rachat
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/50 text-xs text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Référence</th>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-left px-4 py-3">Montant</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-left px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((r: any) => (
                <tr key={r.id} className="hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/bourse/${r.id}`)}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-foreground">{r.reference}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground/80">{r.clientNom || "—"}</td>
                  <td className="px-4 py-3 font-mono text-warning-foreground">{Number(r.montantTotal).toLocaleString()} F</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      r.statut === "termine" ? "bg-success/10 text-success-foreground" :
                      r.statut === "brouillon" ? "bg-muted text-foreground/80" : "bg-destructive/10 text-destructive"
                    }`}>{r.statut}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.createdAt ? formatDate(new Date(r.createdAt)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
