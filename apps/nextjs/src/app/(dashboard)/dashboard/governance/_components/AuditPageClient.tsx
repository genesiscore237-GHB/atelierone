"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Clock,
  Download,
  RefreshCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { ModuleHeader } from "./ModuleHeader";

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

function getRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Il y a ${days}j`;
  return new Date(date).toLocaleDateString("fr-FR");
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const PAGE_SIZE = 20;

const actionIcons: Record<string, any> = {
  INVITE_MEMBER: UserPlus,
  LOGIN_SUCCESS: ShieldCheck,
  LOGIN_FAILED: ShieldAlert,
  user_invite: UserPlus,
  user_create: UserPlus,
  user_toggleStatus: RefreshCcw,
  user_delete: Trash2,
  role_create: ShieldCheck,
  role_update: Shield,
  role_delete: Trash2,
  permission_toggle: ShieldAlert,
};
const DefaultIcon = Clock;

const actionLabels: Record<string, string> = {
  INVITE_MEMBER: "Invitation",
  LOGIN_SUCCESS: "Connexion",
  LOGIN_FAILED: "Échec connexion",
  user_invite: "Invitation",
  user_create: "Création utilisateur",
  user_toggleStatus: "Changement de statut",
  user_delete: "Suppression utilisateur",
  role_create: "Création rôle",
  role_update: "Mise à jour rôle",
  role_delete: "Suppression rôle",
  permission_toggle: "Permission modifiée",
};

export function AuditPageClient() {
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [page, setPage] = useState(1);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { data, isLoading, refetch } = api.governance.audit.list.useQuery({
    page,
    limit: PAGE_SIZE,
    action: filterAction !== "all" ? filterAction : undefined,
  });

  const logs = (data?.logs ?? []) as unknown as AuditLog[];
  const total = (data?.total ?? 0) as number;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentLogs = search
    ? logs.filter(
        (log) =>
          log.action.toLowerCase().includes(search.toLowerCase()) ||
          log.entityType.toLowerCase().includes(search.toLowerCase()) ||
          (log.ipAddress ?? "").includes(search),
      )
    : logs;

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayLogs = logs.filter((l) => l.createdAt?.startsWith(today));
    const contributors = new Set(logs.map((l) => l.entityType)).size;
    return {
      total: total,
      today: todayLogs.length,
      contributors,
    };
  }, [logs, total]);

  const actions = useMemo(() => {
    const unique = new Set(logs.map((l) => l.action));
    return Array.from(unique);
  }, [logs]);

  const getActionInfo = (action: string) => ({
    Icon: actionIcons[action] ?? DefaultIcon,
    label: actionLabels[action] ?? action,
  });

  const handleRefresh = () => {
    refetch();
    toast.success("Logs actualisés");
  };

  const handleExport = () => {
    const csv = [
      "Action,Type,Détails,IP,Date",
      ...logs.map((l) =>
        [l.action, l.entityType, (l.details ?? "").replace(/"/g, '""'), l.ipAddress ?? "", l.createdAt ?? ""]
          .map((v) => `"${v}"`)
          .join(","),
      ),
    ].join("\n");
    const b = new Blob([csv], { type: "text/csv" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("Exporté");
  };

  return (
    <div className="animate-in fade-in duration-500">
      <ModuleHeader
        title="Audit"
        description="Consultez l'historique des actions"
      />
      <div className="mb-6 grid grid-cols-3 gap-3 lg:mb-8 lg:gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="group relative overflow-hidden rounded-xl border border-border/50 bg-accent/5 p-4 backdrop-blur-xl md:rounded-2xl md:p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase md:text-xs">Total</span>
            <div className="rounded-lg bg-primary/10 p-1.5 text-primary md:p-2">
              <Shield size={14} />
            </div>
          </div>
          <p className="mt-2 text-xl font-black tracking-tight text-foreground md:text-3xl">{stats.total}</p>
          <p className="text-[10px] text-muted-foreground md:text-xs">Événements</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="group relative overflow-hidden rounded-xl border border-border/50 bg-accent/5 p-4 backdrop-blur-xl md:rounded-2xl md:p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase md:text-xs">Aujourd&apos;hui</span>
            <div className="rounded-lg bg-success/10 p-1.5 text-success-foreground md:p-2">
              <Calendar size={14} />
            </div>
          </div>
          <p className="mt-2 text-xl font-black tracking-tight text-foreground md:text-3xl">{stats.today}</p>
          <p className="text-[10px] text-muted-foreground md:text-xs">Événements</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="group relative overflow-hidden rounded-xl border border-border/50 bg-accent/5 p-4 backdrop-blur-xl md:rounded-2xl md:p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase md:text-xs">Contributeurs</span>
            <div className="rounded-lg bg-primary/10 p-1.5 text-primary md:p-2">
              <User size={14} />
            </div>
          </div>
          <p className="mt-2 text-xl font-black tracking-tight text-foreground md:text-3xl">{stats.contributors}</p>
          <p className="text-[10px] text-muted-foreground md:text-xs">Types d&apos;entités</p>
        </motion.div>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher..."
              className="w-full min-w-[200px] rounded-xl border border-border/50 bg-accent/5 py-2.5 pl-9 pr-3 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 md:py-3 md:pl-10"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X size={12} />
              </button>
            )}
          </div>
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
            className="rounded-xl border border-border/50 bg-accent/5 px-3 py-2.5 text-xs text-foreground outline-none md:py-3"
            aria-label="Filtrer par action"
          >
            <option value="all">Toutes les actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>{actionLabels[a] ?? a}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-accent/5 px-3 py-2.5 text-xs text-muted-foreground transition-all hover:border-border hover:text-foreground md:px-4 md:py-3"
          >
            <RefreshCcw size={12} className={isLoading ? "animate-spin" : ""} />
            Actualiser
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-accent/5 px-3 py-2.5 text-xs text-muted-foreground transition-all hover:border-border hover:text-foreground md:px-4 md:py-3"
          >
            <Download size={12} />
            Exporter
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mr-3" />
          Chargement...
        </div>
      ) : (
        <>
          <div className="space-y-3 md:space-y-4">
            {currentLogs.length === 0 ? (
              <div className="rounded-xl border border-border/50 bg-accent/5 p-8 text-center text-sm text-muted-foreground">
                Aucun log trouvé
              </div>
            ) : (
              currentLogs.map((log, index) => {
                const { Icon, label } = getActionInfo(log.action);
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="group relative overflow-hidden rounded-xl border border-border/50 bg-accent/5 backdrop-blur-xl transition-all hover:border-border md:rounded-2xl"
                  >
                    <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-primary md:w-1.5" />
                    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-6">
                      <div className="flex items-start gap-3 md:items-center">
                        <div className="relative">
                          <div className="rounded-lg bg-primary/10 p-2 text-primary md:rounded-xl md:p-3">
                            <Icon size={16} />
                          </div>
                          {index < currentLogs.length - 1 && (
                            <div className="absolute left-1/2 top-full h-8 w-px -translate-x-1/2 bg-gradient-to-b from-primary/20 to-transparent md:h-12" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground md:text-base">{label}</p>
                          <span className="rounded bg-accent/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground md:text-xs">
                            {log.entityType}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar size={10} />
                            {formatDate(log.createdAt)}
                          </div>
                          {log.ipAddress && (
                            <div className="text-[10px] text-muted-foreground font-mono">{log.ipAddress}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground md:text-xs">{getRelativeTime(log.createdAt)}</div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {currentLogs.length} résultat(s) sur {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-border/50 bg-accent/5 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-border hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Précédent
                </button>
                <span className="min-w-[80px] text-center text-xs text-muted-foreground">
                  Page {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border/50 bg-accent/5 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-border hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
