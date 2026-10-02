"use client";

import { memo } from "react";
import { GABARIT_DEFAUT, empreinteVehicule, type Empreinte } from "@atelierone/geo";

interface FantomePlacementProps {
  isVisible: boolean;
  cx: number;
  cy: number;
  rotation: number;
  longueur: number | null;
  largeur: number | null;
  validation: any; // ResultatPlacement
  zoneMarge: number;
  emplacement?: { polygone: any; rotation: number } | null;
}

function getCorners(e: Empreinte): string {
  const a = (e.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hw = e.w / 2;
  const hh = e.h / 2;
  const corners: [number, number][] = [
    [-e.w / 2, -e.h / 2],
    [e.w / 2, -e.h / 2],
    [e.w / 2, e.h / 2],
    [-e.w / 2, e.h / 2],
  ];
  return corners
    .map(([dx, dy]) => {
      const x = e.cx + dx * cos - dy * sin;
      const y = e.cy + dx * sin + dy * cos;
      return `${x},${y}`;
    })
    .join(" ");
}

function polygonPoints(geometrie: any): string {
  if (geometrie.type === "rectangle") {
    const { x, y, w, h } = geometrie;
    return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  }
  return geometrie.points.map(([x, y]: [number, number]) => `${x},${y}`).join(" ");
}

export const FantomePlacement = memo(function FantomePlacement({ 
  isVisible, 
  cx, 
  cy, 
  rotation, 
  longueur, 
  largeur, 
  validation, 
  zoneMarge,
  emplacement,
}: FantomePlacementProps) {
  if (!isVisible) return null;

  const empreinte = empreinteVehicule({
    centreX: cx,
    centreY: cy,
    rotation,
    longueur,
    largeur,
  });

  const isValid = validation?.ok === true;
  const fillColor = isValid 
    ? "var(--color-emerald-500/25)" 
    : "var(--color-red-500/25)";
  const strokeColor = isValid 
    ? "var(--color-emerald-500/90)" 
    : "var(--color-red-500/90)";
  const strokeDash = isValid ? "none" : "4,3";

  const e = { cx, cy, w: empreinte.w, h: empreinte.h, rotation: empreinte.rotation };
  const corners = getCorners({ ...empreinte, cx, cy });

  return (
    <g className="fantome-placement" style={{ pointerEvents: "none" }}>
      {/* Aire de l'emplacement visé */}
      {emplacement && (
        <polygon
          points={polygonPoints(emplacement.polygone)}
          fill="var(--color-primary-500/05)"
          stroke="var(--color-primary-500/40)"
          strokeWidth={0.12}
          strokeDasharray="3,3"
        />
      )}

      {/* Marge de sécurité autour de l'emplacement */}
      {emplacement && (
        <polygon
          points={polygonPoints({
            ...emplacement.polygone,
            x: emplacement.polygone.x - 0.3,
            y: emplacement.polygone.y - 0.3,
            w: emplacement.polygone.w + 0.6,
            h: emplacement.polygone.h + 0.6,
          })}
          fill="none"
          stroke="var(--color-primary-500/20)"
          strokeWidth={0.08}
          strokeDasharray="2,4"
        />
      )}

      {/* Fantôme du véhicule */}
      <polygon
        points={getCorners({ cx, cy, w: empreinte.w, h: empreinte.h, rotation: empreinte.rotation })}
        fill="url(#fantome-gradient)"
        stroke={strokeColor}
        strokeWidth={0.2}
        strokeDasharray={strokeDash}
        style={{
          filter: "drop-shadow(0 0 4px var(--color-primary-500/40))",
          transition: "all 0.05s ease-out",
        }}
      />

      {/* Centre et axe */}
      <g style={{ pointerEvents: "none" }}>
        <circle cx={cx} cy={cy} r="0.15" fill={strokeColor} stroke="white" strokeWidth="0.08" />
        
        {/* Axe longitudinal */}
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(rotation * Math.PI / 180) * (longueur ? longueur / 2 : GABARIT_DEFAUT.longueur / 2)}
          y2={cy + Math.sin(rotation * Math.PI / 180) * (longueur ? longueur / 2 : GABARIT_DEFAUT.longueur / 2)}
          stroke={strokeColor}
          strokeWidth={0.15}
          strokeDasharray="2,2"
        />
        
        {/* Poignée de rotation (visuelle seulement) */}
        <circle
          cx={cx + Math.cos((rotation - 90) * Math.PI / 180) * (largeur ? largeur / 2 + 1 : GABARIT_DEFAUT.largeur / 2 + 1)}
          cy={cy + Math.sin((rotation - 90) * Math.PI / 180) * (largeur ? largeur / 2 + 1 : GABARIT_DEFAUT.largeur / 2 + 1)}
          r="0.25"
          fill="var(--color-primary-500)"
          stroke="white"
          strokeWidth="0.08"
          style={{ opacity: 0.7 }}
        >
          <title>Faire pivoter</title>
        </circle>
      </g>

      {/* Indicateurs de validation */}
      <defs>
        <linearGradient id="fantome-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={fillColor} stopOpacity={0.9} />
          <stop offset="100%" stopColor={fillColor} stopOpacity={0.3} />
        </linearGradient>
      </defs>

      {/* Messages d'erreur/avertissement près du fantôme */}
      {!validation.ok && (
        <g>
          {validation.echecs.map((echec: any, i: number) => (
            <text
              key={i}
              x={cx}
              y={cy - (longueur ? longueur / 2 : 2.25) - 1.5 - i * 1.2}
              textAnchor="middle"
              dominantBaseline="alphabetic"
              fontSize="0.8"
              fontWeight="600"
              fill="var(--color-red-500)"
              stroke="white"
              strokeWidth="0.3"
              paintOrder="stroke"
              style={{ filter: "drop-shadow(0 1px 2px var(--color-black/30))" }}
            >
              {echec.code === "HORS_ZONE" && `↗ Hors zone (${echec.depassementM?.toFixed(2)} m)`}
              {echec.code === "COLLISION" && `✕ Collision avec ${echec.vehicules?.join(", ")} (${echec.chevauchementM2?.toFixed(2)} m²)`}
              {echec.code === "ORIENTATION_NON_AUTORISEE" && `🔒 Orientation imposée : ${echec.attendue}°`}
              {echec.code === "ZONE_NON_STATIONNABLE" && "🚫 Zone non stationnable"}
              {echec.code === "EMPLACEMENT_TROP_PETIT" && `📏 Emplacement trop petit (${echec.requis?.L}x${echec.requis?.l}m)`}
            </text>
          ))}
        </g>
      )}

      {validation.ok && validation.avertissements.length > 0 && (
        <g>
          {validation.avertissements.map((avert: any, i: number) => (
            <text
              key={i}
              x={cx}
              y={cy - 3.5 - i * 1.2}
              textAnchor="middle"
              dominantBaseline="alphabetic"
              fontSize="0.7"
              fontWeight="500"
              fill="var(--color-amber-500)"
              stroke="white"
              strokeWidth="0.25"
              paintOrder="stroke"
            >
              {avert.code === "ESPACE_LIBRE_NON_EXPLOITABLE" && "⚠ Espace libre non exploitable"}
              {avert.code === "PRES_DE_LA_MARGE" && `⚠ Proche marge (${avert.distanceM?.toFixed(2)} m)`}
            </text>
          ))}
        </g>
      )}
    </g>
  );
});

export default FantomePlacement;