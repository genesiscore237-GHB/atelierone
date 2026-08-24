"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { CalendarRange, ChevronLeft, ChevronRight, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "~/components/ui/button";
import { AFFECTATIONS_PLANNING } from "~/lib/rh-planning-constants";

const JOURS = [
  { idx: 1, label: "Lundi" },
  { idx: 2, label: "Mardi" },
  { idx: 3, label: "Mercredi" },
  { idx: 4, label: "Jeudi" },
  { idx: 5, label: "Vendredi" },
  { idx: 6, label: "Samedi" },
];

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const COLORS: Record<string, string> = Object.fromEntries(AFFECTATIONS_PLANNING.map((a) => [a.label, a.badge]));

export function PlanningPageClient() {
  const utils = api.useUtils();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({}); // key = employeId:date

  const from = fmtISO(monday);
  const to = fmtISO(new Date(monday.getTime() + 5 * 86400000)); // lundi → samedi

  const { data: employees, isLoading: loadEmps } = api.rhPlanning.listEmployes.useQuery();
  const { data: week } = api.rhPlanning.listWeek.useQuery({ from, to });
  const { data: conges } = api.rhLeave.listRequests.useQuery({ status: "approuve", from, to });
  const prevFrom = fmtISO(new Date(monday.getTime() - 7 * 86400000));
  const prevTo = fmtISO(new Date(monday.getTime() - 2 * 86400000));
  const { data: prevWeek, refetch: refetchPrev } = api.rhPlanning.listWeek.useQuery({ from: prevFrom, to: prevTo });

  useEffect(() => {
    const next: Record<string, string> = {};
    (week ?? []).forEach((w) => {
      next[`${w.employeId}:${w.date}`] = w.affectation;
    });
    setDraft(next);
  }, [week]);

  const save = api.rhPlanning.saveWeek.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.saved} affectation(s) enregistrée(s)`);
      utils.rhPlanning.listWeek.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const emps = (employees ?? []) as unknown as Array<{ id: number; matricule: string; nom: string; prenom: string; fonction: string }>;
  const congesList = (conges ?? []) as unknown as Array<{ employeeId: number; startDate: string; endDate: string }>;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().replace(/[àâä]/g, "a").replace(/[éèêë]/g, "e").replace(/[îï]/g, "i").replace(/[ôö]/g, "o").replace(/[ùûü]/g, "u").replace(/ç/g, "c");
    return emps.filter((e) => `${e.prenom} ${e.nom} ${e.matricule} ${e.fonction}`.toLowerCase().includes(q));
  }, [emps, search]);

  const semaineDates = JOURS.map((j) => fmtISO(new Date(monday.getTime() + (j.idx - 1) * 86400000)));

  // Détection de conflit : congé approuvé vs affectation non-congé
  const enConge = (employeId: number, date: string): boolean =>
    congesList.some((c) => c.employeeId === employeId && date >= c.startDate && date <= c.endDate);

  const reprendre = () => {
    refetchPrev().then(({ data }) => {
      if (!data || data.length === 0) {
        toast.error("Aucune affectation la semaine précédente");
        return;
      }
      const next: Record<string, string> = {};
      data.forEach((w) => {
        const dayShift = new Date(w.date).getDay() || 7;
        const sameDay = new Date(monday.getTime() + (dayShift - 1) * 86400000);
        next[`${w.employeId}:${fmtISO(sameDay)}`] = w.affectation;
      });
      setDraft((prev) => ({ ...prev, ...next }));
      toast.success("Semaine précédente reprise — pensez à enregistrer");
    });
  };

  const setCell = (employeId: number, date: string, affectation: string) =>
    setDraft((prev) => ({ ...prev, [`${employeId}:${date}`]: affectation }));

  const saveAll = () => {
    const rows = Object.entries(draft)
      .filter(([, v]) => v)
      .map(([k, v]) => {
        const [employeId, date] = k.split(":");
        return { employeId: Number(employeId), date, affectation: v };
      });
    if (rows.length === 0) {
      toast.error("Aucune affectation à enregistrer");
      return;
    }
    save.mutate({ rows });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Planning hebdomadaire</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Affectations par employé et par jour — les congés approuvés sont signalés.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonday(new Date(monday.getTime() - 7 * 86400000))}>
            <ChevronLeft size={15} /> Semaine
          </Button>
          <span className="min-w-40 text-center text-sm font-semibold text-foreground">
            {from} → {to}
          </span>
          <Button variant="outline" size="sm" onClick={() => setMonday(new Date(monday.getTime() + 7 * 86400000))}>
            Semaine <ChevronRight size={15} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMonday(mondayOf(new Date()))}>
            Aujourd&apos;hui
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un employé…"
          className="h-10 w-64 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none focus:border-primary/50"
        />
        <Button variant="outline" onClick={reprendre}>
          <Sparkles size={15} /> Reprendre la semaine précédente
        </Button>
        <Button onClick={saveAll} disabled={save.isPending} className="ml-auto">
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save size={15} />}
          Enregistrer la semaine
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {AFFECTATIONS_PLANNING.map((a) => (
          <span key={a.label} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${a.badge}`}>{a.label}</span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-175">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="sticky left-0 bg-muted/40 px-4 py-2.5">Employé</th>
              {JOURS.map((j) => (
                <th key={j.idx} className="px-3 py-2.5 text-center">{j.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loadEmps ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun employé actif.</td></tr>
            ) : (
              filtered.map((e) => (
                <tr key={e.id} className="text-sm text-foreground">
                  <td className="sticky left-0 bg-background px-4 py-1.5">
                    <p className="font-medium">{e.prenom} {e.nom}</p>
                    <p className="text-[10px] text-muted-foreground">{e.fonction} · {e.matricule}</p>
                  </td>
                  {semaineDates.map((date, i) => {
                    const value = draft[`${e.id}:${date}`] ?? "";
                    const conflit = value && value !== "Congé" && enConge(e.id, date);
                    return (
                      <td key={date} className="px-2 py-1.5 text-center">
                        <select
                          value={value}
                          onChange={(ev) => setCell(e.id, date, ev.target.value)}
                          className={`h-9 w-full rounded-lg border text-xs outline-none focus:border-primary/50 ${
                            conflit
                              ? "border-destructive bg-destructive/10 text-destructive"
                              : "border-border bg-accent/30 text-foreground"
                          }`}
                          title={conflit ? `Conflit : congé approuvé le ${date}` : `${e.prenom} ${e.nom} — ${JOURS[i].label}`}
                        >
                          <option value="" className="bg-background">—</option>
                          {AFFECTATIONS_PLANNING.map((a) => (
                            <option key={a.label} value={a.label} className="bg-background">{a.label}</option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CalendarRange size={13} /> Une cellule rouge signale un conflit avec un congé approuvé. La saisie n&apos;est effective qu&apos;après « Enregistrer la semaine ».
      </p>
    </div>
  );
}