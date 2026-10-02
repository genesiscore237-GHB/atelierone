"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw, X } from "lucide-react";

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => Promise<void> | void;
  onFallback?: () => void;
  categorieLabel?: string;
}

function messageErreur(e: unknown): string {
  const err = e as { name?: string; message?: string };
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Accès caméra refusé. Autorisez la caméra dans les réglages du navigateur, ou utilisez « Charger une photo ».";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Aucune caméra disponible sur cet appareil. Utilisez « Charger une photo ».";
    case "NotReadableError":
      return "La caméra est déjà utilisée par une autre application. Fermez-la puis réessayez.";
    default:
      break;
  }
  if (err?.message === "NOT_SUPPORTED") return "La caméra directe n'est pas supportée par ce navigateur.";
  if (err?.message === "INSECURE")
    return "La caméra directe nécessite une connexion sécurisée (HTTPS) ou localhost. Utilisez « Charger une photo ».";
  return err?.message ?? "Impossible d'accéder à la caméra.";
}

export function CameraCapture({ open, onClose, onCapture, onFallback, categorieLabel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pret, setPret] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [plusieursCameras, setPlusieursCameras] = useState(false);

  const arreter = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPret(false);
  }, []);

  useEffect(() => {
    if (!open) {
      arreter();
      return;
    }
    let annule = false;
    setErreur(null);
    setPret(false);

    (async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("NOT_SUPPORTED");
        }
        if (!window.isSecureContext) throw new Error("INSECURE");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (annule) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPret(true);
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setPlusieursCameras(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch (e) {
        setErreur(messageErreur(e));
      }
    })();

    return () => {
      annule = true;
      arreter();
    };
  }, [open, facing, arreter]);

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
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }, [pret, enCours, onCapture, onClose]);

  if (!open) return null;

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
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />
          {!pret && !erreur && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          )}
          {erreur && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-6 text-center">
              <p className="text-sm text-muted-foreground">{erreur}</p>
              {onFallback && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onFallback();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/30"
                >
                  <ImagePlus size={14} />
                  Charger une photo
                </button>
              )}
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
              <RefreshCw size={14} />
              Changer
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
