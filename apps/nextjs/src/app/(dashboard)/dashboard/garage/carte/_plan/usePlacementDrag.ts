"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { api } from "~/trpc/react";
import { validerPlacement, empreinteVehicule, normaliserAngle, type Empreinte, type Voisin, type Polygone, type ZonePlacement, type EmplacementOptionnel, type ResultatPlacement, GABARIT_DEFAUT } from "@atelierone/geo";

export interface PlacementDragState {
  isDragging: boolean;
  vehicleId: number | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  rotation: number;
  zoneId: number | null;
  spotId: number | null;
}

export interface UsePlacementDragOptions {
  onValidate?: (result: ResultatPlacement) => void;
  onPlace?: (vehicleId: number, cx: number, cy: number, rotation: number, zoneId: number, spotId: number | null) => Promise<void>;
}

const SNAP_DISTANCE = 1.5; // mètres
const ROTATION_STEP = 15; // degrés

export function usePlacementDrag({
  onValidate,
  onPlace,
}: UsePlacementDragOptions = {}) {
  const [state, setState] = useState<PlacementDragState>({
    isDragging: false,
    vehicleId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    rotation: 0,
    zoneId: null,
    spotId: null,
  });

  const validationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidationRef = useRef<string>("");

  // Validation débouncée pendant le drag
  const validatePlacement = useCallback(async (
    vehicleId: number,
    cx: number,
    cy: number,
    rotation: number,
    zone: { polygone: any; stationnable: boolean; orientationAutorisee: number | null; marge: number },
    emplacement: { polygone: any; rotation: number } | null,
    voisins: Array<{ id: number; empreinte: any }>
  ) => {
    if (validationRef.current) clearTimeout(validationRef.current);
    
    validationRef.current = setTimeout(async () => {
      try {
        // @ts-expect-error - tRPC client type inference issue
        const result = await api.garage.verifierPlacement.query({
          vehicleId,
          zoneId: 0, // Sera remplacé côté serveur
          spotId: null,
          centreX: cx, // Note: l'API attend un centre (conversion coin→centre côté serveur)
          centreY: 0,
          rotation,
        });
        onValidate?.(result);
      } catch (e) {
        console.warn("Validation drag échouée:", e);
      }
    }, 60);
  }, [onValidate]);

  // Calcul de snap vers les emplacements et véhicules voisins
  const computeSnap = useCallback((
    cx: number,
    cy: number,
    rotation: number,
    spots: Array<{ id: number; x: number; y: number; w: number; h: number; rotation: number }>,
    vehicles: Array<{ id: number; cx: number; cy: number; w: number; h: number; rotation: number }>
  ): { x: number; y: number; rotation: number } => {
    let snappedX = cx;
    let snappedY = cy;
    let snappedRotation = rotation;

    // Snap aux emplacements (spots)
    for (const spot of spots) {
      const spotCx = spot.x + spot.w / 2;
      const spotCy = spot.y + spot.h / 2;
      const dist = Math.hypot(cx - spotCx, cy - spotCy);
      if (dist < SNAP_DISTANCE) {
        snappedX = spotCx;
        snappedY = spotCy;
        snappedRotation = spot.rotation;
        break;
      }
    }

    // Snap rotation aux multiples de 15°
    if (snappedRotation % ROTATION_STEP !== 0) {
      const nearest = Math.round(snappedRotation / ROTATION_STEP) * ROTATION_STEP;
      if (Math.abs(snappedRotation - nearest) < 7.5) {
        snappedRotation = nearest;
      }
    }

    // Snap aux véhicules voisins (alignement bord à bord avec marge)
    const marge = 0.3;
    for (const v of vehicles) {
      // Alignement horizontal (gauche/droite)
      const vLeft = v.cx - v.w / 2;
      const vRight = v.cx + v.w / 2;
      const myLeft = cx - GABARIT_DEFAUT.largeur / 2;
      const myRight = cx + GABARIT_DEFAUT.largeur / 2;
      
      if (Math.abs(myLeft - vRight) < marge && Math.abs(cy - v.cy) < v.h / 2) {
        snappedX = vRight + GABARIT_DEFAUT.largeur / 2;
      } else if (Math.abs(myRight - vLeft) < marge && Math.abs(cy - v.cy) < v.h / 2) {
        snappedX = vLeft - GABARIT_DEFAUT.largeur / 2;
      }
      
      // Alignement vertical (haut/bas)
      const vTop = v.cy - v.h / 2;
      const vBottom = v.cy + v.h / 2;
      const myTop = cy - GABARIT_DEFAUT.longueur / 2;
      const myBottom = cy + GABARIT_DEFAUT.longueur / 2;
      
      if (Math.abs(myTop - vBottom) < marge && Math.abs(cx - v.cx) < v.w / 2) {
        snappedY = vBottom + GABARIT_DEFAUT.longueur / 2;
      } else if (Math.abs(myBottom - vTop) < marge && Math.abs(cx - v.cx) < v.w / 2) {
        snappedY = vTop - GABARIT_DEFAUT.longueur / 2;
      }
    }

    return { x: snappedX, y: snappedY, rotation: snappedRotation };
  }, []);

  // Démarrer le drag
  const startDrag = useCallback((
    vehicleId: number,
    startX: number,
    startY: number,
    rotation: number,
    zoneId: number,
    spotId: number | null
  ) => {
    setState({
      isDragging: true,
      vehicleId,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      rotation,
      zoneId,
      spotId,
    });
  }, []);

  // Mettre à jour la position pendant le drag
  const updateDrag = useCallback((
    clientX: number,
    clientY: number,
    // Conversion client -> plan (mètres) - à adapter selon le transform SVG
    screenToPlan: (x: number, y: number) => { x: number; y: number }
  ) => {
    if (!state.isDragging) return;
    
    const { x, y } = screenToPlan(clientX, clientY);
    
    // Snap
    const snapped = computeSnap(x, y, state.rotation, [], []); // TODO: passer spots/vehicles
    
    setState(prev => ({
      ...prev,
      currentX: snapped.x,
      currentY: snapped.y,
      rotation: snapped.rotation,
    }));

    // Validation temps réel (débouncée)
    if (state.vehicleId && state.zoneId) {
      // TODO: récupérer zone, emplacement, voisins depuis le contexte
      validatePlacement(state.vehicleId, snapped.x, snapped.y, snapped.rotation, 
        { polygone: [], stationnable: true, orientationAutorisee: null, marge: 0.3 },
        null, []);
    }
  }, [state.isDragging, state.vehicleId, state.zoneId, state.rotation, computeSnap, validatePlacement]);

  // Terminer le drag
  const endDrag = useCallback(async () => {
    if (!state.isDragging || !state.vehicleId) return;
    
    if (onPlace && state.zoneId) {
      // Conversion centre -> coin pour l'API (si nécessaire)
      const cx = state.currentX;
      const cy = state.currentY;
      
      await onPlace(state.vehicleId, cx, cy, state.rotation, state.zoneId, state.spotId);
    }
    
    setState(prev => ({ ...prev, isDragging: false }));
  }, [state.isDragging, state.vehicleId, state.currentX, state.currentY, state.rotation, state.zoneId, state.spotId, onPlace]);

  // Annuler
  const cancelDrag = useCallback(() => {
    if (validationRef.current) clearTimeout(validationRef.current);
    setState(prev => ({ ...prev, isDragging: false }));
  }, []);

  // Rotation clavier
  const rotate = useCallback((delta: number) => {
    setState(prev => ({
      ...prev,
      rotation: normaliserAngle(prev.rotation + delta),
    }));
  }, []);

  return {
    state,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
    rotate,
  };
}