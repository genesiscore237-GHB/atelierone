"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Search, Plus, Trash2 } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";

const ETATS = [
  { value: "neuf", label: "Neuf", coeff: 0.7 },
  { value: "bon", label: "Bon état", coeff: 0.5 },
  { value: "moyen", label: "Moyen", coeff: 0.35 },
  { value: "usage", label: "Usagé", coeff: 0.2 },
];

interface LigneReprise {
  id: string;
  produitId: number;
  titre: string;
  prixVente: number;
  quantite: number;
  prixUnitaire: number;
  total: number;
}

export default function EchangeBoursePage() {
  const router = useRouter();
  const [clientNom, setClientNom] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [queryReprise, setQueryReprise] = useState("");
  const [repriseLignes, setRepriseLignes] = useState<LigneReprise[]>([]);
  const utils = api.useUtils();

  const { data: searchReprise } = api.bourse.eligibles.useQuery(
    { query: queryReprise || undefined, limit: 20 },
    { enabled: queryReprise.length >= 2 },
  );

  const echangeMutation = api.bourse.echange.useMutation({
    onSuccess: (r) => {
      utils.bourse.list.invalidate();
      toast.success(`Échange bourse créé (réf. ${r.reference})`);
      router.push("/dashboard/bourse");
    },
    onError: (e) => toast.error(e.message),
  });

  const addRepriseLigne = (produit: any) => {
    const coeff = 0.2;
    const plafond = Number(produit.prixVente) * 0.5;
    const prixU = Math.round(Math.min(Number(produit.prixVente) * coeff, plafond) * 100) / 100;
    setRepriseLignes(prev => [...prev, {
      id: `r_${Date.now()}`,
      produitId: Number(produit.id),
      titre: produit.titre,
      prixVente: Number(produit.prixVente),
      quantite: 1,
      prixUnitaire: prixU,
      total: prixU,
    }]);
    setQueryReprise("");
  };

  const updateLigne = (id: string, field: string, value: any) => {
    setRepriseLignes(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === "etat") {
        const coeff = ETATS.find(e => e.value === value)?.coeff ?? 0.2;
        updated.prixUnitaire = Math.round(Math.min(l.prixVente * coeff, l.prixVente * 0.5) * 100) / 100;
      }
      updated.total = Math.round(updated.prixUnitaire * updated.quantite * 100) / 100;
      return updated;
    }));
  };

  const removeLigne = (id: string) => setRepriseLignes(prev => prev.filter(l => l.id !== id));
  const totalReprise = repriseLignes.reduce((s, l) => s + l.total, 0);

  const handleSubmit = () => {
    if (repriseLignes.length === 0) { toast.error("Ajoutez au moins un manuel à reprendre"); return; }
    echangeMutation.mutate({
      clientNom: clientNom || "Client anonyme",
      clientContact: clientContact || undefined,
      repriseLignes: repriseLignes.map(l => ({
        produitId: l.produitId,
        quantite: l.quantite,
        etat: "usage",
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
          <RefreshCw className="size-5 text-success-foreground" />
          Échange bourse (reprise manuels)
        </h1>
        <p className="text-xs text-muted-foreground">Reprise de manuels avec création de lots</p>
      </div>

      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Client</h3>
        <div className="grid grid-cols-2 gap-3">
          <input value={clientNom} onChange={e => setClientNom(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground"
            placeholder="Nom du client" />
          <input value={clientContact} onChange={e => setClientContact(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground"
            placeholder="Contact" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Trash2 className="size-4 text-destructive" />
          Manuels repris
        </h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={queryReprise} onChange={e => setQueryReprise(e.target.value)}
            data-testid="recherche-rachat"
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground"
            placeholder="Rechercher un manuel à reprendre..." />
        </div>
        <div data-testid="produits-rachat">
        {queryReprise.length >= 2 && searchReprise?.items.map((p: any) => (
          <button key={p.id} type="button" onClick={() => addRepriseLigne(p)}
            data-testid="carte-produit"
            className="w-full flex items-center justify-between rounded border border-border bg-muted/50 px-3 py-2 text-left hover:bg-accent/50">
            <span className="text-sm text-foreground truncate flex-1">{p.titre}</span>
            <Plus className="size-3 text-success-foreground ml-2" />
          </button>
        ))}
        </div>
        {repriseLignes.map(l => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
            <span className="text-sm text-foreground flex-1 truncate">{l.titre}</span>
            <select value={"usage"} onChange={e => updateLigne(l.id, "etat", e.target.value)}
              className="rounded border border-border bg-muted/50 px-2 py-1 text-xs text-foreground">
              {ETATS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
            <input type="number" value={l.quantite} min={1} className="w-14 rounded border border-border bg-muted/50 px-2 py-1 text-xs text-foreground text-center"
              onChange={e => updateLigne(l.id, "quantite", Math.max(1, Number(e.target.value)))} />
            <span className="text-xs font-mono text-warning-foreground w-20 text-right">{l.total.toLocaleString()} F</span>
            <button onClick={() => removeLigne(l.id)} className="p-1 text-destructive"><Trash2 className="size-3" /></button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card/50 p-5">
        <div>
          <p className="text-xs text-muted-foreground uppercase">Total reprise</p>
          <p className="text-xl font-bold text-success-foreground" data-testid="difference-montant">{totalReprise.toLocaleString()} F</p>
        </div>
        <Button onClick={handleSubmit} disabled={echangeMutation.isPending || repriseLignes.length === 0}
          className="bg-success text-foreground hover:bg-success/80">
          {echangeMutation.isPending ? "Traitement..." : "Finaliser l'échange"}
        </Button>
      </div>
    </div>
  );
}
