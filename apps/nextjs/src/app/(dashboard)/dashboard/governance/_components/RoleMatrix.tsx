"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "~/trpc/react";
import MatrixGrid from "./MatrixGrid";
import { DetailModal } from "./DetailModal";
import { ModuleHeader } from "./ModuleHeader";

interface Permission {
  id: string;
  code: string;
  nom: string;
  module: string;
}

interface Role {
  id: string;
  nom: string;
  code: string;
}

interface MatrixLink {
  permissionId: string;
  roleId: string;
  active: boolean;
}

function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) confirmRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title" className="mb-2 text-base font-bold text-foreground">
          {title}
        </h3>
        <p className="mb-5 text-sm text-muted-foreground">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-border bg-accent/30 px-4 py-2 text-xs font-bold text-foreground/80 hover:bg-accent/50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="rounded-md bg-destructive px-4 py-2 text-xs font-bold text-foreground hover:bg-destructive/90"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ExportButton({ onExport }: { onExport: () => void }) {
  return (
    <button
      onClick={onExport}
      className="flex items-center gap-1 rounded-md border border-border/50 bg-accent/5 px-2 py-2 text-xs text-muted-foreground"
      aria-label="Exporter la matrice"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Exporter
    </button>
  );
}

function CloneModal({ roles, isOpen, onClose, onClone }: any) {
  const [source, setSource] = useState("");
  const [targets, setTargets] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) { setSource(""); setTargets(new Set()); }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const availableTargets = roles?.filter((r: any) => r.id !== source) ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="w-full max-w-xs rounded-lg border border-border bg-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-bold text-foreground">Dupliquer les permissions</h3>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="mb-3 w-full rounded border border-border bg-accent/30 px-2 py-2 text-xs text-foreground outline-none"
          aria-label="Rôle source"
        >
          <option value="">Sélectionner la source...</option>
          {roles?.map((r: any) => (
            <option key={r.id} value={r.id}>{r.nom ?? r.name}</option>
          ))}
        </select>
        {source && (
          <>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Rôles cibles</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setTargets(new Set(availableTargets.map((r: any) => r.id)))}
                  className="text-[10px] text-primary hover:text-primary/80"
                >
                  Tout
                </button>
                <button
                  onClick={() => setTargets(new Set())}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Aucun
                </button>
              </div>
            </div>
            <div className="mb-3 max-h-32 space-y-0.5 overflow-y-auto">
              {availableTargets.map((role: any) => (
                <label
                  key={role.id}
                  className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-accent/30"
                >
                  <input
                    type="checkbox"
                    checked={targets.has(role.id)}
                    onChange={() => {
                      const n = new Set(targets);
                      if (n.has(role.id)) n.delete(role.id);
                      else n.add(role.id);
                      setTargets(n);
                    }}
                    className="rounded border-border bg-accent/30"
                  />
                  <span className="text-xs text-foreground">{role.nom ?? role.name}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <button
          onClick={() => { onClone(source, Array.from(targets)); onClose(); }}
          disabled={!source || targets.size === 0}
          className="w-full rounded bg-primary py-2 text-xs font-bold text-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Copier vers {targets.size} rôle(s)
        </button>
      </motion.div>
    </motion.div>
  );
}

export function RoleMatrix() {
  const { data: permissionsData, isLoading: permLoading } = api.governance.permission.list.useQuery();
  const { data: rolesData, isLoading: rolesLoading } = api.governance.role.list.useQuery();
  const { data: linksData, isLoading: linksLoading } = api.governance.permission.getLinks.useQuery();
  const utils = api.useUtils();
  const toggleMutation = api.governance.permission.toggle.useMutation({
    onSuccess: () => { utils.governance.permission.getLinks.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const [activeLinks, setActiveLinks] = useState<MatrixLink[]>([]);

  useEffect(() => {
    if (linksData) setActiveLinks(linksData);
  }, [linksData]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"compact" | "expanded">("compact");
  const [selected, setSelected] = useState<any>(null);
  const [showClone, setShowClone] = useState(false);
  const [confirm, setConfirm] = useState<{ roleId: string; permId: string; roleName: string; permName: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const permissions = (permissionsData ?? []) as Permission[];
  const roles = ((rolesData ?? []) as Array<any>).map((r) => ({ id: r.id, nom: r.nom, code: r.code ?? "" })) as Role[];

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const stats = useMemo(() => ({
    links: activeLinks.filter((l) => l.active).length,
    roles: roles.length,
    perms: permissions.length,
    coverage: roles.length && permissions.length
      ? Math.round((activeLinks.filter((l) => l.active).length / (roles.length * permissions.length)) * 100)
      : 0,
  }), [roles, permissions, activeLinks]);

  const cats = useMemo(() => {
    const m = new Map<string, { c: number; a: number }>();
    permissions.forEach((p) => {
      const e = m.get(p.module) || { c: 0, a: 0 };
      e.c += 1;
      if (activeLinks.some((l) => l.permissionId === p.id && l.active)) e.a += 1;
      m.set(p.module, e);
    });
    return m;
  }, [permissions, activeLinks]);

  const filtered = useMemo(() => {
    return permissions.filter((p) => {
      const s = search.toLowerCase();
      return (s === "" || p.nom.toLowerCase().includes(s) || p.code.toLowerCase().includes(s)) &&
        (category === "all" || p.module === category);
    });
  }, [permissions, search, category]);

  const grouped = useMemo(() => {
    const g: Record<string, { perms: Permission[]; active: number }> = {};
    filtered.forEach((p) => {
      if (!g[p.module]) g[p.module] = { perms: [], active: 0 };
      g[p.module]!.perms.push(p);
      if (activeLinks.some((l) => l.permissionId === p.id && l.active)) g[p.module]!.active += 1;
    });
    return g;
  }, [filtered, activeLinks]);

  const linked = useCallback(
    (rid: string, pid: string) => activeLinks.some((l) => l.roleId === rid && l.permissionId === pid && l.active),
    [activeLinks],
  );

  const executeToggle = useCallback((rid: string, pid: string, rn: string, pn: string) => {
    const active = linked(rid, pid);
    setActiveLinks((prev) =>
      active
        ? prev.filter((l) => !(l.roleId === rid && l.permissionId === pid))
        : [...prev, { permissionId: pid, roleId: rid, active: true }],
    );
    toggleMutation.mutate(
      { permissionId: pid, roleId: rid, active: !active },
      {
        onError: () => {
          setActiveLinks((prev) =>
            active
              ? [...prev, { roleId: rid, permissionId: pid, active: true }]
              : prev.filter((l) => !(l.roleId === rid && l.permissionId === pid)),
          );
          toast.error("Erreur lors de la mise à jour");
        },
      },
    );
  }, [linked, toggleMutation]);

  const toggle = useCallback((rid: string, pid: string, rn: string, pn: string) => {
    const active = linked(rid, pid);
    if (active) setConfirm({ roleId: rid, permId: pid, roleName: rn, permName: pn });
    else executeToggle(rid, pid, rn, pn);
  }, [linked, executeToggle]);

  const export_ = useCallback(() => {
    const csvRows = permissions.flatMap((perm) =>
      roles.map((role) => ({
        permissionCode: perm.code,
        permissionNom: perm.nom,
        module: perm.module,
        roleCode: role.code,
        roleNom: role.nom,
        active: linked(role.id, perm.id) ? "OUI" : "NON",
      })),
    );
    const headers = ["Permission", "Code", "Module", "Rôle", "Code Rôle", "Actif"];
    const csv = [headers.join(","), ...csvRows.map((r) =>
      [r.permissionNom, r.permissionCode, r.module, r.roleNom, r.roleCode, r.active].map((v) => `"${v}"`).join(","),
    )].join("\n");
    const b = new Blob([csv], { type: "text/csv" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = "matrice-permissions.csv";
    a.click();
    toast.success("Exporté");
  }, [permissions, roles, linked]);

  const clone = useCallback(async (src: any, tgts: any[]) => {
    const sourceId = src;
    for (const t of tgts) {
      const targetId = t;
      const links = activeLinks.filter((l) => l.roleId === sourceId && l.active);
      for (const l of links) {
        toggleMutation.mutate({ permissionId: l.permissionId, roleId: targetId, active: true });
      }
    }
    toast.success(`${tgts.length} rôle(s) mis à jour`);
  }, [activeLinks, toggleMutation]);

  const toggleCat = (cat: string) => {
    const n = new Set(collapsed);
    collapsed.has(cat) ? n.delete(cat) : n.add(cat);
    setCollapsed(n);
  };

  const toggleAll = (expand: boolean) => setCollapsed(expand ? new Set() : new Set(Object.keys(grouped)));

  if (permLoading || rolesLoading || linksLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-primary" />
        Chargement de la matrice...
      </div>
    );
  }

  return (
    <div className="animate-in fade-in min-h-screen duration-300">
      <ModuleHeader
        title="Matrice des permissions"
        description="Gérez les permissions par rôle"
      />

      <ConfirmDialog
        isOpen={!!confirm}
        title="Confirmer la révocation"
        message={
          confirm
            ? `Êtes-vous sûr de vouloir révoquer "${confirm.permName}" pour le rôle "${confirm.roleName}" ?`
            : ""
        }
        confirmLabel="Révoquer"
        cancelLabel="Annuler"
        onConfirm={() => {
          if (confirm) {
            executeToggle(confirm.roleId, confirm.permId, confirm.roleName, confirm.permName);
            setConfirm(null);
          }
        }}
        onCancel={() => setConfirm(null)}
      />

      <DetailModal
        open={!!selected}
        onOpenChange={(o: boolean) => { if (!o) setSelected(null); }}
        permission={selected?.permission ?? null}
      />

      <CloneModal
        roles={roles}
        isOpen={showClone}
        onClose={() => setShowClone(false)}
        onClone={clone}
      />

      <div className="mb-3 rounded-lg border border-border bg-accent/5 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">RÉSUMÉ</span>
          <div className="flex gap-2">
            <button onClick={() => toggleAll(true)} className="text-[10px] text-muted-foreground hover:text-foreground">Déplier</button>
            <button onClick={() => toggleAll(false)} className="text-[10px] text-muted-foreground hover:text-foreground">Réduire</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center md:grid-cols-4">
          <div>
            <div className="text-lg font-bold text-foreground">{stats.roles}</div>
            <div className="text-[9px] text-muted-foreground">RÔLES</div>
          </div>
          <div>
            <div className="text-lg font-bold text-success-foreground">{stats.links}</div>
            <div className="text-[9px] text-muted-foreground">LIENS ACTIFS</div>
          </div>
          <div>
            <div className="text-lg font-bold text-primary">{stats.perms}</div>
            <div className="text-[9px] text-muted-foreground">PERMISSIONS</div>
          </div>
          <div className="hidden md:block">
            <div className="text-lg font-bold text-warning-foreground">{stats.coverage}%</div>
            <div className="text-[9px] text-muted-foreground">COUVERTURE</div>
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-[220px] min-w-[160px] flex-1">
          <Search className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" size={12} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher... (Cmd+K)"
            className="w-full rounded-md border border-border/50 bg-accent/5 py-2 pr-6 pl-8 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
            aria-label="Rechercher une permission"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
              aria-label="Effacer la recherche"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-border/50 bg-accent/5 px-2 py-2 text-xs text-foreground outline-none"
          aria-label="Filtrer par catégorie"
        >
          <option value="all">Toutes les catégories</option>
          {Array.from(cats.keys()).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={() => setMode(mode === "compact" ? "expanded" : "compact")}
          className={`flex items-center gap-1 rounded-md border px-2 py-2 text-xs ${
            mode === "compact"
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border/50 bg-accent/5 text-muted-foreground"
          }`}
          aria-label={mode === "compact" ? "Passer en mode étendu" : "Passer en mode compact"}
          aria-pressed={mode === "expanded"}
        >
          {mode === "compact" ? <Eye size={12} /> : <EyeOff size={12} />}
          {mode === "compact" ? "Étendu" : "Compact"}
        </button>
        <button
          onClick={() => setShowClone(true)}
          className="flex items-center gap-1 rounded-md border border-border/50 bg-accent/5 px-2 py-2 text-xs text-muted-foreground"
          aria-label="Dupliquer les permissions d'un rôle"
        >
          <Copy size={12} />
          Dupliquer
        </button>
        <ExportButton onExport={export_} />
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1 rounded-md border border-border/50 bg-accent/5 px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Rafraîchir les données"
          title="Rafraîchir"
        >
          <RefreshCw size={12} />
          Rafraîchir
        </button>
      </div>

      <MatrixGrid
        roles={roles}
        grouped={grouped}
        activeLinks={activeLinks}
        toggle={toggle}
        collapsed={collapsed}
        onToggleCat={toggleCat}
        mode={mode}
        isPending={false}
        onSelectPermission={setSelected}
        cats={cats}
        category={category}
        onSetCategory={setCategory}
      />

      <div className="mt-4 flex flex-wrap gap-4 rounded-lg border border-border/50 bg-accent/5 px-4 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-6 items-center justify-center rounded border-2 border-success bg-success/10">
            <Check size={10} className="text-success-foreground" />
          </div>
          <span>Activé</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-6 items-center justify-center rounded border-2 border-border bg-accent/30">
            <X size={10} className="text-muted-foreground" />
          </div>
          <span>Désactivé</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-yellow-400" />
          <span>Système</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-primary/80" />
          <span>Personnalisé</span>
        </div>
        <div className="flex items-center gap-1">
          <Loader2 size={10} className="animate-spin" />
          <span>En cours</span>
        </div>
      </div>
    </div>
  );
}
