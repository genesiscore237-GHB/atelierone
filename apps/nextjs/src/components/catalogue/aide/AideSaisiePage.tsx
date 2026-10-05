"use client";

import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import {
  Search,
  ArrowLeft,
  BookOpen,
  Layers,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Route,
  ShieldAlert,
  ListChecks,
  ScanSearch,
  PackageSearch,
  Star,
  CheckCircle2,
  Wrench,
  HardHat,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";

export interface Cible {
  kind?: "CATEGORIE" | "PRODUIT";
  categorieId?: number | null;
  categorieNom?: string | null;
  chainNoms?: string[];
  typeBranche?: string | null;
  niveauOntologie?: string | null;
  matchedBy?: string;
  explication?: string;
  score?: number;
  produitId?: number;
  titreProduit?: string;
  marque?: string | null;
  referencePrincipale?: string | null;
  articleId?: number | null;
}

export const SCENARIO_LABELS: Record<string, string> = {
  NOM_SEUL: "Nom seul",
  NOM_REF: "Nom + référence",
  EXISTANT: "Déjà existant",
};

export function AideSaisiePage() {
  const { hasPermission } = usePermissions();
  const peutConsulter = hasPermission("stock.consulter");

  const [term, setTerm] = useState("");
  const [lastTerm, setLastTerm] = useState("");
  const [searchKey, setSearchKey] = useState(0);
  const [selected, setSelected] = useState<Cible | null>(null);

  const searchQuery = api.guide.searchConcept.useQuery(
    { term: lastTerm, limit: 12 },
    { enabled: searchKey > 0 && lastTerm.trim().length > 0, staleTime: 60_000 }
  );

  const conceptQuery = api.guide.getArticleConcept.useQuery(
    { categorieId: selected?.categorieId ?? 0 },
    { enabled: selected?.categorieId != null, staleTime: 60_000, retry: false }
  );

  const runSearch = (raw?: string) => {
    const t = (raw ?? term).trim();
    if (!t) {
      toast.error("Saisissez un nom de pièce, un synonyme ou une référence.");
      return;
    }
    setTerm(t);
    setLastTerm(t);
    setSelected(null);
    setSearchKey((k) => k + 1);
  };

  // Résultat unique net → ouverture automatique de la fiche
  useEffect(() => {
    const data = searchQuery.data;
    if (data && data.length === 1 && data[0].categorieId != null) {
      setSelected(data[0]);
    }
  }, [searchQuery.data]);

  useEffect(() => {
    if (conceptQuery.isError) {
      toast.error(conceptQuery.error?.message ?? "Fiche indisponible.");
    }
  }, [conceptQuery.isError]);

  const reset = () => {
    setLastTerm("");
    setSearchKey(0);
    setSelected(null);
    setTerm("");
  };

  if (!peutConsulter) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <AlertTriangle size={15} /> Vous n&apos;avez pas la permission de consulter le catalogue.
      </div>
    );
  }

  const EXEMPLES = ["Filtre à huile", "Batterie", "Plaquettes de frein", "Clé à chocs", "90915-YZZD2"];

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Aide à la saisie</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tapez ce que vous cherchez à enregistrer : le guide vous explique <b>quoi</b> saisir et{" "}
            <b>comment</b> le représenter avant d&apos;enregistrer l&apos;article.
          </p>
        </div>
      </div>

      {/* ─── RECHERCHE ─── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Ex : Filtre à huile, Batterie, Clé à chocs, 90915-YZZD1…"
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Rechercher un concept article"
          />
        </div>
        <Button type="submit" className="gap-1.5" disabled={searchQuery.isFetching || !term.trim()}>
          {searchQuery.isFetching ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={15} />}
          Rechercher
        </Button>
      </form>

      {lastTerm && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft size={12} /> Tous les résultats
          </button>
          <span>
            Résultats pour <b className="text-foreground">« {lastTerm} »</b>
          </span>
        </div>
      )}

      {/* ─── ERREUR ─── */}
      {searchQuery.isError && !conceptQuery.isFetching && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground">
          <AlertTriangle size={16} className="shrink-0 text-destructive" />
          <span className="flex-1">{searchQuery.error?.message}</span>
          <Button size="sm" variant="outline" onClick={() => setSearchKey((k) => k + 1)}>
            Réessayer
          </Button>
        </div>
      )}

      {/* ─── CHARGEMENT RECHERCHE ─── */}
      {searchQuery.isFetching && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* ─── ÉTAT INITIAL (pas encore de recherche) ─── */}
      {!searchQuery.isFetching && !searchQuery.isError && !lastTerm && selected === null && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
          <PackageSearch size={28} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Une seule pièce à chercher ? L&apos;outil identifie la bonne catégorie et vous détaille :
          </p>
          <div className="mx-auto mt-4 flex max-w-xl flex-wrap items-center justify-center gap-2 text-muted-foreground">
            <Chip icon={<Layers size={13} />} label="Les variantes types" />
            <Chip icon={<ListChecks size={13} />} label="La procédure de saisie" />
            <Chip icon={<BookOpen size={13} />} label="Quels champs remplir" />
            <Chip icon={<ShieldAlert size={13} />} label="Les erreurs à éviter" />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground">Essayez :</span>
            {EXEMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => runSearch(ex)}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground transition-colors hover:bg-accent"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── ZÉRO RÉSULTAT ─── */}
      {!searchQuery.isFetching && !searchQuery.isError && searchQuery.data && searchQuery.data.length === 0 && !selected && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
          <PackageSearch size={28} className="mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium text-foreground">Aucun concept trouvé pour « {lastTerm} »</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Vérifiez l&apos;orthographe, essayez un synonyme (ex : « batterie » pour « battery », « plaquette » pour
            « pads ») ou une référence constructeur / OEM.
          </p>
        </div>
      )}

      {/* ─── LISTE DES RÉSULTATS ─── */}
      {!searchQuery.isFetching && searchQuery.data && searchQuery.data.length > 0 && !selected && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {searchQuery.data.length} résultat{searchQuery.data.length > 1 ? "s" : ""}
          </p>
          {searchQuery.data.map((r, i) => (
            <ResultCard key={i} r={r} onOpen={() => r.categorieId != null && setSelected(r)} />
          ))}
        </div>
      )}

      {/* ─── FICHE CONCEPT ─── */}
      {selected !== null && (
        <>
          {conceptQuery.isFetching && (
            <div className="space-y-3">
              <Skeleton className="h-10 w-2/3 rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          )}
          {conceptQuery.isError && !conceptQuery.isFetching && (
            <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground">
              <AlertTriangle size={16} className="shrink-0 text-destructive" />
              <span className="flex-1">{conceptQuery.error?.message}</span>
            </div>
          )}
          {conceptQuery.data && <FicheConcept fiche={conceptQuery.data} cible={selected} onReset={reset} />}
        </>
      )}
    </div>
  );
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs">
      {icon} {label}
    </span>
  );
}

export function ResultCard({ r, onOpen }: { r: Cible; onOpen: () => void }) {
  const scoreColor =
    r.score >= 90 ? "bg-success/10 text-success" : r.score >= 70 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";
  return (
    <button
      onClick={onOpen}
      disabled={r.categorieId == null}
      className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/40 disabled:cursor-default disabled:opacity-60"
    >
      <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${scoreColor}`}>{r.score}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{r.categorieNom ?? r.titreProduit ?? r.categorieId}</span>
          <Badge variant="secondary" className="text-[10px]">
            {r.kind === "PRODUIT" ? "Produit existant" : "Catégorie"}
          </Badge>
          {r.kind === "PRODUIT" && r.referencePrincipale && (
            <span className="font-mono text-[11px] text-muted-foreground">{r.referencePrincipale}</span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Route size={11} />
          {r.chainNoms.length > 0 ? r.chainNoms.join(" > ") : r.explication}
        </span>
        <span className="text-[11px] italic text-muted-foreground">
          {r.matchedBy}
          {r.marque ? ` · ${r.marque}` : ""}
        </span>
      </span>
      {r.categorieId != null && (
        <ChevronRight size={15} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}

/* ─── Fiche concept article ─────────────────────────────────────────────── */

export function FicheConcept({ fiche, cible, onReset }: { fiche: any; cible: Cible; onReset: () => void }) {
  const BranchIcon = fiche.branche === "OUTIL" ? Wrench : fiche.branche === "EQUIPEMENT" ? HardHat : null;
  return (
    <div className="space-y-5">
      {/* En-tête concept */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {fiche.chain.map((c: any, i: number) => (
            <span key={c.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={11} />}
              <span className={i === fiche.chain.length - 1 ? "font-semibold text-foreground" : ""}>{c.nom}</span>
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-foreground">{fiche.categorie.nom}</h2>
          {BranchIcon && <BranchIcon size={18} className="text-muted-foreground" />}
          {fiche.categorie.niveauOntologie && (
            <Badge variant="secondary" className="text-[10px]">{fiche.categorie.niveauOntologie}</Badge>
          )}
          {fiche.branche && <Badge variant="outline" className="text-[10px]">{fiche.branche}</Badge>}
          {fiche.niveauExemplaire && (
            <Badge className="bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/30 text-[10px]">Suivi par exemplaire</Badge>
          )}
        </div>
        {fiche.guide?.titre && (
          <p className="mt-2 text-sm text-foreground">
            <Star size={13} className="mr-1 inline text-primary" />
            {fiche.guide.titre}
            {fiche.guide.contexte && <span className="text-muted-foreground"> — {fiche.guide.contexte}</span>}
          </p>
        )}
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <InfoTile label="Niveau d'abstraction" value="Article → Variante → Exemplaire" />
          <InfoTile label="Identifié par votre recherche" value={cible.matchedBy} />
          <InfoTile label="Score de confiance" value={`${cible.score} / 100`} />
        </div>
      </div>

      {/* Variantes types + différenciateurs */}
      {fiche.variantTypes.length > 0 && (
        <Section title="Variantes types" icon={<Layers size={14} />}>
          <div className="grid gap-3 md:grid-cols-2">
            {fiche.variantTypes.map((v: any) => (
              <div key={v.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{v.nom}</span>
                  {v.estReference && (
                    <Badge className="bg-amber-500/10 text-amber-600 text-[10px]">
                      <Star size={10} className="mr-1" /> Variante de référence
                    </Badge>
                  )}
                </div>
                {v.description && <p className="mt-1 text-xs text-muted-foreground">{v.description}</p>}
                {v.diffPrincipale && (
                  <p className="mt-1 text-xs text-foreground">
                    Différence clé : <span className="text-muted-foreground">{v.diffPrincipale}</span>
                  </p>
                )}
                {v.differentiators.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                    {v.differentiators.map((d: any) => (
                      <div key={d.id} className="flex items-start justify-between gap-2 text-xs">
                        <span className="text-foreground">
                          {d.libelle} <span className="font-mono text-[10px] text-muted-foreground">({d.cle})</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {d.exemple && (
                            <span className="text-[10px] text-muted-foreground">
                              ex. {d.exemple}
                              {d.uniteExemple ? ` ${d.uniteExemple}` : ""}
                            </span>
                          )}
                          <Badge variant={d.statut === "OBLIGATOIRE" ? "default" : "secondary"} className="text-[9px]">
                            {d.statut}
                          </Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Mapping champ → wizard */}
      {fiche.fieldMappings.length > 0 && (
        <Section title="Ce que chaque info devient dans AtelierOne" icon={<ListChecks size={14} />}>
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            {fiche.fieldMappings.map((m: any, i: number) => (
              <div
                key={m.id}
                className={`flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3 ${i > 0 ? "border-t border-border/60" : ""}`}
              >
                <span className="min-w-0 flex-1 text-sm text-foreground">
                  <b>{m.informationMetier}</b>
                  {m.champAtelierOne && (
                    <span className="ml-1.5 font-mono text-[11px] text-primary">{m.champAtelierOne}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  {m.portee && <span>{m.portee}</span>}
                  {m.ecran && <span>· {m.ecran}</span>}
                  {m.etape && <span>· {m.etape}</span>}
                  <Badge variant={m.statut === "OBLIGATOIRE" ? "default" : "secondary"} className="text-[9px]">
                    {m.statut}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Procédures par scénario */}
      {fiche.procedures.length > 0 && (
        <Section title="Procédures de saisie" icon={<ScanSearch size={14} />}>
          <div className="space-y-3">
            {fiche.procedures.map((p: any) => (
              <div key={p.id} className="overflow-hidden rounded-xl border border-border bg-background">
                <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
                  <Badge variant="outline" className="text-[10px]">{SCENARIO_LABELS[p.scenario] ?? p.scenario}</Badge>
                  <span className="font-semibold text-foreground">{p.titre}</span>
                </div>
                {p.contexte && <p className="px-3 pt-2 text-xs italic text-muted-foreground">{p.contexte}</p>}
                <div className="p-3">
                  <ol className="space-y-2">
                    {p.steps.map((s: any, i: number) => (
                      <li key={s.id} className="flex gap-2.5 text-sm">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="font-medium text-foreground">{s.titre}</span>
                          <span className="text-muted-foreground"> — {s.action}</span>
                          {s.ecran && <span className="block text-[11px] text-muted-foreground">Écran : {s.ecran}</span>}
                          {s.champs && (
                            <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                              {s.champs.split("\n").filter(Boolean).map((c: string, j: number) => (
                                <li key={j}>{c}</li>
                              ))}
                            </ul>
                          )}
                          {s.verification && (
                            <span className="mt-1 block text-[11px] text-success-foreground">
                              <CheckCircle2 size={11} className="mr-1 inline" /> Vérification : {s.verification}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Définitions techniques */}
      {fiche.definitions.length > 0 && (
        <Section title="Champs à renseigner" icon={<BookOpen size={14} />}>
          <div className="grid gap-2 sm:grid-cols-2">
            {fiche.definitions.map((d: any) => (
              <div key={d.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{d.libelle}</span>
                  <Badge variant={d.obligatoire ? "default" : "secondary"} className="text-[9px]">
                    {d.obligatoire ? "Obligatoire" : "Optionnel"}
                  </Badge>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{d.cle}</span>
                {d.aide && <p className="mt-1 text-xs text-muted-foreground">{d.aide}</p>}
                {d.explication && <p className="mt-0.5 text-[11px] italic text-muted-foreground">{d.explication}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Règles de modélisation */}
      {fiche.modelingRules.length > 0 && (
        <Section title="Comment modéliser" icon={<Layers size={14} />}>
          <div className="space-y-2">
            {fiche.modelingRules.map((r: any) => (
              <div key={r.id} className="rounded-lg border border-border bg-background p-3">
                <p className="text-sm font-semibold text-foreground">{r.titre}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.enonce}</p>
                {r.casExemple && <p className="mt-1 text-[11px] italic text-muted-foreground">Ex : {r.casExemple}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Relations métier */}
      {fiche.relations.length > 0 && (
        <Section title="Relations métier" icon={<Route size={14} />}>
          <div className="space-y-2">
            {fiche.relations.map((r: any) => (
              <div key={r.id} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                <Badge variant="outline" className="shrink-0 text-[10px]">{r.typeRelation}</Badge>
                <span className="min-w-0 text-xs text-muted-foreground">
                  {r.definition}
                  {r.exemple && <span className="ml-1 italic text-muted-foreground">Ex : {r.exemple}</span>}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Étapes de saisie (legacy) */}
      {fiche.steps.length > 0 && (
        <Section title="Étapes clés" icon={<ListChecks size={14} />}>
          <ol className="space-y-2">
            {fiche.steps.map((s: any, i: number) => (
              <li key={s.id} className="flex gap-2.5 rounded-lg border border-border bg-background p-3 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  {i + 1}
                </span>
                <div>
                  <span className="font-medium text-foreground">{s.titre}</span>
                  <p className="text-xs text-muted-foreground">{s.texte}</p>
                  {s.recommandation && (
                    <p className="mt-1 text-[11px] text-success-foreground">Recommandation : {s.recommandation}</p>
                  )}
                  {s.champCle && (
                    <span className="mt-1 block font-mono text-[10px] text-muted-foreground">Champ : {s.champCle}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Pièges et erreurs */}
      {fiche.errors.length > 0 && (
        <Section title="Erreurs fréquentes" icon={<ShieldAlert size={14} />}>
          <div className="space-y-2">
            {fiche.errors.map((e: any) => (
              <div key={e.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={e.severity === "error" ? "destructive" : "outline"} className="text-[9px]">
                    {e.severity}
                  </Badge>
                  <span className="text-sm font-medium text-foreground">{e.message}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{e.actions}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Exemples du référentiel */}
      {fiche.examples.length > 0 && (
        <Section title="Exemples réels du référentiel" icon={<Star size={14} />}>
          <div className="space-y-2">
            {fiche.examples.map((e: any) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
              >
                {e.estReference && <Star size={12} className="text-amber-500" />}
                <span className="text-sm font-medium text-foreground">{e.libelle}</span>
                {e.motif && <span className="text-xs text-muted-foreground">— {e.motif}</span>}
                {(e.titre || e.designationArticle) && (
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {e.titre ?? e.designationArticle}
                  </Badge>
                )}
                {e.referencePrincipale && (
                  <span className="font-mono text-[10px] text-muted-foreground">{e.referencePrincipale}</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Compatibilités réelles */}
      {fiche.compatibilites.length > 0 && (
        <Section title="Exemples de compatibilité (réel)" icon={<Route size={14} />}>
          <div className="flex flex-wrap gap-2">
            {fiche.compatibilites.map((c: any, i: number) => (
              <span key={i} className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground">
                {c.marque} {c.modele}
                {c.motorisation && <span className="text-muted-foreground"> · {c.motorisation}</span>}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Règles (legacy) */}
      {fiche.rules.length > 0 && (
        <Section title="Règles de saisie" icon={<ShieldAlert size={14} />}>
          <div className="space-y-2">
            {fiche.rules.map((r: any) => (
              <div key={r.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
                  {r.condition && <span className="text-xs text-muted-foreground">{r.condition}</span>}
                </div>
                <p className="mt-1 text-sm text-foreground">{r.conseil}</p>
                {r.preuve && <p className="mt-0.5 text-[11px] italic text-muted-foreground">{r.preuve}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="flex justify-center">
        <Button variant="outline" onClick={onReset} className="gap-1.5">
          <Search size={14} /> Nouvelle recherche
        </Button>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-foreground">{value}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span> {title}
      </h3>
      {children}
    </section>
  );
}