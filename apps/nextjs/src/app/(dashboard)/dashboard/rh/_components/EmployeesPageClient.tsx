"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, Filter, Loader2, Plus, Search, Users, X,
} from "lucide-react";
import { api } from "~/trpc/react";
import { usePermissions } from "~/hooks/usePermissions";
import { EmployeeForm } from "./EmployeeForm";
import { ModuleHeader } from "../../governance/_components/ModuleHeader";

interface Employee {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  emailPersonnel: string | null;
  telephone: string | null;
  fonction: string;
  typeEmploye: string;
  statut: string;
  dateEmbauche: string | null;
  salaireBase: string | null;
  photoUrl: string | null;
  userId: string | null;
  hasAccount: boolean;
  createdAt: string;
}

const statutColors: Record<string, string> = {
  actif: "text-success-foreground bg-success/10",
  conge: "text-warning-foreground bg-warning/10",
  suspendu: "text-destructive bg-destructive/10",
  archive: "text-muted-foreground bg-muted/10",
};

const typeLabels: Record<string, string> = {
  permanent: "CDI",
  contractuel: "CDD",
  stagiaire: "Stage",
  temporaire: "Temporaire",
  apprenti: "Apprenti",
  prestataire: "Prestataire",
};

export function EmployeesPageClient() {
  const { hasPermission } = usePermissions();
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const limit = 50;

  const { data, isLoading, error } = api.rh.list.useQuery({
    page,
    limit,
    search: search || undefined,
    statut: filterStatut !== "all" ? (filterStatut as any) : undefined,
    typeEmploye: filterType !== "all" ? (filterType as any) : undefined,
    departmentId: filterDepartment !== "all" ? Number(filterDepartment) : undefined,
  });
  const { data: departments } = api.rh.listDepartments.useQuery();
  const { data: stats } = api.rh.stats.useQuery();
  const utils = api.useUtils();

  const employees = (data?.employees ?? []) as unknown as Employee[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const openCreate = () => { setEditId(null); setPanelOpen(true); };
  const openEdit = (id: string) => { setEditId(id); setPanelOpen(true); };
  const closePanel = () => { setPanelOpen(false); setEditId(null); };

  const refresh = () => {
    utils.rh.list.invalidate();
    utils.rh.stats.invalidate();
  };

  return (
    <div className="animate-in fade-in duration-500 p-6">
      <ModuleHeader
        title="Employés"
        description="Gérez les employés de votre librairie"
        actions={
          hasPermission("rh.utilisateur.creer") && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Nouvel employé
            </button>
          )
        }
      />

      {stats && (
        <div className="mb-6 grid grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Actifs", value: stats.actif, color: "text-success-foreground" },
            { label: "Congé", value: stats.conge, color: "text-warning-foreground" },
            { label: "Suspendus", value: stats.suspendu, color: "text-destructive" },
            { label: "Archivés", value: stats.archive, color: "text-muted-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-accent/5 p-4">
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{s.label}</p>
              <p className={`mt-1 text-2xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" size={14} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher..."
            className="w-full rounded-lg border border-border bg-accent/5 py-2 pr-3 pl-9 text-sm text-foreground outline-none focus:border-primary/50"
          />
        </div>
        <select
          value={filterStatut}
          onChange={(e) => { setFilterStatut(e.target.value); setPage(1); }}
          className="rounded-lg border border-border bg-accent/5 px-3 py-2 text-xs text-foreground outline-none"
        >
          <option value="all">Tous statuts</option>
          <option value="actif">Actif</option>
          <option value="conge">Congé</option>
          <option value="suspendu">Suspendu</option>
          <option value="archive">Archivé</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          className="rounded-lg border border-border bg-accent/5 px-3 py-2 text-xs text-foreground outline-none"
        >
          <option value="all">Tous types</option>
          <option value="permanent">CDI</option>
          <option value="contractuel">CDD</option>
          <option value="stagiaire">Stage</option>
          <option value="temporaire">Temporaire</option>
          <option value="apprenti">Apprenti</option>
          <option value="prestataire">Prestataire</option>
        </select>
        <select
          value={filterDepartment}
          onChange={(e) => { setFilterDepartment(e.target.value); setPage(1); }}
          className="rounded-lg border border-border bg-accent/5 px-3 py-2 text-xs text-foreground outline-none"
        >
          <option value="all">Tous départements</option>
          {(departments ?? []).map((d) => (
            <option key={d.id} value={String(d.id)}>{d.name}</option>
          ))}
        </select>
        <button
          onClick={refresh}
          className="rounded-lg border border-border bg-accent/5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Loader2 size={14} className="inline" /> Rafraîchir
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-3 h-8 w-8 animate-spin text-primary" />
          Chargement...
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertTriangle className="mb-2 h-8 w-8 text-destructive" />
          <p>Erreur de chargement</p>
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users size={48} className="mb-4 opacity-30" />
          <p className="text-lg font-bold">Aucun employé</p>
          <p className="mt-1 text-sm">Cliquez sur "Nouvel employé" pour commencer</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                <th className="px-4 py-3 text-left">Matricule</th>
                <th className="px-4 py-3 text-left">Nom & Prénom</th>
                <th className="px-4 py-3 text-left">Fonction</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Compte</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr
                  key={emp.id}
                  className="border-b border-border transition-colors hover:bg-accent/5"
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{emp.matricule}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-foreground">{emp.prenom} {emp.nom}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground/80">{emp.fonction}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md border border-border bg-accent/5 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {typeLabels[emp.typeEmploye] ?? emp.typeEmploye}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${statutColors[emp.statut] ?? "text-muted-foreground"}`}>
                      {emp.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {emp.telephone && <div>{emp.telephone}</div>}
                    {emp.emailPersonnel && <div className="truncate max-w-[160px]">{emp.emailPersonnel}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {emp.hasAccount ? (
                      <span className="text-[10px] font-bold text-success-foreground">Oui</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Non</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(emp.id)}
                      className="rounded-lg border border-border px-3 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} employé(s) — Page {page}/{totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-30"
            >
              Précédent
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-30"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      <EmployeeForm
        isOpen={panelOpen}
        onClose={closePanel}
        employeeId={editId}
        onSaved={() => { closePanel(); refresh(); }}
      />
    </div>
  );
}
