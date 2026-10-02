"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, ImagePlus } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";
import { CameraCapture } from "./CameraCapture";
import {
  STATUTS_VEHICULE_OPTIONS,
  STATUTS_VEHICULE_LABELS,
  PHOTO_CATEGORIES,
  PHOTO_CATEGORIE_LABELS,
  PHOTO_MAX_TAILLE,
  type VehiculePhoto,
} from "./statuts";

export interface VehiculeFormModel {
  id: number;
  numRegistre: number;
  marque?: string | null;
  modele?: string | null;
  version?: string | null;
  couleur?: string | null;
  immatriculation?: string | null;
  vin?: string | null;
  clientNom?: string | null;
  clientTelephone?: string | null;
  statut: string;
  motif?: string | null;
  longueur?: number | null;
  largeur?: number | null;
  hauteur?: number | null;
  poids?: number | null;
  dimensionsEstimees?: boolean | null;
  provenance?: string | null;
  notes?: string | null;
  photos?: VehiculePhoto[];
  dateEntree?: string | null;
  dateDevis?: string | null;
  dateCommande?: string | null;
  dateFinTravaux?: string | null;
  dateDerniereRelance?: string | null;
}

interface Props {
  open: boolean;
  vehicule: VehiculeFormModel | null;
  onClose: () => void;
}

interface FormState {
  numRegistre: string;
  marque: string;
  modele: string;
  version: string;
  couleur: string;
  immatriculation: string;
  vin: string;
  clientNom: string;
  clientTelephone: string;
  statut: string;
  motif: string;
  longueur: string;
  largeur: string;
  hauteur: string;
  poids: string;
  dimensionsEstimees: boolean;
  provenance: string;
  notes: string;
  photos: VehiculePhoto[];
  dateEntree: string;
  dateDevis: string;
  dateCommande: string;
  dateFinTravaux: string;
  dateDerniereRelance: string;
}

const emptyForm: FormState = {
  numRegistre: "",
  marque: "",
  modele: "",
  version: "",
  couleur: "",
  immatriculation: "",
  vin: "",
  clientNom: "",
  clientTelephone: "",
  statut: "EN_PARKING",
  motif: "",
  longueur: "",
  largeur: "",
  hauteur: "",
  poids: "",
  dimensionsEstimees: false,
  provenance: "",
  notes: "",
  photos: [],
  dateEntree: "",
  dateDevis: "",
  dateCommande: "",
  dateFinTravaux: "",
  dateDerniereRelance: "",
};

function toDateInput(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function VehiculeFormDialog({ open, vehicule, onClose }: Props) {
  const isEdit = vehicule !== null;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [faceChoisie, setFaceChoisie] = useState<string>(PHOTO_CATEGORIES[0]);
  const [cameraOuverte, setCameraOuverte] = useState(false);
  const saisieNativeRef = useRef<HTMLInputElement | null>(null);
  const utils = api.useUtils();

  const create = api.garage.create.useMutation({
    onSuccess: () => {
      utils.garage.overview.invalidate();
      utils.garage.vehicles.invalidate();
      utils.garage.plan.invalidate();
      toast.success("Véhicule créé au registre");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = api.garage.update.useMutation({
    onSuccess: () => {
      utils.garage.overview.invalidate();
      utils.garage.vehicles.invalidate();
      utils.garage.vehicule.invalidate();
      utils.garage.plan.invalidate();
      toast.success("Véhicule modifié");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit && vehicule) {
      setForm({
        numRegistre: String(vehicule.numRegistre),
        marque: vehicule.marque ?? "",
        modele: vehicule.modele ?? "",
        version: vehicule.version ?? "",
        couleur: vehicule.couleur ?? "",
        immatriculation: vehicule.immatriculation ?? "",
        vin: vehicule.vin ?? "",
        clientNom: vehicule.clientNom ?? "",
        clientTelephone: vehicule.clientTelephone ?? "",
        statut: vehicule.statut,
        motif: vehicule.motif ?? "",
        longueur: vehicule.longueur != null ? String(vehicule.longueur) : "",
        largeur: vehicule.largeur != null ? String(vehicule.largeur) : "",
        hauteur: vehicule.hauteur != null ? String(vehicule.hauteur) : "",
        poids: vehicule.poids != null ? String(vehicule.poids) : "",
        dimensionsEstimees: vehicule.dimensionsEstimees === true,
        provenance: vehicule.provenance ?? "",
        notes: vehicule.notes ?? "",
        photos: (vehicule.photos ?? []).map((p) => ({ url: p.url, categorie: p.categorie ?? "AUTRE" })),
        dateEntree: toDateInput(vehicule.dateEntree),
        dateDevis: toDateInput(vehicule.dateDevis),
        dateCommande: toDateInput(vehicule.dateCommande),
        dateFinTravaux: toDateInput(vehicule.dateFinTravaux),
        dateDerniereRelance: toDateInput(vehicule.dateDerniereRelance),
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, isEdit, vehicule]);

  if (!open) return null;

  const isPending = create.isPending || update.isPending;

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  function numOrUndef(s: string): number | undefined {
    if (!s.trim()) return undefined;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function numOrNull(s: string): number | null {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function dateOrNull(s: string): Date | null {
    if (!s.trim()) return null;
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // ── Photos ──────────────────────────────────────────────────────────────────
  // Toute photo choisie est compressée côté client (canvas → JPEG) avant envoi,
  // pour garder des charges utiles raisonnables en base et des latences faibles.
  const PHOTO_MAX_OCTETS = 6_000_000;

  function compresserImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
      reader.onload = () => {
        const source = String(reader.result ?? "");
        if (!source.startsWith("data:image/")) {
          reject(new Error("Le fichier sélectionné n'est pas une image."));
          return;
        }
        const img = new Image();
        img.onerror = () => reject(new Error("Image illisible."));
        img.onload = () => {
          const LONGUEUR_MAX = 1400;
          let { width, height } = img;
          if (width > LONGUEUR_MAX || height > LONGUEUR_MAX) {
            const ratio = Math.min(LONGUEUR_MAX / width, LONGUEUR_MAX / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(source);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const out = canvas.toDataURL("image/jpeg", 0.8);
          resolve(out.length <= PHOTO_MAX_OCTETS ? out : canvas.toDataURL("image/jpeg", 0.5));
        };
        img.src = source;
      };
      reader.readAsDataURL(file);
    });
  }

  async function enregistrerPhoto(categorie: string, file: File) {
    if (file.size > PHOTO_MAX_OCTETS) {
      toast.error("Photo trop volumineuse (max 6 Mo).");
      return;
    }
    try {
      const url = await compresserImage(file);
      setForm((f) => {
        const sansDoublon = f.photos.filter((p) => p.categorie !== categorie);
        return { ...f, photos: [...sansDoublon, { url, categorie }] };
      });
      toast.success("Photo ajoutée");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout de la photo.");
    }
  }

  async function ajouterPhoto(categorie: string, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await enregistrerPhoto(categorie, file);
  }

  // Caméra in-app si l'appareil le permet (contexte sécurisé + getUserMedia),
  // sinon repli sur la caméra native du mobile (input capture).
  function ouvrirCamera() {
    const supporte =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      (typeof window === "undefined" || window.isSecureContext);
    if (supporte) setCameraOuverte(true);
    else saisieNativeRef.current?.click();
  }

  function retirerPhoto(categorie: string) {
    setForm((f) => ({ ...f, photos: f.photos.filter((p) => p.categorie !== categorie) }));
    toast.success("Photo retirée");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit && vehicule) {
      update.mutate({
        id: vehicule.id,
        marque: form.marque || null,
        modele: form.modele || null,
        version: form.version || null,
        couleur: form.couleur || null,
        immatriculation: form.immatriculation || null,
        vin: form.vin || null,
        clientNom: form.clientNom || null,
        clientTelephone: form.clientTelephone || null,
        statut: form.statut as never,
        motif: form.motif || null,
        notes: form.notes || null,
        photos: form.photos.map(({ url, categorie }) => ({ url, categorie })),
        longueur: numOrNull(form.longueur),
        largeur: numOrNull(form.largeur),
        hauteur: numOrNull(form.hauteur),
        poids: numOrNull(form.poids),
        provenance: form.provenance || null,
        dateEntree: dateOrNull(form.dateEntree),
        dateDevis: dateOrNull(form.dateDevis),
        dateCommande: dateOrNull(form.dateCommande),
        dateFinTravaux: dateOrNull(form.dateFinTravaux),
        dateDerniereRelance: dateOrNull(form.dateDerniereRelance),
      });
      return;
    }

    create.mutate({
      numRegistre: form.numRegistre.trim() ? Number(form.numRegistre) : undefined,
      marque: form.marque || undefined,
      modele: form.modele || undefined,
      version: form.version || undefined,
      couleur: form.couleur || undefined,
      immatriculation: form.immatriculation || undefined,
      vin: form.vin || undefined,
      clientNom: form.clientNom || undefined,
      clientTelephone: form.clientTelephone || undefined,
      statut: (form.statut === "SORTI" ? "EN_PARKING" : form.statut) as never,
      motif: form.motif || undefined,
      longueur: numOrUndef(form.longueur),
      largeur: numOrUndef(form.largeur),
      hauteur: numOrUndef(form.hauteur),
      poids: numOrUndef(form.poids),
      dimensionsEstimees: form.dimensionsEstimees || numOrUndef(form.longueur) != null || numOrUndef(form.largeur) != null,
      provenance: form.provenance || undefined,
      notes: form.notes || undefined,
      photos: form.photos.map(({ url, categorie }) => ({ url, categorie })),
    });
  }

  const inputCls =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20";
  const textareaCls = `${inputCls} min-h-[70px] resize-y`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-foreground mb-5">
          {isEdit ? `Modifier le véhicule n°${vehicule?.numRegistre ?? ""}` : "Nouveau véhicule (registre GPJ)"}
        </h2>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {!isEdit && (
              <div className="space-y-1.5">
                <Label>N° registre</Label>
                <Input
                  type="number"
                  value={form.numRegistre}
                  onChange={(e) => set({ numRegistre: e.target.value })}
                  placeholder="Auto si vide"
                  className="text-sm"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Marque</Label>
              <Input value={form.marque} onChange={(e) => set({ marque: e.target.value })} placeholder="Ex: Toyota" maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label>Modèle</Label>
              <Input value={form.modele} onChange={(e) => set({ modele: e.target.value })} placeholder="Ex: Hilux" maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label>Version</Label>
              <Input value={form.version} onChange={(e) => set({ version: e.target.value })} placeholder="Ex: 2.8 D-4D" maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label>Immatriculation</Label>
              <Input value={form.immatriculation} onChange={(e) => set({ immatriculation: e.target.value })} placeholder="Ex: AB-1234-CD" maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label>Couleur</Label>
              <Input value={form.couleur} onChange={(e) => set({ couleur: e.target.value })} placeholder="Ex: Gris" maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label>VIN</Label>
              <Input value={form.vin} onChange={(e) => set({ vin: e.target.value })} maxLength={100} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Input value={form.clientNom} onChange={(e) => set({ clientNom: e.target.value })} placeholder="Nom du client" maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone client</Label>
              <Input value={form.clientTelephone} onChange={(e) => set({ clientTelephone: e.target.value })} placeholder="Ex: 690 00 00 00" maxLength={50} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Statut</Label>
            <select
              value={form.statut}
              onChange={(e) => set({ statut: e.target.value })}
              disabled={isEdit && form.statut === "SORTI"}
              className={inputCls}
            >
              {STATUTS_VEHICULE_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUTS_VEHICULE_LABELS[s] ?? s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Motif</Label>
            <textarea value={form.motif} onChange={(e) => set({ motif: e.target.value })} className={textareaCls} placeholder="Motif d'immobilisation" maxLength={2000} />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Longueur (m)</Label>
              <Input type="number" step="0.1" value={form.longueur} onChange={(e) => set({ longueur: e.target.value })} placeholder="4.5" />
            </div>
            <div className="space-y-1.5">
              <Label>Largeur (m)</Label>
              <Input type="number" step="0.1" value={form.largeur} onChange={(e) => set({ largeur: e.target.value })} placeholder="1.8" />
            </div>
            <div className="space-y-1.5">
              <Label>Hauteur (m)</Label>
              <Input type="number" step="0.1" value={form.hauteur} onChange={(e) => set({ hauteur: e.target.value })} placeholder="—" />
            </div>
            <div className="space-y-1.5">
              <Label>Poids (kg)</Label>
              <Input type="number" step="10" value={form.poids} onChange={(e) => set({ poids: e.target.value })} placeholder="—" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={form.dimensionsEstimees}
              onChange={(e) => set({ dimensionsEstimees: e.target.checked })}
              className="size-4 rounded border-input"
            />
            Dimensions estimées (empreinte approximative)
          </label>

          <div className="space-y-1.5">
            <Label>Provenance</Label>
            <textarea value={form.provenance} onChange={(e) => set({ provenance: e.target.value })} className={textareaCls} placeholder="Libellé verbatim du registre d'origine (ne pas inventer)" maxLength={5000} />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={textareaCls} placeholder="Remarques internes" maxLength={5000} />
          </div>

          <div className="space-y-2">
            <Label>
              Photos du véhicule ({form.photos.length}/{PHOTO_MAX_TAILLE})
            </Label>
            {form.photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {form.photos.map((p) => (
                  <div key={p.categorie} className="relative">
                    <img
                      src={p.url}
                      alt={`Face ${PHOTO_CATEGORIE_LABELS[p.categorie] ?? p.categorie}`}
                      className="aspect-[4/3] w-full rounded-lg border border-border object-cover"
                    />
                    <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      {PHOTO_CATEGORIE_LABELS[p.categorie] ?? p.categorie}
                    </span>
                    <button
                      type="button"
                      onClick={() => retirerPhoto(p.categorie)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                      title="Retirer cette photo"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {form.photos.length < PHOTO_MAX_TAILLE && (
              <div className="rounded-lg border-2 border-dashed border-border bg-muted/30 p-3">
                <select
                  id="photo-categorie"
                  value={faceChoisie}
                  onChange={(e) => setFaceChoisie(e.target.value)}
                  className={`${inputCls} mb-2`}
                >
                  {PHOTO_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {PHOTO_CATEGORIE_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/30">
                    <ImagePlus size={14} />
                    Choisir depuis la galerie
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      className="hidden"
                      onChange={(e) => {
                        void ajouterPhoto(faceChoisie, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={ouvrirCamera}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/30"
                  >
                    <Camera size={14} />
                    Prendre une photo
                  </button>
                  <input
                    ref={saisieNativeRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      void ajouterPhoto(faceChoisie, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Redimensionnées et compressées automatiquement avant enregistrement (max {PHOTO_MAX_TAILLE} photos). JPG, PNG, WebP, HEIC (iPhone).
                </p>
              </div>
            )}
          </div>

          {isEdit && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Date d'entrée</Label>
                <Input type="date" value={form.dateEntree} onChange={(e) => set({ dateEntree: e.target.value })} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>Date devis</Label>
                <Input type="date" value={form.dateDevis} onChange={(e) => set({ dateDevis: e.target.value })} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>Date commande</Label>
                <Input type="date" value={form.dateCommande} onChange={(e) => set({ dateCommande: e.target.value })} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>Date fin travaux</Label>
                <Input type="date" value={form.dateFinTravaux} onChange={(e) => set({ dateFinTravaux: e.target.value })} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>Dernière relance</Label>
                <Input type="date" value={form.dateDerniereRelance} onChange={(e) => set({ dateDerniereRelance: e.target.value })} className="text-sm" />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
                  {isEdit ? "Modification..." : "Création..."}
                </span>
              ) : (
                isEdit ? "Enregistrer" : "Créer au registre"
              )}
            </Button>
          </div>
        </form>
      </div>
      <CameraCapture
        open={cameraOuverte}
        onClose={() => setCameraOuverte(false)}
        categorieLabel={PHOTO_CATEGORIE_LABELS[faceChoisie] ?? faceChoisie}
        onCapture={(file) => enregistrerPhoto(faceChoisie, file)}
        onFallback={() => saisieNativeRef.current?.click()}
      />
    </div>
  );
}