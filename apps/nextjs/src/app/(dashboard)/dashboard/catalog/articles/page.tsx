"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import {
  Package,
  Boxes,
  Wrench,
  HardHat,
  Briefcase,
  Search,
  Plus,
  ChevronRight,
  ChevronLeft,
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { ErrorState } from "~/components/ui/error-state";
import { EmptyState } from "~/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { usePermissions } from "~/hooks/usePermissions";

const LIMIT = 25;

const TYPE_OPTIONS: { value: string; label: string; icon: typeof Package }[] = [
  { value: "PIECE", label: "Pièces", icon: Package },
  { value: "CONSOMMABLE", label: "Consommables", icon: Boxes },
  { value: "OUTIL", label: "Outils", icon: Wrench },
  { value: "EQUIPEMENT", label: "Équipements", icon: HardHat },
  { value: "SERVICE", label: "Services", icon: Briefcase },
  { value: "FOURNITURE", label: "Fournitures", icon: Boxes },
  { value: "KIT", label: "Kits", icon: Package },
];

const PROBLEM_META: Record<
  string,
  { label: string; desc: string; icon: typeof AlertTriangle; badge: string; banner: string }
> = {
  INCOMPLETE_ARTICLE: {
    label: "Articles incomplets",
    desc: "Articles sans code ou sans désignation — à compléter pour être exploitables.",
    icon: AlertOctagon,
    badge: "bg-destructive/10 text-destructive",
    banner: "border-destructive/30 bg-destructive/5",
  },
  MISSING_CATEGORY: {
    label: "Sans catégorie",
    desc: "Articles sans catégorie assignée — le classement du référentiel est incomplet.",
    icon: AlertTriangle,
    badge: "bg-amber-500/10 text-amber-600",
    banner: "border-amber-500/30 bg-amber-500/5",
  },
  MISSING_BRAND: {
    label: "Variantes sans marque",
    desc: "Articles dont au moins une variante n'a pas de marque renseignée.",
    icon: Info,
    badge: "bg-sky-500/10 text-sky-600",
    banner: "border-sky-500/30 bg-sky-500/5",
  },
  MISSING_PRIMARY_REFERENCE: {
    label: "Sans référence",
    desc: "Articles dont au moins une variante n'a ni référence fabricant ni référence OEM.",
    icon: Info,
    badge: "bg-sky-500/10 text-sky-600",
    banner: "border-sky-500/30 bg-sky-500/5",
  },
  DUPLICATE_CANDIDATE: {
    label: "Doublons potentiels",
    desc: "Articles dont une variante partage sa désignation courte avec une autre — risques de doublons.",
    icon: AlertOctagon,
    badge: "bg-destructive/10 text-destructive",
    banner: "border-destructive/30 bg-destructive/5",
  },
};

export default function CatalogueArticlesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const peutConsulter = hasPermission("stock.consulter");

  const type = searchParams?.get("type") ?? undefined;
  const probleme = searchParams?.get("problem") ?? undefined;
  const page = Math.max(1, Number(searchParams?.get("page") ?? "1") || 1);
  const initialQ = searchParams?.get("q") ?? "";

  const [qInput, setQInput] = useState(initialQ);
  const [q, setQ] = useState(initialQ);

  const offset = (page - 1) * LIMIT;
  const { data, isLoading, isError, error, refetch } = api.articles.listArticles.useQuery(
    {
      q: q || undefined,
      type: type || undefined,
      probleme: probleme || undefined,
      limit: LIMIT,
      offset,
    },
    { staleTime: 30_000, retry: 1 },
  );

  const update = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    router.push(`/dashboard/catalog/articles${qs ? `?${qs}` : ""}`);
  };

  const appliquerRecherche = () => {
    const v = qInput.trim();
    setQ(v);
    update({ q: v || undefined, page: undefined });
  };

  const problemMeta = probleme ? PROBLEM_META[probleme] : undefined;

  if (!peutConsulter) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <AlertTriangle size={15} /> Vous n&apos;avez pas la permission de consulter le catalogue.
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT));

  return (
    <div className="space-y-5">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Layers className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Articles</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Références commerciales et variantes (pièces, consommables, outils, équipements, services).
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => router.push("/dashboard/catalog/article/nouveau")}
        >
          <Plus size={14} /> Nouvel article
        </Button>
      </div>

      {/* ─── BARRE DE FILTRES ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Code, désignation, marque, référence, code-barre…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && appliquerRecherche()}
            className="pl-9"
            aria-label="Rechercher un article"
          />
        </div>
        <Button variant="secondary" onClick={appliquerRecherche} disabled={isLoading}>
          Rechercher
        </Button>
        <Select
          value={type ?? "ALL"}
          onValueChange={(v) => update({ type: v === "ALL" ? undefined : v, page: undefined })}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label="Filtrer par type">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les types</SelectItem>
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── BANNIÈRE PROBLÈME ─── */}
      {probleme && problemMeta && (
        <div className={`flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center ${problemMeta.banner}`}>
          <problemMeta.icon size={18} className="shrink-0 text-foreground" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{problemMeta.label}</p>
            <p className="text-xs text-muted-foreground">{problemMeta.desc}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => update({ problem: undefined, page: undefined })}
          >
            Voir tous les articles
          </Button>
        </div>
      )}

      {/* ─── ÉTATS : LOADING / ERREUR / VIDE / LISTE ─── */}
      {isLoading ? (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message={error?.message ?? "Impossible de charger les articles."} retryAction={() => refetch()} />
      ) : !data?.articles.length ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={<Package size={64} />}
            title="Aucun article trouvé"
            description={
              q || type || probleme
                ? "Aucun article ne correspond aux critères. Modifiez la recherche ou les filtres."
                : "Créez le premier article du catalogue pour commencer."
            }
            actionButton={
              <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard/catalog/article/nouveau")}>
                <Plus size={14} className="mr-1.5" /> Nouvel article
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Désignation</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Catégorie</th>
                  <th className="px-4 py-3 text-right font-medium">Variantes</th>
                  <th className="px-4 py-3 text-right font-medium">Stock total</th>
                  <th className="px-4 py-3 font-medium">Qualité</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {data.articles.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => router.push(`/dashboard/catalog/article/${a.id}`)}
                    className="cursor-pointer transition-colors hover:bg-accent/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.code ?? "—"}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{a.designation}</p>
                      {a.designationCourte && (
                        <p className="text-xs text-muted-foreground">{a.designationCourte}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={a.typeProduit} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.categorieNom ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.nVariantes}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={Number(a.stockTotal) === 0 && a.nVariantes > 0 ? "font-semibold text-destructive" : ""}>
                        {Number(a.stockTotal).toLocaleString("fr-FR")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {a.problemes.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success-foreground">
                            <CheckCircle2 size={13} /> OK
                          </span>
                        ) : (
                          a.problemes.map((code) => {
                            const meta = PROBLEM_META[code];
                            if (!meta) return null;
                            const Icon = meta.icon;
                            return (
                              <button
                                key={code}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  update({ problem: code, page: undefined });
                                }}
                                title={meta.label}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}
                              >
                                <Icon size={10} />
                                {meta.label}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">
                      <ChevronRight size={15} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── PAGINATION ─── */}
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              {data.total.toLocaleString("fr-FR")} article{data.total > 1 ? "s" : ""}
              {q && <> · recherche « {q} »</>}
              {type && <> · type {type}</>}
              {probleme && <> · filtre {problemMeta?.label ?? probleme}</>}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) })}
              >
                <ChevronLeft size={14} /> Précédent
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => update({ page: String(page + 1) })}
              >
                Suivant <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: string | null }) {
  const meta = TYPE_OPTIONS.find((t) => t.value === type);
  if (!meta) {
    return <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{type ?? "—"}</span>;
  }
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">
      <Icon size={11} className="text-muted-foreground" />
      {meta.label}
    </span>
  );
}