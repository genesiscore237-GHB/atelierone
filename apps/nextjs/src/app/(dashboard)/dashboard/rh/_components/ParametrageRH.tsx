"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  CalendarDays,
  Check,
  Clock,
  Cog,
  Gavel,
  Plus,
  Save,
  Settings2,
  Trash2,
  Umbrella,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";

const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

type CycleDraft = {
  id?: number;
  name: string;
  description: string;
  isDefault: boolean;
  schedules: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    breakStart: string;
    breakEnd: string;
    expectedHours: string;
    isWorkingDay: boolean;
  }[];
};

const emptySchedules = () =>
  DAY_NAMES.map((_, day) => ({
    dayOfWeek: day,
    startTime: "08:00",
    endTime: "17:00",
    breakStart: "13:00",
    breakEnd: "14:00",
    expectedHours: "8",
    isWorkingDay: day !== 0,
  }));

const TABS = [
  { id: "cycles", label: "Cycles & horaires", icon: Clock },
  { id: "presence", label: "Présence", icon: Settings2 },
  { id: "conges", label: "Types de congés", icon: Umbrella },
  { id: "sanctions", label: "Types de sanctions", icon: Gavel },
  { id: "feries", label: "Jours fériés", icon: CalendarDays },
  { id: "general", label: "Général", icon: Cog },
] as const;

type TabId = (typeof TABS)[number]["id"];

type RhSettingsData = NonNullable<ReturnType<typeof api.rhSettings.getAll.useQuery>["data"]>;

// Type local de sécurité (l'inférence tRPC du router est dégradée par le
// schéma drizzle typé `any` — voir TS7022 préexistants)
interface RhSettingsUI {
  cycles: Array<{
    id: number;
    name: string;
    description: string | null;
    isDefault: boolean;
    active: boolean;
    schedules: Array<{
      id: number;
      cycleId: number;
      dayOfWeek: number;
      startTime: string | null;
      endTime: string | null;
      breakStart: string | null;
      breakEnd: string | null;
      expectedHours: string | null;
      isWorkingDay: boolean;
    }>;
  }>;
  attendance: {
    id: number;
    lateToleranceMinutes: number | null;
    roundToMinutes: number | null;
    autoDeductBreak: boolean | null;
    countEarlyArrival: boolean | null;
    maxNormalHoursPerDay: string | null;
  } | null;
  leaveTypes: Array<{
    id: number;
    code: string;
    name: string;
    isPaid: boolean | null;
    deductBalance: boolean | null;
    requiresDocument: boolean | null;
    color: string | null;
    active: boolean | null;
  }>;
  sanctionTypes: Array<{
    id: number;
    code: string;
    name: string;
    severityLevel: number | null;
    active: boolean | null;
  }>;
  holidays: Array<{
    id: number;
    date: string;
    name: string;
    isRecurringYearly: boolean | null;
  }>;
  general: {
    id: number;
    employeeCodePrefix: string | null;
    employeeCodeSequence: number | null;
    timezone: string | null;
    currency: string | null;
    evaluationEnabled: boolean | null;
    evaluationFrequency: string | null;
  } | null;
}

export default function ParametrageRH() {
  const utils = api.useUtils();
  const query = api.rhSettings.getAll.useQuery();
  const data = query.data as unknown as RhSettingsUI | undefined;
  const { isLoading, isError, refetch } = query;
  const [tab, setTab] = useState<TabId>("cycles");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="font-semibold text-destructive">Impossible de charger le paramétrage RH.</p>
        <p className="mt-1 text-sm text-muted-foreground">Vérifiez votre connexion puis réessayez.</p>
        <Button className="mt-4" onClick={() => refetch()}>Réessayer</Button>
      </div>
    );
  }

  const invalidate = () => utils.rhSettings.getAll.invalidate();

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Paramétrage RH</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Horaires, tolérances, congés, sanctions — tout est configurable, rien n&apos;est codé en dur.
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
        {tab === "cycles" && <CyclesSection data={data} invalidate={invalidate} />}
        {tab === "presence" && <PresenceSection data={data} invalidate={invalidate} />}
        {tab === "conges" && <LeaveTypesSection data={data} invalidate={invalidate} />}
        {tab === "sanctions" && <SanctionsSection data={data} invalidate={invalidate} />}
        {tab === "feries" && <HolidaysSection data={data} invalidate={invalidate} />}
        {tab === "general" && <GeneralSection data={data} invalidate={invalidate} />}
      </div>
    </div>
  );
}

// ─── 1. Cycles & horaires ───
function CyclesSection({
  data,
  invalidate,
}: {
  data: RhSettingsUI;
  invalidate: () => void;
}) {
  const [editing, setEditing] = useState<CycleDraft | null>(null);

  const createMutation = api.rhSettings.createCycle.useMutation({
    onSuccess: () => {
      toast.success("Cycle créé");
      invalidate();
      setEditing(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = api.rhSettings.updateCycle.useMutation({
    onSuccess: () => {
      toast.success("Cycle mis à jour");
      invalidate();
      setEditing(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = api.rhSettings.deleteCycle.useMutation({
    onSuccess: () => {
      toast.success("Cycle supprimé");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const save = () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("Le nom du cycle est requis");
      return;
    }
    if (editing.id) {
      updateMutation.mutate({ id: editing.id, ...editing });
    } else {
      createMutation.mutate(editing);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
          Cycles de travail
        </h2>
        <Button size="sm" onClick={() => setEditing({ name: "", description: "", isDefault: data.cycles.length === 0, schedules: emptySchedules() })}>
          <Plus size={15} /> Nouveau cycle
        </Button>
      </div>

      <div className="space-y-2">
        {data.cycles.map((cycle) => (
          <div
            key={cycle.id}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {cycle.name}
                {cycle.isDefault && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                    Défaut
                  </span>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {cycle.description || `${cycle.schedules.filter((s) => s.isWorkingDay).length} jours ouvrés`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setEditing({
                    id: cycle.id,
                    name: cycle.name,
                    description: cycle.description ?? "",
                    isDefault: cycle.isDefault,
                    schedules: cycle.schedules.length
                      ? cycle.schedules.map((s) => ({
                          dayOfWeek: s.dayOfWeek,
                          startTime: (s.startTime ?? "08:00").slice(0, 5),
                          endTime: (s.endTime ?? "17:00").slice(0, 5),
                          breakStart: (s.breakStart ?? "").slice(0, 5),
                          breakEnd: (s.breakEnd ?? "").slice(0, 5),
                          expectedHours: s.expectedHours ?? "8",
                          isWorkingDay: s.isWorkingDay,
                        }))
                      : emptySchedules(),
                  })
                }
              >
                Modifier
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (window.confirm(`Supprimer le cycle « ${cycle.name} » ?`)) {
                    deleteMutation.mutate({ id: cycle.id });
                  }
                }}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
        ))}
        {data.cycles.length === 0 && (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Aucun cycle — créez le premier.
          </p>
        )}
      </div>

      {editing && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold text-foreground">
            {editing.id ? "Modifier le cycle" : "Nouveau cycle"}
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cycle-name">Nom du cycle</Label>
              <Input
                id="cycle-name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Ex. Atelier Standard"
              />
            </div>
            <div>
              <Label htmlFor="cycle-desc">Description</Label>
              <Input
                id="cycle-desc"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Ex. Lun–Ven 7h30-18h"
              />
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Horaires de la semaine
            </p>
            {editing.schedules.map((s, i) => (
              <div
                key={s.dayOfWeek}
                className={`grid grid-cols-2 items-end gap-3 rounded-lg border border-border/60 p-3 sm:grid-cols-7 ${
                  !s.isWorkingDay ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-2 sm:col-span-1">
                  <input
                    type="checkbox"
                    checked={s.isWorkingDay}
                    onChange={(e) => {
                      const schedules = [...editing.schedules];
                      schedules[i] = { ...s, isWorkingDay: e.target.checked };
                      setEditing({ ...editing, schedules });
                    }}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <span className="text-sm font-medium text-foreground">{DAY_NAMES[s.dayOfWeek]}</span>
                </div>
                {s.isWorkingDay ? (
                  <>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Début</Label>
                      <Input
                        type="time"
                        value={s.startTime}
                        onChange={(e) => {
                          const schedules = [...editing.schedules];
                          schedules[i] = { ...s, startTime: e.target.value };
                          setEditing({ ...editing, schedules });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Fin</Label>
                      <Input
                        type="time"
                        value={s.endTime}
                        onChange={(e) => {
                          const schedules = [...editing.schedules];
                          schedules[i] = { ...s, endTime: e.target.value };
                          setEditing({ ...editing, schedules });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Pause début</Label>
                      <Input
                        type="time"
                        value={s.breakStart}
                        onChange={(e) => {
                          const schedules = [...editing.schedules];
                          schedules[i] = { ...s, breakStart: e.target.value };
                          setEditing({ ...editing, schedules });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Pause fin</Label>
                      <Input
                        type="time"
                        value={s.breakEnd}
                        onChange={(e) => {
                          const schedules = [...editing.schedules];
                          schedules[i] = { ...s, breakEnd: e.target.value };
                          setEditing({ ...editing, schedules });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Heures attendues</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={s.expectedHours}
                        onChange={(e) => {
                          const schedules = [...editing.schedules];
                          schedules[i] = { ...s, expectedHours: e.target.value };
                          setEditing({ ...editing, schedules });
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground sm:col-span-6">Jour non travaillé</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={editing.isDefault}
                onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })}
                className="size-4 accent-[var(--primary)]"
              />
              Cycle par défaut
            </label>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button onClick={save} disabled={createMutation.isPending || updateMutation.isPending}>
                <Save size={15} /> Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 2. Paramètres de présence ───
function PresenceSection({
  data,
  invalidate,
}: {
  data: RhSettingsUI;
  invalidate: () => void;
}) {
  const att = data.attendance;
  const [form, setForm] = useState({
    lateToleranceMinutes: att?.lateToleranceMinutes ?? 5,
    roundToMinutes: att?.roundToMinutes ?? 5,
    autoDeductBreak: att?.autoDeductBreak ?? true,
    countEarlyArrival: att?.countEarlyArrival ?? false,
    maxNormalHoursPerDay: att?.maxNormalHoursPerDay ?? "8",
  });

  useEffect(() => {
    if (!att) return;
    setForm({
      lateToleranceMinutes: att.lateToleranceMinutes ?? 5,
      roundToMinutes: att.roundToMinutes ?? 5,
      autoDeductBreak: att.autoDeductBreak ?? true,
      countEarlyArrival: att.countEarlyArrival ?? false,
      maxNormalHoursPerDay: att.maxNormalHoursPerDay ?? "8",
    });
  }, [att]);

  const mutation = api.rhSettings.updateAttendanceSettings.useMutation({
    onSuccess: () => {
      toast.success("Paramètres de présence enregistrés");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
        Règles de présence
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="tolerance">Tolérance de retard (minutes)</Label>
          <Input
            id="tolerance"
            type="number"
            min={0}
            value={form.lateToleranceMinutes}
            onChange={(e) => set({ lateToleranceMinutes: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="round">Arrondi des heures (minutes)</Label>
          <Input
            id="round"
            type="number"
            min={0}
            max={60}
            value={form.roundToMinutes}
            onChange={(e) => set({ roundToMinutes: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="maxhours">Plafond d&apos;heures normales / jour</Label>
          <Input
            id="maxhours"
            type="number"
            step="0.5"
            value={form.maxNormalHoursPerDay}
            onChange={(e) => set({ maxNormalHoursPerDay: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        {[
          { key: "autoDeductBreak" as const, label: "Déduire automatiquement la pause" },
          { key: "countEarlyArrival" as const, label: "Compter l'arrivée anticipée" },
        ].map((opt) => (
          <label key={opt.key} className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form[opt.key]}
              onChange={(e) => set({ [opt.key]: e.target.checked } as Partial<typeof form>)}
              className="size-4 accent-[var(--primary)]"
            />
            {opt.label}
          </label>
        ))}
      </div>
      <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
        <Save size={15} /> Enregistrer
      </Button>
    </div>
  );
}

// ─── 3. Types de congés ───
function LeaveTypesSection({
  data,
  invalidate,
}: {
  data: RhSettingsUI;
  invalidate: () => void;
}) {
  const [draft, setDraft] = useState<{
    id?: number;
    code: string;
    name: string;
    isPaid: boolean;
    deductBalance: boolean;
    requiresDocument: boolean;
    color: string;
    active: boolean;
  } | null>(null);

  const createMutation = api.rhSettings.createLeaveType.useMutation({
    onSuccess: () => { toast.success("Type de congé créé"); invalidate(); setDraft(null); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = api.rhSettings.updateLeaveType.useMutation({
    onSuccess: () => { toast.success("Type de congé mis à jour"); invalidate(); setDraft(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = api.rhSettings.deleteLeaveType.useMutation({
    onSuccess: () => { toast.success("Type de congé supprimé"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.code.trim()) {
      toast.error("Code et nom sont requis");
      return;
    }
    if (draft.id) updateMutation.mutate(draft);
    else createMutation.mutate(draft);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
          Types de congés / absences
        </h2>
        <Button size="sm" onClick={() => setDraft({ code: "", name: "", isPaid: true, deductBalance: true, requiresDocument: false, color: "#6366f1", active: true })}>
          <Plus size={15} /> Ajouter
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.leaveTypes.map((lt) => (
          <div key={lt.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: lt.color }} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{lt.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {lt.isPaid ? "Payé" : "Non payé"} · {lt.deductBalance ? "décompte solde" : "sans décompte"}
                  {lt.requiresDocument ? " · justificatif requis" : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => setDraft({ id: lt.id, code: lt.code, name: lt.name, isPaid: lt.isPaid, deductBalance: lt.deductBalance, requiresDocument: lt.requiresDocument, color: lt.color ?? "#6366f1", active: lt.active })}>
                Modifier
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => { if (window.confirm(`Supprimer « ${lt.name} » ?`)) deleteMutation.mutate({ id: lt.id }); }}>
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold text-foreground">{draft.id ? "Modifier" : "Nouveau"} type de congé</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Code</Label>
              <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="CONGE_ANNUEL" />
            </div>
            <div>
              <Label>Nom</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Congé annuel" />
            </div>
            <div>
              <Label>Couleur</Label>
              <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="h-10 w-full cursor-pointer rounded-lg border border-border bg-background" />
            </div>
          </div>
          <div className="space-y-2">
            {[
              { key: "isPaid" as const, label: "Payé" },
              { key: "deductBalance" as const, label: "Décompte du solde" },
              { key: "requiresDocument" as const, label: "Justificatif obligatoire" },
            ].map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={draft[opt.key]} onChange={(e) => setDraft({ ...draft, [opt.key]: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft(null)}>Annuler</Button>
            <Button onClick={save} disabled={createMutation.isPending || updateMutation.isPending}>
              <Save size={15} /> Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 4. Types de sanctions ───
function SanctionsSection({
  data,
  invalidate,
}: {
  data: RhSettingsUI;
  invalidate: () => void;
}) {
  const [draft, setDraft] = useState<{ id?: number; code: string; name: string; severityLevel: number; active: boolean } | null>(null);

  const createMutation = api.rhSettings.createSanctionType.useMutation({
    onSuccess: () => { toast.success("Type de sanction créé"); invalidate(); setDraft(null); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = api.rhSettings.updateSanctionType.useMutation({
    onSuccess: () => { toast.success("Type de sanction mis à jour"); invalidate(); setDraft(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = api.rhSettings.deleteSanctionType.useMutation({
    onSuccess: () => { toast.success("Type de sanction supprimé"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.code.trim()) { toast.error("Code et nom sont requis"); return; }
    if (draft.id) updateMutation.mutate(draft);
    else createMutation.mutate(draft);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
          Types de sanctions (gravité 1 → 5)
        </h2>
        <Button size="sm" onClick={() => setDraft({ code: "", name: "", severityLevel: 1, active: true })}>
          <Plus size={15} /> Ajouter
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.sanctionTypes.map((st) => (
          <div key={st.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${st.severityLevel >= 4 ? "bg-destructive/15 text-destructive" : st.severityLevel === 3 ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground"}`}>
                {st.severityLevel}
              </span>
              <p className="truncate text-sm font-semibold text-foreground">{st.name}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => setDraft({ id: st.id, code: st.code, name: st.name, severityLevel: st.severityLevel, active: st.active })}>
                Modifier
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => { if (window.confirm(`Supprimer « ${st.name} » ?`)) deleteMutation.mutate({ id: st.id }); }}>
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold text-foreground">{draft.id ? "Modifier" : "Nouveau"} type de sanction</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label>Code</Label>
              <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="AVERT_ECRIT" />
            </div>
            <div>
              <Label>Nom</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Avertissement écrit" />
            </div>
            <div>
              <Label>Gravité (1-5)</Label>
              <Input type="number" min={1} max={5} value={draft.severityLevel} onChange={(e) => setDraft({ ...draft, severityLevel: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft(null)}>Annuler</Button>
            <Button onClick={save} disabled={createMutation.isPending || updateMutation.isPending}>
              <Save size={15} /> Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 5. Jours fériés ───
function HolidaysSection({
  data,
  invalidate,
}: {
  data: RhSettingsUI;
  invalidate: () => void;
}) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [recurring, setRecurring] = useState(true);

  const addMutation = api.rhSettings.addHoliday.useMutation({
    onSuccess: () => { toast.success("Jour férié ajouté"); invalidate(); setDate(""); setName(""); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = api.rhSettings.deleteHoliday.useMutation({
    onSuccess: () => { toast.success("Jour férié supprimé"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
        Calendrier des jours fériés
      </h2>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="hol-date">Date</Label>
            <Input id="hol-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="hol-name">Nom</Label>
            <Input id="hol-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Fête Nationale" />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!date || !name.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate({ date, name: name.trim(), isRecurringYearly: recurring })}
            >
              <Plus size={15} /> Ajouter
            </Button>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          Récurrent chaque année
        </label>
      </div>

      <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
        {data.holidays.map((h) => (
          <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3">
              <CalendarDays size={15} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{h.name}</span>
              <span className="text-xs text-muted-foreground">
                {h.date} {h.isRecurringYearly ? "· récurrent" : ""}
              </span>
            </div>
            <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => { if (window.confirm(`Supprimer « ${h.name} » ?`)) deleteMutation.mutate({ id: h.id }); }}>
              <Trash2 size={15} />
            </Button>
          </div>
        ))}
        {data.holidays.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucun jour férié enregistré.</p>
        )}
      </div>
    </div>
  );
}

// ─── 6. Paramètres généraux ───
function GeneralSection({
  data,
  invalidate,
}: {
  data: RhSettingsUI;
  invalidate: () => void;
}) {
  const g = data.general;
  const [form, setForm] = useState({
    employeeCodePrefix: g?.employeeCodePrefix ?? "GPJ",
    employeeCodeSequence: g?.employeeCodeSequence ?? 0,
    timezone: g?.timezone ?? "Africa/Douala",
    currency: g?.currency ?? "XAF",
    evaluationEnabled: g?.evaluationEnabled ?? true,
    evaluationFrequency: g?.evaluationFrequency ?? "trimestrielle",
  });

  useEffect(() => {
    if (!g) return;
    setForm({
      employeeCodePrefix: g.employeeCodePrefix ?? "GPJ",
      employeeCodeSequence: g.employeeCodeSequence ?? 0,
      timezone: g.timezone ?? "Africa/Douala",
      currency: g.currency ?? "XAF",
      evaluationEnabled: g.evaluationEnabled ?? true,
      evaluationFrequency: g.evaluationFrequency ?? "trimestrielle",
    });
  }, [g]);

  const mutation = api.rhSettings.updateGeneralSettings.useMutation({
    onSuccess: () => { toast.success("Paramètres généraux enregistrés"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
        Paramètres généraux RH
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="prefix">Préfixe matricule</Label>
          <Input id="prefix" value={form.employeeCodePrefix} onChange={(e) => setForm({ ...form, employeeCodePrefix: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="seq">Prochaine séquence matricule</Label>
          <Input id="seq" type="number" value={form.employeeCodeSequence} onChange={(e) => setForm({ ...form, employeeCodeSequence: Number(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="tz">Fuseau horaire</Label>
          <Input id="tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cur">Devise</Label>
          <Input id="cur" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="freq">Fréquence d&apos;évaluation par défaut</Label>
          <select
            id="freq"
            value={form.evaluationFrequency}
            onChange={(e) => setForm({ ...form, evaluationFrequency: e.target.value })}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="mensuelle">Mensuelle</option>
            <option value="trimestrielle">Trimestrielle</option>
            <option value="semestrielle">Semestrielle</option>
            <option value="annuelle">Annuelle</option>
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={form.evaluationEnabled} onChange={(e) => setForm({ ...form, evaluationEnabled: e.target.checked })} className="size-4 accent-[var(--primary)]" />
        Module d&apos;évaluation & performance activé
      </label>
      <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
        <Save size={15} /> Enregistrer
      </Button>
    </div>
  );
}




