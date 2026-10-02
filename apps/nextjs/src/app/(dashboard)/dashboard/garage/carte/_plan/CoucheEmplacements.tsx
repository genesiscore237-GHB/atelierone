"use client";

import { memo } from "react";
import { MapPin } from "lucide-react";

interface Spot {
  id: number;
  code: string;
  zoneId: number;
  geometrie: { type: "rectangle"; x: number; y: number; w: number; h: number } | { type: "polygon"; points: number[][] };
  statut: "LIBRE" | "OCCUPE" | "BLOQUE" | "RESERVE";
  rotation: number;
  vehiculeId?: number | null;
  bloque?: boolean;
  reservePour?: number | null;
}

interface CoucheEmplacementsProps {
  spots: Spot[];
  transform: { k: number; x: number; y: number };
  onSpotClick?: (spot: Spot) => void;
}

function polygonPoints(geometrie: any): string {
  if (geometrie.type === "rectangle") {
    const { x, y, w, h } = geometrie;
    return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  }
  return geometrie.points.map(([x, y]: [number, number]) => `${x},${y}`).join(" ");
}

const STATUT_COLORS = {
  LIBRE: { fill: "var(--color-emerald-500/12)", stroke: "var(--color-emerald-500/80)" },
  OCCUPE: { fill: "var(--color-blue-500/12)", stroke: "var(--color-blue-500/80)" },
  BLOQUE: { fill: "var(--color-red-500/12)", stroke: "var(--color-red-500/80)" },
  RESERVE: { fill: "var(--color-amber-500/12)", stroke: "var(--color-amber-500/80)" },
};

function SpotIcon({ statut, x, y, rotation }: { statut: Spot["statut"]; x: number; y: number; rotation: number }) {
  const colors = STATUT_COLORS[statut];
  return (
    <g transform={`translate(${x},${y}) rotate(${rotation})`}>
      <rect
        x="-0.4"
        y="-0.4"
        width="0.8"
        height="0.8"
        rx="0.1"
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth="0.08"
      />
      <circle cx="0" cy="0" r="0.15" fill={colors.stroke} />
    </g>
  );
}

interface SpotComponentProps {
  spot: Spot;
  onClick?: (spot: Spot) => void;
}

const SpotComponent = memo(function SpotComponent({ spot, onClick }: SpotComponentProps) {
  const colors = STATUT_COLORS[spot.statut];
  const centerX = spot.geometrie.x + spot.geometrie.w / 2;
  const centerY = spot.geometrie.y + spot.geometrie.h / 2;

  return (
    <g className="spot" onClick={() => onClick?.(spot)} style={{ cursor: onClick ? "pointer" : "default" }}>
      <rect
        x={spot.geometrie.x}
        y={spot.geometrie.y}
        width={spot.geometrie.w}
        height={spot.geometrie.h}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={0.12}
        rx={0.1}
        style={{ filter: "drop-shadow(0 0 1px var(--color-black/10))" }}
      />
      
      {/* Indicateur de rotation de l'emplacement */}
      {spot.rotation !== 0 && (
        <line
          x1={spot.geometrie.x + spot.geometrie.w / 2}
          y1={spot.geometrie.y}
          x2={spot.geometrie.x + spot.geometrie.w / 2}
          y2={spot.geometrie.y + spot.geometrie.h}
          stroke="var(--color-primary-500/40)"
          strokeWidth="0.06"
          strokeDasharray="1,2"
        />
      )}
      
      {/* Code et icône au centre */}
      <g transform={`translate(${centerX},${centerY}) rotate(${spot.rotation})`}>
        <SpotIcon statut={spot.statut} x={0} y={0} rotation={0} />
        
        <text
          x={0}
          y={0.6}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="0.6"
          fontWeight="600"
          fill={colors.stroke}
          fontFamily="var(--font-mono)"
        >
          {spot.code}
        </text>
        
        {/* Indicateurs spéciaux */}
        {(spot.bloque || spot.reservePour) && (
          <text
            x={0}
            y={-spot.geometrie.h / 2 - 0.3}
            textAnchor="middle"
            dominantBaseline="baseline"
            fontSize="0.5"
            fill="var(--color-amber-500)"
            fontWeight="bold"
          >
            {spot.bloque ? "🔒" : "📍"}
          </text>
        )}
      </g>
      
      {/* Tooltip visuel au hover (via CSS) */}
      <title>
        {spot.code} · {spot.statut}
        {spot.bloque && " · BLOQUÉ"}
        {spot.reservePour && ` · Réservé pour véhicule #${spot.reservePour}`}
      </title>
    </g>
  );
});

interface CoucheEmplacementsProps {
  spots: Array<any>;
  transform: { k: number; x: number; y: number };
  onSpotClick?: (spot: any) => void;
}

export const CoucheEmplacements = memo(function CoucheEmplacements({ spots, transform, onSpotClick }: CoucheEmplacementsProps) {
  if (!spots.length) return null;

  return (
    <g className="couche-emplacements">
      {spots.map((spot: any) => (
        <SpotComponent key={spot.id} spot={spot} onClick={onSpotClick} />
      ))}
    </g>
  );
});