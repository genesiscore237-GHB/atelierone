"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { useEmployeFromUrl } from "~/hooks/useEmployeFromUrl";
import { usePermissions } from "~/hooks/usePermissions";
import { downloadCsv } from "./csv-download";
import {
  BarChart3,
  CalendarCheck,
  Check,
  ChevronDown,
  ClipboardList,
  Clock,
  Download,
  FileBarChart,
  Loader2,
  Plus,
  Printer,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { calculateAttendance, type DaySchedule } from "~/server/lib/presence-engine";

const TABS = [
  { id: "saisie", label: "Saisie du jour", icon: CalendarCheck },
  { id: "hs", label: "Heures supplémentaires", icon: Clock },
  { id: "historique", label: "Historique", icon: ClipboardList },
  { id: "mensuel", label: "Mensuel & clôture", icon: FileBarChart },
  { id: "analyse", label: "Analyse de période", icon: BarChart3 },
] as const;
type TabId = (typeof TABS)[number]["id"];

function fmt(min: number | null | undefined): string {
  if (min === null || min === undefined) return "-";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

const CODE_STYLE: Record<string, string> = {
  A: "bg-destructive/10 text-destructive",
  HS: "bg-primary/10 text-primary",
  R: "bg-warning/10 text-warning-foreground",
  P: "bg-success/10 text-success-foreground",
};

export default function PresencesRH() {
  const [tab, setTab] = useState<TabId>("saisie");
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Présences</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saisie des heures brutes — le système calcule heures normales, HS, retards et primes selon les paramètres RH.
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
        {tab === "saisie" && <SaisieSection />}
        {tab === "hs" && <OvertimeSection />}
        {tab === "historique" && <HistoriqueSection />}
        {tab === "mensuel" && <MensuelSection />}
        {tab === "analyse" && <AnalyseSection />}
      </div>
    </div>
  );
}

// ─── 1. Saisie quotidienne (specs MVP : saisie brute, calcul intelligent en direct) ───
interface RowState {
  timeIn: string;
  timeOut: string;
  status: string;
  taskBonus: string;
  validateEarlyArrival: boolean;
  validateLateDeparture: boolean;
  notes: string;
  expanded: boolean;
}

const EMPTY_ROW: RowState = { timeIn: "", timeOut: "", status: "present", taskBonus: "", validateEarlyArrival: false, validateLateDeparture: false, notes: "", expanded: false };

function SaisieSection() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const { data: employees, isLoading } = api.rh.list.useQuery({ limit: 100, statut: "actif" });
  const { data: settingsBundle } = api.rhSettings.getAll.useQuery();
  const { data: existing, refetch } = api.rhPresence.listEntries.useQuery(
    { from: date, to: date, limit: 200 },
    { enabled: !!date }
  );

  const [rows, setRows] = useState<Record<number, RowState>>({});

  useEffect(() => {
    const next: Record<number, RowState> = {};
    (existing ?? []).forEach((e) => {
      next[e.employeeId] = {
        ...EMPTY_ROW,
        timeIn: (e.timeIn ?? "").slice(0, 5),
        timeOut: (e.timeOut ?? "").slice(0, 5),
        status: e.status ?? "present",
        taskBonus: e.taskBonus ? String(Number(e.taskBonus)) : "",
        validateEarlyArrival: !!e.validateEarlyArrival,
        validateLateDeparture: !!e.validateLateDeparture,
        notes: e.notes ?? "",
      };
    });
    setRows(next);
  }, [existing]);

  const batch = api.rhPresence.saveBatch.useMutation({
    onSuccess: (res) => {
      const ok = res.filter((r) => r.ok).length;
      const ko = res.filter((r) => !r.ok);
      if (ok > 0) toast.success(`${ok} présence(s) enregistrée(s)`);
      ko.forEach((k) => toast.error(k.error ?? "Erreur"));
      if (ok === 0 && ko.length === 0) toast.error("Renseignez au moins une présence");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const emps = (employees?.employees ?? []) as unknown as Array<{
    id: number; nom: string; prenom: string; fonction: string; workCycleId: number | null;
  }>;

  // Horaires du jour (cycle de l'employé) pour le calcul en direct
  const dayOfWeek = useMemo(() => new Date(`${date}T12:00:00`).getDay(), [date]);
  const cycles = (settingsBundle?.cycles ?? []) as unknown as Array<{
    id: number; schedules: Array<{ dayOfWeek: number; startTime: string; endTime: string; breakStart: string | null; breakEnd: string | null; expectedHours: string | null; overtimeThreshold: string | null; isWorkingDay: boolean }>;
  }>;
  const presence = (settingsBundle?.attendance ?? null) as unknown as {
    lateToleranceMinutes?: number; roundToMinutes?: number; autoDeductBreak?: boolean;
    countEarlyArrival?: boolean; countLateDeparture?: boolean; autoDeductLate?: boolean;
    autoDeductEarlyDeparture?: boolean; maxNormalHoursPerDay?: string;
  } | null;

  const scheduleFor = (workCycleId: number | null): DaySchedule | null => {
    const cycle = cycles.find((c) => c.id === workCycleId);
    const s = cycle?.schedules?.find((x) => x.dayOfWeek === dayOfWeek);
    if (!s) return null;
    return {
      startTime: s.startTime,
      endTime: s.endTime,
      breakStart: s.breakStart,
      breakEnd: s.breakEnd,
      expectedHours: s.expectedHours,
      overtimeThreshold: s.overtimeThreshold,
      isWorkingDay: s.isWorkingDay,
    };
  };

  const settings = {
    lateToleranceMinutes: presence?.lateToleranceMinutes ?? 0,
    roundToMinutes: presence?.roundToMinutes ?? 0,
    autoDeductBreak: presence?.autoDeductBreak ?? true,
    countEarlyArrival: presence?.countEarlyArrival ?? false,
    countLateDeparture: presence?.countLateDeparture ?? false,
    autoDeductLate: presence?.autoDeductLate ?? true,
    autoDeductEarlyDeparture: presence?.autoDeductEarlyDeparture ?? true,
    maxNormalHoursPerDay: presence?.maxNormalHoursPerDay ?? null,
  };

  const save = () => {
    const list = emps
      .filter((e) => rows[e.id] && (rows[e.id].timeIn || rows[e.id].timeOut || rows[e.id].status !== "present" || rows[e.id].taskBonus))
      .map((e) => ({
        employeeId: e.id,
        timeIn: rows[e.id]?.timeIn || null,
        timeOut: rows[e.id]?.timeOut || null,
        status: (rows[e.id]?.status ?? "present") as "present",
        validateEarlyArrival: rows[e.id]?.validateEarlyArrival ?? false,
        validateLateDeparture: rows[e.id]?.validateLateDeparture ?? false,
        taskBonus: rows[e.id]?.taskBonus ? Number(rows[e.id].taskBonus) : 0,
      }));
    if (list.length === 0) {
      toast.error("Renseignez au moins une présence");
      return;
    }
    batch.mutate({ date, rows: list });
  };

  const setRow = (id: number, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...EMPTY_ROW, ...prev[id], ...patch } }));

  const inputCls = "rounded-lg border border-border bg-accent/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50";
  const isNonWorkingDay = dayOfWeek === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="p-date">Date</Label>
          <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <Button
          onClick={() => setRows(Object.fromEntries(emps.map((e) => [e.id, { ...EMPTY_ROW, ...(rows[e.id] ?? {}) } as RowState])))}
          variant="outline"
          disabled={isLoading}
          title="Marque tous les employés présents (sans écraser les heures)"
        >
          <Sparkles size={15} /> Tout présent
        </Button>
        <Button onClick={save} disabled={batch.isPending} className="ml-auto">
          {batch.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save size={15} />}
          Enregistrer la journée
        </Button>
      </div>

      {isNonWorkingDay && (
        <div className="rounded-lg bg-warning/10 px-4 py-2.5 text-sm text-warning-foreground">
          Dimanche : jour non ouvré — la saisie est conservée mais aucune heure n'est calculée.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[1fr_100px_100px_120px] gap-2 border-b border-border/60 bg-muted/40 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:grid-cols-[1fr_100px_100px_120px_90px_70px_70px_70px_52px]">
          <span>Employé</span>
          <span>Arrivée</span>
          <span>Départ</span>
          <span>Statut</span>
          <span className="hidden md:block">Prime (XOF)</span>
          <span className="hidden text-right md:block">Travail.</span>
          <span className="hidden text-right md:block">HN</span>
          <span className="hidden text-right md:block">HS</span>
          <span className="hidden text-center md:block">Code</span>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {emps.map((e) => {
              const r = rows[e.id];
              const calc = calculateAttendance({
                timeIn: r?.timeIn ? `${r.timeIn}:00` : null,
                timeOut: r?.timeOut ? `${r.timeOut}:00` : null,
                schedule: scheduleFor(e.workCycleId),
                settings,
                overtimeAuth: null,
                validateEarlyArrival: r?.validateEarlyArrival ?? false,
                validateLateDeparture: r?.validateLateDeparture ?? false,
              });
              const filled = r && (r.timeIn || r.timeOut || r.status !== "present");
              return (
                <div key={e.id} className={filled ? "" : "bg-warning/5"}>
                  <div className="grid grid-cols-[1fr_100px_100px_120px] items-center gap-2 px-4 py-2 md:grid-cols-[1fr_100px_100px_120px_90px_70px_70px_70px_52px]">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRow(e.id, { expanded: !(r?.expanded ?? false) })}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title="Détails : validations admin, notes"
                      >
                        <ChevronDown size={14} className={`transition-transform ${r?.expanded ? "rotate-180" : ""}`} />
                      </button>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{e.prenom} {e.nom}</p>
                        <p className="truncate text-xs text-muted-foreground">{e.fonction}</p>
                      </div>
                      {!filled && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[9px] font-bold uppercase text-warning-foreground">En attente</span>}
                    </div>
                    <input type="time" className={inputCls} value={r?.timeIn ?? ""} onChange={(ev) => setRow(e.id, { timeIn: ev.target.value })} />
                    <input type="time" className={inputCls} value={r?.timeOut ?? ""} onChange={(ev) => setRow(e.id, { timeOut: ev.target.value })} />
                    <select className={inputCls} value={r?.status ?? "present"} onChange={(ev) => setRow(e.id, { status: ev.target.value })}>
                      <option value="present" className="bg-background">Présent</option>
                      <option value="absent" className="bg-background">Absent</option>
                      <option value="conge" className="bg-background">Congé</option>
                      <option value="maladie" className="bg-background">Maladie</option>
                      <option value="mission" className="bg-background">Mission</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      className={`${inputCls} hidden md:block`}
                      placeholder="0"
                      value={r?.taskBonus ?? ""}
                      onChange={(ev) => setRow(e.id, { taskBonus: ev.target.value })}
                    />
                    <span className="hidden text-right font-mono text-xs md:block">{filled ? fmt(calc.workedMinutes) : "-"}</span>
                    <span className="hidden text-right font-mono text-xs text-success-foreground md:block">{filled ? fmt(calc.normalMinutes) : "-"}</span>
                    <span className="hidden text-right font-mono text-xs text-primary md:block">{filled && calc.overtimeMinutes > 0 ? fmt(calc.overtimeMinutes) : "-"}</span>
                    <span className="hidden md:block">
                      {filled ? (
                        <span className={`inline-flex w-7 justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${CODE_STYLE[calc.codePresence] ?? CODE_STYLE.P}`}>{calc.codePresence}</span>
                      ) : (
                        <span className="text-center text-xs text-muted-foreground">-</span>
                      )}
                    </span>
                  </div>
                  {r?.expanded && (
                    <div className="grid grid-cols-2 gap-2 border-t border-border/40 bg-muted/20 px-4 py-2 sm:grid-cols-4">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" className="size-3.5 accent-primary" checked={r.validateEarlyArrival} onChange={(ev) => setRow(e.id, { validateEarlyArrival: ev.target.checked })} />
                        Valider arrivée anticipée
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" className="size-3.5 accent-primary" checked={r.validateLateDeparture} onChange={(ev) => setRow(e.id, { validateLateDeparture: ev.target.checked })} />
                        Valider départ tardif
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground sm:col-span-2">
                        Prime de tâche (XOF)
                        <Input type="number" min={0} className="h-7 w-24" value={r.taskBonus ?? ""} onChange={(ev) => setRow(e.id, { taskBonus: ev.target.value })} />
                      </label>
                      <Input className="h-7 sm:col-span-4" placeholder="Notes / motif (ex. arrivé 15 min avant — non compté)" value={r.notes ?? ""} onChange={(ev) => setRow(e.id, { notes: ev.target.value })} />
                      {calc.lateMinutes > 0 && <span className="text-xs text-destructive">Retard : {fmt(calc.lateMinutes)}</span>}
                      {calc.earlyDepartureMinutes > 0 && <span className="text-xs text-destructive">Départ anticipé : {fmt(calc.earlyDepartureMinutes)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {emps.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucun employé actif.</p>
            )}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Arrivée avant l&apos;heure de début et départ après l&apos;heure de fin ne sont pas comptés, sauf validation Admin (colonne détail). Les retards et départs anticipés sont déduits automatiquement. Prime de tâche = bonus XOF saisi jour par jour (repris en paie).
      </p>
    </div>
  );
}

// ─── 2. Autorisations HS ───
function OvertimeSection() {
  const utils = api.useUtils();
  const { data: employees } = api.rh.list.useQuery({ limit: 100, statut: "actif" });
  const { data: ots } = api.rhPresence.listOvertime.useQuery();
  const today = new Date().toISOString().split("T")[0];

  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(today);
  const [maxHours, setMaxHours] = useState("2");
  const [reason, setReason] = useState("");

  const request = api.rhPresence.requestOvertime.useMutation({
    onSuccess: () => {
      toast.success("Demande d'heures supplémentaires envoyée");
      utils.rhPresence.listOvertime.invalidate();
      setReason("");
    },
    onError: (e) => toast.error(e.message),
  });
  const decide = api.rhPresence.decideOvertime.useMutation({
    onSuccess: () => {
      toast.success("Décision enregistrée");
      utils.rhPresence.listOvertime.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const emps = (employees?.employees ?? []) as unknown as Array<{ id: number; nom: string; prenom: string }>;
  const list = (ots ?? []) as unknown as Array<{
    id: number; employeeId: number; employeNom: string; employePrenom: string;
    date: string; maxHours: string; reason: string; status: string;
  }>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Nouvelle demande</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Règle HS (CDC) : les heures supplémentaires ne sont comptées que si une autorisation approuvée existe pour la journée. Sans autorisation, les minutes au-delà de l'horaire sont ignorées.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none"
          >
            <option value="" className="bg-background">Employé *</option>
            {emps.map((e) => (
              <option key={e.id} value={String(e.id)} className="bg-background">{e.prenom} {e.nom}</option>
            ))}
          </select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input type="number" min={0.5} max={12} step={0.5} value={maxHours} onChange={(e) => setMaxHours(e.target.value)} placeholder="Heures max" />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif *" className="sm:col-span-2" />
        </div>
        <Button
          className="mt-3"
          disabled={!employeeId || !reason.trim() || request.isPending}
          onClick={() => request.mutate({ employeeId: Number(employeeId), date, maxHours: Number(maxHours), reason: reason.trim() })}
        >
          <Plus size={15} /> Demander l&apos;autorisation
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border/60 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Demandes
        </div>
        {list.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucune demande.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {list.map((ot) => (
              <div key={ot.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {ot.employePrenom} {ot.employeNom}
                    <span className="ml-2 text-xs text-muted-foreground">{ot.date}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{ot.reason} — max {ot.maxHours}h</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  ot.status === "approuvee" ? "bg-success/10 text-success-foreground"
                  : ot.status === "refusee" ? "bg-destructive/10 text-destructive"
                  : "bg-warning/10 text-warning-foreground"
                }`}>
                  {ot.status}
                </span>
                {ot.status === "en_attente" && (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => decide.mutate({ id: ot.id, status: "approuvee" })}>
                      <Check size={14} /> Approuver
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => decide.mutate({ id: ot.id, status: "refusee" })}>
                      <X size={14} /> Refuser
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 3. Historique (specs MVP : codes présences, primes, détails à la demande) ───
function HistoriqueSection() {
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const employeUrl = useEmployeFromUrl();
  useEffect(() => { if (employeUrl) setEmployeeId(String(employeUrl)); }, [employeUrl]);
  const { data: employees } = api.rh.list.useQuery({ limit: 100 });
  const { data: entries } = api.rhPresence.listEntries.useQuery({
    employeeId: employeeId ? Number(employeeId) : undefined,
    from: from || undefined,
    to: to || undefined,
    limit: 100,
  });

  const emps = (employees?.employees ?? []) as unknown as Array<{ id: number; nom: string; prenom: string }>;
  const list = (entries ?? []) as unknown as Array<{
    id: number; employeNom: string; employePrenom: string; date: string;
    timeIn: string | null; timeOut: string | null; status: string;
    validateEarlyArrival: boolean; validateLateDeparture: boolean; taskBonus: string | null;
    calculation: { normalMinutes: number; overtimeMinutes: number; lateMinutes: number; earlyDepartureMinutes: number; codePresence: string; isAbsent: boolean } | null;
  }>;

  const totals = useMemo(() => {
    let hn = 0, hs = 0, bonus = 0, present = 0;
    list.forEach((e) => {
      hn += e.calculation?.normalMinutes ?? 0;
      hs += e.calculation?.overtimeMinutes ?? 0;
      bonus += Number(e.taskBonus ?? 0);
      if (e.calculation && !e.calculation.isAbsent) present++;
    });
    return { hn, hs, bonus, present };
  }, [list]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none"
        >
          <option value="" className="bg-background">Tous les employés</option>
          {emps.map((e) => (
            <option key={e.id} value={String(e.id)} className="bg-background">{e.prenom} {e.nom}</option>
          ))}
        </select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" placeholder="Du" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" placeholder="Au" />
      </div>

      {list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success-foreground">Σ HN : {fmt(totals.hn)}</span>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Σ HS : {fmt(totals.hs)}</span>
          <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning-foreground">Σ Primes : {totals.bonus.toLocaleString("fr-FR")} XOF</span>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">Jours présents : {totals.present}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Employé</th>
              <th className="px-4 py-2.5">Arrivée</th>
              <th className="px-4 py-2.5">Départ</th>
              <th className="px-4 py-2.5">Statut</th>
              <th className="px-4 py-2.5 text-center">Code</th>
              <th className="px-4 py-2.5 text-right">Normal</th>
              <th className="px-4 py-2.5 text-right">HS</th>
              <th className="px-4 py-2.5 text-right">Prime</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {list.map((e) => (
              <Fragment key={e.id}>
                <tr
                  className="cursor-pointer text-sm text-foreground hover:bg-accent/30"
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                >
                  <td className="px-4 py-2">{e.date}</td>
                  <td className="px-4 py-2">{e.employePrenom} {e.employeNom}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.timeIn?.slice(0, 5) ?? "-"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.timeOut?.slice(0, 5) ?? "-"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      e.status === "present" ? "bg-success/10 text-success-foreground"
                      : e.status === "absent" ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                    }`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {e.calculation && (
                      <span className={`inline-flex w-7 justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${CODE_STYLE[e.calculation.codePresence] ?? CODE_STYLE.P}`}>
                        {e.calculation.codePresence}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{e.calculation ? fmt(e.calculation.normalMinutes) : "-"}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-primary">{e.calculation && e.calculation.overtimeMinutes > 0 ? fmt(e.calculation.overtimeMinutes) : "-"}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-warning-foreground">{Number(e.taskBonus ?? 0) > 0 ? `${Number(e.taskBonus).toLocaleString("fr-FR")} XOF` : "-"}</td>
                </tr>
                {expanded === e.id && (
                  <tr className="bg-muted/20 text-xs text-muted-foreground">
                    <td colSpan={9} className="px-4 py-2">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                        <span>Retard : <b className={e.calculation?.lateMinutes ? "text-destructive" : ""}>{e.calculation ? fmt(e.calculation.lateMinutes) : "-"}</b></span>
                        <span>Départ anticipé : <b className={e.calculation?.earlyDepartureMinutes ? "text-destructive" : ""}>{e.calculation ? fmt(e.calculation.earlyDepartureMinutes) : "-"}</b></span>
                        <span>Arrivée anticipée validée : {e.validateEarlyArrival ? "Oui" : "Non"}</span>
                        <span>Départ tardif validé : {e.validateLateDeparture ? "Oui" : "Non"}</span>
                        {e.taskBonus && Number(e.taskBonus) > 0 && <span>Prime de tâche : {Number(e.taskBonus).toLocaleString("fr-FR")} XOF</span>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune présence sur cette période.</td></tr>
)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 5. Analyse de période (Phase 4 — N06/P08 : lecture seule, diagnostics) ───
type AnalyseLigne = {
  employeeId: number;
  employePrenom: string;
  employeNom: string;
  matricule: string;
  analyse: {
    joursTheoriques: number;
    joursPresence: number;
    joursAbsence: number;
    joursConges: number;
    joursMuets: number;
    heuresTheoriques: number;
    heuresTravaillees: number;
    heuresNormales: number;
    heuresSupp: number;
    retardTotalMinutes: number;
    departAnticipeTotalMinutes: number;
    tauxPresence: number;
    anomalies: Array<{ date: string; code: string; detail: string }>;
  };
};

const ANOMALIE_STYLE: Record<string, string> = {
  A: "bg-destructive/10 text-destructive",
  R: "bg-warning/10 text-warning-foreground",
  MUET: "bg-muted text-muted-foreground",
};

function AnalyseSection() {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [employeeId, setEmployeeId] = useState("");
  const [recherche, setRecherche] = useState("");

  const { data: employees } = api.rh.list.useQuery({ limit: 500 });
  const { data: resultats, isLoading, error } = api.rhPresence.analysePeriode.useQuery(
    { from, to, employeeId: employeeId ? Number(employeeId) : undefined },
    { enabled: !!from && !!to && from <= to }
  );

  const lignes = (resultats ?? []) as unknown as AnalyseLigne[];
  const filtrees = lignes.filter((l) => {
    if (!recherche.trim()) return true;
    const q = recherche.toLowerCase();
    return `${l.employePrenom} ${l.employeNom} ${l.matricule}`.toLowerCase().includes(q);
  });

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Erreur de chargement de l&apos;analyse : {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Du</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        </div>
        <div>
          <Label>Au</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
        <div>
          <Label>Employé</Label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
            <option value="">Tous</option>
            {(employees?.employees ?? []).map((e) => (
              <option key={e.id} value={e.id} className="bg-background">
                {(e as { prenom?: string }).prenom} {(e as { nom?: string }).nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Recherche (matricule / nom)</Label>
          <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Filtrer…" className="w-56" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtrees.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Aucune donnée sur la période sélectionnée.
        </div>
      ) : (
        <div className="space-y-4">
          {filtrees.map((l) => (
            <div key={l.employeeId} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-foreground">
                  {l.employePrenom} {l.employeNom} <span className="ml-1 font-mono text-[10px] font-normal text-muted-foreground">{l.matricule}</span>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  Taux de présence : {l.analyse.tauxPresence.toFixed(1)} %
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Jours théoriques" value={String(l.analyse.joursTheoriques)} />
                <Stat label="Présences" value={String(l.analyse.joursPresence)} className="text-success-foreground" />
                <Stat label="Absences" value={String(l.analyse.joursAbsence)} className="text-destructive" />
                <Stat label="Congés" value={String(l.analyse.joursConges)} className="text-primary" />
                <Stat label="Non pointés" value={String(l.analyse.joursMuets)} className="text-muted-foreground" />
                <Stat label="Heures théoriques" value={`${l.analyse.heuresTheoriques.toFixed(1)} h`} />
                <Stat label="Heures travaillées" value={`${l.analyse.heuresTravaillees.toFixed(1)} h`} />
                <Stat label="Heures sup." value={`${l.analyse.heuresSupp.toFixed(1)} h`} className="text-warning-foreground" />
                <Stat label="Heures normales" value={`${l.analyse.heuresNormales.toFixed(1)} h`} />
                <Stat label="Retards" value={`${l.analyse.retardTotalMinutes} min`} />
                <Stat label="Départs anticipés" value={`${l.analyse.departAnticipeTotalMinutes} min`} />
                <Stat label="Jours anormaux" value={String(l.analyse.anomalies.length)} />
              </div>

              {l.analyse.anomalies.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {l.analyse.anomalies.map((a, i) => (
                    <span
                      key={`${a.date}-${i}`}
                      title={a.detail}
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ANOMALIE_STYLE[a.code] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {a.date}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Aucune anomalie détectée sur la période.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`font-mono text-sm font-bold text-foreground ${className ?? ""}`}>{value}</p>
    </div>
  );
}

// ─── 4. Mensuel & clôture (specs MVP : primes de tâche agrégées) ───
function MensuelSection() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const utils = api.useUtils();
  const { hasPermission } = usePermissions();
  const { data: summaries } = api.rhPresence.listSummaries.useQuery({ year, month });
  const exportPresences = api.rhDashboard.exportPresences.useQuery({ year, month }, { enabled: false });

  const close = api.rhPresence.closeMonth.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.summaries} résumé(s) généré(s) et verrouillé(s)`);
      utils.rhPresence.listSummaries.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const list = (summaries ?? []) as unknown as Array<{
    id: number; employeNom: string; employePrenom: string; matricule: string;
    totalNormalMinutes: number; totalOvertimeMinutes: number; totalLateMinutes: number; totalTaskBonus: string;
    daysPresent: number; daysAbsent: number; daysOnLeave: number; locked: boolean;
  }>;

  const totalBonus = list.reduce((s, x) => s + Number(x.totalTaskBonus ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Année</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
        </div>
        <div>
          <Label>Mois</Label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m} className="bg-background">{m}</option>
            ))}
          </select>
        </div>
        <Button onClick={() => close.mutate({ year, month })} disabled={close.isPending}>
          {close.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check size={15} />}
          Clôturer le mois
        </Button>
        {hasPermission("rh.presence.consulter") && (
          <Button
            variant="outline"
            onClick={async () => {
              if (!exportPresences.data) await exportPresences.refetch();
              downloadCsv(exportPresences.data, `presences-${year}-${String(month).padStart(2, "0")}.csv`);
            }}
          >
            <Download size={15} /> Exporter
          </Button>
        )}
        <Button variant="outline" onClick={() => window.print()} className="print:hidden">
          <Printer size={15} /> Imprimer
        </Button>
        {totalBonus > 0 && (
          <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning-foreground">Σ Primes de tâche : {totalBonus.toLocaleString("fr-FR")} XOF</span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Employé</th>
              <th className="px-4 py-2.5 text-right">Heures normales</th>
              <th className="px-4 py-2.5 text-right">HS</th>
              <th className="px-4 py-2.5 text-right">Primes de tâche</th>
              <th className="px-4 py-2.5 text-right">Retards</th>
              <th className="px-4 py-2.5 text-right">Jours présents</th>
              <th className="px-4 py-2.5 text-right">Congés</th>
              <th className="px-4 py-2.5 text-right">Absences</th>
              <th className="px-4 py-2.5">État</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {list.map((s) => (
              <tr key={s.id} className="text-sm text-foreground">
                <td className="px-4 py-2">{s.employePrenom} {s.employeNom} <span className="ml-1 font-mono text-[10px] text-muted-foreground">{s.matricule}</span></td>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmt(s.totalNormalMinutes)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-primary">{s.totalOvertimeMinutes > 0 ? fmt(s.totalOvertimeMinutes) : "-"}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-warning-foreground">{Number(s.totalTaskBonus ?? 0) > 0 ? `${Number(s.totalTaskBonus).toLocaleString("fr-FR")} XOF` : "-"}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-destructive">{fmt(s.totalLateMinutes)}</td>
                <td className="px-4 py-2 text-right">{s.daysPresent}</td>
                <td className="px-4 py-2 text-right text-primary">{s.daysOnLeave > 0 ? s.daysOnLeave : "-"}</td>
                <td className="px-4 py-2 text-right">{s.daysAbsent}</td>
                <td className="px-4 py-2">
                  {s.locked ? (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-success-foreground">Verrouillé</span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">Ouvert</span>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun résumé pour cette période.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}