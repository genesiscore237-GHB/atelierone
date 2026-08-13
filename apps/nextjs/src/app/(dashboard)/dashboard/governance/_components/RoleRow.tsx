"use client";

import { motion } from "framer-motion";
import { Pencil, Copy, Trash2 } from "lucide-react";

export interface Role {
  id: string;
  nom: string;
  code: string;
  niveau: number;
  permissionsCount: number;
  usersCount: number;
}

interface RoleRowProps {
  role: Role;
  index: number;
  selected?: boolean;
  onSelect?: () => void;
  onEdit: (role: Role) => void;
  onDuplicate: (role: Role) => void;
  onDelete: (role: Role) => void;
}

export function RoleRow({ role, index, selected, onSelect, onEdit, onDuplicate, onDelete }: RoleRowProps) {
  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={`transition-colors ${selected ? "bg-primary/5" : "hover:bg-accent/5"}`}
    >
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={() => onSelect?.()}
          className="rounded border-border bg-accent/30"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">{role.nom}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <code className="rounded bg-accent/30 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
          {role.code}
        </code>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{role.niveau}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{role.permissionsCount}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{role.usersCount}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onEdit(role)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            title="Modifier"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDuplicate(role)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            title="Dupliquer"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(role)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}
