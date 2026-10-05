"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { useEmployeFromUrl } from "~/hooks/useEmployeFromUrl";
import { Check, ClipboardList, History, Plus, Settings2, Star, Target } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ConfirmationDialog } from "~/components/ui/confirmation-dialog";
import { usePermissions } from "~/hooks/usePermissions";
import HistoriqueDialog from "./HistoriqueDialog";

const TABS = [
  { id: "grilles", label: "Grilles", icon: Settings2 },
  { id: "campagnes", label: "Campagnes & saisie", icon: Target },
  { id: "historique", label: "Historique", icon: ClipboardList },
  { id: "bareme", label: "Barème de prime", icon: Star },
] as const;
type TabId = (typeof TABS)[number]["id"];

const fmtXOF = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));

export default function EvaluationsRH() {
  const [tab, setTab] = useState<TabId>("grilles");
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Évaluation & Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grilles par poste, campagnes, notes pondérées et prime de performance.
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
        {tab === "grilles" && <GrillesSection />}
        {tab === "campagnes" && <CampagnesSection />}
        {tab === "historique" && <HistoriqueSection />}
        {tab === "bareme" && <BaremeSection />}
      </div>
    </div>
  );
}

// ─── 1. Grilles & critères ───
function GrillesSection() {
  const utils = api.useUtils();
  const { data: grids } = api.rhEvaluation.listGrids.useQuery();
  const [draft, setDraft] = useState<{ name: string; criteria: Array<{ name: string; weight: string }> } | null>(null);
  const [confirmDel, setConfirmDel] = useState<null | { message: string; run: () => void }>(null);

  const create = api.rhEvaluation.createGrid.useMutation({
    onSuccess: () => { toast.success("Grille créée"); utils.rhEvaluation.listGrids.invalidate(); setDraft(null); },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.rhEvaluation.deleteGrid.useMutation({
    onSuccess: () => { toast.success("Grille supprimée"); utils.rhEvaluation.listGrids.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const list = (grids ?? []) as unknown as Array<{
    id: number; name: string; scale: string; active: boolean;
    criteria: Array<{ id: number; name: string; weight: string; maxScore: string }>;
  }>;

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim() || draft.criteria.length === 0) { toast.error("Nom et critères requis"); return; }
    const total = draft.criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);
    if (total !== 100) { toast.error(`La somme des pondérations doit être 100 (actuellement ${total})`); return; }
    create.mutate({
      name: draft.name.trim(),
      criteria: draft.criteria.map((c) => ({ name: c.name.trim(), weight: Number(c.weight), maxScore: 5 })),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Grilles d'évaluation</h2>
        <Button size="sm" onClick={() => setDraft({ name: "", criteria: [{ name: "", weight: "50" }, { name: "", weight: "50" }] })}>
          <Plus size={15} /> Nouvelle grille
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {list.map((g) => (
          <div key={g.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">{g.name} <span className="ml-1 text-[10px] text-muted-foreground">échelle {g.scale}</span></p>
              <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmDel({ message: `Supprimer la grille « ${g.name} » ?`, run: () => remove.mutate({ id: g.id }) })}>
                Supprimer
              </Button>
            </div>
            <div className="mt-3 space-y-1">
              {g.criteria.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-sm">
                  <span className="text-foreground">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.weight} %</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Aucune grille — créez la première.
          </p>
        )}
      </div>

      {draft && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold text-foreground">Nouvelle grille</h3>
          <div className="mt-3">
            <Label>Nom de la grille</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex. Technicien" />
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Critères (pondérations en %, total 100)</p>
            {draft.criteria.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={c.name} onChange={(e) => { const criteria = [...draft.criteria]; criteria[i] = { ...c, name: e.target.value }; setDraft({ ...draft, criteria }); }} placeholder="Critère" className="flex-1" />
                <Input type="number" value={c.weight} onChange={(e) => { const criteria = [...draft.criteria]; criteria[i] = { ...c, weight: e.target.value }; setDraft({ ...draft, criteria }); }} className="w-20" />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, criteria: [...draft.criteria, { name: "", weight: "0" }] })}>
              <Plus size={13} /> Ajouter un critère
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(null)}>Annuler</Button>
              <Button size="sm" onClick={save} disabled={create.isPending}>
                <Check size={14} /> Créer
              </Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmationDialog
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel?.run()}
        title="Supprimer la grille"
        description={confirmDel?.message ?? ""}
        confirmText="Supprimer"
        variant="destructive"
      />
    </div>
  );
}

// ─── 2. Campagnes & saisie ───
function CampagnesSection() {
  const utils = api.useUtils();
  const { data: campaigns } = api.rhEvaluation.listCampaigns.useQuery();
  const { data: grids } = api.rhEvaluation.listGrids.useQuery();
  const { data: employees } = api.rh.list.useQuery({ limit: 100, statut: "actif" });
  const { data: evaluations } = api.rhEvaluation.listEvaluations.useQuery();
  const today = new Date().toISOString().split("T")[0];

  const [name, setName] = useState("Campagne " + today);
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);

  const [evalTarget, setEvalTarget] = useState<{ employeeId: number; employeeLabel: string } | null>(null);
  const [gridId, setGridId] = useState("");
  const [scores, setScores] = useState<Record<number, string>>({});
  const [appreciation, setAppreciation] = useState("");
  const [objectives, setObjectives] = useState("");

  const createCampaign = api.rhEvaluation.createCampaign.useMutation({
    onSuccess: () => { toast.success("Campagne lancée"); utils.rhEvaluation.listCampaigns.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const closeCampaign = api.rhEvaluation.closeCampaign.useMutation({
    onSuccess: () => { toast.success("Campagne clôturée"); utils.rhEvaluation.listCampaigns.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const saveEval = api.rhEvaluation.saveEvaluation.useMutation({
    onSuccess: (r) => {
      toast.success(`Évaluation enregistrée — note ${r.globalScore}/5`);
      utils.rhEvaluation.listEvaluations.invalidate();
      setEvalTarget(null);
      setScores({});
    },
    onError: (e) => toast.error(e.message),
  });

  const camps = (campaigns ?? []) as unknown as Array<{ id: number; name: string; periodStart: string; periodEnd: string; status: string }>;
  const gridList = (grids ?? []) as unknown as Array<{ id: number; name: string; criteria: Array<{ id: number; name: string; weight: string; maxScore: string }> }>;
  const emps = (employees?.employees ?? []) as unknown as Array<{ id: number; nom: string; prenom: string }>;
  const evals = (evaluations ?? []) as unknown as Array<{ id: number; campaignId: number; employeeId: number; employeNom: string; employePrenom: string; globalScore: string; appreciation: string | null }>;
  const [campaignId, setCampaignId] = useState<number | null>(null);

  const selectedGrid = gridList.find((g) => g.id === Number(gridId));

  const submitEval = () => {
    if (!evalTarget || !gridId || !campaignId) { toast.error("Campagne, employé et grille requis"); return; }
    const criteria = selectedGrid?.criteria ?? [];
    const payload = criteria.map((c) => ({
      criterionId: c.id,
      score: Number(scores[c.id]) || 0,
    }));
    saveEval.mutate({
      campaignId,
      employeeId: evalTarget.employeeId,
      gridId: Number(gridId),
      scores: payload,
      appreciation: appreciation || undefined,
      objectives: objectives || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Nouvelle campagne</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-3" />
          <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
        <Button className="mt-3" disabled={!name.trim() || createCampaign.isPending} onClick={() => createCampaign.mutate({ name: name.trim(), periodStart, periodEnd })}>
          <Plus size={15} /> Lancer la campagne
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Campagne</th>
              <th className="px-4 py-2.5">Période</th>
              <th className="px-4 py-2.5">Statut</th>
              <th className="px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {camps.map((c) => (
              <tr key={c.id} className="text-sm text-foreground">
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{c.periodStart} → {c.periodEnd}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.status === "ouverte" ? "bg-success/10 text-success-foreground" : "bg-muted text-muted-foreground"}`}>{c.status}</span>
                </td>
                <td className="px-4 py-2">
                  {c.status === "ouverte" && (
                    <div className="flex gap-1">
                      <select
                        value={evalTarget && campaignId === c.id ? String(evalTarget.employeeId) : ""}
                        onChange={(e) => { setCampaignId(c.id); setEvalTarget(e.target.value ? { employeeId: Number(e.target.value), employeeLabel: "" } : null); }}
                        className="h-7 rounded border border-border bg-accent/30 px-1 text-xs"
                      >
                        <option value="">Évaluer…</option>
                        {emps.map((e) => <option key={e.id} value={String(e.id)}>{e.prenom} {e.nom}</option>)}
                      </select>
                      <Button size="sm" variant="outline" onClick={() => closeCampaign.mutate({ id: c.id })}>Clôturer</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {camps.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune campagne.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {evalTarget && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold text-foreground">Évaluation — employé #{evalTarget.employeeId}</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Grille</Label>
              <select value={gridId} onChange={(e) => { setGridId(e.target.value); setScores({}); }} className="h-10 w-full rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
                <option value="" className="bg-background">Choisir une grille…</option>
                {gridList.map((g) => <option key={g.id} value={String(g.id)} className="bg-background">{g.name}</option>)}
              </select>
            </div>
          </div>
          {selectedGrid && (
            <div className="mt-4 space-y-2">
              {selectedGrid.criteria.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                  <span className="flex-1 text-sm text-foreground">{c.name} <span className="text-xs text-muted-foreground">({c.weight} %)</span></span>
                  <Input
                    type="number"
                    min={0}
                    max={Number(c.maxScore) || 5}
                    step="0.5"
                    placeholder={`/ ${c.maxScore}`}
                    value={scores[c.id] ?? ""}
                    onChange={(e) => setScores((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    className="w-20"
                  />
                </div>
              ))}
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                <div>
                  <Label>Appréciation générale</Label>
                  <Input value={appreciation} onChange={(e) => setAppreciation(e.target.value)} />
                </div>
                <div>
                  <Label>Objectifs période suivante</Label>
                  <Input value={objectives} onChange={(e) => setObjectives(e.target.value)} />
                </div>
              </div>
              <Button onClick={submitEval} disabled={saveEval.isPending}>
                <Check size={14} /> Enregistrer l'évaluation
              </Button>
            </div>
          )}
        </div>
      )}

      {evals.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <div className="border-b border-border/60 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Évaluations saisies
          </div>
          <table className="w-full">
            <tbody className="divide-y divide-border/60">
              {evals.map((e) => (
                <tr key={e.id} className="text-sm text-foreground">
                  <td className="px-4 py-2">{e.employePrenom} {e.employeNom}</td>
                  <td className="px-4 py-2 font-mono text-xs font-bold">{e.globalScore}/5</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{e.appreciation ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── 3. Historique par employé ───
function HistoriqueSection() {
  const [employeeId, setEmployeeId] = useState("");
  const { hasPermission } = usePermissions();
  const [histOpen, setHistOpen] = useState(false);
  const { data: snapshots, isLoading: histLoading, isError: histError, refetch: histRefetch } = api.rhEvaluation.listSnapshots.useQuery(undefined, { enabled: histOpen });
  const employeUrl = useEmployeFromUrl();
  useEffect(() => { if (employeUrl) setEmployeeId(String(employeUrl)); }, [employeUrl]);
  const { data: employees } = api.rh.list.useQuery({ limit: 100 });
  const { data: evaluations } = api.rhEvaluation.listEvaluations.useQuery(
    { employeeId: employeeId ? Number(employeeId) : undefined },
    { enabled: true }
  );

  const emps = (employees?.employees ?? []) as unknown as Array<{ id: number; nom: string; prenom: string }>;
  const evals = (evaluations ?? []) as unknown as Array<{
    id: number; employeNom: string; employePrenom: string; globalScore: string;
    appreciation: string | null; objectives: string | null; evaluatedAt: string;
  }>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none">
          <option value="" className="bg-background">Tous les employés</option>
          {emps.map((e) => <option key={e.id} value={String(e.id)} className="bg-background">{e.prenom} {e.nom}</option>)}
        </select>
        {hasPermission("rh.evaluation.modifier") && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHistOpen(true)}>
            <History size={14} /> Versions archivées
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Employé</th>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Note</th>
              <th className="px-4 py-2.5">Appréciation</th>
              <th className="px-4 py-2.5">Objectifs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {evals.map((e) => (
              <tr key={e.id} className="text-sm text-foreground">
                <td className="px-4 py-2">{e.employePrenom} {e.employeNom}</td>
                <td className="px-4 py-2 text-xs">{new Date(e.evaluatedAt).toLocaleDateString("fr-FR")}</td>
                <td className="px-4 py-2 font-mono text-xs font-bold">{e.globalScore}/5</td>
                <td className="max-w-64 truncate px-4 py-2 text-xs text-muted-foreground">{e.appreciation ?? "-"}</td>
                <td className="max-w-64 truncate px-4 py-2 text-xs text-muted-foreground">{e.objectives ?? "-"}</td>
              </tr>
            ))}
            {evals.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune évaluation.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <HistoriqueDialog
        open={histOpen}
        onClose={() => setHistOpen(false)}
        title="Historique des évaluations (versionné)"
        emptyLabel="Aucune version archivée — chaque recalcul conservera l'évaluation antérieure."
        rows={(snapshots ?? []).map((s: any) => ({
          id: s.id,
          version: s.version,
          raison: s.raison,
          creatorPrenom: s.creatorPrenom,
          creatorName: s.creatorName,
          createdBy: s.createdBy,
          createdAt: s.createdAt,
          detail: { evaluation: s.entityJson, scores: s.scoresJson },
        }))}
        isLoading={histLoading}
        isError={histError}
        onRetry={() => histRefetch()}
      />
    </div>
  );
}

// ─── 4. Barème de prime ───
function BaremeSection() {
  const utils = api.useUtils();
  const { data: rules } = api.rhEvaluation.listBonusRules.useQuery();
  const update = api.rhEvaluation.updateBonusRule.useMutation({
    onSuccess: () => { toast.success("Barème mis à jour"); utils.rhEvaluation.listBonusRules.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const list = (rules ?? []) as unknown as Array<{ id: number; minScore: string; maxScore: string; bonusAmount: string; active: boolean }>;

  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-xs text-muted-foreground">
        Prime de performance suggérée selon la note globale — reprise manuellement dans le bulletin de paie.
      </p>
      <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
        {list.map((r) => (
          <div key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${!r.active ? "opacity-50" : ""}`}>
            <span className="w-24 text-sm font-semibold text-foreground">
              {Number(r.minScore)} → {Number(r.maxScore)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">/5</span>
            <Input
              type="number"
              step="500"
              defaultValue={Number(r.bonusAmount)}
              onBlur={(e) => update.mutate({ id: r.id, minScore: Number(r.minScore), maxScore: Number(r.maxScore), bonusAmount: Number(e.target.value), active: r.active })}
              className="h-8 w-32"
            />
            <span className="text-xs text-muted-foreground">XOF</span>
            <button
              type="button"
              onClick={() => update.mutate({ id: r.id, minScore: Number(r.minScore), maxScore: Number(r.maxScore), bonusAmount: Number(r.bonusAmount), active: !r.active })}
              className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${r.active ? "bg-success/10 text-success-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {r.active ? "Actif" : "Inactif"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
