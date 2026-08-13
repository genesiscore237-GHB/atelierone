"use client";

import { Pencil, Trash2, Sparkles } from "lucide-react";
import type { RayonNode } from "./RayonFormDialog";

export function RayonActions({
  node,
  onEdit,
  onDelete,
  onAchalandage,
}: {
  node: RayonNode;
  onEdit: (n: RayonNode) => void;
  onDelete: (n: RayonNode) => void;
  onAchalandage?: (n: RayonNode) => void;
}) {
  const estEtagereClasse = node.type === "ETAGERE" && Boolean(node.classeId);

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {estEtagereClasse && onAchalandage && (
        <button
          onClick={() => onAchalandage(node)}
          className="rounded p-1.5 text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-all hover:text-amber-500 hover:bg-accent/50"
          title="Voir l'achalandage de cette étagère-classe"
        >
          <Sparkles className="size-3.5" />
        </button>
      )}
      <button
        onClick={() => onEdit(node)}
        className="rounded p-1.5 text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-all hover:text-primary hover:bg-accent/50"
        title="Modifier"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        onClick={() => onDelete(node)}
        className="rounded p-1.5 text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-all hover:text-destructive hover:bg-accent/50"
        title="Supprimer"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
