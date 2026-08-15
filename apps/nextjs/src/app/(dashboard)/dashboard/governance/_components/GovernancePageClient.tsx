"use client";

import { useState, useMemo } from "react";
import { Plus, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { ModuleHeader } from "./ModuleHeader";
import { InviteModal } from "./InviteModal";
import { StatsCards } from "./StatsCards";
import { MemberTable, type Member } from "./MemberTable";
import { GovernanceSidePanel } from "./GovernanceSidePanel";
import { BulkActionBar } from "./BulkActionBar";
import { ConfirmationDialog } from "~/components/ui/confirmation-dialog";
import { api } from "~/trpc/react";
import { toast } from "sonner";

type PanelMode = "view" | "edit" | "add";
type ConfirmAction =
  | { type: "delete"; member: Member }
  | { type: "bulkDelete" }
  | null;

export function GovernancePageClient() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("view");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: membersData, isLoading } = api.governance.member.list.useQuery({
    page,
    limit: 50,
    search: search || undefined,
    statut: statusFilter !== "all" ? (statusFilter as "active" | "invited" | "suspended") : undefined,
  });

  const utils = api.useUtils();

  const inviteMutation = api.governance.member.invite.useMutation({
    onSuccess: () => {
      toast.success("Invitation envoyée");
      setPanelOpen(false);
      utils.governance.member.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = api.governance.member.update.useMutation({
    onSuccess: () => {
      toast.success("Membre mis à jour");
      setPanelOpen(false);
      utils.governance.member.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleStatusMutation = api.governance.member.toggleStatus.useMutation({
    onSuccess: () => {
      setSelectedIds(new Set());
      utils.governance.member.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setTogglingId(null),
  });

  const deleteMutation = api.governance.member.delete.useMutation({
    onSuccess: () => {
      toast.success("Membre supprimé");
      setSelectedIds(new Set());
      utils.governance.member.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkToggleStatusMutation = api.governance.member.bulkToggleStatus.useMutation({
    onMutate: () => setTogglingId("__bulk__"),
    onSuccess: (data) => {
      toast.success(`${data.count} membre(s) mis à jour`);
      setSelectedIds(new Set());
      utils.governance.member.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setTogglingId(null),
  });

  const bulkDeleteMutation = api.governance.member.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} membre(s) supprimé(s)`);
      setSelectedIds(new Set());
      utils.governance.member.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const openPanel = (mode: PanelMode, member?: Member) => {
    setPanelMode(mode);
    setSelectedMember(member ?? null);
    setPanelOpen(true);
  };

  const handleEdit = (member: Member) => {
    openPanel("edit", member);
  };

  const handleToggleStatus = (member: Member) => {
    if (togglingId === member.id) return;
    setTogglingId(member.id);
    toggleStatusMutation.mutate({ id: member.id });
  };

  const handleDelete = (member: Member) => {
    setConfirm({ type: "delete", member });
  };

  const handleConfirmDelete = () => {
    if (!confirm || confirm.type !== "delete") return;
    deleteMutation.mutate({ id: confirm.member.id });
    setConfirm(null);
  };

  const handleBulkToggleStatus = () => {
    if (selectedIds.size === 0) return;
    bulkToggleStatusMutation.mutate({ ids: Array.from(selectedIds) });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setConfirm({ type: "bulkDelete" });
  };

  const handleConfirmBulkDelete = () => {
    if (!confirm || confirm.type !== "bulkDelete") return;
    bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) });
    setConfirm(null);
  };

  const handleSave = (data: Partial<Member>) => {
    if (panelMode === "add") {
      inviteMutation.mutate({
        email: data.email ?? "",
        nom: data.nom ?? "",
        prenom: data.prenom ?? undefined,
        roleId: data.role?.id ?? "",
      });
    } else if (panelMode === "edit" && selectedMember) {
      updateMutation.mutate({
        id: selectedMember.id,
        nom: data.nom ?? undefined,
        prenom: data.prenom ?? undefined,
        email: data.email ?? undefined,
        telephone: (data as any).telephone ?? undefined,
        roleId: data.role?.id ?? undefined,
        statut: data.statut ?? undefined,
      });
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleRoleFilterChange = (value: string) => {
    setRoleFilter(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const members = (membersData?.members ?? []) as unknown as Member[];

  const stats = useMemo(() => {
    const total = members.length;
    const active = members.filter((m) => m.statut === "active").length;
    const invited = members.filter((m) => m.statut === "invited").length;
    const suspended = members.filter((m) => m.statut === "suspended").length;
    return { total, active, invited, suspended };
  }, [members]);

  return (
    <>
      <ModuleHeader
        title="Utilisateurs & Rôles"
        description="Gérez les utilisateurs, leurs rôles et permissions"
        actions={
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-primary/80 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Inviter un membre
          </button>
        }
      />

      <StatsCards stats={stats} />

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Rechercher un membre..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted/50 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
        </div>
        <Select value={roleFilter} onValueChange={handleRoleFilterChange}>
          <SelectTrigger className="w-full border-border bg-muted/50 text-foreground sm:w-40">
            <SelectValue placeholder="Rôle" />
          </SelectTrigger>
          <SelectContent className="border-border bg-card text-foreground">
            <SelectItem value="all">Tous les rôles</SelectItem>
            <SelectItem value="Administrateur">Administrateur</SelectItem>
            <SelectItem value="Vendeur">Vendeur</SelectItem>
            <SelectItem value="Comptable">Comptable</SelectItem>
            <SelectItem value="Magasinier">Magasinier</SelectItem>
            <SelectItem value="RH">RH</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-full border-border bg-muted/50 text-foreground sm:w-40">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent className="border-border bg-card text-foreground">
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="invited">Invité</SelectItem>
            <SelectItem value="suspended">Suspendu</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Chargement...
          </div>
        ) : (
          <>
            <MemberTable
              members={members}
              selectedIds={selectedIds}
              togglingId={togglingId}
              onSelectionChange={setSelectedIds}
              onEdit={handleEdit}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
            />
            {membersData && membersData.total > 50 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {membersData.page} sur {Math.ceil(membersData.total / 50)}
                  {" "}({membersData.total} membre{membersData.total > 1 ? "s" : ""})
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" /> Précédent
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= Math.ceil((membersData.total ?? 0) / 50)}
                    className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    Suivant <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <InviteModal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} />

      <GovernanceSidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        mode={panelMode}
        member={selectedMember}
        onSave={handleSave}
      />

      <BulkActionBar
        selectedCount={selectedIds.size}
        loading={togglingId === "__bulk__"}
        onClear={() => setSelectedIds(new Set())}
        onToggleStatus={handleBulkToggleStatus}
        onDelete={handleBulkDelete}
      />

      <ConfirmationDialog
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.type === "delete") handleConfirmDelete();
          else if (confirm?.type === "bulkDelete") handleConfirmBulkDelete();
        }}
        title={
          confirm?.type === "delete"
            ? `Supprimer ${confirm.member.prenom ?? ""} ${confirm.member.nom} ?`
            : "Supprimer plusieurs membres ?"
        }
        description={
          confirm?.type === "delete"
            ? "Ce membre sera désactivé et n'aura plus accès à la plateforme."
            : `${selectedIds.size} membre(s) vont être désactivé(s). Cette action est réversible depuis le profil de chaque membre.`
        }
        confirmText="Supprimer"
        variant="destructive"
      />
    </>
  );
}
