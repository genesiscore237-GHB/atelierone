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

// ─── Projection parking → immobilisation · SENS QUI FAIT FOI ──────────────
//
// ÉTAPE 3 — les quatre statuts qui n'avaient pas de vérité.
//
// Le mapping renvoyait `null` pour EN_VENTE, ACCIDENTE, A_TRANSFERER et
// DONNEES_INCOMPLETES, avec ce commentaire : « pas d'équivalent franc ».
//
// C'était une décision de prudence, et elle était fausse par ses effets. Un
// `null` veut dire « ne rien écrire » : le véhicule CONSERVE son dernier statut
// connu. Un véhicule passé en ACCIDENTE gardait donc `en_reception`, et l'agent
// lisait « accidenté » au parking et « en réception » à l'atelier — deux
// vérités contradictoires, sur le même véhicule, au même instant.
//
// Le refus d'inventer un statut est juste. Mais « ne rien écrire » n'est pas
// « ne rien inventer » : c'est laisser un statut faux subsister. Le pire des
// deux, parce qu'il est invisible.
//
// Les équivalents retenus sont des états RÉELS du métier, pas un remplissage :
//
//   ACCIDENTE           → accidente        immobilisé PAR SON ÉTAT ;
//                                         l'invisibiliser était absurde
//   EN_VENTE            → en_vente         hors flux atelier, mais au parc
//   A_TRANSFERER        → transfere_site2  la valeur existait déjà, orpheline
//   DONNEES_INCOMPLETES → en_reception     la voiture EST reçue ; c'est la
//                                         fiche qui est incomplète, pas la
//                                         présence au garage
export const PARKING_VERS_IMMOBILISATION: Readonly<Record<string, string | null>> = {
  EN_PARKING: "en_reception",
  EN_ATTENTE_DEVIS: "attente_validation_client",
  EN_ATTENTE_DIAGNOSTIC: "en_diagnostic",
  EN_ATTENTE_PIECE: "attente_piece_locale",
  EN_TRAVAUX: "en_reparation",
  TERMINE_A_RECUPERER: "terminee_client_non_venu",
  EN_VENTE: "en_vente",
  ACCIDENTE: "accidente",
  A_TRANSFERER: "transfere_site2",
  SORTI: "sorti",
  DONNEES_INCOMPLETES: "en_reception",
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
  transfere_site2: "A_TRANSFERER",
  abandonne_contentieux: null,
  accidente: "ACCIDENTE",
  en_vente: "EN_VENTE",
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

// ─── Sortie du parking (source de vérité unique, RD8 / lot S1) ───────────────

/**
 * LOT S1 (E12, RD8) — SORTIE RÉELLE d'un véhicule du registre parking.
 *
 * C'est LA logique unique de sortie, partagée par `garage.sortie` ET
 * `or.restituerVehicule`. Avant ce lot, la restitution d'un dossier d'atelier
 * ne faisait qu'un `UPDATE parking_vehicles SET statut='SORTI'` (projection) :
 * la place restait **réservée/bloquée** et **aucun mouvement SORTIE** n'était
 * journalisé (P0-3 : place fantôme, véhicule invisible à l'historique).
 *
 * Effets, identiques à l'ancienne procédure `garage.sortie` :
 *   1. le spot est libéré (`bloque = false`, `reserve_pour = NULL`) ;
 *   2. la ligne passe `SORTI` et perd sa position (site/zone/spot/centre) ;
 *   3. un mouvement `SORTIE` est écrit avec la position d'origine.
 *
 * IDEMPOTENCE : si aucune ligne parking n'est liée, ou si elle est déjà
 * `SORTI`, rien n'est fait (pas de double mouvement, pas d'erreur). La
 * restitution d'un dossier ne doit jamais échouer parce que le parking a déjà
 * été soldé par ailleurs.
 */
export async function sortirVehiculeParking(
  exec: Exec,
  params: {
    agenceId: number;
    userId?: number | null;
    /** Ligne du registre identifiée par son id (voie `garage.sortie`). */
    parkingVehicleId?: number | null;
    /** Véhicule canonique lié (voie `or.restituerVehicule`). */
    vehiculeId?: number | null;
    motif?: string | null;
    commentaire?: string | null;
  },
): Promise<{ applique: boolean; raison: "pas_de_ligne_parking" | "deja_sorti" | "sorti" }> {
  const cible =
    params.parkingVehicleId != null
      ? sql`id = ${params.parkingVehicleId}`
      : params.vehiculeId != null
        ? sql`vehicule_id = ${params.vehiculeId}`
        : null;
  if (!cible) return { applique: false, raison: "pas_de_ligne_parking" };

  // `FOR UPDATE` : deux sorties concurrentes du même véhicule ne peuvent pas
  // écrire deux mouvements SORTIE ni libérer un spot déjà réattribué.
  const lignes = (await exec.execute(sql`
    SELECT id, statut, spot_id, site_id, zone_id, centre_x, centre_y
    FROM parking_vehicles
    WHERE agence_id = ${params.agenceId} AND ${cible}
    ORDER BY id
    LIMIT 1
    FOR UPDATE`)) as unknown as {
      id: number;
      statut: string;
      spot_id: number | null;
      site_id: number | null;
      zone_id: number | null;
      centre_x: number | null;
      centre_y: number | null;
    }[];
  const v = lignes[0];
  if (!v) return { applique: false, raison: "pas_de_ligne_parking" };
  if (v.statut === "SORTI") return { applique: false, raison: "deja_sorti" };

  // 1. Libération du spot (no-op si le véhicule n'était pas positionné).
  if (v.spot_id != null) {
    await exec.execute(sql`
      UPDATE parking_spots
      SET bloque = false, reserve_pour = NULL, updated_at = now()
      WHERE id = ${v.spot_id}`);
  }
  // 2. Passage SORTI + effacement de la position.
  await exec.execute(sql`
    UPDATE parking_vehicles
    SET statut = 'SORTI', site_id = NULL, zone_id = NULL, spot_id = NULL,
        centre_x = NULL, centre_y = NULL, rotation = 0,
        updated_at = now(), date_derniere_action = now()
    WHERE id = ${v.id}`);
  // 3. Journal du mouvement (position d'origine conservée pour l'historique).
  await exec.execute(sql`
    INSERT INTO parking_movements
      (agence_id, vehicle_id, user_id, type,
       site_origine_id, zone_origine_id, position_origine_x, position_origine_y,
       motif, commentaire)
    VALUES (${params.agenceId}, ${v.id}, ${params.userId ?? null}, 'SORTIE',
            ${v.site_id}, ${v.zone_id}, ${v.centre_x}, ${v.centre_y},
            ${params.motif ?? null}, ${params.commentaire ?? "Sortie du parking"})`);
  return { applique: true, raison: "sorti" };
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
