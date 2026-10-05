"use client";

import { useEffect, useState } from "react";
import { useClientPaging, PaginationBar } from "./ClientPagination";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { useEmployeFromUrl } from "~/hooks/useEmployeFromUrl";
import { usePermissions } from "~/hooks/usePermissions";
import { downloadCsv } from "./csv-download";
import {
  Award,
  BookOpen,
  Brain,
  CalendarDays,
  Download,
  GraduationCap,
  LayoutGrid,
  Plus,
  Printer,
  Search,
  Trash2,
  AlertTriangle,
  UserRound,
  Check,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const TABS = [
  { id: "referentiel", label: "Référentiel", icon: BookOpen },
  { id: "matrice", label: "Matrice employés", icon: UserRound },
  { id: "postes", label: "Exigences par poste", icon: LayoutGrid },
  { id: "formations", label: "Formations", icon: GraduationCap },
  { id: "plan", label: "Plan & historique", icon: CalendarDays },
] as const;
type TabId = (typeof TABS)[number]["id"];

const LEVELS = [1, 2, 3, 4, 5];

function LevelBadge({ level }: { level: number }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
      level >= 4 ? "bg-success/10 text-success-foreground"
      : level >= 2 ? "bg-warning/10 text-warning-foreground"
      : "bg-muted text-muted-foreground"
    }`}>
      Niv. {level}
    </span>
  );
}

export default function CompetencesRH() {
  const [tab, setTab] = useState<TabId>("referentiel");
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Compétences & Formations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Référentiel de compétences, matrice par employé, détection des écarts et plan de formation.
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
        {tab === "referentiel" && <ReferentielSection />}
        {tab === "matrice" && <MatriceSection />}
        {tab === "postes" && <PostesSection />}
        {tab === "formations" && <FormationsSection />}
        {tab === "plan" && <PlanSection />}
      </div>
    </div>
  );
}

// ─── 1. Référentiel de compétences ───
function ReferentielSection() {
  const utils = api.useUtils();
  const { data: skills, isLoading, isError, refetch } = api.rhCompetences.listSkills.useQuery();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", category: "", description: "" });
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const create = api.rhCompetences.createSkill.useMutation({
    onSuccess: () => { toast.success("Compétence créée"); utils.rhCompetences.listSkills.invalidate(); setShowForm(false); setForm({ code: "", name: "", category: "", description: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.rhCompetences.deleteSkill.useMutation({
    onSuccess: () => { toast.success("Compétence supprimée"); utils.rhCompetences.listSkills.invalidate(); utils.rhCompetences.listPositionSkills.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const list = (skills ?? []).filter(
    (s: any) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase())
  );

  const { page, setPage, pageItems, total: listTotal, totalPages } = useClientPaging(list, 25);

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const save = () => {
    if (!form.code.trim() || !form.name.trim() || !form.category.trim()) { toast.error("Code, nom et catégorie requis"); return; }
    create.mutate({ code: form.code.trim(), name: form.name.trim(), category: form.category.trim(), description: form.description.trim() || undefined });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input placeholder="Rechercher une compétence..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2">
          <Plus size={16} /> Nouvelle compétence
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Nouvelle compétence</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs text-muted-foreground">Code *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ex: DIAG_ELEC" /></div>
            <div><Label className="text-xs text-muted-foreground">Nom *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex: Diagnostic électronique" /></div>
            <div><Label className="text-xs text-muted-foreground">Catégorie *</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="ex: Atelier" /></div>
            <div><Label className="text-xs text-muted-foreground">Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={create.isPending} className="gap-2"><Check size={14} /> {create.isPending ? "Création..." : "Enregistrer"}</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState icon={BookOpen} title="Aucune compétence" description={search ? "Aucun résultat pour cette recherche." : "Créez la première compétence du référentiel."} />
      ) : (
        <>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Compétence</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Catégorie</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((s: any) => (
                <tr key={s.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{s.code}</td>
                  <td className="px-4 py-2.5 font-medium">{s.name}</td>
                  <td className="px-4 py-2.5"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{s.category}</span></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.description || "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="icon" className="text-destructive" title="Supprimer"
                      onClick={() => setConfirmDelete(s)}>
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} totalPages={totalPages} total={listTotal} onPage={setPage} label="compétence(s)" empty={!list.length} />
        </>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground">Supprimer la compétence</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              « {confirmDelete.name} » sera supprimée du référentiel, ainsi que ses exigences par poste et évaluations.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Annuler</Button>
              <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { remove.mutate({ id: confirmDelete.id }); setConfirmDelete(null); }}>
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 2. Matrice employés ───
function MatriceSection() {
  const utils = api.useUtils();
  const { hasPermission } = usePermissions();
  const exportMatrice = api.rhDashboard.exportMatrice.useQuery(undefined, { enabled: false });
  const { data: employes } = api.rh.list.useQuery({ limit: 100 });
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const employeUrl = useEmployeFromUrl();
  useEffect(() => { if (employeUrl) setEmployeeId(employeUrl); }, [employeUrl]);
  const { data: empSkills } = api.rhCompetences.listEmployeeSkills.useQuery({ employeeId: employeeId ?? undefined }, { enabled: !!employeeId });
  const { data: gapsData } = api.rhCompetences.getGaps.useQuery({ employeeId: employeeId ?? 0 }, { enabled: !!employeeId });

  const setSkill = api.rhCompetences.setEmployeeSkill.useMutation({
    onSuccess: () => { toast.success("Niveau enregistré"); utils.rhCompetences.listEmployeeSkills.invalidate(); utils.rhCompetences.getGaps.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const empList = (employes?.employees ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xs">
          <Label className="text-xs text-muted-foreground">Employé</Label>
          <select
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            value={employeeId ?? ""}
            onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sélectionner un employé...</option>
            {empList.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
        </div>
        {hasPermission("rh.competence.consulter") && (
          <Button
            variant="outline"
            onClick={async () => {
              if (!exportMatrice.data) await exportMatrice.refetch();
              downloadCsv(exportMatrice.data, "matrice-competences.csv");
            }}
          >
            <Download size={15} /> Exporter la matrice
          </Button>
        )}
        <Button variant="outline" onClick={() => window.print()} className="print:hidden">
          <Printer size={15} /> Imprimer
        </Button>
      </div>

      {!employeeId ? (
        <EmptyState icon={UserRound} title="Sélectionnez un employé" description="Pour afficher sa matrice de compétences et ses écarts." />
      ) : (
        <>
          {gapsData && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <AlertTriangle size={15} className="text-warning-foreground" />
                Écarts de compétences {gapsData.positionName ? `· ${gapsData.positionName}` : ""}
              </div>
              {gapsData.gaps.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Aucun écart : l'employé maîtrise toutes les compétences requises par son poste. ✓</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {gapsData.gaps.map((g: any) => (
                    <div key={g.skillId} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="font-medium">{g.skillName}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">requis {g.requiredLevel} · actuel {g.currentLevel}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${g.critical ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning-foreground"}`}>
                          -{g.gap}
                        </span>
                      </span>
                    </div>
                  ))}
                  {gapsData.suggestions.length > 0 && (
                    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                        <GraduationCap size={14} /> Formations suggérées
                      </div>
                      {gapsData.suggestions.map((s: any) => (
                        <div key={s.trainingId} className="mt-1.5 flex items-center justify-between text-sm">
                          <span>{s.title}</span>
                          <span className="text-xs text-muted-foreground">impact -{s.gap}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Compétence</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Catégorie</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Niveau actuel</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {(empSkills ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Aucune compétence évaluée pour cet employé.</td></tr>
                ) : (empSkills ?? []).map((es: any) => (
                  <tr key={es.id} className="border-t border-border hover:bg-accent/40">
                    <td className="px-4 py-2.5 font-medium">{es.skillName}</td>
                    <td className="px-4 py-2.5"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs">{es.skillCategory}</span></td>
                    <td className="px-4 py-2.5 text-center"><LevelBadge level={es.currentLevel} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1 rounded-lg border border-border p-0.5">
                        {LEVELS.map((l) => (
                          <button key={l} type="button"
                            className={`size-7 rounded-md text-xs font-bold transition-colors ${es.currentLevel === l ? "bg-primary text-foreground" : "text-muted-foreground hover:bg-accent"}`}
                            onClick={() => setSkill.mutate({ employeeId: es.employeeId, skillId: es.skillId, currentLevel: l })}
                            title={`Niveau ${l}`}
                          >{l}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 3. Exigences par poste ───
function PostesSection() {
  const utils = api.useUtils();
  const { data: exigences, isLoading, isError, refetch } = api.rhCompetences.listPositionSkills.useQuery();
  const { data: skills } = api.rhCompetences.listSkills.useQuery();
  const { data: employes } = api.rh.list.useQuery({ limit: 100 });

  const setExigence = api.rhCompetences.setPositionSkill.useMutation({
    onSuccess: () => { toast.success("Exigence enregistrée"); utils.rhCompetences.listPositionSkills.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const removeExigence = api.rhCompetences.removePositionSkill.useMutation({
    onSuccess: () => { toast.success("Exigence retirée"); utils.rhCompetences.listPositionSkills.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({ positionId: 0, skillId: 0, level: 3 });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const positions = [...new Set((exigences ?? []).map((e: any) => e.positionId))].map((pid) => {
    const first = (exigences ?? []).find((e: any) => e.positionId === pid);
    return { id: pid, name: first?.positionName };
  });

  const skillList = (skills ?? []) as any[];
  const empPositions = [...new Set((employes?.employees ?? []).map((e: any) => e.positionId).filter(Boolean))];

  const save = () => {
    if (!form.positionId || !form.skillId) { toast.error("Poste et compétence requis"); return; }
    setExigence.mutate({ positionId: form.positionId, skillId: form.skillId, requiredLevel: form.level });
    setForm({ positionId: 0, skillId: 0, level: 3 });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Ajouter une exigence</div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label className="text-xs text-muted-foreground">Poste</Label>
            <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.positionId} onChange={(e) => setForm({ ...form, positionId: Number(e.target.value) })}>
              <option value={0}>Poste...</option>
              {(positions as any[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Compétence</Label>
            <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.skillId} onChange={(e) => setForm({ ...form, skillId: Number(e.target.value) })}>
              <option value={0}>Compétence...</option>
              {skillList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Niveau requis (1-5)</Label>
            <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.level} onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={save} disabled={setExigence.isPending} className="w-full gap-2"><Plus size={15} /> Ajouter</Button>
          </div>
        </div>
      </div>

      {(exigences ?? []).length === 0 ? (
        <EmptyState icon={LayoutGrid} title="Aucune exigence" description="Définissez les compétences requises par poste." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Poste</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Compétence</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Niveau requis</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {(exigences ?? []).map((ex: any) => (
                <tr key={ex.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-2.5 font-medium">{ex.positionName}</td>
                  <td className="px-4 py-2.5">{ex.skillName}</td>
                  <td className="px-4 py-2.5 text-center"><LevelBadge level={ex.requiredLevel} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="icon" className="text-destructive" title="Retirer"
                      onClick={() => removeExigence.mutate({ positionId: ex.positionId, skillId: ex.skillId })}>
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── 4. Formations (catalogue + sessions) ───
function FormationsSection() {
  const utils = api.useUtils();
  const { data: trainings, isLoading, isError, refetch } = api.rhCompetences.listTrainings.useQuery();
  const { data: sessions } = api.rhCompetences.listSessions.useQuery();
  const { data: skills } = api.rhCompetences.listSkills.useQuery();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", provider: "interne", durationHours: "", skillIds: "" as string });
  const [sessionForm, setSessionForm] = useState<{ trainingId: number; startDate: string; endDate: string; location: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const create = api.rhCompetences.createTraining.useMutation({
    onSuccess: () => { toast.success("Formation créée"); utils.rhCompetences.listTrainings.invalidate(); setShowForm(false); setForm({ title: "", description: "", provider: "interne", durationHours: "", skillIds: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const createSession = api.rhCompetences.createSession.useMutation({
    onSuccess: () => { toast.success("Session planifiée"); utils.rhCompetences.listSessions.invalidate(); setSessionForm(null); },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.rhCompetences.deleteTraining.useMutation({
    onSuccess: () => { toast.success("Formation supprimée"); utils.rhCompetences.listTrainings.invalidate(); utils.rhCompetences.listSessions.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const list = (trainings ?? []) as any[];
  const { page: trPage, setPage: setTrPage, pageItems: trPageItems, total: trTotal, totalPages: trTotalPages } = useClientPaging(list, 25);

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const sesList = (sessions ?? []) as any[];
  const skillList = (skills ?? []) as any[];
  const skillName = (id: number) => skillList.find((s) => s.id === id)?.name ?? `#${id}`;

  const save = () => {
    if (!form.title.trim()) { toast.error("Titre requis"); return; }
    const skillIds = form.skillIds ? form.skillIds.split(",").map((s) => Number(s.trim())).filter(Boolean) : [];
    create.mutate({ title: form.title.trim(), description: form.description.trim() || undefined, provider: form.provider, durationHours: form.durationHours ? Number(form.durationHours) : undefined, skillIds });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Catalogue de formations</h2>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2"><Plus size={15} /> Nouvelle formation</Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Nouvelle formation</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label className="text-xs text-muted-foreground">Titre *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label className="text-xs text-muted-foreground">Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
                <option value="interne">Interne</option><option value="externe">Externe (organisme)</option>
              </select>
            </div>
            <div><Label className="text-xs text-muted-foreground">Durée (heures)</Label><Input type="number" value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Compétences ciblées (ids séparés par des virgules)</Label>
              <Input value={form.skillIds} onChange={(e) => setForm({ ...form, skillIds: e.target.value })} placeholder="1,3,5" />
              {skillList.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {skillList.map((s) => (
                    <span key={s.id} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{s.id} · {s.name}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={create.isPending} className="gap-2"><Check size={14} /> {create.isPending ? "Création..." : "Enregistrer"}</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Aucune formation" description="Ajoutez la première formation au catalogue." />
      ) : (
        <>
        <div className="grid gap-3 sm:grid-cols-2">
          {trPageItems.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-foreground">{t.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t.provider === "externe" ? "Externe" : "Interne"}{t.durationHours ? ` · ${t.durationHours} h` : ""}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0 text-destructive" title="Supprimer"
                  onClick={() => setConfirmDelete(t)}>
                  <Trash2 size={15} />
                </Button>
              </div>
              {t.description && <p className="mt-2 text-xs text-muted-foreground">{t.description}</p>}
              {t.skillIds?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.skillIds.map((id: number) => <span key={id} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">{skillName(id)}</span>)}
                </div>
              )}
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setSessionForm({ trainingId: t.id, startDate: "", endDate: "", location: "" })}>
                <CalendarDays size={13} /> Planifier une session
              </Button>
            </div>
          ))}
        </div>
        <PaginationBar page={trPage} totalPages={trTotalPages} total={trTotal} onPage={setTrPage} label="formation(s)" empty={!list.length} />
        </>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground">Supprimer la formation</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              « {confirmDelete.title} » et ses sessions seront supprimées.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Annuler</Button>
              <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { remove.mutate({ id: confirmDelete.id }); setConfirmDelete(null); }}>
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}

      {sessionForm && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Planifier une session</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label className="text-xs text-muted-foreground">Date de début *</Label><Input type="date" value={sessionForm.startDate} onChange={(e) => setSessionForm({ ...sessionForm, startDate: e.target.value })} /></div>
            <div><Label className="text-xs text-muted-foreground">Date de fin</Label><Input type="date" value={sessionForm.endDate} onChange={(e) => setSessionForm({ ...sessionForm, endDate: e.target.value })} /></div>
            <div><Label className="text-xs text-muted-foreground">Lieu</Label><Input value={sessionForm.location} onChange={(e) => setSessionForm({ ...sessionForm, location: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => { if (!sessionForm.startDate) { toast.error("Date de début requise"); return; } createSession.mutate({ trainingId: sessionForm.trainingId, startDate: sessionForm.startDate, endDate: sessionForm.endDate || undefined, location: sessionForm.location || undefined }); }} disabled={createSession.isPending} className="gap-2">
              <Check size={14} /> {createSession.isPending ? "Planification..." : "Planifier"}
            </Button>
            <Button variant="outline" onClick={() => setSessionForm(null)}>Annuler</Button>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Sessions planifiées</h2>
        {sesList.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Aucune session" description="Planifiez une session de formation." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Formation</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Début</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fin</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lieu</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Statut</th>
                </tr>
              </thead>
              <tbody>
                {sesList.map((s: any) => (
                  <tr key={s.id} className="border-t border-border hover:bg-accent/40">
                    <td className="px-4 py-2.5 font-medium">{s.trainingTitle}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.startDate}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.endDate ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.location ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.status === "terminee" ? "bg-success/10 text-success-foreground" : s.status === "en_cours" ? "bg-info/10 text-info-foreground" : "bg-warning/10 text-warning-foreground"}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 5. Plan & historique (participations par employé + alertes) ───
function PlanSection() {
  const utils = api.useUtils();
  const { data: participations } = api.rhCompetences.listParticipations.useQuery();
  const { data: alerts } = api.rhCompetences.getTrainingLapse.useQuery({ months: 6 });
  const { data: sessions } = api.rhCompetences.listSessions.useQuery();
  const { data: employes } = api.rh.list.useQuery({ limit: 100 });

  const [form, setForm] = useState({ sessionId: 0, employeeId: 0 });

  const add = api.rhCompetences.addParticipation.useMutation({
    onSuccess: () => { toast.success("Participant inscrit"); utils.rhCompetences.listParticipations.invalidate(); utils.rhCompetences.getTrainingLapse.invalidate(); setForm({ sessionId: 0, employeeId: 0 }); },
    onError: (e) => toast.error(e.message),
  });
  const update = api.rhCompetences.updateParticipation.useMutation({
    onSuccess: () => { toast.success("Statut mis à jour"); utils.rhCompetences.listParticipations.invalidate(); utils.rhCompetences.getTrainingLapse.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const sesList = (sessions ?? []) as any[];
  const empList = (employes?.employees ?? []) as any[];
  const partList = (participations ?? []) as any[];

  const save = () => {
    if (!form.sessionId || !form.employeeId) { toast.error("Session et employé requis"); return; }
    add.mutate({ sessionId: form.sessionId, employeeId: form.employeeId });
  };

  return (
    <div className="space-y-5">
      {alerts && (alerts as any[]).length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-warning-foreground">
            <AlertTriangle size={15} /> Alertes de formation
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Employés sans formation depuis 6 mois ou plus :</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(alerts as any[]).map((a) => (
              <span key={a.employeeId} className="rounded-full bg-card px-2.5 py-1 text-xs font-medium">
                {a.prenom} {a.nom}{a.positionName ? ` (${a.positionName})` : ""} · {a.neverTrained ? "jamais formé" : `${a.monthsSince} mois`}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <UserRound size={14} /> Inscrire un employé à une session
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.sessionId} onChange={(e) => setForm({ ...form, sessionId: Number(e.target.value) })}>
            <option value={0}>Session...</option>
            {sesList.map((s) => <option key={s.id} value={s.id}>{s.trainingTitle} ({s.startDate})</option>)}
          </select>
          <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: Number(e.target.value) })}>
            <option value={0}>Employé...</option>
            {empList.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
          <Button onClick={save} disabled={add.isPending} className="gap-2"><Plus size={15} /> Inscrire</Button>
        </div>
      </div>

      {partList.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Aucune participation" description="Inscrivez des employés aux sessions de formation." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employé</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Formation</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Statut</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Note</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {partList.map((p: any) => (
                <tr key={p.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-2.5 font-medium">{p.employePrenom} {p.employeNom}</td>
                  <td className="px-4 py-2.5">{p.trainingTitle}</td>
                  <td className="px-4 py-2.5 text-center">
                    <select
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      value={p.status}
                      onChange={(e) => update.mutate({ id: p.id, status: e.target.value })}
                    >
                      <option value="inscrit">Inscrit</option>
                      <option value="present">Présent</option>
                      <option value="valide">Validé</option>
                      <option value="absent">Absent</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-center text-muted-foreground">{p.score ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {p.status !== "valide" && (
                      <Button variant="outline" size="sm" onClick={() => update.mutate({ id: p.id, status: "valide" })} className="gap-1">
                        <Award size={13} /> Valider
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
      <Icon size={28} className="mb-2 opacity-40" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 py-10 text-center">
      <AlertTriangle size={28} className="mb-2 text-destructive" />
      <p className="text-sm font-medium text-foreground">Erreur de chargement</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Réessayer</Button>
    </div>
  );
}
