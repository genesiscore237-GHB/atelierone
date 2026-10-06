import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db, client } from "./client";
import * as schema from "./schema";
import type { ParkingZoneType, ParkingVehicleStatus } from "./schema/parking";
import { eq, sql } from "drizzle-orm";

requireLocalOrForced("db:seed-garage (seed-garage.ts)");

/**
 * --vehicules : mode « démo stricte » aligné sur libracore (purge + réinsertion
 * des 47 véhicules du registre de démonstration).
 *
 * Par défaut, seules les tables de plan (sites / zones / emplacements / configs)
 * sont régénérées : les véhicules déjà en base — registre réel, 54 entrées —
 * sont conservés. Sans ce garde-fou, un run classique écraserait le registre.
 */
const AVEC_VEHICULES = process.argv.includes("--vehicules");

/**
 * Seed module Parking & Véhicules Immobilisés (GPJ).
 * Idempotent : purge puis réinsère les données parking de l'agence de référence.
 *
 * - 2 sites (principal + secondaire), géométrie nominale en mètres (à calibrer sur site).
 * - Zones + emplacements logiques générés par grille (grand parking 13×4, hangar 6, …).
 * - 47 véhicules (registre n°1→48 sans le 33) avec données verbatim du docx.
 *   Champs absents / « — » → NULL. Aucune date inventée (dateEntree = NULL, à renseigner).
 * - Véhicules non positionnés (positionX/Y = NULL) → panneau « À placer ».
 */

type Rect = { type: "rectangle"; x: number; y: number; w: number; h: number };

type ZoneDef = {
  code: string;
  nom: string;
  type: ParkingZoneType;
  g: Rect;
  capaciteTheorique?: number;
  surfaceStationnable?: number;
  orientationAutorisee?: number;
  stationnable?: boolean;
  placeParking?: boolean;
  ressourceTravail?: boolean;
  config?: Record<string, unknown>;
  ordre?: number;
};

const SITE_PRINCIPAL_CODE = "GPJ-S1";
const SITE_SECONDAIRE_CODE = "GPJ-S2";

// ─── Zones du site principal ─────────────────────────────────────────────────
const ZONES_PRINCIPAL: ZoneDef[] = [
  // Bordure gauche — bâtiments (non stationnables)
  { code: "BAT-MEZZ", nom: "Mezzanine + Toilettes externes", type: "BATIMENT", g: { type: "rectangle", x: 0, y: 0, w: 14, h: 8 }, stationnable: false, placeParking: false, ordre: 1 },
  { code: "BAT-MAG1", nom: "Magasin 1", type: "BATIMENT", g: { type: "rectangle", x: 0, y: 8, w: 14, h: 10 }, stationnable: false, placeParking: false, ordre: 2 },
  { code: "BAT-MAG2", nom: "Magasin 2", type: "BATIMENT", g: { type: "rectangle", x: 0, y: 18, w: 14, h: 10 }, stationnable: false, placeParking: false, ordre: 3 },
  { code: "BAT-MAG3", nom: "Magasin 3", type: "BATIMENT", g: { type: "rectangle", x: 0, y: 28, w: 14, h: 10 }, stationnable: false, placeParking: false, ordre: 4 },
  { code: "BAT-MAG4", nom: "Magasin 4", type: "BATIMENT", g: { type: "rectangle", x: 0, y: 38, w: 14, h: 10 }, stationnable: false, placeParking: false, ordre: 5 },

  // Haut du site — grand parking 13×4 (52 places)
  { code: "GRAND-PARKING", nom: "Grand parking 13×4", type: "GRAND_PARKING", g: { type: "rectangle", x: 14, y: 0, w: 72, h: 10 }, capaciteTheorique: 52, surfaceStationnable: 72 * 10, orientationAutorisee: 0, stationnable: true, placeParking: true, config: { cols: 13, rows: 4 }, ordre: 6 },

  // Centre — hangar, ponts, parkings secondaires, unité services techniques
  { code: "HANGAR", nom: "Hangar couvert", type: "HANGAR", g: { type: "rectangle", x: 16, y: 12, w: 24, h: 8 }, capaciteTheorique: 6, surfaceStationnable: 24 * 8, orientationAutorisee: 0, stationnable: true, placeParking: true, config: { cols: 3, rows: 2 }, ordre: 7 },
  { code: "PONT-TEUN", nom: "Pont élévateur « teun »", type: "PONT_ELEVATEUR", g: { type: "rectangle", x: 42, y: 12, w: 12, h: 6 }, capaciteTheorique: 1, surfaceStationnable: 12 * 6, stationnable: true, placeParking: false, ressourceTravail: true, ordre: 8 },
  { code: "PK-INTER", nom: "Parking intermédiaire", type: "PARKING_INTERMEDIAIRE", g: { type: "rectangle", x: 16, y: 24, w: 36, h: 10 }, capaciteTheorique: 18, surfaceStationnable: 36 * 10, orientationAutorisee: 0, stationnable: true, placeParking: true, config: { cols: 6, rows: 3 }, ordre: 9 },
  { code: "PK-SEC", nom: "Parking secondaire", type: "PARKING_SECONDAIRE", g: { type: "rectangle", x: 56, y: 24, w: 22, h: 6 }, capaciteTheorique: 4, surfaceStationnable: 22 * 6, orientationAutorisee: 0, stationnable: true, placeParking: true, config: { cols: 4, rows: 1 }, ordre: 10 },
  { code: "UST-CENTRE", nom: "Unité de services techniques", type: "ZONE_TECHNIQUE", g: { type: "rectangle", x: 16, y: 40, w: 38, h: 16 }, capaciteTheorique: 2, surfaceStationnable: 38 * 16, stationnable: true, placeParking: false, ordre: 11 },

  // Bordure droite — axe + bureaux + pont
  { code: "AXE-ENTREE", nom: "Axe entrée véhicules", type: "VOIE", g: { type: "rectangle", x: 86, y: 0, w: 8, h: 72 }, stationnable: false, placeParking: false, ordre: 12 },
  { code: "BUR-MGR", nom: "Bureau Manager", type: "BATIMENT", g: { type: "rectangle", x: 94, y: 0, w: 6, h: 8 }, stationnable: false, placeParking: false, ordre: 13 },
  { code: "BUR-MAGS", nom: "Bureau magasinier", type: "BATIMENT", g: { type: "rectangle", x: 94, y: 8, w: 6, h: 8 }, stationnable: false, placeParking: false, ordre: 14 },
  { code: "PONT-GRAIS", nom: "Pont élévateur & unité de graissage", type: "PONT_ELEVATEUR", g: { type: "rectangle", x: 94, y: 16, w: 6, h: 14 }, capaciteTheorique: 1, surfaceStationnable: 6 * 14, stationnable: true, placeParking: false, ressourceTravail: true, ordre: 15 },
  { code: "BUR-DG", nom: "Bureau D.G.", type: "BATIMENT", g: { type: "rectangle", x: 94, y: 30, w: 6, h: 8 }, stationnable: false, placeParking: false, ordre: 16 },
  { code: "BUR-SEC", nom: "Secrétariat", type: "BATIMENT", g: { type: "rectangle", x: 94, y: 38, w: 6, h: 8 }, stationnable: false, placeParking: false, ordre: 17 },
  { code: "BUR-GARD", nom: "Bureau gardien", type: "BATIMENT", g: { type: "rectangle", x: 94, y: 46, w: 6, h: 8 }, stationnable: false, placeParking: false, ordre: 18 },

  // Bas du plan — entrée principale (portail)
  { code: "ENTREE-PRINCIPALE", nom: "Entrée principale (portail)", type: "CIRCULATION", g: { type: "rectangle", x: 84, y: 68, w: 14, h: 4 }, stationnable: false, placeParking: false, ordre: 19 },
];

// ─── Zones du site secondaire (génériques, à valider sur site) ───────────────
const ZONES_SECONDAIRE: ZoneDef[] = [
  { code: "PK-SEC2-A", nom: "Parking principal", type: "PARKING_INTERMEDIAIRE", g: { type: "rectangle", x: 0, y: 0, w: 40, h: 12 }, capaciteTheorique: 16, surfaceStationnable: 40 * 12, orientationAutorisee: 0, stationnable: true, placeParking: true, config: { cols: 8, rows: 2 }, ordre: 1 },
  { code: "PK-SEC2-B", nom: "Parking secondaire", type: "PARKING_SECONDAIRE", g: { type: "rectangle", x: 42, y: 0, w: 30, h: 8 }, capaciteTheorique: 8, surfaceStationnable: 30 * 8, orientationAutorisee: 0, stationnable: true, placeParking: true, config: { cols: 8, rows: 1 }, ordre: 2 },
  { code: "AIRE-LIBRE2", nom: "Aire libre", type: "AIRE_LIBRE", g: { type: "rectangle", x: 42, y: 12, w: 30, h: 14 }, capaciteTheorique: 0, surfaceStationnable: 30 * 14, stationnable: true, placeParking: false, ordre: 3 },
  { code: "PONT2", nom: "Pont élévateur", type: "PONT_ELEVATEUR", g: { type: "rectangle", x: 0, y: 14, w: 30, h: 5 }, capaciteTheorique: 1, surfaceStationnable: 30 * 5, stationnable: true, placeParking: false, ressourceTravail: true, ordre: 4 },
  { code: "BAT2-GARAGE", nom: "Ateliers / Bureaux", type: "BATIMENT", g: { type: "rectangle", x: 0, y: 20, w: 40, h: 10 }, stationnable: false, placeParking: false, ordre: 5 },
];

// Grille d'emplacements : (zoneRect, config) → spots
function genereSpots(zone: ZoneDef): { code: string; geometrie: Rect; ordre: number }[] {
  const { g, config } = zone;
  const cols = (config?.cols as number) ?? 1;
  const rows = (config?.rows as number) ?? 1;
  const spots: { code: string; geometrie: Rect; ordre: number }[] = [];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sw = g.w / cols;
      const sh = g.h / rows;
      const sx = g.x + c * sw;
      const sy = g.y + r * sh;
      spots.push({
        code: `${zone.code}-${String(n + 1).padStart(2, "0")}`,
        geometrie: { type: "rectangle", x: Number(sx.toFixed(3)), y: Number(sy.toFixed(3)), w: Number(sw.toFixed(3)), h: Number(sh.toFixed(3)) },
        ordre: n,
      });
      n++;
    }
  }
  return spots;
}

// ─── Registre — 47 véhicules (n°1→48, le n°33 n'existe pas) ──────────────────
// Champs du docx: N°, Véhicule, Plaque/Immat., Propriétaire/Client, Statut/Motif.
// « — » / vide → null. Rien n'est inventé.
type VehDef = {
  n: number;
  vehicule: string | null;
  immat: string | null;
  client: string | null;
  motif: string | null;
  statut?: ParkingVehicleStatus;
  dimensions?: { longueur: number; largeur: number };
  note?: string;
};

const VEHICULES: VehDef[] = [
  { n: 1, vehicule: "Land Cruiser", immat: "CE 5469 J", client: "M. MOÏSE DAN (5 ANS)", motif: "(Parking)", note: "Marqueurs 5 ANS : ancienneté à renseigner (dateEntree).", statut: "EN_PARKING", dimensions: { longueur: 4.9, largeur: 1.9 } },
  { n: 2, vehicule: "Kia Sorento", immat: "CE 560 BG", client: "Avocat", motif: "Remplacement moteur", statut: "EN_ATTENTE_PIECE", dimensions: { longueur: 4.8, largeur: 1.9 } },
  { n: 3, vehicule: "Pick Up Revo", immat: "CA 0807 E", client: "MINEPIA", motif: "Tôlerie", statut: "EN_TRAVAUX", dimensions: { longueur: 5.25, largeur: 1.85 } },
  { n: 4, vehicule: "Prado 120", immat: "CE 789 HN", client: "Employé SUDCAM", motif: "Venu pour réparation", statut: "EN_PARKING", dimensions: { longueur: 4.8, largeur: 1.9 } },
  { n: 5, vehicule: "Land Cruiser Blanche", immat: null, client: "Nations Unies", motif: "En attente du devis de réparation", statut: "EN_ATTENTE_DEVIS", dimensions: { longueur: 4.9, largeur: 1.9 } },
  { n: 6, vehicule: "Pick Up Revo", immat: "CA 3679 D", client: "MINEE", motif: "Parking", statut: "EN_PARKING", dimensions: { longueur: 5.25, largeur: 1.85 } },
  { n: 7, vehicule: "Berlingo Citroën", immat: "CE 307 KH", client: null, motif: "Voiture du garage GPJ", statut: "EN_PARKING", dimensions: { longueur: 4.4, largeur: 1.8 }, note: "Véhicule d'exploitation GPJ" },
  { n: 8, vehicule: "Suzuki Grise 4x4", immat: null, client: null, motif: "Voiture du garage GPJ", statut: "EN_PARKING", dimensions: { longueur: 4.1, largeur: 1.7 }, note: "Véhicule d'exploitation GPJ" },
  { n: 9, vehicule: "Pick Up Blanche Toyota Hilux", immat: "CE 493 GC", client: null, motif: "Problème mécanique déjà réglé (reste tôlerie) voir secrétaire pour infos supplémentaires", statut: "EN_TRAVAUX", dimensions: { longueur: 5.3, largeur: 1.8 } },
  { n: 10, vehicule: "Prado 120 Grise", immat: "CE 447 PB", client: null, motif: "voir secrétaire pour infos supplémentaires", statut: "DONNEES_INCOMPLETES", dimensions: { longueur: 4.8, largeur: 1.9 } },
  { n: 11, vehicule: "Pick Up Blanche", immat: "CE 918 HN", client: "AFOP", motif: "Problème moteur", statut: "EN_ATTENTE_PIECE", dimensions: { longueur: 5.0, largeur: 1.8 } },
  { n: 12, vehicule: "Peugeot noire", immat: "CE 491 GE", client: "SIANTOU", motif: "Problème moteur", statut: "EN_ATTENTE_PIECE" },
  { n: 13, vehicule: "RAV4 Hybrid", immat: "LT 813 SW", client: null, motif: "Problème de frein", statut: "EN_ATTENTE_DIAGNOSTIC", dimensions: { longueur: 4.6, largeur: 1.85 } },
  { n: 14, vehicule: "Cordon Blanche", immat: "CE 4420 Q", client: "YVAN", motif: null, statut: "EN_PARKING" },
  { n: 15, vehicule: "Prado Fortuner Grise", immat: "CE 286 GY", client: "CONAC", motif: "En attente du bon de commande (devis déjà fait)", statut: "EN_ATTENTE_PIECE", dimensions: { longueur: 4.8, largeur: 1.9 } },
  { n: 16, vehicule: "Prado Bleu / Land Cruiser", immat: "LT 7671 I", client: "M. FOUDA", motif: "Parking", statut: "EN_PARKING", dimensions: { longueur: 4.8, largeur: 1.9 } },
  { n: 17, vehicule: "Toyota Corolla Noire", immat: "CA 0074 D", client: "PRC", motif: "En attente diagnostic", statut: "EN_ATTENTE_DIAGNOSTIC", dimensions: { longueur: 4.6, largeur: 1.75 } },
  { n: 18, vehicule: "Hyundai noire", immat: "LT 398 LC", client: null, motif: "voir secrétaire pour infos supplémentaires", statut: "DONNEES_INCOMPLETES", dimensions: { longueur: 4.5, largeur: 1.8 } },
  { n: 19, vehicule: "RAV4 GRISE", immat: "CE 015 EX", client: "M. NDEMANOU", motif: "en vente", statut: "EN_VENTE", dimensions: { longueur: 4.6, largeur: 1.85 } },
  { n: 20, vehicule: "Nissan Verte", immat: "CE 9599 X", client: "PRC", motif: "Problème moteur", statut: "EN_ATTENTE_PIECE" },
  { n: 21, vehicule: "Pick Up Blanche Mitsubishi", immat: "CE 628 BY", client: "AFOP", motif: "En attente diagnostic", statut: "EN_ATTENTE_DIAGNOSTIC", dimensions: { longueur: 5.2, largeur: 1.8 } },
  { n: 22, vehicule: "Smart", immat: "CE 8301 S", client: "M. KAM DENIS", motif: "PB de démarrage", statut: "EN_ATTENTE_DIAGNOSTIC", dimensions: { longueur: 2.7, largeur: 1.6 } },
  { n: 23, vehicule: "Toyota Camry", immat: "057 AW", client: "Mm MADO", motif: "En vente", statut: "EN_VENTE", dimensions: { longueur: 4.9, largeur: 1.8 } },
  { n: 24, vehicule: "Prado Land Cruiser Grise VX V8", immat: "LT 188 CG", client: "HEVECAM", motif: "Problème moteur", statut: "EN_ATTENTE_PIECE", dimensions: { longueur: 4.95, largeur: 1.9 } },
  { n: 25, vehicule: "Pick Up Rouge", immat: null, client: "Personnel SUDCAM", motif: "Personnel SUDCAM", statut: "EN_PARKING", dimensions: { longueur: 5.0, largeur: 1.8 } },
  { n: 26, vehicule: "Pick Up Blanche", immat: null, client: "AFOP", motif: "Tôlerie", statut: "EN_TRAVAUX", dimensions: { longueur: 5.0, largeur: 1.8 } },
  { n: 27, vehicule: "Land Cruiser Prado Noire", immat: null, client: "Mutuelle Réunie", motif: "Accidentée", statut: "ACCIDENTE", dimensions: { longueur: 4.8, largeur: 1.9 } },
  { n: 28, vehicule: "Prado Land Cruiser VX", immat: null, client: "MINEE", motif: "Accidentée", statut: "ACCIDENTE", dimensions: { longueur: 4.8, largeur: 1.9 } },
  { n: 29, vehicule: "Prado Land Cruiser grise", immat: "LT 379 GW", client: null, motif: "Révision générale", statut: "EN_TRAVAUX", dimensions: { longueur: 4.8, largeur: 1.9 } },
  { n: 30, vehicule: "Ford", immat: "CE 756 HC", client: "SUDCAM", motif: "PB Boîte de vitesse", statut: "EN_ATTENTE_PIECE", dimensions: { longueur: 4.8, largeur: 1.8 } },
  { n: 31, vehicule: "Mercedes Noire", immat: "CE 544 FO", client: "M. ZAKI", motif: "PB moteur", statut: "EN_ATTENTE_PIECE" },
  { n: 32, vehicule: "Ford grise", immat: "LT 681 GC", client: "M. ETOUNDI", motif: "Problème démarrage", statut: "EN_ATTENTE_DIAGNOSTIC", dimensions: { longueur: 4.8, largeur: 1.8 } },
  // n°33 absent du registre
  { n: 34, vehicule: "Audi", immat: "CE 531 ML", client: "M. ABRAHAM", motif: "PB disque embrayage", statut: "EN_ATTENTE_PIECE", dimensions: { longueur: 4.7, largeur: 1.8 } },
  { n: 35, vehicule: "Nissan", immat: "CE 518 DV", client: "Mr Ngoh Ngoh / PRC", motif: "PB tableau de bord", statut: "EN_ATTENTE_PIECE" },
  { n: 36, vehicule: "Toyota Corolla Bleue", immat: "CH 02 6788", client: null, motif: "PB boîte de vitesse", statut: "EN_ATTENTE_PIECE", dimensions: { longueur: 4.6, largeur: 1.75 } },
  { n: 37, vehicule: "Peugeot Grise", immat: null, client: "AFOP", motif: "PB calculateur", statut: "EN_ATTENTE_PIECE" },
  { n: 38, vehicule: "Pick Up Blanche", immat: null, client: "M. Longchamp", motif: "Tôlerie & peinture", statut: "EN_TRAVAUX", dimensions: { longueur: 5.0, largeur: 1.8 } },
  { n: 39, vehicule: "Renault Mégane", immat: null, client: "Pasto", motif: "Parking", statut: "EN_PARKING", dimensions: { longueur: 4.3, largeur: 1.8 } },
  { n: 40, vehicule: "Land Cruiser", immat: "LT 318 KG", client: null, motif: "Pompe à injection", statut: "EN_ATTENTE_PIECE", dimensions: { longueur: 4.9, largeur: 1.9 } },
  { n: 41, vehicule: "Venza", immat: "CE 350 EV", client: "PRC", motif: "Problème moteur", statut: "EN_ATTENTE_PIECE", dimensions: { longueur: 4.8, largeur: 1.9 } },
  { n: 42, vehicule: "Pick Up Toyota Hilux", immat: "CE 602 DQ", client: "Pour le garage GPJ", motif: null, statut: "EN_PARKING", dimensions: { longueur: 5.3, largeur: 1.8 }, note: "Véhicule d'exploitation GPJ" },
  { n: 43, vehicule: "Pick Up Grise", immat: null, client: "IMPÔTS", motif: "prêt pour la peinture", statut: "EN_ATTENTE_PIECE", dimensions: { longueur: 5.0, largeur: 1.8 } },
  { n: 44, vehicule: "Land Cruiser Grise", immat: "CE 777 LB", client: "M. NYASSI", motif: "Problème moteur", statut: "EN_ATTENTE_PIECE", dimensions: { longueur: 4.9, largeur: 1.9 } },
  { n: 45, vehicule: "Lexus", immat: "08 6977", client: null, motif: null, statut: "DONNEES_INCOMPLETES", dimensions: { longueur: 4.9, largeur: 1.85 } },
  { n: 46, vehicule: "Porsche Noire", immat: null, client: null, motif: "Problème de radiateur", statut: "EN_ATTENTE_PIECE" },
  { n: 47, vehicule: "Jeep Grise", immat: null, client: "M. Bile", motif: null, statut: "DONNEES_INCOMPLETES", dimensions: { longueur: 4.5, largeur: 1.85 } },
  { n: 48, vehicule: "Jeep Noire", immat: "CE 366 ME", client: "FRANC CECO", motif: null, statut: "EN_PARKING", dimensions: { longueur: 4.5, largeur: 1.85 } },
];

function deriveMarque(vehicule: string | null): { marque: string | null; modele: string | null } {
  const v = vehicule ?? "";
  const MARQUES = ["Toyota", "Kia", "Citroën", "Suzuki", "Mitsubishi", "Peugeot", "Hyundai", "Nissan", "Smart", "Ford", "Mercedes", "Audi", "Renault", "Lexus", "Porsche", "Jeep"];
  for (const m of MARQUES) {
    if (v.toUpperCase().includes(m.toUpperCase())) return { marque: m, modele: v.replace(new RegExp(m, "i"), "").trim() || null };
  }
  // Pick Up / Land Cruiser / Prado / sans marque
  if (/PICK ?UP|HILUX|REVO|TOYOTA/i.test(v)) return { marque: "Toyota", modele: v.replace(/Pick Up/i, "").trim() || null };
  if (/LAND CRUISER|PRADO|RAV4|COROLLA|CAMRY|VENZA/i.test(v)) return { marque: "Toyota", modele: v.replace(/Land Cruiser/i, "Land Cruiser").trim() };
  if (/CORDON/.test(v)) return { marque: null, modele: v };
  return { marque: null, modele: v };
}

function main() {
  void (async () => {
    // 1. Agence de référence
    const [agence] = await db
      .select({ id: schema.agences.id, nom: schema.agences.nom, code: schema.agences.code })
      .from(schema.agences)
      .limit(1);
    if (!agence) throw new Error("Aucune agence trouvée — exécutez d'abord db:seed");

    // 2. Purge idempotente (ordre des FK descendants).
    //    Les véhicules ne sont purgés que si --vehicules est passé : sinon le
    //    registre réel en base serait écrasé par le jeu de démonstration.
    if (AVEC_VEHICULES) {
      await db.delete(schema.parkingMovements).where(eq(schema.parkingMovements.agenceId, agence.id));
      await db.delete(schema.parkingAlerts).where(eq(schema.parkingAlerts.agenceId, agence.id));
      await db.delete(schema.parkingTasks).where(eq(schema.parkingTasks.agenceId, agence.id));
      await db.delete(schema.parkingVehicles).where(eq(schema.parkingVehicles.agenceId, agence.id));
    }
    await db.delete(schema.parkingSpots).where(eq(schema.parkingSpots.agenceId, agence.id));
    await db.delete(schema.parkingZones).where(eq(schema.parkingZones.agenceId, agence.id));
    await db.delete(schema.parkingSites).where(eq(schema.parkingSites.agenceId, agence.id));
    await db.delete(schema.parkingConfigs).where(eq(schema.parkingConfigs.agenceId, agence.id));

    console.log(
      `Agence: ${agence.nom} (${agence.code}) — purge parking OK${AVEC_VEHICULES ? " (véhicules inclus)" : " (véhicules préservés)"}`,
    );

    // 3. Sites
    const [sitePrincipal] = await db.insert(schema.parkingSites).values({
      agenceId: agence.id,
      code: SITE_PRINCIPAL_CODE,
      nom: "GPJ — Site principal",
      description: "Garage Polyvalent Junior — plan manuscrit (géométrie nominale à calibrer sur site)",
      planLargeur: 100,
      planHauteur: 76,
      isPrimary: true,
    }).returning();
    const [siteSecondaire] = await db.insert(schema.parkingSites).values({
      agenceId: agence.id,
      code: SITE_SECONDAIRE_CODE,
      nom: "GPJ — Site secondaire",
      description: "Second site pour transferts (plan générique à valider)",
      planLargeur: 80,
      planHauteur: 30,
      isPrimary: false,
    }).returning();
    console.log(`Sites: ${sitePrincipal.code}, ${siteSecondaire.code}`);

    // 4. Zones + spots (principal puis secondaire)
    const zoneIdByCode = new Map<string, number>();
    for (const [site, zoneDefs] of [[sitePrincipal, ZONES_PRINCIPAL], [siteSecondaire, ZONES_SECONDAIRE]] as const) {
      for (const zd of zoneDefs) {
        const [zone] = await db.insert(schema.parkingZones).values({
          agenceId: agence.id,
          siteId: site.id,
          code: zd.code,
          nom: zd.nom,
          type: zd.type,
          geometrie: zd.g,
          capaciteTheorique: zd.capaciteTheorique ?? 0,
          surfaceStationnable: zd.surfaceStationnable ?? 0,
          orientationAutorisee: zd.orientationAutorisee ?? 0,
          margeSecurite: 0.3,
          stationnable: zd.stationnable ?? false,
          placeParking: zd.placeParking ?? false,
          ressourceTravail: zd.ressourceTravail ?? false,
          config: zd.config ?? {},
          ordre: zd.ordre ?? 0,
        }).returning();
        zoneIdByCode.set(`${site.code}:${zd.code}`, zone.id);

        if (zd.placeParking && zd.config) {
          const spots = genereSpots(zd);
          await db.insert(schema.parkingSpots).values(spots.map((s) => ({
            agenceId: agence.id,
            siteId: site.id,
            zoneId: zone.id,
            code: s.code,
            geometrie: s.geometrie,
            statut: "LIBRE",
            longueur: s.geometrie.w,
            largeur: s.geometrie.h,
            rotation: zd.orientationAutorisee ?? 0,
            ordre: s.ordre,
          })));
        }
      }
    }
    const totalSpots = await db.select({ count: schema.parkingSpots.id }).from(schema.parkingSpots).where(eq(schema.parkingSpots.agenceId, agence.id));
    console.log(`Zones: ${zoneIdByCode.size}, spots générés: ${totalSpots.length}`);

    // 5. Véhicules (non positionnés) — uniquement en mode --vehicules
    if (AVEC_VEHICULES) {
      let created = 0;
      for (const vd of VEHICULES) {
        const { marque, modele } = deriveMarque(vd.vehicule);
        await db.insert(schema.parkingVehicles).values({
          agenceId: agence.id,
          numRegistre: vd.n,
          marque: marque,
          modele: modele ?? vd.vehicule,
          immatriculation: vd.immat,
          clientNom: vd.client,
          statut: vd.statut ?? "EN_PARKING",
          motif: vd.motif,
          longueur: vd.dimensions?.longueur ?? null,
          largeur: vd.dimensions?.largeur ?? null,
          dimensionsEstimees: vd.dimensions ? true : false,
          provenance: vd.vehicule ?? null,
          notes: vd.note ?? null,
          // positionX/Y, siteId, zoneId, spotId volontairement NULL → « À placer »
        });
        created++;
      }
      console.log(`Véhicules créés: ${created} (registre 1→48 sans le 33)`);
    } else {
      console.log("Véhicules: préservés (mode plan seul — utilisez --vehicules pour insérer le jeu démo)");
    }

    // 6. Config moteur de règles (défauts GPJ)
    await db.insert(schema.parkingConfigs).values({
      agenceId: agence.id,
      seuilSansEvolutionJours: 15,
      seuilImmobilisationLongueJours: 90,
      seuilAttenteClientJours: 15,
      seuilAttentePieceJours: 15,
      seuilPretSortieJour: 3,
      seuilTransfertJours: 60,
      margeSecuriteDefaut: 0.3,
    });

    // 7. Auto-vérification
    const vehCount = ((await db.select({ count: sql<number>`count(*)` }).from(schema.parkingVehicles).where(eq(schema.parkingVehicles.agenceId, agence.id)))[0])?.count ?? 0;
    const siteCount = ((await db.select({ count: sql<number>`count(*)` }).from(schema.parkingSites).where(eq(schema.parkingSites.agenceId, agence.id)))[0])?.count ?? 0;
    console.log("\n=== RÉSULTAT SEED GARAGE ===");
    console.log(`Sites: ${siteCount}, Véhicules: ${vehCount}${AVEC_VEHICULES ? " (démo)" : " (réels conservés)"}`);
    if (AVEC_VEHICULES) {
      console.log(`Véhicules non positionnés (à placer): ${vehCount}`);
    } else {
      console.log(`Plan prêt: ${siteCount} site(s), spots gérés, véhicules existants intacts.`);
    }

    await client?.end().catch(() => {});
    process.exit(0);
  })().catch(async (err) => {
    console.error(err);
    await client?.end().catch(() => {});
    process.exit(1);
  });
}

main();