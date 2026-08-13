"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Calendar, Edit, Loader2, Pencil, Settings, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmationDialog } from "~/components/ui/confirmation-dialog";
import { api } from "~/trpc/react";
import { CheckboxGroup } from "./CheckboxGroup";
import type { Role } from "./RoleRow";

type PanelMode = "create" | "edit" | "view";

interface RolesSidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PanelMode;
  role: Role | null;
  onSave: (data: Partial<Role> & { permissions: string[] }) => void;
  onDuplicate?: (role: Role) => void;
}

const mockPermissionsByModule: Record<string, { id: string; code: string; nom: string }[]> = {
  Ventes: [
    { id: "1", code: "ventes.lire", nom: "Lire les ventes" },
    { id: "2", code: "ventes.creer", nom: "Créer une vente" },
    { id: "3", code: "ventes.modifier", nom: "Modifier une vente" },
    { id: "4", code: "ventes.supprimer", nom: "Supprimer une vente" },
  ],
  Stock: [
    { id: "5", code: "stock.lire", nom: "Lire le stock" },
    { id: "6", code: "stock.ajuster", nom: "Ajuster le stock" },
    { id: "7", code: "stock.transferer", nom: "Transférer du stock" },
  ],
  Finance: [
    { id: "8", code: "finance.lire", nom: "Lire la finance" },
    { id: "9", code: "finance.creer", nom: "Créer une écriture" },
  ],
  RH: [
    { id: "10", code: "rh.lire", nom: "Lire les membres" },
    { id: "11", code: "rh.gerer", nom: "Gérer les membres" },
    { id: "12", code: "rh.roles", nom: "Gérer les rôles" },
  ],
};

export function RolesSidePanel({
  open,
  onOpenChange,
  mode,
  role,
  onSave,
  onDuplicate,
}: RolesSidePanelProps) {
  const [editMode, setEditMode] = useState<PanelMode>(mode);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const deleteMutation = api.governance.role.delete.useMutation({
    onSuccess: () => { toast.success("Rôle supprimé"); onOpenChange(false); },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (open) {
      setEditMode(mode);
      if (role && (mode === "edit" || mode === "view")) {
        setNom(role.nom);
        setDescription("");
        setSelectedPermissions([]);
      } else {
        setNom("");
        setDescription("");
        setSelectedPermissions([]);
      }
    }
  }, [role, mode, open]);

  const handleSave = () => {
    onSave({ nom, code: (role?.code ?? ""), niveau: role?.niveau ?? 0, permissions: selectedPermissions });
    onOpenChange(false);
  };

  const togglePermission = (permId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId],
    );
  };

  if (!open) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 z-[60] h-full w-full sm:w-[520px] border-l border-border bg-card shadow-2xl flex flex-col"
      >
        <div className="relative h-full bg-card p-6 text-foreground overflow-y-auto">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg bg-accent/30 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>

          {(editMode === "view" && role) ? (
            <>
              <div className="mb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <Settings size={20} />
                </div>
                <h2 className="text-xl font-bold text-primary uppercase">{role.nom}</h2>
                <p className="text-sm text-muted-foreground">Rôle personnalisé</p>
              </div>

              <div className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-bold tracking-wider text-primary uppercase">
                <Edit size={10} />
                ÉDITABLE
              </div>

              <div className="mb-6">
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-1">Description</p>
                <p className="text-sm text-foreground/80">{description || "Aucune description"}</p>
              </div>

              <div className="mb-6 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users size={12} />
                  <span>{role.usersCount} membre(s)</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setEditMode("edit")}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-foreground transition hover:bg-primary"
                >
                  <Pencil size={12} />
                  Modifier
                </button>
                <button
                  onClick={() => onDuplicate?.(role)}
                  className="flex items-center gap-2 rounded-xl border border-border bg-accent/30 px-4 py-2.5 text-xs font-bold text-foreground/80 transition hover:bg-accent"
                >
                  <Settings size={12} />
                  Dupliquer
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-xs font-bold text-destructive transition hover:bg-destructive/20"
                >
                  <Trash2 size={12} />
                  Supprimer
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black tracking-tighter uppercase italic mb-1">
                AtelierOne<span className="text-primary">ERP</span>
              </h2>
              <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase mb-8">
                {editMode === "create" ? "Nouveau rôle" : "Modifier le rôle"}
              </p>

              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Nom du rôle</label>
                  <input
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder="ex: Superviseur"
                    className="mt-2 w-full rounded-xl border border-border/50 bg-accent/30 px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Description du rôle..."
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-border/50 bg-accent/30 p-4 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground resize-none"
                  />
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={!nom.trim()}
                className="mt-6 w-full rounded-2xl bg-primary py-5 text-[11px] font-black text-foreground uppercase shadow-lg shadow-primary/20 transition hover:bg-primary disabled:opacity-50"
              >
                {editMode === "create" ? "CRÉER LE RÔLE" : "ENREGISTRER LES MODIFICATIONS"}
              </button>
            </>
          )}
        </div>

        <ConfirmationDialog
          isOpen={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            if (role) { deleteMutation.mutate({ id: role.id }); }
            setConfirmDelete(false);
          }}
          title={`Supprimer le rôle "${role?.nom}" ?`}
          description="Ce rôle sera définitivement supprimé."
          confirmText="Supprimer"
          variant="destructive"
        />
      </motion.div>
    </>
  );
}
