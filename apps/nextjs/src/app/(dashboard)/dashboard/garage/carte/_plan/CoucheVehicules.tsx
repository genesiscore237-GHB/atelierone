"use client";

import { memo, useState } from "react";
import { MapPin, Image, Car, RotateCcw } from "lucide-react";
import { STATUTS_VEHICULE_LABELS, STATUTS_VEHICULE_COLORS } from "../../_components/statuts";

interface Vehicule {
  id: number;
  numRegistre: number;
  marque: string | null;
  modele: string | null;
  statut: string;
  centreX: number;
  centreY: number;
  rotation: number;
  longueur: number | null;
  largeur: number | null;
  photos: Array<{ url: string; categorie: string }>;
  spotId?: number | null;
  dimensionsEstimees: boolean;
}

interface VehiculeProps {
  vehicule: any;
  isSelected: boolean;
  isHovered: boolean;
  isAction: boolean;
  isCollided: boolean;
  transform: { k: number; x: number; y: number };
  onClick: (vehicule: any) => void;
  onDragStart: (e: React.MouseEvent<SVGSVGElement>, vehicule: any) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const VehiculeSvg = memo(function VehiculeSvg({ 
  vehicule, 
  isSelected, 
  isHovered, 
  isAction, 
  isCollided,
  transform,
  onClick,
  onDragStart,
  onContextMenu,
}: VehiculeProps) {
  const w = vehicule.longueur ?? 4.5;
  const h = vehicule.largeur ?? 1.8;
  const cx = vehicule.centreX;
  const cy = vehicule.centreY;
  const rot = vehicule.rotation ?? 0;
  
  const baseColor = STATUTS_VEHICULE_COLORS[vehicule.statut] 
    ? `var(--color-${vehicule.statut.toLowerCase().replace(/_/g, '-')}-500)` 
    : "var(--color-neutral-500)";
  
  // Couleur hex pour le canvas fallback (on utilise les variables CSS via style)
  const STATUT_FILL_HEX: Record<string, string> = {
    EN_PARKING: "#3b82f6",
    EN_ATTENTE_DEVIS: "#f59e0b",
    EN_ATTENTE_DIAGNOSTIC: "#8b5cf6",
    EN_ATTENTE_PIECE: "#f97316",
    EN_TRAVAUX: "#6366f1",
    TERMINE_A_RECUPERER: "#10b981",
    EN_VENTE: "#14b8a6",
    ACCIDENTE: "#ef4444",
    A_TRANSFERER: "#eab308",
    SORTI: "#9ca3af",
    DONNEES_INCOMPLETES: "#9ca3af",
  };
  
  const baseHex = STATUT_FILL_HEX[vehicule.statut] ?? "#64748b";
  const fillColor = isSelected ? `${baseHex}99` : `${baseHex}44`;
  const strokeColor = isCollided 
    ? "#ef4444" 
    : isSelected || isAction 
      ? "#06b6d4" 
      : `${baseHex}cc`;

  const [showPhotos, setShowPhotos] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);

  // Calculer les 4 coins pour le polygone
  const getCorners = () => {
    const a = (rot * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const hw = w / 2;
    const hh = h / 2;
    const corners: [number, number][] = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ];
    return corners.map(([dx, dy]) => [
      cx + dx * cos - dy * sin,
      cy + dx * sin + dy * cos,
    ]).map(([x, y]) => `${x},${y}`).join(" ");
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(vehicule);
  };

  const handleDragStart = (e: React.MouseEvent, vehicule: any) => {
    e.stopPropagation();
    // L'event natif drag ne fonctionne pas bien avec SVG, on utilise notre propre système
    // via onMouseDown dans le parent
    // Le véhicule est passé en second argument par le parent
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu(prev => !prev);
  };

  return (
    <g 
      className={`vehicule ${vehicule.id}`}
      transform={`translate(${cx},${cy}) rotate(${rot})`}
      onClick={handleClick}
      onMouseDown={(e: React.MouseEvent<SVGSVGElement>) => onDragStart(e, vehicule)}
      onContextMenu={handleContextMenu}
      style={{ cursor: "grab", touchAction: "none" }}
      data-vehicule-id={vehicule.id}
    >
      {/* Aire de collision (marge) - visible seulement en mode action ou sélectionné */}
      {(isSelected || isAction) && (
        <rect
          x={-w / 2 - 0.3}
          y={-h / 2 - 0.3}
          width={w + 0.6}
          height={h + 0.6}
          fill="var(--color-primary-500/06)"
          stroke="var(--color-primary-500/30)"
          strokeWidth="0.1"
          strokeDasharray="2,2"
          rx={0.2}
        />
      )}

      {/* Corps du véhicule */}
      <polygon
        points={getCorners()}
        fill={`var(--statut-${vehicule.statut.toLowerCase().replace(/_/g, '-')}-fill, ${fillColor})`}
        stroke={strokeColor}
        strokeWidth={isCollided ? 0.3 : isSelected || isAction ? 0.28 : 0.12}
        style={{
          filter: "drop-shadow(0 0 2px var(--color-black/15))",
          transition: "stroke-width 0.1s, stroke 0.1s",
        }}
      />
      
      {/* Poignée de rotation (visible au hover/sélection) */}
      {(isSelected || isHovered) && (
        <g transform={`translate(0,${-h / 2 - 1.2})`}>
          <circle 
            cx="0" 
            cy="0" 
            r="0.35" 
            fill="var(--color-primary-500)" 
            stroke="white" 
            strokeWidth="0.08"
            style={{ cursor: "grab", filter: "drop-shadow(0 1px 2px var(--color-black/30))" }}
          />
          <RotateCcw size={10} stroke="white" strokeWidth={1.5} />
          <title>Faire pivoter (Shift + molette ou clic droit)</title>
        </g>
      )}

      {/* Numéro de registre */}
      <text
        x={-w / 2 + 0.35}
        y={h / 2 - 0.35}
        fontSize="1.1"
        fontWeight={isSelected ? "700" : "500"}
        fill={isSelected || isAction ? "#0e7490" : "#334155"}
        fontFamily="var(--font-mono)"
        dominantBaseline="alphabetic"
      >
        #{vehicule.numRegistre}
      </text>

      {/* Marque/Modèle au survol/sélection */}
      {(isSelected || isHovered || isAction) && (
        <text
          x={-w / 2 + 0.35}
          y={-h / 2 + 1.15}
          fontSize="0.95"
          fontWeight="500"
          fill="#0f172a"
          fontFamily="var(--font-sans)"
          dominantBaseline="hanging"
        >
          {vehicule.marque ?? ""}{vehicule.modele ? " " + vehicule.modele : ""}
        </text>
      )}

      {/* Indicateur collision */}
      {vehicule.collided && (
        <circle
          cx={w / 2 - 0.5}
          cy={-h / 2 + 0.5}
          r="0.4"
          fill="#ef4444"
          stroke="white"
          strokeWidth="0.1"
        >
          <title>Collision détectée</title>
        </circle>
      )}

      {/* Indicateur dimensions estimées */}
      {vehicule.dimensionsEstimees && (
        <text
          x={w / 2 - 0.3}
          y={-h / 2 + 0.3}
          fontSize="0.5"
          fill="var(--color-amber-500)"
          fontWeight="bold"
          textAnchor="end"
          dominantBaseline="alphabetic"
        >
          ~
        </text>
      )}

      {/* Menu contextuel */}
      {showContextMenu && (
        <foreignObject x={-w/2} y={-h/2-3} width={120} height={100}>
          <div className="context-menu" style={{
            position: 'absolute',
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-modal)',
            padding: '4px',
            zIndex: 100,
            minWidth: '140px',
          }}>
            <button className="context-menu-item" onClick={() => { setShowPhotos(true); setShowContextMenu(false); }}>
              <Image size={14} className="mr-2" /> Voir photos
            </button>
            <button className="context-menu-item" onClick={() => { /* TODO: déplacer */ setShowContextMenu(false); }}>
              <MapPin size={14} className="mr-2" /> Déplacer
            </button>
            <button className="context-menu-item text-destructive" onClick={() => { /* TODO: sortir */ setShowContextMenu(false); }}>
              Sortir du parking
            </button>
          </div>
        </foreignObject>
      )}
    </g>
  );
});

interface CoucheVehiculesProps {
  vehicules: Array<any>;
  transform: { k: number; x: number; y: number };
  selectedVehicleId: number | null;
  hoveredVehicleId: number | null;
  actionMode: { vehicleId: number; isMove: boolean } | null;
  collidedIds: Set<number>;
  onVehicleClick: (vehicule: any) => void;
  onVehicleDragStart: (e: React.MouseEvent, vehicule: any) => void;
}

export const CoucheVehicules = memo(function CoucheVehicules({ 
  vehicules, 
  transform, 
  selectedVehicleId, 
  hoveredVehicleId, 
  actionMode, 
  collidedIds,
  onVehicleClick,
  onVehicleDragStart,
}: CoucheVehiculesProps) {
  if (!vehicules.length) return null;

  const positionedVehicules = vehicules.filter(v => v.centreX != null && v.centreY != null);

  return (
    <g className="couche-vehicules">
      {positionedVehicules.map((v: any) => (
        <VehiculeSvg
          key={v.id}
          vehicule={v}
          isSelected={selectedVehicleId === v.id}
          isHovered={hoveredVehicleId === v.id}
          isAction={actionMode?.vehicleId === v.id}
          isCollided={collidedIds.has(v.id)}
          transform={{ k: 1, x: 0, y: 0 }} // Transform géré par le parent <g>
          onClick={onVehicleClick}
          onDragStart={(e) => onVehicleDragStart(e, v)}
        />
      ))}
    </g>
  );
});