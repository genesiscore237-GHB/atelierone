"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Search, BookOpen } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";

const ETATS = [
  { value: "neuf", label: "Neuf", coeff: 0.7 },
  { value: "bon", label: "Bon état", coeff: 0.5 },
  { value: "moyen", label: "Moyen", coeff: 0.35 },
  { value: "usage", label: "Usagé", coeff: 0.2 },
];

interface LigneRachat {
  id: string;
  produitId: number | null;
  titre: string;
  quantite: number;
  etat: string;
  prixUnitaire: number;
  totalLigne: number;
}

export default function NouveauRachatPage() {
  const router = useRouter();
  const [clientNom, setClientNom] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [lignes, setLignes] = useState<LigneRachat[]>([]);
  const utils = api.useUtils();

  const { data: searchResults } = api.catalog.list.useQuery(
    { query: productSearch || undefined, type: "MANUEL", limit: 10 },
    { enabled: showProductSearch && productSearch.length >= 2 },
  );

  const createMutation = api.bourse.create.useMutation({
    onSuccess: (r) => {
      utils.bourse.list.invalidate();
      toast.success(`Rachat ${r.reference} créé`);
      router.push("/dashboard/bourse");
    },
    onError: (e) => toast.error(e.message),
  });

  const addLigne = (produit: any) => {
    const coeff = ETATS.find(e => e.value === "usage")!.coeff;
    const prixBase = Number(produit.prixVente) * coeff;
    const newLigne: LigneRachat = {
      id: `l_${Date.now()}`,
      produitId: Number(produit.id),
      titre: produit.titre,
      quantite: 1,
      etat: "usage",
      prixUnitaire: Math.round(prixBase * 100) / 100,
      totalLigne: Math.round(prixBase * 100) / 100,
    };
    setLignes(prev => [...prev, newLigne]);
    setShowProductSearch(false);
    setProductSearch("");
  };

  const updateLigne = (id: string, field: string, value: any) => {
    setLignes(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === "etat") {
        const coeff = ETATS.find(e => e.value === value)?.coeff ?? 0.2;
        updated.prixUnitaire = Math.round(Number(l.prixUnitaire) * coeff / (ETATS.find(e => e.value === l.etat)?.coeff ?? 0.2) * 100) / 100;
      }
      if (field === "prixUnitaire" || field === "quantite" || field === "etat") {
        updated.totalLigne = Math.round(updated.prixUnitaire * updated.quantite * 100) / 100;
      }
      return updated;
    }));
  };

  const removeLigne = (id: string) => setLignes(prev => prev.filter(l => l.id !== id));

  const montantTotal = lignes.reduce((sum, l) => sum + l.totalLigne, 0);

  const handleSubmit = async () => {
    if (lignes.length === 0) { toast.error("Ajoutez au moins un article"); return; }
    createMutation.mutate({
      clientNom: clientNom || undefined,
      clientContact: clientContact || undefined,
      notes: notes || undefined,
      lignes: lignes.map(l => ({
        produitId: l.produitId!,
        quantite: l.quantite,
        etat: l.etat as any,
      })),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/bourse" className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <BookOpen className="size-5 text-warning-foreground" />
          Nouveau rachat
        </h1>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Client</h3>
        <div className="grid grid-cols-2 gap-3">
          <input value={clientNom} onChange={e => setClientNom(e.target.value)}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            placeholder="Nom du client (optionnel)" />
          <input value={clientContact} onChange={e => setClientContact(e.target.value)}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            placeholder="Contact (optionnel)" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Articles</h3>
          <Button type="button" onClick={() => setShowProductSearch(true)}
            className="border border-border bg-accent/30 text-foreground hover:bg-accent/50 text-xs">
            <Plus className="size-3" /> Ajouter un manuel
          </Button>
        </div>

        {showProductSearch && (
          <div className="rounded-lg border border-border bg-muted p-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Rechercher un manuel..." autoFocus />
            </div>
            {searchResults?.items.map((p: any) => (
              <button key={p.id} type="button" onClick={() => addLigne(p)}
                className="w-full flex items-center justify-between rounded border border-border bg-muted px-3 py-2 text-left hover:bg-accent transition-colors">
                <span className="text-sm text-foreground">{p.titre}</span>
                <span className="text-xs text-muted-foreground">{Number(p.prixVente).toLocaleString()} F</span>
              </button>
            ))}
            {productSearch.length >= 2 && !searchResults?.items.length && (
              <p className="text-xs text-muted-foreground text-center py-2">Aucun résultat</p>
            )}
          </div>
        )}

        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Aucun article. Cliquez sur "Ajouter un manuel".</p>
        ) : (
          <div className="space-y-2">
            {lignes.map(l => (
              <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{l.titre}</p>
                  <p className="text-xs text-muted-foreground">ID: {l.produitId}</p>
                </div>
                <select value={l.etat} onChange={e => updateLigne(l.id, "etat", e.target.value)}
                  className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground">
                  {ETATS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
                <input type="number" value={l.quantite} min={1}
                  onChange={e => updateLigne(l.id, "quantite", Math.max(1, Number(e.target.value)))}
                  className="w-14 rounded border border-border bg-muted px-2 py-1 text-xs text-foreground text-center" />
                <input type="number" value={l.prixUnitaire} step={0.01}
                  onChange={e => updateLigne(l.id, "prixUnitaire", Number(e.target.value))}
                  className="w-20 rounded border border-border bg-muted px-2 py-1 text-xs text-foreground text-right" />
                <span className="text-xs font-mono text-warning-foreground w-20 text-right">{l.totalLigne.toLocaleString()} F</span>
                <button type="button" onClick={() => removeLigne(l.id)}
                  className="p-1 text-destructive hover:text-destructive">
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Notes</h3>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          placeholder="Notes optionnelles..." />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-5">
        <div>
          <p className="text-xs text-muted-foreground uppercase">Total à payer</p>
          <p className="text-2xl font-bold text-warning-foreground">{montantTotal.toLocaleString()} F</p>
        </div>
        <Button onClick={handleSubmit} disabled={createMutation.isPending || lignes.length === 0}
          className="bg-warning text-foreground hover:bg-warning disabled:opacity-50">
          {createMutation.isPending ? "Création..." : "Valider le rachat"}
        </Button>
      </div>
    </div>
  );
}
