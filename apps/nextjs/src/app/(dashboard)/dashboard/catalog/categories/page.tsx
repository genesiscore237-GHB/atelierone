"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, FolderTree, BookOpen, Tag, Layers, Hash } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

interface CategoryNode {
  id: string;
  nom: string;
  code: string;
  description: string | null;
  parentId: string | null;
  childrenCount: number;
  enfants: CategoryNode[];
}

function buildTree(cats: { id: string; nom: string; code: string; description: string | null; parentId: string | null; childrenCount: number }[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  cats.forEach(c => map.set(c.id, { ...c, enfants: [] }));
  cats.forEach(c => {
    const node = map.get(c.id)!;
    if (c.parentId && map.has(c.parentId)) map.get(c.parentId)!.enfants.push(node);
    else roots.push(node);
  });
  return roots;
}

function TreeNode({ node, depth, onEdit, onDelete }: { node: CategoryNode; depth: number; onEdit: (c: CategoryNode) => void; onDelete: (id: string) => void }) {
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

        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {depth === 0 ? <Layers className="size-3.5" /> : <Tag className="size-3" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{node.nom}</span>
            {node.code && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                <Hash className="size-2.5" />
                {node.code}
              </span>
            )}
          </div>
          {node.description && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{node.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {node.childrenCount > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {node.childrenCount} ss-cat
            </span>
          )}
          <button
            onClick={() => onEdit(node)}
            className="rounded p-1.5 text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-all hover:text-primary hover:bg-accent/50"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={() => onDelete(node.id)}
            className="rounded p-1.5 text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-all hover:text-destructive hover:bg-accent/50"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {open && hasChildren && (
        <div className="relative ml-3.5 border-l border-border/40">
          {node.enfants.map(child => (
            <TreeNode key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const [showModal, setShowModal] = useState(false);
  const [editCat, setEditCat] = useState<CategoryNode | null>(null);
  const [form, setForm] = useState({ nom: "", description: "", parentId: "", code: "" });
  const utils = api.useUtils();

  const { data: categories, isLoading } = api.catalog.listCategories.useQuery();
  const createCat = api.catalog.createCategory.useMutation({
    onSuccess: () => {
      utils.catalog.listCategories.invalidate();
      setShowModal(false);
      setForm({ nom: "", description: "", parentId: "", code: "" });
      toast.success("Catégorie créée");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateCat = api.catalog.updateCategory.useMutation({
    onSuccess: () => {
      utils.catalog.listCategories.invalidate();
      setShowModal(false);
      setEditCat(null);
      setForm({ nom: "", description: "", parentId: "", code: "" });
      toast.success("Catégorie modifiée");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteCat = api.catalog.deleteCategory.useMutation({
    onSuccess: () => {
      utils.catalog.listCategories.invalidate();
      toast.success("Catégorie supprimée");
    },
    onError: (e) => toast.error(e.message),
  });
  const [deleting, setDeleting] = useState<string | null>(null);

  const tree = categories ? buildTree(categories as any) : [];
  const rootCount = tree.length;
  const leafCount = (categories?.length ?? 0) - rootCount;

  function openEdit(cat: CategoryNode) {
    setEditCat(cat);
    setForm({ nom: cat.nom, description: cat.description ?? "", parentId: cat.parentId ?? "", code: cat.code });
    setShowModal(true);
  }

  const isPending = createCat.isPending || updateCat.isPending;

  async function handleDelete(id: string) {
    if (deleting) return;
    setDeleting(id);
    try {
      await deleteCat.mutateAsync({ id });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Catégories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {categories?.length ?? 0} catégorie{ categories?.length !== 1 ? "s" : "" }
            {rootCount > 0 && (
              <>
                {" "}· <span className="text-primary">{rootCount}</span> racine{rootCount > 1 ? "s" : ""}
                {" "}· <span className="text-muted-foreground">{leafCount}</span> sous-catégorie{leafCount > 1 ? "s" : ""}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/catalog">
              <BookOpen className="size-4" />
              Catalogue
            </Link>
          </Button>
          <Button
            onClick={() => { setEditCat(null); setForm({ nom: "", description: "", parentId: "", code: "" }); setShowModal(true); }}
          >
            <Plus className="size-4" />
            Nouvelle
          </Button>
        </div>
      </div>

      {/* Tree */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-11 rounded-lg bg-muted" />
          ))}
        </div>
      ) : !tree.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <FolderTree className="size-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-base font-medium text-foreground">Aucune catégorie</h3>
          <p className="mt-1 text-sm text-muted-foreground">Créez votre première catégorie pour organiser vos produits</p>
          <Button
            onClick={() => { setEditCat(null); setForm({ nom: "", description: "", parentId: "", code: "" }); setShowModal(true); }}
            className="mt-6"
          >
            <Plus className="size-4" />
            Créer une catégorie
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-3">
          {tree.map(node => (
            <TreeNode key={node.id} node={node} depth={0} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Modal */}
      {(showModal || editCat) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-foreground mb-5">
              {editCat ? `Modifier « ${editCat.nom} »` : "Nouvelle catégorie"}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const code = form.code || form.nom.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                const parentId = form.parentId || undefined;
                if (editCat) {
                  updateCat.mutate({ id: editCat.id, nom: form.nom, code, description: form.description || undefined, parentId });
                } else {
                  createCat.mutate({ nom: form.nom, code, description: form.description || undefined, parentId });
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label>Nom *</Label>
                <Input
                  value={form.nom}
                  onChange={(e) => {
                    setForm({ ...form, nom: e.target.value });
                    if (!editCat && !form.code) {
                      setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) }));
                    }
                  }}
                  required
                  placeholder="Ex: Mathématiques, Fournitures..."
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="font-mono text-xs"
                  placeholder="Auto-généré depuis le nom"
                  maxLength={20}
                />
                <p className="text-[11px] text-muted-foreground">Identifiant unique utilisé dans l&apos;URL et les filtres</p>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus:border-ring focus:ring-2 focus:ring-ring/20 resize-none"
                  rows={2}
                  placeholder="Optionnelle"
                />
                <div className="text-right text-[11px] text-muted-foreground">{form.description.length}/200</div>
              </div>

              <div className="space-y-1.5">
                <Label>Catégorie parente</Label>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  <option value="">— Aucune (catégorie racine) —</option>
                  {categories?.filter(c => c.id !== editCat?.id).map(c => (
                    <option key={c.id} value={String(c.id)}>{c.nom}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowModal(false); setEditCat(null); }}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || !form.nom.trim()}
                >
                  {isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
                      {editCat ? "Modification..." : "Création..."}
                    </span>
                  ) : (
                    editCat ? "Enregistrer" : "Créer"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
