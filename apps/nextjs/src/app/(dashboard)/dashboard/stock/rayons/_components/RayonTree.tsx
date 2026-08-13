"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Layers, LayoutGrid, BookOpen, Package } from "lucide-react";
import { RayonActions } from "./RayonActions";
import type { RayonNode } from "./RayonFormDialog";

const TYPE_LABELS: Record<string, string> = {
  ZONE: "Zone",
  RAYON: "Rayon",
  ETAGERE: "Étagère",
  ENTREPOT: "Entrepôt",
  RESERVE: "Réserve",
  VITRINE: "Vitrine",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="hidden sm:inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

export function RayonTree({
  nodes,
  depth = 0,
  ssBySousSysteme,
  classeByClasse,
  onEdit,
  onDelete,
  onAchalandage,
}: {
  nodes: RayonNode[];
  depth?: number;
  ssBySousSysteme: Map<string, string>;
  classeByClasse: Map<string, string>;
  onEdit: (n: RayonNode) => void;
  onDelete: (n: RayonNode) => void;
  onAchalandage?: (n: RayonNode) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={depth}
          ssBySousSysteme={ssBySousSysteme}
          classeByClasse={classeByClasse}
          onEdit={onEdit}
          onDelete={onDelete}
          onAchalandage={onAchalandage}
        />
      ))}
    </>
  );
}

function TreeNode({
  node,
  depth,
  ssBySousSysteme,
  classeByClasse,
  onEdit,
  onDelete,
  onAchalandage,
}: {
  node: RayonNode;
  depth: number;
  ssBySousSysteme: Map<string, string>;
  classeByClasse: Map<string, string>;
  onEdit: (n: RayonNode) => void;
  onDelete: (n: RayonNode) => void;
  onAchalandage?: (n: RayonNode) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.enfants.length > 0;

  return (
    <div>
      <div
        className={`group flex items-center gap-2 rounded-lg px-3 py-2.5 transition-all hover:bg-white/[0.07] ${depth > 0 ? "ml-7" : ""}`}
        style={{ borderLeft: depth > 0 ? "1px solid rgba(148, 163, 184, 0.15)" : "none" }}
      >
        <button
          onClick={() => setOpen(!open)}
          className={`shrink-0 rounded p-0.5 transition-colors ${hasChildren ? "text-muted-foreground hover:text-foreground hover:bg-accent" : "invisible"}`}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${node.type === "ZONE" ? "bg-primary/10 text-primary" : node.type === "RAYON" ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500"}`}>
          {node.type === "ZONE" ? <Layers className="size-3.5" /> : node.type === "RAYON" ? <LayoutGrid className="size-3.5" /> : node.type === "ETAGERE" ? <BookOpen className="size-3.5" /> : <Package className="size-3.5" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{node.libelle}</span>
            <span className="hidden md:inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {node.code}
            </span>
            {node.sousSystemeId && ssBySousSysteme.has(node.sousSystemeId) && (
              <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {ssBySousSysteme.get(node.sousSystemeId)}
              </span>
            )}
            {node.classeId && classeByClasse.has(node.classeId) && (
              <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {classeByClasse.get(node.classeId)}
              </span>
            )}
            <TypeBadge type={node.type} />
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5" title="Produits rattachés">{node.nbProduits} prod.</span>
          {node.stockTotal > 0 && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400" title="Stock en rayon">
              {node.stockRayon} en rayon
            </span>
          )}
          <RayonActions
            node={node}
            onEdit={onEdit}
            onDelete={onDelete}
            onAchalandage={onAchalandage}
          />
        </div>
      </div>

      {open && hasChildren && (
        <div className="relative ml-3.5 border-l border-border/40">
          {node.enfants.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              ssBySousSysteme={ssBySousSysteme}
              classeByClasse={classeByClasse}
              onEdit={onEdit}
              onDelete={onDelete}
              onAchalandage={onAchalandage}
            />
          ))}
        </div>
      )}
    </div>
  );
}
