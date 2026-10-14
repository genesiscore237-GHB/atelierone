import { sql, type SQL } from "drizzle-orm";

/**
 * LOT 1 — Service de liaison registre parking ↔ véhicule canonique.
 *
 * Décision actée : « projection synchronisée ». Les 11 statuts du registre
 * parking restent le vocabulaire de l'UI parking ; `vehicules.statut_immobilisation`
 * est projeté depuis/vers ce vocabulaire via les deux tables ci-dessous.
 * Une valeur `null` = pas d'équivalent exact → LA PROJECTION NE SE FAIT PAS
 * (aucun état inventé, principe GPJ).
 *
 * Tables tenues à jour en parallèle du CASE de
 * packages/db/src/migrate-parking-vehicules.ts (backfill).
 */

type Exec = { execute(query: SQL): Promise<unknown> };

type Lignes = { id: number | string }[];

// ─── Projection parking → immobilisation ─────────────────────────────────────

export const PARKING_VERS_IMMOBILISATION: Readonly<Record<string, string | null>> = {
  EN_PARKING: "en_reception",
  EN_ATTENTE_DEVIS: "attente_validation_client",
  EN_ATTENTE_DIAGNOSTIC: "en_diagnostic",
  EN_ATTENTE_PIECE: "attente_piece_locale",
  EN_TRAVAUX: "en_reparation",
  TERMINE_A_RECUPERER: "terminee_client_non_venu",
  EN_VENTE: null,
  ACCIDENTE: null,
  A_TRANSFERER: null,
  SORTI: "sorti",
  DONNEES_INCOMPLETES: null,
};

// ─── Projection immobilisation → parking (sens retour) ──────────────────────

export const IMMOBILISATION_VERS_PARKING: Readonly<Record<string, string | null>> = {
  en_reception: "EN_PARKING",
  en_diagnostic: "EN_ATTENTE_DIAGNOSTIC",
  en_reparation: "EN_TRAVAUX",
  attente_validation_client: "EN_ATTENTE_DEVIS",
  attente_piece_locale: "EN_ATTENTE_PIECE",
  piece_commandee_import: "EN_ATTENTE_PIECE",
  terminee_attente_paiement: "TERMINE_A_RECUPERER",
  terminee_client_non_venu: "TERMINE_A_RECUPERER",
  transfere_site2: null,
  abandonne_contentieux: null,
  sorti: "SORTI",
};

export function immobilisationDepuisParking(statut: string | null | undefined): string | null {
  if (!statut) return null;
  return PARKING_VERS_IMMOBILISATION[statut] ?? null;
}

export function parkingDepuisImmobilisation(statut: string | null | undefined): string | null {
  if (!statut) return null;
  return IMMOBILISATION_VERS_PARKING[statut] ?? null;
}

/** Normalisation d'immatriculation utilisée pour l'appariement (côté JS). */
export function normaliserImmatriculation(immat: string | null | undefined): string {
  return (immat ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

// ─── Projection des statuts ─────────────────────────────────────────────────

/**
 * Après écriture de `parking_vehicles.statut` : pousse vers le véhicule
 * canonique lié. No-op si non lié ou si le statut n'a pas d'équivalent.
 */
export async function projeterImmoDepuisParking(
  exec: Exec,
  vehiculeId: number | null | undefined,
  statutParking: string | null | undefined,
): Promise<void> {
  const immo = immobilisationDepuisParking(statutParking);
  if (!vehiculeId || !immo) return;
  await exec.execute(sql`
    UPDATE vehicules
    SET statut_immobilisation = ${immo}, updated_at = now()
    WHERE id = ${vehiculeId} AND coalesce(statut_immobilisation, '') <> ${immo}`);
}

/**
 * Après écriture de `vehicules.statut_immobilisation` : pousse vers toutes les
 * lignes du registre parking liées. No-op sans équivalent exact.
 */
export async function projeterParkingDepuisImmo(
  exec: Exec,
  vehiculeId: number | null | undefined,
  statutImmo: string | null | undefined,
): Promise<void> {
  const statut = parkingDepuisImmobilisation(statutImmo);
  if (!vehiculeId || !statut) return;
  await exec.execute(sql`
    UPDATE parking_vehicles
    SET statut = ${statut}, updated_at = now()
    WHERE vehicule_id = ${vehiculeId} AND statut <> ${statut}`);
}

// ─── Liaison (création / recherche du canonique) ────────────────────────────

/**
 * Trouve le véhicule canonique de l'agence dont l'immatriculation normalisée
 * correspond, ou le crée à partir des données du registre (aucune invention :
 * sans immatriculation, retourne null). Si le canonique est créé, son
 * `statut_immobilisation` est projeté depuis le statut parking ; s'il existe
 * déjà, son état atelier fait foi (jamais écrasé).
 */
export async function trouverOuCreerCanonique(
  exec: Exec,
  params: {
    agenceId: number;
    immatriculation: string | null | undefined;
    marque?: string | null;
    modele?: string | null;
    version?: string | null;
    couleur?: string | null;
    vin?: string | null;
    statutParking?: string | null;
    notes?: string | null;
  },
): Promise<number | null> {
  const brut = (params.immatriculation ?? "").trim();
  if (!brut) return null;
  const norm = normaliserImmatriculation(brut);

  // LOT R1 — l'appariement se fait sur la forme NORMALISÉE de la plaque, en
  // calculant la normalisation à la volée depuis `immatriculation` plutôt
  // qu'en s'appuyant uniquement sur la colonne dérivée `immat_norm` : les
  // lignes préexistantes (fixtures, backfill) peuvent avoir `immat_norm` à
  // NULL tant que le script dedup-vehicules-immat n'a pas tourné, et il faut
  // malgré tout les retrouver pour éviter un doublon. `immat_norm` (indexée)
  // sert de tri : quand plusieurs lignes portent la même plaque normalisée,
  // on privilégie celle dont la colonne dérivée est déjà renseignée, puis la
  // plus ancienne (id croissant).
  const existants = (await exec.execute(sql`
    SELECT id FROM vehicules
    WHERE agence_id = ${params.agenceId}
      AND immatriculation IS NOT NULL
      AND upper(regexp_replace(btrim(immatriculation), '\s+', '', 'g')) = ${norm}
    ORDER BY (immat_norm IS NULL), id
    LIMIT 1`)) as unknown as Lignes;
  if (existants[0]) return Number(existants[0].id);

  const crees = (await exec.execute(sql`
    INSERT INTO vehicules (agence_id, immatriculation, immat_norm, marque, modele, version, couleur,
                           numero_chassis, statut_immobilisation, notes)
    VALUES (${params.agenceId}, ${brut}, ${norm}, ${params.marque ?? null}, ${params.modele ?? null},
            ${params.version ?? null}, ${params.couleur ?? null}, ${params.vin ?? null},
            ${immobilisationDepuisParking(params.statutParking)}, ${params.notes ?? null})
    RETURNING id`)) as unknown as Lignes;
  return crees[0] ? Number(crees[0].id) : null;
}

// ─── Synchronisation de l'identité partagée ─────────────────────────────────

/**
 * Identité registre → canonique. Seules les valeurs renseignées sont
 * propagées (jamais d'effacement silencieux d'un champ canonique plus riche).
 */
export async function synchroniserIdentiteCanonique(
  exec: Exec,
  vehiculeId: number | null | undefined,
  i: {
    marque?: string | null;
    modele?: string | null;
    version?: string | null;
    couleur?: string | null;
    vin?: string | null;
  },
): Promise<void> {
  if (!vehiculeId) return;
  const fourni = [i.marque, i.modele, i.version, i.couleur, i.vin].some((v) => v != null);
  if (!fourni) return;
  await exec.execute(sql`
    UPDATE vehicules SET
      marque = coalesce(${i.marque ?? null}, marque),
      modele = coalesce(${i.modele ?? null}, modele),
      version = coalesce(${i.version ?? null}, version),
      couleur = coalesce(${i.couleur ?? null}, couleur),
      numero_chassis = coalesce(${i.vin ?? null}, numero_chassis),
      updated_at = now()
    WHERE id = ${vehiculeId}`);
}

/**
 * Identité canonique → registre parking (lignes liées). Même règle : valeurs
 * renseignées uniquement.
 */
export async function synchroniserIdentiteParking(
  exec: Exec,
  vehiculeId: number | null | undefined,
  i: {
    marque?: string | null;
    modele?: string | null;
    version?: string | null;
    couleur?: string | null;
    vin?: string | null;
  },
): Promise<void> {
  if (!vehiculeId) return;
  const fourni = [i.marque, i.modele, i.version, i.couleur, i.vin].some((v) => v != null);
  if (!fourni) return;
  await exec.execute(sql`
    UPDATE parking_vehicles SET
      marque = coalesce(${i.marque ?? null}, marque),
      modele = coalesce(${i.modele ?? null}, modele),
      version = coalesce(${i.version ?? null}, version),
      couleur = coalesce(${i.couleur ?? null}, couleur),
      vin = coalesce(${i.vin ?? null}, vin),
      updated_at = now()
    WHERE vehicule_id = ${vehiculeId}`);
}
