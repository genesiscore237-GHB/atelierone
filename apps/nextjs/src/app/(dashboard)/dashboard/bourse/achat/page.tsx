"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, Plus, Trash2, BookOpen } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";

const ETATS = [
  { value: "neuf", label: "Neuf", coeff: 0.7 },
  { value: "bon", label: "Bon état", coeff: 0.5 },
  { value: "moyen", label: "Moyen", coeff: 0.35 },
  { value: "usage", label: "Usagé", coeff: 0.2 },
];

interface LigneAchat {
  id: string;
  produitId: number;
  titre: string;
  prixVente: number;
  quantite: number;
  etat: string;
  prixUnitaire: number;
  totalLigne: number;
  plafond: number;
}

export default function AchatBoursePage() {
  const router = useRouter();
  const [clientNom, setClientNom] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [query, setQuery] = useState("");
  const [lignes, setLignes] = useState<LigneAchat[]>([]);
  const utils = api.useUtils();

  const { data: searchResults } = api.bourse.eligibles.useQuery(
    { query: query || undefined, limit: 20 },
    { enabled: query.length >= 2 },
  );

  const createMutation = api.bourse.create.useMutation({
    onSuccess: (r) => {
      utils.bourse.list.invalidate();
      toast.success(`Rachat bourse ${r.reference} créé`);
      router.push("/dashboard/bourse");
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: prixCalcule } = api.bourse.calculerPrix.useQuery(
    { produitId: 0, etat: "usage" },
    { enabled: false },
  );

  const addLigne = async (produit: any) => {
    const [prix] = await Promise.all([
      fetch(`/api/trpc/bourse.calculerPrix?input=${encodeURIComponent(JSON.stringify({ json: { produitId: Number(produit.id), etat: "usage" } }))}`)
        .then(r => r.json()).then(d => d.result?.data?.prixUnitaire ?? Number(produit.prixVente) * 0.2).catch(() => Number(produit.prixVente) * 0.2),
    ]);

    const newLigne: LigneAchat = {
      id: `l_${Date.now()}`,
      produitId: Number(produit.id),
      titre: produit.titre,
      prixVente: Number(produit.prixVente),
      quantite: 1,
      etat: "usage",
      prixUnitaire: prix,
      totalLigne: prix,
      plafond: Number(produit.prixVente) * 0.5,
    };
    setLignes(prev => [...prev, newLigne]);
    setQuery("");
  };

  const updateLigne = (id: string, field: string, value: any) => {
    setLignes(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === "etat") {
        const coeff = ETATS.find(e => e.value === value)?.coeff ?? 0.2;
        const plafond = l.prixVente * 0.5;
        updated.prixUnitaire = Math.round(Math.min(l.prixVente * coeff, plafond) * 100) / 100;
      }
      if (field === "quantite" || field === "prixUnitaire") {
        updated.totalLigne = Math.round(updated.prixUnitaire * updated.quantite * 100) / 100;
      }
      return updated;
    }));
  };

  const removeLigne = (id: string) => setLignes(prev => prev.filter(l => l.id !== id));
  const montantTotal = lignes.reduce((s, l) => s + l.totalLigne, 0);

  const handleSubmit = () => {
    if (lignes.length === 0) { toast.error("Ajoutez au moins un article"); return; }
    createMutation.mutate({
      clientNom: clientNom || undefined,
      clientContact: clientContact || undefined,
      type: "rachat_bourse",
      lignes: lignes.map(l => ({
        produitId: l.produitId,
        quantite: l.quantite,
        etat: l.etat as any,
      })),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/bourse" className="rounded-lg border border-border/10 p-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <BookOpen className="size-5 text-warning-foreground" />
          Achat bourse (rachat manuels)
        </h1>
      </div>

      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Client</h3>
        <div className="grid grid-cols-2 gap-3">
          <input value={clientNom} onChange={e => setClientNom(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground"
            placeholder="Nom du client (optionnel)" />
          <input value={clientContact} onChange={e => setClientContact(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground"
            placeholder="Contact (optionnel)" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Manuels éligibles (secondaire officiel)</h3>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground"
            placeholder="Rechercher un manuel par titre, code-barres, ISBN..." />
        </div>
        {query.length >= 2 && searchResults?.items.map((p: any) => (
          <button key={p.id} type="button" onClick={() => addLigne(p)}
            data-testid="produit-eligible"
            className="w-full flex items-center justify-between rounded border border-border bg-muted/50 px-3 py-2 text-left hover:bg-accent/50 transition-colors">
            <div className="flex-1 min-w-0">
              <span className="text-sm text-foreground block truncate">{p.titre}</span>
              <span className="text-xs text-muted-foreground">{p.auteur} · {p.editeur}</span>
            </div>
            <span className="text-xs font-mono text-warning-foreground ml-2" data-testid="prix-vente">{Number(p.prixVente).toLocaleString()} F</span>
          </button>
        ))}
        {query.length >= 2 && !searchResults?.items.length && (
          <p className="text-xs text-muted-foreground text-center py-3">Aucun manuel éligible trouvé</p>
        )}

        {lignes.length > 0 && (
          <div className="space-y-2 mt-3">
            {lignes.map(l => (
              <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{l.titre}</p>
                  <p className="text-xs text-muted-foreground" data-testid="prix-rachat">{l.prixUnitaire.toLocaleString()} F/unité</p>
                </div>
                <select name="etat" value={l.etat} onChange={e => updateLigne(l.id, "etat", e.target.value)}
                  className="rounded border border-border bg-muted/50 px-2 py-1 text-xs text-foreground">
                  {ETATS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
                <input type="number" value={l.quantite} min={1}
                  onChange={e => updateLigne(l.id, "quantite", Math.max(1, Number(e.target.value)))}
                  className="w-14 rounded border border-border bg-muted/50 px-2 py-1 text-xs text-foreground text-center" />
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

      <div className="flex items-center justify-between rounded-xl border border-border bg-card/50 p-5">
        <div>
          <p className="text-xs text-muted-foreground uppercase">Total à payer</p>
          <p className="text-2xl font-bold text-warning-foreground" data-testid="total-rachat">{montantTotal.toLocaleString()} F</p>
        </div>
        <Button onClick={handleSubmit} disabled={createMutation.isPending || lignes.length === 0}
          className="bg-warning text-foreground hover:bg-warning/80 disabled:opacity-50">
          {createMutation.isPending ? "Création..." : "Finaliser le rachat"}
        </Button>
      </div>
    </div>
  );
}
