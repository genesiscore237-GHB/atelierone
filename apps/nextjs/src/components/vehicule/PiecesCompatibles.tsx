"use client";

/**
 * PIÈCES COMPATIBLES AVEC CE VÉHICULE — le pont catalogue ↔ voiture réelle.
 *
 * Le moteur de compatibilité existait (`articles.pourVehicule` : marque/modèle
 * ± année ± version, châssis en pont, exclusions NEGATIVE) mais n'avait
 * aucune phrase écran : le mécanicien ne voyait jamais ce qui va à la voiture
 * qu'il répare. Ce composant suit la fiche 360 (onglet « Pièces ») —
 * véhicules du parking comme de l'atelier.
 */
import { useState } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { usePermissions } from "~/hooks/usePermissions";
import { AlertTriangle, Loader2, PackageSearch, RefreshCcw } from "lucide-react";

export function PiecesCompatibles({ vehiculeId }: { vehiculeId: number }) {
  const { hasPermission } = usePermissions();
  const [filtre, setFiltre] = useState("");

  const { data, isLoading, isError, refetch } = api.articles.pourVehicule.useQuery(
    { vehiculeId, limit: 50 },
    { enabled: Number.isFinite(vehiculeId) && vehiculeId > 0, retry: false },
  );

  if (!hasPermission("stock.consulter")) {
    // Permission sincère : on le DIT, on ne cache pas le bloc ni ne montre un
    // bouton qui échouerait.
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <PackageSearch size={14} className="text-primary" /> Pièces compatibles
        </h3>
        <p className="text-xs text-muted-foreground">Consultation du catalogue non autorisée pour votre profil.</p>
      </div>
    );
  }

  const criteres = (() => {
    const c = (data?.criteres ?? {}) as Record<string, unknown>;
    const out: string[] = [];
    if (c.marque) out.push(c.modele ? `${String(c.marque)} ${String(c.modele)}` : String(c.marque));
    if (c.annee) out.push(String(c.annee));
    if (c.version) out.push(String(c.version));
    if (c.chassis) out.push(`Châssis ${String(c.chassis).slice(-8)}`);
    return out;
  })();

  const items = (data?.items ?? []) as any[];
  const ft = filtre.trim().toLowerCase();
  const visibles = ft
    ? items.filter((p) => `${p.titre} ${p.marque ?? ""} ${p.referencePrincipale ?? ""} ${p.codeArticle ?? ""} ${p.articleDesignation ?? ""}`.toLowerCase().includes(ft))
    : items;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <PackageSearch size={14} className="text-primary" /> Pièces compatibles avec ce véhicule
        </h3>
        {criteres.map((cr, i) => (
          <span key={i} className="rounded bg-primary/5 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{cr}</span>
        ))}
      </div>

      {!Number.isFinite(vehiculeId) || vehiculeId <= 0 ? (
        <p className="text-xs text-muted-foreground">Véhicule inconnu : le lien catalogue n'est pas disponible.</p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Recherche des pièces compatibles…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          <AlertTriangle size={14} /> La recherche a échoué.
          <Button size="sm" variant="outline" className="ml-auto gap-1 text-xs" onClick={() => refetch()}>
            <RefreshCcw size={12} /> Réessayer
          </Button>
        </div>
      ) : data?.ficheIncomplete ? (
        <p className="text-xs text-muted-foreground">
          La fiche est trop pauvre pour déduire la compatibilité : renseignez marque/modèle ou le n° de châssis du
          véhicule — personne ne devine ce que la fiche ne dit pas.
        </p>
      ) : visibles.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucune pièce compatible référencée pour ce véhicule.
          {items.length > 0
            ? " Rien ne passe le filtre texte."
            : " La compatibilité vit sur les articles du catalogue : ajoutez-la (marque / modèle / années) ou importez-la en masse."}
        </p>
      ) : (
        <>
          <Input
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            placeholder="Filtrer par nom ou référence…"
            className="mb-3 max-w-xs"
          />
          <div className="space-y-2">
            {visibles.map((p: any) => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/catalog/variante/${p.id}`} className="text-sm font-bold hover:underline">
                    {p.titre}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {p.articleDesignation ?? "—"}
                    {(p.codeArticle ?? p.referencePrincipale) && <span className="ml-2 font-mono">{p.codeArticle ?? p.referencePrincipale}</span>}
                    {p.positionCote && p.positionCote !== "N_A" && <span className="ml-2 uppercase">{p.positionCote}</span>}
                    {p.positionEssieu && p.positionEssieu !== "N_A" && <span className="ml-1 uppercase">{p.positionEssieu}</span>}
                  </p>
                </div>
                {p.prixVente != null && (
                  <span className="font-mono text-xs">{Number(p.prixVente).toLocaleString("fr-FR")} F</span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.stockDisponible > 0 ? "bg-success/10 text-success-foreground" : "bg-destructive/5 text-destructive"}`}>
                  Stock : {p.stockDisponible}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
