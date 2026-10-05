"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { formatCurrency, formatDateTime } from "~/lib/format";
import { Search, Filter, Eye, ArrowRight, Receipt, User, Wrench } from "lucide-react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";

const statutBadge: Record<string, { label: string; cls: string }> = {
  termine: { label: "Terminée", cls: "bg-success/10 text-success-foreground border-success/20" },
  annule: { label: "Annulée", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  suspendue: { label: "Suspendue", cls: "bg-warning/10 text-warning-foreground border-warning/20" },
};

export default function SalesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: sales = [], isLoading, error } = api.sales.list.useQuery(
    { search: searchTerm, dateDebut: dateDebut || undefined, dateFin: dateFin || undefined },
  );

  const { data: detail } = api.sales.getById.useQuery(
    { venteId: selectedId ?? "" },
    { enabled: selectedId !== null },
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Rechercher par numéro, client…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="h-10 rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none focus:border-primary"
              title="Du"
            />
            <span className="text-xs text-muted-foreground">au</span>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="h-10 rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none focus:border-primary"
              title="Au"
            />
          </div>
          {(dateDebut || dateFin) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateDebut(""); setDateFin(""); }}>
              Réinitialiser
            </Button>
          )}
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
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Paiement</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">OR lié</th>
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
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {sale.clientNom ? (
                        sale.clientId ? (
                          <Link href={`/dashboard/customers/${sale.clientId}`} className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:underline">
                            <User size={13} className="text-muted-foreground" /> {sale.clientNom}
                          </Link>
                        ) : (
                          sale.clientNom
                        )
                      ) : "—"}
                      {sale.clientTelephone && <span className="ml-2 text-xs text-muted-foreground/70">{sale.clientTelephone}</span>}
                    </td>
                    <td className="px-6 py-4 text-sm capitalize text-muted-foreground">{sale.modePaiement}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {sale.ordres && sale.ordres.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {sale.ordres.map((o) => (
                            <Link key={o.orId} href={`/dashboard/ordres-reparation/${o.orId}`} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary hover:bg-primary/20">
                              <Wrench size={11} /> {o.orNumero}
                            </Link>
                          ))}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-right text-foreground">{formatCurrency(sale.montantTotal)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(sale.id)} title="Voir le détail de la vente">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={selectedId !== null} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <DialogContent className="max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt size={16} /> Détail de la vente {detail.reference}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Date</p>
                  <p className="mt-0.5">{detail.createdAt ? formatDateTime(detail.createdAt) : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client</p>
                  <p className="mt-0.5">{detail.clientNom ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Paiement</p>
                  <p className="mt-0.5 capitalize">{detail.modePaiement}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Montant total</p>
                  <p className="mt-0.5 font-mono font-semibold">{formatCurrency(detail.montantTotal)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Montant payé</p>
                  <p className="mt-0.5 font-mono">{formatCurrency(detail.montantPaye ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Statut</p>
                  <p className="mt-0.5 capitalize">{detail.status ?? detail.statut}</p>
                </div>
              </div>
              {detail.lignes && detail.lignes.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-2">Désignation</th>
                        <th className="px-4 py-2 text-right">Qté</th>
                        <th className="px-4 py-2 text-right">Prix unitaire</th>
                        <th className="px-4 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {detail.lignes.map((l: any) => (
                        <tr key={l.id}>
                          <td className="px-4 py-2">{l.titre ?? l.libelle ?? `Produit #${l.produitId}`}</td>
                          <td className="px-4 py-2 text-right">{l.quantite}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(l.prixUnitaire)}</td>
                          <td className="px-4 py-2 text-right font-semibold">{formatCurrency(l.totalLigne)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {detail.ordres && detail.ordres.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">OR lié(s)</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {detail.ordres.map((o: any) => (
                      <Link key={o.orId} href={`/dashboard/ordres-reparation/${o.orId}`} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary hover:bg-primary/20">
                        <Wrench size={11} /> {o.orNumero}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
