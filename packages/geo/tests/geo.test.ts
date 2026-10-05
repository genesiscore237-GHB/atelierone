import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  normaliserAngle,
  coins,
  dilater,
  seCroisent,
  distanceMin,
  aireIntersection,
  contenuDans,
  depassementHorsZone,
  empreinteVehicule,
  validerPlacement,
  GABARIT_DEFAUT,
  type Empreinte,
  type Polygone,
  type Vec2,
} from "../src";

const polygoneCarre: Polygone = { points: [[0, 0], [10, 0], [10, 10], [0, 10]] };
const polygoneRect: Polygone = { points: [[0, 0], [20, 0], [20, 10], [0, 10]] };

describe("normaliserAngle", () => {
  it("normalise dans [0, 360)", () => {
    expect(normaliserAngle(0)).toBe(0);
    expect(normaliserAngle(90)).toBe(90);
    expect(normaliserAngle(360)).toBe(0);
    expect(normaliserAngle(450)).toBe(90);
    expect(normaliserAngle(-90)).toBe(270);
    expect(normaliserAngle(-360)).toBe(0);
    expect(normaliserAngle(-450)).toBe(270);
  });
});

describe("coins", () => {
  it("véhicule 4.5x1.8 centré en (10,10) à 0° : coins attendus", () => {
    const e: Empreinte = { cx: 10, cy: 10, w: 1.8, h: 4.5, rotation: 0 };
    const c = coins(e);
    // HG, HD, BD, BG
    expect(c[0]).toEqual([9.1, 7.75]);
    expect(c[1]).toEqual([10.9, 7.75]);
    expect(c[2]).toEqual([10.9, 12.25]);
    expect(c[3]).toEqual([9.1, 12.25]);
  });

  it("à 90° : empreinte 4.5 sur X, 1.8 sur Y", () => {
    const e: Empreinte = { cx: 10, cy: 10, w: 1.8, h: 4.5, rotation: 90 };
    const c = coins(e);
    // Largeur sur X = 4.5, longueur sur Y = 1.8
    const xs = c.map(([x]) => x);
    const ys = c.map(([, y]) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4.5, 5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1.8, 5);
  });

  it("4 coins distincts", () => {
    const e: Empreinte = { cx: 5, cy: 5, w: 2, h: 3, rotation: 30 };
    const c = coins(e);
    expect(c.length).toBe(4);
    const uniques = new Set(c.map(([x, y]) => `${x},${y}`));
    expect(uniques.size).toBe(4);
  });
});

describe("dilater", () => {
  it("marge 0 = identité", () => {
    const e: Empreinte = { cx: 0, cy: 0, w: 2, h: 3, rotation: 0 };
    expect(dilater(e, 0)).toEqual(e);
  });
  it("marge positive augmente w et h de 2*m", () => {
    const e: Empreinte = { cx: 0, cy: 0, w: 2, h: 3, rotation: 0 };
    const d = dilater(e, 0.5);
    expect(d.w).toBe(3);
    expect(d.h).toBe(4);
    expect(d.cx).toBe(0);
    expect(d.cy).toBe(0);
  });
});

describe("seCroisent (SAT)", () => {
  it("identiques -> collision", () => {
    const e: Empreinte = { cx: 0, cy: 0, w: 2, h: 2, rotation: 0 };
    expect(seCroisent(e, e, 0)).toBe(true);
  });

  it("commutativité : seCroisent(a,b) === seCroisent(b,a)", () => {
    fc.assert(
      fc.property(fc.float({ min: -10, max: 10 }), fc.float({ min: -10, max: 10 }), fc.float({ min: 0.5, max: 5 }), fc.float({ min: 0.5, max: 5 }), fc.float({ min: 0, max: 360 }), fc.float({ min: -10, max: 10 }), fc.float({ min: -10, max: 10 }), fc.float({ min: 0.5, max: 5 }), fc.float({ min: 0.5, max: 5 }), fc.float({ min: 0, max: 360 }), (cx1, cy1, w1, h1, r1, cx2, cy2, w2, h2, r2) => {
        const a: Empreinte = { cx: cx1, cy: cy1, w: w1, h: h1, rotation: r1 };
        const b: Empreinte = { cx: cx2, cy: cy2, w: w2, h: h2, rotation: r2 };
        return seCroisent(a, b, 0) === seCroisent(b, a, 0);
      }),
      { numRuns: 200 },
    );
  });

  it("éloignés -> pas de collision", () => {
    const a: Empreinte = { cx: 0, cy: 0, w: 2, h: 2, rotation: 0 };
    const b: Empreinte = { cx: 10, cy: 10, w: 2, h: 2, rotation: 0 };
    expect(seCroisent(a, b, 0)).toBe(false);
  });

  it("marge crée collision là où il n'y en avait pas", () => {
    const a: Empreinte = { cx: 0, cy: 0, w: 2, h: 2, rotation: 0 };
    const b: Empreinte = { cx: 2.2, cy: 0, w: 2, h: 2, rotation: 0 };
    expect(seCroisent(a, b, 0)).toBe(false);
    expect(seCroisent(a, b, 0.2)).toBe(true); // marge 0.2 -> inflation 0.4 total, chevauche
  });

  it("rotation 45° : collision détectée correctement", () => {
    const a: Empreinte = { cx: 0, cy: 0, w: 2, h: 1, rotation: 0 };
    const b: Empreinte = { cx: 1, cy: 0.5, w: 2, h: 1, rotation: 45 };
    expect(seCroisent(a, b, 0)).toBe(true);
  });
});

describe("distanceMin", () => {
  it("collision -> distance 0", () => {
    const a: Empreinte = { cx: 0, cy: 0, w: 2, h: 2, rotation: 0 };
    const b: Empreinte = { cx: 1, cy: 0, w: 2, h: 2, rotation: 0 };
    expect(distanceMin(a, b)).toBe(0);
  });

  it("éloignés -> distance positive", () => {
    const a: Empreinte = { cx: 0, cy: 0, w: 2, h: 2, rotation: 0 };
    const b: Empreinte = { cx: 5, cy: 0, w: 2, h: 2, rotation: 0 };
    expect(distanceMin(a, b)).toBeGreaterThan(0);
  });
});

describe("aireIntersection", () => {
  it("identiques -> aire = w*h", () => {
    const e: Empreinte = { cx: 0, cy: 0, w: 2, h: 3, rotation: 0 };
    expect(aireIntersection(e, e)).toBeCloseTo(6, 5);
  });

  it("sans chevauchement -> 0", () => {
    const a: Empreinte = { cx: 0, cy: 0, w: 2, h: 2, rotation: 0 };
    const b: Empreinte = { cx: 5, cy: 5, w: 2, h: 2, rotation: 0 };
    expect(aireIntersection(a, b)).toBe(0);
  });

  it("à 45° entièrement dans zone -> aire = w*h", () => {
    const e: Empreinte = { cx: 5, cy: 5, w: 2, h: 1, rotation: 45 };
    const zone: Polygone = { points: [[0, 0], [10, 0], [10, 10], [0, 10]] };
    expect(contenuDans(e, zone, 0)).toBe(true);
    // L'intersection avec elle-même doit donner l'aire exacte
    expect(aireIntersection(e, e)).toBeCloseTo(2, 5); // 2*1 = 2
  });
});

describe("contenuDans", () => {
  it("emplacement centré dans zone carrée -> true", () => {
    const e: Empreinte = { cx: 5, cy: 5, w: 2, h: 2, rotation: 0 };
    expect(contenuDans(e, polygoneCarre, 0)).toBe(true);
  });

  it("trop près du bord avec marge -> false", () => {
    const e: Empreinte = { cx: 1, cy: 5, w: 2, h: 2, rotation: 0 };
    expect(contenuDans(e, polygoneCarre, 0)).toBe(true);
    expect(contenuDans(e, polygoneCarre, 0.5)).toBe(false); // marge 0.5 -> dépasse
  });

  it("rotation 45° entièrement dans zone -> true", () => {
    const e: Empreinte = { cx: 5, cy: 5, w: 2, h: 1, rotation: 45 };
    expect(contenuDans(e, polygoneCarre, 0)).toBe(true);
  });

  it("rotation 45° dépasse -> false", () => {
    const e: Empreinte = { cx: 9, cy: 5, w: 4, h: 1, rotation: 45 };
    expect(contenuDans(e, polygoneCarre, 0)).toBe(false);
  });
});

describe("depassementHorsZone", () => {
  it("entièrement dedans -> 0", () => {
    const e: Empreinte = { cx: 5, cy: 5, w: 2, h: 2, rotation: 0 };
    expect(depassementHorsZone(e, polygoneCarre, 0)).toBe(0);
  });

  it("dépasse d'un côté -> dépassement positif", () => {
    const e: Empreinte = { cx: 11, cy: 5, w: 2, h: 2, rotation: 0 }; // dépasse de 2m à droite (centre 11, demi-largeur 1, bord droit 12, zone à 10)
    expect(depassementHorsZone(e, polygoneCarre, 0)).toBeCloseTo(2, 5);
  });
});

describe("empreinteVehicule", () => {
  it("dimensions réelles utilisées si fournies", () => {
    const e = empreinteVehicule({ centreX: 0, centreY: 0, rotation: 0, longueur: 5, largeur: 2 });
    expect(e.w).toBe(2); // largeur sur X
    expect(e.h).toBe(5); // longueur sur Y
  });

  it("gabari par défaut si dimensions manquantes", () => {
    const e = empreinteVehicule({ centreX: 0, centreY: 0, rotation: 0, longueur: null, largeur: null });
    expect(e.w).toBe(GABARIT_DEFAUT.largeur);
    expect(e.h).toBe(GABARIT_DEFAUT.longueur);
  });

  it("rotation normalisée", () => {
    const e1 = empreinteVehicule({ centreX: 0, centreY: 0, rotation: 450, longueur: 4.5, largeur: 1.8 });
    const e2 = empreinteVehicule({ centreX: 0, centreY: 0, rotation: 90, longueur: 4.5, largeur: 1.8 });
    expect(e1.rotation).toBe(e2.rotation);
    expect(e1.rotation).toBe(90);
  });
});

describe("validerPlacement", () => {
  const zoneBase: Parameters<typeof validerPlacement>[0]["zone"] = {
    polygone: polygoneRect,
    stationnable: true,
    orientationAutorisee: null,
    marge: 0.3,
  };

  const voisinsVides: Parameters<typeof validerPlacement>[0]["voisins"] = [];

  it("placement valide au centre -> ok", () => {
    const r = validerPlacement({
      vehicule: { longueur: 4.5, largeur: 1.8 },
      cx: 10,
      cy: 5,
      rotation: 0,
      zone: zoneBase,
      voisins: voisinsVides,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.empreinte.cx).toBe(10);
  });

  it("zone non stationnable -> échec", () => {
    const r = validerPlacement({
      vehicule: { longueur: 4.5, largeur: 1.8 },
      cx: 10,
      cy: 5,
      rotation: 0,
      zone: { ...zoneBase, stationnable: false },
      voisins: voisinsVides,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.echecs.some((e) => e.code === "ZONE_NON_STATIONNABLE")).toBe(true);
  });

  it("orientation imposée respectée -> ok", () => {
    const r = validerPlacement({
      vehicule: { longueur: 4.5, largeur: 1.8 },
      cx: 10,
      cy: 5,
      rotation: 90,
      zone: { ...zoneBase, orientationAutorisee: 90 },
      voisins: voisinsVides,
    });
    expect(r.ok).toBe(true);
  });

  it("orientation imposée violée -> échec", () => {
    const r = validerPlacement({
      vehicule: { longueur: 4.5, largeur: 1.8 },
      cx: 10,
      cy: 5,
      rotation: 0,
      zone: { ...zoneBase, orientationAutorisee: 90 },
      voisins: voisinsVides,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.echecs.some((e) => e.code === "ORIENTATION_NON_AUTORISEE")).toBe(true);
  });

  it("hors zone -> échec HORS_ZONE avec dépassement", () => {
    const r = validerPlacement({
      vehicule: { longueur: 4.5, largeur: 1.8 },
      cx: 25, // hors zone 20x10
      cy: 5,
      rotation: 0,
      zone: zoneBase,
      voisins: voisinsVides,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const e = r.echecs.find((e) => e.code === "HORS_ZONE");
      expect(e).toBeDefined();
      if (e && e.code === "HORS_ZONE") expect(e.depassementM).toBeGreaterThan(0);
    }
  });

  it("collision détectée -> échec COLLISION avec IDs", () => {
    const voisin: Parameters<typeof validerPlacement>[0]["voisins"][0] = {
      id: 42,
      empreinte: { cx: 10, cy: 5, w: 1.8, h: 4.5, rotation: 0 },
    };
    const r = validerPlacement({
      vehicule: { longueur: 4.5, largeur: 1.8 },
      cx: 10,
      cy: 5, // même position
      rotation: 0,
      zone: zoneBase,
      voisins: [voisin],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const e = r.echecs.find((e) => e.code === "COLLISION");
      expect(e).toBeDefined();
      if (e && e.code === "COLLISION") {
        expect(e.vehicules).toContain(42);
        expect(e.chevauchementM2).toBeGreaterThan(0);
      }
    }
  });

  it("retourne TOUS les échecs, pas seulement le premier", () => {
    const r = validerPlacement({
      vehicule: { longueur: 4.5, largeur: 1.8 },
      cx: 25, // hors zone
      cy: 5,
      rotation: 0,
      zone: { ...zoneBase, stationnable: false }, // + zone non stationnable
      voisins: [{
        id: 1,
        empreinte: { cx: 25, cy: 5, w: 1.8, h: 4.5, rotation: 0 }, // collision aussi
      }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.echecs.length).toBeGreaterThanOrEqual(2);
      const codes = r.echecs.map((e) => e.code);
      expect(codes).toContain("ZONE_NON_STATIONNABLE");
      expect(codes).toContain("HORS_ZONE");
      expect(codes).toContain("COLLISION");
    }
  });

  it("emplacement trop petit -> échec EMPLACEMENT_TROP_PETIT", () => {
    const petitSpot: Polygone = { points: [[0, 0], [2, 0], [2, 1], [0, 1]] }; // 2x1 m
    const r = validerPlacement({
      vehicule: { longueur: 4.5, largeur: 1.8 },
      cx: 1,
      cy: 0.5,
      rotation: 0,
      zone: zoneBase,
      emplacement: { polygone: petitSpot, rotation: 0 },
      voisins: voisinsVides,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.echecs.some((e) => e.code === "EMPLACEMENT_TROP_PETIT")).toBe(true);
  });

  it("retourne avertissements non bloquants", () => {
    // Voisin assez proche pour déclencher l'avertissement PRES_DE_LA_MARGE (distance < marge*2 = 0.6)
    // distanceMin = distance_centres - demi_diagonales
    // demi-diagonale = hypot(1.8, 4.5)/2 ≈ 2.425. Somme = 4.85.
    // Besoin distance_centres < 4.85 + 0.6 = 5.45 ET pas de collision.
    // Séparation sur X : dx > 1.8 + 0.6 = 2.4. Prenons dx=2.5.
    // Besoin sqrt(2.5^2 + dy^2) < 5.45 -> dy < 4.84.
    // Prenons dy=4.8 -> distance = sqrt(6.25 + 23.04) = 5.408 -> d = 0.558 < 0.6.
    // Séparation X : dx=2.5 > 1.8+0.6=2.4 => pas de collision.
    const r = validerPlacement({
      vehicule: { longueur: 4.5, largeur: 1.8 },
      cx: 10,
      cy: 5,
      rotation: 0,
      zone: zoneBase,
      voisins: [{
        id: 1,
        empreinte: { cx: 12.5, cy: 9.8, w: 1.8, h: 4.5, rotation: 0 },
      }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avertissements.some((a) => a.code === "PRES_DE_LA_MARGE")).toBe(true);
  });
});