"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { ArrowDown, ArrowUp, Calendar, Eye, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";
import { statutLabel } from "~/lib/rh-labels";
import {
  exportCsv,
  exportPdf,
  exportXlsx,
  fmtDateFR,
  fmtMontant,
  reportMeta,
  slugPeriode,
  type ReportCell,
} from "./report-exports";
import { PaginationBar } from "./ClientPagination";
import type {
  EmployeeReportRow,
  ReportEvent,
  MotifNonComptabilisation,
} from "~/server/lib/rh-centre-rapports";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Badge } from "~/components/ui/badge";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

type Onglet = "synthese" | "absences" | "sensibilisation";

const ONGLETS: ReadonlyArray<{ id: Onglet; label: string }> = [
  { id: "synthese", label: "SYNTHÈSE" },
  { id: "absences", label: "ABSENCES & RETARDS" },
  { id: "sensibilisation", label: "SENSIBILISATION" },
];

const TYPES_EVENEMENT_LIST = [
  { value: "ABSENCE", label: "Absence" },
  { value: "RETARD", label: "Retard" },
  { value: "CONGE", label: "Congé" },
  { value: "MALADIE", label: "Maladie" },
  { value: "ACCIDENT", label: "Accident" },
  { value: "SITUATION_RH", label: "Situation RH" },
  { value: "AUTRE", label: "Autre" },
] as const;

const CONTRATS = [
  { value: "CDD", label: "CDD" },
  { value: "permanent", label: "Permanent" },
] as const;

/**
 * Colonnes triables = intersection exacte avec `SORT_RAPPORT` (contrat serveur
 * RPT-05). Toute colonne absente de cette liste n'est PAS triable côté client :
 * on ne simule pas un tri global que le serveur ne piloterait pas.
 */
const SORT_RAPPORT_SET = new Set<string>([
  "nom",
  "matricule",
  "departement",
  "fonction",
  "statut",
  "joursTheoriques",
  "joursPresence",
  "joursAbsence",
  "heuresTheoriques",
  "heuresTravaillees",
  "heuresSupp",
  "retardTotalMinutes",
  "tauxPresence",
  "masseAcquise",
  "totalNet",
  "avancePeriode",
  "soldeActuel",
]);

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

function fmtMinHMin(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return "—";
  if (min === 0) return "0 min";
  const abs = Math.round(Math.abs(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m} min`;
}

function valOrDash(v: unknown): string | number {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && !Number.isFinite(v)) return "—";
  if (typeof v === "string" && v.trim() === "") return "—";
  return v as string | number;
}

function motifNonCompLabel(m: MotifNonComptabilisation | null | undefined): string {
  if (!m) return "—";
  const map: Record<MotifNonComptabilisation, string> = {
    DIMANCHE: "Dimanche",
    JOUR_FERIE: "Jour férié",
    NON_OUVRE_PLANNING: "Non ouvré (planning)",
    HORS_PERIODE_EMPLOI: "Hors période d'emploi",
    DECLARATION_SEULE: "Déclaration seule",
    CODE_CALCULE_DIFFERENT: "Code calculé différent",
  };
  return map[m];
}

function niveauBadgeVariant(
  n: string | null | undefined
): "default" | "secondary" | "destructive" | "outline" | "warning" | "success" {
  const up = (n ?? "").toUpperCase();
  if (up === "CRITIQUE" || up === "CRITICAL") return "destructive";
  if (up === "ÉLEVÉ" || up === "ELEVE" || up === "HIGH") return "warning";
  if (up === "MOYEN" || up === "MEDIUM") return "secondary";
  if (up === "FAIBLE" || up === "LOW" || up === "INFO") return "outline";
  return "outline";
}

interface FiltresForm {
  from: string;
  to: string;
  departementId: string;
  statut: string;
  fonction: string;
  contrat: string;
  search: string;
  typesEvenement: string[];
  employeIds: number[];
}

/**
 * `appliques` = SEULE source des paramètres de la query.
 * `form` ne la modifie jamais directement : un changement de filtre sans
 * [GÉNÉRER LE RAPPORT] ne déclenche donc aucune requête.
 * `sort`/`dir`/`page`/`eventPage` pilotent le tri et la pagination SERVEUR
 * (RPT-05) et ne sont modifiés que par une action explicite de l'utilisateur.
 */
interface FiltresAppliques extends FiltresForm {
  sort: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  eventPage: number;
  eventPageSize: number;
  generatedAt: string | null;
}

interface SynthColDef {
  id: string;
  label: string;
  sensitive?: boolean;
}

const SYNTH_COLS_BASE: SynthColDef[] = [
  { id: "employeeId", label: "ID" },
  { id: "matricule", label: "Matricule" },
  { id: "nom", label: "Nom complet" },
  { id: "prenom", label: "Prénom" },
  { id: "departement", label: "Département" },
  { id: "fonction", label: "Fonction" },
  { id: "statut", label: "Statut" },
  { id: "joursAbsence", label: "Jours absents" },
  { id: "heuresAttendues", label: "Heures attendues" },
  { id: "heuresTravaillees", label: "Heures réelles" },
  { id: "heuresNormales", label: "Heures normales" },
  { id: "heuresSupp", label: "Heures supplémentaires" },
  { id: "retardTotalMinutes", label: "Retard" },
  { id: "salaireBase", label: "Salaire de base", sensitive: true },
  { id: "tauxHoraire", label: "Taux horaire", sensitive: true },
  { id: "masseAcquise", label: "Salaire selon heures", sensitive: true },
  { id: "avancePeriode", label: "Avances", sensitive: true },
  { id: "totalNet", label: "Net", sensitive: true },
  { id: "anomalies", label: "Alertes" },
];

const DEFAULT_COLS = [
  "employeeId",
  "nom",
  "matricule",
  "joursAbsence",
  "heuresAttendues",
  "heuresTravaillees",
  "heuresNormales",
  "heuresSupp",
  "retardTotalMinutes",
  "anomalies",
];

const AUTORISABLES = new Set<string>([
  "from",
  "to",
  "departementId",
  "statut",
  "fonction",
  "contrat",
  "typesEvenement",
  "employeIds",
  "onglet",
]);

function lireUrl(sp: URLSearchParams): FiltresForm | null {
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to) return null;
  const types = (sp.get("typesEvenement") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => (TYPES_EVENEMENT_LIST as ReadonlyArray<{ value: string }>).some((t) => t.value === x));
  const ids = (sp.get("employeIds") ?? "")
    .split(",")
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  return {
    from,
    to,
    departementId: sp.get("departementId") ?? "",
    statut: sp.get("statut") ?? "",
    fonction: sp.get("fonction") ?? "",
    contrat: sp.get("contrat") ?? "",
    search: "",
    typesEvenement: types,
    employeIds: ids,
  };
}

function ecrireUrl(f: FiltresAppliques, onglet: Onglet): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("from", f.from);
  sp.set("to", f.to);
  if (f.departementId) sp.set("departementId", f.departementId);
  if (f.statut) sp.set("statut", f.statut);
  if (f.fonction) sp.set("fonction", f.fonction);
  if (f.contrat) sp.set("contrat", f.contrat);
  if (f.typesEvenement.length) sp.set("typesEvenement", f.typesEvenement.join(","));
  if (f.employeIds.length) sp.set("employeIds", f.employeIds.join(","));
  if (onglet !== "synthese") sp.set("onglet", onglet);
  return sp;
}

function infosSensiblesPresentes(sp: URLSearchParams): string[] {
  const interdits = [
    "salaire",
    "salaireBase",
    "taux",
    "tauxHoraire",
    "net",
    "totalNet",
    "avance",
    "avances",
    "impact",
    "montant",
    "masseAcquise",
    "gains",
    "retenues",
  ];
  const trouves: string[] = [];
  sp.forEach((_, k) => {
    const bas = k.toLowerCase();
    if (interdits.some((x) => bas === x || bas.includes(x))) trouves.push(k);
  });
  return trouves;
}

export default function RapportsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission, isLoading: permsLoading } = usePermissions();
  const canSeeSalary = hasPermission("rh.salaire.consulter");

  const [onglet, setOnglet] = useState<Onglet>("synthese");

  const [form, setForm] = useState<FiltresForm>({
    from: premierMois(),
    to: dernierMois(),
    departementId: "",
    statut: "",
    fonction: "",
    contrat: "",
    search: "",
    typesEvenement: [],
    employeIds: [],
  });

  const [appliques, setAppliques] = useState<FiltresAppliques>({
    from: premierMois(),
    to: dernierMois(),
    departementId: "",
    statut: "",
    fonction: "",
    contrat: "",
    search: "",
    typesEvenement: [],
    employeIds: [],
    sort: "nom",
    dir: "asc",
    page: 1,
    pageSize: 50,
    eventPage: 1,
    eventPageSize: 200,
    generatedAt: null,
  });

  const [colsSynth, setColsSynth] = useState<string[]>(
    canSeeSalary ? [...DEFAULT_COLS, "totalNet"] : DEFAULT_COLS
  );
  const [empDrawerId, setEmpDrawerId] = useState<number | null>(null);
  const [evtDrawerId, setEvtDrawerId] = useState<string | null>(null);

  const hydrateRef = useRef(false);

  useEffect(() => {
    if (hydrateRef.current) return;
    hydrateRef.current = true;
    const sp = new URLSearchParams(searchParams.toString());
    const restaure = lireUrl(sp);
    if (restaure) {
      setForm(restaure);
      setAppliques((prev) => ({
        ...prev,
        ...restaure,
        sort: "nom",
        dir: "asc",
        page: 1,
        eventPage: 1,
        generatedAt: new Date().toISOString(),
      }));
      const ongletUrl = sp.get("onglet");
      if (ongletUrl && (ONGLETS as ReadonlyArray<{ id: Onglet }>).some((o) => o.id === ongletUrl)) {
        setOnglet(ongletUrl as Onglet);
      }
    }
    const invalides = infosSensiblesPresentes(sp);
    if (invalides.length) {
      console.warn("Paramètres refusés dans l'URL (données sensibles) :", invalides.join(", "));
    }
    for (const k of invalides) sp.delete(k);
    for (const k of [...sp.keys()]) if (!AUTORISABLES.has(k)) sp.delete(k);
  }, [searchParams]);

  useEffect(() => {
    if (!hydrateRef.current || appliques.generatedAt === null) return;
    const sp = ecrireUrl(appliques, onglet);
    router.replace(`/dashboard/rh/rapports?${sp.toString()}`, { scroll: false });
  }, [appliques, onglet, router]);

  const periodeInvalide = form.from > form.to;

  const employees = api.rh.list.useQuery({ limit: 500 });
  const departments = api.rh.listDepartments.useQuery();

  const employeList = useMemo(() => {
    const list = (employees.data?.employees ?? []) as Array<{
      id: number;
      nom: string;
      prenom: string;
      matricule: string;
    }>;
    const q = form.search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => `${e.nom} ${e.prenom} ${e.matricule}`.toLowerCase().includes(q));
  }, [employees.data, form.search]);

  /**
   * UNE SEULE requête de rapport. Ses dépendances ne contiennent que
   * `appliques` (jamais `onglet`, `empDrawerId`, `evtDrawerId`, `colsSynth`)
   * : changer d'onglet ou ouvrir un drawer ne peut donc pas la réexécuter.
   * `enabled` n'est levé qu'après [GÉNÉRER LE RAPPORT] (ou restauration URL).
   */
  const rapportQuery = api.rhCentreRapports.rapport.useQuery(
    {
      from: appliques.from,
      to: appliques.to,
      employeIds: appliques.employeIds.length > 0 ? appliques.employeIds : undefined,
      departementId: appliques.departementId ? Number(appliques.departementId) : undefined,
      statut: appliques.statut || undefined,
      fonction: appliques.fonction || undefined,
      contrat: (appliques.contrat as "CDD" | "permanent" | undefined) || undefined,
      search: appliques.search || undefined,
      typesEvenement:
        appliques.typesEvenement.length > 0
          ? (appliques.typesEvenement as (typeof TYPES_EVENEMENT_LIST)[number]["value"][])
          : undefined,
      sort: appliques.sort as never,
      dir: appliques.dir,
      page: appliques.page,
      pageSize: appliques.pageSize,
      eventPage: appliques.eventPage,
      eventPageSize: appliques.eventPageSize,
      includeSensibilisation: true,
    },
    {
      enabled: appliques.generatedAt !== null,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 0,
      gcTime: 5 * 60 * 1000,
    }
  );

  const dataRapport = rapportQuery.data;
  const isLoadingRapport = rapportQuery.isLoading;
  const isFetchingRapport = rapportQuery.isFetching;
  const erreurTrpc = rapportQuery.error;
  const estInterdit =
    erreurTrpc?.data?.code === "FORBIDDEN" ||
    /FORBIDDEN|droit|permission|refus/i.test(erreurTrpc?.message ?? "");
  const errorRapport = erreurTrpc ? erreurTrpc.message : null;

  const generer = () => {
    if (!form.from || !form.to) {
      toast.error("Période requise.");
      return;
    }
    if (form.from > form.to) {
      toast.error("Période inversée.");
      return;
    }
    setAppliques((prev) => ({
      ...prev,
      ...form,
      sort: prev.sort,
      dir: prev.dir,
      page: 1,
      eventPage: 1,
      generatedAt: new Date().toISOString(),
    }));
    setEmpDrawerId(null);
    setEvtDrawerId(null);
  };

  const toggleEmploye = (id: number) => {
    setForm((prev) => ({
      ...prev,
      employeIds: prev.employeIds.includes(id)
        ? prev.employeIds.filter((x) => x !== id)
        : [...prev.employeIds, id],
    }));
  };

  const toggleTypeEvt = (v: string) => {
    setForm((prev) => ({
      ...prev,
      typesEvenement: prev.typesEvenement.includes(v)
        ? prev.typesEvenement.filter((x) => x !== v)
        : [...prev.typesEvenement, v],
    }));
  };

  const selectedEmployees = useMemo(() => {
    const list = (employees.data?.employees ?? []) as Array<{
      id: number;
      nom: string;
      prenom: string;
      matricule: string;
    }>;
    return list.filter((e) => form.employeIds.includes(e.id));
  }, [employees.data, form.employeIds]);

  const colsSynthDefs = useMemo(
    () =>
      colsSynth
        .map((cid) => SYNTH_COLS_BASE.find((c) => c.id === cid))
        .filter((c): c is SynthColDef => Boolean(c))
        .filter((c) => !(c.sensitive && !canSeeSalary)),
    [colsSynth, canSeeSalary]
  );

  /** Lignes déjà paginées ET triées par le serveur : aucune re-triée ici. */
  const rowsSynth = useMemo(() => (dataRapport?.rows ?? []) as EmployeeReportRow[], [dataRapport?.rows]);
  const rowPag = dataRapport?.rowPagination;
  const eventPag = dataRapport?.eventPagination;
  const eventsPage = useMemo(
    () => (dataRapport?.events ?? []) as ReportEvent[],
    [dataRapport?.events]
  );

  const empDrawerRow = useMemo(
    () => (dataRapport?.rows ?? []).find((r) => r.employeeId === empDrawerId) ?? null,
    [dataRapport?.rows, empDrawerId]
  );
  const evtDrawer = useMemo(
    () => (dataRapport?.events ?? []).find((e) => e.id === evtDrawerId) ?? null,
    [dataRapport?.events, evtDrawerId]
  );

  const triable = (id: string) => SORT_RAPPORT_SET.has(id);
  const estSensible = (id: string) => SYNTH_COLS_BASE.find((c) => c.id === id)?.sensitive === true;

  /** Tri serveur : change les paramètres de la query (1 requête explicite). */
  const onSortSynth = (id: string) => {
    if (!triable(id)) return;
    if (estSensible(id) && !canSeeSalary) return;
    const memeColonne = appliques.sort === id;
    const dir: "asc" | "desc" = memeColonne && appliques.dir === "asc" ? "desc" : "asc";
    setAppliques((prev) => ({ ...prev, sort: id, dir, page: 1 }));
  };

  const gotoRowPage = (p: number) => setAppliques((prev) => ({ ...prev, page: p }));
  const gotoEventPage = (p: number) => setAppliques((prev) => ({ ...prev, eventPage: p }));

  const moveCol = (i: number, dir: -1 | 1) => {
    setColsSynth((prev) => {
      const next = prev.slice();
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const celluleSynth = (id: string, r: EmployeeReportRow): string | number => {
    const v = (r as unknown as Record<string, unknown>)[id];
    if (id === "anomalies") {
      const an = v as Array<{ titre: string | null }> | null | undefined;
      return an && an.length ? an.length : 0;
    }
    if (id === "retardTotalMinutes") return fmtMinHMin(v as number);
    if (id === "statut") return statutLabel(v as string);
    if (id === "salaireBase") {
      // Le row serveur expose la base contractuelle, jamais `salaireBase`.
      const b = r.baseContractuelle;
      if (!canSeeSalary) return "—";
      return b === null || b === undefined ? "—" : fmtMontant(b);
    }
    if (
      id === "tauxHoraire" ||
      id === "masseAcquise" ||
      id === "avancePeriode" ||
      id === "totalNet"
    ) {
      if (!canSeeSalary) return "—";
      return v === null || v === undefined ? "—" : fmtMontant(v as number);
    }
    if (id === "heuresAttendues" || id === "heuresTravaillees" || id === "heuresNormales" || id === "heuresSupp" || id === "joursAbsence") {
      return valOrDash(v);
    }
    return valOrDash(v);
  };

  const filenameBase = `GPJ_RH_Centre_${slugPeriode(appliques.from, appliques.to)}`;
  const meta = reportMeta("Centre de Rapports RH & Paie", appliques.from, appliques.to);

  const buildTable = (): { headers: string[]; rows: ReportCell[][] } => {
    const headers = colsSynthDefs.map((c) => c.label);
    const rows: ReportCell[][] = rowsSynth.map((r) => colsSynthDefs.map((c) => celluleSynth(c.id, r)));
    return { headers, rows };
  };

  const doExportCsv = () => {
    if (!dataRapport) return;
    const t = buildTable();
    exportCsv(`${filenameBase}.csv`, t);
  };
  const doExportXlsx = async () => {
    if (!dataRapport) return;
    await exportXlsx(`${filenameBase}.xlsx`, buildTable());
  };
  const doExportPdf = async () => {
    if (!dataRapport) return;
    const m = { ...meta, periodLine: `${meta.periodLine} · ${rowPag?.total ?? rowsSynth.length} ligne(s)` };
    await exportPdf(`${filenameBase}.pdf`, m, buildTable());
  };

  const estChargement = isLoadingRapport || (isFetchingRapport && !dataRapport);
  const aucuneDonnee = Boolean(appliques.generatedAt) && !estChargement && !errorRapport && rowsSynth.length === 0;

  return (
    <div className="space-y-5" id="rapports-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Centre de Rapports RH &amp; Paie
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Une seule réponse — 3 vues (SYNTHÈSE / ABSENCES &amp; RETARDS / SENSIBILISATION)
        </p>
      </div>

      {/* Barre de contexte : formulaire SEPARÉ des paramètres appliqués. */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Période début
            </Label>
            <Input
              type="date"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
              className="h-10"
              aria-label="Période début"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Période fin
            </Label>
            <Input
              type="date"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              className="h-10"
              aria-label="Période fin"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Département
            </Label>
            <select
              value={form.departementId}
              onChange={(e) => setForm({ ...form, departementId: e.target.value })}
              className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none"
              aria-label="Département"
            >
              <option value="">Tous</option>
              {(departments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs font-semibold text-muted-foreground">Statut</Label>
            <select
              value={form.statut}
              onChange={(e) => setForm({ ...form, statut: e.target.value })}
              className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none"
              aria-label="Statut"
            >
              <option value="">Tous</option>
              {["actif", "conge", "suspendu", "sorti"].map((s) => (
                <option key={s} value={s}>
                  {statutLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs font-semibold text-muted-foreground">Fonction</Label>
            <Input
              value={form.fonction}
              onChange={(e) => setForm({ ...form, fonction: e.target.value })}
              placeholder="ex. Mécanicien"
              className="h-10"
              aria-label="Fonction"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs font-semibold text-muted-foreground">Contrat</Label>
            <select
              value={form.contrat}
              onChange={(e) => setForm({ ...form, contrat: e.target.value })}
              className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none"
              aria-label="Contrat"
            >
              <option value="">Tous</option>
              {CONTRATS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={generer}
            disabled={periodeInvalide || isFetchingRapport || permsLoading}
            aria-label="Générer le rapport"
          >
            {isFetchingRapport ? "Génération…" : "GÉNÉRER LE RAPPORT"}
          </Button>
        </div>

        {periodeInvalide && (
          <p className="text-xs font-semibold text-destructive">
            Période inversée : la date de début est après la date de fin.
          </p>
        )}

        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Types d&apos;événement</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TYPES_EVENEMENT_LIST.map((t) => {
              const checked = form.typesEvenement.includes(t.value);
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggleTypeEvt(t.value)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    checked
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label className="text-xs font-semibold text-muted-foreground">
              Employé(s) — {form.employeIds.length} sélectionné(s)
            </Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    employeIds: (employees.data?.employees ?? []).map((e: { id: number }) => e.id),
                  })
                }
                className="text-xs font-semibold text-primary hover:underline"
              >
                Tout sélectionner
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, employeIds: [] })}
                className="text-xs font-semibold text-muted-foreground hover:underline"
              >
                Tout désélectionner
              </button>
            </div>
          </div>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={14}
            />
            <Input
              value={form.search}
              onChange={(e) => setForm({ ...form, search: e.target.value })}
              placeholder="Filtrer la liste (nom, prénom, matricule)…"
              className="pl-9"
              aria-label="Recherche employé"
            />
          </div>
          <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-background p-2">
            {employeList.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">Aucun employé.</p>
            )}
            {employeList.map((e: { id: number; nom: string; prenom: string; matricule: string }) => {
              const checked = form.employeIds.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggleEmploye(e.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    checked
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {e.matricule} · {e.prenom} {e.nom}
                </button>
              );
            })}
          </div>
          {selectedEmployees.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Sélection :{" "}
              {selectedEmployees
                .slice(0, 6)
                .map((e) => `${e.prenom} ${e.nom}`)
                .join(", ")}
              {selectedEmployees.length > 6 && ` +${selectedEmployees.length - 6} autre(s)`}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Colonnes SYNTHÈSE — ordre = ordre affiché. Un clic sur un en-tête applique le tri
            serveur (RPT-05).
          </p>
          <div className="flex flex-wrap gap-2">
            {SYNTH_COLS_BASE.map((c) => {
              const checked = colsSynth.includes(c.id);
              const disabled = Boolean(c.sensitive) && !canSeeSalary;
              return (
                <label
                  key={c.id}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                    disabled
                      ? "cursor-not-allowed border-border text-muted-foreground/50"
                      : checked
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : "cursor-pointer border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={checked}
                    disabled={disabled}
                    aria-label={`Colonne ${c.label}`}
                    onChange={() =>
                      setColsSynth((prev) =>
                        checked ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                      )
                    }
                  />
                  {c.label}
                  {c.sensitive && <span className="text-[10px] font-bold text-amber-600">sensible</span>}
                </label>
              );
            })}
          </div>
          {colsSynth.length > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Ordre :</span>
              {colsSynth.map((cid, i) => {
                const def = SYNTH_COLS_BASE.find((c) => c.id === cid);
                return (
                  <span
                    key={cid}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-foreground"
                  >
                    {def?.label}
                    <button
                      type="button"
                      onClick={() => moveCol(i, -1)}
                      aria-label={`Monter ${def?.label ?? cid}`}
                      className="text-muted-foreground hover:text-primary"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCol(i, 1)}
                      aria-label={`Descendre ${def?.label ?? cid}`}
                      className="text-muted-foreground hover:text-primary"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {appliques.generatedAt && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Rapport — {fmtDateFR(appliques.from)} → {fmtDateFR(appliques.to)}
              </h2>
              <p className="text-xs text-muted-foreground">
                Généré le : {new Date(appliques.generatedAt).toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-muted-foreground">
                {appliques.departementId ? "Département filtré" : "Tous départements"} ·{" "}
                {appliques.statut ? `statut ${statutLabel(appliques.statut)}` : "tous statuts"} ·{" "}
                {appliques.fonction ? `fonction ${appliques.fonction}` : "toutes fonctions"} ·{" "}
                {appliques.contrat ? `contrat ${appliques.contrat}` : "tous contrats"} ·{" "}
                {appliques.typesEvenement.length
                  ? `${appliques.typesEvenement.length} type(s) d'événement`
                  : "tous types d'événement"}{" "}
                ·{" "}
                {appliques.employeIds.length
                  ? `${appliques.employeIds.length} employé(s)`
                  : "toute l'effectivité"}
              </p>
              {rowPag && <p className="text-xs text-muted-foreground">{rowPag.total} employé(s)</p>}
              {eventPag && (
                <p className="text-xs text-muted-foreground">{eventPag.total} événement(s)</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {!canSeeSalary && <Badge variant="warning">salaires masqués</Badge>}
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                Imprimer
              </Button>
              <Button variant="outline" size="sm" onClick={doExportPdf} disabled={!dataRapport}>
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={doExportXlsx} disabled={!dataRapport}>
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={doExportCsv} disabled={!dataRapport}>
                CSV
              </Button>
            </div>
          </div>

          {dataRapport?.summary && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Employés" value={valOrDash(dataRapport.summary.employes)} />
              <KpiCard label="Jours théoriques" value={valOrDash(dataRapport.summary.joursTheoriques)} />
              <KpiCard label="Jours présents" value={valOrDash(dataRapport.summary.joursPresence)} />
              <KpiCard label="Jours absents" value={valOrDash(dataRapport.summary.joursAbsence)} />
              <KpiCard
                label="Heures travaillées"
                value={valOrDash(dataRapport.summary.heuresTravaillees)}
              />
              <KpiCard
                label="Retards cumulés"
                value={fmtMinHMin(dataRapport.summary.retardTotalMinutes)}
              />
            </div>
          )}

          <Tabs value={onglet} onValueChange={(v) => setOnglet(v as Onglet)}>
            <TabsList className="grid w-full grid-cols-3">
              {ONGLETS.map((o) => (
                <TabsTrigger key={o.id} value={o.id}>
                  {o.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="synthese" className="mt-3 space-y-3">
              {estChargement ? (
                <Skeleton className="h-40 w-full" />
              ) : errorRapport ? (
                estInterdit ? (
                  <ErrorState errorCode="FORBIDDEN" message={errorRapport} />
                ) : (
                  <ErrorState
                    message={errorRapport}
                    retryAction={() => void rapportQuery.refetch()}
                  />
                )
              ) : aucuneDonnee ? (
                <EmptyState
                  icon={<Users className="h-10 w-10" />}
                  title="Aucune donnée"
                  description="Aucun employé pour les critères sélectionnés."
                />
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full border-collapse bg-card text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          {colsSynthDefs.map((c) => {
                            const actif = appliques.sort === c.id;
                            const permis = triable(c.id) && (!estSensible(c.id) || canSeeSalary);
                            return (
                              <th
                                key={c.id}
                                scope="col"
                                aria-sort={
                                  actif ? (appliques.dir === "asc" ? "ascending" : "descending") : "none"
                                }
                                className="whitespace-nowrap border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground"
                              >
                                <button
                                  type="button"
                                  disabled={!permis}
                                  onClick={() => onSortSynth(c.id)}
                                  title={
                                    permis
                                      ? actif
                                        ? `Tri ${appliques.dir === "asc" ? "croissant" : "décroissant"} (serveur)`
                                        : "Trier (serveur)"
                                      : "Tri non disponible pour cette colonne"
                                  }
                                  className={`inline-flex items-center gap-1 ${
                                    permis ? "hover:text-primary" : "cursor-default opacity-70"
                                  }`}
                                >
                                  {c.label}
                                  {actif &&
                                    (appliques.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                                </button>
                              </th>
                            );
                          })}
                          <th
                            scope="col"
                            className="whitespace-nowrap border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground"
                          >
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowsSynth.map((r) => (
                          <tr
                            key={r.employeeId}
                            className="border-b border-border/50 last:border-0 hover:bg-accent/40"
                          >
                            {colsSynthDefs.map((c) => (
                              <td
                                key={c.id}
                                className={`whitespace-nowrap px-3 py-1.5 text-xs text-foreground ${
                                  typeof (r as unknown as Record<string, unknown>)[c.id] === "number" &&
                                  c.id !== "retardTotalMinutes"
                                    ? "text-right"
                                    : ""
                                }`}
                              >
                                {celluleSynth(c.id, r)}
                              </td>
                            ))}
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs">
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Détail employé ${r.matricule}`}
                                onClick={() => setEmpDrawerId(r.employeeId)}
                              >
                                <Eye className="mr-1 h-3 w-3" />
                                Détail
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    page={rowPag?.page ?? appliques.page}
                    totalPages={rowPag?.totalPages ?? 1}
                    total={rowPag?.total ?? rowsSynth.length}
                    onPage={gotoRowPage}
                    label="employé(s)"
                    empty={rowsSynth.length === 0}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="absences" className="mt-3 space-y-3">
              {estChargement ? (
                <Skeleton className="h-40 w-full" />
              ) : errorRapport ? (
                estInterdit ? (
                  <ErrorState errorCode="FORBIDDEN" message={errorRapport} />
                ) : (
                  <ErrorState message={errorRapport} retryAction={() => void rapportQuery.refetch()} />
                )
              ) : eventsPage.length === 0 ? (
                <EmptyState
                  icon={<Calendar className="h-10 w-10" />}
                  title="Aucun événement"
                  description="Aucun événement pour les critères sélectionnés."
                />
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full border-collapse bg-card text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          {[
                            "ID",
                            "Matricule",
                            "Date",
                            "Type",
                            "Retard min",
                            "Motif",
                            "Justificatif",
                            "Validation",
                            "Source",
                            "Auteur",
                            "Validateur",
                            "Comptabilisé",
                          ].map((h) => (
                            <th
                              key={h}
                              scope="col"
                              className="whitespace-nowrap border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground"
                            >
                              {h}
                            </th>
                          ))}
                          <th
                            scope="col"
                            className="whitespace-nowrap border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground"
                          >
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventsPage.map((e) => (
                          <tr
                            key={e.id}
                            className="border-b border-border/50 last:border-0 hover:bg-accent/40"
                          >
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">{e.id}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {e.matricule}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {fmtDateFR(e.date)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              <Badge variant="outline">{e.type}</Badge>
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {e.lateMinutes === null ? "—" : e.lateMinutes}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {valOrDash(e.motif)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {e.justificatif ? "Fourni" : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {e.presenceValidee === true
                                ? "Validé"
                                : e.presenceValidee === false
                                  ? "Refusé"
                                  : "Non validé"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {e.source}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {valOrDash(e.auteur)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {valOrDash(e.validePar)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {e.comptabilise === null
                                ? "—"
                                : e.comptabilise
                                  ? "Oui"
                                  : `Non (${motifNonCompLabel(e.motifNonComptabilisation)})`}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs">
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Détail événement ${e.id}`}
                                onClick={() => setEvtDrawerId(e.id)}
                              >
                                <Eye className="mr-1 h-3 w-3" />
                                Détail
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    page={eventPag?.page ?? appliques.eventPage}
                    totalPages={eventPag?.totalPages ?? 1}
                    total={eventPag?.total ?? eventsPage.length}
                    onPage={gotoEventPage}
                    label="événement(s)"
                    empty={eventsPage.length === 0}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="sensibilisation" className="mt-3 space-y-3">
              {!dataRapport?.sensibilisation ? (
                estChargement ? (
                  <Skeleton className="h-40 w-full" />
                ) : errorRapport ? (
                  <ErrorState message={errorRapport} retryAction={() => void rapportQuery.refetch()} />
                ) : (
                  <EmptyState
                    icon={<Users className="h-10 w-10" />}
                    title="Sensibilisation non chargée"
                    description="Générez le rapport pour afficher les indicateurs RPT-03."
                  />
                )
              ) : (
                <>
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs font-semibold text-amber-700">
                    Estimation indicative — ne constitue pas une retenue automatique.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    <KpiCard label="Effectif" value={valOrDash(dataRapport.sensibilisation.equipe.effectif)} />
                    <KpiCard
                      label="Heures théoriques"
                      value={valOrDash(dataRapport.sensibilisation.equipe.heuresTheoriques)}
                    />
                    <KpiCard
                      label="Heures travaillées"
                      value={valOrDash(dataRapport.sensibilisation.equipe.heuresTravaillees)}
                    />
                    <KpiCard label="Absence (h)" value={valOrDash(dataRapport.sensibilisation.equipe.absenceHours)} />
                    <KpiCard
                      label="Retard (min)"
                      value={valOrDash(dataRapport.sensibilisation.equipe.retardMinutes)}
                    />
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full border-collapse bg-card text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                            Matricule
                          </th>
                          <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                            Nom
                          </th>
                          <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                            Jours absence
                          </th>
                          <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                            Heures absence
                          </th>
                          <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                            Retards (min)
                          </th>
                          <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                            Heures retard
                          </th>
                          <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                            Heures non faites
                          </th>
                          <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                            Taux présence
                          </th>
                          {canSeeSalary && (
                            <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                              Impact absence
                            </th>
                          )}
                          {canSeeSalary && (
                            <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                              Impact retard
                            </th>
                          )}
                          {canSeeSalary && (
                            <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                              Impact total
                            </th>
                          )}
                          {canSeeSalary && (
                            <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                              % salaire
                            </th>
                          )}
                          <th scope="col" className="border-b border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide">
                            Messages
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dataRapport.sensibilisation.rows ?? []).map((r) => (
                          <tr
                            key={r.employeeId}
                            className="border-b border-border/50 last:border-0 hover:bg-accent/40"
                          >
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">{r.matricule}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {r.prenom ? `${r.prenom} ${r.nom}` : r.nom}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">{valOrDash(r.joursAbsence)}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">{valOrDash(r.absenceHours)}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">{valOrDash(r.retardMinutes)}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">{valOrDash(r.retardHours)}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">{valOrDash(r.totalNotWorkedHours)}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {r.tauxPresenceHeures === null ? "—" : `${Math.round(r.tauxPresenceHeures)}%`}
                            </td>
                            {canSeeSalary && (
                              <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                                {r.estimatedImpactAbsence === null ? "—" : fmtMontant(r.estimatedImpactAbsence)}
                              </td>
                            )}
                            {canSeeSalary && (
                              <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                                {r.estimatedImpactRetard === null ? "—" : fmtMontant(r.estimatedImpactRetard)}
                              </td>
                            )}
                            {canSeeSalary && (
                              <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                                {r.estimatedImpact === null ? "—" : fmtMontant(r.estimatedImpact)}
                              </td>
                            )}
                            {canSeeSalary && (
                              <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                                {r.impactPercent === null ? "—" : `${Math.round(r.impactPercent)}%`}
                              </td>
                            )}
                            <td className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                              {r.messages && r.messages.length > 0 ? r.messages.map((m) => m.titre).join(" · ") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(dataRapport.sensibilisation.reglesManquantes?.length ?? 0) > 0 && (
                    <p className="rounded-lg border border-border bg-card p-2 text-xs text-muted-foreground">
                      Règles non chargées :{" "}
                      {(dataRapport.sensibilisation.reglesManquantes ?? []).join(", ")}
                    </p>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      <Sheet open={empDrawerId !== null} onOpenChange={(o) => !o && setEmpDrawerId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Détail employé</SheetTitle>
            <SheetDescription>
              Données issues de la réponse principale — aucune requête supplémentaire.
            </SheetDescription>
          </SheetHeader>
          {empDrawerRow && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Info label="Matricule" value={valOrDash(empDrawerRow.matricule)} />
                <Info
                  label="Nom complet"
                  value={`${empDrawerRow.prenom ?? ""} ${empDrawerRow.nom}`.trim()}
                />
                <Info label="Département" value={valOrDash(empDrawerRow.departement)} />
                <Info label="Fonction" value={valOrDash(empDrawerRow.fonction)} />
                <Info label="Statut" value={valOrDash(empDrawerRow.statut)} />
                <Info label="Type de contrat" value={valOrDash(empDrawerRow.mode)} />
                <Info label="Heures attendues" value={valOrDash(empDrawerRow.heuresAttendues)} />
                <Info label="Heures travaillées" value={valOrDash(empDrawerRow.heuresTravaillees)} />
                <Info label="Heures normales" value={valOrDash(empDrawerRow.heuresNormales)} />
                <Info label="Heures supplémentaires" value={valOrDash(empDrawerRow.heuresSupp)} />
                <Info label="Jours absents" value={valOrDash(empDrawerRow.joursAbsence)} />
                <Info label="Retard total" value={fmtMinHMin(empDrawerRow.retardTotalMinutes)} />
                <Info label="Départs anticipés" value={fmtMinHMin(empDrawerRow.departAnticipeTotalMinutes)} />
                <Info
                  label="Taux présence"
                  value={empDrawerRow.tauxPresence === null ? "—" : `${Math.round(empDrawerRow.tauxPresence)}%`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Info
                  label="Salaire de base"
                  value={
                    !canSeeSalary
                      ? "—"
                      : empDrawerRow.baseContractuelle === null || empDrawerRow.baseContractuelle === undefined
                        ? "—"
                        : fmtMontant(empDrawerRow.baseContractuelle)
                  }
                />
                <Info
                  label="Taux horaire"
                  value={!canSeeSalary ? "—" : empDrawerRow.tauxHoraire === null ? "—" : empDrawerRow.tauxHoraire}
                />
                <Info
                  label="Salaire selon heures"
                  value={!canSeeSalary ? "—" : empDrawerRow.masseAcquise === null ? "—" : fmtMontant(empDrawerRow.masseAcquise)}
                />
                <Info label="Gains" value={!canSeeSalary ? "—" : empDrawerRow.gains === null ? "—" : fmtMontant(empDrawerRow.gains)} />
                <Info label="Retenues" value={!canSeeSalary ? "—" : empDrawerRow.retenues === null ? "—" : fmtMontant(empDrawerRow.retenues)} />
                <Info label="Net" value={!canSeeSalary ? "—" : empDrawerRow.totalNet === null ? "—" : fmtMontant(empDrawerRow.totalNet)} />
                <Info
                  label="Avance période"
                  value={!canSeeSalary ? "—" : empDrawerRow.avancePeriode === null ? "—" : fmtMontant(empDrawerRow.avancePeriode)}
                />
                <Info
                  label="Récupéré période"
                  value={!canSeeSalary ? "—" : empDrawerRow.recuperePeriode === null ? "—" : fmtMontant(empDrawerRow.recuperePeriode)}
                />
                <Info
                  label="Solde fin période"
                  value={!canSeeSalary ? "—" : empDrawerRow.soldeFinPeriode === null ? "—" : fmtMontant(empDrawerRow.soldeFinPeriode)}
                />
                <Info
                  label="Solde actuel"
                  value={!canSeeSalary ? "—" : empDrawerRow.soldeActuel === null ? "—" : fmtMontant(empDrawerRow.soldeActuel)}
                />
              </div>
              {(empDrawerRow.anomalies?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-border bg-card p-2">
                  <p className="mb-1 text-xs font-semibold">Alertes</p>
                  <div className="space-y-1">
                    {(empDrawerRow.anomalies ?? []).map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <Badge variant={niveauBadgeVariant(a.gravite)}>{a.gravite}</Badge>
                        <div>
                          <p className="font-semibold">{a.titre}</p>
                          {a.description && <p className="text-muted-foreground">{a.description}</p>}
                          <p className="text-muted-foreground">Raison : {valOrDash(a.source)}</p>
                          {(a.actionsDisponibles ?? []).map((act, k) => (
                            <span key={k} className="mr-2 inline-block text-[11px] font-semibold text-primary">
                              {act.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={evtDrawerId !== null} onOpenChange={(o) => !o && setEvtDrawerId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Détail événement</SheetTitle>
            <SheetDescription>
              Données issues de la réponse principale — aucune requête supplémentaire.
            </SheetDescription>
          </SheetHeader>
          {evtDrawer && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <Info label="ID" value={evtDrawer.id} />
              <Info label="Matricule" value={evtDrawer.matricule} />
              <Info label="Date" value={fmtDateFR(evtDrawer.date)} />
              <Info label="Type" value={evtDrawer.type} />
              <Info label="Libellé" value={valOrDash(evtDrawer.libelle)} />
              <Info label="Code présence" value={valOrDash(evtDrawer.presenceCode)} />
              <Info label="Retard (min)" value={evtDrawer.lateMinutes === null ? "—" : evtDrawer.lateMinutes} />
              <Info
                label="Départ anticipé (min)"
                value={evtDrawer.earlyDepartureMinutes === null ? "—" : evtDrawer.earlyDepartureMinutes}
              />
              <Info label="Motif" value={valOrDash(evtDrawer.motif)} />
              <Info label="Justificatif" value={evtDrawer.justificatif ? evtDrawer.justificatif : "—"} />
              <Info
                label="Validation"
                value={
                  evtDrawer.presenceValidee === true
                    ? "Validé"
                    : evtDrawer.presenceValidee === false
                      ? "Refusé"
                      : "Non validé"
                }
              />
              <Info label="Validé par" value={valOrDash(evtDrawer.validePar)} />
              <Info label="Auteur" value={valOrDash(evtDrawer.auteur)} />
              <Info label="Source" value={evtDrawer.source} />
              <Info
                label="Comptabilisé"
                value={
                  evtDrawer.comptabilise === null ? "—" : evtDrawer.comptabilise ? "Oui" : "Non"
                }
              />
              <Info
                label="Motif non comptabilisation"
                value={motifNonCompLabel(evtDrawer.motifNonComptabilisation)}
              />
              <Info
                label="Impact paie"
                value={
                  !canSeeSalary
                    ? "—"
                    : evtDrawer.payrollImpact === null || evtDrawer.payrollImpact === undefined
                      ? "—"
                      : fmtMontant(evtDrawer.payrollImpact)
                }
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-base font-bold text-foreground">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
