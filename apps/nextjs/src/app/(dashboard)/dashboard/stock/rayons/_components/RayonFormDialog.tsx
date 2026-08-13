"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";

export interface RayonNode {
  id: string;
  type: string;
  code: string;
  libelle: string;
  parentId: string | null;
  profondeur: number;
  categorieId: string | null;
  sousSystemeId: string | null;
  niveauId: string | null;
  classeId: string | null;
  filiereId: string | null;
  ordre: number;
  isActive: boolean;
  nbProduits: number;
  stockRayon: number;
  stockTotal: number;
  enfants: RayonNode[];
}

const TYPES = [
  { value: "ZONE", label: "Zone" },
  { value: "RAYON", label: "Rayon" },
  { value: "ETAGERE", label: "Étagère" },
  { value: "ENTREPOT", label: "Entrepôt" },
  { value: "RESERVE", label: "Réserve" },
  { value: "VITRINE", label: "Vitrine" },
] as const;

const CLASSES_AVEC_FILIERE = ["4e", "3e", "2NDE", "1ERE", "TLE", "FORM3", "FORM4", "FORM5", "L6", "U6"];

interface Props {
  open: boolean;
  node: RayonNode | null;
  zones: RayonNode[];
  rayons: RayonNode[];
  onClose: () => void;
}

interface FormState {
  type: string;
  code: string;
  libelle: string;
  ordre: string;
  parentId: string;
  categorieId: string;
  modeManuels: boolean;
  sousSystemeId: string;
  niveauId: string;
  classeId: string;
  filiereId: string;
  isActive: boolean;
}

const emptyForm: FormState = {
  type: "RAYON",
  code: "",
  libelle: "",
  ordre: "0",
  parentId: "",
  categorieId: "",
  modeManuels: false,
  sousSystemeId: "",
  niveauId: "",
  classeId: "",
  filiereId: "",
  isActive: true,
};

export function RayonFormDialog({ open, node, zones, rayons, onClose }: Props) {
  const isEdit = node !== null;
  const [form, setForm] = useState<FormState>(emptyForm);
  const utils = api.useUtils();

  const { data: sousSystemes } = api.reference.listSousSystemes.useQuery(undefined, { enabled: open });
  const { data: niveaux } = api.reference.listNiveaux.useQuery(undefined, { enabled: open });
  const { data: filieres } = api.reference.listFilieres.useQuery(undefined, { enabled: open });
  const { data: classes } = api.reference.listClasses.useQuery(undefined, { enabled: open });
  const { data: categories } = api.catalog.listCategories.useQuery(undefined, { enabled: open });

  const create = api.rayons.create.useMutation({
    onSuccess: () => {
      utils.rayons.list.invalidate();
      utils.rayons.stats.invalidate();
      toast.success("Emplacement créé");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = api.rayons.update.useMutation({
    onSuccess: () => {
      utils.rayons.list.invalidate();
      utils.rayons.stats.invalidate();
      toast.success("Emplacement modifié");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit && node) {
      setForm({
        type: node.type,
        code: node.code,
        libelle: node.libelle,
        ordre: String(node.ordre),
        parentId: node.parentId ?? "",
        categorieId: node.categorieId ?? "",
        modeManuels: node.classeId !== null,
        sousSystemeId: node.sousSystemeId ?? "",
        niveauId: node.niveauId ?? "",
        classeId: node.classeId ?? "",
        filiereId: node.filiereId ?? "",
        isActive: node.isActive,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, isEdit, node]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const candidatsParents = useMemo(() => {
    if (form.type === "RAYON") return zones.map((z) => ({ id: z.id, label: `${z.code} — ${z.libelle}` }));
    if (form.type === "ETAGERE") return rayons.map((r) => ({ id: r.id, label: `${r.code} — ${r.libelle}` }));
    return [];
  }, [form.type, zones, rayons]);

  const classesDuNiveau = useMemo(
    () => (form.niveauId ? (classes ?? []).filter((c) => c.niveauId === form.niveauId) : []),
    [form.niveauId, classes],
  );
  const classeChoisie = useMemo(
    () => (form.classeId ? (classes ?? []).find((c) => c.id === form.classeId) : undefined),
    [form.classeId, classes],
  );
  const filiereRequise = !!classeChoisie && CLASSES_AVEC_FILIERE.includes(classeChoisie.code);

  if (!open) return null;

  const isPending = create.isPending || update.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.libelle.trim()) return;

    if (isEdit && node) {
      update.mutate({
        id: Number(node.id),
        libelle: form.libelle,
        code: form.code,
        categorieId: form.categorieId ? Number(form.categorieId) : null,
        filiereId: node.filiereId ? form.filiereId || null : undefined,
        ordre: Number(form.ordre) || 0,
        isActive: form.isActive,
      });
      return;
    }

    create.mutate({
      type: form.type as "ZONE" | "RAYON" | "ETAGERE" | "ENTREPOT" | "RESERVE" | "VITRINE",
      code: form.code,
      libelle: form.libelle,
      parentId: form.parentId ? Number(form.parentId) : null,
      ordre: Number(form.ordre) || 0,
      categorieId: form.modeManuels ? null : form.categorieId ? Number(form.categorieId) : null,
      sousSystemeId: form.modeManuels && form.sousSystemeId ? form.sousSystemeId : undefined,
      niveauId: form.modeManuels && form.niveauId ? form.niveauId : undefined,
      classeId: form.modeManuels && form.classeId ? form.classeId : undefined,
      filiereId: form.modeManuels && form.filiereId ? form.filiereId : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-foreground mb-5">
          {isEdit ? `Modifier « ${node?.code} »` : "Nouvel emplacement"}
        </h2>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Code *</Label>
              <Input
                value={form.code}
                onChange={(e) => set({ code: e.target.value })}
                className="font-mono text-xs"
                placeholder="Ex: Z9, R4.6, ET-FR-CE2"
                maxLength={50}
                required
                disabled={isEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select
                value={form.type}
                onChange={(e) => set({ type: e.target.value, parentId: "", modeManuels: false, sousSystemeId: "", niveauId: "", classeId: "", filiereId: "" })}
                disabled={isEdit}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Libellé *</Label>
            <Input
              value={form.libelle}
              onChange={(e) => set({ libelle: e.target.value })}
              placeholder="Ex: Manuels Scolaires Francophone"
              required
              autoFocus
            />
          </div>

          {!isEdit && candidatsParents.length > 0 && (
            <div className="space-y-1.5">
              <Label>Emplacement parent</Label>
              <select
                value={form.parentId}
                onChange={(e) => set({ parentId: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="">— Sélectionner —</option>
                {candidatsParents.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          )}

          {!isEdit && form.type === "ETAGERE" && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={form.modeManuels}
                onChange={(e) => set({ modeManuels: e.target.checked, sousSystemeId: "", niveauId: "", classeId: "", filiereId: "", categorieId: "" })}
                className="size-4 rounded border-input"
              />
              Étagère manuels (rattachée à un sous-système, un niveau et une classe)
            </label>
          )}

          {!isEdit && form.modeManuels ? (
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label>Sous-système *</Label>
                <select
                  value={form.sousSystemeId}
                  onChange={(e) => set({ sousSystemeId: e.target.value, niveauId: "", classeId: "", filiereId: "" })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  <option value="">— Sélectionner —</option>
                  {(sousSystemes ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.libelle}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Niveau *</Label>
                <select
                  value={form.niveauId}
                  onChange={(e) => set({ niveauId: e.target.value, classeId: "", filiereId: "" })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  <option value="">— Sélectionner —</option>
                  {(niveaux ?? [])
                    .filter((n) => !form.sousSystemeId || n.sousSystemeId === form.sousSystemeId)
                    .map((n) => (
                      <option key={n.id} value={n.id}>{n.code} — {n.libelle}</option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Classe</Label>
                <select
                  value={form.classeId}
                  onChange={(e) => set({ classeId: e.target.value, filiereId: "" })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  <option value="">— Aucune (niveau complet) —</option>
                  {classesDuNiveau.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.libelle}</option>
                  ))}
                </select>
              </div>
              {form.classeId && (
                <div className="space-y-1.5">
                  <Label>Filière {filiereRequise ? "*" : ""}</Label>
                  <select
                    value={form.filiereId}
                    onChange={(e) => set({ filiereId: e.target.value })}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="">{filiereRequise ? "— Filière requise —" : "— Toutes filières —"}</option>
                    {(filieres ?? []).map((f) => (
                      <option key={f.id} value={f.id}>{f.code} — {f.libelle}</option>
                    ))}
                  </select>
                  {filiereRequise && (
                    <p className="text-[11px] text-muted-foreground">La classe {classeChoisie?.code} exige une filière (RG-11).</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <select
                value={form.categorieId}
                onChange={(e) => set({ categorieId: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="">— Aucune —</option>
                {(categories ?? []).map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>{c.code} — {c.nom}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Ordre</Label>
              <Input
                type="number"
                value={form.ordre}
                onChange={(e) => set({ ordre: e.target.value })}
                className="text-sm"
              />
            </div>
            {isEdit && (
              <div className="space-y-1.5">
                <Label>Actif</Label>
                <select
                  value={form.isActive ? "1" : "0"}
                  onChange={(e) => set({ isActive: e.target.value === "1" })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  <option value="1">Oui</option>
                  <option value="0">Non</option>
                </select>
              </div>
            )}
          </div>

          {isEdit && node?.classeId && node.filiereId && (
            <div className="space-y-1.5">
              <Label>Filière</Label>
              <select
                value={form.filiereId}
                onChange={(e) => set({ filiereId: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="">— Toutes filières —</option>
                {(filieres ?? []).map((f) => (
                  <option key={f.id} value={f.id}>{f.code} — {f.libelle}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={isPending || !form.libelle.trim() || !form.code.trim()}>
              {isPending ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
                  {isEdit ? "Modification..." : "Création..."}
                </span>
              ) : (
                isEdit ? "Enregistrer" : "Créer"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
