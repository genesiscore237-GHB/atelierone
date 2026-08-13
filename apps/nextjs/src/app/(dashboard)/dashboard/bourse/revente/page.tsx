"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";

export default function ReventeBoursePage() {
  const router = useRouter();
  const utils = api.useUtils();

  const { data: lots, isLoading } = api.bourse.lotsDisponibles.useQuery(
    { statut: "stocke" },
  );

  const { data: clients } = api.customers.list.useQuery({ limit: 50 });

  const [selectedLot, setSelectedLot] = useState<number | null>(null);
  const [prixVente, setPrixVente] = useState(0);
  const [clientId, setClientId] = useState<number | undefined>(undefined);

  const reventeMut = api.bourse.vendreOccasion.useMutation({
    onSuccess: () => {
      utils.bourse.lotsDisponibles.invalidate();
      toast.success("Lot revendu avec succès");
      setSelectedLot(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSelectLot = (lot: any) => {
    setSelectedLot(lot.id);
    setPrixVente(Number(lot.prixReseal) || Number(lot.prixUnitaire));
  };

  const handleVendre = () => {
    if (!selectedLot) { toast.error("Sélectionnez un lot"); return; }
    reventeMut.mutate({
      lotId: selectedLot,
      prixVente,
      clientId,
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/bourse" className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <ShoppingBag className="size-5 text-primary" />
          Revente bourse (occasion)
        </h1>
      </div>

      {!selectedLot && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Lots disponibles en stock</h3>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : lots?.items?.length ? (
            <div className="space-y-2" data-testid="table-lots">
              {lots.items.map((lot: any) => (
                <button key={lot.id} type="button" onClick={() => handleSelectLot(lot)}
                  data-testid="lot-row"
                  className="w-full flex items-center justify-between rounded-lg border border-border bg-muted p-3 text-left hover:bg-accent transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{lot.titre}</p>
                    <p className="text-xs text-muted-foreground">Lot #{lot.id} · Qté: {lot.quantiteDisponible ?? 1}</p>
                  </div>
                  <span className="text-xs text-muted-foreground" data-cell="prix-achat">{Number(lot.prixUnitaire ?? 0).toLocaleString()} F</span>
                  <span className="text-xs font-mono text-warning-foreground" data-cell="prix-revente">{Number(lot.prixReseal ?? lot.prixUnitaire).toLocaleString()} F</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-3">Aucun lot en stock</p>
          )}
        </div>
      )}

      {selectedLot && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Détails de la vente</h3>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Prix de vente</label>
            <input type="number" value={prixVente} min={0}
              onChange={e => setPrixVente(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Client</label>
            <select value={clientId ?? ""} onChange={e => setClientId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
              <option value="">Client anonyme</option>
              {(Array.isArray(clients) ? clients : []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.nom} {c.prenom}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setSelectedLot(null)}
              className="border-border text-muted-foreground">Annuler</Button>
            <Button onClick={handleVendre} disabled={reventeMut.isPending || prixVente <= 0}
              className="bg-primary text-foreground hover:bg-primary/80">
              {reventeMut.isPending ? "Vente en cours..." : "Confirmer la vente"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
