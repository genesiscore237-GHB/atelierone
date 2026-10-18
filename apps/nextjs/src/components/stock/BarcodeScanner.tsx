"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine, X } from "lucide-react";
import { useCameraPermission, instructionsReglages } from "~/hooks/useCameraPermission";

/**
 * LECTEUR DE CODE-BARRES PAR CAMÉRA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE N'EST JAMAIS UNE CONDITION D'UTILISATION
 *
 * Le champ texte reste actif EN PERMANENCE, même caméra ouverte. C'est la
 * règle qui rend ce composant acceptable dans un garage ouest-africain :
 *
 *   · le téléphone peut être ancien, sans `BarcodeDetector` — c'est le cas
 *     de Safari iOS et de Firefox, où l'API n'existe pas ;
 *   · le magasinier peut n'avoir aucune étiquette imprimée sur sa pièce ;
 *   · le réseau peut tomber, et le scan ne fonctionne pas hors ligne sur
 *     un navigateur sans le moteur natif.
 *
 * Dans les trois cas, on tape. Le scan ACCÉLÈRE, il ne conditionne rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'AUTORISATION EST UN ÉTAT CONSULTÉ, PAS UNE INVITE SUBIE
 *
 * Même raison que `CameraCapture` : le navigateur MÉMORISE un refus pour
 * toute l'origine. Appeler `getUserMedia` sans avoir déclenché l'invite
 * produit un blocage définitif qu'aucune action dans l'application ne peut
 * lever. On réexporte donc le même état explicite que le reste de
 * l'application, pour que l'agent décide en connaissance de cause.
 */

interface BarcodeDetectorApi {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorApi;
  }
}

/** Les formats qu'un magasin manipule réellement. Pas besoin de plus. */
const FORMATS = [
  "ean_13",
  "ean_8",
  "code_128",
  "code_39",
  "upc_a",
  "upc_e",
  "qr_code",
  "itf",
];

interface BarcodeScannerProps {
  /** Vrai quand le panneau caméra est ouvert. */
  ouvert: boolean;
  onClose: () => void;
  /** Appelé avec la valeur lue. Le composant se ferme ensuite. */
  onDetect: (valeur: string) => void;
}

export function BarcodeScanner({ ouvert, onClose, onDetect }: BarcodeScannerProps) {
  const { etat, reautoriser } = useCameraPermission();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fluxRef = useRef<MediaStream | null>(null);
  const boucleRef = useRef<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [apiDisponible, setApiDisponible] = useState<boolean | null>(null);

  const arreter = useCallback(() => {
    if (boucleRef.current != null) {
      cancelAnimationFrame(boucleRef.current);
      boucleRef.current = null;
    }
    fluxRef.current?.getTracks().forEach((t) => {
      // `stop()` et non `pause()` : sans cela, le voyant rouge de la caméra
      // reste allumé après fermeture du panneau, et l'agent croit que
      // l'application observe encore.
      t.stop();
    });
    fluxRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  useEffect(() => {
    if (!ouvert) {
      arreter();
      return;
    }

    let annule = false;
    setErreur(null);

    const demarrer = async () => {
      // Pas de moteur de détection : on ne peut rien faire de la vidéo.
      // On ferme et on dit pourquoi — ce n'est pas une erreur, c'est une
      // capacité absente de l'appareil.
      if (typeof window === "undefined" || !window.BarcodeDetector) {
        setApiDisponible(false);
        arreter();
        return;
      }
      setApiDisponible(true);

      if (!navigator.mediaDevices?.getUserMedia) {
        setErreur("Cet appareil n'expose pas de caméra.");
        return;
      }
      if (!window.isSecureContext) {
        setErreur("La caméra exige HTTPS (ou localhost).");
        return;
      }

      try {
        const flux = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (annule) {
          flux.getTracks().forEach((t) => t.stop());
          return;
        }
        fluxRef.current = flux;

        const v = videoRef.current;
        if (!v) return;
        v.srcObject = flux;
        await v.play().catch(() => {
          /* certains navigateurs refusent play() avant la première frame */
        });

        let detecteur: BarcodeDetectorApi;
        try {
          detecteur = new window.BarcodeDetector({ formats: FORMATS });
        } catch {
          // Le moteur existe mais refuse ce jeu de formats : on tente sans
          // restriction plutôt que de renoncer au scan sur cet appareil.
          detecteur = new window.BarcodeDetector();
        }

        const detecter = async () => {
          if (annule || !videoRef.current) return;
          try {
            const codes = await detecteur.detect(videoRef.current);
            const valeur = codes[0]?.rawValue;
            if (valeur) {
              arreter();
              onDetect(valeur);
              return;
            }
          } catch {
            // Une frame illisible est normale (mouvement, faible lumière).
            // On continue :'insiste pas sur une image ratée.
          }
          boucleRef.current = requestAnimationFrame(detecter);
        };
        boucleRef.current = requestAnimationFrame(detecter);
      } catch (e) {
        const nom = (e as { name?: string }).name ?? "";
        if (nom === "NotAllowedError" || nom === "SecurityError") {
          setErreur("Caméra refusée. Autorisez-la dans les réglages du navigateur.");
        } else if (nom === "NotFoundError" || nom === "OverconstrainedError") {
          setErreur("Aucune caméra utilisable sur cet appareil.");
        } else {
          setErreur("Impossible d'ouvrir la caméra.");
        }
        arreter();
      }
    };

    void demarrer();
    return () => {
      annule = true;
      arreter();
    };
  }, [ouvert, arreter, onDetect]);

  if (!ouvert) return null;

  const reglages = instructionsReglages();

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ScanLine size={14} /> Caméra
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Fermer la caméra"
        >
          <X size={16} />
        </button>
      </div>

      {apiDisponible === false ? (
        <div className="rounded-md bg-background p-3 text-sm">
          <p className="font-medium text-foreground">Scan par caméra indisponible ici</p>
          <p className="mt-1 text-muted-foreground">
            Ce navigateur n&apos;a pas de moteur de lecture de code-barres. Ce n&apos;est pas un
            blocage : le champ de saisie reste actif, au clavier ou avec un lecteur branché.
          </p>
        </div>
      ) : etat === "denied" ? (
        <div className="rounded-md bg-background p-3 text-sm">
          <p className="font-medium text-foreground">Caméra bloquée</p>
          <p className="mt-1 text-muted-foreground">{reglages.titre}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            {reglages.etapes.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ol>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void reautoriser()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              J&apos;ai autorisé, réessayer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-muted px-3 py-1.5 text-xs font-semibold"
            >
              Saisir au clavier
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-md bg-black">
            <video
              ref={videoRef}
              className="max-h-56 w-full object-cover"
              muted
              playsInline
              aria-label="Vidéo de la caméra pour lecture du code-barres"
            />
            {/* Réticule : sans repère visuel, l'agent ne sait pas où
                placer le code et rate la lecture une fois sur deux. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-3/4 rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
          {erreur && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
              <CameraOff size={13} className="mt-0.5 shrink-0" />
              {erreur}
            </p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Camera size={13} />
            Visez le code-barres. Vous pouvez aussi continuer à taper.
          </p>
        </>
      )}
    </div>
  );
}