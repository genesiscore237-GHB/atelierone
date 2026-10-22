/**
 * ÉTAPE 7 — LE JOURNAL D'INTERVENTION NE SE LIT PAS HORS DE SON AGENCE.
 *
 * Les trois lectures du journal (`parLigne`, `parVehicule`, `dernierConstat`)
 * filtraient par identifiant seul. Un identifiant est devinable : une session
 * de l'agence B pouvait donc lire le compte rendu d'un dossier de l'agence A
 * en fournissant son `ligneId` ou son `vehiculeId`.
 *
 * La permission `or.consulter` dit ce qu'un profil a le droit de faire, pas
 * sur QUEL périmètre. Le filtre d'agence est la seconde moitié de la règle, et
 * c'est celle qu'on oublie : le test lit avec une session de l'agence 1 une
 * ligne créée dans l'agence 2, et exige le vide.
 *
 * Le fixture vit dans l'agence 2 pour ne pas fausser les KPI de l'agence 1,
 * qui comptent les dossiers de LEUR agence — un compte rendu technique n'a
 * pas à changer le dénominateur d'une satisfaction client.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { interventionsRouter } from "~/server/api/routers/interventions-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "e7iso";

type Row = Record<string, unknown>;

let vehiculeId = 0;
let orId = 0;
let ligneId = 0;

function ctx(agenceId: number) {
  const user = {
    id: "1",
    name: "E7 isolation",
    email: `${NS}.or@gpj.cm`,
    agenceId,
    agenceName: agenceId === 2 ? "GPJ - Stockage" : "GPJ - Atelier",
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

async function retirer() {
  await db.execute(
    sql`DELETE FROM or_interventions
        WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE ${`${NS}%`})`,
  );
  await db.execute(
    sql`DELETE FROM lignes_ordre_reparation
        WHERE ordre_id IN (
          SELECT o.id FROM ordres_reparation o
          JOIN vehicules v ON v.id = o.vehicule_id
          WHERE v.immatriculation LIKE ${`${NS}%`})`,
  );
  await db.execute(
    sql`DELETE FROM ordres_reparation
        WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE ${`${NS}%`})`,
  );
  await db.execute(sql`DELETE FROM vehicules WHERE immatriculation LIKE ${`${NS}%`}`);
}

beforeAll(async () => {
  await retirer();

  const [v] = (await db.execute(
    sql`INSERT INTO vehicules (immatriculation, marque, modele, agence_id)
        VALUES (${`${NS}-001`}, 'Isolement', 'Test', 2) RETURNING id`,
  )) as unknown as Row[];
  vehiculeId = Number(v.id);

  const [o] = (await db.execute(
    sql`INSERT INTO ordres_reparation (agence_id, numero, vehicule_id, statut)
        VALUES (2, ${`${NS}-OR-1`}, ${vehiculeId}, 'EN_COURS') RETURNING id`,
  )) as unknown as Row[];
  orId = Number(o.id);

  const [l] = (await db.execute(
    sql`INSERT INTO lignes_ordre_reparation (ordre_id, libelle, statut)
        VALUES (${orId}, 'Plaquettes avant', 'en_cours') RETURNING id`,
  )) as unknown as Row[];
  ligneId = Number(l.id);

  await db.execute(
    sql`INSERT INTO or_interventions (ligne_id, or_id, vehicule_id, constat, intervention)
        VALUES (${ligneId}, ${orId}, ${vehiculeId}, 'Constat agence 2', 'Intervention agence 2')`,
  );
});

afterAll(async () => {
  await retirer();
});

describe("ÉTAPE 7 — le journal d'intervention est cloisonné par agence", () => {
  it("1. l'agence propriétaire lit bien son compte rendu", async () => {
    const caller = interventionsRouter.createCaller(ctx(2));
    const lignes = await caller.parLigne({ ligneId });

    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.constat).toBe("Constat agence 2");
  });

  it("2. parLigne ne franchit pas l'agence", async () => {
    const caller = interventionsRouter.createCaller(ctx(1));
    expect(await caller.parLigne({ ligneId })).toEqual([]);
  });

  it("3. parVehicule ne franchit pas l'agence", async () => {
    const caller = interventionsRouter.createCaller(ctx(1));
    expect(await caller.parVehicule({ vehiculeId })).toEqual([]);
  });

  it("4. dernierConstat ne franchit pas l'agence", async () => {
    const caller = interventionsRouter.createCaller(ctx(1));
    expect(await caller.dernierConstat({ vehiculeId })).toBeNull();
  });
});
