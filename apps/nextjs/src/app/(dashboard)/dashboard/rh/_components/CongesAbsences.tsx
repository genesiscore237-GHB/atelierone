"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { CalendarDays, Check, ClipboardList, Plus, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const TABS = [
  { id: "demandes", label: "Demandes", icon: ClipboardList },
  { id: "soldes", label: "Soldes", icon: CalendarDays },
  { id: "calendrier", label: "Calendrier", icon: CalendarDays },
] as const;
type TabId = (typeof TABS)[number]["id"];

const STATUS_LABEL: Record<string, string> = {
  en_attente: "En attente",
  approuve: "Approuvé",
  refuse: "Refusé",
  annule: "Annulé",
  brouillon: "Brouillon",
};

export default function CongesAbsences() {
  const [tab, setTab] = useState<TabId>("demandes");
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Congés & Absences</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Demandes, validation hiérarchique, soldes — les types de congés viennent du paramétrage RH.
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
        {tab === "demandes" && <DemandesSection />}
        {tab === "soldes" && <SoldesSection />}
        {tab === "calendrier" && <CalendrierSection />}
      </div>
    </div>
  );
}

// ─── 1. Demandes (création + validation) ───
function DemandesSection() {
  const utils = api.useUtils();
  const { data: employees } = api.rh.list.useQuery({ limit: 100 });
  const { data: leaveTypes } = api.rhSettings.listLeaveTypes.useQuery();
  const { data: requests } = api.rhLeave.listRequests.useQuery();
  const today = new Date().toISOString().split("T")[0];

  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");

  const create = api.rhLeave.createRequest.useMutation({
    onSuccess: () => {
      toast.success("Demande envoyée pour validation");
      utils.rhLeave.listRequests.invalidate();
      setReason("");
    },
    onError: (e) => toast.error(e.message),
  });
  const decide = api.rhLeave.decideRequest.useMutation({
    onSuccess: () => {
      toast.success("Décision enregistrée");
      utils.rhLeave.listRequests.invalidate();
      utils.rhLeave.getBalances.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const emps = (employees?.employees ?? []) as unknown as Array<{ id: number; nom: string; prenom: string }>;
  const types = (leaveTypes ?? []) as unknown as Array<{ id: number; name: string; isPaid: boolean | null }>;
  const list = (requests ?? []) as unknown as Array<{
    id: number; employeNom: string; employePrenom: string; leaveTypeName: string;
    startDate: string; endDate: string; daysCount: string; reason: string | null;
    status: string; rejectionReason: string | null;
  }>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Nouvelle demande</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none">
            <option value="" className="bg-background">Employé *</option>
            {emps.map((e) => (
              <option key={e.id} value={String(e.id)} className="bg-background">{e.prenom} {e.nom}</option>
            ))}
          </select>
          <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className="rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none">
            <option value="" className="bg-background">Type de congé *</option>
            {types.map((t) => (
              <option key={t.id} value={String(t.id)} className="bg-background">{t.name}{t.isPaid ? "" : " (non payé)"}</option>
            ))}
          </select>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="sm:col-span-1" />
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="sm:col-span-1" />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif *" className="sm:col-span-2" />
        </div>
        <Button
          className="mt-3"
          disabled={!employeeId || !leaveTypeId || !reason.trim() || create.isPending}
          onClick={() =>
            create.mutate({
              employeeId: Number(employeeId),
              leaveTypeId: Number(leaveTypeId),
              startDate,
              endDate,
              reason: reason.trim(),
            })
          }
        >
          <Plus size={15} /> Envoyer la demande
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Employé</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Période</th>
              <th className="px-4 py-2.5">Jours</th>
              <th className="px-4 py-2.5">Motif</th>
              <th className="px-4 py-2.5">Statut</th>
              <th className="px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {list.map((r) => (
              <tr key={r.id} className="text-sm text-foreground">
                <td className="px-4 py-2">{r.employePrenom} {r.employeNom}</td>
                <td className="px-4 py-2">{r.leaveTypeName}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.startDate} → {r.endDate}</td>
                <td className="px-4 py-2">{r.daysCount} j</td>
                <td className="max-w-52 truncate px-4 py-2 text-xs text-muted-foreground">{r.reason ?? "-"}{r.rejectionReason ? ` (refus : ${r.rejectionReason})` : ""}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    r.status === "approuve" ? "bg-success/10 text-success-foreground"
                    : r.status === "refuse" ? "bg-destructive/10 text-destructive"
                    : r.status === "annule" ? "bg-muted text-muted-foreground"
                    : "bg-warning/10 text-warning-foreground"
                  }`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {r.status === "en_attente" && (
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => decide.mutate({ id: r.id, status: "approuve" })}>
                        <Check size={13} /> Approuver
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => decide.mutate({ id: r.id, status: "refuse" })}>
                        <X size={13} /> Refuser
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune demande.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 2. Soldes + ajustements ───
function SoldesSection() {
  const year = new Date().getFullYear();
  const utils = api.useUtils();
  const { data: balances } = api.rhLeave.getBalances.useQuery({ year });
  const [adjusting, setAdjusting] = useState<{ id: number; label: string } | null>(null);
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("");

  const adjust = api.rhLeave.adjustBalance.useMutation({
    onSuccess: () => {
      toast.success("Solde ajusté (tracé)");
      utils.rhLeave.getBalances.invalidate();
      setAdjusting(null);
      setReason("");
    },
    onError: (e) => toast.error(e.message),
  });

  const list = (balances ?? []) as unknown as Array<{
    id: number; employeNom: string; employePrenom: string; matricule: string;
    leaveTypeName: string; acquiredDays: string; takenDays: string; adjustedDays: string; balance: string;
  }>;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Employé</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5 text-right">Acquis</th>
              <th className="px-4 py-2.5 text-right">Pris</th>
              <th className="px-4 py-2.5 text-right">Ajusté</th>
              <th className="px-4 py-2.5 text-right">Solde</th>
              <th className="px-4 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {list.map((b) => (
              <tr key={b.id} className="text-sm text-foreground">
                <td className="px-4 py-2">{b.employePrenom} {b.employeNom} <span className="ml-1 font-mono text-[10px] text-muted-foreground">{b.matricule}</span></td>
                <td className="px-4 py-2">{b.leaveTypeName}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{b.acquiredDays}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-destructive">{b.takenDays}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-warning-foreground">{b.adjustedDays}</td>
                <td className="px-4 py-2 text-right font-mono text-xs font-bold">{b.balance}</td>
                <td className="px-4 py-2">
                  <Button size="sm" variant="outline" onClick={() => setAdjusting({ id: b.id, label: `${b.employePrenom} ${b.employeNom} — ${b.leaveTypeName}` })}>
                    Ajuster
                  </Button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun solde pour cette année.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adjusting && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold text-foreground">Ajustement — {adjusting.label}</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Montant (jours, +/−)</Label>
              <Input type="number" step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Motif (obligatoire, tracé)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. régularisation congés 2026" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => setAdjusting(null)}>Annuler</Button>
            <Button
              disabled={!reason.trim() || adjust.isPending}
              onClick={() => adjust.mutate({ leaveBalanceId: adjusting.id, amount: Number(amount), reason: reason.trim() })}
            >
              <Check size={14} /> Appliquer l&apos;ajustement
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 3. Calendrier des absences approuvées ───
function CalendrierSection() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data: requests } = api.rhLeave.listRequests.useQuery({ status: "approuve" });

  const list = (requests ?? []) as unknown as Array<{
    id: number; employePrenom: string; employeNom: string; leaveTypeName: string;
    startDate: string; endDate: string;
  }>;

  const days = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    const arr: Array<{ day: number; dateStr: string }> = [];
    for (let d = 1; d <= last.getDate(); d++) {
      arr.push({ day: d, dateStr: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
    }
    return { firstDay: first.getDay(), arr };
  }, [year, month]);

  const absentsFor = (dateStr: string) =>
    list.filter((r) => r.startDate <= dateStr && r.endDate >= dateStr);

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
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-7 gap-px bg-border/60 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((d) => (
            <div key={d} className="bg-card py-2">{d}</div>
          ))}
          {Array.from({ length: days.firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-card py-4" />
          ))}
          {days.arr.map((d) => {
            const absents = absentsFor(d.dateStr);
            const isHoliday = d.day === 1 || d.day === 11 || d.day === 20 || d.day === 25;
            return (
              <div key={d.day} className={`min-h-16 bg-card p-1 ${absents.length > 0 ? "bg-warning/5" : ""}`}>
                <div className={`text-[10px] font-bold ${isHoliday ? "text-destructive" : "text-muted-foreground"}`}>
                  {d.day}
                </div>
                {absents.slice(0, 3).map((a) => (
                  <div key={a.id} className="mt-0.5 truncate rounded bg-destructive/10 px-1 py-0.5 text-[9px] font-medium text-destructive" title={`${a.employePrenom} ${a.employeNom} — ${a.leaveTypeName}`}>
                    {a.employePrenom} {a.employeNom.charAt(0)}.
                  </div>
                ))}
                {absents.length > 3 && (
                  <div className="text-[9px] text-muted-foreground">+{absents.length - 3}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {list.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">Aucun congé approuvé pour le moment.</p>
      )}
    </div>
  );
}
