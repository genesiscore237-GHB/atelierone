"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { Plus, LayoutGrid, Layers, BookOpen, Warehouse, Sparkles } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { ConfirmationDialog } from "~/components/ui/confirmation-dialog";
import { toast } from "sonner";
import { RayonFormDialog, type RayonNode } from "./_components/RayonFormDialog";
import { RayonTree } from "./_components/RayonTree";

export default function RayonsPage() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editNode, setEditNode] = useState<RayonNode | null>(null);
  const [deleteNode, setDeleteNode] = useState<RayonNode | null>(null);
  const utils = api.useUtils();

  const { data: tree, isLoading } = api.rayons.list.useQuery();
  const { data: stats } = api.rayons.stats.useQuery();
  const { data: sousSystemes } = api.reference.listSousSystemes.useQuery();
  const { data: classes } = api.reference.listClasses.useQuery();

  const deleteEmpl = api.rayons.delete.useMutation({
    onSuccess: (r) => {
      utils.rayons.list.invalidate();
      utils.rayons.stats.invalidate();
      toast.success(r.mode === "soft" ? "Emplacement désactivé (historique conservé)" : "Emplacement supprimé");
    },
    onError: (e) => toast.error(e.message),
  });

  const ssMap = useMemo(() => new Map((sousSystemes ?? []).map((s) => [s.id, s.code])), [sousSystemes]);
  const classeMap = useMemo(() => new Map((classes ?? []).map((c) => [c.id, c.code])), [classes]);

  const rayons = useMemo(() => (tree?.zones ?? []).flatMap((z) => z.enfants), [tree]);

  function openCreate() {
    setEditNode(null);
    setShowForm(true);
  }
  function openEdit(node: RayonNode) {
    setEditNode(node);
    setShowForm(true);
  }

  const statCards = [
    { label: "Zones", value: stats?.zones ?? 0, icon: Layers },
    { label: "Rayons", value: stats?.rayons ?? 0, icon: LayoutGrid },
    { label: "Étagères", value: stats?.etageres ?? 0, icon: BookOpen },
    { label: "Réserves & autres", value: stats?.reserves ?? 0, icon: Warehouse },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Rayons</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats?.total ?? 0} emplacements · zones, rayons et étagères du magasin
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/stock/rayons/achalandage")}>
            <Sparkles className="size-4" />
            Achalandage rentrée
          </Button>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Nouvel emplacement
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className="size-4 text-muted-foreground/60" />
            </div>
            <p className="mt-1.5 text-2xl font-semibold text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tree */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-11 rounded-lg bg-muted" />
          ))}
        </div>
      ) : !tree?.zones.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <LayoutGrid className="size-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-base font-medium text-foreground">Aucun emplacement</h3>
          <p className="mt-1 text-sm text-muted-foreground">Créez votre première zone, rayon ou étagère</p>
          <Button onClick={openCreate} className="mt-6">
            <Plus className="size-4" />
            Créer un emplacement
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {tree.zones.map((zone) => (
            <div key={zone.id} className="rounded-xl border border-border bg-card p-3">
              <RayonTree
                nodes={[zone]}
                depth={0}
                ssBySousSysteme={ssMap}
                classeByClasse={classeMap}
                onEdit={openEdit}
                onDelete={setDeleteNode}
                onAchalandage={(n) => router.push(`/dashboard/stock/rayons/achalandage?emplacementId=${n.id}`)}
              />
            </div>
          ))}

          {tree.reserves.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2 px-3 py-2">
                <Warehouse className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Entrepôt, réserves & vitrine</span>
              </div>
              <div className="mt-1">
                <RayonTree
                  nodes={tree.reserves}
                  depth={0}
                  ssBySousSysteme={ssMap}
                  classeByClasse={classeMap}
                  onEdit={openEdit}
                  onDelete={setDeleteNode}
                  onAchalandage={(n) => router.push(`/dashboard/stock/rayons/achalandage?emplacementId=${n.id}`)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <RayonFormDialog
        open={showForm}
        node={editNode}
        zones={tree?.zones ?? []}
        rayons={rayons}
        onClose={() => { setShowForm(false); setEditNode(null); }}
      />

      <ConfirmationDialog
        isOpen={deleteNode !== null}
        onClose={() => setDeleteNode(null)}
        onConfirm={() => {
          if (deleteNode) deleteEmpl.mutate({ id: Number(deleteNode.id) });
        }}
        title={`Supprimer « ${deleteNode?.code ?? ""} » ?`}
        description="L'emplacement sera supprimé. S'il contient du stock ou de l'historique, il sera simplement désactivé."
        confirmText="Supprimer"
        variant="destructive"
      />
    </div>
  );
}
