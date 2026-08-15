"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  CalendarCheck,
  Check,
  ClipboardList,
  Clock,
  FileBarChart,
  Loader2,
  Plus,
  Save,
  X,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const TABS = [
  { id: "saisie", label: "Saisie du jour", icon: CalendarCheck },
  { id: "hs", label: "Heures supplémentaires", icon: Clock },
  { id: "historique", label: "Historique", icon: ClipboardList },
  { id: "mensuel", label: "Mensuel & clôture", icon: FileBarChart },
] as const;
type TabId = (typeof TABS)[number]["id"];

function fmt(min: number | null | undefined): string {
  if (min === null || min === undefined) return "-";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export default function PresencesRH() {
  const [tab, setTab] = useState<TabId>("saisie");
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Présences</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saisie des heures brutes — le système calcule tout selon les paramètres RH.
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
      </div>
    </div>
  );
}

// ─── 1. Saisie quotidienne ───
function SaisieSection() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const { data: employees, isLoading } = api.rh.list.useQuery({ limit: 100, statut: "actif" });
  const { data: existing, refetch } = api.rhPresence.listEntries.useQuery(
    { from: date, to: date, limit: 200 },
    { enabled: !!date }
  );

  const [rows, setRows] = useState<Record<number, { timeIn: string; timeOut: string; status: string }>>({});

  useEffect(() => {
    const next: Record<number, { timeIn: string; timeOut: string; status: string }> = {};
    (existing ?? []).forEach((e) => {
      next[e.employeeId] = {
        timeIn: (e.timeIn ?? "").slice(0, 5),
        timeOut: (e.timeOut ?? "").slice(0, 5),
        status: e.status ?? "present",
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

  const save = () => {
    const list = emps
      .filter((e) => rows[e.id] && (rows[e.id].timeIn || rows[e.id].timeOut || rows[e.id].status !== "present"))
      .map((e) => ({
        employeeId: e.id,
        timeIn: rows[e.id]?.timeIn || null,
        timeOut: rows[e.id]?.timeOut || null,
        status: (rows[e.id]?.status ?? "present") as "present",
      }));
    if (list.length === 0) {
      toast.error("Renseignez au moins une présence");
      return;
    }
    batch.mutate({ date, rows: list });
  };

  const setRow = (id: number, patch: Partial<{ timeIn: string; timeOut: string; status: string }>) =>
    setRows((prev) => ({ ...prev, [id]: { timeIn: "", timeOut: "", status: "present", ...prev[id], ...patch } }));

  const inputCls = "rounded-lg border border-border bg-accent/30 px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="p-date">Date</Label>
          <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <Button onClick={save} disabled={batch.isPending}>
          {batch.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save size={15} />}
          Enregistrer la journée
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[1fr_110px_110px_130px] gap-2 border-b border-border/60 bg-muted/40 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <span>Employé</span>
          <span>Arrivée</span>
          <span>Départ</span>
          <span>Statut</span>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {emps.map((e) => (
              <div key={e.id} className="grid grid-cols-[1fr_110px_110px_130px] items-center gap-2 px-4 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{e.prenom} {e.nom}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.fonction}</p>
                </div>
                <input type="time" className={inputCls} value={rows[e.id]?.timeIn ?? ""} onChange={(ev) => setRow(e.id, { timeIn: ev.target.value })} />
                <input type="time" className={inputCls} value={rows[e.id]?.timeOut ?? ""} onChange={(ev) => setRow(e.id, { timeOut: ev.target.value })} />
                <select className={inputCls} value={rows[e.id]?.status ?? "present"} onChange={(ev) => setRow(e.id, { status: ev.target.value })}>
                  <option value="present" className="bg-background">Présent</option>
                  <option value="absent" className="bg-background">Absent</option>
                  <option value="conge" className="bg-background">Congé</option>
                  <option value="maladie" className="bg-background">Maladie</option>
                  <option value="mission" className="bg-background">Mission</option>
                </select>
              </div>
            ))}
            {emps.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucun employé actif.</p>
            )}
          </div>
        )}
      </div>
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

// ─── 3. Historique ───
function HistoriqueSection() {
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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
    calculation: { normalMinutes: number; overtimeMinutes: number; lateMinutes: number; isAbsent: boolean } | null;
  }>;

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

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Employé</th>
              <th className="px-4 py-2.5">Arrivée</th>
              <th className="px-4 py-2.5">Départ</th>
              <th className="px-4 py-2.5">Statut</th>
              <th className="px-4 py-2.5 text-right">Normal</th>
              <th className="px-4 py-2.5 text-right">HS</th>
              <th className="px-4 py-2.5 text-right">Retard</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {list.map((e) => (
              <tr key={e.id} className="text-sm text-foreground">
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
                <td className="px-4 py-2 text-right font-mono text-xs">{e.calculation ? fmt(e.calculation.normalMinutes) : "-"}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-warning-foreground">{e.calculation ? fmt(e.calculation.overtimeMinutes) : "-"}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-destructive">{e.calculation ? fmt(e.calculation.lateMinutes) : "-"}</td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune présence.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 4. Mensuel & clôture ───
function MensuelSection() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const utils = api.useUtils();
  const { data: summaries } = api.rhPresence.listSummaries.useQuery({ year, month });

  const close = api.rhPresence.closeMonth.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.summaries} résumé(s) généré(s) et verrouillé(s)`);
      utils.rhPresence.listSummaries.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const list = (summaries ?? []) as unknown as Array<{
    id: number; employeNom: string; employePrenom: string; matricule: string;
    totalNormalMinutes: number; totalOvertimeMinutes: number; totalLateMinutes: number;
    daysPresent: number; daysAbsent: number; locked: boolean;
  }>;

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
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Employé</th>
              <th className="px-4 py-2.5 text-right">Heures normales</th>
              <th className="px-4 py-2.5 text-right">HS</th>
              <th className="px-4 py-2.5 text-right">Retards</th>
              <th className="px-4 py-2.5 text-right">Jours présents</th>
              <th className="px-4 py-2.5 text-right">Absences</th>
              <th className="px-4 py-2.5">État</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {list.map((s) => (
              <tr key={s.id} className="text-sm text-foreground">
                <td className="px-4 py-2">{s.employePrenom} {s.employeNom} <span className="ml-1 font-mono text-[10px] text-muted-foreground">{s.matricule}</span></td>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmt(s.totalNormalMinutes)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-warning-foreground">{fmt(s.totalOvertimeMinutes)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-destructive">{fmt(s.totalLateMinutes)}</td>
                <td className="px-4 py-2 text-right">{s.daysPresent}</td>
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
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun résumé pour cette période.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
