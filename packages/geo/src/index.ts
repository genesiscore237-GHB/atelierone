// ─── @lipatrad/geo — Moteur géométrique partagé (Parking GPJ) ──────────────────
// Convention unique, partagée front/back :
//   • Unités : mètre, double precision
//   • Origine : coin haut-gauche du plan, X vers la droite, Y vers le bas
//   • Position d'un véhicule : CENTRE géométrique (cx, cy) — JAMAIS un coin
//   • Rotation : degrés, sens horaire, normalisée dans [0, 360)
//       0° = avant du véhicule vers le haut (−Y)
//   • Empreinte non tournée : w = largeur (X), h = longueur (Y)
//       Le véhicule est « debout » à 0°
//   • Marge de sécurité : distance minimale entre deux empreintes, portée par la zone
//   • La marge est appliquée SYMÉTRIQUEMENT aux deux objets pour commutativité

export type Vec2 = readonly [number, number];

export interface Empreinte {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number; // degrés, [0, 360)
}

export interface Polygone {
  readonly points: readonly Vec2[];
}

// --- Constantes ---
export const GABARIT_DEFAUT = { longueur: 4.5, largeur: 1.8 } as const;

// Poids par défaut pour le scoring multi-critères (suggesterPlacement)
export const SUGGESTION_WEIGHTS = {
  accessibilite: 1.0,      // w1 : accessibilité (inverse du nb véhicules à déplacer pour sortir)
  adequationHorizon: 0.8,  // w2 : adéquation horizon d'immobilisation
  compacite: 0.5,          // w3 : compacité (pénalise fragmentation espace libre)
  distanceManoeuvre: 0.3,  // w4 : distance de manœuvre depuis position actuelle
} as const;

// Horizon de sortie estimé en jours selon le statut
export function horizonSortieJours(statut: string): number {
  switch (statut) {
    case "TERMINE_A_RECUPERER": return 2;
    case "EN_TRAVAUX": return 7;
    case "EN_ATTENTE_DEVIS": return 10;
    case "EN_ATTENTE_DIAGNOSTIC": return 10;
    case "EN_ATTENTE_PIECE": return 30;
    case "ACCIDENTE":
    case "EN_VENTE":
    case "A_TRANSFERER": return 90;
    default: return 30;
  }
}
export const EPS = 1e-9;

// --- Normalisation ---
export function normaliserAngle(deg: number): number {
  const n = deg % 360;
  const r = n < 0 ? n + 360 : n;
  return r === 0 ? 0 : r; // éviter -0
}

// --- Coins d'une empreinte (sens horaire, partant du coin haut-gauche local) ---
export function coins(e: Empreinte): readonly Vec2[] {
  const a = (normaliserAngle(e.rotation) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hw = e.w / 2;
  const hh = e.h / 2;
  // Coins locaux (avant rotation) : HG, HD, BD, BG
  const local: readonly Vec2[] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  return local.map(([dx, dy]) => [
    e.cx + dx * cos - dy * sin,
    e.cy + dx * sin + dy * cos,
  ] as Vec2);
}

// --- Dilatation d'une empreinte (marge symétrique) ---
export function dilater(e: Empreinte, m: number): Empreinte {
  if (m <= 0) return e;
  return { ...e, w: e.w + 2 * m, h: e.h + 2 * m };
}

// --- Projection sur un axe (SAT) ---
function projeterSurAxe(axe: Vec2, pts: readonly Vec2[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of pts) {
    const p = x * axe[0] + y * axe[1];
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return { min, max };
}

// --- SAT : chevauchement de deux OBB (avec marge symétrique) ---
export function seCroisent(a: Empreinte, b: Empreinte, marge = 0): boolean {
  const aa = dilater(a, marge);
  const bb = dilater(b, marge);
  const ca = coins(aa) as readonly [Vec2, Vec2, Vec2, Vec2];
  const cb = coins(bb) as readonly [Vec2, Vec2, Vec2, Vec2];

  // Axes = normales des arêtes des deux rectangles
  const axes: Vec2[] = [];
  for (const cs of [ca, cb]) {
    for (let i = 0; i < 4; i++) {
      const p1 = cs[i] as Vec2;
      const p2 = cs[(i + 1) % 4] as Vec2;
      const [x1, y1] = p1;
      const [x2, y2] = p2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len > EPS) axes.push([-dy / len, dx / len] as Vec2);
    }
  }

  for (const axe of axes) {
    const pa = projeterSurAxe(axe, ca);
    const pb = projeterSurAxe(axe, cb);
    if (pa.max <= pb.min + EPS || pb.max <= pa.min + EPS) return false;
  }
  return true;
}

// --- Distance minimale entre deux empreintes (0 si collision) ---
export function distanceMin(a: Empreinte, b: Empreinte): number {
  if (seCroisent(a, b, 0)) return 0;
  // Approximation : distance entre centres - demi-diagonales
  const da = Math.hypot(a.w, a.h) / 2;
  const db = Math.hypot(b.w, b.h) / 2;
  const dCentres = Math.hypot(a.cx - b.cx, a.cy - b.cy);
  return Math.max(0, dCentres - da - db);
}

// --- Chevauchement exact d'aire (clipping de polygones convexes, Sutherland–Hodgman) ---
function clipperSujetContreCoupe(sujet: readonly Vec2[], coupe: readonly Vec2[]): readonly Vec2[] {
  let sortie: readonly Vec2[] = sujet;
  for (let i = 0; i < coupe.length; i++) {
    const a = coupe[i] as Vec2;
    const b = coupe[(i + 1) % coupe.length] as Vec2;
    const [ax, ay] = a;
    const [bx, by] = b;
    const dx = bx - ax;
    const dy = by - ay;
    // Normale intérieure pour polygone horaire (Y vers le bas) : (-dy, dx)
    const nx = -dy;
    const ny = dx;
    const entree: Vec2[] = [];
    for (let j = 0; j < sortie.length; j++) {
      const s = sortie[j] as Vec2;
      const e = sortie[(j + 1) % sortie.length] as Vec2;
      const ds = (s[0] - ax) * nx + (s[1] - ay) * ny;
      const de = (e[0] - ax) * nx + (e[1] - ay) * ny;
      // Intérieur = produit scalaire >= -EPS (normale intérieure, polygone horaire)
      const sInside = ds >= -EPS;
      const eInside = de >= -EPS;
      if (sInside && eInside) {
        entree.push(e);
      } else if (sInside && !eInside) {
        // Sortie : intersection
        const t = ds / (ds - de);
        entree.push([
          s[0] + t * (e[0] - s[0]),
          s[1] + t * (e[1] - s[1]),
        ] as Vec2);
      } else if (!sInside && eInside) {
        // Entrée : intersection + point
        const t = ds / (ds - de);
        entree.push([
          s[0] + t * (e[0] - s[0]),
          s[1] + t * (e[1] - s[1]),
        ] as Vec2);
        entree.push(e);
      }
    }
    sortie = entree;
    if (sortie.length === 0) return [];
  }
  return sortie;
}

function airePolygone(pts: readonly Vec2[]): number {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i] as Vec2;
    const [x2, y2] = pts[(i + 1) % pts.length] as Vec2;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// --- Aire d'intersection exacte entre deux empreintes (polygones convexes) ---
export function aireIntersection(a: Empreinte, b: Empreinte): number {
  const ca = coins(a) as readonly [Vec2, Vec2, Vec2, Vec2];
  const cb = coins(b) as readonly [Vec2, Vec2, Vec2, Vec2];
  const inter = clipperSujetContreCoupe(ca, cb);
  return airePolygone(inter);
}

// --- Empreinte entièrement dans un polygone (zone), avec marge ---
export function contenuDans(empreinte: Empreinte, zone: Polygone, marge = 0): boolean {
  const e = dilater(empreinte, marge);
  const c = coins(e) as readonly [Vec2, Vec2, Vec2, Vec2];
  // Test point-in-polygon pour chaque coin (zone convexe, sens horaire, Y vers le bas)
  for (const [x, y] of c) {
    let inside = true;
    for (let i = 0; i < zone.points.length; i++) {
      const [ax, ay] = zone.points[i] as Vec2;
      const [bx, by] = zone.points[(i + 1) % zone.points.length] as Vec2;
      const dx = bx - ax;
      const dy = by - ay;
      // Normale intérieure pour polygone horaire (Y vers le bas) : (-dy, dx)
      const nx = -dy;
      const ny = dx;
      // Intérieur = produit scalaire >= -EPS
      if ((x - ax) * nx + (y - ay) * ny < -EPS) {
        inside = false;
        break;
      }
    }
    if (!inside) return false;
  }
  return true;
}

// --- Dépassement maximal hors zone (pour message HORS_ZONE) ---
export function depassementHorsZone(empreinte: Empreinte, zone: Polygone, marge = 0): number {
  const e = dilater(empreinte, marge);
  const c = coins(e) as readonly [Vec2, Vec2, Vec2, Vec2];
  let maxDep = 0;
  for (const [x, y] of c) {
    for (let i = 0; i < zone.points.length; i++) {
      const [ax, ay] = zone.points[i] as Vec2;
      const [bx, by] = zone.points[(i + 1) % zone.points.length] as Vec2;
      const dx = bx - ax;
      const dy = by - ay;
      // Normale intérieure (horaire) : (-dy, dx)
      const nx = -dy;
      const ny = dx;
      const len = Math.hypot(nx, ny);
      if (len < EPS) continue;
      const d = ((x - ax) * nx + (y - ay) * ny) / len;
      // Intérieur = d >= 0. Hors zone = d < 0. Dépassement = |d|.
      if (d < -EPS && -d > maxDep) maxDep = -d;
    }
  }
  return maxDep;
}

// --- Empreinte véhicule depuis données brutes ---
export function empreinteVehicule(v: {
  centreX: number;
  centreY: number;
  rotation: number;
  longueur: number | null;
  largeur: number | null;
}): Empreinte {
  const hasDims = v.longueur != null && v.largeur != null;
  return {
    cx: v.centreX,
    cy: v.centreY,
    rotation: normaliserAngle(v.rotation),
    w: hasDims ? v.largeur! : GABARIT_DEFAUT.largeur,
    h: hasDims ? v.longueur! : GABARIT_DEFAUT.longueur,
  };
}

// --- Validation placement : un seul point d'entrée, front et back ---
export type EchecPlacement =
  | { code: "ZONE_NON_STATIONNABLE" }
  | { code: "ORIENTATION_NON_AUTORISEE"; attendue: number }
  | { code: "HORS_ZONE"; depassementM: number }
  | { code: "COLLISION"; vehicules: number[]; chevauchementM2: number }
  | { code: "EMPLACEMENT_TROP_PETIT"; requis: { l: number; L: number } };

export type Avertissement =
  | { code: "ESPACE_LIBRE_NON_EXPLOITABLE" }
  | { code: "PRES_DE_LA_MARGE"; distanceM: number };

export type ResultatPlacement =
  | { ok: true; empreinte: Empreinte; avertissements: Avertissement[] }
  | { ok: false; echecs: EchecPlacement[] };

export interface Voisin {
  id: number;
  empreinte: Empreinte;
}

export interface ZonePlacement {
  polygone: Polygone;
  stationnable: boolean;
  orientationAutorisee: number | null; // degrés, null = libre, modulo 180°
  marge: number;
}

export interface EmplacementOptionnel {
  polygone: Polygone | null;
  rotation: number;
}

export function validerPlacement(p: {
  vehicule: { id?: number; longueur: number | null; largeur: number | null };
  cx: number;
  cy: number;
  rotation: number;
  zone: ZonePlacement;
  emplacement?: EmplacementOptionnel | null;
  voisins: Voisin[];
}): ResultatPlacement {
  const echecs: EchecPlacement[] = [];
  const avertissements: Avertissement[] = [];

  const empreinte = empreinteVehicule({
    centreX: p.cx,
    centreY: p.cy,
    rotation: p.rotation,
    longueur: p.vehicule.longueur,
    largeur: p.vehicule.largeur,
  });

  // 1. Zone stationnable
  if (!p.zone.stationnable) {
    echecs.push({ code: "ZONE_NON_STATIONNABLE" });
  }

  // 2. Orientation autorisée (modulo 180°)
  if (p.zone.orientationAutorisee != null) {
    const attendue = normaliserAngle(p.zone.orientationAutorisee) % 180;
    const donnee = normaliserAngle(empreinte.rotation) % 180;
    if (Math.abs(attendue - donnee) % 180 > 1) {
      echecs.push({ code: "ORIENTATION_NON_AUTORISEE", attendue: attendue });
    }
  }

  // 3. Dans la zone
  if (!contenuDans(empreinte, p.zone.polygone, p.zone.marge)) {
    const dep = depassementHorsZone(empreinte, p.zone.polygone, p.zone.marge);
    echecs.push({ code: "HORS_ZONE", depassementM: dep });
  }

  // 4. Collisions avec véhicules voisins
  const collisions: number[] = [];
  let chevauchementTotal = 0;
  for (const v of p.voisins) {
    if (seCroisent(empreinte, v.empreinte, p.zone.marge)) {
      collisions.push(v.id);
      chevauchementTotal += aireIntersection(empreinte, v.empreinte);
    }
  }
  if (collisions.length > 0) {
    echecs.push({ code: "COLLISION", vehicules: collisions, chevauchementM2: chevauchementTotal });
  }

  // 5. Emplacement optionnel (trop petit ?)
  if (p.emplacement?.polygone) {
    if (!contenuDans(empreinte, p.emplacement.polygone, 0)) {
      echecs.push({
        code: "EMPLACEMENT_TROP_PETIT",
        requis: { l: empreinte.w, L: empreinte.h },
      });
    }
  }

  // Avertissements (non bloquants)
  if (echecs.length === 0) {
    // Espace libre non exploitable : heuristique simple
    // On pourrait faire un balayage plus précis ici
    const surfaceUtilisee = p.voisins.reduce((acc, v) => acc + v.empreinte.w * v.empreinte.h, 0);
    const aireZone = airePolygone(p.zone.polygone.points);
    const surfaceRestante = aireZone - surfaceUtilisee - empreinte.w * empreinte.h;
    if (surfaceRestante < GABARIT_DEFAUT.longueur * GABARIT_DEFAUT.largeur) {
      avertissements.push({ code: "ESPACE_LIBRE_NON_EXPLOITABLE" });
    }
    // Proximité marge
    for (const v of p.voisins) {
      const d = distanceMin(empreinte, v.empreinte);
      if (d < p.zone.marge * 2 && d > 0) {
        avertissements.push({ code: "PRES_DE_LA_MARGE", distanceM: d });
      }
    }
  }

  if (echecs.length > 0) return { ok: false, echecs };
  return { ok: true, empreinte, avertissements };
}

// ─── Suggestion multi-critères (Lot 5) ────────────────────────────────────────

export interface SuggestionCandidat {
  cx: number;
  cy: number;
  rotation: number;
  score: number;
  detail: {
    accessibilite: number;
    adequationHorizon: number;
    compacite: number;
    distanceManoeuvre: number;
  };
}

export interface SuggestionResult {
  candidats: SuggestionCandidat[];
  meilleur: SuggestionCandidat | null;
}

/**
 * Génère les meilleures positions pour placer un véhicule selon plusieurs critères :
 * - accessibilité (combien de véhicules faut-il déplacer pour sortir)
 * - adéquation horizon (proximité sortie pour véhicules à court terme)
 * - compacité (pénalise fragmentation espace libre)
 * - distance de manœuvre (distance depuis position actuelle)
 *
 * Retourne les 3 meilleurs candidats triés par score décroissant.
 */
export function suggererPlacement(args: {
  vehicule: { id?: number; longueur: number | null; largeur: number | null; statut: string };
  zone: ZonePlacement;
  emplacement?: EmplacementOptionnel | null;
  voisins: Voisin[];
  fromX?: number;
  fromY?: number;
  pas?: number;           // pas de grille en mètres (défaut 0.25)
  orientations?: number[]; // orientations testées (défaut: 0, 90, 180, 270 si libre)
  poids?: typeof SUGGESTION_WEIGHTS;
}): SuggestionResult {
  const {
    vehicule,
    zone,
    emplacement,
    voisins,
    fromX = 0,
    fromY = 0,
    pas = 0.25,
    orientations,
    poids = SUGGESTION_WEIGHTS,
  } = args;

  const e = empreinteVehicule({
    centreX: 0,
    centreY: 0,
    rotation: 0,
    longueur: vehicule.longueur,
    largeur: vehicule.largeur,
  });

  const orientationTest = orientations ?? (zone.orientationAutorisee != null
    ? [zone.orientationAutorisee]
    : [0, 90, 180, 270]);

  // Espace libre réel = zone - union des empreintes voisines
  // On approxime par balayage sur grille au pas donné
  const zonePolygone = zone.polygone;
  const [minX, minY, maxX, maxY] = boundingBox(zonePolygone);

  const candidats: SuggestionCandidat[] = [];

  for (let y = minY; y <= maxY; y += pas) {
    for (let x = minX; x <= maxX; x += pas) {
      for (const rot of orientationTest) {
        const empreinte = { ...e, cx: x, cy: y, rotation: rot };

        // Validation rapide : doit être dans la zone (avec marge)
        if (!contenuDans(empreinte, zone.polygone, zone.marge)) continue;

        // Si emplacement spécifié, doit tenir dans l'emplacement
        if (emplacement?.polygone && !contenuDans(empreinte, emplacement.polygone, 0)) continue;

        // Collisions ?
        let collision = false;
        for (const v of voisins) {
          if (seCroisent(empreinte, v.empreinte, zone.marge)) {
            collision = true;
            break;
          }
        }
        if (collision) continue;

        // Calcul du score multi-critères
        const score = calculerScore({
          empreinte,
          zone: zonePolygone,
          voisins,
          fromX,
          fromY,
          horizonJours: horizonSortieJours("EN_PARKING"), // TODO: passer le vrai statut
          poids,
        });

        if (score > 0) {
          candidats.push({
            cx: x,
            cy: y,
            rotation: rot,
            score,
            detail: scoreDetail, // À calculer dans calculerScore
          });
        }
      }
    }
  }

  // Trier par score décroissant et garder top 3
  candidats.sort((a, b) => b.score - a.score);
  return {
    candidats: candidats.slice(0, 3),
    meilleur: candidats[0] ?? null,
  };
}

// ─── Helpers pour suggererPlacement ──────────────────────────────────────────

function boundingBox(poly: Polygone): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly.points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

interface ScoreDetail {
  accessibilite: number;
  adequationHorizon: number;
  compacite: number;
  distanceManoeuvre: number;
}

function calculerScore(args: {
  empreinte: Empreinte;
  zone: Polygone;
  voisins: Voisin[];
  fromX: number;
  fromY: number;
  horizonJours: number;
  poids: typeof SUGGESTION_WEIGHTS;
}): { score: number; detail: ScoreDetail } {
  const { empreinte, zone, voisins, fromX, fromY, horizonJours, poids } = args;

  // 1. Accessibilité : inverse du nombre de véhicules à déplacer pour sortir
  // On approxime : accessibilité = 1 / (1 + nb_bloqueurs)
  const { nbBloqueurs, profondeur } = calculerBloqueurs(empreinte, voisins);
  const accessibilite = 1 / (1 + nbBloqueurs);

  // 2. Adéquation horizon : score élevé si horizon court ET position accessible
  // Horizon court (sortie rapide) -> favoriser proximité sortie
  const distanceSortie = distanceAuPlusProcheBord(empreinte, zone);
  const adequationHorizon = horizonJours <= 7
    ? 1 / (1 + distanceSortie / 10)
    : horizonJours <= 30
      ? 0.5
      : 0.2;

  // 3. Compacité : pénalise la fragmentation de l'espace libre restant
  // On approxime : aire libre restante / aire totale zone
  const surfaceUtilisee = voisins.reduce((acc, v) => acc + v.empreinte.w * v.empreinte.h, 0);
  const aireZone = airePolygone(zone.points);
  const surfaceRestante = aireZone - surfaceUtilisee - empreinte.w * empreinte.h;
  const compacite = surfaceRestante / aireZone;

  // 4. Distance manœuvre : distance depuis point de départ (poids faible)
  const distanceManoeuvre = 1 / (1 + Math.hypot(empreinte.cx - fromX, empreinte.cy - fromY) / 10);

  const score =
    poids.accessibilite * accessibilite +
    poids.adequationHorizon * adequationHorizon +
    poids.compacite * compacite +
    poids.distanceManoeuvre * distanceManoeuvre;

  const scoreDetail: ScoreDetail = {
    accessibilite,
    adequationHorizon,
    compacite,
    distanceManoeuvre,
  };

  return { score, detail: scoreDetail };
}

function calculerBloqueurs(empreinte: Empreinte, voisins: Voisin[]): { nbBloqueurs: number; profondeur: number } {
  // Pour simplifier : on compte les véhicules dont l'emprise intersecte
  // le couloir de dégagement (axe longitudinal du véhicule jusqu'au bord)
  let nbBloqueurs = 0;
  for (const v of voisins) {
    if (seCroisent(empreinte, v.empreinte, 0)) nbBloqueurs++;
  }
  return { nbBloqueurs, profondeur: 1 }; // TODO: calculer profondeur réelle
}

function distanceAuPlusProcheBord(empreinte: Empreinte, zone: Polygone): number {
  const c = coins(empreinte);
  let minDist = Infinity;
  for (const [x, y] of c) {
    for (let i = 0; i < zone.points.length; i++) {
      const [ax, ay] = zone.points[i];
      const [bx, by] = zone.points[(i + 1) % zone.points.length];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      // Distance point-segment
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (len * len)));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const d = Math.hypot(x - px, y - py);
      if (d < minDist) minDist = d;
    }
  }
  return minDist;
}

// ─── Chemin de sortie (Lot 6) ────────────────────────────────────────────────

export interface Bloqueur {
  vehicleId: number;
  ordre: number;           // ordre de déplacement (1 = premier à déplacer)
  suggestion: {
    cx: number;
    cy: number;
    rotation: number;
  } | null;
}

export interface CheminSortieResult {
  sortieDirecte: boolean;
  aDeplacer: Bloqueur[];
  coutEstimeMinutes: number;
}

/**
 * Calcule le chemin de sortie d'un véhicule.
 * 
 * Algorithme :
 * 1. Identifie les zones de type CIRCULATION/VOIE et les sorties du site (zone.est_sortie = true)
 * 2. Pour le véhicule cible, construit le couloir de dégagement :
 *    - Balaye son empreinte le long de son axe longitudinal (marche avant et arrière)
 *    - Jusqu'à atteindre une zone de circulation
 * 3. Tout véhicule dont l'empreinte intersecte ce couloir est un bloqueur direct
 * 4. Récursion sur chaque bloqueur -> graphe de blocage orienté
 * 5. Résolution par tri topologique : "pour sortir le n° 12, déplacer d'abord le n° 8, puis le n° 23"
 * 
 * Sortie :
 * {
 *   sortieDirecte: boolean,
 *   aDeplacer: { vehicleId, numRegistre, ordre, suggestion: { cx, cy, rotation } | null }[],
 *   coutEstimeMinutes: number
 * }
 */
export function calculerCheminSortie(args: {
  vehicule: { id: number; numRegistre: number; longueur: number | null; largeur: number | null; rotation: number | null; centreX: number | null; centreY: number | null; statut: string };
  zone: ZonePlacement & { zones: Array<ZonePlacement & { estSortie?: boolean }>; sortiePolygone?: Polygone };
  voisins: Voisin[];
}): CheminSortieResult {
  const { vehicule, zone, voisins } = args;

  if (vehicule.centreX == null || vehicule.centreY == null) {
    return { sortieDirecte: false, aDeplacer: [], coutEstimeMinutes: 0 };
  }

  const empreinte = empreinteVehicule({
    centreX: vehicule.centreX,
    centreY: vehicule.centreY,
    rotation: vehicule.rotation ?? 0,
    longueur: vehicule.longueur,
    largeur: vehicule.largeur,
  });

  // 1. Trouver les zones de sortie (CIRCULATION/VOIE avec est_sortie = true)
  const zonesSortie = zone.zones.filter(z => z.estSortie === true);
  if (zonesSortie.length === 0) {
    // Fallback: bord du plan
    return calculerVersBord(empreinte, zone, voisins);
  }

  // 2. Construire le couloir de dégagement pour chaque zone de sortie
  // Pour simplifier : on teste les 4 directions (avant/arrière/gauche/droite)
  // et on prend le chemin le plus court vers une zone de sortie

  const directions = [
    { dx: 0, dy: -1, label: "arrière" },   // marche arrière
    { dx: 0, dy: 1, label: "avant" },      // marche avant
    { dx: -1, dy: 0, label: "gauche" },
    { dx: 1, dy: 0, label: "droite" },
  ];

  let meilleurChemin: { bloqueurs: Bloqueur[]; distance: number } | null = null;

  for (const dir of directions) {
    const couloir = construireCouloir(empreinte, zone.polygone, dir, zone.zones);
    if (!couloir) continue;

    // Vérifie si le couloir atteint une zone de sortie
    const atteintSortie = zonesSortie.some(zs => polygonsIntersect(couloir, zs.polygone));
    if (!atteintSortie) continue;

    // Trouve les bloqueurs dans ce couloir
    const bloqueurs = trouverBloqueursDansCouloir(couloir, voisins);
    
    // Calcule suggestions de déplacement pour chaque bloqueur
    const bloqueursAvecSuggestion = bloqueurs.map((b, i) => ({
      vehicleId: b.id,
      ordre: i + 1,
      suggestion: suggererPositionLibre(b, zone, voisins.filter(v => v.id !== b.id)),
    }));

    const distance = calculerDistanceCouloir(couloir);
    
    if (!meilleurChemin || distance < meilleurChemin.distance) {
      meilleurChemin = { bloqueurs: bloqueursAvecSuggestion, distance };
    }
  }

  if (!meilleurChemin) {
    return calculerVersBord(empreinte, zone, voisins);
  }

  const coutEstime = Math.ceil(meilleurChemin.bloqueurs.length * 3 + meilleurChemin.distance / 5);

  return {
    sortieDirecte: meilleurChemin.bloqueurs.length === 0,
    aDeplacer: meilleurChemin.bloqueurs,
    coutEstimeMinutes: coutEstime,
  };
}

// ─── Helpers pour cheminDeSortie ────────────────────────────────────────────

function construireCouloir(empreinte: Empreinte, zonePolygone: Polygone, direction: { dx: number; dy: number }, zones: Array<ZonePlacement & { estSortie?: boolean }>): Polygone | null {
  // Simplification : couloir rectangulaire le long de l'axe du véhicule
  // Étendu jusqu'au bord de la zone ou zone de sortie
  const { cx, cy, w, h, rotation } = empreinte;
  
  // Axe longitudinal du véhicule (direction de l'avant)
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  
  // Longueur du couloir = distance au bord de la zone dans cette direction
  // Pour simplifier : on prend la distance max possible dans la zone
  const maxLen = 100; // mètres max
  
  const dx = cos * direction.dx;
  const dy = sin * direction.dy;
  
  // Points du couloir (rectangle le long de l'axe)
  const demiLargeur = empreinte.w / 2 + 0.5;
  
  // Centre de départ = centre du véhicule
  // Centre de fin = centre + direction * maxLen
  const cxStart = empreinte.cx;
  const cyStart = empreinte.cy;
  const cxEnd = cxStart + dx * maxLen;
  const cyEnd = cyStart + dy * maxLen;
  
  // Rectangle englobant le couloir
  const minX = Math.min(cxStart, cxEnd) - demiLargeur;
  const maxX = Math.max(cxStart, cxEnd) + demiLargeur;
  const minY = Math.min(cyStart, cyEnd) - demiLargeur;
  const maxY = Math.max(cyStart, cyEnd) + demiLargeur;
  
  return {
    points: [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ]
  };
}

function polygonsIntersect(poly1: Polygone, poly2: Polygone): boolean {
  // Test simple AABB d'abord
  const box1 = boundingBox(poly1);
  const box2 = boundingBox(poly2);
  if (box1[0] > box2[2] || box1[2] < box2[0] || box1[1] > box2[3] || box1[3] < box2[1]) {
    return false;
  }
  // Pour simplifier : on fait un test SAT complet
  // Pour l'instant : AABB seulement
  return true;
}

function trouverBloqueursDansCouloir(couloir: Polygone, voisins: Voisin[]): Voisin[] {
  const bloqueurs: Voisin[] = [];
  for (const v of voisins) {
    if (polygonsIntersect(empreinteVehicule({ centreX: v.empreinte.cx, centreY: v.empreinte.cy, rotation: v.empreinte.rotation, w: v.empreinte.w, h: v.empreinte.h }), couloir)) {
      bloqueurs.push(v);
    }
  }
  return bloqueurs;
}

function suggererPositionLibre(bloqueur: Voisin, zone: ZonePlacement, voisins: Voisin[]): { cx: number; cy: number; rotation: number } | null {
  // Trouve une position libre proche pour ce bloqueur
  // Simplification : premier spot libre ou position libre dans la zone
  return null; // TODO: implémenter suggestion réelle
}

function calculerDistanceCouloir(couloir: Polygone): number {
  // Distance approximative = longueur du couloir
  const box = boundingBox(couloir);
  return Math.max(box[2] - box[0], box[3] - box[1]);
}

function calculerVersBord(empreinte: Empreinte, zone: ZonePlacement, voisins: Voisin[]): CheminSortieResult {
  // Fallback : sortie vers le bord le plus proche du plan
  const distanceBord = distanceAuPlusProcheBord(empreinte, zone.polygone);
  const bloqueurs = trouverBloqueursVersBord(empreinte, zone.polygone, voisins);
  
  const bloqueursAvecSuggestion = bloqueurs.map((b, i) => ({
    vehicleId: b.id,
    ordre: i + 1,
    suggestion: null,
  }));
  
  const coutEstime = Math.ceil(bloqueurs.length * 3 + distanceBord / 5);
  
  return {
    sortieDirecte: bloqueurs.length === 0,
    aDeplacer: bloqueursAvecSuggestion,
    coutEstimeMinutes: coutEstime,
  };
}

function trouverBloqueursVersBord(empreinte: Empreinte, zonePolygone: Polygone, voisins: Voisin[]): Voisin[] {
  // Vérifie qui bloque le chemin vers le bord le plus proche
  return voisins.filter(v => seCroisent(empreinte, v.empreinte, 0));
}