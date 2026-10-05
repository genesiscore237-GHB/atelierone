"use client";

import {
  BookOpenText,
  ListOrdered,
  Lightbulb,
  Scale,
  AlertTriangle,
  PackageOpen,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { api } from "~/trpc/react";
import { Skeleton } from "~/components/ui/skeleton";

type Rule = {
  type: string;
  condition: string | null;
  conseil: string;
  preuve: string | null;
};

const RULE_META: Record<string, { label: string; icon: typeof Lightbulb; color: string }> = {
  VALEUR: { label: "Valeur", icon: CheckCircle2, color: "text-success-foreground" },
  UNITE: { label: "Unité", icon: Scale, color: "text-primary" },
  CONVERSION: { label: "Conversion", icon: Scale, color: "text-primary" },
  ASSOCIATION: { label: "Association", icon: PackageOpen, color: "text-sky-600" },
  PIEGE: { label: "Piège", icon: AlertTriangle, color: "text-amber-600" },
};

export function GuidePanel({ categorieId, portee }: { categorieId: number; portee?: string }) {
  const { data, isLoading, isError, error, refetch } = api.guide.getGuideForCategory.useQuery(
    { categorieId, portee },
    { staleTime: 60_000, retry: 1 },
  );

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-5 w-48 rounded-md bg-muted" />
        <Skeleton className="h-4 w-full rounded-md bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-lg bg-muted" />
          <Skeleton className="h-28 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-sm text-destructive-foreground">
        <AlertTriangle size={15} />
        <span>Guide indisponible : {error?.message ?? "erreur inconnue"}</span>
        <button onClick={() => refetch()} className="ml-auto text-xs font-semibold underline">
          Réessayer
        </button>
      </div>
    );
  }

  if (!data) return null;

  const vide =
    !data.guide && data.steps.length === 0 && data.rules.length === 0 &&
    data.errors.length === 0 && data.examples.length === 0;

  // Nœuds de la chaîne ontologique (racine → catégorie)
  const chemin = data.chain.map((c) => c.nom).join(" › ");

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      {/* ─── EN-TÊTE ─── */}
      <div className="flex items-start gap-2.5">
        <BookOpenText className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{chemin}</p>
          <h3 className="text-base font-bold text-foreground">
            {data.guide?.titre ?? (vide ? "Aucun guide pour cette catégorie" : "Guide de saisie")}
          </h3>
          {data.guide?.contexte && (
            <p className="mt-1 text-sm text-muted-foreground">{data.guide.contexte}</p>
          )}
        </div>
      </div>

      {vide && (
        <p className="text-xs text-muted-foreground">
          Ce guide est vide pour le moment. Les gabarits d&apos;attributs restent pilotés par l&apos;ontologie.
        </p>
      )}

      {/* ─── DÉFINITIONS À RENSEIGNER ─── */}
      {data.definitions.length > 0 && (
        <section className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <ListOrdered size={13} /> Champs à renseigner ({data.definitions.length})
          </p>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {data.definitions.map((d) => (
              <li key={`${d.cle}::${d.portee}`} className="flex flex-col gap-1 px-3 py-2">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-foreground">{d.libelle}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{d.cle}</span>
                  {d.obligatoire && <span className="text-[10px] font-bold text-destructive">OBLIGATOIRE</span>}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{d.portee}</span>
                </p>
                {d.modeleValeur?.exemples && (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-muted-foreground/70">Exemples : </span>
                    {Array.isArray(d.modeleValeur.exemples) && d.modeleValeur.exemples.map((e, i) => (
                      <code key={i} className="mr-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{String(e)}</code>
                    ))}
                  </p>
                )}
                {d.modeleValeur?.format && <p className="text-xs text-muted-foreground">Format : {d.modeleValeur.format}</p>}
                {d.explication && <p className="text-xs leading-relaxed text-muted-foreground">{d.explication}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── ÉTAPES ─── */}
      {data.steps.length > 0 && (
        <section className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <ListOrdered size={13} /> Étapes de saisie
          </p>
          <ol className="space-y-2 rounded-lg border border-border/60 p-3">
            {data.steps.map((s) => (
              <li key={s.id} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {s.ordre}
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{s.titre}</p>
                  <p className="text-xs text-muted-foreground">{s.texte}</p>
                  {s.champCle && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">champ : {s.champCle}</p>}
                  {s.recommandation && (
                    <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                      {s.recommandation}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ─── RÈGLES ─── */}
      {data.rules.length > 0 && (
        <section className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Lightbulb size={13} /> Règles ({data.rules.length})
          </p>
          <ul className="space-y-2">
            {data.rules.map((r: Rule, i: number) => {
              const meta = RULE_META[r.type] ?? { label: r.type, icon: Lightbulb, color: "text-muted-foreground" };
              const Icon = meta.icon;
              return (
                <li key={`${i}-${r.type}`} className="rounded-lg border border-border/60 px-3 py-2">
                  <p className="flex items-center gap-2 text-sm">
                    <Icon size={14} className={meta.color} />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{meta.label}</span>
                    {r.condition && <span className="font-mono text-[10px] text-muted-foreground">{r.condition}</span>}
                  </p>
                  <p className="mt-1 text-sm text-foreground">{r.conseil}</p>
                  {r.preuve && <p className="mt-0.5 text-xs text-muted-foreground">Pourquoi : {r.preuve}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ─── ERREURS COURANTES ─── */}
      {data.errors.length > 0 && (
        <section className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <XCircle size={13} /> Erreurs courantes
          </p>
          <ul className="space-y-2">
            {data.errors.map((e) => (
              <li key={e.code} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {e.severity === "error" ? <XCircle size={14} className="text-destructive" /> : <AlertTriangle size={14} className="text-amber-600" />}
                  {e.message}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{e.actions}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── EXEMPLES DE RÉFÉRENCE ─── */}
      {data.examples.length > 0 && (
        <section className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <PackageOpen size={13} /> Exemples de référence
          </p>
          <ul className="space-y-2">
            {data.examples.map((e) => (
              <li key={e.id} className="rounded-lg border border-border/60 px-3 py-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {e.estReference && <CheckCircle2 size={14} className="text-success-foreground" />}
                  {e.libelle}
                  <ChevronRight size={13} className="ml-auto text-muted-foreground" />
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {e.titre ?? ""}
                  {e.referencePrincipale && <span className="ml-1.5 font-mono">{e.referencePrincipale}</span>}
                </p>
                {e.motif && <p className="mt-0.5 text-xs text-muted-foreground">Pourquoi : {e.motif}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}