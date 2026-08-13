"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Search } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";

export default function NewPartnerFacturePage() {
  const router = useRouter();
  const [partenaireId, setPartenaireId] = useState<number | undefined>(undefined);
  const [produitId, setProduitId] = useState<number | undefined>(undefined);
  const [quantite, setQuantite] = useState(1);
  const [prixFacture, setPrixFacture] = useState(0);
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const utils = api.useUtils();

  const { data: fournisseurs } = api.reference.listFournisseurs.useQuery();
  const { data: searchResults } = api.catalog.list.useQuery(
    { query: query || undefined, limit: 20 },
    { enabled: query.length >= 2 },
  );

  const createMut = api.partner.createFacture.useMutation({
    onSuccess: () => {
      utils.partner.listFactures.invalidate();
      toast.success("Facture partenaire créée");
      router.push("/dashboard/partner/factures");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!partenaireId) { toast.error("Sélectionnez un partenaire"); return; }
    if (!produitId) { toast.error("Sélectionnez un produit"); return; }
    if (prixFacture <= 0) { toast.error("Le prix facture est requis"); return; }
    createMut.mutate({
      partenaireId,
      produitId,
      quantite,
      prixFacture,
      notes: notes || undefined,
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/partner/factures" className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <FileText className="size-5 text-destructive" />
          Nouvelle facture partenaire
        </h1>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Partenaire</h3>
        <select value={partenaireId ?? ""} onChange={e => setPartenaireId(Number(e.target.value))}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
          <option value="">Sélectionner un partenaire</option>
          {fournisseurs?.map((f: any) => (
            <option key={f.id} value={f.id}>{f.nom}</option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Produit</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
            placeholder="Rechercher un produit..." />
        </div>
        {query.length >= 2 && searchResults?.items?.map((p: any) => (
          <button key={p.id} type="button" onClick={() => { setProduitId(Number(p.id)); setPrixFacture(Number(p.prixVente)); setQuery(""); }}
            className={`w-full flex items-center justify-between rounded border px-3 py-2 text-left transition-colors ${
              produitId === Number(p.id) ? "border-destructive bg-destructive/10" : "border-border bg-muted hover:bg-accent"
            }`}>
            <span className="text-sm text-foreground truncate flex-1">{p.titre}</span>
            <span className="text-xs text-warning-foreground">{Number(p.prixVente).toLocaleString()} F</span>
          </button>
        ))}
        {produitId && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Quantité</label>
              <input type="number" value={quantite} min={1}
                onChange={e => setQuantite(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Prix facture</label>
              <input type="number" value={prixFacture || ""} min={0}
                onChange={e => setPrixFacture(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground" />
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Notes (optionnel)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          placeholder="Notes internes..." />
      </div>

      <Button onClick={handleSubmit} disabled={createMut.isPending}
        className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
        {createMut.isPending ? "Création..." : "Créer la facture"}
      </Button>
    </div>
  );
}
