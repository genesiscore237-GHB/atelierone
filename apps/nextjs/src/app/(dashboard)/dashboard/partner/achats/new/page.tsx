"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";

export default function NewPartnerAchatPage() {
  const router = useRouter();
  const [partenaireId, setPartenaireId] = useState<number | undefined>(undefined);
  const [produitDesignation, setProduitDesignation] = useState("");
  const [prixAchatPartenaire, setPrixAchatPartenaire] = useState(0);
  const [prixVenteClient, setPrixVenteClient] = useState(0);
  const [notes, setNotes] = useState("");
  const utils = api.useUtils();

  const { data: fournisseurs } = api.reference.listFournisseurs.useQuery();
  const createMut = api.partner.createAchat.useMutation({
    onSuccess: () => {
      utils.partner.listAchats.invalidate();
      toast.success("Achat partenaire créé");
      router.push("/dashboard/partner/achats");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!partenaireId) { toast.error("Sélectionnez un partenaire"); return; }
    if (!produitDesignation.trim()) { toast.error("Saisissez la désignation du produit"); return; }
    if (prixAchatPartenaire <= 0) { toast.error("Le prix d'achat partenaire est requis"); return; }
    if (prixVenteClient <= 0) { toast.error("Le prix de vente client est requis"); return; }
    createMut.mutate({
      partenaireId,
      produitDesignation: produitDesignation.trim(),
      prixAchatPartenaire,
      prixVenteClient,
      notes: notes || undefined,
    });
  };

  const marge = prixVenteClient - prixAchatPartenaire;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/partner/achats" className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Building2 className="size-5 text-primary" />
          Nouvel achat partenaire
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
        <h3 className="text-sm font-semibold text-foreground">Produit (hors catalogue)</h3>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Désignation</label>
          <input value={produitDesignation} onChange={e => setProduitDesignation(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            placeholder="Ex: Lot de stylos promotionnels" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Prix d'achat partenaire</label>
            <input type="number" value={prixAchatPartenaire || ""} min={0}
              onChange={e => setPrixAchatPartenaire(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Prix vente client</label>
            <input type="number" value={prixVenteClient || ""} min={0}
              onChange={e => setPrixVenteClient(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground" />
          </div>
        </div>
        {marge > 0 && (
          <p className="text-xs text-muted-foreground">Marge brute : <span className="text-warning-foreground font-mono">{marge.toLocaleString()} F</span></p>
        )}
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Notes (optionnel)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          placeholder="Notes internes..." />
      </div>

      <Button onClick={handleSubmit} disabled={createMut.isPending}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
        {createMut.isPending ? "Création..." : "Créer l'achat partenaire"}
      </Button>
    </div>
  );
}
