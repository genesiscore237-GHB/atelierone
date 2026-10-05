import { describe, it, expect } from "vitest";
import {
  cornersOf,
  satIntersects,
  rectsOverlap,
  rectWithinZone,
  vehicleFootprint,
  vehicleInZone,
  computeZoneOccupation,
  collisionsDansZone,
  tryPlace,
  findNearestFreeSpot,
  DEFAULT_VEHICULE,
  type RectGeom,
  type ZoneSpatial,
  type SpotSpatial,
  type VehicleFootprintInput,
} from "./parking-spatial";

const zoneRect: RectGeom = { type: "rectangle", x: 0, y: 0, w: 10, h: 10 };

function makeZone(overrides: Partial<ZoneSpatial> = {}): ZoneSpatial {
  return {
    id: 1,
    geometrie: zoneRect,
    capaciteTheorique: 4,
    surfaceStationnable: 100,
    orientationAutorisee: 0,
    margeSecurite: 0.3,
    stationnable: true,
    placeParking: true,
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<VehicleFootprintInput> = {}): VehicleFootprintInput {
  return { id: 1, longueur: 4.5, largeur: 1.8, ...overrides };
}

describe("OBB / SAT", () => {
  it("cornersOf produit 4 coins pour un rect top-left", () => {
    const c = cornersOf({ x: 0, y: 0, w: 2, h: 4 }, 0);
    expect(c).toHaveLength(4);
    expect(c.map(([x]) => x).sort((a, b) => a - b)).toEqual([0, 0, 2, 2]);
    expect(c.map(([, y]) => y).sort((a, b) => a - b)).toEqual([0, 0, 4, 4]);
    // rotation 90° = échange largeur/hauteur autour du centre (1,2)
    const c90 = cornersOf({ x: 0, y: 0, w: 2, h: 4 }, 90);
    const xs = c90.map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 6);
    const ys = c90.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 6);
  });

  it("satIntersects détecte le chevauchement et la séparation", () => {
    const a = cornersOf({ x: 0, y: 0, w: 2, h: 2 }, 0);
    const bO = cornersOf({ x: 1, y: 1, w: 2, h: 2 }, 0);
    const bF = cornersOf({ x: 10, y: 10, w: 2, h: 2 }, 0);
    expect(satIntersects(a, bO)).toBe(true);
    expect(satIntersects(a, bF)).toBe(false);
  });

  it("rectsOverlap: pas de collision quand bord à bord", () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, 0, { x: 2, y: 0, w: 2, h: 2 }, 0, 0)).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, 0, { x: 2, y: 0, w: 2, h: 2 }, 0, 0.3)).toBe(true);
  });

  it("rectsOverlap avec rotation détecte la collision en croix", () => {
    // parenthèse: un véhicule vertical croisant un horizontal au centre
    expect(rectsOverlap({ x: 3, y: 0, w: 1, h: 8 }, 0, { x: 0, y: 3, w: 8, h: 1 }, 90, 0)).toBe(true);
  });
});

describe("empreinte véhicule", () => {
  it("utilise les dimensions réelles", () => {
    const fp = vehicleFootprint(makeVehicle());
    expect(fp.w).toBe(1.8);
    expect(fp.h).toBe(4.5);
    expect(fp.source).toBe("REEL");
    expect(fp.isEstimate).toBe(false);
  });

  it("retombe sur l'empreinte par défaut si dimensions inconnues", () => {
    const fp = vehicleFootprint(makeVehicle({ longueur: null, largeur: null, dimensionsEstimees: true }));
    expect(fp.w).toBe(DEFAULT_VEHICULE.largeur);
    expect(fp.h).toBe(DEFAULT_VEHICULE.longueur);
    expect(fp.source).toBe("DEFAUT");
    expect(fp.isEstimate).toBe(true);
  });
});

describe("zone & occupation", () => {
  it("vehicleInZone: dedans / dehors", () => {
    const vIn = makeVehicle({ positionX: 0.5, positionY: 0.5 });
    const vOut = makeVehicle({ positionX: 50, positionY: 50 });
    expect(vehicleInZone(vIn, makeZone())).toBe(true);
    expect(vehicleInZone(vOut, makeZone())).toBe(false);
  });

  it("computeZoneOccupation: compte, surface et place libre", () => {
    const zone = makeZone({ capaciteTheorique: 4, surfaceStationnable: 100 });
    const occ = computeZoneOccupation(zone, [
      makeVehicle({ id: 1, positionX: 0, positionY: 0 }),
      makeVehicle({ id: 2, positionX: 0, positionY: 5 }),
      makeVehicle({ id: 3, longueur: null, largeur: null, positionX: 3, positionY: 0 }),
      makeVehicle({ id: 4, positionX: null, positionY: null }), // non positionné
    ]);
    expect(occ.nombre).toBe(3);
    expect(occ.placeLibreNombre).toBe(1);
    expect(occ.nbrSurface).toBeCloseTo(1.8 * 4.5 * 2 + DEFAULT_VEHICULE.longueur * DEFAULT_VEHICULE.largeur, 6);
    expect(occ.ratioNombre).toBeCloseTo(0.75, 6);
    expect(occ.ratioSurface).toBeLessThan(1);
    expect(occ.surfaceLibre).toBeCloseTo(100 - occ.nbrSurface, 6);
  });

  it("collisionsDansZone: repère les paires en collision", () => {
    const zone = makeZone();
    const collisions = collisionsDansZone(zone, [
      makeVehicle({ id: 1, positionX: 0, positionY: 0 }),
      makeVehicle({ id: 2, positionX: 0.5, positionY: 0.5 }),
      makeVehicle({ id: 3, positionX: 20, positionY: 20 }),
    ]);
    expect(collisions).toEqual([{ a: 1, b: 2 }]);
  });
});

describe("tryPlace", () => {
  it("placement valide dans une zone stationnable", () => {
    const r = tryPlace({ vehicle: makeVehicle(), x: 0.5, y: 0.5, zone: makeZone(), autresVehicules: [] });
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.collisions).toEqual([]);
  });

  it("refuse une zone non stationnable", () => {
    const r = tryPlace({ vehicle: makeVehicle(), x: 0, y: 0, zone: makeZone({ stationnable: false }) });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("ZONE_NON_STATIONNABLE");
  });

  it("refuse une orientation non autorisée", () => {
    const r = tryPlace({ vehicle: makeVehicle(), x: 0, y: 0, rotation: 90, zone: makeZone({ orientationAutorisee: 0 }) });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("ORIENTATION_NON_AUTORISEE");
  });

  it("refuse hors zone", () => {
    const r = tryPlace({ vehicle: makeVehicle(), x: 100, y: 100, zone: makeZone() });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("HORS_ZONE");
  });

  it("détecte la collision avec marge de sécurité", () => {
    const r = tryPlace({
      vehicle: makeVehicle({ id: 99 }),
      x: 0.5,
      y: 0.5,
      zone: makeZone(),
      autresVehicules: [makeVehicle({ id: 1, positionX: 0, positionY: 0 })],
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toBe("COLLISION");
      expect(r.details?.collisions).toEqual([1]);
    }
  });

  it("avertit « espace libre non exploitable » quand la place restante est infime", () => {
    const zone = makeZone({ surfaceStationnable: 8.1, capaciteTheorique: 1 }); // ~1 place seulement
    const r = tryPlace({ vehicle: makeVehicle(), x: 0.5, y: 0.5, zone, autresVehicules: [] });
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.warnings).toContainEqual({ code: "ESPACE_LIBRE_NON_EXPLOITABLE" });
  });

  it("pas d'avertissement quand la place restante suffit", () => {
    const r = tryPlace({ vehicle: makeVehicle(), x: 0.5, y: 0.5, zone: makeZone({ surfaceStationnable: 100 }), autresVehicules: [] });
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.warnings).toEqual([]);
  });
});

describe("findNearestFreeSpot", () => {
  const spots: SpotSpatial[] = [
    { id: 1, zoneId: 1, geometrie: { type: "rectangle", x: 0, y: 0, w: 2, h: 5 }, rotation: 0, statut: "LIBRE" },
    { id: 2, zoneId: 1, geometrie: { type: "rectangle", x: 3, y: 0, w: 2, h: 5 }, rotation: 0, statut: "LIBRE" },
    { id: 3, zoneId: 1, geometrie: { type: "rectangle", x: 6, y: 0, w: 2, h: 5 }, rotation: 0, statut: "BLOQUE" },
  ];

  it("propose le spot libre le plus proche, non bloqué", () => {
    const r = findNearestFreeSpot({ vehicle: makeVehicle({ id: 42 }), zone: makeZone(), spots, autresVehicules: [], fromX: 8, fromY: 2 });
    expect(r).not.toBeNull();
    expect(r!.spot.id).toBe(2);
  });

  it("retourne null si aucun spot exploitable", () => {
    const r = findNearestFreeSpot({
      vehicle: makeVehicle({ id: 42 }),
      zone: makeZone({ stationnable: false }),
      spots: [{ id: 9, zoneId: 1, geometrie: { type: "rectangle", x: 0, y: 0, w: 2, h: 5 }, rotation: 0, statut: "LIBRE" }],
      autresVehicules: [],
    });
    expect(r).toBeNull();
  });
});