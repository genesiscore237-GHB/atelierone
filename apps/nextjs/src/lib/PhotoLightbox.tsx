/** Visionneuse photo légère (lightbox) integrée aux vehicules.
 *
 *  Usage :
 *    - En liste vehicules : ouverture depuis une vignette ou bouton "Photos".
 *    - En fiche vehicule : affichage des photos attachées au vehicule.
 *
 *  Le composant règit les events clavier (fleches gauche/droite, Escape pour fermer)
 *  et gère le zoom via CSS zoom sur l'image cible. Les photos sont presents en
 *  data URI (jusqu'a 6 Mo chacune) : pas de charge additionalnelle niveau reseau
 *  apres le premier chargement.
 */

import * as React from "react";
import { useEffect } from "react";

interface Props {
  /** Photos du vehicule (tableau d'objets avec url / categorie / date / auteur). */
  photos: Array<{ url: string; categorie?: string; date?: string; auteur?: string }>;
  /** Photo actuelle selectionnee (index dans le tableau). */
  photoActive?: number;
  /** Callback called when the user closes the lightbox (Esc or click outside). */
  onClose?: () => void;
  /** Largeur maximale de l'image en px (defaut 1200). */
  maxWidth?: number;
  /** Hauteur maximale en px (defaut non limitee, garde le ratio). */
  maxHeight?: number;
}

/** Vueerendu principal de la lightbox. */
export function PhotoLightbox({
  photos,
  photoActive = 0,
  onClose,
  maxWidth = 1200,
  maxHeight,
}: Props) {
  const [index, setIndex] = React.useState(photoActive);
  const [isZoomed, setIsZoomed] = React.useState(false);

  const total = photos.length;

  // Clavier : next/prev/escape
  useEffect(() => {
    if (total === 0) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => (i + 1) % total);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => (i - 1 + total) % total);
      }
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [total, onClose]);

  // Clic exterieur ferme
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".lightbox-overlay")) {
        onClose?.();
      }
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [onClose]);

  const current = photos[index];
  if (!current) return null;

  const style: React.CSSProperties = {
    maxWidth: maxWidth,
    maxHeight: maxHeight !== undefined ? maxHeight : "none",
    width: "auto",
    height: "auto",
    borderRadius: 4,
    boxShadow: "0 0 0 1px rgba(0,0,0,0.15), 0 8px 32px rgba(0,0,0,0.2)",
    transition: isZoomed ? "transform 0.2s ease" : "",
    transform: isZoomed ? "scale(1.05)" : "scale(1)",
  };

  return (
    <div
      className="lightbox-overlay fixed inset-0 z-50 flex items-center justify-center p-2"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <button
        className="lightbox-close absolute top-2 right-2 text-white text-2xl hover:text-yellow-300"
        onClick={onClose}
        aria-label="Fermer la visionneuse"
      >
        &times;
      </button>

      <div className="relative flex shrink-0">
        <img
          src={current.url}
          alt={`Photo vehicule ${index + 1} de ${total} - ${current.categorie || ""}`}
          style={style}
          onClick={() => setIsZoomed((s) => !s)}
          role="button"
          aria-label={isZoomed ? "Retour a la vue normale" : "Zoom sur l'image"}
        />
      </div>

      <div className="flex justify-between items-center pt-2 px-4">
        <div className="text-white text-sm">
          {index + 1} / {total}
          {current.categorie && `- ${current.categorie}`}
        </div>
        <div className="text-white text-sm">
          {current.date ? new Date(current.date).toLocaleDateString("fr-FR") : ""}
        </div>
      </div>
    </div>
  );
}