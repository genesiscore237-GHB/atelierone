/**
 * LOT S2 (E13) — Alerte « véhicule déjà présent ».
 *
 * Réceptionner un véhicule qui est DÉJÀ enregistré au garage n'est pas une
 * erreur, mais c'est une information que le formulaire ne donnait pas :
 * l'agent pouvait croire qu'il faisait entrer un véhicule neuf alors que la
 * place existe déjà, ou ouvrir un second dossier sans le voir.
 *
 * Garanties testées :
 *
 *  1. VÉHICULE DÉJÀ PRÉSENT : ligne parking active → signalé, avec n° de
 *     registre, place et zone (l'agent sait où il est).
 *  2. Dossier déjà en cours sur ce véhicule → signalé séparément.
 *  3. VÉHICULE SORTI : plus « présent » — la sortie (S1) libère réellement.
 *  4. PLACE FANTÔME : ligne SORTI dont la place reste bloquée → signalée.
 *     Cette donnée ne peut plus être créée par le code (corrigée en S1), mais
 *     elle peut exister sur des données antérieures : on la montre au lieu de
 *     la masquer.
 *  5. Véhicule inconnu / aucune ligne parking → aucune alerte.
 *  6. La requête n'ÉCRIT RIEN (lecture seule) : l'appeler ne doit pas créer
 *     de dossier ni modifier le parking.
 *
 * Fixtures RBAC réelles, namespace `s2alerte`.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "s2alerte";
const ROLE_CODE = `${NS}_or`;
const USER_EMAIL = `${NS}.or@gpj.cm`;
const NUM_REGISTRE = 9701;

type Row = Record<string, unknown>;

let userId = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "S2 superadmin",
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
        VALUES (${ROLE_CODE}, 'LotS2 alerte', 'Fixture LotS2', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[];
  if (!role?.id) throw new Error(`Fixtures ${NS} : rôle introuvable.`);
  const u = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'S2ALR', 'Fixture', 1, ${role.id}::uuid, true, 'active')
        ON CONFLICT (email) DO NOTHING
        RETURNING id`,
  )) as unknown as Row[];
  userId = u.length > 0 ? Number(u[0].id) : 0;
  if (userId === 0) {
    const v = (await db.execute(sql`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`)) as unknown as Row[];
    userId = Number(v[0]?.id);
  }
  if (!Number.isFinite(userId) || userId === 0) throw new Error(`Fixtures ${NS} : utilisateur introuvable.`);
});

beforeEach(retirerDonnees);
afterAll(retirer);

let siteId = 0;
let zoneId = 0;
let spotId = 0;

async function retirerDonnees(): Promise<void> {
  const pv = (await db.execute(
    sql`SELECT id FROM parking_vehicles WHERE num_registre = ${NUM_REGISTRE}`,
  )) as unknown as Row[];
  for (const v of pv) {
    await db.execute(sql`DELETE FROM parking_movements WHERE vehicle_id = ${v.id}`);
  }
  await db.execute(sql`DELETE FROM parking_vehicles WHERE num_registre = ${NUM_REGISTRE}`);
  await db.execute(sql`UPDATE parking_spots SET bloque = false, reserve_pour = NULL WHERE id = ${spotId}`);

  const vehs = (await db.execute(
    sql`SELECT id FROM vehicules WHERE immat_norm LIKE 'S2ALERTE%' OR immatriculation LIKE 'S2ALERTE%'`,
  )) as unknown as Row[];
  for (const v of vehs) {
    await db.execute(sql`DELETE FROM ordres_reparation WHERE vehicule_id = ${v.id}`);
  }
  await db.execute(sql`DELETE FROM vehicules WHERE immat_norm LIKE 'S2ALERTE%' OR immatriculation LIKE 'S2ALERTE%'`);
  await db.execute(sql`DELETE FROM clients WHERE nom = 'Client S2alerte'`);
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
}

async function retirer(): Promise<void> {
  await retirerDonnees();
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(sql`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code = ${ROLE_CODE})`);
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`);
  userId = 0;
}

/** Site / zone / spot de fixture, créés une seule fois. */
async function assurerReferentiel(): Promise<void> {
  if (spotId) return;
  const [site] = (await db.execute(
    sql`INSERT INTO parking_sites (agence_id, code, nom) VALUES (1, 'S2ALERTE-SITE', 'Site S2') RETURNING id`,
  )) as unknown as Row[];
  siteId = Number(site?.id);
  const [zone] = (await db.execute(
    sql`INSERT INTO parking_zones (agence_id, site_id, code, nom, geometrie, type)
        VALUES (1, ${siteId}, 'S2ALERTE-ZONE', 'Zone S2', '{"type":"RECT","points":[[0,0],[20,0],[20,10],[0,10]]}'::jsonb, 'AIRE_LIBRE')
        RETURNING id`,
  )) as unknown as Row[];
  zoneId = Number(zone?.id);
  const [spot] = (await db.execute(
    sql`INSERT INTO parking_spots (agence_id, site_id, zone_id, code, geometrie)
        VALUES (1, ${siteId}, ${zoneId}, 'S2ALERTE-SPOT', '{"type":"RECT","centre":{"x":5,"y":5},"dimensions":{"longueur":5,"largeur":2.5}}'::jsonb)
        RETURNING id`,
  )) as unknown as Row[];
  spotId = Number(spot?.id);
}

/**
 * Véhicule + ligne parking positionnée, dans un statut donné.
 * La convention réelle du code de production est respectée ici :
 * `parking_spots.reserve_pour` reçoit le **parking_vehicles.id** de la ligne
 * (`garage.place`), et non le `vehicules.id`.
 */
async function fixtureParking(immat: string, statutParking: string): Promise<number> {
  return (await fixtureParkingLigne(immat, statutParking)).vehiculeId;
}

/** Idem, en exposant aussi l'id de la ligne parking créée. */
async function fixtureParkingLigne(
  immat: string,
  statutParking: string,
): Promise<{ vehiculeId: number; parkingId: number }> {
  await assurerReferentiel();
  const [v] = (await db.execute(
    sql`INSERT INTO vehicules (agence_id, immatriculation, immat_norm, marque, statut_immobilisation)
        VALUES (1, ${immat}, ${immat}, 'LotS2', 'en_reparation')
        RETURNING id`,
  )) as unknown as Row[];
  const vehiculeId = Number(v.id);
  const [p] = (await db.execute(
    sql`INSERT INTO parking_vehicles
          (agence_id, vehicule_id, num_registre, immatriculation, statut, site_id, zone_id, spot_id, centre_x, centre_y)
        VALUES (1, ${vehiculeId}, ${NUM_REGISTRE}, ${immat}, ${statutParking}, ${siteId}, ${zoneId}, ${spotId}, 5, 5)
        RETURNING id`,
  )) as unknown as Row[];
  await db.execute(sql`UPDATE parking_spots SET bloque = true, reserve_pour = ${p.id} WHERE id = ${spotId}`);
  return { vehiculeId, parkingId: Number(p.id) };
}

/**
 * Ajoute une ligne parking SUPPLÉMENTAIRE sur un véhicule déjà présent,
 * sans toucher au spot (simule un second passage au garage).
 */
async function ajouterLigneParking(
  vehiculeId: number,
  immat: string,
  statut: string,
  avecSpot: boolean,
): Promise<number> {
  await assurerReferentiel();
  const [p] = (await db.execute(
    sql`INSERT INTO parking_vehicles
          (agence_id, vehicule_id, num_registre, immatriculation, statut, site_id, zone_id, spot_id, centre_x, centre_y)
        VALUES (1, ${vehiculeId}, ${NUM_REGISTRE}, ${immat}, ${statut}, ${siteId}, ${zoneId},
                ${avecSpot ? spotId : null}, 5, 5)
        RETURNING id`,
  )) as unknown as Row[];
  return Number(p.id);
}

describe("LOT S2 — alerte « véhicule déjà présent »", () => {
  it("1. véhicule au garage : présence signalée avec n° de registre et place", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const vehiculeId = await fixtureParking("S2ALERTE-001", "EN_TRAVAUX");

    const s = await caller.situationParking({ vehiculeId });
    expect(s.dejaPresent).toBe(true);
    expect(s.ligne).not.toBeNull();
    expect(s.ligne!.numRegistre).toBe(NUM_REGISTRE);
    expect(s.ligne!.spotCode).toBe("S2ALERTE-SPOT");
    expect(s.ligne!.zoneNom).toBe("Zone S2");
    expect(s.ligne!.statut).toBe("EN_TRAVAUX");
  });

  it("2. dossier déjà en cours : signalé séparément", async () => {
    const orCaller = orRouter.createCaller(ctxSuperadmin());
    const vehiculeId = await fixtureParking("S2ALERTE-002", "EN_TRAVAUX");
    const r = await orCaller.receptionner({
      client: { nom: "Client S2alerte", telephone: "690100300" },
      vehicule: { id: vehiculeId, immatriculation: "S2ALERTE-002" },
      reception: { kilometrageEntree: 1000, pannesDeclarees: "Freins" },
    });

    const s = await orCaller.situationParking({ vehiculeId });
    expect(s.dossierOuvert).toBe(true);
    expect(s.dossier!.id).toBe(r.id);
    expect(s.dossier!.numero).toBeTruthy();
  });

  it("3. véhicule SORTI : plus « présent » (la sortie S1 libère)", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const vehiculeId = await fixtureParking("S2ALERTE-003", "SORTI");
    // Le spot a bien été libéré : pas de place fantôme.
    await db.execute(sql`UPDATE parking_spots SET bloque = false, reserve_pour = NULL WHERE id = ${spotId}`);

    const s = await caller.situationParking({ vehiculeId });
    expect(s.dejaPresent).toBe(false);
    expect(s.placeFantome).toBe(false);
  });

  it("4. place fantôme : ligne SORTI dont la place reste bloquée", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const { vehiculeId, parkingId } = await fixtureParkingLigne("S2ALERTE-004", "SORTI");
    // On reproduit l'état hérité : la place reste bloquée pour ce véhicule.
    //
    // `reserve_pour` porte un `parking_vehicles.id` — c'est ce qu'écrit
    // `garage.place`. La version initiale de ce test y mettait le
    // `vehicules.id` : test et implémentation partageaient la même faute,
    // et le 6/6 vert ne prouvait rien.
    await db.execute(
      sql`UPDATE parking_spots SET bloque = true, reserve_pour = ${parkingId} WHERE id = ${spotId}`,
    );

    const s = await caller.situationParking({ vehiculeId });
    expect(s.dejaPresent).toBe(false);
    expect(s.placeFantome).toBe(true);
  });

  it("5. véhicule inconnu : aucune alerte", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const s = await caller.situationParking({ vehiculeId: null });
    expect(s.dejaPresent).toBe(false);
    expect(s.dossierOuvert).toBe(false);
    expect(s.placeFantome).toBe(false);
    expect(s.ligne).toBeNull();
  });

  it("6. la requête n'écrit RIEN", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const vehiculeId = await fixtureParking("S2ALERTE-006", "EN_TRAVAUX");

    // On mesure le périmètre de CETTE requête (les dossiers du véhicule), et
    // non `count(*) FROM ordres_reparation` sur toute la base : les fichiers de
    // test tournent en parallèle et créent leurs propres dossiers, donc le
    // décompte global bouge sans que la requête ait rien écrit. Le test
    // vérifiait le passage à côté de ce qu'il prétendait vérifier.
    const dossiersDe = async () => {
      const lignes = (await db.execute(
        sql`SELECT count(*)::int AS n FROM ordres_reparation WHERE vehicule_id = ${vehiculeId}`,
      )) as unknown as { n: number }[];
      return Number(lignes[0].n);
    };

    const avant = await dossiersDe();
    await caller.situationParking({ vehiculeId });
    await caller.situationParking({ vehiculeId });
    expect(await dossiersDe()).toBe(avant);

    // Aucune écriture côté parking non plus.
    const spots = (await db.execute(
      sql`SELECT reserve_pour FROM parking_spots WHERE id = ${spotId}`,
    )) as unknown as { reserve_pour: number | null }[];
    expect(Number(spots[0].reserve_pour)).toBeGreaterThan(0);
  });

  // ── Régressions ajoutées après revue du 2026-10-15 ─────────────────────────
  //
  // `parking_vehicles.vehicule_id` n'est PAS unique : un véhicule a autant de
  // lignes que de passages au garage. La requête retenait `ORDER BY pv.id`
  // (la plus ancienne), donc un véhicule sorti en 2023 puis revenu en 2026
  // était annoncé ABSENT alors qu'il occupait une place. Une alerte de
  // sécurité qui manque en silence est pire que pas d'alerte.

  it("7. historique de passages : une ancienne ligne SORTI ne masque pas la ligne active", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const { vehiculeId } = await fixtureParkingLigne("S2ALERTE-007", "EN_TRAVAUX");
    // Second passage : l'ancienne ligne est sortie, la nouvelle est en atelier.
    await ajouterLigneParking(vehiculeId, "S2ALERTE-007", "SORTI", false);
    const parkingActifId = await ajouterLigneParking(vehiculeId, "S2ALERTE-007", "EN_TRAVAUX", true);
    await db.execute(
      sql`UPDATE parking_spots SET bloque = true, reserve_pour = ${parkingActifId} WHERE id = ${spotId}`,
    );

    const s = await caller.situationParking({ vehiculeId });
    expect(s.dejaPresent).toBe(true);
    expect(s.ligne!.parkingId).toBe(parkingActifId);
    expect(s.placeFantome).toBe(false);
  });

  it("8. toutes les lignes SORTI : la plus récente fait foi", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const { vehiculeId } = await fixtureParkingLigne("S2ALERTE-008", "SORTI");
    await db.execute(sql`UPDATE parking_spots SET bloque = false, reserve_pour = NULL WHERE id = ${spotId}`);
    const derniereSortie = await ajouterLigneParking(vehiculeId, "S2ALERTE-008", "SORTI", false);

    const s = await caller.situationParking({ vehiculeId });
    expect(s.dejaPresent).toBe(false);
    expect(s.placeFantome).toBe(false);
    expect(s.ligne!.parkingId).toBe(derniereSortie);
  });

  it("9. place réservée par un AUTRE véhicule : pas de faux positif de place fantôme", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    // Véhicule A sorti, sa ligne porte encore son spot.
    const { vehiculeId: a } = await fixtureParkingLigne("S2ALERTE-009A", "SORTI");
    const parkingA = (await db.execute(
      sql`SELECT id FROM parking_vehicles WHERE vehicule_id = ${a} AND statut = 'SORTI' LIMIT 1`,
    )) as unknown as Row[];
    // Véhicule B sorti ensuite : c'est SA ligne qui réserve le spot partagé.
    const { vehiculeId: b } = await fixtureParkingLigne("S2ALERTE-009B", "SORTI");
    const parkingB = (await db.execute(
      sql`SELECT id FROM parking_vehicles WHERE vehicule_id = ${b} AND statut = 'SORTI' LIMIT 1`,
    )) as unknown as Row[];
    await db.execute(
      sql`UPDATE parking_spots SET bloque = false, reserve_pour = ${Number(parkingB[0].id)} WHERE id = ${spotId}`,
    );

    // A n'est plus responsable du spot : sa place n'est pas fantôme.
    const sA = await caller.situationParking({ vehiculeId: a });
    expect(sA.placeFantome).toBe(false);
    // B en porte encore la réservation : c'est B le fantôme.
    const sB = await caller.situationParking({ vehiculeId: b });
    expect(sB.placeFantome).toBe(true);
    expect(parkingA[0].id).not.toBe(parkingB[0].id);
  });
});