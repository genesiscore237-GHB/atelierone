/**
 * P1.1 — la colonne « Emplacement » du registre garage.
 *
 * L'écran garage lit `v.site` / `v.zone` / `v.spot` depuis son introduction.
 * `garage.vehicles` ne renvoyait que `siteId` / `zoneId` / `spotId` — des
 * entiers. Les trois noms n'étaient donc **jamais** présents, et la colonne
 * tombait systématiquement sur « Non défini » : un véhicule parfaitement
 * placé dans une zone connue s'affichait comme non positionné.
 *
 * C'est le genre de défaut qui ne s'annonce pas. Rien ne casse, aucun test
 * n'échoue, aucune erreur Vercel : la colonne affiche simplement une chose
 * fausse, depuis toujours, à chaque ligne.
 *
 * Le nom lisible n'existe pas sur `parking_vehicles` : il faut joindre
 * `parking_sites`, `parking_zones`, `parking_spots`. C'est ce que fait déjà
 * `garage.exportVehicules` — l'export affichait la place, l'écran non.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import postgres from "postgres";
import { garageRouter } from "~/server/api/routers/garage-router";
import { db } from "~/server/db";

const NS = "p1pos";
const AGENCE = 1;
const USER_EMAIL = "p1pos@emplacement.test";
let userId = 0;
let client: ReturnType<typeof postgres>;

function ctx() {
  const user = {
    id: String(userId),
    name: "P1POS",
    email: USER_EMAIL,
    agenceId: AGENCE,
    agenceName: "TEST",
    organizationId: "1",
    role: "superadmin",
    permissions: [],
    isActive: true,
    status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } } as never;
}

const caller = () => garageRouter.createCaller(ctx());

async function nettoyer(): Promise<void> {
  await client`DELETE FROM parking_vehicles WHERE marque LIKE ${`%${NS}%`}`;
  await client`DELETE FROM parking_spots WHERE code LIKE ${`%${NS}%`}`;
  await client`DELETE FROM parking_zones WHERE code LIKE ${`%${NS}%`} OR nom LIKE ${`%${NS}%`}`;
  await client`DELETE FROM parking_sites WHERE code LIKE ${`%${NS}%`} OR nom LIKE ${`%${NS}%`}`;
  await client`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`;
  await client`DELETE FROM roles WHERE code LIKE ${`${NS}%`}`;
}

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  await nettoyer();
  const [role] = await client`
    INSERT INTO roles (code, nom, description, niveau)
    VALUES (${`${NS}_consultation`}, 'P1POS', 'Fixture', 0)
    ON CONFLICT (code) DO NOTHING RETURNING id`;
  let roleId = role?.id;
  if (!roleId) {
    const [r] = await client`SELECT id FROM roles WHERE code = ${`${NS}_consultation`}`;
    roleId = r!.id;
  }
  const [u] = await client`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
    VALUES (${USER_EMAIL}, 'P1POS', 'Fixture', ${AGENCE}, ${roleId}::uuid, true, 'active')
    ON CONFLICT (email) DO NOTHING RETURNING id`;
  userId = u?.id ?? 0;
}, 30000);

afterAll(async () => {
  await nettoyer();
  await client.end();
});

describe("P1.1 — emplacement du registre garage", () => {
  it("renvoie les noms lisibles site / zone / place, pas seulement les identifiants", async () => {
    const [site] = await client`
      INSERT INTO parking_sites (agence_id, code, nom) VALUES (${AGENCE}, ${`${NS}-SITE`}, ${`${NS}-Site`}) RETURNING id`;
    const [zone] = await client`
      INSERT INTO parking_zones (agence_id, site_id, code, nom, type, geometrie)
      VALUES (${AGENCE}, ${site!.id}, ${`${NS}-ZONE`}, ${`${NS}-Zone`}, 'RANGEE', '{}'::jsonb) RETURNING id`;
    const [spot] = await client`
      INSERT INTO parking_spots (agence_id, zone_id, site_id, code, statut, bloque, geometrie)
      VALUES (${AGENCE}, ${zone!.id}, ${site!.id}, ${`${NS}-P1`}, 'LIBRE', false, '{}'::jsonb) RETURNING id`;

    await client`
      INSERT INTO parking_vehicles (agence_id, num_registre, marque, modele, immatriculation,
                                    statut, site_id, zone_id, spot_id, centre_x, centre_y)
      VALUES (${AGENCE}, 9601, ${`${NS}-Marque`}, 'Modele', ${`EM-${NS}-1`}, 'EN_PARKING',
              ${site!.id}, ${zone!.id}, ${spot!.id}, 0.5, 0.5)`;

    const r = await caller().vehicles({ search: `${NS}-Marque`, limit: 20 });
    const v = r.vehicules.find((x) => x.marque === `${NS}-Marque`);
    expect(v, "le véhicule de test doit être retourné").toBeDefined();

    // Les trois noms que l'écran lit depuis le début.
    expect(v!.site).toBe(`${NS}-Site`);
    expect(v!.zone).toBe(`${NS}-Zone`);
    expect(v!.spot).toBe(`${NS}-P1`);

    // Sans cela, `v.spot` vaut `undefined` et la colonne affiche « Non défini ».
    expect(v!.spot).not.toBeUndefined();
  }, 30000);

  it("un véhicule non positionné reste distingué d'un véhicule à la place inconnu", async () => {
    await client`
      INSERT INTO parking_vehicles (agence_id, num_registre, marque, modele, immatriculation, statut)
      VALUES (${AGENCE}, 9602, ${`${NS}-Flottant`}, 'Modele', ${`EM-${NS}-2`}, 'EN_PARKING')`;

    const r = await caller().vehicles({ search: `${NS}-Flottant`, limit: 20 });
    const v = r.vehicules.find((x) => x.marque === `${NS}-Flottant`);
    expect(v).toBeDefined();
    // « Non défini » et « pas de nom lisible » ne doivent pas se confondre.
    expect(v!.spot ?? null).toBeNull();
    expect(v!.zone ?? null).toBeNull();
    expect(v!.site ?? null).toBeNull();
  }, 30000);
});