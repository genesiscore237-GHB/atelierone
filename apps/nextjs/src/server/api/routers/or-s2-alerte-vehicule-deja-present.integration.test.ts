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

/** Véhicule + ligne parking positionnée, dans un statut donné. */
async function fixtureParking(immat: string, statutParking: string): Promise<number> {
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
  return vehiculeId;
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
    const vehiculeId = await fixtureParking("S2ALERTE-004", "SORTI");
    // On reproduit l'état hérité : la place reste bloquée pour ce véhicule.
    await db.execute(sql`UPDATE parking_spots SET bloque = true, reserve_pour = ${vehiculeId} WHERE id = ${spotId}`);

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

    const avant = (await db.execute(
      sql`SELECT count(*)::int AS n FROM ordres_reparation`,
    )) as unknown as { n: number }[];
    await caller.situationParking({ vehiculeId });
    await caller.situationParking({ vehiculeId });
    const apres = (await db.execute(
      sql`SELECT count(*)::int AS n FROM ordres_reparation`,
    )) as unknown as { n: number }[];

    expect(Number(apres[0].n)).toBe(Number(avant[0].n));
  });
});