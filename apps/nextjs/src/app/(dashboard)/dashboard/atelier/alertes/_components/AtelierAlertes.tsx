"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ALERTE_META, STATUT_LABELS, PRIORITE_META } from "~/server/lib/atelier-service";
import { EmptyState } from "~/components/ui/empty-state";
import { cn } from "~/lib/utils";

/**
 * LOT A2 (E15, P2-7) — Vue « Alertes atelier ».
 *
* `or.getAlertes` existait côté serveur mais n'était appelé par AUCUNE
 * interface : une fonctionnalité complète, calculée et maintenue, invisible.
 *
 * Ce qu'elle apporte par rapport au filtrage d'alertes déjà présent dans
 * « Pilotage du parc » : une vue **triée par gravité** et **sans bruit** —
 * uniquement les dossiers qui demandent une action, pas tout le parc. Le
 * pilotage sert à voir l'ensemble ; cette page sert à « qui je dépanne
 * maintenant ».
 *
 * Règles de conception tenues :
 *  - **actionnable** : chaque ligne mène au dossier (pas de tableau mort) ;
 *  - **rafraîchissement** automatique comme le pilotage (30 s) : une alerte
 *    qui n'apparaît qu'au rechargement manuel est une alerte en retard ;
 *  - **états** : chargement, vide (avec explication), erreur via `toast`.
 */

/**
 * Ligne d'alerte telle que renvoyée par `or.getAlertes`.
 *
 * Les champs sont Optionnels côté tRPC (jointures `leftJoin` : un dossier
 * sans véhicule clienté rend `immatriculation`/`clientDisplay` absents). On
 * normalise en `Ligne` pour que le rendu n'ait pas à managinguer l'absence
 * partout — une colonne vide est une information, pas une erreur.
 */
type Ligne = {
  id: number;
  numero: string | null;
  statut: string | null;
  priorite: string | null;
  dateOuverture: Date | string | null;
  datePromesse: Date | string | null;
  raisonBlocage: string | null;
  responsableNom: string | null;
  responsablePrenom: string | null;
  immatriculation: string | null;
  clientDisplay: string;
  plainte: string | null;
  joursImmobilisation: number;
  retardJours: number;
  alertes: string[];
  principale: string | null;
};

/** Gravité de tri : plus c'est grave, plus ça remonte. */
const GRAVITE: Record<string, number> = {
  RETARD: 0,
  BLOQUE: 1,
  P1: 2,
  LONG: 3,
  PROCHE: 4,
};

export function AtelierAlertes() {
  // 30 s comme le pilotage : une alerte doit apparaître sans action humaine.
  const { data, isLoading, error, refetch, isFetching } = api.or.getAlertes.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const [q, setQ] = useState("");
  const [fGravite, setFGravite] = useState("");

  const lignes: Ligne[] = useMemo(() => {
    // Les quatre catégories du serveur se recoupent : le type tRPC est donc
    // une union de lignes optionnelles. On collecte large puis on normalise.
    const brutes = [
      ...(data?.enRetard ?? []),
      ...(data?.bloques ?? []),
      ...(data?.p1NonTermines ?? []),
      ...(data?.proches ?? []),
    ] as Partial<Ligne>[];
    // Un dossier peut apparaître dans plusieurs catégories : on le garde une
    // seule fois, en conservant TOUTES ses alertes.
    const parId = new Map<number, Ligne>();
    for (const l of brutes) {
      // `id` peut être absent côté type tRPC (union de jointures) : on ne
      // garde que les lignes exploitables plutôt que de fabriquer un 0.
      if (typeof l.id !== "number") continue;
      const ligne = l as Ligne;
      const deja = parId.get(ligne.id);
      if (deja) {
        deja.alertes = [...new Set([...deja.alertes, ...(ligne.alertes ?? [])])];
        continue;
      }
      parId.set(ligne.id, { ...ligne, clientDisplay: ligne.clientDisplay ?? "", alertes: [...(ligne.alertes ?? [])] });
    }
    return [...parId.values()];
  }, [data]);

  const filtrees = useMemo(() => {
    const t = q.trim().toLowerCase();
    return lignes
      .filter((l) => {
        if (fGravite && !l.alertes.includes(fGravite)) return false;
        if (!t) return true;
        return [l.numero, l.immatriculation, l.clientDisplay, l.plainte, l.raisonBlocage]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(t));
      })
      .sort((a, b) => {
        const ga = Math.min(...a.alertes.map((x) => GRAVITE[x] ?? 9));
        const gb = Math.min(...b.alertes.map((x) => GRAVITE[x] ?? 9));
        if (ga !== gb) return ga - gb;
        // À gravité égale, le plus en retard d'abord.
        return b.retardJours - a.retardJours;
      });
  }, [lignes, q, fGravite]);

  const compte = (code: string) => lignes.filter((l) => l.alertes.includes(code)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Alertes atelier</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dossiers nécessitant une action : retard de promesse, blocage, priorité P1, immobilisation longue.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Actualiser
        </Button>
      </div>

      {/* Compteurs — un klik filtre la liste */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["RETARD", "BLOQUE", "P1", "LONG"] as const).map((code) => {
          const actif = fGravite === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setFGravite(actif ? "" : code)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                actif ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {ALERTE_META[code]?.libelle ?? code}
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">{compte(code)}</p>
            </button>
          );
        })}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="N° OR, immat, client, plainte…"
            className="w-72 pl-9"
          />
        </div>
        <select
          value={fGravite}
          onChange={(e) => setFGravite(e.target.value)}
          className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm outline-none"
        >
          <option value="">Toutes gravités</option>
          {(["RETARD", "BLOQUE", "P1", "LONG", "PROCHE"] as const).map((c) => (
            <option key={c} value={c} className="bg-background">
              {ALERTE_META[c]?.libelle ?? c}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Alertes indisponibles : {error.message}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Chargement des alertes…
        </div>
      ) : filtrees.length === 0 ? (
        <EmptyState
          icon={lignes.length === 0 ? <ShieldCheck className="size-8" /> : <Search className="size-8" />}
          title={lignes.length === 0 ? "Aucune alerte" : "Aucun résultat"}
          description={
            lignes.length === 0
              ? "Aucun dossier en retard, bloqué ou prioritaire. Tout est à jour."
              : "Aucune alerte ne correspond à ce filtre."
          }
        />
      ) : (
        <div className="space-y-2">
          {filtrees.map((l) => (
            <Link
              key={l.id}
              href={`/dashboard/ordres-reparation/${l.id}`}
              className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-foreground">{l.numero ?? "—"}</span>
                    <span className="font-mono text-xs text-muted-foreground">{l.immatriculation}</span>
                    {l.priorite && PRIORITE_META[l.priorite] && (
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                        {PRIORITE_META[l.priorite].libelle}
                      </span>
                    )}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {STATUT_LABELS[l.statut ?? ""] ?? l.statut}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {l.clientDisplay}
                    {l.raisonBlocage ? ` · blocage : ${l.raisonBlocage}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {l.alertes.map((a) => (
                    <span
                      key={a}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold",
                        ALERTE_META[a]?.badge ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {ALERTE_META[a]?.libelle ?? a}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                <span>Immobilisé : {l.joursImmobilisation} j</span>
                {l.retardJours > 0 && (
                  <span className="font-semibold text-destructive">Retard : {l.retardJours} j</span>
                )}
                {l.responsableNom && (
                  <span>
                    Responsable : {l.responsablePrenom ?? ""} {l.responsableNom}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}