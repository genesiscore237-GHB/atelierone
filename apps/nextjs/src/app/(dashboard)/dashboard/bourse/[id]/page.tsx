"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Package, ShoppingBag, RefreshCw } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";

export default function BourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: rachat, isLoading } = api.bourse.getById.useQuery({ id: Number(id) }, { enabled: !!id });

  if (isLoading) return <div className="p-6 text-muted-foreground">Chargement...</div>;
  if (!rachat) return <div className="p-6 text-muted-foreground">Rachat introuvable</div>;

  const typeLabel = (t: string) => {
    if (t === "rachat_bourse") return "Rachat bourse";
    if (t === "echange_bourse") return "Échange bourse";
    if (t === "rachat_simple") return "Rachat simple";
    return t;
  };

  const totalVendu = rachat.lignes?.filter((l: any) => l.vendu).length ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/bourse" className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <BookOpen className="size-5 text-warning-foreground" />
            {rachat.reference}
          </h1>
          <p className="text-xs text-muted-foreground">{typeLabel(rachat.type)}</p>
        </div>
        {rachat.type === "echange_bourse" && (
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
            Number(rachat.difference ?? 0) >= 0 ? "bg-success/10 text-success-foreground" : "bg-destructive/10 text-destructive"
          }`}>
            <RefreshCw className="size-3" />
            Solde: {Math.abs(Number(rachat.difference ?? 0)).toLocaleString()} F
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Informations</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><span className="text-muted-foreground">Client</span><p className="text-foreground">{rachat.clientNom ?? "—"}</p></div>
            <div><span className="text-muted-foreground">Contact</span><p className="text-foreground">{rachat.clientContact ?? "—"}</p></div>
            <div><span className="text-muted-foreground">Date</span><p className="text-foreground">{rachat.createdAt ? new Date(rachat.createdAt).toLocaleDateString("fr-FR") : "—"}</p></div>
            <div>
              <span className="text-muted-foreground">Statut</span>
              <p>
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  rachat.statut === "termine" ? "bg-success/10 text-success-foreground" :
                  rachat.statut === "brouillon" ? "bg-muted text-foreground/80" : "bg-destructive/10 text-destructive"
                }`}>{rachat.statut}</span>
              </p>
            </div>
            <div><span className="text-muted-foreground">Stocké</span><p className="text-foreground">{rachat.stocke ? "Oui" : "Non"}</p></div>
            <div><span className="text-muted-foreground">Type</span><p className="text-foreground">{typeLabel(rachat.type)}</p></div>
          </div>
          {rachat.notes && (
            <div className="pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground block mb-1">Notes</span>
              <p className="text-sm text-foreground/80">{rachat.notes}</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Montants</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total rachat</span>
              <span className="font-mono text-foreground">{Number(rachat.montantTotal).toLocaleString()} F</span>
            </div>
            {rachat.type === "echange_bourse" && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Montant échange</span>
                  <span className="font-mono text-primary">{Number(rachat.montantEchange).toLocaleString()} F</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border pt-2">
                  <span className="text-muted-foreground">Différence</span>
                  <span className={`font-mono font-bold ${Number(rachat.difference ?? 0) >= 0 ? "text-success-foreground" : "text-destructive"}`}>
                    {Number(rachat.difference ?? 0) >= 0 ? "+" : ""}{Number(rachat.difference).toLocaleString()} F
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Lignes vendues</span>
              <span className="font-mono text-success-foreground">{totalVendu}/{rachat.lignes?.length ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Articles</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground uppercase">
              <th className="text-left px-4 py-3">Produit</th>
              <th className="text-center px-4 py-3">État</th>
              <th className="text-center px-4 py-3">Qté</th>
              <th className="text-right px-4 py-3">Prix unitaire</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-center px-4 py-3">Lot</th>
              <th className="text-center px-4 py-3">Vendu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rachat.lignes?.map((l: any) => (
              <tr key={l.id} className="hover:bg-accent/50 transition-colors">
                <td className="px-4 py-3 text-foreground">
                  <span className="block text-sm truncate max-w-[200px]">#{l.produitId}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/80">{l.etat}</span>
                </td>
                <td className="px-4 py-3 text-center text-foreground/80">{l.quantite}</td>
                <td className="px-4 py-3 text-right font-mono text-foreground/80">{Number(l.prixUnitaire).toLocaleString()} F</td>
                <td className="px-4 py-3 text-right font-mono text-warning-foreground">{Number(l.totalLigne).toLocaleString()} F</td>
                <td className="px-4 py-3 text-center">
                  {l.lotId ? (
                    <Link href={`/dashboard/bourse/lots`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                      <Package className="size-3" /> #{l.lotId}
                    </Link>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {l.vendu ? (
                    <span className="text-success-foreground text-xs font-medium">Oui</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">Non</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-card">
              <td colSpan={4} className="px-4 py-3 text-right text-xs text-muted-foreground uppercase font-medium">Total</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-warning-foreground text-lg">{Number(rachat.montantTotal).toLocaleString()} F</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Actions rapides</h3>
        <div className="flex flex-wrap gap-2">
          {rachat.type === "rachat_bourse" && rachat.stocke && (
            <Link href="/dashboard/bourse/revente">
              <Button size="sm" className="bg-primary text-foreground hover:bg-primary/80">
                <ShoppingBag className="size-3 mr-1" /> Vendre un lot
              </Button>
            </Link>
          )}
          {rachat.type !== "echange_bourse" && (
            <Link href={`/dashboard/bourse/echange`}>
              <Button size="sm" variant="secondary" className="border-border text-foreground/80">
                <RefreshCw className="size-3 mr-1" /> Nouvel échange
              </Button>
            </Link>
          )}
          <Link href="/dashboard/bourse/lots">
            <Button size="sm" variant="secondary" className="border-border text-foreground/80">
              <Package className="size-3 mr-1" /> Voir les lots
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
