"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Camera, Check, ImagePlus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { CameraCapture } from "~/app/(dashboard)/dashboard/garage/_components/CameraCapture";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * LOT U0c — État des lieux photographique.
 *
 * Trois partis pris :
 *
 * 1. **Caméra intégrée**, pas seulement un import de fichier : l'agent prend
 *    la photo là où le véhicule est garé, avec le même composant et les mêmes
 *    garde-fous que le parking (bascule avant/arrière, repli fichier, messages
 *    d'erreur explicites).
 * 2. **Une photo par face et par étape.** Reprendre une face remplace la
 *    photo de CETTE face à CETTE étape — pas les autres faces, et jamais les
 *    photos d'une autre visite (celles-là sont des preuves).
 * 3. **Reprise intelligente** : le composant reçoit l'état des lieux de la
 *    visite précédente et propose de le reporter. Une reprise est VISUELLEMENT
 *    distincte d'une prise réelle — on ne doit jamais pouvoir confondre les
 *    deux dans un dossier de litige.
 *
 * Compression : les images sont réduites et recompressées avant envoi (elles
 * partent en base64 dans une colonne `text`). `compresserImage` est synchrone
 * pour éviter de garder plusieurs versions d'une même image en mémoire.
 */

const CATEGORIES = [
  { valeur: "AVANT", libelle: "Avant" },
  { valeur: "ARRIERE", libelle: "Arrière" },
  { valeur: "COTE_GAUCHE", libelle: "Côté gauche" },
  { valeur: "COTE_DROIT", libelle: "Côté droit" },
  { valeur: "INTERIEUR", libelle: "Intérieur" },
  { valeur: "PLAQUE_IMMATRICULATION", libelle: "Plaque" },
  { valeur: "MOTEUR", libelle: "Moteur" },
  { valeur: "AUTRE", libelle: "Autre" },
] as const;

export type CategorieEtatDesLieuUI = (typeof CATEGORIES)[number]["valeur"];

export type PhotoEtatDesLieuUI = {
  id: number;
  categorie: string;
  visite: string;
  repriseDe: number | null;
  url: string;
};

export type PhotoUI = {
  categorie: string;
  url: string;
  sourceId?: number;
  reprise?: boolean;
};

/** Limite serveur (`PHOTO_MAX_TAILLE`) : on compresse pour rester en dessous. */
const TAILLE_MAX = 2_000_000;
const COTE_MAX = 1600;

/** Redimensionne + recompresse en JPEG. Retourne null si l'image est illisible. */
function compresserImage(fichier: File): Promise<string | null> {
  return new Promise((resolve) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => resolve(null);
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const ratio = Math.min(1, COTE_MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        // 0.7 : compromis lecture / poids. Une rayure fine doit rester visible.
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = String(lecteur.result);
    };
    lecteur.readAsDataURL(fichier);
  });
}

interface PhotosEtatDesLieuxProps {
  photos: PhotoUI[];
  onChange: (photos: PhotoUI[]) => void;
  /** Étape courante (affichée dans l'en-tête). */
  visite?: "ENTREE" | "SORTIE";
  /** État des lieux de la visite précédente — source de la reprise. */
  precedent?: { numero: string | null; dateReception: Date | string | null; photos: PhotoEtatDesLieuUI[] } | null;
  desactive?: boolean;
  /** Rappel affiché quand une face n'a pas encore été photographiée. */
  afficherManquantes?: boolean;
}

export function PhotosEtatDesLieux({
  photos,
  onChange,
  visite = "ENTREE",
  precedent,
  desactive = false,
  afficherManquantes = true,
}: PhotosEtatDesLieuxProps) {
  const [categorieActive, setCategorieActive] = useState<CategorieEtatDesLieuUI>("AVANT");
  const [cameraOuverte, setCameraOuverte] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [compression, setCompression] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parCategorie = useMemo(() => {
    const map = new Map<string, PhotoUI>();
    for (const p of photos) map.set(p.categorie, p);
    return map;
  }, [photos]);

  // Faces de la visite précédente : sert à comparer et à proposer une reprise.
  const precedentParCategorie = useMemo(() => {
    const map = new Map<string, PhotoEtatDesLieuUI>();
    for (const p of precedent?.photos ?? []) map.set(p.categorie, p);
    return map;
  }, [precedent]);

  const ajouter = useCallback(
    async (fichiers: FileList | null) => {
      if (!fichiers?.length) return;
      setErreur(null);
      setCompression(true);
      try {
        const ajoutes: PhotoUI[] = [];
        for (const f of Array.from(fichiers)) {
          if (!f.type.startsWith("image/")) continue;
          const dataUrl = await compresserImage(f);
          if (!dataUrl) {
            setErreur(`« ${f.name} » n'a pas pu être lue.`);
            continue;
          }
          if (dataUrl.length > TAILLE_MAX) {
            // Refus EXPLICITE (l'ancien comportement jetait le fichier sans
            // rien dire — P2-5).
            setErreur(`« ${f.name} » est trop lourd même après compression. Photographiez sans zoom.`);
            continue;
          }
          ajoutes.push({ categorie: categorieActive, url: dataUrl });
        }
        if (ajoutes.length) {
          const autres = photos.filter((p) => p.categorie !== categorieActive);
          onChange([...autres, ...ajoutes]);
        }
      } finally {
        setCompression(false);
      }
    },
    [categorieActive, photos, onChange],
  );

  const capturer = useCallback(
    async (fichier: File) => {
      setErreur(null);
      setCompression(true);
      try {
        const dataUrl = await compresserImage(fichier);
        if (!dataUrl) {
          setErreur("Capture illisible sur cet appareil.");
          return;
        }
        if (dataUrl.length > TAILLE_MAX) {
          setErreur("Capture trop lourde même après compression.");
          return;
        }
        const autres = photos.filter((p) => p.categorie !== categorieActive);
        onChange([...autres, { categorie: categorieActive, url: dataUrl }]);
      } finally {
        setCompression(false);
      }
    },
    [categorieActive, photos, onChange],
  );

  /** Reporter la photo de la visite précédente sur la face courante. */
  const reprendre = (categorie: string) => {
    const source = precedentParCategorie.get(categorie);
    if (!source) return;
    const autres = photos.filter((p) => p.categorie !== categorie);
    onChange([...autres, { categorie, url: source.url, sourceId: source.id, reprise: true }]);
    setErreur(null);
  };

  const retirer = (categorie: string) => {
    onChange(photos.filter((p) => p.categorie !== categorie));
  };

  const reprises = photos.filter((p) => p.reprise).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          État des lieux {visite === "SORTIE" ? "à la sortie" : "à l'entrée"}
        </p>
        {precedent && (precedent.photos?.length ?? 0) > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Visite précédente {precedent.numero ? `· ${precedent.numero}` : ""} — reference
          </p>
        )}
      </div>

      {/* Face active + actions */}
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <p className="mb-2 text-xs font-medium text-foreground">
          Face à photographier : <span className="font-bold">{CATEGORIES.find((c) => c.valeur === categorieActive)?.libelle}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={desactive || compression} onClick={() => setCameraOuverte(true)}>
            <Camera size={14} /> {compression ? "Traitement…" : "Prendre une photo"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={desactive} onClick={() => inputRef.current?.click()}>
            <ImagePlus size={14} /> Charger un fichier
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              void ajouter(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {erreur && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
            <TriangleAlert size={13} className="mt-px shrink-0" />
            <span>{erreur}</span>
          </p>
        )}
      </div>

      {/* Faces : photo actuelle, référence de la visite précédente, reprise */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CATEGORIES.map((c) => {
          const photo = parCategorie.get(c.valeur);
          const avant = precedentParCategorie.get(c.valeur);
          const active = categorieActive === c.valeur;
          return (
            <div
              key={c.valeur}
              className={cn(
                "overflow-hidden rounded-lg border bg-background transition-colors",
                active ? "border-primary" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => setCategorieActive(c.valeur)}
                className="relative block aspect-[4/3] w-full bg-muted/40"
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt={`${c.libelle} — ${visite === "SORTIE" ? "sortie" : "entrée"}`} className="size-full object-cover" />
                ) : avant ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avant.url} alt={`${c.libelle} — visite précédente`} className="size-full object-cover opacity-35 grayscale" />
                ) : (
                  <span className="flex size-full items-center justify-center text-[10px] text-muted-foreground">Non prise</span>
                )}
                {photo?.reprise && (
                  <span className="absolute left-1 top-1 rounded bg-sky-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    Reprise
                  </span>
                )}
                {photo && !photo.reprise && (
                  <span className="absolute right-1 top-1 rounded bg-success px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    <Check size={9} />
                  </span>
                )}
              </button>
              <div className="space-y-1 p-1.5">
                <p className="truncate text-[11px] font-medium">{c.libelle}</p>
                {photo ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Supprimer"
                      onClick={() => retirer(c.valeur)}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                    >
                      <Trash2 size={12} />
                    </button>
                    {!photo.reprise && (
                      <button
                        type="button"
                        title="Reprendre la visite précédente"
                        onClick={() => reprendre(c.valeur)}
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                ) : avant ? (
                  <button
                    type="button"
                    onClick={() => reprendre(c.valeur)}
                    className="w-full rounded bg-accent/60 py-0.5 text-[10px] font-semibold transition-colors hover:bg-accent"
                  >
                    Reprendre
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {afficherManquantes && photos.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Aucune face photographiée. L&apos;état des lieux est la pièce à conviction en cas de litige — les faces
          les plus utiles sont Avant, Arrière et Plaque.
        </p>
      )}
      {reprises > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {reprises} photo{reprises > 1 ? "s" : ""} reprise{reprises > 1 ? "s" : ""} de la visite précédente — replacez-les
          si l&apos;aspect a changé.
        </p>
      )}

      <CameraCapture
        open={cameraOuverte}
        onClose={() => setCameraOuverte(false)}
        onCapture={capturer}
        onFallback={() => inputRef.current?.click()}
        categorieLabel={CATEGORIES.find((c) => c.valeur === categorieActive)?.libelle}
      />
    </div>
  );
}
