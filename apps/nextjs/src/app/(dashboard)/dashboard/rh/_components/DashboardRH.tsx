"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Download,
  FileCheck2,
  FileText,
  GraduationCap,
  Timer,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "~/components/ui/button";

const TABS = [
  { id: "dashboard", label: "Tableau de bord", icon: BarChart3 },
  { id: "rapports", label: "Rapports", icon: FileText },
] as const;
type TabId = (typeof TABS)[number]["id"];

const fmtFCFA = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));

export default function DashboardRH() {
  const [tab, setTab] = useState<TabId>("dashboard");
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tableau de bord RH</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Effectifs, présence, masse salariale, alertes et rapports.
        </p>
      </div>

      <div className="mt-5 flex items-center gap-1.5 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:thin]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "dashboard" && <KpisSection />}
        {tab === "rapports" && <RapportsSection />}
      </div>
    </div>
  );
}

// ─── 1. KPI + alertes ───
function KpisSection() {
  const now = new Date();
  const { data, isLoading, isError, refetch } = api.rhDashboard.getKpis.useQuery({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  if (isLoading) return <div className="h-60 animate-pulse rounded-xl bg-muted" />;
  if (isError) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 py-10 text-center">
      <AlertTriangle size={28} className="mb-2 text-destructive" />
      <p className="text-sm font-medium text-foreground">Erreur de chargement</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Réessayer</Button>
    </div>
  );

  const k = data!.kpis;
  const a = data!.alertes;

  const cards = [
    { label: "Effectif total", value: k.effectif, sub: `${k.actifs} actifs · ${k.inactifs} inactifs`, icon: Users, cls: "text-primary bg-primary/10" },
    { label: "CDI", value: k.effectifCDI, sub: "contrats à durée indéterminée", icon: FileCheck2, cls: "text-success-foreground bg-success/10" },
    { label: "Apprentissage", value: k.effectifApprentissage, sub: "apprentis en formation", icon: GraduationCap, cls: "text-info-foreground bg-info/10" },
    { label: "Taux de présence", value: `${k.presence} %`, sub: `${k.presenceDays} j présents / ${k.workingDays} j ouvrés`, icon: Timer, cls: "text-success-foreground bg-success/10" },
    { label: "Masse salariale (base)", value: `${fmtFCFA(k.masseSalariale)} F`, sub: "somme des salaires de base", icon: Wallet, cls: "text-info-foreground bg-info/10" },
    { label: "Absences du mois", value: k.absentTotal, sub: "jours absents", icon: CalendarClock, cls: "text-destructive bg-destructive/10" },
  ];

  const totalAlertes = a.contratsExpirants + a.docsExpires + a.soldesNegatifs;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${c.cls}`}>
                <c.icon size={20} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className="truncate text-lg font-bold text-foreground">{c.value}</p>
                <p className="truncate text-[11px] text-muted-foreground">{c.sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Alertes */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <AlertTriangle size={15} className={totalAlertes > 0 ? "text-warning-foreground" : "text-muted-foreground"} />
            Alertes {totalAlertes > 0 && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning-foreground">{totalAlertes}</span>}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-foreground/80">Contrats expirant sous 30 jours</span>
              <span className={`font-bold ${a.contratsExpirants > 0 ? "text-warning-foreground" : "text-success-foreground"}`}>{a.contratsExpirants}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-foreground/80">Documents expirés</span>
              <span className={`font-bold ${a.docsExpires > 0 ? "text-destructive" : "text-success-foreground"}`}>{a.docsExpires}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-foreground/80">Soldes de congés négatifs</span>
              <span className={`font-bold ${a.soldesNegatifs > 0 ? "text-destructive" : "text-success-foreground"}`}>{a.soldesNegatifs}</span>
            </div>
          </div>
        </div>

        {/* Répartition par département + type de contrat */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Répartitions</div>
          <div className="mb-3">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Par département</div>
            {data!.repartitions.byDepartment.length === 0 ? (
              <p className="py-2 text-center text-sm text-muted-foreground">Aucun employé</p>
            ) : (
              <div className="space-y-2">
                {data!.repartitions.byDepartment.map((d: any) => {
                  const pct = k.effectif ? Math.round((d.count / k.effectif) * 100) : 0;
                  return (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="w-40 truncate text-sm text-foreground/80">{d.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right text-xs font-bold text-muted-foreground">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Par type de contrat</div>
            {data!.repartitions.byContractType.length === 0 ? (
              <p className="py-2 text-center text-sm text-muted-foreground">Aucun employé</p>
            ) : (
              <div className="space-y-2">
                {data!.repartitions.byContractType.map((d: any) => {
                  const pct = k.effectif ? Math.round((d.count / k.effectif) * 100) : 0;
                  return (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="w-40 truncate text-sm text-foreground/80">{d.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right text-xs font-bold text-muted-foreground">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 2. Centre de rapports ───
function RapportsSection() {
  const utils = api.useUtils();
  const [month, setMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);

  const exportEmployes = api.rhDashboard.exportEmployes.useQuery(undefined, { enabled: false });
  const exportPresences = api.rhDashboard.exportPresences.useQuery(
    { year: Number(month.split("-")[0]), month: Number(month.split("-")[1]) },
    { enabled: false }
  );
  const exportMatrice = api.rhDashboard.exportMatrice.useQuery(undefined, { enabled: false });
  const exportDisciplinaire = api.rhDashboard.exportDisciplinaire.useQuery(undefined, { enabled: false });

  const download = (csv: string | undefined, filename: string) => {
    if (!csv) return;
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filename} téléchargé`);
  };

  const run = async (q: any, filename: string) => {
    const res = await q.refetch();
    download(res.data as string, filename);
  };

  const rapports = [
    { label: "Liste des employés", desc: "Matricule, nom, fonction, département, statut, salaire", icon: Users, action: () => run(exportEmployes, "employes.csv") },
    { label: "Présences mensuelles", desc: `Résumés RH-02 (jours présents/absents/congé, heures) — ${month}`, icon: CalendarClock, action: () => run(exportPresences, `presences-${month}.csv`) },
    { label: "Matrice de compétences", desc: "Niveaux actuels vs requis par poste (RH-06)", icon: GraduationCap, action: () => run(exportMatrice, "matrice-competences.csv") },
    { label: "Registre disciplinaire", desc: "Sanctions et décisions (accès restreint RH/Direction)", icon: FileText, action: () => run(exportDisciplinaire, "registre-disciplinaire.csv") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Période (présences) :</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {rapports.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <r.icon size={15} className="text-primary" /> {r.label}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{r.desc}</p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={r.action}>
              <Download size={13} /> CSV
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
