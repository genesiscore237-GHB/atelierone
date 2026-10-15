/**
 * LOT U1 (E7) — Type de véhicule en combobox (suggestions + saisie libre).
 *
 * Garanties testées contre la base de test :
 *
 *  1. `vehicules.typesUtilises` renvoie TOUJOURS la liste de référence
 *     (`TYPES_VEHICULE`), même agence vide : le formulaire ne propose jamais
 *     une liste vide (l'opérateur n'aurait plus rien à choisir).
 *  2. Les libellés sont humanisés : la valeur stockée reste snake_case
 *     (`poids_lourd`) mais l'affichage est « Poids lourd » (RD6, pas de
 *     migration de données).
 *  3. Un type RÉELLEMENT encountered par l'agence (saisie libre historique,
 *     ex. « benne ») remonte dans les suggestions.
 *  4. Isolation agence : un type utilisé par une AUTRE agence n'apparaît pas
 *     (pas de fuite entre agences).
 *  5. `libelleTypeVehicule` : fonction pure, testée unitairement.
 *
 * Fixtures RBAC réelles (roles / role_permissions / utilisateurs), namespace
 * propre `u1types` pour tourner en parallèle des autres suites.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

// `next-auth` n'est pas resolvable hors de Next : on ne mocke QUE le transport
// d'authentification ; le RBAC (DB) reste réel.
vi.mock("@atelierone/auth", () => ({}));

import { vehiculesRouter } from "~/server/api/routers/vehicules-router";
import { orRouter } from "~/server/api/routers/or-router";
import { TYPES_VEHICULE, libelleTypeVehicule } from "~/server/lib/vehicule-service";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "u1types";
const ROLE_CODE = `${NS}_vehicules`;
const USER_EMAIL = `${NS}.vehicules@gpj.cm`;
const TYPE_HORS_LISTE = "benne_littere";

type Row = Record<string, unknown>;

let userId = 0;

/** Contexte forge « superadmin » : bypass `requirePermissionProcedure`. */
function ctxSuperadmin(agenceId = 1) {
  const user = {
    id: String(userId),
    name: "U1 superadmin",
    email: USER_EMAIL,
    agenceId,
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
        VALUES (${ROLE_CODE}, 'LotU1 Véhicules', 'Fixture LotU1', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(
    sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`,
  )) as unknown as Row[];
  const roleId = role?.id;
  if (!roleId) throw new Error(`Fixtures ${NS} : role ${ROLE_CODE} introuvable.`);

  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'LOTU1', 'Fixture', 1, ${roleId}::uuid, true, 'active')
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

beforeEach(async () => {
  // Purge des SEULS véhicules de la fixture : le RBAC (rôle/utilisateur) vit
  // dans beforeAll et alimente `ctxSuperadmin().user.id` (clé FK audit).
  await retirerVehicules();
});

afterAll(async () => {
  await retirer();
});

/** Purge les véhicules du namespace U1 (et leurs dépendances OR). */
async function retirerVehicules(): Promise<void> {
  const vehs = (await db.execute(
    sql`SELECT id FROM vehicules WHERE immat_norm LIKE 'U1TYPES%' OR immatriculation LIKE 'U1TYPES%'`,
  )) as unknown as Row[];
  for (const v of vehs) {
    await db.execute(sql`DELETE FROM ordres_reparation WHERE vehicule_id = ${v.id}`);
    await db.execute(sql`DELETE FROM parking_vehicles WHERE vehicule_id = ${v.id}`);
  }
  await db.execute(
    sql`DELETE FROM vehicules WHERE immat_norm LIKE 'U1TYPES%' OR immatriculation LIKE 'U1TYPES%'`,
  );
  // Le client du lot doit partir avec ses dossiers : laissé en place, il rend
  // le test non rejouable — la seconde exécution se heurte à sa propre fixture
  // et est refusée pour doublon, sans qu'aucune erreur ne pointe vers la vraie
  // cause.
  await db.execute(sql`DELETE FROM clients WHERE nom = 'Client LotU1'`);
}

/** Purge complète : véhicules + fixtures RBAC. */
async function retirer(): Promise<void> {
  await retirerVehicules();
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(
    sql`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code = ${ROLE_CODE})`,
  );
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`);
  userId = 0;
}

/** Crée un véhicule de fixture avec un type de véhicule donné. */
async function creerVehicule(immat: string, typeVehicule: string, agenceId = 1): Promise<void> {
  // `ON CONFLICT (agence_id, immat_norm)` est INUTILISABLE ici : l'index unique
  // `uq_vehicules_agence_immat_norm` est PARTIEL (WHERE immat_norm IS NOT NULL)
  // et PostgreSQL refuse d'inférer l'arbitre. On passe par un garde NOT EXISTS.
  await db.execute(
    sql`INSERT INTO vehicules (agence_id, immatriculation, immat_norm, marque, type_vehicule)
        SELECT ${agenceId}, ${immat}, ${immat}, 'LotU1', ${typeVehicule}
        WHERE NOT EXISTS (
          SELECT 1 FROM vehicules v WHERE v.agence_id = ${agenceId} AND v.immat_norm = ${immat}
        )`,
  );
}

describe("LOT U1 — type de véhicule en combobox (E7)", () => {
  it("1-2. liste de référence toujours présente, avec libellés humanisés (RD6)", async () => {
    const caller = vehiculesRouter.createCaller(ctxSuperadmin());

    const res = await caller.typesUtilises();

    // La liste fermée est toujours servie : jamais de combobox vide.
    for (const t of TYPES_VEHICULE) {
      expect(res.valeurs).toContain(t);
    }
    // La valeur reste snake_case (aucune migration), l'affichage est propre.
    const poidsLourd = res.options.find((o) => o.valeur === "poids_lourd");
    expect(poidsLourd).toBeDefined();
    expect(poidsLourd!.libelle).toBe("Poids lourd");
    const voiture = res.options.find((o) => o.valeur === "voiture");
    expect(voiture!.libelle).toBe("Voiture");
  });

  it("3. un type réellement utilisé par l'agence remonte dans les suggestions", async () => {
    const caller = vehiculesRouter.createCaller(ctxSuperadmin());

    // Saisie libre historique : « benne_littere » n'est PAS dans la liste.
    expect((TYPES_VEHICULE as readonly string[]).includes(TYPE_HORS_LISTE)).toBe(false);
    await creerVehicule("U1TYPES-001", TYPE_HORS_LISTE);

    const res = await caller.typesUtilises();
    expect(res.valeurs).toContain(TYPE_HORS_LISTE);
    const opt = res.options.find((o) => o.valeur === TYPE_HORS_LISTE);
    expect(opt).toBeDefined();
    expect(opt!.libelle).toBe("Benne littere");
  });

  it("4. isolation agence : un type d'une autre agence n'est pas proposé", async () => {
    const caller = vehiculesRouter.createCaller(ctxSuperadmin());
    await creerVehicule("U1TYPES-002", "autobus_tourisme", 2);

    const res = await caller.typesUtilises();
    expect(res.valeurs).not.toContain("autobus_tourisme");
  });

  it("5. la valeur combobox est persistée telle quelle par or.receptionner (saisie libre)", async () => {
    const orCaller = orRouter.createCaller(ctxSuperadmin());

    const r = await orCaller.receptionner({
      client: { nom: "Client LotU1", telephone: "690400777" },
      vehicule: { immatriculation: "U1TYPES-003", typeVehicule: "benne_littere" },
      reception: { kilometrageEntree: 1000, pannesDeclarees: "Freins" },
    });

    expect(r.vehiculeId).toBeGreaterThan(0);
    const rows = (await db.execute(
      sql`SELECT type_vehicule FROM vehicules WHERE id = ${r.vehiculeId}`,
    )) as unknown as Row[];
    expect(rows[0]?.type_vehicule).toBe(TYPE_HORS_LISTE);
  });

  it("6. libelleTypeVehicule : fonction pure (snake_case, majuscules, espaces, vide)", () => {
    expect(libelleTypeVehicule("poids_lourd")).toBe("Poids lourd");
    expect(libelleTypeVehicule("VOITURE")).toBe("Voiture");
    expect(libelleTypeVehicule("utilitaire")).toBe("Utilitaire");
    expect(libelleTypeVehicule("benne_littere")).toBe("Benne littere");
    expect(libelleTypeVehicule("  spaced   out ")).toBe("Spaced out");
    expect(libelleTypeVehicule("")).toBe("");
    expect(libelleTypeVehicule(null)).toBe("");
    expect(libelleTypeVehicule(undefined)).toBe("");
  });
});
