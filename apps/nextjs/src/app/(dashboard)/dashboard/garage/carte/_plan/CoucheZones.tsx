"use client";

import { FC, memo } from "react";
import { ZONE_TYPE_LABELS } from "../../_components/statuts";

interface Zone {
  id: number;
  code: string;
  nom: string;
  type: string;
  geometrie: { type: "rectangle"; x: number; y: number; w: number; h: number } | { type: "polygon"; points: number[][] };
  stationnable: boolean;
  margeSecurite: number;
}

interface CoucheZonesProps {
  zones: Zone[];
  transform: { k: number; x: number; y: number };
}

function polygonPoints(geometrie: Zone["geometrie"]): string {
  if (geometrie.type === "rectangle") {
    const { x, y, w, h } = geometrie;
    return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  }
  return geometrie.points.map(([x, y]) => `${x},${y}`).join(" ");
}

export const CoucheZones = memo(function CoucheZones({ zones, transform }: CoucheZonesProps) {
  if (!zones.length) return null;

  return (
    <g className="couche-zones">
      {zones.map((z) => {
        const stationnable = z.stationnable === true;
        const fill = stationnable ? "var(--color-primary-500/08)" : "var(--color-neutral-500/12)";
        const stroke = stationnable ? "var(--color-primary-500/60)" : "var(--color-neutral-500/50)";
        
        return (
          <g key={z.id} className="zone">
            <polygon
              points={polygonPoints(z.geometrie)}
              fill={fill}
              stroke={stroke}
              strokeWidth={0.15}
              strokeDasharray={stationnable ? "none" : "4,4"}
              style={{ filter: "drop-shadow(0 0 2px var(--color-primary-500/20))" }}
            />
            
            {/* Marge de sécurité visuelle */}
            {z.margeSecurite > 0 && (
              <polygon
                points={polygonPoints({
                  ...z.geometrie,
                  x: z.geometrie.x - z.margeSecurite,
                  y: z.geometrie.y - z.margeSecurite,
                  w: z.geometrie.w + 2 * z.margeSecurite,
                  h: z.geometrie.h + 2 * z.margeSecurite,
                })}
                fill="none"
                stroke="var(--color-primary-500/20)"
                strokeWidth={0.08}
                strokeDasharray="2,4"
              />
            )}
            
            {/* Label zone */}
            <text
              x={z.geometrie.x + 0.5}
              y={z.geometrie.y + 1.8}
              fill="var(--color-neutral-600)"
              fontSize="1.2"
              fontWeight="600"
              fontFamily="var(--font-sans)"
              dominantBaseline="hanging"
            >
              {z.code} · {ZONE_TYPE_LABELS[z.type] ?? z.type}
              {!z.stationnable && " (non stationnable)"}
            </text>
          </g>
        );
      })}
    </g>
  );
});