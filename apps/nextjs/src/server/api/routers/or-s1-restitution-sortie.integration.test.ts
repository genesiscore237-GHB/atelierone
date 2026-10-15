/**
 * LOT S1 (E12, RD8) — La restitution d'un dossier d'ATELIER sort RÉELLEMENT
 * le véhicule du parking (fermeture du P0-3).
 *
 * Constat avant ce lot : `or.restituerVehicule` n'appelait que
 * `projeterParkingDepuisImmo(…, "sorti")`, c'est-à-dire un simple
 * `UPDATE parking_vehicles SET statut='SORTI'`. Conséquences :
 *   - la place restait `bloque = true` / `reserve_pour` → **place fantôme**,
 *     impossible à réattribuer au véhicule suivant ;
 *   - **aucun mouvement `SORTIE`** dans `parking_movements` → l'historique du
 *     parking ne retraçait pas la sortie ;
 *   - le véhicule restait positionné (site/zone/spot/centre).
 *
 * Garanties testées :
 *
 *  1. Restitution (voie `or.restituerVehicule`) : le spot est LIBÉRÉ
 *     (`bloque = false`, `reserve_pour = NULL`).
 *  2. La ligne parking passe `SORTI` et perd sa position (site/zone/spot/x/y).
 *  3. Un mouvement `SORTIE` est écrit avec la position d'origine.
 *  4. IDEMPOTENCE : restituer un dossier dont le véhicule a DÉJÀ été sorti du
 *     parking ne doit ni échouer, ni dupliquer le mouvement (une seule ligne
 *     `SORTIE` au journal).
 *  5. `garage.sortie` et `or.restituerVehicule` partagent désormais la MÊME
 *     logique (RD8) : après `garage.sortie`, la ligne n'est plus `SORTI` à la
 *     restitution… et surtout la restitution NE REFAIT PAS le travail.
 *  6. Un dossier dont le véhicule n'a AUCUNE ligne parking liée : la restitution
 *     réussit (aucune invention, pas d'échec artificiel).
 *
 * Fixtures RBAC réelles, namespace `s1restit` pour tourner en parallèle.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

// `next-auth` n'est pas resolvable hors de Next : on ne mocke QUE le transport
// d'authentification ; le RBAC (DB) reste réel.
vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { garageRouter } from "~/server/api/routers/garage-router";
import { sortirVehiculeParking } from "~/server/lib/parking-vehicule-service";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "s1restit";
const ROLE_CODE = `${NS}_or`;
const USER_EMAIL = `${NS}.or@gpj.cm`;
const SITE_CODE = `${NS}-SITE`;
const ZONE_CODE = `${NS}-ZONE`;
const SPOT_CODE = `${NS}-SPOT`;
const NUM_REGISTRE = 9501;

type Row = Record<string, unknown>;

let userId = 0;
let siteId = 0;
let zoneId = 0;
let spotId = 0;

/** Contexte forge « superadmin » : bypass `requirePermissionProcedure`. */
function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "S1 superadmin",
    email: USER_EMAIL,
    agenceId: 1,
    agenceName: "GPJ",
    organizationId: "1",
    role: "superadmin",
    permissions: [],
    isActive: true,
    status: "active",
  };
  return {
    headers: new Headers(),
    user,
    session: { user, expires: "2099-01-01T00:00:00.000Z" },
  } as never;
}

beforeAll(async () => {
  await retirer();

  await db.execute(
    sql`INSERT INTO roles (code, nom, description, niveau)
        VALUES (${ROLE_CODE}, 'LotS1 restitution', 'Fixture LotS1', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(
    sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`,
  )) as unknown as Row[];
  if (!role?.id) throw new Error(`Fixtures ${NS} : role ${ROLE_CODE} introuvable.`);

  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'LOTS1', 'Fixture', 1, ${role.id}::uuid, true, 'active')
        ON CONFLICT (email) DO NOTHING
        RETURNING id`,
  )) as unknown as Row[];
  userId = insere.length > 0 ? Number(insere[0].id) : 0;
  if (userId === 0) {
    const u = (await db.execute(
      sql`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`,
    )) as unknown as Row[];
    userId = Number(u[0]?.id);
  }
  if (!Number.isFinite(userId) || userId === 0) {
    throw new Error(`Fixtures ${NS} : utilisateur introuvable.`);
  }

  // Site / zone / spot de fixture (le parking est vide sur une base de test).
  const [site] = (await db.execute(
    sql`INSERT INTO parking_sites (agence_id, code, nom) VALUES (1, ${SITE_CODE}, 'Site S1') RETURNING id`,
  )) as unknown as Row[];
  siteId = Number(site?.id);
  const [zone] = (await db.execute(
    sql`INSERT INTO parking_zones (agence_id, site_id, code, nom, geometrie, type)
        VALUES (1, ${siteId}, ${ZONE_CODE}, 'Zone S1', '{"type":"RECT","points":[[0,0],[20,0],[20,10],[0,10]]}'::jsonb, 'AIRE_LIBRE')
        RETURNING id`,
  )) as unknown as Row[];
  zoneId = Number(zone?.id);
  const [spot] = (await db.execute(
    sql`INSERT INTO parking_spots (agence_id, site_id, zone_id, code, geometrie)
        VALUES (1, ${siteId}, ${zoneId}, ${SPOT_CODE}, '{"type":"RECT","centre":{"x":5,"y":5},"dimensions":{"longueur":5,"largeur":2.5}}'::jsonb)
        RETURNING id`,
  )) as unknown as Row[];
  spotId = Number(spot?.id);
  if (![siteId, zoneId, spotId].every(Number.isFinite)) {
    throw new Error(`Fixtures ${NS} : site/zone/spot non créés.`);
  }
});

beforeEach(async () => {
  await retirerDonnees();
});

afterAll(async () => {
  await retirer();
});

/** Purge des données de fixture (le RBAC et le site/zone/spot sont conservés). */
async function retirerDonnees(): Promise<void> {
  const pv = (await db.execute(
    sql`SELECT id FROM parking_vehicles WHERE num_registre = ${NUM_REGISTRE}`,
  )) as unknown as Row[];
  for (const v of pv) {
    await db.execute(sql`DELETE FROM parking_movements WHERE vehicle_id = ${v.id}`);
  }
  await db.execute(sql`DELETE FROM parking_vehicles WHERE num_registre = ${NUM_REGISTRE}`);

  const vehs = (await db.execute(
    sql`SELECT id FROM vehicules WHERE immat_norm LIKE 'S1RESTIT%' OR immatriculation LIKE 'S1RESTIT%'`,
  )) as unknown as Row[];
  for (const v of vehs) {
    await db.execute(sql`DELETE FROM ordres_reparation WHERE vehicule_id = ${v.id}`);
  }
  await db.execute(
    sql`DELETE FROM vehicules WHERE immat_norm LIKE 'S1RESTIT%' OR immatriculation LIKE 'S1RESTIT%'`,
  );
  await db.execute(sql`UPDATE parking_spots SET bloque = false, reserve_pour = NULL WHERE id = ${spotId}`);
}

/** Purge complète : données + RBAC + référentiel parking de fixture. */
async function retirer(): Promise<void> {
  await retirerDonnees();
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(
    sql`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code = ${ROLE_CODE})`,
  );
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`);
  if (spotId) await db.execute(sql`DELETE FROM parking_spots WHERE id = ${spotId}`);
  if (zoneId) await db.execute(sql`DELETE FROM parking_zones WHERE id = ${zoneId}`);
  if (siteId) await db.execute(sql`DELETE FROM parking_sites WHERE id = ${siteId}`);
  userId = 0;
}

/**
 * Crée un véhicule + sa ligne parking positionnée sur le spot de fixture
 * (le spot est marqué occupé/bloqué, comme après un placement réel).
 */
async function fixtureParking(immat: string, avecLigneParking: boolean): Promise<{ vehiculeId: number; parkingId: number }> {
  const [v] = (await db.execute(
    sql`INSERT INTO vehicules (agence_id, immatriculation, immat_norm, marque, statut_immobilisation)
        VALUES (1, ${immat}, ${immat}, 'LotS1', 'en_reparation')
        RETURNING id`,
  )) as unknown as Row[];
  const vehiculeId = Number(v.id);

  if (!avecLigneParking) return { vehiculeId, parkingId: 0 };

  const [p] = (await db.execute(
    sql`INSERT INTO parking_vehicles
          (agence_id, vehicule_id, num_registre, immatriculation, statut,
           site_id, zone_id, spot_id, centre_x, centre_y)
        VALUES (1, ${vehiculeId}, ${NUM_REGISTRE}, ${immat}, 'EN_TRAVAUX',
                ${siteId}, ${zoneId}, ${spotId}, 5, 5)
        RETURNING id`,
  )) as unknown as Row[];
  const parkingId = Number(p.id);
  // Le spot est occupé tant que le véhicule y est.
  await db.execute(sql`UPDATE parking_spots SET bloque = true, reserve_pour = ${parkingId} WHERE id = ${spotId}`);
  return { vehiculeId, parkingId };
}

/**
 * Ouvre un dossier et l'amène à « Préparé pour livraison ».
 * Cycle réel et Transitionnel : EN_ATTENTE_DIAGNOSTIC → EN_COURS →
 * CONTROLE_QUALITE → PRET_A_LIVRER (toute transition must be valid).
 */
/**
 * Client unique du fichier, résolu par téléphone.
 *
 * Tous les dossiers de ce lot appartiennent au même client. Depuis qu'un
 * doublon se signale au lieu de se créer en silence, le créer à chaque dossier
 * est refusé — à raison. On le résout donc : la première réception le crée,
 * les suivantes le retrouvent.
 */
const TEL_S1 = "690100888";

async function clientDuLot(): Promise<{ id: number } | { nom: string; telephone: string }> {
  const [row] = (await db.execute(sql`SELECT id FROM clients WHERE telephone = ${TEL_S1}`)) as unknown as Row[];
  return row ? { id: Number(row.id) } : { nom: `Client ${NS}`, telephone: TEL_S1 };
}

async function dossierPretALivrer(immat: string, avecLigneParking: boolean) {
  const orCaller = orRouter.createCaller(ctxSuperadmin());
  const { vehiculeId } = await fixtureParking(immat, avecLigneParking);
  const r = await orCaller.receptionner({
    client: await clientDuLot(),
    vehicule: { id: vehiculeId, immatriculation: immat },
    reception: { kilometrageEntree: 10000, pannesDeclarees: "Freins" },
  });
  for (const etape of ["EN_COURS", "CONTROLE_QUALITE", "PRET_A_LIVRER"] as const) {
    await orCaller.changerStatut({ id: r.id, nouveauStatut: etape as never, raison: `Lot S1 → ${etape}` });
  }
  return { orId: r.id, vehiculeId };
}

const lireParking = async (parkingId: number) =>
  ((await db.execute(
    sql`SELECT statut, site_id, zone_id, spot_id, centre_x, centre_y FROM parking_vehicles WHERE id = ${parkingId}`,
  )) as unknown as Row[])[0] ?? {};

const lireSpot = async () =>
  ((await db.execute(
    sql`SELECT bloque, reserve_pour FROM parking_spots WHERE id = ${spotId}`,
  )) as unknown as Row[])[0] ?? {};

const mouvementsSortie = async (parkingId: number) =>
  (await db.execute(
    sql`SELECT id, site_origine_id, zone_origine_id, position_origine_x, position_origine_y, motif, commentaire
        FROM parking_movements WHERE vehicle_id = ${parkingId} AND type = 'SORTIE'`,
  )) as unknown as Row[];

describe("LOT S1 — restitution d'OR = vraie sortie du parking (E12, RD8)", () => {
  it("1-3. la restitution libère le spot, efface la position et journalise SORTIE", async () => {
    const orCaller = orRouter.createCaller(ctxSuperadmin());
    const { orId, vehiculeId } = await dossierPretALivrer("S1RESTIT-001", true);
    const [pv] = (await db.execute(
      sql`SELECT id FROM parking_vehicles WHERE vehicule_id = ${vehiculeId}`,
    )) as unknown as Row[];
    const parkingId = Number(pv.id);

    // Avant : spot occupé et réservé au véhicule.
    expect((await lireSpot()).bloque).toBe(true);

    const r = await orCaller.restituerVehicule({
      orId,
      kilometrageSortie: 10500,
      checklist: [{ libelle: "État des lieux", ok: true }],
      recuperateurNom: "Recuperateur Test",
      signatureClient: "Signature test",
      sortieExceptionnelle: true,
      motifException: "Client impatient (test S1)",
      commentaireException: "Sortie exceptionnelle tracée pour le test S1.",
    });
    expect((r as any).success).toBe(true);
    expect((r as any).sortieParking).toBe("sorti");

    // (1) Spot libéré.
    const spot = await lireSpot();
    expect(spot.bloque).toBe(false);
    expect(spot.reserve_pour).toBeNull();

    // (2) Ligne SORTI et position effacée.
    const p = await lireParking(parkingId);
    expect(p.statut).toBe("SORTI");
    expect(p.site_id).toBeNull();
    expect(p.zone_id).toBeNull();
    expect(p.spot_id).toBeNull();
    expect(p.centre_x).toBeNull();
    expect(p.centre_y).toBeNull();

    // (3) Mouvement SORTIE journalisé avec la position d'origine.
    const mv = await mouvementsSortie(parkingId);
    expect(mv.length).toBe(1);
    expect(Number(mv[0].site_origine_id)).toBe(siteId);
    expect(Number(mv[0].position_origine_x)).toBe(5);
  });

  it("4. idempotence : sortir deux fois n'écrit qu'UN mouvement SORTIE", async () => {
    // Le helper partagé est directement rejoué : la 2ᵉ passe doit être un no-op.
    const { vehiculeId } = await fixtureParking("S1RESTIT-002", true);
    const [pv] = (await db.execute(
      sql`SELECT id FROM parking_vehicles WHERE vehicule_id = ${vehiculeId}`,
    )) as unknown as Row[];
    const parkingId = Number(pv.id);

    const r1 = await sortirVehiculeParking(db, { agenceId: 1, userId, vehiculeId });
    expect(r1).toEqual({ applique: true, raison: "sorti" });
    expect((await mouvementsSortie(parkingId)).length).toBe(1);

    const r2 = await sortirVehiculeParking(db, { agenceId: 1, userId, vehiculeId });
    expect(r2).toEqual({ applique: false, raison: "deja_sorti" });
    expect((await mouvementsSortie(parkingId)).length).toBe(1);
    // Le spot reste libéré (la 2ᵉ passe n'a rien réattribué).
    expect((await lireSpot()).bloque).toBe(false);
  });

  it("5. sortie parking puis nouvelle réception : la 2ᵉ sortie est légitime, pas un doublon", async () => {
    const garage = garageRouter.createCaller(ctxSuperadmin());
    const { vehiculeId } = await fixtureParking("S1RESTIT-003", true);
    const [pv] = (await db.execute(
      sql`SELECT id FROM parking_vehicles WHERE vehicule_id = ${vehiculeId}`,
    )) as unknown as Row[];
    const parkingId = Number(pv.id);

    // Sortie par le parking : le spot est libéré et la sortie journalisée.
    await garage.sortie({ vehicleId: parkingId });
    expect((await lireParking(parkingId)).statut).toBe("SORTI");
    expect((await lireSpot()).bloque).toBe(false);
    expect((await mouvementsSortie(parkingId)).length).toBe(1);

    // Le véhicule REVIENT à l'atelier : la réception réactive sa ligne
    // parking (projection d'état). C'est le comportement attendu — la sortie
    // précédente n'est pas définitive.
    const orCaller = orRouter.createCaller(ctxSuperadmin());
    const r = await orCaller.receptionner({
      client: await clientDuLot(),
      vehicule: { id: vehiculeId, immatriculation: "S1RESTIT-003" },
      reception: { kilometrageEntree: 20000, pannesDeclarees: "Freins" },
    });
    expect((await lireParking(parkingId)).statut).not.toBe("SORTI");

    for (const etape of ["EN_COURS", "CONTROLE_QUALITE", "PRET_A_LIVRER"] as const) {
      await orCaller.changerStatut({ id: r.id, nouveauStatut: etape as never, raison: `Lot S1 → ${etape}` });
    }
    const res = await orCaller.restituerVehicule({
      orId: r.id,
      kilometrageSortie: 20100,
      checklist: [{ libelle: "État des lieux", ok: true }],
      recuperateurNom: "Recuperateur Test",
      signatureClient: "Signature test",
      sortieExceptionnelle: true,
      motifException: "Client impatient (test S1)",
      commentaireException: "Sortie exceptionnelle tracée pour le test S1.",
    });
    expect((res as any).success).toBe(true);
    // La 2ᵉ sortie est un nouvel APPUI, pas un no-op : 2 mouvements SORTIE
    // (une par présence effective au parking).
    expect((res as any).sortieParking).toBe("sorti");
    expect((await mouvementsSortie(parkingId)).length).toBe(2);
  });

  it("5b. restitution d'un véhicule déjà sorti SANS nouvelle réception : no-op", async () => {
    const garage = garageRouter.createCaller(ctxSuperadmin());
    const { vehiculeId } = await fixtureParking("S1RESTIT-005", true);
    const [pv] = (await db.execute(
      sql`SELECT id FROM parking_vehicles WHERE vehicule_id = ${vehiculeId}`,
    )) as unknown as Row[];
    const parkingId = Number(pv.id);

    // Le véhicule sort du parking AVANT l'ouverture du dossier d'atelier.
    await garage.sortie({ vehicleId: parkingId });
    expect((await mouvementsSortie(parkingId)).length).toBe(1);

    // Dossier ouvert alors que le véhicule est déjà sorti : la restitution ne
    // doit ni échouer, ni réécrire un mouvement.
    const orCaller = orRouter.createCaller(ctxSuperadmin());
    const r = await orCaller.receptionner({
      client: await clientDuLot(),
      vehicule: { id: vehiculeId, immatriculation: "S1RESTIT-005" },
      reception: { kilometrageEntree: 30000, pannesDeclarees: "Freins" },
    });
    // On repasse la ligne en SORTI pour simuler l'état « déjà sorti » que la
    // restitution doit recevoir (la réception l'a remise en atelier).
    await db.execute(sql`UPDATE parking_vehicles SET statut = 'SORTI' WHERE id = ${parkingId}`);

    for (const etape of ["EN_COURS", "CONTROLE_QUALITE", "PRET_A_LIVRER"] as const) {
      await orCaller.changerStatut({ id: r.id, nouveauStatut: etape as never, raison: `Lot S1 → ${etape}` });
    }
    // (changerStatut vers CONTROLE_QUALITE réactive la ligne : on la remet SORTI)
    await db.execute(sql`UPDATE parking_vehicles SET statut = 'SORTI' WHERE id = ${parkingId}`);

    const res = await orCaller.restituerVehicule({
      orId: r.id,
      kilometrageSortie: 30100,
      checklist: [{ libelle: "État des lieux", ok: true }],
      recuperateurNom: "Recuperateur Test",
      signatureClient: "Signature test",
      sortieExceptionnelle: true,
      motifException: "Client impatient (test S1)",
      commentaireException: "Sortie exceptionnelle tracée pour le test S1.",
    });
    expect((res as any).success).toBe(true);
    expect((res as any).sortieParking).toBe("deja_sorti");
    expect((await mouvementsSortie(parkingId)).length).toBe(1);
  });

  it("6. un véhicule sans ligne parking : la restitution réussit quand même", async () => {
    const orCaller = orRouter.createCaller(ctxSuperadmin());
    const { orId } = await dossierPretALivrer("S1RESTIT-004", false);

    const r = await orCaller.restituerVehicule({
      orId,
      kilometrageSortie: 10200,
      checklist: [{ libelle: "État des lieux", ok: true }],
      recuperateurNom: "Recuperateur Test",
      signatureClient: "Signature test",
      sortieExceptionnelle: true,
      motifException: "Client impatient (test S1)",
      commentaireException: "Sortie exceptionnelle tracée pour le test S1.",
    });
    // Aucune invention : le dossier sort, le parking n'a simplement rien à faire.
    expect((r as any).success).toBe(true);
    expect((r as any).sortieParking).toBe("pas_de_ligne_parking");
  });
});
