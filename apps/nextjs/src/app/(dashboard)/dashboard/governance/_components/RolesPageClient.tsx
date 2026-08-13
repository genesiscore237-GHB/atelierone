"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Edit3, Filter, Loader2, Plus, Search, Settings, Shield, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmationDialog } from "~/components/ui/confirmation-dialog";
import { api } from "~/trpc/react";
import { RoleRow, type Role } from "./RoleRow";
import { RolesSidePanel } from "./RolesSidePanel";
import { ModuleHeader } from "./ModuleHeader";

type PanelMode = "create" | "edit";

export function RolesPageClient() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("create");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "system" | "custom">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const { data: rolesData, isLoading, error } = api.governance.role.list.useQuery();
  const utils = api.useUtils();

  const createMutation = api.governance.role.create.useMutation({
    onSuccess: () => { toast.success("Rôle créé"); setPanelOpen(false); utils.governance.role.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = api.governance.role.update.useMutation({
    onSuccess: () => { toast.success("Rôle mis à jour"); setPanelOpen(false); utils.governance.role.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const duplicateMutation = api.governance.role.duplicate.useMutation({
    onSuccess: () => { toast.success("Rôle dupliqué"); utils.governance.role.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = api.governance.role.delete.useMutation({
    onSuccess: () => { toast.success("Rôle supprimé"); utils.governance.role.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const bulkDeleteMutation = api.governance.role.bulkDelete.useMutation({
    onSuccess: (data) => { toast.success(`${data.count} rôle(s) supprimé(s)`); setSelectedIds(new Set()); utils.governance.role.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const openPanel = (mode: PanelMode, role?: Role) => {
    setPanelMode(mode);
    setSelectedRole(role ?? null);
    setPanelOpen(true);
  };

  const handleSave = (data: Partial<Role> & { permissions: string[] }) => {
    if (panelMode === "create") {
      createMutation.mutate({
        nom: data.nom ?? "",
        code: (data as any).code ?? "",
        description: (data as any).description,
        niveau: data.niveau ?? 0,
        permissions: data.permissions,
      });
    } else if (panelMode === "edit" && selectedRole) {
      updateMutation.mutate({
        id: selectedRole.id,
        nom: data.nom ?? undefined,
        description: (data as any).description ?? undefined,
        niveau: data.niveau ?? undefined,
        permissions: data.permissions,
      });
    }
  };

  const handleDuplicate = (role: Role) => duplicateMutation.mutate({ id: role.id });
  const handleDelete = (role: Role) => setConfirmDelete(role);
  const toggleRoleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const roles = (rolesData ?? []) as Role[];

  const stats = useMemo(() => ({
    total: roles.length,
    members: roles.reduce((acc, r) => acc + (r.usersCount || 0), 0),
  }), [roles]);

  const filteredRoles = roles.filter((r) => {
    const matchesSearch = r.nom.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-3 h-8 w-8 animate-spin text-primary" />
        Chargement des rôles...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p>Erreur lors du chargement</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      <ModuleHeader
        title="Rôles"
        description="Gérez les rôles et leurs permissions"
        actions={
          <button
            onClick={() => { setPanelMode("create"); setSelectedRole(null); setPanelOpen(true); }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/80"
          >
            <Plus className="h-4 w-4" />
            Créer un rôle
          </button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:mb-8 lg:gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="group relative overflow-hidden rounded-xl border border-border/50 bg-accent/5 p-4 backdrop-blur-xl md:rounded-2xl md:p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase md:text-xs">Total</span>
            <div className="rounded-lg bg-primary/10 p-1.5 text-primary md:p-2"><Shield size={14} /></div>
          </div>
          <p className="mt-2 text-xl font-black tracking-tight text-foreground md:text-3xl">{stats.total}</p>
          <p className="text-[10px] text-muted-foreground md:text-xs">Rôles</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="group relative overflow-hidden rounded-xl border border-border/50 bg-accent/5 p-4 backdrop-blur-xl md:rounded-2xl md:p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase md:text-xs">Membres</span>
            <div className="rounded-lg bg-success/10 p-1.5 text-success-foreground md:p-2"><Users size={14} /></div>
          </div>
          <p className="mt-2 text-xl font-black tracking-tight text-foreground md:text-3xl">{stats.members}</p>
          <p className="text-[10px] text-muted-foreground md:text-xs">Affectés</p>
        </motion.div>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un rôle..."
              className="w-full min-w-[200px] rounded-xl border border-border/50 bg-accent/5 py-2.5 pl-9 pr-3 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 md:py-3 md:pl-10"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all md:py-3.5 md:px-4 ${
              filterType !== "all"
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/50 bg-accent/5 text-muted-foreground hover:border-border"
            }`}
          >
            <Filter size={14} />
            Filtres
            {filterType !== "all" && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold">1</span>
            )}
          </button>
        </div>
        <button
          onClick={() => openPanel("create")}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black tracking-widest text-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/80 hover:shadow-primary/30 md:px-6 md:py-3.5"
        >
          <Plus size={14} />
          <span className="hidden md:inline">Nouveau</span>
        </button>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden rounded-xl border border-border/50 bg-accent/5 backdrop-blur-xl lg:mb-6 lg:rounded-2xl"
          >
            <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Type de rôle</span>
                <button onClick={() => { setFilterType("all"); setShowFilters(false); }} className="text-[10px] text-muted-foreground hover:text-foreground">Réinitialiser</button>
              </div>
              <div className="mt-3 flex gap-2">
                {(["all", "system", "custom"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      filterType === type
                        ? "bg-primary/20 text-primary"
                        : "bg-accent/30 text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {{ all: "Tous", system: "Système", custom: "Personnalisé" }[type]}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-border/50 bg-accent/5 px-4 py-3">
          <span className="text-sm font-medium text-foreground">{selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}</span>
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-sm text-muted-foreground hover:text-foreground transition-colors">
            Annuler
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/50 bg-accent/5 shadow-2xl backdrop-blur-3xl lg:rounded-[2.5rem]">
        <table className="w-full min-w-[900px] text-left">
          <thead className="bg-accent/10 text-[9px] font-black tracking-[0.2em] text-muted-foreground uppercase md:text-[10px]">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredRoles.length && filteredRoles.length > 0}
                  onChange={() => {
                    if (selectedIds.size === filteredRoles.length) setSelectedIds(new Set());
                    else setSelectedIds(new Set(filteredRoles.map((r) => r.id)));
                  }}
                  className="rounded border-border bg-accent/30"
                />
              </th>
              <th className="px-4 py-3 font-black">Nom</th>
              <th className="px-4 py-3 font-black">Code</th>
              <th className="px-4 py-3 font-black">Niveau</th>
              <th className="px-4 py-3 font-black">Permissions</th>
              <th className="px-4 py-3 font-black">Membres</th>
              <th className="px-4 py-3 font-black text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredRoles.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">Aucun rôle trouvé</td>
              </tr>
            ) : (
              filteredRoles.map((role, i) => (
                <RoleRow
                  key={role.id}
                  role={role}
                  index={i}
                  selected={selectedIds.has(role.id)}
                  onSelect={() => toggleRoleSelect(role.id)}
                  onEdit={(r) => openPanel("edit", r)}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <RolesSidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        mode={panelMode}
        role={selectedRole}
        onSave={handleSave}
      />

      <ConfirmationDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) { deleteMutation.mutate({ id: confirmDelete.id }); setConfirmDelete(null); }
        }}
        title={confirmDelete ? `Supprimer le rôle "${confirmDelete.nom}" ?` : ""}
        description="Ce rôle sera définitivement supprimé. Les utilisateurs avec ce rôle perdront leurs permissions associées."
        confirmText="Supprimer"
        variant="destructive"
      />

      <ConfirmationDialog
        isOpen={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => {
          bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) });
          setConfirmBulkDelete(false);
        }}
        title="Supprimer plusieurs rôles ?"
        description={`${selectedIds.size} rôle(s) vont être supprimés. Cette action est irréversible.`}
        confirmText="Supprimer"
        variant="destructive"
      />
    </div>
  );
}
