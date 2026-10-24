/**
 * PASSAGE PARKING ↔ RÉCEPTION ATELIER.
 *
 * Ce que l'on verrouille ici :
 *  1. une réception crée une ligne parking liée à l'OR ;
 *  2. une seconde réception sur le même véhicule réutilise le passage actif ;
 *  3. un ancien passage `SORTI` n'est jamais réactivé par la projection ;
 *  4. la modification de la réception synchronise km et plainte ;
 *  5. un OR clos ou un diagnostic figé refuse les champs d'entrée.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { db } from "~/server/db";

const NS = "passage";
const EMAIL = `${NS}.test@gpj.cm`;
const ROLE = `${NS}_role`;
const IMMAT = "PASSAGE-001";

let userId = 0;

function ctx() {
  const user = {
    id: String(userId),
    name: "Passage test",
    email: EMAIL,
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

const caller = () => orRouter.createCaller(ctx());

async function nettoyer(): Promise<void> {
  await db.execute(sql`
    DELETE FROM parking_movements
    WHERE vehicle_id IN (
      SELECT pv.id FROM parking_vehicles pv
      JOIN vehicules v ON v.id = pv.vehicule_id
      WHERE v.immat_norm LIKE ${`${NS.toUpperCase()}%`}
    )`);
  await db.execute(sql`
    DELETE FROM parking_vehicles
    WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE ${`${NS.toUpperCase()}%`})`);
  await db.execute(sql`
    DELETE FROM or_photos
    WHERE or_id IN (SELECT id FROM ordres_reparation
      WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE ${`${NS.toUpperCase()}%`}))`);
  await db.execute(sql`
    DELETE FROM or_rapports_diagnostic
    WHERE or_id IN (SELECT id FROM ordres_reparation
      WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE ${`${NS.toUpperCase()}%`}))`);
  await db.execute(sql`
    DELETE FROM ordres_reparation
    WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE ${`${NS.toUpperCase()}%`})`);
  await db.execute(sql`DELETE FROM vehicules WHERE immat_norm LIKE ${`${NS.toUpperCase()}%`}`);
  await db.execute(sql`DELETE FROM clients WHERE nom LIKE ${`Client ${NS}%`}`);
  await db.execute(sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${EMAIL})`);
}

beforeAll(async () => {
  await nettoyer();
  await db.execute(sql`
    INSERT INTO roles (code, nom, description, niveau)
    VALUES (${ROLE}, 'Passage test', 'Fixture passage', 0)
    ON CONFLICT (code) DO NOTHING`);
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE}`)) as unknown as { id: string }[];
  await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
    VALUES (${EMAIL}, 'Passage', 'Test', 1, ${role!.id}::uuid, true, 'active')
    ON CONFLICT (email) DO NOTHING`);
  const [u] = (await db.execute(sql`SELECT id FROM utilisateurs WHERE email = ${EMAIL}`)) as unknown as { id: string }[];
  userId = Number(u!.id);
});

beforeEach(nettoyer);
afterAll(async () => {
  await nettoyer();
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${EMAIL}`);
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE}`);
  userId = 0;
});

const reception = (immat = IMMAT, pannes = "Freins") => ({
  client: { nom: `Client ${NS}`, telephone: "699000101" },
  vehicule: { immatriculation: immat, marque: "Passage", modele: "Test" },
  reception: { kilometrageEntree: 10_000, pannesDeclarees: pannes },
});

async function parkingRows(vehiculeId: number) {
  return (await db.execute(sql`
    SELECT id, or_id, statut, num_registre, date_entree
    FROM parking_vehicles
    WHERE vehicule_id = ${vehiculeId}
    ORDER BY id`)) as unknown as {
      id: number;
      or_id: number | null;
      statut: string;
      num_registre: number;
      date_entree: string | null;
    }[];
}

describe("Passage parking créé par la réception", () => {
  it("1. la réception crée un passage actif lié à l'OR", async () => {
    const r = await caller().receptionner(reception());
    const rows = await parkingRows(r.vehiculeId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.or_id).toBe(r.id);
    expect(rows[0]!.statut).toBe("EN_PARKING");
    expect(rows[0]!.date_entree).toBeTruthy();
  });

  it("2. une seconde réception réutilise le passage actif", async () => {
    const r1 = await caller().receptionner(reception(IMMAT, "Premier"));
    const r2 = await caller().receptionner({
      ...reception(IMMAT, "Second"),
      client: { id: r1.clientId },
      confirmerNouvelleIntervention: true,
    });
    const rows = await parkingRows(r1.vehiculeId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.or_id).toBe(r2.id);
    expect(rows[0]!.statut).toBe("EN_PARKING");
  });

  it("3. un ancien passage SORTI reste SORTI", async () => {
    const r1 = await caller().receptionner(reception(IMMAT, "Premier"));
    const [ancien] = await parkingRows(r1.vehiculeId);
    await db.execute(sql`UPDATE parking_vehicles SET statut = 'SORTI' WHERE id = ${ancien!.id}`);

    const r2 = await caller().receptionner({
      ...reception(IMMAT, "Retour"),
      client: { id: r1.clientId },
      confirmerNouvelleIntervention: true,
    });
    const rows = await parkingRows(r1.vehiculeId);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toBe(ancien!.id);
    expect(rows[0]!.statut).toBe("SORTI");
    expect(rows[1]!.statut).toBe("EN_PARKING");
    expect(rows[1]!.or_id).toBe(r2.id);
  });

  it("4. la modification de la réception synchronise km et plainte", async () => {
    const r = await caller().receptionner(reception(IMMAT, "Ancienne plainte"));
    await caller().update({
      id: r.id,
      kilometrageEntree: 12_345,
      pannesDeclarees: "Nouvelle plainte",
    });

    const [or] = (await db.execute(sql`
      SELECT kilometrage_entree, pannes_declarees, plainte
      FROM ordres_reparation WHERE id = ${r.id}`)) as unknown as {
        kilometrage_entree: number;
        pannes_declarees: string;
        plainte: string;
      }[];
    const [v] = (await db.execute(sql`
      SELECT kilometrage FROM vehicules WHERE id = ${r.vehiculeId}`)) as unknown as { kilometrage: number }[];

    expect(Number(or!.kilometrage_entree)).toBe(12_345);
    expect(or!.pannes_declarees).toBe("Nouvelle plainte");
    expect(or!.plainte).toBe("Nouvelle plainte");
    expect(Number(v!.kilometrage)).toBe(12_345);
  });

  it("5. un OR clos refuse la modification de réception", async () => {
    const r = await caller().receptionner(reception());
    await db.execute(sql`UPDATE ordres_reparation SET statut = 'LIVRE' WHERE id = ${r.id}`);
    await expect(
      caller().update({ id: r.id, pannesDeclarees: "Trop tard" }),
    ).rejects.toThrow(/clos|modifiable/i);
  });

  it("6. un diagnostic figé n'autorise que l'emplacement", async () => {
    const r = await caller().receptionner(reception());
    await db.execute(sql`
      INSERT INTO or_rapports_diagnostic (or_id, constat, statut)
      VALUES (${r.id}, 'Diagnostic figé', 'SOUMIS')`);

    await expect(
      caller().update({ id: r.id, pannesDeclarees: "Réécriture" }),
    ).rejects.toThrow(/figée|figé|diagnostic/i);

    await expect(
      caller().update({ id: r.id, emplacement: "Zone B" }),
    ).resolves.toEqual({ success: true });
  });

  it("7. un dossier déjà ouvert exige une confirmation explicite", async () => {
    const r1 = await caller().receptionner(reception(IMMAT, "Premier"));
    await expect(
      caller().receptionner({ ...reception(IMMAT, "Doublon"), client: { id: r1.clientId } }),
    ).rejects.toThrow(/déjà ouvert|nouvelle intervention/i);

    const r2 = await caller().receptionner({
      ...reception(IMMAT, "Nouvelle intervention"),
      client: { id: r1.clientId },
      confirmerNouvelleIntervention: true,
    });
    expect(r2.id).not.toBe(r1.id);
  });

  it("8. un véhicule possédé sans client saisi conserve son propriétaire", async () => {
    const r1 = await caller().receptionner(reception(IMMAT, "Premier"));
    const r2 = await caller().receptionner({
      client: {},
      vehicule: { immatriculation: IMMAT },
      reception: { kilometrageEntree: 10_100, pannesDeclarees: "Retour" },
      confirmerNouvelleIntervention: true,
    });
    const [or] = (await db.execute(sql`
      SELECT client_id FROM ordres_reparation WHERE id = ${r2.id}`)) as unknown as { client_id: number | null }[];
    expect(Number(or!.client_id)).toBe(r1.clientId);
  });

  it("9. un téléphone seul est refusé", async () => {
    await expect(
      caller().receptionner({
        client: { telephone: "699000109" },
        vehicule: { immatriculation: IMMAT, marque: "Passage" },
        reception: { pannesDeclarees: "Sans nom" },
      }),
    ).rejects.toThrow(/nom|téléphone/i);
  });

  it("10. un km inférieur au dernier connu est refusé", async () => {
    const r1 = await caller().receptionner(reception(IMMAT, "Premier"));
    await expect(
      caller().receptionner({
        ...reception(IMMAT, "Km faux"),
        client: { id: r1.clientId },
        reception: { kilometrageEntree: 9_000, pannesDeclarees: "Km faux" },
        confirmerNouvelleIntervention: true,
      }),
    ).rejects.toThrow(/inférieur|kilométrage/i);
  });

  it("11. date future et promesse antérieure sont refusées", async () => {
    await expect(
      caller().receptionner({
        ...reception(IMMAT),
        reception: {
          kilometrageEntree: 10_000,
          pannesDeclarees: "Date future",
          dateReception: "2099-01-01T10:00",
        },
      }),
    ).rejects.toThrow(/futur|date/i);

    await expect(
      caller().receptionner({
        ...reception(IMMAT),
        reception: {
          kilometrageEntree: 10_000,
          pannesDeclarees: "Promesse",
          dateReception: "2026-10-23T10:00",
          datePromesse: "2026-10-22",
        },
      }),
    ).rejects.toThrow(/promesse|précéder/i);
  });

  it("12. un dépannage ne crée pas de passage parking", async () => {
    const r = await caller().receptionner({
      ...reception(IMMAT),
      reception: {
        kilometrageEntree: 10_000,
        pannesDeclarees: "Dépannage",
        typeIntervention: "DEPANNAGE",
        lieuDepannage: "Carrefour Bastos",
      },
    });
    expect(await parkingRows(r.vehiculeId)).toHaveLength(0);
  });

  it("13. un client entreprise conserve son type et sa raison sociale", async () => {
    const r = await caller().receptionner({
      ...reception(IMMAT),
      client: {
        nom: "Client passage entreprise",
        raisonSociale: "GPJ Trans",
        typeClient: "ENTR",
        telephone: "699000113",
      },
    });
    const [cli] = (await db.execute(sql`
      SELECT type_client, raison_sociale FROM clients WHERE id = ${r.clientId}`)) as unknown as {
        type_client: string;
        raison_sociale: string | null;
      }[];
    expect(cli!.type_client).toBe("ENTR");
    expect(cli!.raison_sociale).toBe("GPJ Trans");
  });

  it("14. un véhicule inactif ou une plaque incohérente est refusé", async () => {
    const r1 = await caller().receptionner(reception(IMMAT));
    await db.execute(sql`UPDATE vehicules SET is_active = false WHERE id = ${r1.vehiculeId}`);
    await expect(
      caller().receptionner({
        client: { id: r1.clientId },
        vehicule: { id: r1.vehiculeId, immatriculation: IMMAT },
        reception: { pannesDeclarees: "Inactif" },
        confirmerNouvelleIntervention: true,
      }),
    ).rejects.toThrow(/inactif/i);

    await db.execute(sql`UPDATE vehicules SET is_active = true WHERE id = ${r1.vehiculeId}`);
    await expect(
      caller().receptionner({
        client: { id: r1.clientId },
        vehicule: { id: r1.vehiculeId, immatriculation: "AUTRE-PLAQUE" },
        reception: { pannesDeclarees: "Plaque" },
        confirmerNouvelleIntervention: true,
      }),
    ).rejects.toThrow(/plaque|correspond/i);
  });

  it("15. un client supprimé ne bloque pas la création d'un nouveau client", async () => {
    await db.execute(sql`
      INSERT INTO clients (nom, telephone, agence_id, statut, type_client, is_active, deleted_at)
      VALUES ('Client passage supprimé', '699000112', 1, 'ACTIF', 'PART', false, now())`);

    const r = await caller().receptionner({
      client: { nom: "Client passage neuf", telephone: "699000112" },
      vehicule: { immatriculation: IMMAT, marque: "Passage" },
      reception: { pannesDeclarees: "Nouveau client" },
    });
    expect(r.clientId).toBeGreaterThan(0);
    const [cli] = (await db.execute(sql`
      SELECT nom, deleted_at FROM clients WHERE id = ${r.clientId}`)) as unknown as {
        nom: string;
        deleted_at: string | null;
      }[];
    expect(cli!.nom).toBe("Client passage neuf");
    expect(cli!.deleted_at).toBeNull();
  });

  it("16. la recherche réception normalise le téléphone et exclut les clients supprimés", async () => {
    const r = await caller().receptionner({
      client: { nom: "Client passage search", telephone: "699 000 114" },
      vehicule: { immatriculation: IMMAT, marque: "Passage" },
      reception: { pannesDeclarees: "Recherche" },
    });
    const trouve = await caller().rechercherReception({ q: "699000114" });
    expect(trouve.clients.some((c) => c.id === r.clientId)).toBe(true);

    await db.execute(sql`
      INSERT INTO clients (nom, telephone, agence_id, statut, type_client, is_active, deleted_at)
      VALUES ('Client passage supprimé search', '699 000 115', 1, 'ACTIF', 'PART', false, now())`);
    const supprime = await caller().rechercherReception({ q: "699000115" });
    expect(supprime.clients).toHaveLength(0);
  });
});
