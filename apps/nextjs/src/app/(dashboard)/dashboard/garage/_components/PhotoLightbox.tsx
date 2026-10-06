"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Download } from "lucide-react";
import { Dialog } from "~/components/ui/dialog";
import { PHOTO_CATEGORIE_LABELS, type VehiculePhoto } from "./statuts";

interface PhotoLightboxProps {
  photos: VehiculePhoto[];
  /** Index courant, ou null quand la visionneuse est fermee. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Prefixe du nom de fichier telecharge. */
  nomFichierBase?: string;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_PAS = 0.5;
/** Seuil de swipe horizontal, en pixels. */
const SWIPE_PX = 60;

function borner(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/**
 * Visionneuse de photos : zoom / dezoom / panoramique, navigation d'une photo a
 * l'autre (boutons, clavier, swipe), bande de vignettes et telechargement.
 *
 * S'appuie sur le socle `Dialog` (Echap, piege de focus, verrou de scroll,
 * fermeture au clic exterieur) et ajoute la gestion du zoom et du geste.
 */
export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  nomFichierBase = "vehicule",
}: PhotoLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [chargement, setChargement] = useState(true);
  const [enGeste, setEnGeste] = useState(false);

  const imgRef = useRef<HTMLDivElement>(null);
  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  const total = photos.length;
  const photo = index !== null && index >= 0 && index < total ? photos[index] ?? null : null;
  const zoomable = zoom > ZOOM_MIN;

  const reinitialiserVue = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Toute navigation de photo remet le cadrage a zero.
  useEffect(() => {
    reinitialiserVue();
    setChargement(true);
  }, [index, reinitialiserVue]);

  const allerA = useCallback(
    (delta: number) => {
      if (index === null) return;
      const suivant = index + delta;
      if (suivant < 0 || suivant >= total) return;
      onIndexChange(suivant);
    },
    [index, total, onIndexChange],
  );

  const zoomer = useCallback((facteur: number) => {
    setZoom((z) => {
      const suivant = borner(Math.round((z + facteur) * 100) / 100);
      if (suivant <= ZOOM_MIN) setOffset({ x: 0, y: 0 });
      return suivant;
    });
  }, []);

  // Raccourcis clavier. Echap est deja traite par le socle Dialog.
  useEffect(() => {
    if (!photo) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          allerA(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          allerA(-1);
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomer(ZOOM_PAS);
          break;
        case "-":
        case "_":
          e.preventDefault();
          zoomer(-ZOOM_PAS);
          break;
        case "0":
          e.preventDefault();
          reinitialiserVue();
          break;
        case "Home":
          e.preventDefault();
          onIndexChange(0);
          break;
        case "End":
          e.preventDefault();
          onIndexChange(total - 1);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photo, allerA, zoomer, reinitialiserVue, onIndexChange, total]);

  // Molette : zoom, sans faire defiler la page.
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !photo) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomer(e.deltaY < 0 ? ZOOM_PAS / 2 : -ZOOM_PAS / 2);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [photo, zoomer]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Deux doigts : pinch-zoom.
    if (pointeurs.current.size === 2) {
      const [a, b] = Array.from(pointeurs.current.values());
      pinchRef.current = {
        distance: a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
        zoom,
      };
      panRef.current = null;
      swipeRef.current = null;
      return;
    }
    if (pointeurs.current.size > 2) return;

    if (zoomable) {
      panRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } else {
      swipeRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointeurs.current.has(e.pointerId)) return;
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointeurs.current.size >= 2) {
      const [a, b] = Array.from(pointeurs.current.values());
      const start = pinchRef.current;
      if (a && b && start && start.distance > 0) {
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance > 0) {
          const suivant = borner(Math.round(start.zoom * (distance / start.distance) * 100) / 100);
          setZoom(suivant);
          if (suivant <= ZOOM_MIN) setOffset({ x: 0, y: 0 });
        }
      }
      return;
    }

    const pan = panRef.current;
    if (pan && pan.id === e.pointerId) {
      setEnGeste(true);
      setOffset({ x: pan.ox + (e.clientX - pan.x), y: pan.oy + (e.clientY - pan.y) });
    }
  };

  const finPointeur = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointeurs.current.delete(e.pointerId);
    if (pointeurs.current.size < 2) pinchRef.current = null;
    panRef.current = null;
    setEnGeste(false);

    const swipe = swipeRef.current;
    swipeRef.current = null;
    // Swipe : uniquement a 100 %, et geste franchement horizontal.
    if (swipe && !zoomable) {
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) allerA(dx < 0 ? 1 : -1);
    }
  };

  const telecharger = () => {
    if (!photo) return;
    const cat = (PHOTO_CATEGORIE_LABELS[photo.categorie] ?? photo.categorie)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-");
    const a = document.createElement("a");
    a.href = photo.url;
    a.download = `${nomFichierBase}-${cat}.jpg`;
    a.click();
  };

  const libelle = photo ? (PHOTO_CATEGORIE_LABELS[photo.categorie] ?? photo.categorie) : "";
  const position = index ?? 0;

  return (
    <Dialog
      open={photo !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      containerClassName="p-0 items-stretch justify-stretch"
      overlayClassName="bg-black/95 backdrop-blur-none"
      className="flex max-h-none max-w-none h-full w-full flex-col overflow-hidden rounded-none border-0 bg-transparent text-white shadow-none"
      ariaLabel={libelle ? `Photo : ${libelle}` : "Photo du véhicule"}
    >
      {/* Barre supérieure : libellé, compteur, zoom, téléchargement */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{libelle}</p>
          {total > 1 && (
            <p className="text-xs text-white/60">
              Photo {position + 1} sur {total}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => zoomer(ZOOM_PAS)}
            disabled={!photo || zoom >= ZOOM_MAX}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
            title="Zoom avant (+)"
            aria-label="Zoom avant"
          >
            <ZoomIn size={18} />
          </button>
          <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-white/70" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomer(-ZOOM_PAS)}
            disabled={!photo || zoom <= ZOOM_MIN}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
            title="Zoom arrière (-)"
            aria-label="Zoom arrière"
          >
            <ZoomOut size={18} />
          </button>
          <button
            type="button"
            onClick={reinitialiserVue}
            disabled={!photo || !zoomable}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
            title="Réinitialiser la vue (0)"
            aria-label="Réinitialiser la vue"
          >
            <RotateCcw size={18} />
          </button>
          <button
            type="button"
            onClick={telecharger}
            disabled={!photo}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
            title="Télécharger cette photo"
            aria-label="Télécharger cette photo"
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            title="Fermer (Échap)"
            aria-label="Fermer la visionneuse"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Zone image : panoramique quand zoomé, swipe quand à 100 % */}
      <div
        ref={imgRef}
        className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden"
        style={{ cursor: zoomable ? (enGeste ? "grabbing" : "grab") : "zoom-in" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finPointeur}
        onPointerCancel={finPointeur}
        onDoubleClick={() => (zoomable ? reinitialiserVue() : zoomer(ZOOM_PAS * 3))}
      >
        {photo && (
          <img
            src={photo.url}
            alt={`${libelle} — vue ${position + 1}`}
            draggable={false}
            onLoad={() => setChargement(false)}
            className={`max-h-full max-w-full object-contain transition-opacity duration-150 ${
              chargement ? "opacity-0" : "opacity-100"
            }`}
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
              transition: enGeste ? "none" : "transform 120ms ease-out",
            }}
          />
        )}

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => allerA(-1)}
              disabled={position === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/90 transition hover:bg-black/70 disabled:opacity-25"
              title="Photo précédente (←)"
              aria-label="Photo précédente"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={() => allerA(1)}
              disabled={position === total - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/90 transition hover:bg-black/70 disabled:opacity-25"
              title="Photo suivante (→)"
              aria-label="Photo suivante"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      {/* Bande de vignettes */}
      {total > 1 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-4 py-3">
          {photos.map((p, i) => (
            <button
              key={`${p.categorie}-${i}`}
              type="button"
              onClick={() => onIndexChange(i)}
              aria-label={`Voir la photo ${PHOTO_CATEGORIE_LABELS[p.categorie] ?? p.categorie}`}
              aria-current={i === position}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition ${
                i === position ? "border-white opacity-100" : "border-transparent opacity-50 hover:opacity-80"
              }`}
            >
              <img src={p.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}