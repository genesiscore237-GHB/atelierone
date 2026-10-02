"use client";

import { memo, useRef, useEffect, useState, useCallback } from "react";
import { CoucheZones } from "./CoucheZones";
import { CoucheEmplacements } from "./CoucheEmplacements";
import { CoucheVehicules } from "./CoucheVehicules";
import { FantomePlacement } from "./FantomePlacement";
import { useViewTransform } from "./useViewTransform";
import { normaliserAngle, GABARIT_DEFAUT } from "@atelierone/geo";
import { Button } from "~/components/ui/button";
import { MapPin, RotateCcw, Undo2, Maximize, Minimize, Target } from "lucide-react";
import { toast } from "sonner";

interface PlanSvgProps {
  plan: any;
  vehicules: any[];
  zones: any[];
  spots: any[];
  vehiculesNonPositionnes: any[];
  selectedVehicleId: number | null;
  setSelectedVehicleId: (id: number | null) => void;
  hoveredVehicleId: number | null;
  setHoveredVehicleId: (id: number | null) => void;
  actionMode: { vehicleId: number; isMove: boolean } | null;
  setActionMode: (mode: { vehicleId: number; isMove: boolean } | null) => void;
  rotationInput: string;
  setRotationInput: (val: string) => void;
  canModifier: boolean;
  onPlace: (vehicleId: number, cx: number, cy: number, rotation: number, zoneId: number, spotId: number | null) => Promise<void>;
  onDetacher: (vehicleId: number) => Promise<void>;
  onSortie: (vehicleId: number) => Promise<void>;
}

export const PlanSvg = memo(function PlanSvg({
  plan,
  vehicules,
  vehiculesNonPositionnes,
  zones,
  spots,
  selectedVehicleId,
  setSelectedVehicleId,
  hoveredVehicleId,
  setHoveredVehicleId,
  actionMode,
  setActionMode,
  rotationInput,
  canModifier,
  onPlace,
  onDetacher,
  onSortie,
}: PlanSvgProps) {
  const { svgRef, gRef, transform, fitToView, reset, setTransform } = useViewTransform({
    minZoom: 0.3,
    maxZoom: 8,
    onTransformChange: (t) => setTransform(t),
  });

  const [fantomeVisible, setFantomeVisible] = useState(false);
  const [fantomePos, setFantomePos] = useState({ cx: 0, cy: 0 });
  const [fantomeRotation, setFantomeRotation] = useState(0);
  const [fantomeVehicle, setFantomeVehicle] = useState<any>(null);
  const [isPanning, setIsPanning] = useState(false);

  // Gestionnaires souris
  const handleVehicleMouseDown = useCallback((e: React.MouseEvent, vehicule: any) => {
    if (!canModifier) return;
    e.stopPropagation();
    e.preventDefault();
    
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const cx = (e.clientX - rect.left - transform.x) / transform.k;
    const cy = (e.clientY - rect.top - transform.y) / transform.k;
    
    // Hit-test simple : vérifier si le clic est sur ce véhicule
    // (hit-test précis fait dans le parent via hitTestVehicle)
    setFantomeVehicle(vehicule);
    setFantomePos({ cx, cy });
    setFantomeRotation(vehicule.rotation ?? 0);
    setFantomeVisible(true);
  }, [canModifier, transform]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!fantomeVisible || !fantomeVehicle) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const cx = (e.clientX - rect.left - transform.x) / transform.k;
    const cy = (e.clientY - rect.top - transform.y) / transform.k;

    setFantomePos({ cx, cy });
  };

  // Zone stationnable (rectangle) contenant un point du plan
  const zoneSousLePoint = (cx: number, cy: number): any => {
    for (const z of zones) {
      const g = z?.geometrie;
      if (!g || g.type !== "rectangle") continue;
      if (z.stationnable === false) continue;
      if (cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h) return z;
    }
    return null;
  };

  const handleMouseUp = async () => {
    if (!fantomeVisible || !fantomeVehicle) return;

    // La validation finale (zone, collision, orientation…) est assurée côté
    // serveur par la mutation `place` ; on tente le placement et on laisse le
    // toast d'erreur de la mutation parler en cas de refus.
    const zone = zoneSousLePoint(fantomePos.cx, fantomePos.cy);
    if (!zone) {
      toast.error("Aucune zone stationnable à cet endroit.");
      setFantomeVisible(false);
      setFantomeVehicle(null);
      return;
    }

    try {
      await onPlace(fantomeVehicle.id, fantomePos.cx, fantomePos.cy, fantomeRotation, zone.id, null);
    } finally {
      setFantomeVisible(false);
      setFantomeVehicle(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!fantomeVisible || !fantomeVehicle) return;
    
    if (e.key === "Escape") {
      setFantomeVisible(false);
      setFantomeVehicle(null);
      return;
    }
    
    if (e.key === "r" || e.key === "R") {
      if (e.shiftKey) {
        setFantomeRotation(prev => normaliserAngle(prev - 15));
      } else {
        setFantomeRotation(prev => normaliserAngle(prev + 15));
      }
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fantomeVisible]);

  // Fit to view au chargement
  useEffect(() => {
    if (plan?.site && svgRef.current) {
      fitToView({
        x: 0,
        y: 0,
        w: plan.site.planLargeur,
        h: plan.site.planHauteur,
      }, 30);
    }
  }, [plan?.site]);

  if (!plan) return null;

  return (
    <div className="relative w-full h-[calc(100vh-200px)] min-h-[400px]">
      {/* Toolbar */}
      <div className="absolute top-2 left-2 right-2 z-10 flex flex-wrap items-center justify-between gap-2 p-2 bg-background/90 backdrop-blur-sm rounded-xl border border-border shadow-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {plan.site?.nom} · {plan.site?.planLargeur}m × {plan.site?.planHauteur}m
          </span>
          {actionMode && (
            <span className="flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-3 py-1 text-sm font-medium text-cyan-600 dark:text-cyan-400">
              <Target size={14} />
              {actionMode.isMove ? "Déplacer" : "Placer"} #{fantomeVehicle?.numRegistre ?? actionMode.vehicleId}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            title="Ajuster à la vue (F)"
            disabled={!plan?.site}
          >
            <Maximize size={14} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTransform({ k: 1, x: 0, y: 0 })}
            title="Zoom 100%"
          >
            <Minimize size={14} />
          </Button>
          <span className="px-2 text-xs text-muted-foreground font-mono">
            {Math.round(transform.k * 100)}%
          </span>
        </div>
      </div>

      {/* SVG Principal */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ touchAction: "none" }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setIsPanning(true);
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (fantomeVisible) {
            setFantomeVisible(false);
            setFantomeVehicle(null);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          // Le zoom est géré par d3-zoom
        }}
      >
        <defs>
          <linearGradient id="fantome-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-emerald-500/25)" stopOpacity={0.9} />
            <stop offset="100%" stopColor="var(--color-emerald-500/25)" stopOpacity={0.3} />
          </linearGradient>
        </defs>

        <g ref={gRef} transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Grille 2m */}
          <g className="grille" opacity={transform.k > 2 ? 1 : 0.5}>
            {[...Array(Math.ceil((plan.site?.planLargeur ?? 100) / 2) + 1)].map((_, i) => (
              <line key={`v${i}`} x1={i * 2} y1={0} x2={i * 2} y2={plan.site?.planHauteur ?? 75} stroke="rgba(120,120,120,0.12)" strokeWidth="0.05" />
            ))}
            {[...Array(Math.ceil((plan.site?.planHauteur ?? 75) / 2) + 1)].map((_, i) => (
              <line key={`h${i}`} x1={0} y1={i * 2} x2={plan.site?.planLargeur ?? 100} y2={i * 2} stroke="rgba(120,120,120,0.12)" strokeWidth="0.05" />
            ))}
          </g>

          {/* Zones */}
          <CoucheZones zones={zones} transform={{ k: 1, x: 0, y: 0 }} />

          {/* Emplacements */}
          <CoucheEmplacements spots={spots} transform={{ k: 1, x: 0, y: 0 }} />

          {/* Véhicules */}
          <CoucheVehicules
            vehicules={vehicules}
            transform={{ k: 1, x: 0, y: 0 }}
            selectedVehicleId={selectedVehicleId}
            hoveredVehicleId={hoveredVehicleId}
            actionMode={actionMode}
            collidedIds={new Set()}
            onVehicleClick={(v) => setSelectedVehicleId(v.id)}
            onVehicleDragStart={handleVehicleMouseDown}
          />

          {/* Fantôme de placement */}
          {fantomeVisible && fantomeVehicle && (
            <FantomePlacement
              isVisible={true}
              cx={fantomePos.cx}
              cy={fantomePos.cy}
              rotation={fantomeRotation}
              longueur={fantomeVehicle.longueur}
              largeur={fantomeVehicle.largeur}
              validation={{ ok: true, echecs: [], avertissements: [] }}
              zoneMarge={0.3}
            />
          )}

          {/* Zone de drop pour placement depuis le panneau */}
          {actionMode && !fantomeVisible && (
            <rect
              x={0}
              y={0}
              width={plan.site?.planLargeur ?? 100}
              height={plan.site?.planHauteur ?? 75}
              fill="var(--color-cyan-500/03)"
              stroke="var(--color-cyan-500/30)"
              strokeWidth={0.2}
              strokeDasharray="8,4"
              style={{ cursor: "crosshair" }}
              onMouseDown={(e) => {
                if (!actionMode) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const cx = (e.clientX - rect.left - transform.x) / transform.k;
                const cy = (e.clientY - rect.top - transform.y) / transform.k;
                const vehicle = vehicules.find((vv) => vv.id === actionMode.vehicleId)
                  ?? vehiculesNonPositionnes.find((vv) => vv.id === actionMode.vehicleId);
                if (!vehicle) {
                  toast.error("Véhicule introuvable.");
                  return;
                }
                setFantomeVehicle({
                  ...vehicle,
                  largeur: vehicle.largeur ?? GABARIT_DEFAUT.largeur,
                  longueur: vehicle.longueur ?? GABARIT_DEFAUT.longueur,
                });
                setFantomePos({ cx, cy });
                setFantomeRotation(0);
                setFantomeVisible(true);
              }}
            />
          )}
        </g>
      </svg>

      {/* Légende */}
      <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap gap-3 justify-center p-2 bg-background/90 backdrop-blur-sm rounded-xl border border-border shadow-lg text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500/40" /> Emplacement libre</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500/40" /> Occupé</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/40" /> Bloqué / Réservé</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500/40" /> Collision</span>
      </div>
    </div>
  );
});