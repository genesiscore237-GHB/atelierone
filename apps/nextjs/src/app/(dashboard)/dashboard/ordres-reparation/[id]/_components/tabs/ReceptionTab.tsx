"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Car, ClipboardCheck, Loader2, Lock, Plus, Printer, Save, CheckCircle2, Camera, FileWarning,
} from "lucide-react";
import { useOrPermissions } from "../../../_hooks/useOrPermissions";
import {
  MOTIF_ENTREE_LABELS,
  EMPLACEMENTS_DEFAUT,
  PRIORITE_META,
} from "~/server/lib/atelier-service";

const NIVEAUX_CARBURANT = ["vide", "1/4", "1/2", "3/4", "plein"];
const CARBURANT_LABELS: Record<string, string> = {
  vide: "Vide",
  "1/4": "1/4",
  "1/2": "1/2",
  "3/4": "3/4",
  plein: "Plein",
};
const TYPES_INTERVENTION = ["ATELIER", "DEPANNAGE", "ENTRETIEN", "CARROSSERIE"];
const TYPE_INTERVENTION_LABELS: Record<string, string> = {
  ATELIER: "Atelier",
  DEPANNAGE: "Dépannage sur site",
  ENTRETIEN: "Entretien",
  CARROSSERIE: "Carrosserie",
};
const OUTILLAGE_ITEMS = [
  { key: "cric", label: "Cric" },
  { key: "triangle", label: "Triangle" },
  { key: "roueSecours", label: "Roue de secours" },
  { key: "extincteur", label: "Extincteur" },
  { key: "documents", label: "Documents véhicule" },
];

type OutillageForm = Record<string, { present: boolean; observation: string } | string>;

function outillageInitial(or: any): OutillageForm {
  const base: OutillageForm = {};
  for (const item of OUTILLAGE_ITEMS) {
    const v = or.outillage?.[item.key];
    base[item.key] = {
      present: v?.present === true,
      observation: v?.observation ?? "",
    };
  }
  base["autres"] = or.outillage?.autres ?? "";
  return base;
}

/** Onglet 1 — Réception : données d'entrée, état des lieux, photos, actions. */
export function ReceptionTab({ or }: { or: any }) {
  const utils = api.useUtils();
  const { flags } = useOrPermissions();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const id = Number(or.id);

  const figee =
    !!or.rapportDiagnostic && ["SOUMIS", "VALIDE"].includes(or.rapportDiagnostic.statut);
  const cloture = ["LIVRE", "ANNULE", "ferme_definitif"].includes(or.statut);
  const editable = flags.canReception && !figee && !cloture;

  const [form, setForm] = useState(() => ({
    kilometrageEntree: or.kilometrageEntree ?? "",
    niveauCarburantEntree: or.niveauCarburantEntree ?? "",
    emplacement: or.emplacement ?? "",
    datePromesse: or.datePromesse ?? "",
    motEntree: or.motEntree ?? "AUTRE",
    typeIntervention: or.typeIntervention ?? "ATELIER",
    lieuDepannage: or.lieuDepannage ?? "",
    priorite: or.priorite ?? "P3",
    clientAttendSurPlace: or.clientAttendSurPlace ?? false,
    courtoisieDemandee: or.courtoisieDemandee ?? false,
    signatureDeposant: or.signatureDeposant ?? "",
    validationVerbale: or.validationVerbale ?? false,
    pannesDeclarees: or.pannesDeclarees ?? "",
    observationsReception: or.observationsReception ?? "",
    outillage: outillageInitial(or),
  }));

  useEffect(() => {
    setForm({
      kilometrageEntree: or.kilometrageEntree ?? "",
      niveauCarburantEntree: or.niveauCarburantEntree ?? "",
      emplacement: or.emplacement ?? "",
      datePromesse: or.datePromesse ?? "",
      motEntree: or.motEntree ?? "AUTRE",
      typeIntervention: or.typeIntervention ?? "ATELIER",
      lieuDepannage: or.lieuDepannage ?? "",
      priorite: or.priorite ?? "P3",
      clientAttendSurPlace: or.clientAttendSurPlace ?? false,
      courtoisieDemandee: or.courtoisieDemandee ?? false,
      signatureDeposant: or.signatureDeposant ?? "",
      validationVerbale: or.validationVerbale ?? false,
      pannesDeclarees: or.pannesDeclarees ?? "",
      observationsReception: or.observationsReception ?? "",
      outillage: outillageInitial(or),
    });
  }, [or.id]);

  const update = api.or.update.useMutation({
    onSuccess: () => {
      toast.success("Réception enregistrée");
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const changerStatut = api.or.changerStatut.useMutation({
    onSuccess: () => {
      toast.success("OR passé en attente de diagnostic");
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const ajouter = api.or.ajouterPhoto.useMutation({
    onSuccess: () => utils.or.getById.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files).slice(0, 8)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", `or-${id}`);
        const res = await fetch("/api/uploads", { method: "POST", body: formData });
        if (!res.ok) {
          const e = await res.json();
          throw new Error(e.error);
        }
        const data = await res.json();
        const type = file.type.startsWith("video") ? "VIDEO" : "PHOTO";
        await new Promise<void>((resolve, reject) => {
          ajouter.mutate({ id, url: data.url, type: type as any }, { onSettled: () => resolve() });
        });
        ok++;
      } catch (e: any) {
        toast.error(e.message ?? "Erreur upload");
      }
    }
    setUploading(false);
    if (ok > 0) toast.success(`${ok} fichier(s) ajouté(s)`);
  };

  const setOutillage = (key: string, patch: Partial<{ present: boolean; observation: string }>) => {
    setForm((f) => {
      const current = f.outillage[key];
      const next =
        typeof current === "object" && current !== null
          ? { ...current, ...patch }
          : { present: false, observation: "", ...patch };
      return { ...f, outillage: { ...f.outillage, [key]: next } };
    });
  };

  const save = () => {
    if (form.kilometrageEntree === "" || form.kilometrageEntree == null) {
      toast.error("Kilométrage d'entrée requis");
      return;
    }
    setSaving(true);
    update.mutate(
      {
        id,
        kilometrageEntree: Number(form.kilometrageEntree),
        niveauCarburantEntree: form.niveauCarburantEntree || undefined,
        emplacement: form.emplacement || undefined,
        datePromesse: form.datePromesse || null,
        motEntree: form.motEntree as any,
        typeIntervention: form.typeIntervention || undefined,
        lieuDepannage: form.lieuDepannage || null,
        priorite: form.priorite as any,
        clientAttendSurPlace: form.clientAttendSurPlace,
        courtoisieDemandee: form.courtoisieDemandee,
        signatureDeposant: form.signatureDeposant || null,
        validationVerbale: form.validationVerbale,
        pannesDeclarees: form.pannesDeclarees || undefined,
        observationsReception: form.observationsReception || undefined,
        outillage: form.outillage,
      },
      { onSettled: () => setSaving(false) }
    );
  };

  const imprimer = () => {
    toast.info("Impression de l'état des lieux…");
    window.print();
  };

  const photos = or.photos ?? [];

  return (
    <div className="space-y-4">
      {figee && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Lock size={13} />
          État des lieux figé : le diagnostic a été soumis. Les données d'entrée sont en lecture seule (emplacement toujours modifiable).
        </div>
      )}

      {/* ─── Données d'entrée ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <ClipboardCheck size={15} className="text-primary" /> Données d'entrée
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">Date / heure d'entrée</Label>
            <div className="mt-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              {or.dateReception ? new Date(or.dateReception).toLocaleString("fr-FR") : "—"}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Kilométrage entrée *</Label>
            <Input
              type="number"
              min={0}
              value={form.kilometrageEntree}
              onChange={(e) => setForm({ ...form, kilometrageEntree: e.target.value })}
              placeholder="Ex : 45 200"
              className="mt-1"
              disabled={!editable}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Niveau carburant</Label>
            <select
              value={form.niveauCarburantEntree}
              onChange={(e) => setForm({ ...form, niveauCarburantEntree: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              disabled={!editable}
            >
              <option value="">—</option>
              {NIVEAUX_CARBURANT.map((n) => (
                <option key={n} value={n}>{CARBURANT_LABELS[n]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Emplacement atelier</Label>
            <select
              value={form.emplacement}
              onChange={(e) => setForm({ ...form, emplacement: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {EMPLACEMENTS_DEFAUT.map((emp) => (
                <option key={emp} value={emp}>{emp}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Promesse de restitution</Label>
            <Input
              type="date"
              value={form.datePromesse}
              onChange={(e) => setForm({ ...form, datePromesse: e.target.value })}
              className="mt-1"
              disabled={!editable}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Type d'accueil</Label>
            <select
              value={form.typeIntervention}
              onChange={(e) => setForm({ ...form, typeIntervention: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              disabled={!editable}
            >
              {TYPES_INTERVENTION.map((t) => (
                <option key={t} value={t}>{TYPE_INTERVENTION_LABELS[t]}</option>
              ))}
            </select>
          </div>
          {form.typeIntervention === "DEPANNAGE" && (
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Lieu du dépannage</Label>
              <Input
                value={form.lieuDepannage}
                onChange={(e) => setForm({ ...form, lieuDepannage: e.target.value })}
                placeholder="Adresse / lieu d'intervention"
                className="mt-1"
                disabled={!editable}
              />
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Motif d'entrée</Label>
            <select
              value={form.motEntree}
              onChange={(e) => setForm({ ...form, motEntree: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              disabled={!editable}
            >
              {Object.entries(MOTIF_ENTREE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Priorité perçue</Label>
            <select
              value={form.priorite}
              onChange={(e) => setForm({ ...form, priorite: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              disabled={!editable}
            >
              {Object.entries(PRIORITE_META).map(([k, m]: any) => (
                <option key={k} value={k}>{k} — {m.libelle}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.clientAttendSurPlace}
              onChange={(e) => setForm({ ...form, clientAttendSurPlace: e.target.checked })}
              disabled={!editable}
              className="size-4"
            />
            Client attend sur place
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.courtoisieDemandee}
              onChange={(e) => setForm({ ...form, courtoisieDemandee: e.target.checked })}
              disabled={!editable}
              className="size-4"
            />
            Véhicule de courtoisie demandé
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.validationVerbale}
              onChange={(e) => setForm({ ...form, validationVerbale: e.target.checked })}
              disabled={!editable}
              className="size-4"
            />
            Validation verbale du client
          </label>
        </div>
      </div>

      {/* ─── État des lieux ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Car size={15} className="text-primary" /> État des lieux d'entrée
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {OUTILLAGE_ITEMS.map((item) => {
            const v = form.outillage[item.key] as { present: boolean; observation: string };
            return (
              <div key={item.key} className="rounded-lg border border-border bg-background p-2.5">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={v?.present ?? false}
                    onChange={(e) => setOutillage(item.key, { present: e.target.checked })}
                    disabled={!editable}
                    className="size-4"
                  />
                  {item.label}
                </label>
                <input
                  value={v?.observation ?? ""}
                  onChange={(e) => setOutillage(item.key, { observation: e.target.value })}
                  placeholder="Observation"
                  className="mt-1.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                  disabled={!editable}
                />
              </div>
            );
          })}
          <div className="rounded-lg border border-border bg-background p-2.5">
            <Label className="text-xs text-muted-foreground">Autres accessoires</Label>
            <Input
              value={(form.outillage["autres"] as string) ?? ""}
              onChange={(e) => setForm({ ...form, outillage: { ...form.outillage, autres: e.target.value } })}
              placeholder="Ex : autoradio, bâche…"
              className="mt-1"
              disabled={!editable}
            />
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Pannes déclarées par le client</Label>
            <textarea
              value={form.pannesDeclarees}
              onChange={(e) => setForm({ ...form, pannesDeclarees: e.target.value })}
              rows={3}
              placeholder="Décrire les pannes / demandes déclarées…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
              disabled={!editable}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Observations de réception</Label>
            <textarea
              value={form.observationsReception}
              onChange={(e) => setForm({ ...form, observationsReception: e.target.value })}
              rows={3}
              placeholder="Dommages préexistants, notes diverses…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
              disabled={!editable}
            />
          </div>
        </div>
        <div className="mt-3">
          <Label className="text-xs text-muted-foreground">Déposant (signature tapée)</Label>
          <Input
            value={form.signatureDeposant}
            onChange={(e) => setForm({ ...form, signatureDeposant: e.target.value })}
            placeholder="Nom du déposant"
            className="mt-1 max-w-sm"
            disabled={!editable}
          />
        </div>
      </div>

      {/* ─── Photos d'entrée ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Camera size={15} className="text-primary" /> Photos & vidéos d'entrée
          </h3>
          {editable && (
            <>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading} className="gap-1.5 text-xs">
                {uploading ? <Loader2 className="size-3 animate-spin" /> : <Plus size={13} />} Ajouter
              </Button>
            </>
          )}
        </div>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune photo. Ajoutez des photos de l'état du véhicule (extérieur, dommages, compteur).
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((p: any) => (
              <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="group relative overflow-hidden rounded-lg border border-border">
                {p.type === "PHOTO" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-muted text-xs">🎬</div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ─── Actions ─── */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {or.statut === "OUVERT" && editable && (
          <Button
            variant="outline"
            onClick={() => changerStatut.mutate({ id, nouveauStatut: "EN_ATTENTE_DIAGNOSTIC", commentaire: "Réception complétée" })}
            disabled={changerStatut.isPending}
            className="gap-1.5 text-xs"
          >
            {changerStatut.isPending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 size={14} />}
            Passer en attente diagnostic
          </Button>
        )}
        <Button variant="outline" onClick={imprimer} className="gap-1.5 text-xs">
          <Printer size={14} /> Imprimer l'état des lieux
        </Button>
        {editable && (
          <Button onClick={save} disabled={saving || update.isPending} className="gap-1.5 text-xs">
            {saving || update.isPending ? <Loader2 className="size-3 animate-spin" /> : <Save size={14} />}
            Enregistrer la réception
          </Button>
        )}
      </div>

      {!flags.canReception && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <FileWarning size={13} /> Vous n'avez pas la permission d'éditer la réception (or.modifier).
        </p>
      )}
    </div>
  );
}