/**
 * LOT A1 (E14, RD9) — Scheduler d'alertes parking.
 *
 * P1-3 : les alertes n'étaient calculées que sur action manuelle. Ce lot rend
 * l'analyse périodique, SANS réintroduire les deux pièges classiques d'un
 * timer en serveur d'application :
 *
 *  - le timer ne doit jamais faire tomber le process (une exception non
 *    surveillée dans `setInterval` tue Node) ;
 *  - les tours ne doivent pas s'empiler si un tour dépasse la période.
 *
 * On teste donc le CŒUR (`analyserParkingAlertes`, sans contexte utilisateur)
 * et les GARDE-FOUS du scheduler (démarrage unique, arrêt, état).
 *
 * Fixtures RBAC réelles, namespace `a1scheduler`.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { garageRouter } from "~/server/api/routers/garage-router";
import {
  analyserParkingAlertes,
  ensureAlertesScheduler,
  arreterAlertesScheduler,
  etatSchedulerAlertes,
  PERIODE_DEFAUT_MIN,
  PERIODE_MIN_MIN,
} from "~/server/lib/parking-alertes-scheduler";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "a1scheduler";
const ROLE_CODE = `${NS}_garage`;
const USER_EMAIL = `${NS}.garage@gpj.cm`;
const NUM_REGISTRE = 9801;

type Row = Record<string, unknown>;

let userId = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "A1 superadmin",
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
        VALUES (${ROLE_CODE}, 'LotA1 scheduler', 'Fixture LotA1', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[];
  if (!role?.id) throw new Error(`Fixtures ${NS} : rôle introuvable.`);
  const u = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'A1SCH', 'Fixture', 1, ${role.id}::uuid, true, 'active')
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

beforeEach(async () => {
  await retirerDonnees();
  arreterAlertesScheduler();
});
afterAll(async () => {
  arreterAlertesScheduler();
  await retirer();
});

async function retirerDonnees(): Promise<void> {
  const pv = (await db.execute(
    sql`SELECT id FROM parking_vehicles WHERE num_registre = ${NUM_REGISTRE}`,
  )) as unknown as Row[];
  for (const v of pv) {
    await db.execute(sql`DELETE FROM parking_alerts WHERE vehicle_id = ${v.id}`);
    await db.execute(sql`DELETE FROM parking_movements WHERE vehicle_id = ${v.id}`);
  }
  await db.execute(sql`DELETE FROM parking_vehicles WHERE num_registre = ${NUM_REGISTRE}`);
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

/** Véhicule garé depuis `jours` jours → déclenche une alerte d'immobilisation. */
async function fixtureVehiculeAncien(jours: number): Promise<number> {
  const [v] = (await db.execute(
    sql`INSERT INTO parking_vehicles (agence_id, num_registre, immatriculation, marque, statut, date_entree, created_at)
        VALUES (1, ${NUM_REGISTRE}, 'A1SCHED-01', 'LotA1', 'EN_TRAVAUX',
                now() - ${jours}::int * interval '1 day', now() - ${jours}::int * interval '1 day')
        RETURNING id`,
  )) as unknown as Row[];
  return Number(v.id);
}

const alertes = async (vehiculeId: number) =>
  (await db.execute(
    sql`SELECT code, statut, cloturee_par FROM parking_alerts WHERE vehicle_id = ${vehiculeId} ORDER BY code`,
  )) as unknown as { code: string; statut: string; cloturee_par: number | null }[];

describe("LOT A1 — scheduler d'alertes parking", () => {
  it("1. le cœur opens les alertes Sans contexte utilisateur", async () => {
    const vehiculeId = await fixtureVehiculeAncien(60);
    const r = await analyserParkingAlertes(db, 1);
    expect(r.vehiculesAnalyses).toBeGreaterThan(0);
    expect(r.creees).toBeGreaterThan(0);
    const a = await alertes(vehiculeId);
    expect(a.length).toBeGreaterThan(0);
    expect(a[0].statut).toBe("OUVERTE");
    // Aucun utilisateur : la clôture automatique n'attribue personne.
    expect(a[0].cloturee_par).toBeNull();
  });

  it("2. IDEMPOTENT — un second passage ne recrée pas d'alerte", async () => {
    const vehiculeId = await fixtureVehiculeAncien(60);
    const r1 = await analyserParkingAlertes(db, 1);
    const count1 = (await alertes(vehiculeId)).length;
    const r2 = await analyserParkingAlertes(db, 1);

    // Le scheduler repasse toutes les heures : la table ne doit pas grossir.
    expect(r2.creees).toBe(0);
    expect(r2.cloturees).toBe(0);
    expect((await alertes(vehiculeId)).length).toBe(count1);
    expect(r1.creees).toBeGreaterThan(0);
  });

  it("3. le bouton manuel et le scheduler appellent le MÊME cœur", async () => {
    const vehiculeId = await fixtureVehiculeAncien(60);
    const garage = garageRouter.createCaller(ctxSuperadmin());

    const r = await garage.analyser({});
    expect(r.vehiculesAnalyses).toBeGreaterThan(0);
    expect((await alertes(vehiculeId)).length).toBeGreaterThan(0);
  });

  it("4. le scheduler démarre UNE SEULE FOIS par process", async () => {
    expect(etatSchedulerAlertes().actif).toBe(false);
    const premier = await ensureAlertesScheduler({ agences: [1], periodeMin: PERIODE_MIN_MIN });
    expect(premier).toBe(true);
    expect(etatSchedulerAlertes().actif).toBe(true);

    // Un deuxième appel ne crée pas un second timer.
    const second = await ensureAlertesScheduler({ agences: [1], periodeMin: PERIODE_MIN_MIN });
    expect(second).toBe(false);
    expect(etatSchedulerAlertes().actif).toBe(true);

    arreterAlertesScheduler();
    expect(etatSchedulerAlertes().actif).toBe(false);
  });

  it("5. aucune agence connue → aucun timer inutile", async () => {
    // Un timer qui tourne pour rien est un timer à maintenir.
    const demarre = await ensureAlertesScheduler({ agences: [] });
    expect(demarre).toBe(false);
    expect(etatSchedulerAlertes().actif).toBe(false);
  });

  it("6. les seuils par défaut sont bornés (RD9 : 60 min, plancher 1 min)", () => {
    expect(PERIODE_DEFAUT_MIN).toBe(60);
    expect(PERIODE_MIN_MIN).toBe(1);
  });
});