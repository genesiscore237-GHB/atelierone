"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { useDebounce } from "~/lib/useDebounce";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { EmptyState } from "~/components/ui/empty-state";
import { MessageSquareText, Search, ExternalLink, RefreshCw, UserRound } from "lucide-react";

/**
 * JOURNAL ATELIER — vue transverse des comptes rendus techniciens.
 *
 * Le dashboard Parc répond à « où en est chaque dossier ? ». Cette vue répond à
 * « qu'a-t-on constaté, qui l'a écrit, et sur quelle ligne ? ». Les deux sont
 * complémentaires : un pointage sans compte rendu ne dit pas ce qui a été fait.
 */
export function JournalAtelier() {
  const [recherche, setRecherche] = useState("");
  const rechercheDebouncee = useDebounce(recherche, 300);
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } =
    api.interventions.fluxAtelier.useQuery(
      { search: rechercheDebouncee || undefined, limite: 100 },
      { refetchInterval: 30_000 },
    );

  const lignes = data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Journal atelier</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Comptes rendus techniciens, tous véhicules confondus. Une correction se fait par un nouveau compte rendu :
            l'historique n'est jamais effacé.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une plaque, un OR, une ligne, un constat…"
            className="pl-9"
          />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {dataUpdatedAt ? `MAJ ${new Date(dataUpdatedAt).toLocaleTimeString("fr-FR")}` : "…"}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error?.message ?? "Impossible de charger le journal atelier."}
        </div>
      ) : lignes.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText className="size-8" />}
          title="Aucun compte rendu"
          description={recherche ? "Aucun résultat pour cette recherche." : "Les comptes rendus écrits par les techniciens apparaîtront ici."}
        />
      ) : (
        <div className="space-y-2">
          {lignes.map((c: any) => (
            <article key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Link href={`/dashboard/ordres-reparation/${c.orId}`} className="font-mono font-bold text-primary hover:underline">
                  {c.numero}
                </Link>
                <span className="font-mono font-semibold text-foreground">{c.immatriculation ?? "Sans plaque"}</span>
                {c.ligneLibelle && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{c.ligneLibelle}</span>}
                <span className="ml-auto inline-flex items-center gap-1 text-[10px]">
                  <UserRound size={11} />
                  {[c.technicienPrenom, c.technicienNom].filter(Boolean).join(" ") || "auteur non rattaché"}
                </span>
                <span className="text-[10px]">
                  {c.createdAt ? new Date(c.createdAt).toLocaleString("fr-FR") : "date inconnue"}
                </span>
                <Link href={`/dashboard/ordres-reparation/${c.orId}`} className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline">
                  Ouvrir l'OR <ExternalLink size={10} />
                </Link>
              </div>

              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                {c.constat && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Constat</p>
                    <p className="mt-0.5 whitespace-pre-line">{c.constat}</p>
                  </div>
                )}
                {c.intervention && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Intervention</p>
                    <p className="mt-0.5 whitespace-pre-line">{c.intervention}</p>
                  </div>
                )}
                {c.suite && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Suite</p>
                    <p className="mt-0.5 whitespace-pre-line">{c.suite}</p>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
