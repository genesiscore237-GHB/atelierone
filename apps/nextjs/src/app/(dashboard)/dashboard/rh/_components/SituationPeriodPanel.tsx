"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api, type RouterOutputs } from "~/trpc/react";
import { usePermissions } from "~/hooks/usePermissions";
import { useEmployeFromUrl } from "~/hooks/useEmployeFromUrl";
import { downloadCsv } from "./csv-download";
import { PaginationBar } from "./ClientPagination";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Banknote,
  CalendarDays,
  Download,
  FileSearch,
  Filter,
  HandCoins,
  Info,
  Loader2,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Badge } from "~/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { EmptyState } from "~/components/ui/empty-state";
import { cn } from "~/lib/utils";

const STATUT_LABELS: Record<string, string> = {
  actif: "Actif",
  conge: "Congé",
  suspendu: "Suspendu",
  archive: "Archivé",
  sorti: "Sorti",
};

const MODE_LABELS: Record<string, string> = {
  NON_REMUNERE: "Non rémunéré",
  FORFAIT_HEBDOMADAIRE: "Forfait hebdo",
  SALAIRE_MENSUEL: "Mensuel",
  SALAIRE_HORAIRE: "Horaire",
  JOURNALIER: "Journalier",
  COMMISSION: "Commission",
};

const ETAT_LABELS: Record<string, string> = {
  PRESENT: "Présent",
  ABSENT: "Absent",
  CONGE: "Congé",
  MUET: "Non pointé",
  JOURNEE_EN_COURS: "Journée en cours",
  NON_COMPTABILISE: "Non comptabilisé",
};

const ETAT_STYLES: Record<string, string> = {
  PRESENT: "bg-success/20 text-success-foreground border-success/40",
  ABSENT: "bg-destructive/20 text-destructive border-destructive/50",
  CONGE: "bg-primary/15 text-primary border-primary/40",
  MUET: "bg-muted text-muted-foreground border-border",
  JOURNEE_EN_COURS: "bg-warning/25 text-warning-foreground border-warning/60 animate-pulse",
  NON_COMPTABILISE: "bg-muted text-muted-foreground border-dashed border-border",
};

const PERIOD_GLOBAL_BADGE: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" }> = {
  EN_COURS: { label: "Période en cours", variant: "warning" },
  PARTIELLEMENT_CLOTUREE: { label: "Partiellement clôturée", variant: "warning" },
  CLOTUREE: { label: "Clôturée", variant: "success" },
  MIXTE: { label: "Période mixte (multi-mois)", variant: "default" },
};

const GRAVITE_STYLE: Record<string, string> = {
  CRITIQUE: "border-destructive/40 bg-destructive/10 text-destructive",
  ATTENTION: "border-warning/50 bg-warning/10 text-warning-foreground",
  INFO: "border-border bg-muted text-muted-foreground",
};

const SORT_KEYS = [
  { key: "nom", label: "Employé" },
  { key: "matricule", label: "Matricule" },
  { key: "joursAbsence", label: "Absences" },
  { key: "heures", label: "Heures" },
  { key: "retardTotalMinutes", label: "Retards" },
  { key: "net", label: "Net" },
] as const;
type SortKey = (typeof SORT_KEYS)[number]["key"];

const PAGE_SIZES = [25, 50, 100, 200] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);

const fmtXOF = (n: number | null | undefined) =>
  n === null || n === undefined ? null : new Intl.NumberFormat("fr-FR").format(Math.round(n));

const fmtHM = (min: number | null | undefined) => {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
};

const MASQUE = "***";

type SituationData = RouterOutputs["rhPeriode"]["situation"];
type EmployeData = RouterOutputs["rhPeriode"]["employe"];
type Row = SituationData["rows"][number];
type JournalEntry = EmployeData["avances"]["journal"][number];

export default function SituationPeriodPanel() {
  const { hasPermission } = usePermissions();

  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);

  const [dfFrom, setDfFrom] = useState(defaultFrom);
  const [dfTo, setDfTo] = useState(iso(today));
  const [dfEmployeId, setDfEmployeId] = useState("");
  const [dfDepartementId, setDfDepartementId] = useState("");
  const [dfStatut, setDfStatut] = useState("");
  const [dfMode, setDfMode] = useState("");
  const [dfSearch, setDfSearch] = useState("");

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(iso(today));
  const [employeId, setEmployeId] = useState<number | undefined>(undefined);
  const [departementId, setDepartementId] = useState<number | undefined>(undefined);
  const [statut, setStatut] = useState<string | undefined>(undefined);
  const [modePaie, setModePaie] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState<string | undefined>(undefined);

  const employeUrl = useEmployeFromUrl();
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (employeUrl) {
      setDfEmployeId(String(employeUrl));
      setEmployeId(employeUrl);
      setAnalyse(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeUrl]);

  const [analyse, setAnalyse] = useState(false);
  const [sort, setSort] = useState<SortKey>("nom");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<number | null>(null);

  const situation = api.rhPeriode.situation.useQuery(
    {
      from,
      to,
      ...(employeId ? { employeId } : {}),
      ...(departementId ? { departementId } : {}),
      ...(statut ? { statut } : {}),
      ...(modePaie ? { modePaie } : {}),
      ...(search ? { search } : {}),
      sort,
      dir,
      page,
      pageSize,
    },
    { enabled: analyse }
  );

  const employerList = api.rh.list.useQuery({ limit: 300 });
  const departments = api.rh.listDepartments.useQuery();

  const exportCsv = api.rhPeriode.export.useQuery(
    {
      from,
      to,
      ...(employeId ? { employeId } : {}),
      ...(departementId ? { departementId } : {}),
      ...(statut ? { statut } : {}),
      ...(modePaie ? { modePaie } : {}),
      ...(search ? { search } : {}),
    },
    { enabled: false }
  );

  const lanceAnalyse = () => {
    if (!dfFrom || !dfTo) {
      toast.error("Période incomplète", { description: "Renseignez « Du » et « Au »." });
      return;
    }
    if (dfTo < dfFrom) {
      toast.error("Période inversée", { description: "La date de fin est antérieure à la date de début." });
      return;
    }
    setFrom(dfFrom);
    setTo(dfTo);
    setEmployeId(dfEmployeId ? Number(dfEmployeId) : undefined);
    setDepartementId(dfDepartementId ? Number(dfDepartementId) : undefined);
    setStatut(dfStatut || undefined);
    setModePaie(dfMode || undefined);
    setSearch(dfSearch.trim() || undefined);
    setPage(1);
    setAnalyse(true);
    const p = new URLSearchParams(searchParams.toString());
    if (dfEmployeId) p.set("employeId", dfEmployeId); else p.delete("employeId");
    router.replace(`?${p.toString()}`, { scroll: false });
  };

  const reinitialiser = () => {
    setDfFrom(defaultFrom);
    setDfTo(iso(today));
    setDfEmployeId("");
    setDfDepartementId("");
    setDfStatut("");
    setDfMode("");
    setDfSearch("");
    setFrom(defaultFrom);
    setTo(iso(today));
    setEmployeId(undefined);
    setDepartementId(undefined);
    setStatut(undefined);
    setModePaie(undefined);
    setSearch(undefined);
    setSort("nom");
    setDir("asc");
    setPage(1);
    setAnalyse(false);
  };

  const changerTri = (key: SortKey) => {
    if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setDir(key === "nom" || key === "matricule" ? "asc" : "desc");
    }
  };

  const exporter = async () => {
    const res = await exportCsv.refetch();
    if (res.data) downloadCsv(res.data, `situation-rh-${from}-au-${to}.csv`);
    else toast.error("Export impossible");
  };

  const periodState = situation.data?.periodState;
  const aggregates = situation.data?.aggregates;
  const anomalies = situation.data?.anomaliesSummary;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Situation RH &amp; Paie</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analyse de période — lecture seule : présence, rémunération, avances et anomalies, sans aucune écriture.
          </p>
        </div>
        {situation.data && (
          <Badge
            variant={PERIOD_GLOBAL_BADGE[periodState?.global ?? "EN_COURS"]?.variant ?? "secondary"}
            className="gap-1.5"
          >
            <CalendarDays size={13} />
            {PERIOD_GLOBAL_BADGE[periodState?.global ?? "EN_COURS"]?.label ?? periodState?.global}
          </Badge>
        )}
      </div>

      {/* Niveau A — Bandeau de période & filtres */}
      <div className="mt-5 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sit-from">Du</Label>
            <Input id="sit-from" type="date" value={dfFrom} onChange={(e) => setDfFrom(e.target.value)} className="w-44" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sit-to">Au</Label>
            <Input id="sit-to" type="date" value={dfTo} onChange={(e) => setDfTo(e.target.value)} className="w-44" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sit-employe">Employé</Label>
            <Select value={dfEmployeId} onValueChange={setDfEmployeId}>
              <SelectTrigger id="sit-employe" className="w-56">
                <SelectValue placeholder="Tous les employés" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__tous">Tous les employés</SelectItem>
                {(employerList.data?.employees ?? []).map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.nom} {e.prenom} · {e.matricule}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sit-dept">Département</Label>
            <Select value={dfDepartementId} onValueChange={setDfDepartementId}>
              <SelectTrigger id="sit-dept" className="w-48">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__tous">Tous</SelectItem>
                {(departments.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sit-statut">Statut</Label>
            <Select value={dfStatut} onValueChange={setDfStatut}>
              <SelectTrigger id="sit-statut" className="w-36">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__tous">Tous</SelectItem>
                {Object.entries(STATUT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sit-mode">Mode de paie</Label>
            <Select value={dfMode} onValueChange={setDfMode}>
              <SelectTrigger id="sit-mode" className="w-44">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__tous">Tous</SelectItem>
                {Object.entries(MODE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sit-search">Recherche</Label>
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="sit-search"
                value={dfSearch}
                onChange={(e) => setDfSearch(e.target.value)}
                placeholder="Nom, matricule…"
                className="w-52 pl-8"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={lanceAnalyse} disabled={!dfFrom || !dfTo}>
            <Search size={15} /> Analyser
          </Button>
          <Button variant="outline" onClick={reinitialiser}>
            <X size={15} /> Réinitialiser
          </Button>
          {hasPermission("rh.presence.consulter") && situation.data && (
            <Button variant="outline" onClick={exporter} disabled={exportCsv.isFetching}>
              <Download size={15} /> {exportCsv.isFetching ? "Préparation…" : "Exporter CSV"}
            </Button>
          )}
          {periodState && periodState.mois.length > 1 && (
            <div className="ml-auto flex items-center gap-1.5">
              {periodState.mois.map((m) => (
                <Badge key={m.mois} variant={m.etat === "CLOTURE" ? "success" : "warning"} className="gap-1">
                  {m.label}
                  {m.etat === "CLOTURE" ? "clôturé" : "en cours"}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {!analyse ? (
        <div className="mt-6">
          <EmptyState
            title="Analyse non lancée"
            description="Choisissez une période puis cliquez sur « Analyser » pour générer la situation."
          />
        </div>
      ) : situation.isLoading ? (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-muted/50" />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/30" />
        </div>
      ) : situation.isError ? (
        <div className="mt-6">
          <EmptyState
            title="Erreur serveur"
            description={situation.error?.message ?? "Impossible de charger la situation."}
          />
        </div>
      ) : (
        <>
          {/* Niveau B — Cartes d'agrégation */}
          {aggregates && <AggregationCards aggregates={aggregates} anomalies={anomalies} hasSalary={hasPermission("rh.salaire.consulter")} />}

          {/* Niveau C — Tableau de synthèse */}
          <SituationTable
            rows={situation.data?.rows ?? []}
            total={situation.data?.total ?? 0}
            page={situation.data?.page ?? page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            onChangeTri={changerTri}
            onPage={setPage}
            onChangePageSize={setPageSize}
            onOpen={(id) => setSelected(id)}
            hasSalary={hasPermission("rh.salaire.consulter")}
          />
        </>
      )}

      {/* Niveau D — Volet d'investigation */}
      <InvestigationSheet
        employeId={selected}
        from={from}
        to={to}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

// ─── Niveau B — cartes d'agrégation ───

function AggregationCards({
  aggregates,
  anomalies,
  hasSalary,
}: {
  aggregates: SituationData["aggregates"];
  anomalies: SituationData["anomaliesSummary"];
  hasSalary: boolean;
}) {
  const cards: Array<{ label: string; value: string; muted?: boolean; icon: ReactNode }> = [
    { label: "Employés", value: String(aggregates.employes), icon: <UserRound size={16} /> },
    { label: "Jours théoriques", value: String(aggregates.joursTheoriques), icon: <CalendarDays size={16} /> },
    { label: "Jours présence", value: String(aggregates.joursPresence), icon: <CalendarDays size={16} /> },
    { label: "Jours absence", value: String(aggregates.joursAbsence), icon: <CalendarDays size={16} /> },
    { label: "Jours congés", value: String(aggregates.joursConges), icon: <CalendarDays size={16} /> },
    { label: "Heures travaillées", value: `${aggregates.heuresTravaillees} h`, icon: <CalendarDays size={16} /> },
    { label: "Retards totaux", value: fmtHM(aggregates.retardTotalMinutes), icon: <CalendarDays size={16} /> },
    {
      label: "Masse acquise",
      value: hasSalary ? (aggregates.masseAcquise === null ? MASQUE : `${fmtXOF(aggregates.masseAcquise)} FCFA`) : "—",
      muted: !hasSalary,
      icon: <Banknote size={16} />,
    },
    {
      label: "Avancé sur période",
      value: hasSalary ? (aggregates.avancePeriode === null ? MASQUE : `${fmtXOF(aggregates.avancePeriode)} FCFA`) : "—",
      muted: !hasSalary,
      icon: <HandCoins size={16} />,
    },
    {
      label: "Récupéré sur période",
      value: hasSalary ? (aggregates.recuperePeriode === null ? MASQUE : `${fmtXOF(aggregates.recuperePeriode)} FCFA`) : "—",
      muted: !hasSalary,
      icon: <HandCoins size={16} />,
    },
    { label: "Anomalies", value: String(anomalies?.total ?? 0), icon: <AlertTriangle size={16} /> },
  ];

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{c.label}</span>
            {c.icon}
          </div>
          <p className={cn("mt-1.5 text-lg font-bold tabular-nums", c.muted ? "text-muted-foreground" : "text-foreground")}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Niveau C — tableau de synthèse ───

function SituationTable({
  rows,
  total,
  page,
  pageSize,
  sort,
  dir,
  onChangeTri,
  onPage,
  onChangePageSize,
  onOpen,
  hasSalary,
}: {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
  dir: "asc" | "desc";
  onChangeTri: (k: SortKey) => void;
  onPage: (p: number) => void;
  onChangePageSize: (p: number) => void;
  onOpen: (id: number) => void;
  hasSalary: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-5">
        <EmptyState title="Aucune donnée sur la période" description="Aucun employé ne correspond aux filtres sélectionnés." />
      </div>
    );
  }

  const tri = (k: SortKey) => (
    <button
      type="button"
      onClick={() => onChangeTri(k)}
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      title={`Trier (${dir === "asc" ? "croissant" : "décroissant"})`}
      aria-label={`Trier par ${triLabel(k)}`}
    >
      {sort === k ? (dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
      <span>{triLabel(k)}</span>
    </button>
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {total} employé{total > 1 ? "s" : ""} · tri global serveur : <span className="font-semibold">{triLabel(sort)}</span>
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Lignes/page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onChangePageSize(Number(v))}>
            <SelectTrigger className="h-7 w-20 px-2 text-xs" aria-label="Lignes par page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-2 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-max w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th colSpan={2} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Employé
              </th>
              <th colSpan={6} className="border-l border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Présence
              </th>
              <th colSpan={4} className="border-l border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rémunération
              </th>
              <th colSpan={3} className="border-l border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Avances
              </th>
              <th className="border-l border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Contrôle
              </th>
            </tr>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left">{tri("nom")}</th>
              <th className="px-3 py-2 text-left">{tri("matricule")}</th>
              <th className="px-3 py-2 text-right text-xs text-muted-foreground">Théor.</th>
              <th className="px-3 py-2 text-right text-xs text-muted-foreground">Présents</th>
              <th className="px-3 py-2 text-right text-xs">{tri("joursAbsence")}</th>
              <th className="px-3 py-2 text-right text-xs text-muted-foreground">Congés</th>
              <th className="px-3 py-2 text-right text-xs">{tri("heures")}</th>
              <th className="px-3 py-2 text-right text-xs">{tri("retardTotalMinutes")}</th>
              <th className="px-3 py-2 text-right text-xs text-muted-foreground">Base</th>
              <th className="px-3 py-2 text-right text-xs text-muted-foreground">Gains</th>
              <th className="px-3 py-2 text-right text-xs text-muted-foreground">Retenues</th>
              <th className="px-3 py-2 text-right text-xs">{tri("net")}</th>
              <th className="px-3 py-2 text-right text-xs text-muted-foreground">Avancé</th>
              <th className="px-3 py-2 text-right text-xs text-muted-foreground">Récupéré</th>
              <th className="px-3 py-2 text-right text-xs text-muted-foreground">Solde fin</th>
              <th className="px-3 py-2 text-right text-xs text-muted-foreground">Anomalies</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.employeeId}
                onClick={() => onOpen(r.employeeId)}
                className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/50"
                title="Ouvrir le volet d'investigation"
              >
                <td className="px-3 py-2 whitespace-nowrap font-medium text-foreground">
                  {r.nom} {r.prenom}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.matricule ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.joursTheoriques}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.joursPresence}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", r.joursAbsence > 0 && "font-semibold text-destructive")}>
                  {r.joursAbsence}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.joursConges}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.heuresTravaillees} h</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", (r.retardTotalMinutes ?? 0) > 0 && "text-warning-foreground")}>
                  {fmtHM(r.retardTotalMinutes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{hasSalary ? (r.salaires ? fmtXOF(r.salaires.baseContractuelle) ?? "—" : MASQUE) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{hasSalary ? (r.salaires ? `${fmtXOF(r.salaires.gains) ?? "—"} F` : MASQUE) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{hasSalary ? (r.salaires ? `${fmtXOF(r.salaires.retenues) ?? "—"} F` : MASQUE) : "—"}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {hasSalary ? (
                    r.salaires ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-bold">{fmtXOF(r.salaires.net) ?? "—"}</span>
                        <Badge variant={r.salaires.netLabel === "REEL" ? "success" : "warning"} className="px-1.5 py-0 text-[10px]">
                          {r.salaires.netLabel}
                        </Badge>
                      </span>
                    ) : (
                      MASQUE
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{hasSalary ? (r.avances ? `${fmtXOF(r.avances.avancePeriode) ?? "—"} F` : MASQUE) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{hasSalary ? (r.avances ? `${fmtXOF(r.avances.recuperePeriode) ?? "—"} F` : MASQUE) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{hasSalary ? (r.avances ? `${fmtXOF(r.avances.soldeFinPeriode) ?? "—"} F` : MASQUE) : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <AnomaliesChips anomalies={r.anomalies} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={total}
        onPage={onPage}
        label="employés"
        empty={total === 0}
      />
    </div>
  );
}

const triLabel = (k: SortKey) => SORT_KEYS.find((s) => s.key === k)?.label ?? k;

function AnomaliesChips({ anomalies }: { anomalies: Row["anomalies"] }) {
  if (!anomalies.length) return <span className="text-xs text-muted-foreground">—</span>;
  const comptes: Record<string, number> = {};
  for (const a of anomalies) comptes[a.gravite] = (comptes[a.gravite] ?? 0) + 1;
  return (
    <div className="inline-flex items-center gap-1">
      {(["CRITIQUE", "ATTENTION", "INFO"] as const).map((g) =>
        comptes[g] ? (
          <Badge key={g} variant="outline" className={cn("gap-0.5 px-1.5 py-0 text-[10px]", GRAVITE_STYLE[g])}>
            {comptes[g]} {g[0]}
          </Badge>
        ) : null
      )}
    </div>
  );
}

// ─── Niveau D — volet d'investigation (Sheet) ───

function InvestigationSheet({
  employeId,
  from,
  to,
  onClose,
}: {
  employeId: number | null;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const { hasPermission } = usePermissions();
  const canSeeSalary = hasPermission("rh.salaire.consulter");
  const detail = api.rhPeriode.employe.useQuery(
    { employeId: employeId ?? 0, from, to },
    { enabled: employeId !== null }
  );

  const d = detail.data;

  return (
    <Sheet open={employeId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {d ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  {d.employe.nom} {d.employe.prenom}
                </span>
                <Badge variant="outline" className="font-mono text-[10px]">{d.employe.matricule}</Badge>
                <Badge variant={d.employe.statut === "actif" ? "success" : "secondary"}>
                  {STATUT_LABELS[d.employe.statut] ?? d.employe.statut}
                </Badge>
              </span>
            ) : (
              "Investigation de période"
            )}
          </SheetTitle>
        </SheetHeader>

        {detail.isLoading && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Analyse en cours…
          </div>
        )}

        {detail.isError && (
          <div className="mt-6">
            <EmptyState title="Erreur" description={detail.error?.message ?? "Impossible de charger le détail."} />
          </div>
        )}

        {d && (
          <div className="mt-4 space-y-5 text-sm">
            <InfoBlock
              label="Parcours"
              rows={[
                { k: "Embauche", v: d.employe.dateEmbauche ?? "—" },
                { k: "Sortie", v: d.employe.dateSortie ?? "—" },
                { k: "Département", v: d.employe.departement ?? "—" },
                { k: "Contrat", v: d.employe.contrat ? `${d.employe.contrat.type} · ${d.employe.contrat.statut}` : "—" },
              ]}
            />

            {/* Segmentation salariale */}
            {canSeeSalary && d.segmentsSalaires && d.segmentsSalaires.length > 1 && (
              <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-foreground">
                  <SlidersHorizontal size={14} /> Changement de rémunération en cours de période
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {d.segmentsSalaires.map((s, i) => (
                    <Badge key={i} variant="outline" className="font-mono text-[11px]">
                      {s.dateDebut} → {s.dateFin} · {fmtXOF(Number(s.baseSalary ?? d.paie.baseContractuelle)) ?? "—"} F
                    </Badge>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Les montants sont calculés par segment (source : historique salarial).
                </p>
              </div>
            )}

            {/* Présence */}
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <CalendarDays size={14} className="text-muted-foreground" /> Présence sur la période
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat label="Jours théoriques" value={String(d.presence.joursTheoriques)} />
                <MiniStat label="Présents" value={String(d.presence.joursPresence)} />
                <MiniStat label="Absents" value={String(d.presence.joursAbsence)} accent={d.presence.joursAbsence > 0} />
                <MiniStat label="Heures" value={`${d.presence.heuresTravaillees} h`} />
              </div>
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1">
                {d.timeline.map((j) => (
                  <div
                    key={j.date}
                    title={`${j.date} (${j.jour}) · ${ETAT_LABELS[j.etat] ?? j.etat}${j.travailMinutes ? ` · ${fmtHM(j.travailMinutes)}` : ""}${j.retardMinutes ? ` · retard ${fmtHM(j.retardMinutes)}` : ""}`}
                    className={cn(
                      "rounded-md border px-0.5 py-1 text-center text-[10px] tabular-nums",
                      ETAT_STYLES[j.etat] ?? ETAT_STYLES.NON_COMPTABILISE
                    )}
                  >
                    <span className="block font-semibold">{Number(j.date.slice(8, 10))}</span>
                    <span className="block opacity-70">{j.travailMinutes ? fmtHM(j.travailMinutes) : j.retardMinutes ? `+${fmtHM(j.retardMinutes)}` : "·"}</span>
                    {j.provisoire && <span className="block font-bold text-warning-foreground">EN COURS</span>}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {Object.entries(ETAT_LABELS).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1">
                    <span className={cn("inline-block h-2 w-2 rounded-sm border", ETAT_STYLES[k].split(" ").slice(0, 2).join(" "))} />
                    {v}
                  </span>
                ))}
              </div>
            </div>

            {/* Avances */}
            {canSeeSalary && d.avances.row && (
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <HandCoins size={14} className="text-muted-foreground" /> Avances &amp; récupérations
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat label="Avancé sur période" value={`${fmtXOF(d.avances.row.avancePeriode) ?? "—"} F`} />
                  <MiniStat label="Récupéré sur période" value={`${fmtXOF(d.avances.row.recuperePeriode) ?? "—"} F`} />
                  <MiniStat label="Solde fin de période" value={`${fmtXOF(d.avances.row.soldeFinPeriode) ?? "—"} F`} />
                  <MiniStat label="Solde actuel" value={`${fmtXOF(d.avances.row.soldeActuel) ?? "—"} F`} />
                </div>
                <JournalAvances journal={d.avances.journal} />
              </div>
            )}

            {/* Net reconstructible */}
            {canSeeSalary && (
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Banknote size={14} className="text-muted-foreground" /> Net reconstruit
                </h3>
                <div className="mt-2 rounded-xl border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Base contractuelle</span>
                    <span className="font-semibold tabular-nums">{fmtXOF(d.paie.baseContractuelle) ?? "—"} F</span>
                    <span className="text-xs text-muted-foreground">· Gains</span>
                    <span className="font-semibold tabular-nums">{fmtXOF(d.paie.gains) ?? "—"} F</span>
                    <span className="text-xs text-muted-foreground">· Retenues</span>
                    <span className="font-semibold tabular-nums">−{fmtXOF(d.paie.retenues) ?? "—"} F</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm font-bold">{fmtXOF(d.paie.net) ?? "—"} F</span>
                    <Badge variant={d.paie.netLabel === "REEL" ? "success" : "warning"}>{d.paie.netLabel}</Badge>
                    {d.paie.bulletin && (
                      <span className="text-[11px] text-muted-foreground">
                        Bulletin #{d.paie.bulletin.id} ({d.paie.bulletin.periodeDebut} → {d.paie.bulletin.periodeFin} · {d.paie.bulletin.statut})
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 space-y-1.5">
                  {d.paie.origine.map((o, i) => (
                    <div key={i} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{o.valeur}</span>
                        <span className="text-xs tabular-nums font-semibold">{fmtXOF(o.montant) ?? "—"} F</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {o.source} · {o.regle}
                        {o.salaireApplicable !== null && o.salaireApplicable !== undefined && (
                          <> · assiette {o.baseCalcul} ({fmtXOF(o.salaireApplicable)} F)</>
                        )}
                      </p>
                      {o.evenements.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {o.evenements.map((ev, j) => (
                            <span key={j} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {ev}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Anomalies (déjà filtrées serveur) */}
            {d.anomalies.length > 0 && (
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <ShieldAlert size={14} className="text-muted-foreground" /> Anomalies &amp; alertes
                </h3>
                <div className="mt-2 space-y-1.5">
                  {d.anomalies.map((a, i) => (
                    <div key={i} className={cn("rounded-lg border p-2.5", GRAVITE_STYLE[a.gravite])}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", GRAVITE_STYLE[a.gravite])}>
                          {a.type}
                        </Badge>
                        <span className="text-xs font-semibold">{a.titre}</span>
                        {a.gravite === "CRITIQUE" && <Info size={13} className="ml-auto" />}
                        {a.gravite === "ATTENTION" && <AlertTriangle size={13} className="ml-auto" />}
                      </div>
                      <p className="mt-1 text-xs opacity-80">{a.description}</p>
                      <p className="mt-1 font-mono text-[10px] opacity-60">{a.source}</p>
                      {a.actionsDisponibles.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {a.actionsDisponibles.map((act, j) => (
                            <Link
                              key={j}
                              href={act.href}
                              className="rounded bg-background/60 px-1.5 py-0.5 text-[10px] hover:bg-background/90"
                              title={act.label}
                            >
                              {act.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("text-base font-bold tabular-nums", accent ? "text-destructive" : "text-foreground")}>{value}</p>
    </div>
  );
}

function InfoBlock({ label, rows }: { label: string; rows: Array<{ k: string; v: string }> }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <FileSearch size={14} className="text-muted-foreground" /> {label}
      </h3>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between gap-2 text-xs">
            <dt className="text-muted-foreground">{r.k}</dt>
            <dd className="font-medium text-foreground">{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function JournalAvances({ journal }: { journal: JournalEntry[] }) {
  if (!journal || journal.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-border p-2">
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Filter size={12} /> Journal de période
      </p>
      <ul className="space-y-1">
        {journal.map((j, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono text-[11px] text-muted-foreground">{j.date}</span>
            <Badge
              variant="outline"
              className={cn(
                "px-1.5 py-0 text-[10px]",
                j.type === "VERSEMENT" && "border-border bg-muted text-foreground",
                j.type === "RECUPERATION" && "border-success/50 bg-success/10 text-success-foreground",
                j.type === "TRANSITION" && "border-warning/50 bg-warning/10 text-warning-foreground"
              )}
            >
              {j.type}
            </Badge>
            <span className="flex-1 truncate px-2 text-right text-muted-foreground">{j.libelle}</span>
            <span className="tabular-nums font-semibold">{j.montant !== null ? `${fmtXOF(j.montant)} F` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}