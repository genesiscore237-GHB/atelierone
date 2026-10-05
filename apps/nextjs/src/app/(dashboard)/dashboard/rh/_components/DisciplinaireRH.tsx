"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { useEmployeFromUrl } from "~/hooks/useEmployeFromUrl";
import { usePermissions } from "~/hooks/usePermissions";
import { statutLabel } from "~/lib/rh-labels";
import { useClientPaging, PaginationBar } from "./ClientPagination";
import { downloadCsv } from "./csv-download";
import {
  AlertTriangle,
  Download,
  FileText,
  Gavel,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  Trash2,
  UserRound,
  Check,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const TABS = [
  { id: "liste", label: "Registre", icon: FileText },
  { id: "nouveau", label: "Nouveau record", icon: Plus },
  { id: "dossier", label: "Dossier employé", icon: UserRound },
] as const;
type TabId = (typeof TABS)[number]["id"];

const fmtXOF = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));

function SeverityBadge({ label, level }: { label: string | null; level?: number | null }) {
  const tone =
    !level || level <= 1 ? "bg-muted text-muted-foreground"
    : level === 2 ? "bg-warning/10 text-warning-foreground"
    : "bg-destructive/10 text-destructive";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone}`}>{label ?? "—"}</span>;
}

export default function DisciplinaireRH() {
  const [tab, setTab] = useState<TabId>("liste");
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Disciplinaire</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Incidents, sanctions et dossier disciplinaire — accès restreint RH & Direction.
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
        {tab === "liste" && <RegistreSection />}
        {tab === "nouveau" && <NouveauSection />}
        {tab === "dossier" && <DossierSection />}
      </div>
    </div>
  );
}

// ─── 1. Registre (liste + filtres) ───
function RegistreSection() {
  const utils = api.useUtils();
  const { hasPermission } = usePermissions();
  const exportDisciplinaire = api.rhDashboard.exportDisciplinaire.useQuery(undefined, { enabled: false });
  const { data: records, isLoading, isError, refetch } = api.rhDiscipline.listRecords.useQuery({});
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const remove = api.rhDiscipline.deleteRecord.useMutation({
    onSuccess: () => { toast.success("Record supprimé"); utils.rhDiscipline.listRecords.invalidate(); utils.rhDiscipline.getEmployeeDossier.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const list = (records ?? []).filter(
    (r: any) =>
      !search ||
      `${r.employePrenom} ${r.employeNom}`.toLowerCase().includes(search.toLowerCase()) ||
      (r.sanctionTypeName ?? r.typeSanction ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const { page, setPage, pageItems, total: listTotal, totalPages } = useClientPaging(list, 25);

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input placeholder="Rechercher (employé, type)..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {hasPermission("rh.discipline.consulter") && (
          <Button
            variant="outline"
            onClick={async () => {
              if (!exportDisciplinaire.data) await exportDisciplinaire.refetch();
              downloadCsv(exportDisciplinaire.data, "registre-disciplinaire.csv");
            }}
          >
            <Download size={15} /> Exporter
          </Button>
        )}
        <Button variant="outline" onClick={() => window.print()} className="print:hidden">
          <Printer size={15} /> Imprimer
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={FileText} title="Aucun record disciplinaire" description="Enregistrez une sanction depuis l'onglet « Nouveau record »." />
      ) : (
        <>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employé</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Motif</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Gravité</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Décision</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-2.5 font-medium">{r.employePrenom} {r.employeNom}</td>
                  <td className="px-4 py-2.5">{r.sanctionTypeName ?? r.typeSanction}</td>
                  <td className="max-w-[240px] truncate px-4 py-2.5 text-muted-foreground">{r.motif}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{r.dateSanction}</td>
                  <td className="px-4 py-2.5 text-center"><SeverityBadge label={r.severityLabel ?? r.gravite} level={r.severityLevel} /></td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.decision === "notifiee" ? "bg-success/10 text-success-foreground" : "bg-warning/10 text-warning-foreground"}`}>
                      {r.decision === "notifiee" ? "Notifiée" : "Non notifiée"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="icon" className="text-destructive" title="Supprimer" onClick={() => setConfirmDelete(r)}>
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} totalPages={totalPages} total={listTotal} onPage={setPage} label="record(s)" empty={!list.length} />
        </>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <AlertTriangle size={16} className="text-destructive" /> Supprimer le record
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              La sanction de {confirmDelete.employePrenom} {confirmDelete.employeNom} ({confirmDelete.sanctionTypeName ?? confirmDelete.typeSanction}) sera retirée du dossier disciplinaire.
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

// ─── 2. Nouveau record ───
function NouveauSection() {
  const utils = api.useUtils();
  const { data: types } = api.rhDiscipline.listSanctionTypes.useQuery();
  const { data: employes } = api.rh.list.useQuery({ limit: 100 });
  const [form, setForm] = useState({
    employeId: 0,
    sanctionTypeId: 0,
    motif: "",
    dateSanction: "",
    dateDebutEffet: "",
    dateFinEffet: "",
    dureeJours: "",
    detailsFinanciers: "",
    decision: "notifiee",
    documentUrl: "",
    appliquee: true,
  });

  const create = api.rhDiscipline.createRecord.useMutation({
    onSuccess: () => {
      toast.success("Sanction enregistrée");
      utils.rhDiscipline.listRecords.invalidate();
      utils.rhDiscipline.getEmployeeDossier.invalidate();
      setForm({ employeId: 0, sanctionTypeId: 0, motif: "", dateSanction: "", dateDebutEffet: "", dateFinEffet: "", dureeJours: "", detailsFinanciers: "", decision: "notifiee", documentUrl: "", appliquee: true });
    },
    onError: (e) => toast.error(e.message),
  });

  const typeList = (types ?? []) as any[];
  const empList = (employes?.employees ?? []) as any[];

  const save = () => {
    if (!form.employeId || !form.sanctionTypeId || !form.motif.trim() || !form.dateSanction) {
      toast.error("Employé, type, motif et date requis");
      return;
    }
    create.mutate({
      employeId: form.employeId,
      sanctionTypeId: form.sanctionTypeId,
      motif: form.motif.trim(),
      dateSanction: form.dateSanction,
      dateDebutEffet: form.dateDebutEffet || undefined,
      dateFinEffet: form.dateFinEffet || undefined,
      dureeJours: form.dureeJours ? Number(form.dureeJours) : undefined,
      detailsFinanciers: form.detailsFinanciers ? Number(form.detailsFinanciers) : undefined,
      decision: form.decision,
      documentUrl: form.documentUrl.trim() || undefined,
      appliquee: form.appliquee,
    });
  };

  return (
    <div className="max-w-2xl rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
        <Gavel size={14} className="text-destructive" /> Enregistrer un incident / sanction
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">Employé *</Label>
          <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.employeId} onChange={(e) => setForm({ ...form, employeId: Number(e.target.value) })}>
            <option value={0}>Employé...</option>
            {empList.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Type de sanction * (RH-00)</Label>
          <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.sanctionTypeId} onChange={(e) => setForm({ ...form, sanctionTypeId: Number(e.target.value) })}>
            <option value={0}>Type...</option>
            {typeList.map((t) => <option key={t.id} value={t.id}>{t.name} (niv. {t.severityLevel})</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Description des faits / motif *</Label>
          <textarea rows={3} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Date des faits *</Label>
          <Input type="date" value={form.dateSanction} onChange={(e) => setForm({ ...form, dateSanction: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Décision</Label>
          <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}>
            <option value="notifiee">Notifiée</option>
            <option value="non_notifiee">Non notifiée</option>
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Début d'effet</Label>
          <Input type="date" value={form.dateDebutEffet} onChange={(e) => setForm({ ...form, dateDebutEffet: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Fin d'effet</Label>
          <Input type="date" value={form.dateFinEffet} onChange={(e) => setForm({ ...form, dateFinEffet: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Durée (jours)</Label>
          <Input type="number" value={form.dureeJours} onChange={(e) => setForm({ ...form, dureeJours: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Détails financiers (XOF)</Label>
          <Input type="number" value={form.detailsFinanciers} onChange={(e) => setForm({ ...form, detailsFinanciers: e.target.value })} className="mt-1 font-mono" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Document joint (URL / chemin)</Label>
          <Input value={form.documentUrl} onChange={(e) => setForm({ ...form, documentUrl: e.target.value })} placeholder="ex: /docs/courrier-e5.pdf" className="mt-1" />
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <Button onClick={save} disabled={create.isPending} className="gap-2">
          <Check size={14} /> {create.isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}

// ─── 3. Dossier employé ───
function DossierSection() {
  const { data: employes } = api.rh.list.useQuery({ limit: 100 });
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const employeUrl = useEmployeFromUrl();
  useEffect(() => { if (employeUrl) setEmployeeId(employeUrl); }, [employeUrl]);
  const { data: dossier } = api.rhDiscipline.getEmployeeDossier.useQuery(
    { employeId: employeeId ?? 0 },
    { enabled: !!employeeId }
  );

  const empList = (employes?.employees ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Label className="text-xs text-muted-foreground">Employé</Label>
        <select
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={employeeId ?? ""}
          onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Sélectionner un employé...</option>
          {empList.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
        </select>
      </div>

      {!employeeId ? (
        <EmptyState icon={UserRound} title="Sélectionnez un employé" description="Pour consulter son dossier disciplinaire complet." />
      ) : !dossier ? (
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Employé</div>
              <div className="mt-1 text-sm font-bold text-foreground">{dossier.employe.fullName}</div>
              <div className="text-xs text-muted-foreground">{statutLabel(dossier.employe.statut)}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Records</div>
              <div className="mt-1 text-sm font-bold text-foreground">{dossier.records.length}</div>
            </div>
            <div className={`rounded-xl border p-4 ${dossier.recidivism.isRecidivism ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <ShieldAlert size={13} className={dossier.recidivism.isRecidivism ? "text-destructive" : ""} />
                Récidive (fenêtre {dossier.settings.disciplinaryWindowMonths} mois)
              </div>
              <div className={`mt-1 text-sm font-bold ${dossier.recidivism.isRecidivism ? "text-destructive" : "text-foreground"}`}>
                {dossier.recidivism.isRecidivism
                  ? `ALERTE — ${dossier.recidivism.warningsInWindow} avertissements`
                  : `${dossier.recidivism.warningsInWindow} avertissement(s) — OK`}
              </div>
              <div className="text-[10px] text-muted-foreground">seuil {dossier.recidivism.threshold} · depuis {dossier.recidivism.windowStart}</div>
            </div>
          </div>

          {dossier.records.length === 0 ? (
            <EmptyState icon={FileText} title="Dossier vierge" description="Aucun incident ou sanction enregistré pour cet employé." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Motif</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Gravité</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Décision</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Par</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Document</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.records.map((r: any) => (
                    <tr key={r.id} className="border-t border-border hover:bg-accent/40">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.dateSanction}</td>
                      <td className="px-4 py-2.5 font-medium">{r.sanctionTypeName ?? r.typeSanction}</td>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground">{r.motif}</td>
                      <td className="px-4 py-2.5 text-center"><SeverityBadge label={r.severityLabel} level={r.severityLevel} /></td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.decision === "notifiee" ? "bg-success/10 text-success-foreground" : "bg-warning/10 text-warning-foreground"}`}>
                          {r.decision === "notifiee" ? "Notifiée" : "Non notifiée"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {r.creatorPrenom ? `${r.creatorPrenom} ${r.creatorNom ?? r.creatorName ?? ""}`.trim() : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.documentUrl ? (
                          <a href={r.documentUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline">{r.documentUrl.split("/").pop()}</a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
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
