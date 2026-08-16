"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  FileText,
  Files,
  FolderOpen,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const TABS = [
  { id: "documents", label: "Documents", icon: Files },
  { id: "types", label: "Types", icon: FolderOpen },
  { id: "alertes", label: "Alertes expiration", icon: CalendarClock },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function DocumentsRH() {
  const [tab, setTab] = useState<TabId>("documents");
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Documents RH</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contrats, pièces d'identité, attestations et certificats rattachés à chaque employé.
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
        {tab === "documents" && <DocumentsSection />}
        {tab === "types" && <TypesSection />}
        {tab === "alertes" && <AlertesSection />}
      </div>
    </div>
  );
}

function ExpiryBadge({ status }: { status: string }) {
  const cfg =
    status === "expire"
      ? { label: "Expiré", cls: "bg-destructive/10 text-destructive" }
      : status === "expire_bientot"
        ? { label: "Expire bientôt", cls: "bg-warning/10 text-warning-foreground" }
        : status === "valide"
          ? { label: "Valide", cls: "bg-success/10 text-success-foreground" }
          : { label: "Sans expiration", cls: "bg-muted text-muted-foreground" };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cfg.cls}`}>{cfg.label}</span>;
}

// ─── 1. Documents ───
function DocumentsSection() {
  const utils = api.useUtils();
  const { data: documents, isLoading, isError, refetch } = api.rhDocuments.listDocuments.useQuery({});
  const { data: types } = api.rhDocuments.listDocumentTypes.useQuery();
  const { data: employes } = api.rh.list.useQuery({ limit: 100 });
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [form, setForm] = useState({
    employeId: 0,
    documentTypeId: 0,
    titre: "",
    fichierUrl: "",
    dateEmission: "",
    dateExpiration: "",
    notes: "",
  });

  const create = api.rhDocuments.createDocument.useMutation({
    onSuccess: () => {
      toast.success("Document ajouté");
      utils.rhDocuments.listDocuments.invalidate();
      utils.rhDocuments.getExpirationAlerts.invalidate();
      setShowForm(false);
      setForm({ employeId: 0, documentTypeId: 0, titre: "", fichierUrl: "", dateEmission: "", dateExpiration: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.rhDocuments.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success("Document supprimé");
      utils.rhDocuments.listDocuments.invalidate();
      utils.rhDocuments.getExpirationAlerts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const list = (documents ?? []).filter(
    (d: any) =>
      !search ||
      `${d.employePrenom} ${d.employeNom}`.toLowerCase().includes(search.toLowerCase()) ||
      (d.titre ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.typeName ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const typeList = (types ?? []) as any[];
  const empList = (employes?.employees ?? []) as any[];

  const save = () => {
    if (!form.employeId || !form.documentTypeId || !form.fichierUrl.trim()) {
      toast.error("Employé, type et fichier requis");
      return;
    }
    create.mutate({
      employeId: form.employeId,
      documentTypeId: form.documentTypeId,
      titre: form.titre.trim() || undefined,
      fichierUrl: form.fichierUrl.trim(),
      dateEmission: form.dateEmission || undefined,
      dateExpiration: form.dateExpiration || undefined,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input placeholder="Rechercher (employé, type, titre)..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2">
          <Plus size={16} /> Ajouter un document
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Nouveau document</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Employé *</Label>
              <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.employeId} onChange={(e) => setForm({ ...form, employeId: Number(e.target.value) })}>
                <option value={0}>Employé...</option>
                {empList.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Type *</Label>
              <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.documentTypeId} onChange={(e) => setForm({ ...form, documentTypeId: Number(e.target.value) })}>
                <option value={0}>Type...</option>
                {typeList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Titre</Label>
              <Input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">URL du fichier * (PDF / image)</Label>
              <Input value={form.fichierUrl} onChange={(e) => setForm({ ...form, fichierUrl: e.target.value })} placeholder="ex: /docs/contrat-e5.pdf" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date d'émission</Label>
              <Input type="date" value={form.dateEmission} onChange={(e) => setForm({ ...form, dateEmission: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date d'expiration</Label>
              <Input type="date" value={form.dateExpiration} onChange={(e) => setForm({ ...form, dateExpiration: e.target.value })} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={create.isPending} className="gap-2">
              <Check size={14} /> {create.isPending ? "Ajout..." : "Enregistrer"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState icon={Files} title="Aucun document" description="Ajoutez le premier document d'un employé." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employé</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Titre</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Émission</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Expiration</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Statut</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fichier</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d: any) => (
                <tr key={d.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-2.5 font-medium">{d.employePrenom} {d.employeNom}</td>
                  <td className="px-4 py-2.5">{d.typeName ?? d.typeDocument}</td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-muted-foreground">{d.titre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{d.dateEmission ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{d.dateExpiration ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center"><ExpiryBadge status={d.expiryStatus} /></td>
                  <td className="px-4 py-2.5">
                    <a href={d.fichierUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline">{d.fichierUrl.split("/").pop()}</a>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="icon" className="text-destructive" title="Supprimer" onClick={() => setConfirmDelete(d)}>
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <AlertTriangle size={16} className="text-destructive" /> Supprimer le document
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              « {confirmDelete.titre} » de {confirmDelete.employePrenom} {confirmDelete.employeNom} sera supprimé.
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

// ─── 2. Types paramétrables ───
function TypesSection() {
  const utils = api.useUtils();
  const { data: types, isLoading, isError, refetch } = api.rhDocuments.listDocumentTypes.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", hasExpiration: false });
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const create = api.rhDocuments.createDocumentType.useMutation({
    onSuccess: () => { toast.success("Type créé"); utils.rhDocuments.listDocumentTypes.invalidate(); setShowForm(false); setForm({ code: "", name: "", hasExpiration: false }); },
    onError: (e) => toast.error(e.message),
  });
  const toggle = api.rhDocuments.updateDocumentType.useMutation({
    onSuccess: () => { toast.success("Type mis à jour"); utils.rhDocuments.listDocumentTypes.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.rhDocuments.deleteDocumentType.useMutation({
    onSuccess: () => { toast.success("Type supprimé"); utils.rhDocuments.listDocumentTypes.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const save = () => {
    if (!form.code.trim() || !form.name.trim()) { toast.error("Code et nom requis"); return; }
    create.mutate({ code: form.code.trim(), name: form.name.trim(), hasExpiration: form.hasExpiration });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Types de documents paramétrables</h2>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2"><Plus size={15} /> Nouveau type</Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label className="text-xs text-muted-foreground">Code *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ex: PASSEPORT" className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">Nom *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex: Passeport" className="mt-1" /></div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={form.hasExpiration} onChange={(e) => setForm({ ...form, hasExpiration: e.target.checked })} className="size-4 accent-primary" />
                Requiert une date d'expiration
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={create.isPending} className="gap-2"><Check size={14} /> {create.isPending ? "Création..." : "Enregistrer"}</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nom</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Expiration</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Actif</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {(types ?? []).map((t: any) => (
              <tr key={t.id} className="border-t border-border hover:bg-accent/40">
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{t.code}</td>
                <td className="px-4 py-2.5 font-medium">{t.name}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.hasExpiration ? "bg-warning/10 text-warning-foreground" : "bg-muted text-muted-foreground"}`}>
                    {t.hasExpiration ? "Oui" : "Non"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button type="button" onClick={() => toggle.mutate({ id: t.id, active: !t.active })} className={`size-6 rounded-full transition-colors ${t.active ? "bg-success" : "bg-muted"}`} title="Activer/désactiver" />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button variant="ghost" size="icon" className="text-destructive" title="Supprimer" onClick={() => setConfirmDelete(t)}>
                    <Trash2 size={15} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <AlertTriangle size={16} className="text-destructive" /> Supprimer le type
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Le type « {confirmDelete.name} » sera supprimé. Les documents existants conserveront leur type texte.
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

// ─── 3. Alertes expiration ───
function AlertesSection() {
  const { data: alerts, isLoading, isError, refetch } = api.rhDocuments.getExpirationAlerts.useQuery({ alertDays: 30 });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const list = (alerts ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-warning-foreground">
          <AlertTriangle size={15} /> Documents expirés ou expirant sous 30 jours
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {list.length} document(s) nécessitent une action.
        </p>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Aucune alerte" description="Tous les documents avec expiration sont à jour." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employé</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Titre</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Expiration</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Jours restants</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Statut</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fichier</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a: any) => (
                <tr key={a.documentId} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-2.5 font-medium">{a.employePrenom} {a.employeNom}</td>
                  <td className="px-4 py-2.5">{a.typeName}</td>
                  <td className="px-4 py-2.5">{a.titre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{a.dateExpiration}</td>
                  <td className="px-4 py-2.5 text-center font-bold text-foreground">{a.daysLeft}</td>
                  <td className="px-4 py-2.5 text-center"><ExpiryBadge status={a.status} /></td>
                  <td className="px-4 py-2.5">
                    {a.fichierUrl && <a href={a.fichierUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline">{a.fichierUrl.split("/").pop()}</a>}
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
