"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Car,
  ChevronRight,
  Clock,
  Gauge,
  Receipt,
  Wallet,
  Wrench,
} from "lucide-react";
import { api } from "~/trpc/react";
import { DOMAINS, findDomain } from "~/lib/app-nav";
import { usePermissions } from "~/hooks/usePermissions";

const PERIODES = [
  { id: "jour", label: "Jour" },
  { id: "semaine", label: "Semaine" },
  { id: "mois", label: "Mois" },
  { id: "trimestre", label: "Trimestre" },
] as const;
type PeriodeId = (typeof PERIODES)[number]["id"];

const POLL_MS = 30_000;

const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));

const statutKpiColor = (s: string) =>
  s === "VERT" ? "bg-success/15 text-success-foreground"
  : s === "ORANGE" ? "bg-warning/15 text-warning-foreground"
  : s === "ROUGE" ? "bg-destructive/15 text-destructive"
  : "bg-muted text-muted-foreground";

const KPI_LABELS: Record<string, string> = {
  PONCTUALITE: "Ponctualité",
  FTQ: "Qualité 1ᵉʳ passage",
  TAUX_RETOUR_SAV: "Retour SAV",
  RAPIDITE_DIAG_JOURS: "Rapidité diagnostic",
  FIABILITE_APPRO: "Fiabilité appro",
  SATISFACTION_CLIENT: "Satisfaction",
};

/**
 * LOT 3 — Tableau de bord Direction (source : docs/HARMONISATION-VEHICULE.md §3.4).
 * Agrège atelier + parking + finance + créances en une vue unique, avec
 * polling 30 s et sélecteur de période. Chaque carte gère loading / erreur /
 * vide indépendamment (une carte sans permission ne casse pas la page).
 */
export default function PilotagePage() {
  const { canAccessModule } = usePermissions();
  const domain = findDomain("pilotage");
  const [periode, setPeriode] = useState<PeriodeId>("mois");

  const sante = api.atelierKpi.getSanteGarage.useQuery({ periode }, { refetchInterval: POLL_MS });
  const parc = api.or.getDashboard.useQuery(undefined, { refetchInterval: POLL_MS });
  const parking = api.garage.overview.useQuery(undefined, { refetchInterval: POLL_MS });
  const facturation = api.atelierKpi.getFacturation.useQuery({ periode }, { refetchInterval: POLL_MS });
  const creatances = api.finance.getDebts.useQuery(undefined, { refetchInterval: POLL_MS });
  const tempsStatuts = api.atelierKpi.tempsParStatut.useQuery({ periode }, { refetchInterval: POLL_MS });

  // Évaluation des règles qualité → notifications E1 (déléguée à une mutation :
  // le GET getSanteGarage est pur, sans effet de bord — refactor Lot 4).
  const evaluerRegles = api.atelierKpi.evaluerReglesQualite.useMutation();
  useEffect(() => {
    evaluerRegles.mutate({ periode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  const visibleDomains = DOMAINS.filter((d) => canAccessModule(d.id));

  return (
    <div>
      {/* Hero + sélecteur de période */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-6 md:p-8">
        <div className="absolute -right-16 -top-16 size-48 rounded-full bg-[var(--module-analytics-bg)] blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--module-analytics-bg)] text-[var(--module-analytics)] shadow-inner">
            <Gauge className="size-7" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
              Tableau de bord direction
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Vision unifiée atelier · parking · finance — actualisation automatique toutes les 30 s.
            </p>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:thin]">
            {PERIODES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriode(p.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${periode === p.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Santé atelier ── */}
      <section className="mt-6">
        <SectionHeader icon={Activity} title="Santé atelier" href="/dashboard/atelier/performance" />
        <Card query={sante}>
          {(d) => (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-2 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Score global</p>
                  <p className="text-2xl font-black">{d.score?.score ?? 0}<span className="text-sm text-muted-foreground">/100</span></p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${statutKpiColor(d.score?.verdict === "BON" ? "VERT" : d.score?.verdict === "MOYEN" ? "ORANGE" : "ROUGE")}`}>
                    {d.score?.verdict ?? "—"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {d.totalActifs} OR actif(s) · {d.totalLivrePeriode} livré(s) sur la période · {d.reglesGenerees} règle(s) qualité
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {(d.kpis ?? []).map((k: any) => (
                  <div key={k.code} className="rounded-xl border border-border bg-card p-3">
                    <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${statutKpiColor(k.statut)}`}>{k.statut}</span>
                    <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">{KPI_LABELS[k.code] ?? k.code}</p>
                    <p className="text-lg font-black">{k.valeur != null ? `${k.valeur}${k.unite === "%" ? " %" : ""}` : "—"}</p>
                    {k.cible != null && <p className="text-[10px] text-muted-foreground">cible : {k.cible}{k.unite === "%" ? " %" : ""}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* ── Parc OR + charge techniciens ── */}
      <section className="mt-6">
        <SectionHeader icon={Wrench} title="Parc OR & charge techniciens" href="/dashboard/atelier/parc" />
        <Card query={parc}>
          {(d) => (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <MiniStat label="En parc" value={d.kpis?.totalParc} />
                <MiniStat label="P1" value={d.kpis?.p1Ouverts} danger={(d.kpis?.p1Ouverts ?? 0) > 0} />
                <MiniStat label="En retard" value={d.kpis?.enRetard} danger={(d.kpis?.enRetard ?? 0) > 0} />
                <MiniStat label="Bloqués" value={d.kpis?.bloques} danger={(d.kpis?.bloques ?? 0) > 0} />
                <MiniStat label="Prêts livrer" value={d.kpis?.pretALivrer} />
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Charge techniciens (capacité 5)</h3>
                {(d.chargeTechniciens ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun technicien actif.</p>
                ) : (
                  <div className="space-y-2">
                    {(d.chargeTechniciens ?? []).slice(0, 8).map((c: any) => (
                      <div key={c.technicien.id} className="flex items-center gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                          {c.technicien.prenom} {c.technicien.nom}
                        </span>
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${c.depassement80 ? "bg-destructive" : c.pourcent > 60 ? "bg-warning" : "bg-success"}`}
                            style={{ width: `${Math.min(100, c.pourcent)}%` }}
                          />
                        </div>
                        <span className="w-16 text-right text-xs font-black">{c.actifs}/{c.capacite}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* ── Occupation parking ── */}
      <section className="mt-6">
        <SectionHeader icon={Building2} title="Occupation parking (tous sites)" href="/dashboard/garage" />
        <Card query={parking}>
          {(d) => (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Véhicules" value={d.totalVehicules} />
                <MiniStat label="Non positionnés" value={d.nonPositionnes} danger={(d.nonPositionnes ?? 0) > 0} />
                <MiniStat label="Alertes ouvertes" value={d.alertesOuvertes} danger={(d.alertesOuvertes ?? 0) > 0} />
                <MiniStat label="Sites actifs" value={(d.sites ?? []).length} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(d.sites ?? []).map((s: any) => (
                  <div key={s.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold">{s.nom} <span className="font-mono text-[10px] text-muted-foreground">({s.code})</span></p>
                        <p className="text-xs text-muted-foreground">{s.nbVehicules} véhicule(s) · {s.nbZones} zone(s) · {s.nbSpots} spots</p>
                      </div>
                      <span className="text-lg font-black">{s.tauxOccupation} %</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${s.tauxOccupation > 90 ? "bg-destructive" : s.tauxOccupation > 70 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min(100, s.tauxOccupation)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* ── Facturation & créances ── */}
      <section className="mt-6">
        <SectionHeader icon={Receipt} title="Facturation & créances" href="/dashboard/atelier/performance?tab=facturation" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card query={facturation}>
            {(d) => (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Facturé" value={`${fmtFCFA(d.totalFacture)} F`} />
                  <MiniStat label="Encaissé" value={`${fmtFCFA(d.totalPaye)} F`} />
                  <MiniStat label="Restant dû" value={`${fmtFCFA(d.totalReste)} F`} danger={d.totalReste > 0} />
                  <MiniStat label="Recouvrement" value={d.tauxRecouvrement != null ? `${d.tauxRecouvrement} %` : "—"} />
                </div>
                {(d.topClientsRetard ?? []).slice(0, 3).map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs">
                    <span className="font-semibold">{c.client}</span>
                    <span className="font-black text-destructive">reste {fmtFCFA(c.reste)} F</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card query={creatances}>
            {(debts) => {
              const list = Array.isArray(debts) ? debts : [];
              const totalDu = list.reduce((s: number, d: any) => s + (d.remaining ?? 0), 0);
              const enRetard = list.filter((d: any) => d.isOverdue).length;
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <MiniStat label="Créances" value={list.length} />
                    <MiniStat label="Restant dû" value={`${fmtFCFA(totalDu)} F`} danger={totalDu > 0} />
                    <MiniStat label="En retard" value={enRetard} danger={enRetard > 0} />
                  </div>
                  {list.slice(0, 4).map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-semibold">{d.customerName}</span>
                      {d.isOverdue && <span className="mr-2 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-destructive">Retard</span>}
                      <span className="font-black">{fmtFCFA(d.remaining)} F</span>
                    </div>
                  ))}
                  {list.length === 0 && <p className="text-sm text-success-foreground">Aucune créance ouverte.</p>}
                </div>
              );
            }}
          </Card>
        </div>
      </section>

      {/* ── Temps par statut ── */}
      <section className="mt-6">
        <SectionHeader icon={Clock} title="Temps passé par statut (OR)" href="/dashboard/atelier/parc" />
        <Card query={tempsStatuts}>
          {(d) => (
            (d.statuts ?? []).length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Aucun historique de statut sur la période.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Statut</th>
                      <th className="px-3 py-2 text-right">Temps total</th>
                      <th className="px-3 py-2 text-right">Moyenne / passage</th>
                      <th className="px-3 py-2 text-right">Passages</th>
                      <th className="px-3 py-2 text-right">OR concernés</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {(d.statuts ?? []).map((s: any) => (
                      <tr key={s.statut} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-xs font-semibold">{s.libelle}</td>
                        <td className="px-3 py-2 text-right text-xs font-black">{s.totalJours} j</td>
                        <td className="px-3 py-2 text-right text-xs">{s.moyenneJours != null ? `${s.moyenneJours} j` : "—"}</td>
                        <td className="px-3 py-2 text-right text-xs">{s.occurrences}</td>
                        <td className="px-3 py-2 text-right text-xs">{s.nbOrs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </Card>
      </section>

      {/* ── Accès rapide (hub conservé) ── */}
      {domain && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
          <div className="border-b border-border/60 px-5 py-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Accès rapide — tous les domaines</h2>
          </div>
          <ul className="divide-y divide-border/60">
            {visibleDomains.map((d, index) => (
              <motion.li key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                <Link href={d.homeHref ?? d.href} className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-accent/50">
                  <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${d.bg} ${d.color} shadow-inner`}>
                    <d.icon className="size-4.5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold tracking-tight text-foreground">{d.label}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{d.modules.length} module{d.modules.length > 1 ? "s" : ""} · {d.desc}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Sous-composants ───

function SectionHeader({ icon: Icon, title, href }: { icon: any; title: string; href?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-foreground">
        <Icon size={15} strokeWidth={2} /> {title}
      </h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Détail <ArrowRight size={11} />
        </Link>
      )}
    </div>
  );
}

/** Carte générique : loading / erreur / vide gérés proprement (règle UX AGENTS.md). */
function Card<T>({ query, children }: { query: { data?: T; isLoading: boolean; error?: unknown }; children: (data: T) => React.ReactNode }) {
  if (query.isLoading) {
    return <div className="h-40 animate-pulse rounded-xl border border-border bg-card/40" />;
  }
  if (query.error || query.data === undefined || query.data === null) {
    return (
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <p className="text-sm text-muted-foreground">Données indisponible — vérifiez vos permissions ou réessayez plus tard.</p>
      </div>
    );
  }
  return <div className="rounded-xl border border-border bg-card/40 p-4">{children(query.data)}</div>;
}

function MiniStat({ label, value, danger }: { label: string; value: string | number | null | undefined; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-black ${danger ? "text-destructive" : "text-foreground"}`}>{value ?? "—"}</p>
    </div>
  );
}
