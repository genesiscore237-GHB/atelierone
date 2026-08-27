"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { Activity, AlertTriangle, ArrowRight, Car, CheckCircle, Clock, Gauge, Receipt, Users } from "lucide-react";
import Link from "next/link";
import { PRIORITE_META, STATUT_BADGE, STATUT_LABELS } from "~/server/lib/atelier-service";

const PERIODES = [
  { id: "jour", label: "Jour" },
  { id: "semaine", label: "Semaine" },
  { id: "mois", label: "Mois" },
  { id: "trimestre", label: "Trimestre" },
] as const;

type PeriodeId = (typeof PERIODES)[number]["id"];

const TABS = [
  { id: "direction", label: "Direction", icon: Gauge },
  { id: "sante", label: "Santé du garage", icon: Activity },
  { id: "sav", label: "Qualité & SAV", icon: AlertTriangle },
  { id: "diag", label: "Diagnostic", icon: Clock },
  { id: "competences", label: "Compétences / RH", icon: Users },
  { id: "delais", label: "Compétitivité délais", icon: CheckCircle },
  { id: "facturation", label: "Facturation", icon: Receipt },
] as const;
type TabId = (typeof TABS)[number]["id"];

const POINT_MATINAL = [
  "Tous les P1 ont un technicien assigné aujourd'hui",
  "Aucun véhicule en RETARD n'est sans action prévue",
  "Les BLOQUÉS ont une raison claire et un plan de déblocage",
  "Les promesses de livraison du jour sont tenables",
  "Les techniciens savent sur quel véhicule ils travaillent",
  "Capacité réservée (~20%) pour les urgences de la journée",
  "Les factures en attente de bon de commande ont été relancées",
];

export function PerformanceQualite() {
  const params = useSearchParams();
  const initialTab = (params.get("tab") as TabId | null) ?? "direction";
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? initialTab : "direction");
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
        {tab === "direction" && <VueDirection periode={periode} />}
        {tab === "sante" && <VueSante periode={periode} />}
        {tab === "sav" && <VueSAV periode={periode} />}
        {tab === "diag" && <VueDiagnostic periode={periode} />}
        {tab === "competences" && <VueCompetences periode={periode} />}
        {tab === "delais" && <VueDelais periode={periode} />}
        {tab === "facturation" && <VueFacturation periode={periode} />}
      </div>
    </div>
  );
}

// ─── Vue Direction (temps réel + point matinal + alertes) ───
function VueDirection({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.or.getDashboard.useQuery();
  const { data: fact } = api.atelierKpi.getFacturation.useQuery({ periode });
  const [checklist, setChecklist] = useState<Record<number, boolean>>({});

  if (isLoading || !data) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  const kpis = data.kpis as any;
  const repPriorite = (data.repPriorite ?? []) as any[];
  const repStatut = (data.repStatut ?? []) as any[];
  const parc = (data.parc ?? []) as any[];
  const critiques = parc.filter((p: any) => p.alerte === "RETARD" || p.alerte === "BLOQUE" || p.priorite === "P1");
  const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));

  return (
    <div className="space-y-4">
      {/* Bandeau temps réel */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <BandeauKpi label="Véhicules en parc" value={kpis.totalParc} className="text-foreground" />
        <BandeauKpi label="Priorité P1" value={kpis.p1Ouverts} className={kpis.p1Ouverts > 0 ? "text-destructive" : "text-success-foreground"} />
        <BandeauKpi label="En retard" value={kpis.enRetard} className={kpis.enRetard > 0 ? "text-destructive" : "text-success-foreground"} />
        <BandeauKpi label="Bloqués" value={kpis.bloques} className={kpis.bloques > 0 ? "text-warning" : "text-success-foreground"} />
        <BandeauKpi label="Prêts à livrer" value={kpis.pretALivrer} className="text-primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Répartitions */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Répartition par priorité</h3>
          <div className="space-y-2">
            {repPriorite.map((r: any) => (
              <div key={r.priorite} className="flex items-center gap-2 text-sm">
                <span className={`w-8 rounded px-1.5 py-0.5 text-center text-[11px] font-black text-white ${r.priorite === "P1" ? "bg-destructive" : r.priorite === "P2" ? "bg-warning" : r.priorite === "P3" ? "bg-success" : "bg-muted text-muted-foreground"}`}>{r.priorite}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${r.priorite === "P1" ? "bg-destructive" : r.priorite === "P2" ? "bg-warning" : r.priorite === "P3" ? "bg-success" : "bg-muted"}`} style={{ width: `${Math.max(3, r.pourcent)}%` }} />
                </div>
                <span className="w-24 text-right text-xs text-muted-foreground">{r.nombre} · {r.pourcent}%</span>
              </div>
            ))}
          </div>
          <h3 className="mb-3 mt-5 text-sm font-bold uppercase tracking-wider text-foreground">Répartition par statut</h3>
          <div className="flex flex-wrap gap-1.5">
            {repStatut.map((s: any) => (
              <span key={s.statut} className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                {s.libelle} <b className="text-foreground">{s.nombre}</b>
              </span>
            ))}
          </div>
        </div>

        {/* Point matinal */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <CheckCircle size={14} className="text-primary" /> Point matinal ({Object.values(checklist).filter(Boolean).length}/{POINT_MATINAL.length})
          </h3>
          <div className="space-y-2">
            {POINT_MATINAL.map((item, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/30">
                <input
                  type="checkbox"
                  checked={!!checklist[i]}
                  onChange={(e) => setChecklist((prev) => ({ ...prev, [i]: e.target.checked }))}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span className={checklist[i] ? "text-muted-foreground line-through" : "text-foreground"}>{item}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">🔴 Retards : {kpis.enRetard}</span>
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning-foreground">🟣 Bloqués : {kpis.bloques}</span>
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">🔴 P1 : {kpis.p1Ouverts}</span>
          </div>
        </div>
      </div>

      {/* Alertes critiques — action requise */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <AlertTriangle size={14} className="text-warning" /> Alertes critiques — action requise ({critiques.length})
        </h3>
        {critiques.length === 0 ? (
          <p className="text-sm text-success-foreground">Aucune alerte critique — tout est sous contrôle.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Immat.</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Priorité</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2 text-right">Jours</th>
                  <th className="px-3 py-2 text-right">Retard</th>
                  <th className="px-3 py-2">Alerte</th>
                  <th className="px-3 py-2">Action requise</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {critiques.slice(0, 15).map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs font-bold">{p.immatriculation}</td>
                    <td className="px-3 py-2 text-xs">{p.clientDisplay}</td>
                    <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-black text-white ${p.priorite === "P1" ? "bg-destructive" : p.priorite === "P2" ? "bg-warning" : p.priorite === "P3" ? "bg-success" : "bg-muted text-muted-foreground"}`}>{p.priorite}</span></td>
                    <td className="px-3 py-2 text-xs">{STATUT_LABELS[p.statut] ?? p.statut}</td>
                    <td className="px-3 py-2 text-right text-xs">{p.joursImmobilisation} j</td>
                    <td className="px-3 py-2 text-right text-xs font-bold text-destructive">{p.retardJours > 0 ? `${p.retardJours} j` : "—"}</td>
                    <td className="px-3 py-2 text-xs font-bold">{p.alerte}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.alerte === "RETARD" && "Relancer / terminer les travaux"}
                      {p.alerte === "BLOQUE" && `Débloquer : ${p.raisonBlocage ?? "raison non renseignée"}`}
                      {p.alerte !== "RETARD" && p.alerte !== "BLOQUE" && "Priorité critique — avancer immédiatement"}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/ordres-reparation?or=${p.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        Ouvrir <ArrowRight size={11} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vue Facturation ───
function VueFacturation({ periode }: { periode: PeriodeId }) {
  const { data, isLoading } = api.atelierKpi.getFacturation.useQuery({ periode });
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));
  const ETATS: Record<string, { label: string; badge: string }> = {
    NON_TRANSMISE: { label: "Non transmise", badge: "bg-muted text-muted-foreground" },
    ATTENTE_BON_COMMANDE: { label: "Attente bon de commande", badge: "bg-violet-500/15 text-violet-400" },
    ATTENTE_PAIEMENT: { label: "Attente paiement", badge: "bg-warning/15 text-warning-foreground" },
    AVANCE: { label: "Avance reçue", badge: "bg-sky-500/15 text-sky-400" },
    PAYEE: { label: "Payée", badge: "bg-success/15 text-success-foreground" },
  };
  const etats = (data.etats ?? {}) as Record<string, number>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <BandeauKpi label="Facturé (période)" value={fmtFCFA(data.totalFacture) + " F"} className="text-foreground" />
        <BandeauKpi label="Encaissé" value={fmtFCFA(data.totalPaye) + " F"} className="text-success-foreground" />
        <BandeauKpi label="Restant dû" value={fmtFCFA(data.totalReste) + " F"} className={data.totalReste > 0 ? "text-destructive" : "text-success-foreground"} />
        <BandeauKpi label="Marge (CMP)" value={fmtFCFA(data.totalMarge) + " F"} className="text-primary" />
        <BandeauKpi label="Taux recouvrement" value={data.tauxRecouvrement != null ? `${data.tauxRecouvrement} %` : "—"} className="text-foreground" />
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">États</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(ETATS).map(([k, m]) => (
              <span key={k} className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${m.badge}`}>{m.label} <b>{etats[k] ?? 0}</b></span>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Top clients en retard de paiement</h3>
        {(data.topClientsRetard ?? []).length === 0 ? (
          <p className="text-sm text-success-foreground">Aucun client en retard — excellent recouvrement.</p>
        ) : (
          <div className="space-y-2">
            {(data.topClientsRetard ?? []).map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                <span className="w-5 text-xs font-black text-muted-foreground">{i + 1}</span>
                <span className="font-semibold">{c.client}</span>
                <span className="text-xs text-muted-foreground">{c.ors} OR</span>
                <span className="ml-auto text-xs text-muted-foreground">facturé {fmtFCFA(c.facture)} F</span>
                <span className="text-xs text-success-foreground">payé {fmtFCFA(c.paye)} F</span>
                <span className="w-28 text-right text-xs font-bold text-destructive">reste {fmtFCFA(c.reste)} F</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BandeauKpi({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-black ${className ?? "text-foreground"}`}>{value}</p>
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