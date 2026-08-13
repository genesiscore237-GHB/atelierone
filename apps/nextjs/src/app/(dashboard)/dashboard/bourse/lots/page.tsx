"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Package, Filter } from "lucide-react";
import { api } from "~/trpc/react";

const STATUTS = ["stocke", "vendu", "perdu"] as const;

export default function LotsBoursePage() {
  const [statut, setStatut] = useState<string>("stocke");
  const { data, isLoading } = api.bourse.getLots.useQuery(
    { statut: statut as any, limit: 100 },
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/bourse" className="rounded-lg border border-border/10 p-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Package className="size-5 text-primary" />
          Lots bourse
        </h1>
      </div>

      <div className="flex gap-2">
        {STATUTS.map(s => (
          <button key={s} onClick={() => setStatut(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statut === s ? "bg-primary text-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}>
            {s === "stocke" ? "En stock" : s === "vendu" ? "Vendus" : "Perdus"}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card/50 overflow-x-auto">
        <table className="w-full text-sm" data-testid="lots-table">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs uppercase">
              <th className="text-left px-4 py-3 font-medium">Lot#</th>
              <th className="text-left px-4 py-3 font-medium">Rachat</th>
              <th className="text-left px-4 py-3 font-medium">Produit</th>
              <th className="text-left px-4 py-3 font-medium">Prix reseal</th>
              <th className="text-left px-4 py-3 font-medium">Vendu</th>
              <th className="text-left px-4 py-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Chargement...</td></tr>
            ) : data?.items?.length ? data.items.map((lot: any) => (
              <tr key={lot.id} data-testid="lot-row" className="border-b border-border/50 hover:bg-accent/30">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground" data-cell="numero">#{lot.id}</td>
                <td className="px-4 py-3">
                  <span className="text-xs text-muted-foreground" data-testid="rachat-reference">#{lot.rachatId}</span>
                </td>
                <td className="px-4 py-3 text-foreground">{lot.titre ?? lot.produitId}</td>
                <td className="px-4 py-3 font-mono text-warning-foreground">{Number(lot.prixReseal).toLocaleString()} F</td>
                <td className="px-4 py-3">
                  {lot.vendu ? <span className="text-success-foreground text-xs">Oui</span> : <span className="text-muted-foreground text-xs">Non</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    lot.statut === "stocke" ? "bg-primary/10 text-primary" :
                    lot.statut === "vendu" ? "bg-success/10 text-success-foreground" :
                    "bg-destructive/10 text-destructive"
                  }`}>{lot.statut}</span>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Aucun lot trouvÃ©</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
