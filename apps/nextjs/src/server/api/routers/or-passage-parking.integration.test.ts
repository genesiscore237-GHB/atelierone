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
});
