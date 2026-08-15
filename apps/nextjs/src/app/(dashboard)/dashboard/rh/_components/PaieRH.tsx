"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { BadgeCheck, Banknote, CalendarClock, Check, FileText, Plus, Settings2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const TABS = [
  { id: "periodes", label: "Périodes & préparation", icon: CalendarClock },
  { id: "bulletins", label: "Bulletins", icon: FileText },
  { id: "config", label: "Configuration", icon: Settings2 },
] as const;
type TabId = (typeof TABS)[number]["id"];

const fmtFCFA = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));

const PAY_METHODS: Record<string, string> = {
  especes: "Espèces",
  om: "Orange Money",
  momo: "MTN MoMo",
  virement: "Virement",
};

export default function PaieRH() {
  const [tab, setTab] = useState<TabId>("periodes");
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Paie</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bulletins calculés depuis les présences clôturées — tous les taux viennent de la configuration.
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
        {tab === "periodes" && <PeriodesSection />}
        {tab === "bulletins" && <BulletinsSection />}
        {tab === "config" && <ConfigSection />}
      </div>
    </div>
  );
}

// ─── 1. Périodes & préparation ───
function PeriodesSection() {
  const utils = api.useUtils();
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0]);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const { data: periods } = api.rhPayroll.listPeriods.useQuery();

  const open = api.rhPayroll.openPeriod.useMutation({
    onSuccess: (p) => {
      toast.success("Période ouverte");
      setPeriodId(p.id);
      utils.rhPayroll.listPeriods.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const prepare = api.rhPayroll.prepareMonth.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.created} bulletin(s) calculé(s)`);
      utils.rhPayroll.listEntries.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const close = api.rhPayroll.closePeriod.useMutation({
    onSuccess: () => {
      toast.success("Période clôturée");
      utils.rhPayroll.listPeriods.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const list = (periods ?? []) as unknown as Array<{ id: number; startDate: string; endDate: string; status: string }>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Du</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-44" />
        </div>
        <div>
          <Label>Au</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44" />
        </div>
        <Button onClick={() => open.mutate({ startDate, endDate })} disabled={open.isPending}>
          <Plus size={15} /> Ouvrir la période
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border/60 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Périodes de paie
        </div>
        {list.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucune période ouverte.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {list.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {p.startDate} → {p.endDate}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      p.status === "open" ? "bg-warning/10 text-warning-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {p.status === "open" ? "Ouverte" : "Clôturée"}
                    </span>
                  </p>
                </div>
                {p.status === "open" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => prepare.mutate({ periodId: p.id })} disabled={prepare.isPending}>
                      <BadgeCheck size={14} /> Calculer la paie
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => close.mutate({ id: p.id })}>
                      Clôturer
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

// ─── 2. Bulletins ───
function BulletinsSection() {
  const utils = api.useUtils();
  const { data: periods } = api.rhPayroll.listPeriods.useQuery();
  const [periodId, setPeriodId] = useState<number | "">("");
  const { data: entries } = api.rhPayroll.listEntries.useQuery(
    { periodId: periodId ? Number(periodId) : undefined },
    { enabled: true }
  );
  const [detailId, setDetailId] = useState<number | null>(null);
  const [perfBonus, setPerfBonus] = useState("0");
  const [payMethod, setPayMethod] = useState("momo");

  const adjust = api.rhPayroll.adjustEntry.useMutation({
    onSuccess: () => {
      toast.success("Bulletin ajusté (recalculé)");
      utils.rhPayroll.listEntries.invalidate();
      setDetailId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const pay = api.rhPayroll.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Bulletin marqué payé");
      utils.rhPayroll.listEntries.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const periodsList = (periods ?? []) as unknown as Array<{ id: number; startDate: string; endDate: string }>;
  const list = (entries ?? []) as unknown as Array<{
    id: number; employeNom: string; employePrenom: string; matricule: string;
    baseSalary: string; normalHours: string; overtimeHours: string;
    totalEarnings: string; deductions: string; netPay: string; paymentMethod: string; status: string;
  }>;

  return (
    <div className="space-y-4">
      <select value={periodId} onChange={(e) => setPeriodId(e.target.value ? Number(e.target.value) : "")} className="rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none">
        <option value="" className="bg-background">Toutes les périodes</option>
        {periodsList.map((p) => (
          <option key={p.id} value={String(p.id)} className="bg-background">{p.startDate} → {p.endDate}</option>
        ))}
      </select>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Employé</th>
              <th className="px-4 py-2.5 text-right">Base</th>
              <th className="px-4 py-2.5 text-right">Heures</th>
              <th className="px-4 py-2.5 text-right">Gains</th>
              <th className="px-4 py-2.5 text-right">Retenues</th>
              <th className="px-4 py-2.5 text-right">Net</th>
              <th className="px-4 py-2.5">Statut</th>
              <th className="px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {list.map((e) => (
              <tr key={e.id} className="text-sm text-foreground">
                <td className="px-4 py-2">{e.employePrenom} {e.employeNom} <span className="ml-1 font-mono text-[10px] text-muted-foreground">{e.matricule}</span></td>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmtFCFA(e.baseSalary)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{e.normalHours}h{Number(e.overtimeHours) > 0 ? ` +${e.overtimeHours}h HS` : ""}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmtFCFA(e.totalEarnings)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-destructive">-{fmtFCFA(e.deductions)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs font-bold">{fmtFCFA(e.netPay)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    e.status === "paye" ? "bg-success/10 text-success-foreground"
                    : e.status === "valide" ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    {e.status === "paye" ? `Payé (${PAY_METHODS[e.paymentMethod] ?? e.paymentMethod})` : e.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { setDetailId(e.id); setPerfBonus("0"); }}>Détail</Button>
                    {e.status !== "paye" && (
                      <>
                        <select value={payMethod} onChange={(ev) => setPayMethod(ev.target.value)} className="h-7 rounded border border-border bg-accent/30 px-1 text-xs">
                          <option value="momo">MoMo</option>
                          <option value="om">OM</option>
                          <option value="especes">Espèces</option>
                          <option value="virement">Virement</option>
                        </select>
                        <Button size="sm" onClick={() => pay.mutate({ id: e.id, paymentMethod: payMethod as any })}>
                          <Banknote size={13} /> Payer
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun bulletin — ouvrez une période et calculez la paie.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detailId !== null && <DetailBulletin entryId={detailId} perfBonus={perfBonus} setPerfBonus={setPerfBonus} onAdjust={(bonus) => adjust.mutate({ id: detailId, performanceBonus: bonus })} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function DetailBulletin({
  entryId,
  perfBonus,
  setPerfBonus,
  onAdjust,
  onClose,
}: {
  entryId: number;
  perfBonus: string;
  setPerfBonus: (v: string) => void;
  onAdjust: (bonus: number) => void;
  onClose: () => void;
}) {
  const { data } = api.rhPayroll.getEntry.useQuery({ id: entryId });
  if (!data) return null;
  const entry = data as unknown as {
    baseSalary: string; netPay: string; totalEarnings: string; deductions: string;
    status: string; lines: Array<{ itemCode: string; label: string; amount: string; direction: string }>;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Bulletin détaillé</h3>
        <div className="flex items-center gap-2">
          <a
            href={`/api/rh/bulletin-pdf/${entryId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <FileText size={13} /> PDF
          </a>
          <Button size="sm" variant="ghost" onClick={onClose}>Fermer</Button>
        </div>
      </div>
      <div className="mt-3 divide-y divide-border/60 rounded-lg border border-border/60">
        {entry.lines.map((l) => (
          <div key={l.itemCode} className="flex items-center justify-between px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">{l.label}</span>
            <span className={`font-mono text-xs ${l.direction === "retenue" ? "text-destructive" : "text-foreground"}`}>
              {l.direction === "retenue" ? "-" : "+"}{fmtFCFA(l.amount)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-sm font-bold">
          <span>Net à payer</span>
          <span className="font-mono">{fmtFCFA(entry.netPay)}</span>
        </div>
      </div>
      {entry.status !== "paye" && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <Label>Prime de performance (FCFA)</Label>
            <Input type="number" value={perfBonus} onChange={(e) => setPerfBonus(e.target.value)} className="w-36" />
          </div>
          <Button onClick={() => onAdjust(Number(perfBonus) || 0)}>
            <Check size={14} /> Recalculer avec la prime
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── 3. Configuration des éléments ───
function ConfigSection() {
  const utils = api.useUtils();
  const { data: items } = api.rhPayroll.listItemsConfig.useQuery();
  const update = api.rhPayroll.updateItemConfig.useMutation({
    onSuccess: () => {
      toast.success("Élément mis à jour — prochain calcul l'utilisera");
      utils.rhPayroll.listItemsConfig.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const list = (items ?? []) as unknown as Array<{
    id: number; code: string; name: string; type: string; method: string; params: Record<string, unknown> | null; active: boolean;
  }>;

  const setParam = (item: (typeof list)[number], key: string, value: number) => {
    update.mutate({ id: item.id, name: item.name, params: { ...(item.params ?? {}), [key]: value }, active: item.active });
  };
  const toggle = (item: (typeof list)[number]) => {
    update.mutate({ id: item.id, name: item.name, params: item.params ?? {}, active: !item.active });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Tous les taux et formules sont ici — modifiez-les sans toucher au code, le prochain calcul les utilisera.
      </p>
      <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
        {list.map((item) => {
          const params = item.params ?? {};
          const isScale = item.method === "scale";
          const paramEntries = Object.entries(params).filter(([k, v]) => typeof v === "number");
          return (
            <div key={item.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${!item.active ? "opacity-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {item.name}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    item.type === "earning" ? "bg-success/10 text-success-foreground" : "bg-destructive/10 text-destructive"
                  }`}>
                    {item.type === "earning" ? "Gain" : "Retenue"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">Méthode : {item.method}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isScale && (
                  <span className="text-xs text-muted-foreground">
                    Barème progressif : 0-40k (0 %) · 40-120k (10 %) · 120-300k (15 %) · 300-500k (25 %) · &gt;500k (35 %)
                  </span>
                )}
                {paramEntries.map(([k, v]) => (
                  <label key={k} className="flex items-center gap-1 text-xs text-muted-foreground">
                    {k} :
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={Number(v)}
                      onBlur={(e) => setParam(item, k, Number(e.target.value))}
                      className="h-7 w-20"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase transition-colors ${
                    item.active ? "bg-success/10 text-success-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {item.active ? "Actif" : "Inactif"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
