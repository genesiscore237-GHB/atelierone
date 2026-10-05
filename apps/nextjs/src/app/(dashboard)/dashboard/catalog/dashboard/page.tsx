"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "~/trpc/react";
import {
  Package, Layers, Wrench, HardHat, Briefcase,
  CheckCircle2, AlertTriangle, AlertOctagon, Info,
  PackageX, TrendingDown, ArrowRightLeft, Clock,
  CalendarClock, ChevronRight, RefreshCw, Plus,
  Boxes, CircleDot, ShieldCheck, ChevronDown,
  Droplet, Puzzle, Building2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";
import { isDev } from "~/lib/app-nav";
import { Skeleton } from "~/components/ui/skeleton";
import { Badge } from "~/components/ui/badge";

const TYPE_LABELS: Record<string, { label: string; icon: typeof Package }> = {
  PIECE: { label: "Pièces", icon: Package },
  CONSOMMABLE: { label: "Consommables", icon: Boxes },
  OUTIL: { label: "Outils", icon: Wrench },
  EQUIPEMENT: { label: "Équipements", icon: HardHat },
  SERVICE: { label: "Services", icon: Briefcase },
};

const PROBLEM_ICONS: Record<string, typeof AlertTriangle> = {
  INCOMPLETE_ARTICLE: AlertOctagon,
  MISSING_CATEGORY: AlertTriangle,
  MISSING_BRAND: Info,
  MISSING_PRIMARY_REFERENCE: Info,
  DUPLICATE_CANDIDATE: AlertOctagon,
  ORPHAN_VARIANTE: AlertTriangle,
};

const SEVERITY_COLORS: Record<string, string> = {
  error: "border-destructive/30 bg-destructive/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  info: "border-sky-500/30 bg-sky-500/5",
};

const SEVERITY_BADGE: Record<string, string> = {
  error: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/10 text-amber-600",
  info: "bg-sky-500/10 text-sky-600",
};

export default function CatalogDashboardPage() {
  const { hasPermission } = usePermissions();
  const peutConsulter = hasPermission("stock.consulter");

  const { data, isLoading, isError, error, refetch } = api.catalog.apercu.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    retry: 1,
  });

  const [refreshing, setRefreshing] = useState(false);
  const [creerOpen, setCreerOpen] = useState(false);
  const creerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (creerRef.current && !creerRef.current.contains(e.target as Node)) setCreerOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
      toast.success("Données actualisées");
    } catch {
      toast.error("Impossible d'actualiser les données");
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  if (!peutConsulter) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <AlertTriangle size={15} /> Vous n&apos;avez pas la permission de consulter le catalogue.
      </div>
    );
  }

  const CREER_OPTIONS = [
    { label: "Pièce", icon: Package },
    { label: "Consommable", icon: Droplet },
    { label: "Kit", icon: Puzzle },
    { label: "Outil", icon: Wrench },
    { label: "Équipement", icon: Building2 },
    { label: "Service", icon: Briefcase },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Vue d&apos;ensemble — Catalogue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Référentiel articles, variantes, outillage, équipements et services.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleRefresh}
            disabled={refreshing || isLoading}
            aria-label="Actualiser les données"
            title="Actualiser les données"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </Button>
          <div className="relative" ref={creerRef}>
            <Button size="sm" className="gap-1.5" onClick={() => setCreerOpen(o => !o)}>
              <Plus size={14} /> Créer <ChevronDown size={13} />
            </Button>
            {creerOpen && (
              <div className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                {CREER_OPTIONS.map(opt => (
                  <Link
                    key={opt.label}
                    href="/dashboard/catalog/article/nouveau"
                    onClick={() => setCreerOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    <opt.icon size={14} className="text-muted-foreground" />
                    {opt.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── ERREUR ─── */}
      {isError && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 text-destructive" />
          <div className="flex-1 text-sm text-foreground">
            Impossible de charger la vue d&apos;ensemble.
            {error?.message && <span className="text-muted-foreground"> ({error.message})</span>}
          </div>
          <Button size="sm" variant="outline" onClick={handleRefresh}>Réessayer</Button>
        </div>
      )}

      {/* ─── LOADING ─── */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          {/* ═══ SECTION A : STATISTIQUES RÉFÉRENTIEL ═══ */}
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <Boxes size={14} className="mr-1.5 inline" />
              Référentiel
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                icon={Package}
                label="Articles"
                value={data.catalogue.articles}
                href="/dashboard/catalog"
                color="text-primary"
              />
              <StatCard
                icon={Layers}
                label="Variantes"
                value={data.catalogue.variantes}
                href="/dashboard/catalog"
                color="text-primary"
              />
              <StatCard
                icon={Wrench}
                label="Modèles d'outils"
                value={data.catalogue.toolModels}
                href="/dashboard/stock/outillage"
                color="text-primary"
              />
              <StatCard
                icon={HardHat}
                label="Équipements"
                value={data.catalogue.equipment}
                href="/dashboard/catalog/equipements"
                color="text-muted-foreground"
                enConstruction
              />
              <StatCard
                icon={Briefcase}
                label="Services"
                value={data.catalogue.services}
                href="/dashboard/catalog/services"
                color="text-muted-foreground"
                enConstruction
              />
              <StatCard
                icon={ShieldCheck}
                label="Score qualité"
                value={data.quality.score}
                suffix="/ 100"
                href="/dashboard/catalog?tab=qualite"
                color={data.quality.score >= 80 ? "text-success-foreground" : data.quality.score >= 50 ? "text-amber-600" : "text-destructive"}
              />
            </div>
          </section>

          {/* ═══ SECTION B : QUALITÉ DU RÉFÉRENTIEL ═══ */}
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                <CheckCircle2 size={14} className="mr-1.5 inline text-primary" />
                Qualité du référentiel
              </h2>
            </div>
            <div className="p-4">
              {/* Barre de score */}
              <div className="mb-4 flex items-center gap-4">
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      data.quality.score >= 80 ? "bg-success" :
                      data.quality.score >= 50 ? "bg-amber-500" : "bg-destructive"
                    }`}
                    style={{ width: `${data.quality.score}%` }}
                  />
                </div>
                <span className="min-w-[3rem] text-right text-lg font-bold tabular-nums text-foreground">
                  {data.quality.score}
                </span>
              </div>

              {/* Liste des problèmes */}
              {data.quality.problemsSummary.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success-foreground">
                  <CheckCircle2 size={15} /> Aucun problème détecté — référentiel sain.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.quality.problemsSummary.map((p) => {
                    const Icon = PROBLEM_ICONS[p.code] ?? Info;
                    return (
                      <Link
                        key={p.code}
                        href={`/dashboard/catalog/articles?problem=${p.code}`}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent/30 ${SEVERITY_COLORS[p.severity] ?? "border-border bg-background"}`}
                      >
                        <Icon size={15} className="shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-sm text-foreground">{p.label}</span>
                        <Badge variant="secondary" className={`text-xs font-bold ${SEVERITY_BADGE[p.severity] ?? ""}`}>
                          {p.count}
                        </Badge>
                        <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              )}

              <p className="mt-3 text-[10px] text-muted-foreground">
                Généré il y a {Math.round((Date.now() - new Date(data.quality.generatedAt).getTime()) / 60_000)} min
                {data.quality.generatedAt && ` · ${data.quality.generatedAt ? new Date(data.quality.generatedAt).toLocaleTimeString("fr-FR") : ""}`}
              </p>
            </div>
          </section>

          {/* ═══ SECTION C : STOCK (APERÇU) ═══ */}
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <PackageX size={14} className="mr-1.5 inline" />
              Stock
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <PackageX size={13} className="text-destructive" /> Hors stock
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{data.stock.outOfStock}</p>
                <p className="text-xs text-muted-foreground">articles avec stock = 0</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <TrendingDown size={13} className="text-amber-500" /> Sous seuil
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{data.stock.belowThreshold}</p>
                <p className="text-xs text-muted-foreground">articles sous le seuil d&apos;alerte</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <ArrowRightLeft size={13} className="text-sky-500" /> Mouvements aujourd&apos;hui
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{data.stock.movementsToday}</p>
                <p className="text-xs text-muted-foreground">entrées / sorties / transferts</p>
              </div>
            </div>
          </section>

          {/* ═══ SECTION D : OUTILLAGE (APERÇU) ═══ */}
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              <Wrench size={14} className="mr-1.5 inline" />
              Outillage
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/dashboard/stock/outillage?tab=prets"
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Clock size={13} className={data.outillage.overdueLoans > 0 ? "text-destructive" : "text-muted-foreground"} />
                  Prêts en retard
                </div>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${data.outillage.overdueLoans > 0 ? "text-destructive" : "text-foreground"}`}>
                  {data.outillage.overdueLoans}
                </p>
                <p className="text-xs text-muted-foreground">outils à relancer</p>
              </Link>
              <Link
                href="/dashboard/stock/outillage?tab=calibration"
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <CalendarClock size={13} className={data.outillage.calibrationDue > 0 ? "text-amber-500" : "text-muted-foreground"} />
                  Calibration due
                </div>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${data.outillage.calibrationDue > 0 ? "text-amber-600" : "text-foreground"}`}>
                  {data.outillage.calibrationDue}
                </p>
                <p className="text-xs text-muted-foreground">instruments à calibrer</p>
              </Link>
            </div>
          </section>

          {/* ═══ SECTION E : RÉPARTITION PAR TYPE ═══ */}
          {data.typeRepartition.length > 0 && (
            <section className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  <CircleDot size={14} className="mr-1.5 inline text-primary" />
                  Répartition par type
                </h2>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  {data.typeRepartition
                    .sort((a, b) => b.count - a.count)
                    .map((item) => {
                      const total = data.typeRepartition.reduce((s, r) => s + r.count, 0);
                      const pct = total > 0 ? Math.round(item.count / total * 100) : 0;
                      const meta = TYPE_LABELS[item.type];
                      const Icon = meta?.icon ?? Package;
                      return (
                        <div key={item.type}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-foreground">
                              <Icon size={14} className="text-muted-foreground" />
                              {meta?.label ?? item.type}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {item.count.toLocaleString("fr-FR")} <span className="text-muted-foreground/60">({pct}%)</span>
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </section>
          )}

          {/* ═══ SECTION F : ACTIVITÉ RÉCENTE ═══ */}
          {data.recentActivity.length > 0 && (
            <section className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  <RefreshCw size={14} className="mr-1.5 inline text-primary" />
                  Activité récente
                </h2>
              </div>
              <div className="divide-y divide-border/50">
                {data.recentActivity.map((item) => (
                  <Link
                    key={item.id}
                    href={`/dashboard/catalog/${item.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{item.titre}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.codeArticle && <span className="mr-1.5 font-mono">{item.codeArticle}</span>}
                        {item.typeProduit}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {item.statutCycleVie ?? "ACTIF"}
                    </Badge>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("fr-FR") : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Sous-composants ─── */
function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  href,
  color,
  enConstruction,
}: {
  icon: typeof Package;
  label: string;
  value: number | null;
  suffix?: string;
  href: string;
  color: string;
  enConstruction?: boolean;
}) {
  const isHidden = enConstruction && !isDev();

  if (isHidden) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 opacity-50">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Icon size={13} /> {label}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">En construction</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
    >
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Icon size={13} className={color} /> {label}
        {enConstruction && (
          <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold text-amber-600">
            DEV
          </span>
        )}
      </div>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>
        {value !== null ? value.toLocaleString("fr-FR") : "—"}
        {suffix && <span className="ml-1 text-sm font-normal text-muted-foreground">{suffix}</span>}
      </p>
    </Link>
  );
}
