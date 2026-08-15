"use client";

import { useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { Building2, ChevronDown, ChevronRight, UserRound } from "lucide-react";
import { Skeleton } from "~/components/ui/skeleton";

type EmpNode = {
  id: number;
  nom: string;
  prenom: string;
  matricule: string;
  fonction: string;
  statut: string;
  departmentId: number | null;
  managerId: number | null;
  children: EmpNode[];
};

/** RH-01 — Organigramme : arbre hiérarchique « rapporte à » */
export default function OrganigrammeRH() {
  const { data, isLoading, isError, refetch } = api.rh.list.useQuery({ limit: 100 });
  const { data: departments } = api.rh.listDepartments.useQuery();

  const deptName = (id: number | null) => {
    if (!id) return null;
    return departments?.find((d) => d.id === id)?.name ?? null;
  };

  const tree = useMemo<EmpNode[]>(() => {
    const emps = (data?.employees ?? []) as unknown as Array<{
      id: number; nom: string; prenom: string; matricule: string;
      fonction: string; statut: string; departmentId: number | null; managerId: number | null;
    }>;
    const nodes = new Map<number, EmpNode>();
    emps.forEach((e) =>
      nodes.set(e.id, { ...e, children: [] })
    );
    const roots: EmpNode[] = [];
    nodes.forEach((node) => {
      const parent = node.managerId ? nodes.get(node.managerId) : undefined;
      if (parent && parent !== node) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }, [data]);

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggle = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="font-semibold text-destructive">Impossible de charger l&apos;organigramme.</p>
        <button
          onClick={() => refetch()}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const renderNode = (node: EmpNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const dpt = deptName(node.departmentId);
    const active = node.statut === "actif";

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors ${
            depth === 0
              ? "border-primary/30 bg-primary/5"
              : "border-border/70 bg-card/60 hover:bg-accent/40"
          }`}
          style={{ marginLeft: depth * 28 }}
        >
          {hasChildren ? (
            <button type="button" onClick={() => toggle(node.id)} className="text-muted-foreground hover:text-foreground" aria-label="Replier / déplier">
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${depth === 0 ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"}`}>
            <UserRound size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {node.prenom} {node.nom}
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">{node.matricule}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {node.fonction}
              {dpt ? <span className="inline-flex items-center gap-1 ml-2"><Building2 size={11} /> {dpt}</span> : null}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            active ? "bg-success/10 text-success-foreground" : "bg-muted text-muted-foreground"
          }`}>
            {node.statut}
          </span>
        </div>
        {hasChildren && !isCollapsed && (
          <div className="mt-1 space-y-1">{node.children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Organigramme</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Arbre hiérarchique du garage — « rapporte à ». Repliez un noeud pour masquer son équipe.
        </p>
      </div>

      <div className="mt-6 space-y-1">
        {tree.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Aucun employé pour l&apos;instant — créez des fiches employés pour construire l&apos;organigramme.
          </p>
        ) : (
          tree.map((n) => renderNode(n, 0))
        )}
      </div>
    </div>
  );
}
