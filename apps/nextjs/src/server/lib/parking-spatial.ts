// ─── Moteur spatial Parking & Véhicules Immobilisés (GPJ) ─────────────────────
// Géométrie en mètres, origine haut-gauche. OBB + SAT pour les collisions.
// Pur (aucune dépendance DB) → utilisable dans les routers tRPC et les tests vitest.

export interface RectGeom {
  type: "rectangle";
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Vec2 = [number, number];

export const DEFAULT_VEHICULE = { longueur: 4.5, largeur: 1.8 } as const;

/** Empreinte d'un véhicule : dimensions réelles si connues, sinon empreinte par défaut. */
export interface VehicleFootprintInput {
  id?: number;
  longueur: number | null;
  largeur: number | null;
  /**
   * Position du véhicule. Deux noms coexistent :
   * - `positionX`/`positionY` : libellé historique (libellés de vue, tests existants).
   * - `centreX`/`centreY` : colonnes réelles de `parking_vehicles` depuis la refonte
   *   centre-géométrique. Ce sont celles-ci qui doivent être renseignées par l'appelant.
   */
  positionX?: number | null;
  positionY?: number | null;
  centreX?: number | null;
  centreY?: number | null;
  rotation?: number | null;
  dimensionsEstimees?: boolean;
}

export interface FootprintRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  isEstimate: boolean;
  source: "REEL" | "DEFAUT";
}

export interface ZoneSpatial {
  id: number;
  geometrie: RectGeom;
  capaciteTheorique: number;
  surfaceStationnable: number;
  orientationAutorisee: number | null;
  margeSecurite?: number;
  stationnable: boolean;
  placeParking?: boolean;
}

export interface SpotSpatial {
  id: number;
  zoneId: number;
  geometrie: RectGeom;
  statut?: string;
  rotation?: number;
}

// ─── OBB / SAT ────────────────────────────────────────────────────────────────

export function cornersOf(rect: { x: number; y: number; w: number; h: number }, rotationDeg = 0): Vec2[] {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const a = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const half: Array<[number, number]> = [
    [-rect.w / 2, -rect.h / 2],
    [rect.w / 2, -rect.h / 2],
    [rect.w / 2, rect.h / 2],
    [-rect.w / 2, rect.h / 2],
  ];
  return half.map(([dx, dy]) => [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]);
}

function projectOnAxis(axis: Vec2, corners: Vec2[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of corners) {
    const p = x * axis[0] + y * axis[1];
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return { min, max };
}

/** SAT : true si les deux OBB se chevauchent (sans compter la marge). */
export function satIntersects(cornersA: Vec2[], cornersB: Vec2[]): boolean {
  const axes: Vec2[] = [];
  for (const corners of [cornersA, cornersB]) {
    for (let i = 0; i < corners.length; i++) {
      const c1 = corners[i];
      const c2 = corners[(i + 1) % corners.length];
      if (!c1 || !c2) continue;
      const [x1, y1] = c1;
      const [x2, y2] = c2;
      const [dx, dy] = [x2 - x1, y2 - y1];
      axes.push([-dy, dx]);
    }
  }
  for (const axis of axes) {
    const a = projectOnAxis(axis, cornersA);
    const b = projectOnAxis(axis, cornersB);
    if (a.max <= b.min || b.max <= a.min) return false;
  }
  return true;
}

/** True si les deux empreintes (avec rotations) se chevauchent en tenant compte de la marge `margin` (appliquée à A). */
export function rectsOverlap(
  rectA: { x: number; y: number; w: number; h: number },
  rotA: number,
  rectB: { x: number; y: number; w: number; h: number },
  rotB: number,
  margin = 0,
): boolean {
  const inflatedA = margin > 0 ? { x: rectA.x - margin, y: rectA.y - margin, w: rectA.w + margin * 2, h: rectA.h + margin * 2 } : rectA;
  return satIntersects(cornersOf(inflatedA, rotA), cornersOf(rectB, rotB));
}

// ─── Empreinte véhicule ───────────────────────────────────────────────────────

/** true si le véhicule porte une position exploitable (centre prioritaire, repli position*). */
export function estPositionne(v: VehicleFootprintInput): boolean {
  return (v.centreX ?? v.positionX) != null && (v.centreY ?? v.positionY) != null;
}

export function vehicleFootprint(v: VehicleFootprintInput): FootprintRect {
  // centreX/centreY (colonnes réelles) prioritaires, positionX/positionY en repli.
  const x = v.centreX ?? v.positionX ?? 0;
  const y = v.centreY ?? v.positionY ?? 0;
  const rotation = v.rotation ?? 0;
  const hasDims = v.longueur != null && v.largeur != null;
  const w = hasDims ? v.largeur! : DEFAULT_VEHICULE.largeur;
  const h = hasDims ? v.longueur! : DEFAULT_VEHICULE.longueur;
  return {
    x,
    y,
    w,
    h,
    rotation,
    isEstimate: !hasDims || !!v.dimensionsEstimees,
    source: hasDims ? "REEL" : "DEFAUT",
  };
}

// ─── Zone ─────────────────────────────────────────────────────────────────────

export const EPS = 1e-9;

/** Tous les coins de l'empreinte dans la zone (marge déduite) ? */
export function rectWithinZone(
  rect: { x: number; y: number; w: number; h: number },
  rotationDeg: number,
  zoneRect: RectGeom,
  margin = 0,
): boolean {
  const x0 = zoneRect.x + margin;
  const y0 = zoneRect.y + margin;
  const x1 = zoneRect.x + zoneRect.w - margin;
  const y1 = zoneRect.y + zoneRect.h - margin;
  if (x0 >= x1 - EPS || y0 >= y1 - EPS) return false;
  return cornersOf(rect, rotationDeg).every(([x, y]) => x >= x0 - EPS && x <= x1 + EPS && y >= y0 - EPS && y <= y1 + EPS);
}

export function vehicleInZone(v: VehicleFootprintInput, zone: ZoneSpatial, margin = zone.margeSecurite ?? 0): boolean {
  const fp = vehicleFootprint(v);
  return rectWithinZone({ x: fp.x, y: fp.y, w: fp.w, h: fp.h }, fp.rotation, zone.geometrie, margin);
}

function aabbOverlapArea(a: RectGeom, b: { x: number; y: number; w: number; h: number }): number {
  const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ox * oy;
}

/** Surface revendiquée par un véhicule dans une zone (borne AABB), plafonnée à la surface de la zone. */
export function footprintAreaInZone(v: VehicleFootprintInput, zone: ZoneSpatial): number {
  const fp = vehicleFootprint(v);
  if (fp.rotation === 0) {
    return Math.min(aabbOverlapArea(zone.geometrie, { x: fp.x, y: fp.y, w: fp.w, h: fp.h }), zone.surfaceStationnable);
  }
  const box = cornersOf({ x: fp.x, y: fp.y, w: fp.w, h: fp.h }, fp.rotation);
  const xs = box.map(([x]) => x);
  const ys = box.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return Math.min(aabbOverlapArea(zone.geometrie, { x: minX, y: minY, w: maxX - minX, h: maxY - minY }), zone.surfaceStationnable);
}

export interface ZoneOccupation {
  zoneId: number;
  nombre: number;
  nbrSurface: number;
  capaciteTheorique: number;
  surfaceStationnable: number;
  ratioNombre: number;
  ratioSurface: number;
  placeLibreNombre: number;
  surfaceLibre: number;
}

export function computeZoneOccupation(zone: ZoneSpatial, vehicles: VehicleFootprintInput[]): ZoneOccupation {
  const places = vehicles.filter(estPositionne);
  let nbrSurface = 0;
  let nombre = 0;
  for (const v of places) {
    const fp = vehicleFootprint(v);
    if (rectWithinZone({ x: fp.x, y: fp.y, w: fp.w, h: fp.h }, fp.rotation, zone.geometrie, 0)) nombre++;
    nbrSurface += footprintAreaInZone(v, zone);
  }
  const surface = zone.surfaceStationnable || 1;
  return {
    zoneId: zone.id,
    nombre,
    nbrSurface: Math.min(nbrSurface, zone.surfaceStationnable),
    capaciteTheorique: zone.capaciteTheorique,
    surfaceStationnable: zone.surfaceStationnable,
    ratioNombre: zone.capaciteTheorique > 0 ? nombre / zone.capaciteTheorique : 0,
    ratioSurface: Math.min(nbrSurface / surface, 1),
    placeLibreNombre: Math.max(0, zone.capaciteTheorique - nombre),
    surfaceLibre: Math.max(0, zone.surfaceStationnable - nbrSurface),
  };
}

/** Liste des véhicules en collision mutuelle dans une zone (pour surlignage carte). */
export function collisionsDansZone(zone: ZoneSpatial, vehicles: VehicleFootprintInput[], margin = zone.margeSecurite ?? 0): { a: number; b: number }[] {
  const places = vehicles.filter((v) => estPositionne(v) && v.id != null);
  const found: { a: number; b: number }[] = [];
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const va = places[i];
      const vb = places[j];
      if (!va || !vb) continue;
      const fa = vehicleFootprint(va);
      const fb = vehicleFootprint(vb);
      if (rectsOverlap({ x: fa.x, y: fa.y, w: fa.w, h: fa.h }, fa.rotation, { x: fb.x, y: fb.y, w: fb.w, h: fb.h }, fb.rotation, margin)) {
        found.push({ a: va.id!, b: vb.id! });
      }
    }
  }
  return found;
}

// ─── Placement / tryPlace ─────────────────────────────────────────────────────

export type TryPlaceResult =
  | {
      ok: true;
      inside: true;
      warnings: { code: "ESPACE_LIBRE_NON_EXPLOITABLE" }[];
      collisions: [];
      surfaceRestante: number;
    }
  | { ok: false; reason: "ZONE_NON_STATIONNABLE" | "ORIENTATION_NON_AUTORISEE" | "HORS_ZONE" | "COLLISION"; details?: { collisions?: number[] } };

export interface TryPlaceParams {
  vehicle: VehicleFootprintInput;
  x: number;
  y: number;
  rotation?: number;
  zone: ZoneSpatial;
  autresVehicules?: VehicleFootprintInput[];
  margin?: number;
}

/** Tente un placement. Détecte aussi « espace libre mais non exploitable » (place possible mais plus de place exploitable à côté). */
export function tryPlace(p: TryPlaceParams): TryPlaceResult {
  const margin = p.margin ?? p.zone.margeSecurite ?? 0;
  if (!p.zone.stationnable) return { ok: false, reason: "ZONE_NON_STATIONNABLE" };

  const rotation = (p.rotation ?? 0) % 180;
  const allowed = p.zone.orientationAutorisee != null ? ((p.zone.orientationAutorisee % 180) + 180) % 180 : null;
  if (allowed != null && Math.abs(allowed - rotation) % 180 > 1e-6) {
    return { ok: false, reason: "ORIENTATION_NON_AUTORISEE" };
  }

  const fp = vehicleFootprint({ ...p.vehicle, centreX: p.x, centreY: p.y, rotation });
  const rect = { x: fp.x, y: fp.y, w: fp.w, h: fp.h };
  if (!rectWithinZone(rect, rotation, p.zone.geometrie, margin)) return { ok: false, reason: "HORS_ZONE" };

  const autres = (p.autresVehicules ?? []).filter((v) => v.id !== p.vehicle.id && estPositionne(v));
  const collisions: number[] = [];
  for (const o of autres) {
    const fo = vehicleFootprint(o);
    if (rectsOverlap(rect, rotation, { x: fo.x, y: fo.y, w: fo.w, h: fo.h }, fo.rotation, margin)) {
      if (o.id != null) collisions.push(o.id);
    }
  }
  if (collisions.length > 0) return { ok: false, reason: "COLLISION", details: { collisions } };

  // Espace libre restant : si trop petit pour accueillir encore un véhicule minimal, avertissement.
  const surfaceUtilisee = (p.autresVehicules ?? [])
    .filter((v) => v.id !== p.vehicle.id)
    .reduce((acc, v) => acc + footprintAreaInZone(v, p.zone), 0);
  const surfaceRestante = Math.max(0, p.zone.surfaceStationnable - surfaceUtilisee - fp.w * fp.h);
  const warnings = surfaceRestante < DEFAULT_VEHICULE.longueur * DEFAULT_VEHICULE.largeur ? [{ code: "ESPACE_LIBRE_NON_EXPLOITABLE" as const }] : [];

  return { ok: true, inside: true, warnings, collisions: [], surfaceRestante };
}

// ─── Suggestion de spot le plus proche ────────────────────────────────────────

export interface NearestSpotResult {
  spot: SpotSpatial;
  distance: number;
  result: TryPlaceResult;
}

/** Spot libre le plus proche de (fromX, fromY) dans une zone, où le véhicule passe réellement. */
export function findNearestFreeSpot(args: {
  vehicle: VehicleFootprintInput;
  zone: ZoneSpatial;
  spots: SpotSpatial[];
  autresVehicules?: VehicleFootprintInput[];
  fromX?: number;
  fromY?: number;
  margin?: number;
}): NearestSpotResult | null {
  const { vehicle, zone, spots, autresVehicules = [], margin } = args;
  const usedMargin = margin ?? zone.margeSecurite ?? 0;
  const fromX = args.fromX ?? vehicle.centreX ?? vehicle.positionX ?? 0;
  const fromY = args.fromY ?? vehicle.centreY ?? vehicle.positionY ?? 0;
  const candidates = spots
    .filter((s) => !s.statut || s.statut === "LIBRE")
    .map((s) => {
      const centerX = s.geometrie.x + s.geometrie.w / 2;
      const centerY = s.geometrie.y + s.geometrie.h / 2;
      return { spot: s, distance: Math.hypot(centerX - fromX, centerY - fromY) };
    })
    .sort((a, b) => a.distance - b.distance);

  for (const { spot, distance } of candidates) {
    const result = tryPlace({
      vehicle,
      x: spot.geometrie.x + usedMargin,
      y: spot.geometrie.y + usedMargin,
      rotation: spot.rotation ?? 0,
      zone,
      autresVehicules,
      margin: usedMargin,
    });
    if (result.ok) return { spot, distance, result };
  }
  return null;
}