"use client";

import { useMemo, useState } from "react";
import { api } from "~/trpc/react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";
import { statutLabel } from "~/lib/rh-labels";
import {
  exportCsv,
  exportPdf,
  exportXlsx,
  fmtDateFR,
  fmtHeures,
  fmtMontant,
  reportMeta,
  slugPeriode,
  type ReportCell,
} from "./report-exports";
import { PaginationBar } from "./ClientPagination";
import { RapportHistorique } from "./RapportHistorique";
import type { LigneSituation, AgregatsSituation, EtatPeriode } from "~/server/lib/rh-situation-engine";
import type { PersonnelReportRow } from "~/server/lib/rh-reports-engine";

type RapportType = "personnel" | "presences" | "paie" | "avances" | "historique";

const RAPPORT_TYPES: Array<{ id: RapportType; label: string }> = [
  { id: "personnel", label: "Personnel" },
  { id: "presences", label: "Présences" },
  { id: "paie", label: "Paie" },
  { id: "avances", label: "Avances" },
  { id: "historique", label: "Historique" },
];

function premierMois(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function dernierMois(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

interface PersonnelColumnDef {
  id: string;
  label: string;
  sensitive?: boolean;
  get: (r: PersonnelReportRow) => ReportCell;
}

const PERSONNEL_COLUMNS: PersonnelColumnDef[] = [
  { id: "matricule", label: "Matricule", get: (r) => r.matricule },
  { id: "nom", label: "Nom", get: (r) => r.nom },
  { id: "prenom", label: "Prénom", get: (r) => r.prenom },
  { id: "telephone", label: "Téléphone", get: (r) => r.telephone },
  { id: "fonction", label: "Fonction", get: (r) => r.fonction },
  { id: "poste", label: "Poste", get: (r) => r.poste },
  { id: "departement", label: "Département", get: (r) => r.departement },
  { id: "statut", label: "Statut", get: (r) => (r.statut ? statutLabel(r.statut) : null) },
  { id: "typeContrat", label: "Type de contrat", get: (r) => r.typeContrat },
  { id: "dateEmbauche", label: "Date d'embauche", get: (r) => (r.dateEmbauche ? fmtDateFR(r.dateEmbauche) : null) },
  { id: "modePaie", label: "Mode de paiement", get: (r) => r.modePaie },
  { id: "adresse", label: "Adresse", get: (r) => r.adresse },
  { id: "dateNaissance", label: "Date de naissance", get: (r) => (r.dateNaissance ? fmtDateFR(r.dateNaissance) : null) },
  { id: "salaireBase", label: "Salaire base", sensitive: true, get: (r) => r.salaireBase },
];

const DEFAULT_COLUMNS = ["matricule", "nom", "prenom", "fonction", "departement", "telephone", "statut", "typeContrat"];

type PlannedReport =
  | { kind: "personnel"; rows: PersonnelReportRow[]; canSeeSalary: boolean }
  | {
      kind: "presences" | "paie" | "avances";
      rows: LigneSituation[];
      aggregates: AgregatsSituation;
      periodState: EtatPeriode;
    };

function buildSituationTable(kind: "presences" | "paie" | "avances", rows: LigneSituation[]) {
  if (kind === "presences") {
    return {
      headers: [
        "Matricule", "Nom", "Prénom", "Département", "Statut",
        "Jours théoriques", "Jours présents", "Jours absents", "Jours congé",
        "Heures théoriques", "Heures travaillées", "Heures normales", "Heures sup.",
        "Retards (min)", "Départs anticipés (min)", "Taux présence",
      ],
      get: (r: LigneSituation): ReportCell[] => [
        r.matricule, r.nom, r.prenom, r.departement ?? "—", r.statut ? statutLabel(r.statut) : "—",
        r.joursTheoriques, r.joursPresence, r.joursAbsence, r.joursConges,
        Number(r.heuresTheoriques.toFixed(2)), Number(r.heuresTravaillees.toFixed(2)),
        Number(r.heuresNormales.toFixed(2)), Number(r.heuresSupp.toFixed(2)),
        r.retardTotalMinutes, r.departAnticipeTotalMinutes,
        r.tauxPresence === null ? "—" : `${Math.round(r.tauxPresence)}%`,
      ],
    };
  }
  if (kind === "paie") {
    return {
      headers: [
        "Matricule", "Nom", "Prénom", "Département", "Statut",
        "Base contractuelle", "Gains", "Retenues", "Net", "Net (label)",
        "Avance période", "Récupéré période", "Solde fin période", "Bulletin",
      ],
      get: (r: LigneSituation): ReportCell[] => {
        const s = r.salaires;
        return [
          r.matricule, r.nom, r.prenom, r.departement ?? "—", r.statut ? statutLabel(r.statut) : "—",
          s?.baseContractuelle ?? null, s?.gains ?? null, s?.retenues ?? null, s?.net ?? null,
          s?.netLabel ?? "—",
          r.avances?.avancePeriode ?? 0, r.avances?.recuperePeriode ?? 0, r.avances?.soldeFinPeriode ?? 0,
          s?.bulletinExiste ? "Oui" : "Non",
        ];
      },
      numericCols: [5, 6, 7, 8, 10, 11, 12],
    };
  }
  return {
    headers: [
      "Matricule", "Nom", "Prénom", "Département", "Statut",
      "Avance période", "Récupéré période", "Solde fin période", "Solde actuel", "Nb avances",
    ],
    get: (r: LigneSituation): ReportCell[] => [
      r.matricule, r.nom, r.prenom, r.departement ?? "—", r.statut ? statutLabel(r.statut) : "—",
      r.avances?.avancePeriode ?? 0, r.avances?.recuperePeriode ?? 0, r.avances?.soldeFinPeriode ?? 0,
      r.avances?.soldeActuel ?? 0, r.avances?.nbAvances ?? 0,
    ],
  };
}

export default function RapportsPageClient() {
  const [type, setType] = useState<RapportType>("personnel");
  const [from, setFrom] = useState(premierMois());
  const [to, setTo] = useState(dernierMois());
  const [departmentId, setDepartmentId] = useState("");
  const [statut, setStatut] = useState("");
  const [modePaie, setModePaie] = useState("");
  const [searchEmploye, setSearchEmploye] = useState("");
  const [employeIds, setEmployeIds] = useState<number[]>([]);
  const [cols, setCols] = useState<string[]>(DEFAULT_COLUMNS);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planned, setPlanned] = useState<PlannedReport | null>(null);
  const [page, setPage] = useState(1);

  const { hasPermission } = usePermissions();
  const canSeeSalary = hasPermission("rh.salaire.consulter");
  const utils = api.useUtils();

  const employees = api.rh.list.useQuery({ limit: 200 });
  const departments = api.rh.listDepartments.useQuery();
  const employeList = useMemo(
    () =>
      (employees.data?.employees ?? []).filter((e: { nom: string; prenom: string; matricule: string }) => {
        const q = searchEmploye.trim().toLowerCase();
        if (!q) return true;
        return `${e.nom} ${e.prenom} ${e.matricule}`.toLowerCase().includes(q);
      }),
    [employees.data, searchEmploye]
  );

  const pageSize = 12;

  const periodeInvalide = from && to && from > to;

  const situInput = {
    from,
    to,
    departementId: departmentId ? Number(departmentId) : undefined,
    statut: statut || undefined,
    modePaie: modePaie || undefined,
    employeIds: employeIds.length ? employeIds : undefined,
  };

  const preview = async () => {
    if (!from || !to) {
      toast.error("Période requise.");
      return;
    }
    if (from > to) {
      setError("Période inversée : la date de début est après la date de fin.");
      toast.error("Période inversée.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (type === "personnel") {
        const res = (await utils.rhReports.personnel.fetch({
          statut: statut || undefined,
          departmentId: departmentId || undefined,
          employeIds: employeIds.length ? employeIds : undefined,
        })) as { rows: PersonnelReportRow[]; canSeeSalary: boolean; total: number };
        setPlanned({ kind: "personnel", rows: res.rows, canSeeSalary: res.canSeeSalary });
      } else {
        const pages = [];
        let pg = 1;
        let total = Infinity;
        while (pages.reduce((a, p) => a + p.rows.length, 0) < total) {
          const res = await utils.rhPeriode.situation.fetch({ ...situInput, page: pg, pageSize: 200 });
          pages.push(res);
          total = res.total;
          if (pg >= 6) break; // garde tampon ~1200 lignes : affiner les filtres au-delà
          pg += 1;
        }
        const rows = pages.flatMap((p) => p.rows);
        const first = pages[0];
        setPlanned({
          kind: type as "presences" | "paie" | "avances",
          rows,
          aggregates: first.aggregates,
          periodState: first.periodState,
        });
      }
      setGeneratedAt(new Date().toISOString().slice(0, 10));
      setPage(1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const selectedEmployees = useMemo(() => {
    const list = (employees.data?.employees ?? []) as Array<{ id: number; nom: string; prenom: string; matricule: string }>;
    return list.filter((e) => employeIds.includes(e.id));
  }, [employees.data, employeIds]);

  const toggleEmploye = (id: number) => {
    setEmployeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Table prête à afficher/exporter (tri + pagination)
  const prepared = useMemo<{ headers: string[]; rows: ReportCell[][]; sortable: boolean[] } | null>(() => {
    if (!planned) return null;
    if (planned.kind === "personnel") {
      const defs = cols
        .map((cid) => PERSONNEL_COLUMNS.find((c) => c.id === cid))
        .filter((c): c is PersonnelColumnDef => Boolean(c));
      const headers = defs.map((c) => c.label);
      const rows = planned.rows.map((r) => defs.map((c) => c.get(r)));
      return { headers, rows, sortable: defs.map((c) => !c.sensitive) };
    }
    const t = buildSituationTable(planned.kind, planned.rows);
    return { headers: t.headers, rows: planned.rows.map((r) => t.get(r)), sortable: t.headers.map(() => true) };
  }, [planned, cols]);

  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    if (!prepared) return { headers: [], rows: [], total: 0 };
    let rows = prepared.rows.slice();
    if (sortCol !== null) {
      rows.sort((a, b) => {
        const av = a[sortCol];
        const bv = b[sortCol];
        const cmp = (x: ReportCell, y: ReportCell) => {
          if (typeof x === "number" && typeof y === "number") return x - y;
          const xs = String(x ?? "").toLowerCase();
          const ys = String(y ?? "").toLowerCase();
          return xs < ys ? -1 : xs > ys ? 1 : 0;
        };
        return sortDir === "asc" ? cmp(av, bv) : -cmp(av, bv);
      });
    }
    return { headers: prepared.headers, rows, total: rows.length };
  }, [prepared, sortCol, sortDir]);

  const pageRows = sorted.rows.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(sorted.rows.length / pageSize));

  const onSort = (i: number, sortable: boolean) => {
    if (!sortable) return;
    if (sortCol === i) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(i);
      setSortDir("asc");
    }
    setPage(1);
  };

  const filenameBase = `GPJ_RH_${type === "presences" ? "Presences" : type === "paie" ? "Paie" : type === "avances" ? "Avances" : "Personnel"}_${slugPeriode(from, to)}`;
  const meta = reportMeta(
    type === "personnel" ? "Liste du personnel" : type === "presences" ? "État des présences" : type === "paie" ? "État de paie" : "État des avances",
    from,
    to
  );

  const doExportCsv = () => {
    if (!prepared) return;
    exportCsv(`${filenameBase}.csv`, { headers: sorted.headers, rows: sorted.rows });
  };
  const doExportXlsx = async () => {
    if (!prepared) return;
    await exportXlsx(`${filenameBase}.xlsx`, { headers: sorted.headers, rows: sorted.rows });
  };
  const doExportPdf = async () => {
    if (!prepared) return;
    const withCount = { ...meta, periodLine: `${meta.periodLine} · ${sorted.rows.length} ligne(s)` };
    await exportPdf(`${filenameBase}.pdf`, withCount, { headers: sorted.headers, rows: sorted.rows });
  };

  const aggregatesBlocks = (() => {
    if (!planned || planned.kind === "personnel") return null;
    const a = planned.aggregates;
    return [
      { label: "Employés", value: a.employes },
      { label: "Jours théoriques", value: a.joursTheoriques },
      { label: "Jours présents", value: a.joursPresence },
      { label: "Jours absents", value: a.joursAbsence },
      { label: "Jours congé", value: a.joursConges },
      { label: "Heures travaillées", value: fmtHeures(Math.round(a.heuresTravaillees * 60)) },
      { label: "Retards cumulés", value: fmtHeures(a.retardTotalMinutes) },
      { label: "Masse acquise", value: a.masseAcquise === null ? "—" : fmtMontant(a.masseAcquise) },
      { label: "Avance période", value: a.avancePeriode === null ? "—" : fmtMontant(a.avancePeriode) },
      { label: "Récupéré période", value: a.recuperePeriode === null ? "—" : fmtMontant(a.recuperePeriode) },
      { label: "Solde fin période", value: a.soldeFinPeriode === null ? "—" : fmtMontant(a.soldeFinPeriode) },
    ];
  })();

  const periodStateBadge = (() => {
    if (!planned || planned.kind === "personnel") return null;
    const g = planned.periodState.global;
    const cls =
      g === "CLOTUREE"
        ? "bg-emerald-500/15 text-emerald-600"
        : g === "PARTIELLEMENT_CLOTUREE" || g === "MIXTE"
          ? "bg-sky-500/15 text-sky-600"
          : "bg-amber-500/15 text-amber-600";
    const labels: Record<string, string> = {
      CLOTUREE: "Période clôturée",
      EN_COURS: "Période en cours",
      PARTIELLEMENT_CLOTUREE: "Clôture partielle",
      MIXTE: "Période mixte",
    };
    return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{labels[g] ?? g}</span>;
  })();

  // Controls communs (hors personnel : masqués) — gestion des colonnes
  const moveCol = (i: number, dir: -1 | 1) => {
    setCols((prev) => {
      const next = prev.slice();
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  return (
    <div className="space-y-5" id="rapports-page">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; }
          #rapports-page { margin: 0 !important; padding: 0 !important; }
          #rapports-preview table thead { display: table-header-group; }
          #rapports-preview tr { break-inside: avoid; }
          #rapports-preview .no-print-table-pad { padding: 0 !important; }
        }
      `}</style>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Rapports RH</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          États exploitables : personnel, présences, paie, avances, historique — écran, impression, PDF, Excel.
        </p>
      </div>

      {/* Type de rapport */}
      <div className="flex flex-wrap gap-2">
        {RAPPORT_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setType(t.id);
              setPlanned(null);
              setError(null);
            }}
            className={`rounded-lg border px-3.5 py-2 text-sm font-bold transition-colors ${
              type === t.id
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {type === "historique" ? (
        <RapportHistorique />
      ) : (
        <>
          {/* Builder : période + filtres + sélection */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-4 print:hidden">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Période début</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Période fin</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
                <option value="">Tous les départements</option>
                {(departments.data ?? []).map((d) => (
                  <option key={d.id} value={d.id} className="bg-background">{d.name}</option>
                ))}
              </select>
              <select value={statut} onChange={(e) => setStatut(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
                <option value="">Tous les statuts</option>
                {["actif", "conge", "suspendu", "sorti"].map((s) => (
                  <option key={s} value={s} className="bg-background">{statutLabel(s)}</option>
                ))}
              </select>
              {type !== "personnel" && (
                <select value={modePaie} onChange={(e) => setModePaie(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
                  <option value="">Tous les modes de paie</option>
                  {["SALAIRE_MENSUEL", "FORFAIT_HEBDOMADAIRE", "SALAIRE_HORAIRE", "NON_REMUNERE"].map((m) => (
                    <option key={m} value={m} className="bg-background">{m}</option>
                  ))}
                </select>
              )}
              <button
                onClick={preview}
                disabled={loading || periodeInvalide}
                className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                {loading ? "Préparation…" : "Prévisualiser"}
              </button>
            </div>

            {periodeInvalide && (
              <p className="text-xs font-semibold text-destructive">Période inversée : la date de début est après la date de fin.</p>
            )}

            {/* Sélection employés (multi) */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  Employé(s) — <span className="text-foreground">{employeIds.length} sélectionné(s)</span>
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setEmployeIds((employees.data?.employees ?? []).map((e: { id: number }) => e.id)); }} className="text-xs font-semibold text-primary hover:underline">
                    Tout sélectionner
                  </button>
                  <button type="button" onClick={() => setEmployeIds([])} className="text-xs font-semibold text-muted-foreground hover:underline">
                    Tout désélectionner
                  </button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                <input
                  value={searchEmploye}
                  onChange={(e) => setSearchEmploye(e.target.value)}
                  placeholder="Filtrer la liste (nom, prénom, matricule)…"
                  className="h-9 w-full rounded-lg border border-border bg-accent/30 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
              <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-background p-2">
                {employeList.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Aucun employé.</p>}
                {employeList.map((e: { id: number; nom: string; prenom: string; matricule: string }) => {
                  const checked = employeIds.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggleEmploye(e.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        checked ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {e.matricule} · {e.prenom} {e.nom}
                    </button>
                  );
                })}
              </div>
              {selectedEmployees.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Sélection : {selectedEmployees.slice(0, 6).map((e) => `${e.prenom} ${e.nom}`).join(", ")}
                  {selectedEmployees.length > 6 && ` +${selectedEmployees.length - 6} autre(s)`}
                </p>
              )}
            </div>

            {/* Colonnes configurées (Personnel uniquement) */}
            {type === "personnel" && (
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Colonnes affichées — ordre = ordre de la liste. Cliquez sur une colonne du tableau pour trier.
                </p>
                <div className="flex flex-wrap gap-2">
                  {PERSONNEL_COLUMNS.map((c) => {
                    const checked = cols.includes(c.id);
                    const disabled = c.sensitive && !canSeeSalary;
                    return (
                      <label
                        key={c.id}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                          disabled ? "cursor-not-allowed border-border text-muted-foreground/50" : checked ? "border-primary/40 bg-primary/5 text-foreground" : "cursor-pointer border-border text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={checked}
                          disabled={disabled}
                          onChange={() =>
                            setCols((prev) => (checked ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                          }
                        />
                        {c.label}
                        {c.sensitive && <span className="text-[10px] font-bold text-amber-600">sensible</span>}
                      </label>
                    );
                  })}
                </div>
                {cols.length > 1 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground">Ordre :</span>
                    {cols.map((cid, i) => {
                      const def = PERSONNEL_COLUMNS.find((c) => c.id === cid);
                      return (
                        <span key={cid} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-foreground">
                          {def?.label}
                          <button type="button" onClick={() => moveCol(i, -1)} aria-label="Monter" className="text-muted-foreground hover:text-primary">
                            <ArrowUp size={12} />
                          </button>
                          <button type="button" onClick={() => moveCol(i, 1)} aria-label="Descendre" className="text-muted-foreground hover:text-primary">
                            <ArrowDown size={12} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {prepared && generatedAt && (
            <div id="rapports-preview" className="space-y-3">
              {/* En-tête du rapport (période + édition) */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div className="no-print-table-pad">
                  <h2 className="text-lg font-bold text-foreground">{meta.title}</h2>
                  <p className="text-xs text-muted-foreground">{meta.periodLine}</p>
                  <p className="text-xs text-muted-foreground">{meta.generatedLine}</p>
                  <p className="text-xs font-semibold text-muted-foreground">{sorted.total} ligne(s)</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  {periodStateBadge}
                  {!canSeeSalary && (
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-600">salaires masqués</span>
                  )}
                  <button onClick={() => window.print()} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-accent">
                    <Printer size={14} /> Imprimer
                  </button>
                  <button onClick={doExportPdf} disabled={loading} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-accent disabled:opacity-40">
                    <FileText size={14} /> PDF
                  </button>
                  <button onClick={doExportXlsx} disabled={loading} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-accent disabled:opacity-40">
                    <FileSpreadsheet size={14} /> Excel
                  </button>
                  <button onClick={doExportCsv} disabled={loading} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-accent disabled:opacity-40">
                    <Download size={14} /> CSV
                  </button>
                </div>
              </div>

              {/* Agrégats */}
              {aggregatesBlocks && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6">
                  {aggregatesBlocks.map((b) => (
                    <div key={b.label} className="rounded-lg border border-border bg-card px-3 py-2">
                      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{b.label}</p>
                      <p className="text-base font-bold text-foreground">{b.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {sorted.rows.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
                  <Users size={36} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Aucune donnée pour les critères sélectionnés.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full border-collapse bg-card text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          {sorted.headers.map((h, i) => (
                            <th key={h} className="whitespace-nowrap border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground">
                              <button
                                type="button"
                                onClick={() => onSort(i, prepared.sortable[i])}
                                className={`inline-flex items-center gap-1 ${prepared.sortable[i] ? "hover:text-primary" : "cursor-default"}`}
                                title={prepared.sortable[i] ? "Trier" : "Tri indisponible"}
                              >
                                {h}
                                {sortCol === i && (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((r, i) => (
                          <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                            {r.map((cell, j) => (
                              <td key={j} className={`whitespace-nowrap px-3 py-1.5 text-xs text-foreground ${typeof cell === "number" ? "text-right" : ""}`}>
                                {typeof cell === "number" ? <span className="tabular-nums">{cell}</span> : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="print:hidden">
                    <PaginationBar page={page} totalPages={totalPages} total={sorted.rows.length} onPage={setPage} label="ligne(s)" />
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}