/**
 * LOT R1 — Unicité de la plaque par agence (immat_norm).
 *
 * Garanties testées contre la base de test :
 *
 *  1. `or.createVehicule` : la plaque saisie est normalisée dans `immat_norm`
 *     (trim + suppression espaces + majuscules ; ponctuation conservée).
 *  2. Doublon détecté sur la forme NORMALISÉE : « LOTR1VEH » puis « lotr1veh »
 *     sont refusés (BAD_REQUEST) — l'unicité repose sur `immat_norm`, pas sur
 *     le libellé brut.
 *  3. Deux plaques distinctes (ponctuation différente) coexistent.
 *  4. Index partiel `uq_vehicules_agence_immat_norm` actif en base
 *     (`immat_norm IS NOT NULL`) ; les véhicules sans plaque (NULL) ne sont
 *     pas soumis à l'unicité (modèle « pas d'invention »).
 *  5. `or.receptionner` : réconciliation par plaque — une seconde réception
 *     portant la même plaque (saisie différemment) RÉUTILISE le véhicule
 *     existant au lieu de créer un doublon.
 *
 * Fixtures réelles — namespace `lotr1`, bande de registre 9300-9349.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

// `next-auth` n'est pas resolvable hors de Next — on ne mocke QUE le
// transport d'authentification ; le RBAC (DB) reste réel.
vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { normaliserImmatriculation } from "~/server/lib/parking-vehicule-service";

const NS = "lotr1";
const ROLE_CODE = `${NS}_or`;
const USER_EMAIL = `${NS}.or@gpj.cm`;

type Row = Record<string, unknown>;

let userId = 0;

/** Contexte forge « superadmin » : bypass `requirePermissionProcedure`. */
function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "LotR1 superadmin",
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

const codeDe = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? "UNKNOWN";
  }
};

async function vehiculeByImmatNorm(immatNorm: string): Promise<Row> {
  const rows = (await db.execute(
    sql`SELECT id, agence_id, immatriculation, immat_norm, client_id
        FROM vehicules WHERE agence_id = 1 AND immat_norm = ${immatNorm}`,
  )) as unknown as Row[];
  return rows[0] ?? {};
}

beforeAll(async () => {
  await retirer();

  await db.execute(
    sql`INSERT INTO roles (code, nom, description, niveau)
        VALUES (${ROLE_CODE}, 'LotR1 OR', 'Fixture LotR1', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(
    sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`,
  )) as unknown as Row[];
  const roleId = role?.id;
  if (!roleId) throw new Error(`Fixtures ${NS} : role ${ROLE_CODE} introuvable.`);

  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'LOTR1', 'Fixture', 1, ${roleId}::uuid, true, 'active')
        ON CONFLICT (email) DO NOTHING
        RETURNING id`,
  )) as unknown as Row[];
  userId = insere.length > 0
    ? Number(insere[0].id)
    : Number(
        ((await db.execute(
          sql`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`,
        )) as unknown as Row[])[0]?.id,
      );
  if (!Number.isFinite(userId)) throw new Error(`Fixtures ${NS} : utilisateur introuvable.`);
});

afterAll(async () => {
  await retirer();
});

async function retirer(): Promise<void> {
  // Nettoyage large, dans l'ordre des clés étrangères : OR d'abord, puis
  // véhicules, puis fixtures RBAC. Les OR sont ciblés via leur véhicule
  // (immatriculation LotR1) car leur `numero` est généré côté serveur.
  const vehs = (await db.execute(
    sql`SELECT id FROM vehicules
        WHERE agence_id = 1 AND (immat_norm LIKE 'LOTR1%' OR immatriculation LIKE 'LOTR1%')`,
  )) as unknown as Row[];
  for (const v of vehs) {
    await db.execute(sql`DELETE FROM ordres_reparation WHERE vehicule_id = ${v.id}`);
    // Libère toute référence résiduelle hors OR (parcours parking, flotte…).
    await db.execute(sql`DELETE FROM parking_vehicles WHERE vehicule_id = ${v.id}`);
  }
  await db.execute(
    sql`DELETE FROM vehicules
        WHERE agence_id = 1 AND (immat_norm LIKE 'LOTR1%' OR immatriculation LIKE 'LOTR1%')`,
  );
  await db.execute(
    sql`DELETE FROM audit_logs
        WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(
    sql`DELETE FROM role_permissions
        WHERE role_id IN (SELECT id FROM roles WHERE code = ${ROLE_CODE})`,
  );
  await db.execute(
    sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`,
  );
  userId = 0;
}

describe("LOT R1 — unicité de la plaque par agence (immat_norm)", () => {
  it("1-2. createVehicule normalise la plaque et refuse le doublon normalisé", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());

    const created = await caller.createVehicule({
      immatriculation: "LOTR1VEH00",
      marque: "LotR1",
      modele: "Test",
    });
    expect(created.id).toBeGreaterThan(0);

    const row = await vehiculeByImmatNorm("LOTR1VEH00");
    expect(row.immat_norm).toBe("LOTR1VEH00");
    expect(row.immatriculation).toBe("LOTR1VEH00");

    // Même plaque, saisie différemment (minuscules + espaces) → doublon refusé.
    const code = await codeDe(
      caller.createVehicule({
        immatriculation: "  lotr1veh00  ",
        marque: "LotR1",
        modele: "Doublon",
      }),
    );
    expect(code).toBe("BAD_REQUEST");

    // Un seul véhicule réellement créé pour cette plaque.
    const rows = (await db.execute(
      sql`SELECT id FROM vehicules
          WHERE agence_id = 1 AND immat_norm = ${"LOTR1VEH00"}`,
    )) as unknown as Row[];
    expect(rows.length).toBe(1);
  });

  it("3-4. la ponctuation est conservée (plaques distinctes) + index partiel actif", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());

    const a = await caller.createVehicule({
      immatriculation: "LOTR1-A.123",
      marque: "LotR1",
      modele: "PonctueA",
    });
    const b = await caller.createVehicule({
      immatriculation: "LOTR1A.123",
      marque: "LotR1",
      modele: "PonctueB",
    });
    expect(a.id).not.toBe(b.id);
    expect(await vehiculeByImmatNorm("LOTR1-A.123")).not.toEqual({});
    expect(await vehiculeByImmatNorm("LOTR1A.123")).not.toEqual({});

    // L'index partiel d'unicité est bien en place sur la base de test.
    const idx = (await db.execute(
      sql`SELECT indexname FROM pg_indexes
          WHERE tablename = 'vehicules'
            AND indexname = 'uq_vehicules_agence_immat_norm'`,
    )) as unknown as Row[];
    expect(idx.length).toBe(1);

    // Le véhicule créé ici n'a PAS de client (pas d'invention de propriété).
    const row = await vehiculeByImmatNorm("LOTR1-A.123");
    expect(row.client_id).toBeNull();
  });

  it("5. receptionner réconcilie par plaque et RÉUTILISE le véhicule existant", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());

    const reception = (immat: string) => ({
      client: { nom: "Client LotR1", prenom: "Test" },
      vehicule: { immatriculation: immat },
      reception: {
        kilometrageEntree: 12000,
        pannesDeclarees: "Bruit de roulement",
      },
    });

    const or1 = await caller.receptionner(reception("LOTR1VEH01"));
    const or2 = await caller.receptionner(reception("  lotr1veh01  "));

    // Les deux OR pointent vers le MÊME véhicule (réutilisation, pas de doublon).
    expect(or1.vehiculeId).toBe(or2.vehiculeId);

    const rows = (await db.execute(
      sql`SELECT id FROM vehicules
          WHERE agence_id = 1 AND immat_norm = ${"LOTR1VEH01"}`,
    )) as unknown as Row[];
    expect(rows.length).toBe(1);
  });

  it("normaliserImmatriculation : trim + espaces supprimés + majuscules (ponctuation conservée)", () => {
    expect(normaliserImmatriculation("  ab-123-cd  ")).toBe("AB-123-CD");
    expect(normaliserImmatriculation("ab1 23cd")).toBe("AB123CD");
    expect(normaliserImmatriculation(null)).toBe("");
    expect(normaliserImmatriculation(undefined)).toBe("");
  });
});
