"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw, Settings, ShieldAlert, X } from "lucide-react";
import { useCameraPermission, instructionsReglages, type EchecCamera, type ResultatReautorisation } from "~/hooks/useCameraPermission";

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => Promise<void> | void;
  onFallback?: () => void;
  categorieLabel?: string;
}

/**
 * CAPTURE CAMÉRA — shared par le parking ET l'atelier.
 *
 * Elle vivait dans `dashboard/garage/_components/` et était importée par l'atelier
 * pour l'état des lieux : même dépendance materials que PhotoLightbox, même
 * raison de la monter d'un cran.
 *
 * ## Ce qui a changé, et pourquoi
 *
 * L'ancienne version appelait `getUserMedia` DÈS l'ouverture de la fenêtre.
 * C'est la cause du blocage décrit sur le terrain :
 *
 *   1. L'invite apparaît. L'agent la refuse — souvent par inadvertance.
 *   2. **Le navigateur mémorise le refus pour toute l'origine.**
 *   3. Toutes les tentatives suivantes lèvent `NotAllowedError` SANS invite.
 *   4. L'agent réessaie, rien ne change, et rien ne lui dit pourquoi.
 *
 * La seule sortie était d'ouvrir les réglages du navigateur, que rien dans
 * l'application n'indiquait. La caméra était donc bloquée au sens strict :
 * aucune action dans l'application ne pouvait la débloquer.
 *
 * Ici, l'autorisation est un **état consulté avant d'agir** :
 *
 *   - `prompt`      → un bouton « Autoriser la caméra » explicite. L'agent
 *                     décide en connaissance de cause.
 *   - `denied`      → la procédure de remédiation, avec le chemin exact pour
 *                     LE navigateur qu'il utilise, et un bouton « J'ai
 *                     autorisé, réessayer ». Ce n'est pas une impasse.
 *   - `granted`     → la caméra s'ouvre.
 *   - `inconnue`    → on tente, comme avant : c'est le cas de Safari iOS.
 *
 * Et comme `permissions.onchange` est écouté, autoriser depuis les réglages fait
 *ямиre l'application sans recharger la page.
 */
/**
 * Garde typé explicite.
 *
 * Le rétrécissement automatique de `r.ok` ne se produit pas ici — `r` reste
 * vu comme l'union complète, et `r.raison` est refusé. Un garde déclaré
 * fonctionne toujours, quelles que soient les règles de rétrécissement
 * applicables, et il dit l'intention en toutes lettres : « ceci est un échec ».
 */
function estEchec(r: ResultatReautorisation): r is EchecCamera {
  return r.ok === false;
}

export function CameraCapture({ open, onClose, onCapture, onFallback, categorieLabel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pret, setPret] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [plusieursCameras, setPlusieursCameras] = useState(false);
  const [refusDefinitif, setRefusDefinitif] = useState(false);
  const { etat, reautoriser } = useCameraPermission();

  const arreter = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPret(false);
  }, []);

  // Ouverture du flux — appelée seulement quand l'autorisation est acquise.
  const ouvrir = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErreur("La caméra directe n'est pas supportée par ce navigateur.");
      return;
    }
    if (!window.isSecureContext) {
      setErreur("La caméra exige une connexion sécurisée (HTTPS) ou localhost.");
      return;
    }
    setErreur(null);
    setPret(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPret(true);
      setRefusDefinitif(false);
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      setPlusieursCameras(devices.filter((d) => d.kind === "videoinput").length > 1);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
        // Le navigateur mémorise le refus : inutile d'insister, il faut agir
        // dans les réglages. Le dire est la seule chose utile.
        setRefusDefinitif(true);
        setErreur("Accès caméra refusé par le navigateur.");
      } else if (err?.name === "NotFoundError" || err?.name === "OverconstrainedError") {
        setErreur("Aucune caméra disponible sur cet appareil.");
      } else if (err?.name === "NotReadableError" || err?.name === "AbortError") {
        setErreur("La caméra est déjà utilisée par une autre application. Fermez-la puis réessayez.");
      } else {
        setErreur(err?.message ?? "Impossible d'accéder à la caméra.");
      }
    }
  }, [facing]);

  /**
   * Demande l'autorisation, puis ouvre si elle est accordée.
   *
   * Déclenchée par un BOUTON, pas à l'ouverture. C'est la différence entière
   * entre demander une permission et la subir.
   */
  const demander = useCallback(async () => {
    setErreur(null);
    const r = await reautoriser();
    if (!estEchec(r)) {
      await ouvrir();
      return;
    }
    if (r.raison === "refus") {
      setRefusDefinitif(true);
      setErreur("Accès caméra refusé par le navigateur.");
    } else if (r.raison === "insecure") {
      setErreur("La caméra exige une connexion sécurisée (HTTPS) ou localhost.");
    } else {
      setErreur(r.message);
    }
  }, [reautoriser, ouvrir]);

  useEffect(() => {
    if (!open) {
      arreter();
      setRefusDefinitif(false);
      setErreur(null);
      return;
    }
    // Autorisation déjà accordée : on ouvre directement, sans réinvite.
    if (etat === "granted") void ouvrir();
    return () => arreter();
  }, [open, etat, ouvrir, arreter]);

  const capturer = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !pret || enCours) return;
    setEnCours(true);
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) throw new Error("Flux caméra non prêt. Réessayez.");
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Capture impossible sur cet appareil.");
      ctx.drawImage(video, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("Capture impossible sur cet appareil.");
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      await onCapture(file);
      onClose();
    } catch (e) {
      setErreur((e as Error)?.message ?? "Capture impossible.");
    } finally {
      setEnCours(false);
    }
  }, [pret, enCours, onCapture, onClose]);

  if (!open) return null;

  const reglement = instructionsReglages();
  const enAttenteDAutorisation = etat === "prompt" && !pret;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Camera size={16} />
            {categorieLabel ? `Photo — ${categorieLabel}` : "Prendre une photo"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            title="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="relative aspect-[4/3] w-full bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />

          {/* En attente d'autorisation : on DEMANDE, avec un bouton. */}
          {enAttenteDAutorisation && !erreur && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-6 text-center">
              <Camera size={30} className="text-muted-foreground opacity-60" />
              <p className="text-sm text-foreground">Cette application a besoin de la caméra pour photographier le véhicule.</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Votre navigateur va vous le demander. Vous pourrez choisir à chaque fois.
              </p>
              <button
                type="button"
                onClick={demander}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Camera size={15} /> Autoriser la caméra
              </button>
              {onFallback && (
                <button
                  type="button"
                  onClick={() => { onClose(); onFallback(); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/30"
                >
                  <ImagePlus size={14} /> Choisir depuis la galerie
                </button>
              )}
            </div>
          )}

          {!pret && !erreur && !enAttenteDAutorisation && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          )}

          {erreur && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-background/95 p-6 text-center">
              <ShieldAlert size={28} className={refusDefinitif ? "text-amber-500" : "text-muted-foreground opacity-60"} />
              <p className="text-sm font-semibold text-foreground">{erreur}</p>

              {refusDefinitif && (
                // Le refus est mémorisé : réessayer ici ne servirait à rien.
                // On donne donc la procédure, pas un bouton qui échoue.
                <div className="w-full max-w-sm rounded-lg border border-border bg-background p-3 text-left">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Settings size={13} /> {reglement.titre}
                  </p>
                  <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                    {reglement.etapes.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2">
                {refusDefinitif && (
                  <button
                    type="button"
                    onClick={demander}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <RefreshCw size={13} /> J'ai autorisé, réessayer
                  </button>
                )}
                {!pret && (
                  <button
                    type="button"
                    onClick={demander}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/30"
                  >
                    <Camera size={13} /> Réessayer
                  </button>
                )}
                {onFallback && (
                  <button
                    type="button"
                    onClick={() => { onClose(); onFallback(); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/30"
                  >
                    <ImagePlus size={14} /> Charger une photo
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          {plusieursCameras && !erreur ? (
            <button
              type="button"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/30"
              title="Changer de caméra"
            >
              <RefreshCw size={14} /> Changer
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={capturer}
            disabled={!pret || enCours}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours ? (
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
            ) : (
              <Camera size={16} />
            )}
            {enCours ? "Traitement..." : "Capturer"}
          </button>
        </div>
      </div>
    </div>
  );
}