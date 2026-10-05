"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Loader2,
  PackageSearch,
  ScanSearch,
  Search,
} from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";
import { ResultCard, FicheConcept, type Cible } from "./AideSaisiePage";

const EXEMPLES = ["Filtre à huile", "Batterie", "Clé à chocs"];

/**
 * Aide intelligente compacte (utilisée dans le panneau "?" du domaine
 * Catalogue). Saisissez la pièce que vous cherchez à enregistrer : on
 * identifie la catégorie et on affiche comment la représenter dans le wizard.
 */
export function AideSaisieInline() {
  const { hasPermission } = usePermissions();
  const peutConsulter = hasPermission("stock.consulter");

  const [term, setTerm] = useState("");
  const [lastTerm, setLastTerm] = useState("");
  const [searchKey, setSearchKey] = useState(0);
  const [selected, setSelected] = useState<Cible | null>(null);

  const searchQuery = api.guide.searchConcept.useQuery(
    { term: lastTerm, limit: 8 },
    { enabled: searchKey > 0 && lastTerm.trim().length > 0, staleTime: 60_000 }
  );

  const conceptQuery = api.guide.getArticleConcept.useQuery(
    { categorieId: selected?.categorieId ?? 0 },
    { enabled: selected?.categorieId != null, staleTime: 60_000, retry: false }
  );

  const runSearch = (raw?: string) => {
    const t = (raw ?? term).trim();
    if (!t) {
      toast.error("Saisissez le nom de la pièce que vous cherchez à enregistrer.");
      return;
    }
    setTerm(t);
    setLastTerm(t);
    setSelected(null);
    setSearchKey((k) => k + 1);
  };

  if (!peutConsulter) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <AlertTriangle size={15} /> Vous n&apos;avez pas la permission de consulter le catalogue.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <ScanSearch size={13} /> Aide à la saisie d&apos;un article
        </p>
        <Link
          href="/dashboard/catalog/aide"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
        >
          Module complet <ArrowRight size={12} />
        </Link>
      </div>

      {/* ─── RECHERCHE ─── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="flex flex-col gap-2"
      >
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Ex : Filtre à huile, Batterie, 90915-YZZD1…"
            className="h-10 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Rechercher un concept article"
          />
        </div>
        <Button type="submit" className="gap-1.5" disabled={searchQuery.isFetching || !term.trim()}>
          {searchQuery.isFetching ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={15} />}
          Obtenir le guide de saisie
        </Button>
      </form>

      {!lastTerm && !selected && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Essayez :</span>
          {EXEMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => runSearch(ex)}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] text-foreground transition-colors hover:bg-accent"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {lastTerm && !selected && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            onClick={() => {
              setLastTerm("");
              setSearchKey(0);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft size={11} /> Effacer
          </button>
          <span>
            Résultats pour <b className="text-foreground">« {lastTerm} »</b>
          </span>
        </div>
      )}

      {/* ERREUR */}
      {searchQuery.isError && !conceptQuery.isFetching && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-foreground">
          <AlertTriangle size={14} className="shrink-0 text-destructive" />
          <span className="flex-1">{searchQuery.error?.message}</span>
          <Button size="sm" variant="outline" onClick={() => setSearchKey((k) => k + 1)}>
            Réessayer
          </Button>
        </div>
      )}

      {/* CHARGEMENT */}
      {searchQuery.isFetching && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* ZÉRO RÉSULTAT */}
      {!searchQuery.isFetching && !searchQuery.isError && searchQuery.data && searchQuery.data.length === 0 && !selected && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-center">
          <PackageSearch size={22} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Aucun concept trouvé pour « {lastTerm} »</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Vérifiez l&apos;orthographe ou essayez un synonyme / une référence constructeur.
          </p>
        </div>
      )}

      {/* RÉSULTATS */}
      {!searchQuery.isFetching && !selected && searchQuery.data && searchQuery.data.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {searchQuery.data.length} résultat{searchQuery.data.length > 1 ? "s" : ""} — cliquez pour le guide
          </p>
          {searchQuery.data.map((r, i) => (
            <ResultCard key={i} r={r} onOpen={() => r.categorieId != null && setSelected(r)} />
          ))}
        </div>
      )}

      {/* FICHE */}
      {selected !== null && (
        <div className="space-y-3">
          {conceptQuery.isFetching && (
            <Skeleton className="h-48 w-full rounded-xl" />
          )}
          {conceptQuery.isError && !conceptQuery.isFetching && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-foreground">
              <AlertTriangle size={14} className="shrink-0 text-destructive" />
              <span className="flex-1">{conceptQuery.error?.message}</span>
            </div>
          )}
          {conceptQuery.data && (
            <FicheConcept fiche={conceptQuery.data} cible={selected} onReset={() => setSelected(null)} />
          )}
        </div>
      )}
    </div>
  );
}