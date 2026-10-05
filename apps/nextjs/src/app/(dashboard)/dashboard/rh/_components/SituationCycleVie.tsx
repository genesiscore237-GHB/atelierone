"use client";

// R6 — Cycle de vie RH : situations datées de l'employé (création + workflow + journal).
// Statistut administratif court piloté : conge/suspendu ne se saisissent plus manuellement.

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  FileWarning,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { usePermissions } from "~/hooks/usePermissions";

const CATEGORIES: Record<string, { label: string; cls: string }> = {
  ABSENCE: { label: "Absence", cls: "bg-muted text-muted-foreground border-border" },
  CONGE: { label: "Congé", cls: "bg-sky-500/10 text-sky-600 border-sky-500/30" },
  MALADIE: { label: "Maladie", cls: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  ACCIDENT_TRAVAIL: { label: "Accident de travail", cls: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  MATERNITE: { label: "Maternité", cls: "bg-pink-500/10 text-pink-600 border-pink-500/30" },
  DISCIPLINAIRE: { label: "Disciplinaire", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  SUSPENSION: { label: "Suspension", cls: "bg-purple-500/10 text-purple-600 border-purple-500/30" },
  SORTIE: { label: "Sortie", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  AUTRE: { label: "Autre", cls: "bg-muted text-foreground border-border" },
};

const WORKFLOW: Record<string, { label: string; cls: string }> = {
  BROUILLON: { label: "Brouillon", cls: "bg-muted text-muted-foreground border-border" },
  SOUMIS: { label: "Soumis", cls: "bg-sky-500/10 text-sky-600 border-sky-500/30" },
  EN_ATTENTE: { label: "En attente", cls: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  APPROUVE: { label: "Approuvé", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  ACTIF: { label: "Actif", cls: "bg-success/10 text-success-foreground border-success/40" },
  REFUSE: { label: "Refusé", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  TERMINE: { label: "Terminé", cls: "bg-muted text-muted-foreground border-border" },
  ANNULE: { label: "Annulé", cls: "bg-destructive/10 text-destructive/70 border-destructive/20" },
};

const PAE: Record<string, string> = {
  NORMAL: "Paie normale",
  MAINTIEN_REMUNERATION: "Maintien rémunération",
  RETENUE: "Retenue",
  NON_REMUNERE: "Non rémunéré",
  PARTIEL: "Partiel",
  INDEMNISATION_EXTERNE: "Indemnisation externe",
  A_DETERMINER: "À déterminer",
  MANUEL: "Manuel",
};

const CONTRA: Record<string, string> = {
  ACTIVE: "Contrat actif",
  SUSPENDU: "Contrat suspendu",
  TERMINE: "Contrat terminé",
};

type Sit = {
  id: number;
  category: string;
  type: string;
  subType?: string | null;
  dateDebut: string;
  dateFin?: string | null;
  dateEffet?: string | null;
  dureeJours?: number | null;
  motif?: string | null;
  notificationEcrite?: boolean;
  communicationInspection?: boolean;
  impactContrat: string;
  impactPresence: string;
  impactPlanning: string;
  impactPaie: string;
  anomalie?: string | null;
  statutWorkflow: string;
};

type TypeRow = {
  id: number;
  category: string;
  type: string;
  name: string;
  approbationRequise: boolean;
  dureeMaxJours?: number | null;
  impactPaie: string;
  notificationEcriteRequise: boolean;
  communicationInspectionRequise: boolean;
  source?: string | null;
  baseJuridique?: string | null;
};

export function SituationCycleVie({ employeeId, onChanged }: { employeeId: number; onChanged?: () => void }) {
  const { hasPermission } = usePermissions();
  const canModifier = hasPermission("rh.situation.modifier");
  const utils = api.useUtils();

  const { data: typesRaw, isLoading: typesLoading } = api.rhSituations.listTypes.useQuery();
  const types = (typesRaw ?? []) as TypeRow[];
  const { data: situationsRaw, isLoading, error, refetch } = api.rhSituations.list.useQuery({ employeeId });
  const situations = (situationsRaw ?? []) as Sit[];

  const invalidate = () => {
    utils.rhSituations.list.invalidate({ employeeId });
    utils.rhSituations.list.invalidate();
    utils.rh.getFiche.invalidate();
    utils.rh.list.invalidate();
    refetch();
    onChanged?.();
  };

  const { mutate: creer, isPending: creation } = api.rhSituations.create.useMutation({
    onSuccess: () => {
      toast.success("Situation enregistrée");
      setOpen(false);
      reinit();
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const { mutate: action } = api.rhSituations.soumettre.useMutation({
    onError: (err) => toast.error(err.message),
    onSuccess: () => invalidate(),
  });
  const { mutate: approuver, isPending: enApprobation } = api.rhSituations.approuver.useMutation({
    onError: (err) => toast.error(err.message),
    onSuccess: () => invalidate(),
  });
  const { mutate: activer } = api.rhSituations.activer.useMutation({
    onError: (err) => toast.error(err.message),
    onSuccess: () => invalidate(),
  });
  const { mutate: terminer } = api.rhSituations.terminer.useMutation({ onError: (err) => toast.error(err.message), onSuccess: () => invalidate() });
  const { mutate: refuser, isPending: enRefus } = api.rhSituations.refuser.useMutation({
    onError: (err) => toast.error(err.message),
    onSuccess: () => invalidate(),
  });
  const { mutate: annuler } = api.rhSituations.annuler.useMutation({ onError: (err) => toast.error(err.message), onSuccess: () => invalidate() });

  const [open, setOpen] = useState(false);
  const [situationTypeId, setSituationTypeId] = useState<number | "">("");
  const [dateDebut, setDateDebut] = useState(() => new Date().toISOString().split("T")[0]);
  const [dateFin, setDateFin] = useState("");
  const [dureeJours, setDureeJours] = useState("");
  const [montantRetenue, setMontantRetenue] = useState("");
  const [notificationEcrite, setNotificationEcrite] = useState(false);
  const [communicationInspection, setCommunicationInspection] = useState(false);
  const [motif, setMotif] = useState("");
  const [statut, setStatut] = useState<"SOUMIS" | "BROUILLON">("SOUMIS");
  const [confirm, setConfirm] = useState<{ sit: Sit; action: "annuler" | "terminer" | "refuser" } | null>(null);
  const [refusMotif, setRefusMotif] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const typesParCategorie = useMemo(() => {
    const groups = new Map<string, { id: number; type: string; name: string; approbationRequise: boolean; dureeMaxJours?: number | null; impactPaie: string; notificationEcriteRequise: boolean; communicationInspectionRequise: boolean; source?: string | null }[]>();
    for (const t of types ?? []) {
      const arr = groups.get(t.category) ?? [];
      arr.push(t);
      groups.set(t.category, arr);
    }
    return groups;
  }, [types]);

  const reinit = () => {
    setSituationTypeId("");
    setDateDebut(new Date().toISOString().split("T")[0]);
    setDateFin("");
    setDureeJours("");
    setMontantRetenue("");
    setNotificationEcrite(false);
    setCommunicationInspection(false);
    setMotif("");
    setStatut("SOUMIS");
  };

  const enregistrer = () => {
    if (!situationTypeId) {
      toast.error("Choisissez le type de situation dans le catalogue");
      return;
    }
    const t = types?.find((x) => x.id === situationTypeId);
    if (!t) return;

    if (t.dureeMaxJours && dureeJours && Number(dureeJours) > t.dureeMaxJours) {
      toast.error(`Durée maximale pour cette situation : ${t.dureeMaxJours} jour(s).`);
      return;
    }
    if (dateFin && dateFin < dateDebut) {
      toast.error("La date de fin doit suivre la date de début.");
      return;
    }

    creer({
      employeeId,
      situationTypeId: t.id,
      category: t.category,
      type: t.type,
      dateDebut,
      dateFin: dateFin || undefined,
      dureeJours: dureeJours ? Number(dureeJours) : undefined,
      montantRetenue: montantRetenue !== "" ? Number(montantRetenue) : undefined,
      notificationEcrite: t.notificationEcriteRequise ? notificationEcrite : undefined,
      communicationInspection: t.communicationInspectionRequise ? communicationInspection : undefined,
      motif: motif.trim() || undefined,
      statutWorkflow: statut,
    });
  };

  const typeSelect = situationTypeId ? types?.find((x) => x.id === situationTypeId) : null;

  return (
    <section className="rounded-xl border border-border bg-accent/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary uppercase">
          <Activity size={14} /> Cycle de vie — situations RH
        </h3>
        <div className="flex gap-2">
          {canModifier && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-foreground hover:bg-primary/90"
            >
              {open ? <X size={13} /> : <Plus size={13} />} {open ? "Fermer" : "Nouvelle situation"}
            </button>
          )}
          <button
            onClick={() => void refetch()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-accent/30"
          >
            <RefreshCw size={13} /> Actualiser
          </button>
        </div>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Absences constatées, mises à pied, congés, maladies… se tracent ici et s&apos;activent via un circuit
        validé. C&apos;est ce cycle qui pilote contrat, présence et paie.
      </p>

      {open && (
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          <h4 className="mb-3 text-xs font-black text-foreground">Nouvelle situation</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="md:col-span-3">
              <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Type *</label>
              {typesLoading ? (
                <div className="h-9 rounded-lg bg-muted animate-pulse" />
              ) : (
                <select
                  value={situationTypeId}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : "";
                    setSituationTypeId(id);
                    const t = types?.find((x) => x.id === id);
                    if (t) {
                      setNotificationEcrite(!!t.notificationEcriteRequise);
                      setCommunicationInspection(!!t.communicationInspectionRequise);
                    }
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Choisir le type…</option>
                  {[...typesParCategorie.entries()].map(([cat, arr]) => (
                    <optgroup key={cat} label={CATEGORIES[cat]?.label ?? cat}>
                      {arr.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.impactPaie === "MAINTIEN_REMUNERATION" ? "rémunéré" : PAE[t.impactPaie]?.toLowerCase() ?? "impact paie à préciser"})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Début *</label>
              <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Fin</label>
              <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                Statut initial {typeSelect?.approbationRequise === false ? "(validation non requise)" : ""}
              </label>
              <select value={statut} onChange={(e) => setStatut(e.target.value as "SOUMIS" | "BROUILLON")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="SOUMIS">Soumis</option>
                <option value="BROUILLON">Brouillon</option>
              </select>
            </div>
            {typeSelect?.dureeMaxJours ? (
              <div>
                <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Durée (max {typeSelect.dureeMaxJours} j)
                </label>
                <input type="number" min={1} max={typeSelect.dureeMaxJours} value={dureeJours} onChange={(e) => setDureeJours(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            ) : null}
            {typeSelect && (typeSelect.impactPaie === "RETENUE" || typeSelect.impactPaie === "PARTIEL" || typeSelect.impactPaie === "A_DETERMINER") ? (
              <div>
                <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Montant retenu (XOF)</label>
                <input type="number" min={0} value={montantRetenue} onChange={(e) => setMontantRetenue(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            ) : null}
            <div className="md:col-span-3">
              <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Motif</label>
              <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} placeholder="Contexte, référence, faits reprochés…" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>

          {typeSelect && (typeSelect.notificationEcriteRequise || typeSelect.communicationInspectionRequise) && (
            <div className="mt-3 flex flex-wrap gap-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <ShieldAlert size={14} className="mt-1 shrink-0 text-amber-600" />
              <div className="flex flex-wrap gap-4">
                {typeSelect.notificationEcriteRequise && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <input type="checkbox" checked={notificationEcrite} onChange={(e) => setNotificationEcrite(e.target.checked)} className="size-4 accent-primary" />
                    Notification écrite faite (art. 30)
                  </label>
                )}
                {typeSelect.communicationInspectionRequise && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <input type="checkbox" checked={communicationInspection} onChange={(e) => setCommunicationInspection(e.target.checked)} className="size-4 accent-primary" />
                    Information de l&apos;inspection du travail
                  </label>
                )}
              </div>
            </div>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => { setOpen(false); reinit(); }} className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-accent/30">Annuler</button>
            <button
              onClick={enregistrer}
              disabled={creation || !situationTypeId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creation ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((s) => <div key={s} className="h-12 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-4 text-sm text-destructive">
          <AlertTriangle size={14} /> {error.message}
        </div>
      ) : !situations || situations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          Aucune situation enregistrée. {canModifier ? "Créez la première situation ci-dessus." : "Le cycle de vie de cet employé est vide."}
        </div>
      ) : (
        <div className="space-y-2">
          {situations.map((s) => {
            const wf = WORKFLOW[s.statutWorkflow] ?? { label: s.statutWorkflow, cls: "bg-muted text-muted-foreground border-border" };
            return (
              <div key={s.id} className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                    className="flex min-h-8 items-center gap-1 text-muted-foreground hover:text-foreground"
                    title="Journal des transitions"
                  >
                    {expanded === s.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${CATEGORIES[s.category]?.cls ?? "bg-muted"}`}>
                    {CATEGORIES[s.category]?.label ?? s.category}
                  </span>
                  <span className="text-xs font-black text-foreground">{s.type}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {s.dateDebut}
                    {s.dateFin ? ` → ${s.dateFin}` : s.statutWorkflow === "ACTIF" ? " → en cours" : ""}
                    {s.dureeJours ? ` · ${s.dureeJours} j` : ""}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${wf.cls}`}>{wf.label}</span>
                  <span className="hidden text-[10px] text-muted-foreground md:inline">{CONTRA[s.impactContrat] ?? s.impactContrat} · {PAE[s.impactPaie] ?? s.impactPaie}</span>
                  {s.anomalie && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                      <FileWarning size={11} /> Conflit
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {canModifier && s.statutWorkflow === "BROUILLON" && (
                      <button onClick={() => { action({ id: s.id }); }} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-accent/30">
                        <Send size={11} /> Soumettre
                      </button>
                    )}
                    {canModifier && ["SOUMIS", "EN_ATTENTE"].includes(s.statutWorkflow) && (
                      <button onClick={() => { approuver({ id: s.id }); }} disabled={enApprobation} className="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-[10px] font-bold text-success-foreground hover:bg-success/20">
                        <CheckCircle2 size={11} /> Approuver
                      </button>
                    )}
                    {canModifier && s.statutWorkflow === "APPROUVE" && (
                      <button onClick={() => { activer({ id: s.id }); }} className="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-[10px] font-bold text-success-foreground hover:bg-success/20">
                        <Activity size={11} /> Activer
                      </button>
                    )}
                    {canModifier && s.statutWorkflow === "ACTIF" && (
                      <button onClick={() => setConfirm({ sit: s, action: "terminer" })} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-accent/30">
                        Terminer
                      </button>
                    )}
                    {canModifier && ["SOUMIS", "EN_ATTENTE", "APPROUVE"].includes(s.statutWorkflow) && (
                      <button onClick={() => setConfirm({ sit: s, action: "refuser" })} className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[10px] font-bold text-destructive hover:bg-destructive/15">
                        <X size={11} /> Refuser
                      </button>
                    )}
                    {canModifier && ["BROUILLON", "SOUMIS", "EN_ATTENTE", "APPROUVE", "ACTIF"].includes(s.statutWorkflow) && (
                      <button onClick={() => setConfirm({ sit: s, action: "annuler" })} className="inline-flex items-center gap-1 rounded-md border border-destructive/20 px-2 py-1 text-[10px] font-bold text-destructive/70 hover:bg-destructive/10">
                        Annuler
                      </button>
                    )}
                  </div>
                </div>
                {s.motif ? <p className="mt-1 pl-7 text-xs text-muted-foreground">{s.motif}</p> : null}
                {expanded === s.id && <SituationJournal situationId={s.id} />}
              </div>
            );
          })}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h4 className="text-sm font-black text-foreground">
              {confirm.action === "terminer" ? "Terminer la situation" : confirm.action === "refuser" ? "Refuser la situation" : "Annuler la situation"}
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {confirm.sit.type} — {confirm.sit.dateDebut}
              {confirm.sit.dateFin ? ` → ${confirm.sit.dateFin}` : ""}
            </p>
            {confirm.action === "refuser" && (
              <textarea
                value={refusMotif}
                onChange={(e) => setRefusMotif(e.target.value)}
                rows={3}
                placeholder="Motif du refus (obligatoire)…"
                className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-accent/30">Retour</button>
              <button
                onClick={() => {
                  if (confirm.action === "refuser" && !refusMotif.trim()) {
                    toast.error("Le motif de refus est obligatoire.");
                    return;
                  }
                  if (confirm.action === "refuser") refuser({ id: confirm.sit.id, rejectionReason: refusMotif.trim() });
                  else if (confirm.action === "terminer") terminer({ id: confirm.sit.id });
                  else annuler({ id: confirm.sit.id });
                  setConfirm(null);
                  setRefusMotif("");
                }}
                disabled={enRefus}
                className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-white hover:bg-destructive/90 disabled:opacity-50"
              >
                {enRefus ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SituationJournal({ situationId }: { situationId: number }) {
  const { data, isLoading } = api.rhSituations.listTransitions.useQuery({ situationId });
  if (isLoading) return <div className="mt-2 h-8 animate-pulse rounded bg-muted" />;
  if (!data || data.length === 0) return <p className="mt-2 pl-7 text-xs text-muted-foreground">Aucune transition.</p>;
  return (
    <div className="mt-2 space-y-1 border-l border-border pl-7">
      {data.map((t) => (
        <div key={t.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <CircleDollarSign size={11} className="shrink-0 text-muted-foreground/50" />
          <span className="capitalize">{t.fromStatus ?? "—"}</span>
          <span>→</span>
          <span className="font-bold text-foreground">{t.toStatus}</span>
          <span className="truncate">{t.justification ? `· ${t.justification}` : ""}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px]">{t.createdAt ? new Date(t.createdAt).toLocaleString("fr-FR") : ""}</span>
        </div>
      ))}
    </div>
  );
}