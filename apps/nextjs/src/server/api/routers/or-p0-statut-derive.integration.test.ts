/**
 * LOT P0.1 — LE STATUT DU VÉHICULE EST DÉRIVÉ, PLUS ÉCRIT
 * ========================================================
 *
 * Six désynchronisations parking ↔ atelier, toutes reproductibles avant ce lot.
 * Chacune a son test ici. Aucun test ne les couvrait : le code produisait et
 * consommait ses propres erreurs, donc elles étaient cohérentes avec
 * elles-mêmes et invisibles.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { garageRouter } from "~/server/api/routers/garage-router";
import { vehiculesRouter } from "~/server/api/routers/vehicules-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { transitionStatutVehiculeValide } from "~/server/lib/vehicule-service";

const NS = "p0statut";
const ROLE_CODE = `${NS}_or`;
const USER_EMAIL = `${NS}.or@gpj.cm`;

type Row = Record<string, unknown>;
let userId = 0;
let spotId = 0;
let siteId = 0;
let zoneId = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "P0 statut",
    email: USER_EMAIL,
    agenceId: 1,
    agenceName: "GPJ",
    organizationId: "1",
    role: "superadmin",
    permissions: [],
    isActive: true,
    status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } } as never;
}

beforeAll(async () => {
  await retirer();
  await db.execute(
    sql`INSERT INTO roles (code, nom, description, niveau)
        VALUES (${ROLE_CODE}, 'P0 statut', 'Fixture P0 statut', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[];
  await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'P0STA', 'Fixture', 1, ${role.id}::uuid, true, 'active')
        ON CONFLICT (email) DO NOTHING`,
  );
  const [u] = (await db.execute(
    sql`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`,
  )) as unknown as Row[];
  userId = Number(u.id);
});

beforeEach(async () => {
  await db.execute(
    sql`DELETE FROM lignes_ordre_reparation
        WHERE ordre_id IN (SELECT id FROM ordres_reparation WHERE pannes_declarees LIKE 'P0STA%')`,
  );
  await db.execute(sql`DELETE FROM ordres_reparation WHERE pannes_declarees LIKE 'P0STA%'`);
  await db.execute(
    sql`DELETE FROM parking_movements
        WHERE vehicle_id IN (SELECT id FROM parking_vehicles
          WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE 'P0STA-%'))`,
  );
  await db.execute(
    sql`DELETE FROM parking_vehicles WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE 'P0STA-%')`,
  );
  await db.execute(
    sql`DELETE FROM vehicules WHERE immat_norm LIKE 'P0STA-%' OR immatriculation LIKE 'P0STA-%'`,
  );
  await db.execute(sql`DELETE FROM clients WHERE nom LIKE 'Client P0STA%'`);
});

afterAll(async () => {
  await retirer();
});

async function retirer(): Promise<void> {
  await db.execute(
    sql`DELETE FROM lignes_ordre_reparation
        WHERE ordre_id IN (SELECT id FROM ordres_reparation WHERE pannes_declarees LIKE 'P0STA%')`,
  );
  await db.execute(
    sql`DELETE FROM parking_movements
        WHERE vehicle_id IN (SELECT id FROM parking_vehicles WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE 'P0STA-%'))`,
  );
  await db.execute(
    sql`DELETE FROM parking_vehicles WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE 'P0STA-%')`,
  );
  await db.execute(sql`DELETE FROM ordres_reparation WHERE pannes_declarees LIKE 'P0STA%'`);
  await db.execute(sql`DELETE FROM vehicules WHERE immat_norm LIKE 'P0STA-%' OR immatriculation LIKE 'P0STA-%'`);
  await db.execute(sql`DELETE FROM clients WHERE nom LIKE 'Client P0STA%'`);
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`);
  userId = 0;
}

const statutDe = async (vehiculeId: number): Promise<string | null> => {
  const [v] = (await db.execute(
    sql`SELECT statut_immobilisation FROM vehicules WHERE id = ${vehiculeId}`,
  )) as unknown as { statut_immobilisation: string | null }[];
  return v?.statut_immobilisation ?? null;
};

const statutParking = async (vehiculeId: number): Promise<string | null> => {
  const [p] = (await db.execute(
    sql`SELECT statut FROM parking_vehicles WHERE vehicule_id = ${vehiculeId} ORDER BY id DESC LIMIT 1`,
  )) as unknown as { statut: string | null }[];
  return p?.statut ?? null;
};

async function dossier(immat: string) {
  const caller = orRouter.createCaller(ctxSuperadmin());
  const r = await caller.receptionner({
    client: { nom: `Client P0STA ${immat}`, telephone: "691996001" },
    vehicule: { immatriculation: immat, marque: "Peugeot" },
    reception: { kilometrageEntree: 10000, pannesDeclarees: `P0STA-${immat}` },
  });
  const [v] = (await db.execute(sql`SELECT id FROM vehicules WHERE immat_norm = ${immat}`)) as unknown as Row[];
  return { orId: r.id as number, vehiculeId: Number(v.id), caller };
}

/**
 * Référentiel parking de fixture (site / zone / spot), trouvé ou créé.
 *
 * Pas d'`ON CONFLICT` : `parking_sites`/`zones`/`spots` n'ont pas de contrainte
 * unique sur `(agence_id, code)` — c'est ce que le premier jet du test
 * supposait à tort, et PostgreSQL l'a tranches.
 */
async function assurerParking(): Promise<void> {
  if (siteId) return;
  const trouve = (await db.execute(
    sql`SELECT id FROM parking_sites WHERE agence_id = 1 AND code = 'P0STA-SITE' LIMIT 1`,
  )) as unknown as Row[];
  if (trouve[0]) {
    siteId = Number(trouve[0].id);
  } else {
    const [s] = (await db.execute(
      sql`INSERT INTO parking_sites (agence_id, code, nom) VALUES (1, 'P0STA-SITE', 'Site P0') RETURNING id`,
    )) as unknown as Row[];
    siteId = Number(s.id);
  }

  const zoneTrouvee = (await db.execute(
    sql`SELECT id FROM parking_zones WHERE agence_id = 1 AND code = 'P0STA-ZONE' LIMIT 1`,
  )) as unknown as Row[];
  if (zoneTrouvee[0]) {
    zoneId = Number(zoneTrouvee[0].id);
  } else {
    const [z] = (await db.execute(
      sql`INSERT INTO parking_zones (agence_id, site_id, code, nom, geometrie, type)
          VALUES (1, ${siteId}, 'P0STA-ZONE', 'Zone P0', '{"type":"RECT","points":[[0,0],[20,0],[20,10],[0,10]]}'::jsonb, 'AIRE_LIBRE')
          RETURNING id`,
    )) as unknown as Row[];
    zoneId = Number(z.id);
  }

  const spotTrouve = (await db.execute(
    sql`SELECT id FROM parking_spots WHERE agence_id = 1 AND code = 'P0STA-SPOT' LIMIT 1`,
  )) as unknown as Row[];
  if (spotTrouve[0]) {
    spotId = Number(spotTrouve[0].id);
  } else {
    const [sp] = (await db.execute(
      sql`INSERT INTO parking_spots (agence_id, site_id, zone_id, code, geometrie)
          VALUES (1, ${siteId}, ${zoneId}, 'P0STA-SPOT', '{"type":"RECT","centre":{"x":5,"y":5},"dimensions":{"longueur":5,"largeur":2.5}}'::jsonb)
          RETURNING id`,
    )) as unknown as Row[];
    spotId = Number(sp.id);
  }
}

async function ligneParking(vehiculeId: number, statut: string) {
  await assurerParking();
  const [p] = (await db.execute(
    sql`INSERT INTO parking_vehicles
          (agence_id, vehicule_id, num_registre, immatriculation, statut, site_id, zone_id, spot_id, centre_x, centre_y)
        VALUES (1, ${vehiculeId}, 9900, 'P0STA', ${statut}, ${siteId}, ${zoneId}, ${spotId}, 5, 5)
        RETURNING id`,
  )) as unknown as Row[];
  return Number(p.id);
}

/** Amène un dossier jusqu'à PRET_A_LIVRER en respectant la machine d'états. */
async function avancerJusquALivraison(caller: { changerStatut: (a: unknown) => Promise<unknown> }, orId: number) {
  for (const etape of ["EN_COURS", "CONTROLE_QUALITE", "PRET_A_LIVRER"] as const) {
    await caller.changerStatut({ id: orId, nouveauStatut: etape, raison: `P0 → ${etape}` });
  }
}

describe("LOT P0.1 — le statut du véhicule ne peut plus mentir", () => {
  it("1. à la réception, le statut vient du dossier — pas d'un 'en réparation' forcé", async () => {
    const { orId, vehiculeId } = await dossier("P0STA-001");

    // AVANT : `or.receptionner` écrivait `en_reception` à la création du
    // véhicule puis `en_reparation` quarante lignes plus bas. Deux statuts
    // écrits, un conservé — et le dossier ne venait qu'être ouvert.
    expect(await statutDe(vehiculeId)).toBe("en_reception");
    expect(orId).toBeGreaterThan(0);
  });

  it("2. dossier ANNULÉ : le véhicule cesse d'être 'en réparation' — le bug le plus visible", async () => {
    // AVANT, `or.changerStatut` ne traitait que LIVRE, EN_COURS et
    // CONTROLE_QUALITE. Un dossier annulé laissait le véhicule « en
    // réparation » INDÉFINIMENT, sans aucun dossier ouvert : la fiche
    // affichait « En réparation » juste au-dessus de « Aucun OR en cours ».
    const { orId, vehiculeId, caller } = await dossier("P0STA-002");
    await caller.changerStatut({ id: orId, nouveauStatut: "EN_COURS" as never, raison: "P0" });
    expect(await statutDe(vehiculeId)).toBe("en_reception");

    await caller.changerStatut({ id: orId, nouveauStatut: "ANNULE" as never, raison: "Client absent" });

    expect(await statutDe(vehiculeId)).toBe("en_reception");
    const ouverts = (await db.execute(
      sql`SELECT count(*)::int AS n FROM ordres_reparation
          WHERE vehicule_id = ${vehiculeId} AND statut NOT IN ('LIVRE','ANNULE','ferme_definitif')`,
    )) as unknown as Row[];
    expect(Number(ouverts[0].n)).toBe(0);
  });

  it("3. PRET_A_LIVRER → « terminée, attente paiement » : la chaîne d'alerte est rétablie", async () => {
    // Le moteur d'alertes parking ne se déclenche que sur
    // `TERMINE_A_RECUPERER`. Aucun code ne l'écrivait depuis le chemin
    // atelier : un véhicule prêt depuis 30 jours ne produisait AUCUNE
    // alerte, et la place restait immobilisée sans que personne le sache.
    const { orId, vehiculeId, caller } = await dossier("P0STA-003");
    await ligneParking(vehiculeId, "EN_TRAVAUX");
    await avancerJusquALivraison(caller, orId);

    expect(await statutDe(vehiculeId)).toBe("terminee_attente_paiement");
    expect(await statutParking(vehiculeId)).toBe("TERMINE_A_RECUPERER");
  });

  it("4. un véhicule avec dossier ouvert ne peut pas être sorti du garage", async () => {
    // AVANT, `garage.sortie` libérait la place et écrivait SORTI côté
    // parking, sans toucher au véhicule : invisible à l'atelier, sorti du
    // parking, et impossible à réintégrer. Aucune garde ne s'y opposait.
    //
    // La sortie du garage avec un dossier ouvert est une INCOHÉRENCE, pas une
    // sortie : le dossier dit que le véhicule est en atelier, le registre dit
    // qu'il est parti, et aucun des deux ne se reprend.
    const { vehiculeId } = await dossier("P0STA-004");
    await ligneParking(vehiculeId, "EN_TRAVAUX");

    const garage = garageRouter.createCaller(ctxSuperadmin());
    const [pv] = (await db.execute(
      sql`SELECT id FROM parking_vehicles WHERE vehicule_id = ${vehiculeId} ORDER BY id DESC LIMIT 1`,
    )) as unknown as Row[];

    const code = await garage
      .sortie({ vehicleId: Number(pv.id), motif: "Test P0" })
      .then(() => "AUCUN")
      .catch((e: { code?: string }) => e.code ?? "AUTRE");
    expect(code).toBe("BAD_REQUEST");

    // Rien n'a bougé : ni le parking, ni le véhicule.
    expect(await statutParking(vehiculeId)).toBe("EN_TRAVAUX");
    expect(await statutDe(vehiculeId)).toBe("en_reception");
  });

  it("4b. sans dossier ouvert, la sortie du garage met bien les deux registres d'accord", async () => {
    const { vehiculeId } = await dossier("P0STA-004B");
    const parkingId = await ligneParking(vehiculeId, "EN_TRAVAUX");

    // On clôt le dossier : plus rien ne s'oppose à la sortie.
    const caller = orRouter.createCaller(ctxSuperadmin());
    const [or] = (await db.execute(
      sql`SELECT id FROM ordres_reparation WHERE vehicule_id = ${vehiculeId} LIMIT 1`,
    )) as unknown as Row[];
    await caller.changerStatut({ id: Number(or.id), nouveauStatut: "ANNULE", raison: "Dossier annulé" });

    const garage = garageRouter.createCaller(ctxSuperadmin());
    await garage.sortie({ vehicleId: parkingId, motif: "Sortie garage" });

    expect(await statutParking(vehiculeId)).toBe("SORTI");
    expect(await statutDe(vehiculeId)).toBe("sorti");
  });

  it("5. une correction manuelle ne peut pas contredire un dossier ouvert", async () => {
    // `changerStatut` reste possible — c'est la seule façon de poser
    // « transféré », « contentieux » ou « client non venu », qu'aucun flux
    // ne produit. Mais il ne doit pas contredire ce que le dossier dit.
    const { orId, vehiculeId, caller } = await dossier("P0STA-005");
    await avancerJusquALivraison(caller, orId);

    const parc = vehiculesRouter.createCaller(ctxSuperadmin());
    const code = await parc
      .changerStatut({ id: vehiculeId, nouveauStatut: "en_reception", motif: "essai" })
      .then(() => "AUCUN")
      .catch((e: { code?: string }) => e.code ?? "AUTRE");
    expect(code).toBe("BAD_REQUEST");

    // Un état HORS flux reste accessible, mais avec motif : le véhicule
    // restera dans cet état jusqu'à la prochaine action de l'atelier.
    const sansMotif = await parc
      .changerStatut({ id: vehiculeId, nouveauStatut: "terminee_client_non_venu" })
      .then(() => "AUCUN")
      .catch((e: { code?: string }) => e.code ?? "AUTRE");
    expect(sansMotif).toBe("BAD_REQUEST");

    const r = await parc.changerStatut({
      id: vehiculeId,
      nouveauStatut: "terminee_client_non_venu",
      motif: "Client absent trois fois, véhicule à mettre de côté",
    });
    expect(r.statut).toBe("terminee_client_non_venu");
  });

  it("6. un statut NULL ne débloque plus toutes les transitions", async () => {
    // Le backfill `migrate-parking-vehicules.ts` finit en `ELSE NULL`, donc
    // des véhicules se sont trouvés sans statut. La garde dégradait alors sa
    // réponse en « tout est permis » — la sécurité disparaissait
    // précisément sur les données qu'elle devait surveiller, sans erreur.
    expect(transitionStatutVehiculeValide(null, "sorti")).toBe(false);
    expect(transitionStatutVehiculeValide(null, "en_reception")).toBe(true);
    expect(transitionStatutVehiculeValide("INVENTE", "sorti")).toBe(false);
    expect(transitionStatutVehiculeValide("en_reception", "sorti")).toBe(true);
  });
});