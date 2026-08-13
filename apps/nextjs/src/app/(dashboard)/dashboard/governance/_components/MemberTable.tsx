"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Pencil, ToggleRight, Trash2, ChevronDown } from "lucide-react";

export interface Member {
  id: string;
  nom: string;
  prenom: string | null;
  email: string;
  role: { id: string; code: string; nom: string; niveau: number | null } | null;
  statut: "active" | "invited" | "suspended";
  derniereConnexion: string | null;
}

const statutStyle: Record<string, string> = {
  active: "bg-success/10 text-success-foreground",
  invited: "bg-warning/10 text-warning-foreground",
  suspended: "bg-destructive/10 text-destructive",
};

const statutLabel: Record<string, string> = {
  active: "Actif",
  invited: "Invité",
  suspended: "Suspendu",
};

interface MemberTableProps {
  members: Member[];
  selectedIds?: Set<string>;
  togglingId?: string | null;
  onSelectionChange?: (ids: Set<string>) => void;
  onEdit: (member: Member) => void;
  onToggleStatus: (member: Member) => void;
  onDelete: (member: Member) => void;
}

export function MemberTable({
  members,
  selectedIds: externalSelected,
  togglingId,
  onSelectionChange,
  onEdit,
  onToggleStatus,
  onDelete,
}: MemberTableProps) {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const selected = externalSelected ?? internalSelected;
  const setSelected = onSelectionChange ?? setInternalSelected;
  const [sortField, setSortField] = useState<"nom" | "email" | "role.nom" | "statut">("nom");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const getSortValue = (member: Member, field: typeof sortField): string => {
    if (field === "role.nom") return member.role?.nom ?? "";
    return String(member[field as keyof typeof member] ?? "");
  };

  const sorted = [...members].sort((a, b) => {
    const aVal = getSortValue(a, sortField);
    const bVal = getSortValue(b, sortField);
    const cmp = aVal.localeCompare(bVal);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === sorted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((m) => m.id)));
    }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return (
      <ChevronDown
        className={`ml-1 h-3 w-3 inline transition-transform ${
          sortDir === "desc" ? "rotate-180" : ""
        }`}
      />
    );
  };

  const thClass = "px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selected.size === sorted.length && sorted.length > 0}
                  onChange={toggleAll}
                  className="rounded border-border bg-muted accent-blue-600"
                />
              </th>
              <th className={thClass} onClick={() => toggleSort("nom")}>
                Nom <SortIcon field="nom" />
              </th>
              <th className={thClass} onClick={() => toggleSort("email")}>
                Email <SortIcon field="email" />
              </th>
              <th className={thClass} onClick={() => toggleSort("role.nom")}>
                Rôle <SortIcon field="role.nom" />
              </th>
              <th className={thClass} onClick={() => toggleSort("statut")}>
                Statut <SortIcon field="statut" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Dernière connexion
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((member, i) => (
              <motion.tr
                key={member.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`hover:bg-accent/5 transition-colors ${
                  selected.has(member.id) ? "bg-primary/5" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(member.id)}
                    onChange={() => toggleSelect(member.id)}
                    className="rounded border-border bg-muted accent-blue-600"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {member.prenom?.[0]}{member.nom[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {member.prenom} {member.nom}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {member.email}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {member.role?.nom ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statutStyle[member.statut]}`}>
                    {statutLabel[member.statut]}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {member.derniereConnexion ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(member)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                      title="Modifier"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onToggleStatus(member)}
                      disabled={togglingId === member.id}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      title={member.statut === "active" ? "Désactiver" : "Activer"}
                    >
                      <ToggleRight className={`h-4 w-4 transition-transform ${togglingId === member.id ? "animate-pulse" : ""}`} />
                    </button>
                    <button
                      onClick={() => onDelete(member)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Aucun membre trouvé
        </div>
      )}
    </div>
  );
}
