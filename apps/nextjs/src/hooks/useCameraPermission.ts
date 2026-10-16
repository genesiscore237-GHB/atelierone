"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * AUTORISATION CAMÉRA — état réel, pas une devinette.
 *
 * ## Le problème que ce hook résout
 *
 * `getUserMedia` déclenche l'invite du navigateur. Si l'agent la refuse — même
 * par inadvertance, même en voulant refuser une fois — **le navigateur
 * mémorise le refus pour toute l'origine**. Les tentatives suivantes échouent
 * alors immédiatement, en silence, sans jamais réinviter.
 *
 * Résultat : l'agent appuie sur « Prendre une photo », ça ne marche pas, il
 * réessaie, ça ne marche pas. Aucun message ne lui dit pourquoi, et aucun bouton
 * ne lui permet de réparer. Le seul moyen de sortir de là est d'ouvrir les
 * réglages du navigateur — que rien dans l'application ne lui indique.
 *
 * C'est le défaut décrit : « le navigateur bloque l'accès à l'appareil photo ».
 *
 * ## Ce que fait ce hook
 *
 * 1. **Interroge `navigator.permissions`** avant d'appeler la caméra. L'API
 *    Permissions expose l'état réel (`granted` / `denied` / `prompt`), ce qui
 *    permet de distinguer trois situations que l'erreur seule confond :
 *    refus DEFINITIF (à réparer dans les réglages), refus PONCTUEL (réinviter
 *    fonctionne), et simple absence de permission (invite encore possible).
 * 2. **Réagit en direct** via `permissions.onchange` : l'agent qui.authorise
 *    depuis les réglages du navigateur voit l'application se débloquer sans
 *    recharger la page.
 * 3. **Expose `reautoriser()`**, qui appelle la caméra puis relâche
 *    immédiatement le flux. C'est ce geste qui déclenche l'invite ; sans lui,
 *    il n'y a rien à reconstruire une fois le refus mémorisé.
 */

export type EtatCamera = "granted" | "denied" | "prompt" | "inconnue";

/** Cause d'un échec, assez fine pour que l'écran puisse réagir différemment. */
export type RaisonCamera = "refus" | "introuvable" | "insecure" | "indisponible" | "occupe" | "autre";

export type ResultatDemande =
  | { ok: true; flux: MediaStream }
  | EchecCamera;

/** Échec typé — `ok: false` fait office de discriminant. */
export type EchecCamera = { ok: false; raison: RaisonCamera; message: string };

export type ResultatReautorisation =
  | { ok: true }
  | EchecCamera;

/**
 * Traduit une exception `getUserMedia` en cause exploitable.
 *
 * Le type de retour est `EchecCamera` et non l'union complète : cette fonction
 * ne rend jamais de flux. Sans cela, TypeScript voit une union à chaque appel et
 * refuse `r.raison` — le genre de contournement (`as never`) qui fait
 * disparaître le contrôle de type sans le signaler.
 */
function classer(e: unknown): EchecCamera {
  const err = e as { name?: string; message?: string };
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return { ok: false, raison: "refus", message: "Accès caméra refusé." };
    case "NotFoundError":
    case "OverconstrainedError":
      return { ok: false, raison: "introuvable", message: "Aucune caméra disponible sur cet appareil." };
    case "NotReadableError":
    case "AbortError":
      return { ok: false, raison: "occupe", message: "La caméra est déjà utilisée par une autre application." };
    case "NotSupportedError":
      return { ok: false, raison: "indisponible", message: "La caméra directe n'est pas supportée par ce navigateur." };
    default:
      break;
  }
  if (err?.message === "NOT_SUPPORTED") {
    return { ok: false, raison: "indisponible", message: "La caméra directe n'est pas supportée par ce navigateur." };
  }
  if (err?.message === "INSECURE") {
    return {
      ok: false,
      raison: "insecure",
      message: "La caméra exige une connexion sécurisée (HTTPS) ou localhost.",
    };
  }
  return { ok: false, raison: "autre", message: err?.message ?? "Impossible d'accéder à la caméra." };
}

export function useCameraPermission() {
  const [etat, setEtat] = useState<EtatCamera>("inconnue");
  const [rafraichissement, setRafraichissement] = useState(0);

  // Interrogation de l'état d'autorisation.
  useEffect(() => {
    let annule = false;
    let permission: PermissionStatus | null = null;

    const lire = async () => {
      if (typeof navigator === "undefined" || !navigator.permissions?.query) {
        if (!annule) setEtat("inconnue");
        return;
      }
      try {
        permission = await navigator.permissions.query({ name: "camera" as PermissionName });
        if (annule) return;
        setEtat((permission.state as EtatCamera) ?? "inconnue");
        permission.onchange = () => setEtat(permission!.state as EtatCamera);
      } catch {
        // Safari ne connaît pas toujours `camera` dans permissions.query.
        // Ce n'est pas une erreur : l'état restera « inconnue », et
        // `getUserMedia` fera foi — c'est le chemin historique.
        if (!annule) setEtat("inconnue");
      }
    };

    void lire();
    return () => {
      annule = true;
      if (permission) permission.onchange = null;
    };
  }, [rafraichissement]);

  /**
   * Demande (ou redemande) l'autorisation.
   *
   * Le flux est relâché immédiatement : on veut l'INVITE, pas un flux
   * camera ouvert en arrière-plan pendant que l'agent décide.
   */
  const reautoriser = useCallback(async (): Promise<ResultatReautorisation> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const r = classer({ name: "NotSupportedError" });
      return { ok: false, raison: r.raison, message: r.message };
    }
    if (!window.isSecureContext) {
      return {
        ok: false,
        raison: "insecure",
        message: "La caméra exige une connexion sécurisée (HTTPS) ou localhost.",
      };
    }
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      flux.getTracks().forEach((t) => t.stop());
      setEtat("granted");
      return { ok: true };
    } catch (e) {
      const r = classer(e);
      // Le navigateur mémorise un refus : le refléter tout de suite évite
      // qu'on réessaie dix fois en croyant à un incident passager.
      if (r.raison === "refus") setEtat("denied");
      return { ok: false, raison: r.raison, message: r.message };
    }
  }, []);

  return { etat, reautoriser, rafraichir: () => setRafraichissement((n) => n + 1) };
}

/**
 * PROCÉDURE DE REMÉDATION, par navigateur.
 *
 * « Autorisez la caméra dans les réglages » ne sert à rien à un agent qui ne
 * sait pas où ils sont. Sur Android/Chrome, le réglage est à trois niveaux :
 * le verrou en haut de l'écran, le site dans les autorisations, puis le
 * navigateur. Donner le chemin exact évite un appel au informaticien.
 */
export function instructionsReglages(navigateur?: string): { titre: string; etapes: string[] } {
  const ua = (navigateur ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")) || "";
  const iOS = /iPhone|iPad|iPod/.test(ua);
  const android = /Android/.test(ua);
  const firefox = /Firefox/.test(ua);

  if (iOS) {
    return {
      titre: "Réactiver la caméra (iPhone / iPad)",
      etapes: [
        "Sur Safari : l'icône en forme d'aiguille ou de caméra, à gauche de la barre d'adresse.",
        "Touchez « Caméra », puis choisissez « Demander » ou « Autoriser ».",
        "Si le menu n'affiche pas « Caméra » : Réglages ▸ Safari ▸ Caméra ▸ Demander.",
        "Sur iOS, l'autorisation ne peut être donnée que depuis Safari — pas depuis Chrome ou Firefox.",
      ],
    };
  }
  if (firefox) {
    return {
      titre: "Réactiver la caméra (Firefox)",
      etapes: [
        "Cliquez sur l'icône de bouclier, à gauche de la barre d'adresse.",
        "Cliquez sur la flèche à côté de « Connexion chiffrée ».",
        "Décochez « Utiliser la caméra », rechargez la page, puis réessayez.",
      ],
    };
  }
  if (android) {
    return {
      titre: "Réactiver la caméra (Android / Chrome)",
      etapes: [
        "Appuyez sur le cadenas ou l'information du site, à gauche de la barre d'adresse.",
        "Ouvrez « Autorisations », puis « Caméra ».",
        "Choisissez « Autoriser » — pas « Bloquer ».",
        "Vérifiez aussi le cadenas en haut de l'écran : le site doit être bien autorisé.",
      ],
    };
  }
  return {
    titre: "Réactiver la caméra (Chrome / Edge)",
    etapes: [
      "Cliquez sur l'icône de caméra ou le cadenas, à gauche de la barre d'adresse.",
      "Ouvrez « Autorisations du site », puis « Caméra ».",
      "Choisissez « Autoriser », puis rechargez la page.",
    ],
  };
}