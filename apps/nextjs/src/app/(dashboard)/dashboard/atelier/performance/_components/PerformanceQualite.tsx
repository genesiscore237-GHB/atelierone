"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Activity, AlertTriangle, Car, CheckCircle, Clock, Gauge, Users } from "lucide-react";
import { PRIORITE_META, STATUT_BADGE, STATUT_LABELS } from "~/server/lib/atelier-service";

const PERIODES = [
  { id: "jour", label: "Jour" },
  { id: "semaine", label: "Semaine" },
  { id: "mois", label: "Mois" },
  { id: "trimestre", label: "Trimestre" },
] as const;

type PeriodeId = (typeof PERIODES)[number]["id"];

const TABS = [
  { id: "sante", label: "Santé du garage", icon: Gauge },
  { id: "sav", label: "Qualité & SAV", icon: AlertTriangle },
  { id: "diag", label: "Diagnostic", icon: Clock },
  { id: "competences", label: "Compétences / RH", icon: Users },
  { id: "delais", label: "Compétitivité délais", icon: Activity },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function PerformanceQualite() {
  const [tab, setTab] = useState<TabId>("sante");
  const [periode, setPeriode] = useState<PeriodeId>("mois");

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Performance & Qualité</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Indicateurs décisionnels basés sur les données réelles du cycle véhicule — ponctualité, qualité diagnostic, comebacks, productivité.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:thin]">
          {PERIODES.map((p) => (
            <button key={p.id} onClick={() => setPeriode(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${periode === p.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1.5 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:thin]">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "sante" && <VueSante periode={periode} />}
        {tab === "sav" && <VueSAV periode={periode} />}
        {tab === "diag" && <VueDiagnostic periode={periode} />}
        {tab === "competences" && <VueCompetences periode={periode} />}
        {tab === "delais" && <VueDelais periode={periode} />}
      </div>
    </div>
  );
}

// ─── Vue Santé ───
function VueSante({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getSanteGarage.useQuery({ periode });
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  const statutColor = (s: string) => s === "VERT" ? "bg-success/15 text-success-foreground" : s === "ORANGE" ? "bg-warning/15 text-warning-foreground" : s === "ROUGE" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";
  const kpiLabels: Record<string, string> = {
    PONCTUALITE: "Ponctualité",
    FTQ: "Qualité 1ᵉʳ passage",
    TAUX_RETOUR_SAV: "Taux retour SAV",
    RAPIDITE_DIAG_JOURS: "Rapidité diagnostic",
    FIABILITE_APPRO: "Fiabilité approvisionnement",
    SATISFACTION_CLIENT: "Satisfaction client",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {data.kpis.map((k: any) => (
          <div key={k.code} className="rounded-xl border border-border bg-card p-3">
            <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${statutColor(k.statut)}`}>{k.statut}</span>
            <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">{kpiLabels[k.code] ?? k.code}</p>
            <p className="text-lg font-black">{k.valeur != null ? `${k.valeur}${k.unite === "%" ? " %" : ""}` : "—"}</p>
            {k.cible != null && <p className="text-[10px] text-muted-foreground">cible : {k.cible}{k.unite === "%" ? " %" : ""}</p>}
          </div>
        ))}
      </div>

      {(data.topAnciens ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground"><Car size={13} /> Top anciens du parc</h3>
          <div className="space-y-1.5">
            {data.topAnciens.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-sm">
                <span className="font-mono text-xs font-bold">{t.immatriculation}</span>
                <span className="text-xs text-muted-foreground truncate max-w-48">{t.clientDisplay}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${PRIORITE_META[t.priorite]?.badge ?? ""}`}>{t.priorite}</span>
                <span className="text-xs font-black text-warning-foreground">{t.joursImmobilisation} j</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vue SAV ───
function VueSAV({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getQualiteSAV.useQuery({ periode });
  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const sav = (data?.sav ?? []) as any[];
  const parMotif = (data?.parMotif ?? {}) as Record<string, number>;
  const MOTIFS: Record<string, string> = { CONSIGNE_NON_RESPECTEE: "Consigne non respectée", MALFACON: "Malfaçon", DIAGNOSTIC_ERRONE: "Diagnostic erroné", PIECE_DEFAILLANTE: "Pièce défaillante", AUTRE: "Autre" };

  return (
    <div className="space-y-4">
      {Object.keys(parMotif).length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Object.entries(parMotif).map(([m, n]) => (
            <div key={m} className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-center">
              <p className="text-[10px] uppercase text-destructive">{MOTIFS[m] ?? m}</p>
              <p className="text-lg font-black text-destructive">{n}</p>
            </div>
          ))}
        </div>
      )}
      {sav.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Aucun retour SAV sur la période — excellente qualité.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full">
            <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-4 py-2.5">N° OR SAV</th><th className="px-4 py-2.5">Véhicule</th><th className="px-4 py-2.5">Client</th><th className="px-4 py-2.5">Motif</th><th className="px-4 py-2.5">Responsable OR origine</th><th className="px-4 py-2.5 text-right">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sav.map((s: any) => (
                <tr key={s.id} className="text-sm">
                  <td className="px-4 py-2 font-mono text-xs font-bold">{s.numero}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.immatriculation}</td>
                  <td className="px-4 py-2">{s.clientDisplay}</td>
                  <td className="px-4 py-2"><span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">{MOTIFS[s.motifRetourSAV] ?? s.motifRetourSAV}</span></td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{s.responsablePrenom ? `${s.responsablePrenom} ${s.responsableNom}` : "—"}</td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Vue Diagnostic ───
function VueDiagnostic({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getDiagnostics.useQuery({ periode });
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Délai moyen diagnostic</p>
          <p className="text-lg font-black text-primary">{data.delaiMoyenJours != null ? `${data.delaiMoyenJours} j` : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Précision (sans renvoi)</p>
          <p className="text-lg font-black text-success-foreground">{data.precision != null ? `${data.precision} %` : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Diagnostics période</p>
          <p className="text-lg font-black">{data.count}</p>
        </div>
      </div>
      {(data.casProblematiques ?? []).length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-warning-foreground"><Clock size={13} /> Cas les plus longs à diagnostiquer</h3>
          <div className="space-y-1">
            {(data.casProblematiques ?? []).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-1.5 text-sm">
                <span className="font-mono text-xs">{c.numero} · {c.immatriculation}</span>
                <span className="font-bold text-destructive">{c.jours} j</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vue Compétences / RH ───
function VueCompetences({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getCompetences.useQuery({ periode });
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const fiches = (data.fiches ?? []) as any[];

  const recoBadge = (r: string) =>
    r === "FORMATION_REQUISE" ? "bg-destructive/10 text-destructive" : r === "A_SURVEILLER" ? "bg-warning/10 text-warning-foreground" : "bg-success/10 text-success-foreground";

  return (
    <div className="space-y-3">
      {fiches.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Aucun technicien actif trouvé.</p>
      ) : (
        fiches.map((f: any) => (
          <div key={f.technicien.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-primary" />
                <span className="font-bold text-foreground">{f.technicien.prenom} {f.technicien.nom}</span>
                <span className="text-xs text-muted-foreground">{f.technicien.fonction}</span>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${recoBadge(f.recommandation)}`}>{f.recommandation.replace(/_/g, " ")}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label="OR traités" value={f.orResponsabilises} />
              <Stat label="Livrés" value={f.livres} />
              <Stat label="En cours" value={f.enCours} />
              <Stat label="Retouche" value={f.retoucheTaux != null ? `${f.retoucheTaux} %` : "—"} />
              <Stat label="Comebacks imputés" value={f.comebacksImputes} danger={f.comebacksImputes >= 2} />
              <Stat label="1ᵉʳ passage" value={f.premierPassageTaux != null ? `${f.premierPassageTaux} %` : "—"} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Vue Délais vs standards ───
function VueDelais({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getCompetitivite.useQuery({ periode });
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const familles = (data.familles ?? []) as any[];
  if (familles.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Aucune livraison sur la période.</p>;

  return (
    <div className="space-y-2">
      {familles.map((f: any) => {
        const dansStd = f.dansStandard ?? 0;
        return (
          <div key={f.famille} className="rounded-lg border border-border bg-card px-4 py-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{f.libelle}</span>
              <span className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{f.count} livrés · moyenne {f.delaiMoyenJours} j</span>
                {f.cibleJours != null && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${dansStd >= 80 ? "bg-success/15 text-success-foreground" : dansStd >= 50 ? "bg-warning/15 text-warning-foreground" : "bg-destructive/15 text-destructive"}`}>
                    {dansStd} % dans le standard ({f.cibleJours} j)
                  </span>
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className={`rounded-lg p-2 text-center ${danger ? "bg-destructive/10" : "bg-muted/40"}`}>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${danger ? "text-destructive" : "text-foreground"}`}>{value}</p>
    </div>
  );
}