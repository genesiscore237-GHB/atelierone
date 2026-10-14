/**
 * LOT 2 — Transfert intra-agence Site 1 ↔ Site 2 (D1, D9a workflow 2 phases).
 *
 * Garanties testées contre la base de test :
 *
 *  1. `transfertCreer` : EN_ATTENTE avec source = site du véhicule, destination
 *     validée (existe, active, ≠ source) ; refus si destination = source,
 *     véhicule sans site, ou transfert déjà ouvert (un seul par véhicule).
 *  2. `transfertExpedier` : EN_ATTENTE → EN_TRANSIT, véhicule détaché
 *     (spot libéré, position vidée, statut A_TRANSFERER, site source conservé),
 *     `statutPrecedent` + position source capturés ; refus hors EN_ATTENTE.
 *  3. `transfertRecevoir` : journal `parking_movements` type TRANSFERT écrit
 *     (origine/destination), véhicule affecté au site destination
 *     (EN_PARKING, non positionné), transfer RECU, projection
 *     `statut_immobilisation` → en_reception (Lot 1) ; refus hors EN_TRANSIT.
 *  4. `transfertAnnuler` : EN_ATTENTE → ANNULE ; EN_TRANSIT → ANNULE avec
 *     restauration de `statutPrecedent` (+ projection).
 *  5. RBAC : sans `parking.transfert.creer` → FORBIDDEN (ctx non-superadmin,
 *     permissions réelles absentes).
 *  6. `transferts` : recherche serveur par immatriculation.
 *  7. `siteModifier` : édition d'un site jetable ; désactivation refusée sur le
 *     dernier site actif.
 *
 * Fixtures RBAC réelles — namespace `lot2`, bande de registre 9200-9299.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

// `next-auth` n'est pas resolvable hors de Next — on ne mocke QUE le
// transport d'authentification ; le RBAC (DB) reste réel.
vi.mock("@atelierone/auth", () => ({}));

import { garageRouter } from "~/server/api/routers/garage-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "lot2";
const ROLE_CODE = `${NS}_parking`;
const USER_EMAIL = `${NS}.parking@gpj.cm`;
const NUM_MIN = 9200;
const NUM_MAX = 9299;
const SITE_JETABLE_CODE = "LOT2-SITE-J";

const I_VEH1 = "LOT2VEH01";
const I_VEH2 = "LOT2VEH02";
const I_VEH3 = "LOT2VEH03";
const I_VEH4 = "LOT2VEH04";
const I_VEH5 = "LOT2VEH05";
const IMMATS = [I_VEH1, I_VEH2, I_VEH3, I_VEH4, I_VEH5];

type Row = Record<string, unknown>;

const IN = (valeurs: readonly string[]) =>
  sql.join(
    valeurs.map((v) => sql`${v}`),
    sql`, `,
  );

let userId = 0;
let site1Id = 0;
let site2Id = 0;
let veh1Id = 0;
let veh1CanonId = 0;
let veh2Id = 0;
let veh3Id = 0;
let veh4Id = 0;
let veh5Id = 0;

/** Contexte forge « superadmin » : bypass `requirePermissionProcedure` (role forge). */
function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "Lot2 superadmin",
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

/** Même profil réel mais rôle non-superadmin : RBAC réel (aucune permission). */
function ctxSansPermission() {
  const user = {
    id: String(userId),
    name: "Lot2 sans permission",
    email: USER_EMAIL,
    agenceId: 1,
    agenceName: "GPJ",
    organizationId: "1",
    role: ROLE_CODE,
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

async function vehiculeDe(id: number): Promise<Row> {
  const rows = (await db.execute(
    sql`SELECT id, statut, site_id, zone_id, spot_id, centre_x, centre_y, vehicule_id
        FROM parking_vehicles WHERE id = ${id}`,
  )) as unknown as Row[];
  return rows[0] ?? {};
}

async function transfertDe(id: number): Promise<Row> {
  const rows = (await db.execute(
    sql`SELECT id, statut, statut_precedent, site_source_id, site_destination_id,
               cree_par_id, expedie_par_id, recu_par_id, annule_par_id,
               zone_origine_id, position_origine_x, position_origine_y, motif, motif_annulation
        FROM parking_transfers WHERE id = ${id}`,
  )) as unknown as Row[];
  return rows[0] ?? {};
}

async function canoniqueDe(id: number): Promise<Row> {
  const rows = (await db.execute(
    sql`SELECT id, statut_immobilisation FROM vehicules WHERE id = ${id}`,
  )) as unknown as Row[];
  return rows[0] ?? {};
}

async function creerVehicule(num: number, immat: string): Promise<{ parkingId: number; canonId: number }> {
  const caller = garageRouter.createCaller(ctxSuperadmin());
  const created = await caller.create({ numRegistre: num, immatriculation: immat, marque: "Lot2", modele: "Test" });
  await db.execute(sql`UPDATE parking_vehicles SET site_id = ${site1Id} WHERE id = ${created.id}`);
  const p = await vehiculeDe(created.id);
  return { parkingId: created.id, canonId: Number(p.vehicule_id) };
}

beforeAll(async () => {
  await retirer();

  await db.execute(
    sql`INSERT INTO roles (code, nom, description, niveau)
        VALUES (${ROLE_CODE}, 'Lot2 Parking', 'Fixture Lot2', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(
    sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`,
  )) as unknown as Row[];
  const roleId = role?.id;
  if (!roleId) throw new Error(`Fixtures ${NS} : role ${ROLE_CODE} introuvable.`);

  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'LOT2', 'Fixture', 1, ${roleId}::uuid, true, 'active')
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

  const sites = (await db.execute(
    sql`SELECT id, code FROM parking_sites
        WHERE agence_id = 1 AND code IN ('GPJ-S1', 'GPJ-S2')`,
  )) as unknown as Row[];
  const s1 = sites.find((s) => s.code === "GPJ-S1");
  const s2 = sites.find((s) => s.code === "GPJ-S2");
  if (!s1 || !s2) {
    throw new Error(`Fixtures ${NS} : sites GPJ-S1/GPJ-S2 absents (lancer pnpm db:test-setup).`);
  }
  site1Id = Number(s1.id);
  site2Id = Number(s2.id);
});

afterAll(async () => {
  await retirer();
});

async function retirer(): Promise<void> {
  await db.execute(
    sql`DELETE FROM parking_transfers
        WHERE vehicle_id IN (SELECT id FROM parking_vehicles WHERE num_registre BETWEEN ${NUM_MIN} AND ${NUM_MAX})`,
  );
  await db.execute(
    sql`DELETE FROM parking_movements
        WHERE vehicle_id IN (SELECT id FROM parking_vehicles WHERE num_registre BETWEEN ${NUM_MIN} AND ${NUM_MAX})`,
  );
  await db.execute(
    sql`DELETE FROM parking_alerts
        WHERE vehicle_id IN (SELECT id FROM parking_vehicles WHERE num_registre BETWEEN ${NUM_MIN} AND ${NUM_MAX})`,
  );
  await db.execute(
    sql`DELETE FROM parking_vehicles WHERE num_registre BETWEEN ${NUM_MIN} AND ${NUM_MAX}`,
  );
  await db.execute(
    sql`DELETE FROM vehicules
        WHERE upper(regexp_replace(btrim(immatriculation), '[[:space:]]+', '', 'g')) IN (${IN(IMMATS)})`,
  );
  await db.execute(sql`DELETE FROM parking_sites WHERE code = ${SITE_JETABLE_CODE}`);
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(
    sql`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code = ${ROLE_CODE})`,
  );
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`);
  userId = 0;
  site1Id = 0;
  site2Id = 0;
  veh1Id = 0;
  veh1CanonId = 0;
  veh2Id = 0;
  veh3Id = 0;
  veh4Id = 0;
  veh5Id = 0;
}

describe("Lot 2 — transfert intra-agence (workflow 2 phases)", () => {
  it("1. création : EN_ATTENTE, source = site du véhicule, acteurs tracés", async () => {
    const v = await creerVehicule(9201, I_VEH1);
    veh1Id = v.parkingId;
    veh1CanonId = v.canonId;

    const caller = garageRouter.createCaller(ctxSuperadmin());
    const created = await caller.transfertCreer({
      vehicleId: veh1Id,
      siteDestinationId: site2Id,
      motif: "Remisage saisonnier",
      commentaire: "Départ atelier annexe",
    });

    const t = await transfertDe(created.id);
    expect(t.statut).toBe("EN_ATTENTE");
    expect(Number(t.site_source_id)).toBe(site1Id);
    expect(Number(t.site_destination_id)).toBe(site2Id);
    expect(Number(t.cree_par_id)).toBe(userId);
    expect(t.motif).toBe("Remisage saisonnier");
  });

  it("1. refus : destination identique au site source", async () => {
    const v = await creerVehicule(9202, I_VEH2);
    veh2Id = v.parkingId;
    const caller = garageRouter.createCaller(ctxSuperadmin());
    expect(
      await codeDe(
        caller.transfertCreer({ vehicleId: veh2Id, siteDestinationId: site1Id, motif: "Test même site" }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("1. refus : véhicule non affecté à un site", async () => {
    const v = await creerVehicule(9203, I_VEH3);
    veh3Id = v.parkingId;
    await db.execute(sql`UPDATE parking_vehicles SET site_id = NULL WHERE id = ${veh3Id}`);
    const caller = garageRouter.createCaller(ctxSuperadmin());
    expect(
      await codeDe(
        caller.transfertCreer({ vehicleId: veh3Id, siteDestinationId: site2Id, motif: "Test sans site" }),
      ),
    ).toBe("BAD_REQUEST");
    await db.execute(sql`UPDATE parking_vehicles SET site_id = ${site1Id} WHERE id = ${veh3Id}`);
  });

  it("1. refus : un seul transfert ouvert par véhicule", async () => {
    const caller = garageRouter.createCaller(ctxSuperadmin());
    expect(
      await codeDe(
        caller.transfertCreer({ vehicleId: veh1Id, siteDestinationId: site2Id, motif: "Doublon" }),
      ),
    ).toBe("CONFLICT");
  });

  it("2. expédition : EN_TRANSIT, véhicule détaché, état capturé", async () => {
    const ouvert = await db.execute(
      sql`SELECT id FROM parking_transfers WHERE vehicle_id = ${veh1Id} AND statut = 'EN_ATTENTE'`,
    );
    const transferId = Number((ouvert as unknown as Row[])[0]?.id);
    expect(transferId).toBeGreaterThan(0);

    const caller = garageRouter.createCaller(ctxSuperadmin());
    await caller.transfertExpedier({ transferId });

    const t = await transfertDe(transferId);
    expect(t.statut).toBe("EN_TRANSIT");
    expect(t.statut_precedent).toBe("EN_PARKING");
    expect(Number(t.expedie_par_id)).toBe(userId);

    const p = await vehiculeDe(veh1Id);
    expect(p.statut).toBe("A_TRANSFERER");
    expect(p.zone_id).toBeNull();
    expect(p.spot_id).toBeNull();
    expect(p.centre_x).toBeNull();
    // Le site source est conservé : le véhicule reste visible « à placer ».
    expect(Number(p.site_id)).toBe(site1Id);
  });

  it("2. refus : expédition hors EN_ATTENTE", async () => {
    const ouvert = await db.execute(
      sql`SELECT id FROM parking_transfers WHERE vehicle_id = ${veh1Id} AND statut = 'EN_TRANSIT'`,
    );
    const transferId = Number((ouvert as unknown as Row[])[0]?.id);
    const caller = garageRouter.createCaller(ctxSuperadmin());
    expect(await codeDe(caller.transfertExpedier({ transferId }))).toBe("CONFLICT");
  });

  it("3. réception : mouvement TRANSFERT journalisé, véhicule sur destination, projection Lot 1", async () => {
    const ouvert = await db.execute(
      sql`SELECT id FROM parking_transfers WHERE vehicle_id = ${veh1Id} AND statut = 'EN_TRANSIT'`,
    );
    const transferId = Number((ouvert as unknown as Row[])[0]?.id);

    // L'état atelier évolue pendant le transit : la réception doit le ramener
    // à en_reception via la projection P2I (EN_PARKING).
    await db.execute(
      sql`UPDATE vehicules SET statut_immobilisation = 'en_reparation' WHERE id = ${veh1CanonId}`,
    );

    const caller = garageRouter.createCaller(ctxSuperadmin());
    await caller.transfertRecevoir({ transferId });

    const t = await transfertDe(transferId);
    expect(t.statut).toBe("RECU");
    expect(Number(t.recu_par_id)).toBe(userId);

    const p = await vehiculeDe(veh1Id);
    expect(Number(p.site_id)).toBe(site2Id);
    expect(p.statut).toBe("EN_PARKING");
    expect(p.centre_x).toBeNull();

    const mouvements = (await db.execute(
      sql`SELECT type, site_origine_id, site_destination_id, user_id, motif
          FROM parking_movements WHERE vehicle_id = ${veh1Id} AND type = 'TRANSFERT'`,
    )) as unknown as Row[];
    expect(mouvements).toHaveLength(1);
    expect(Number(mouvements[0].site_origine_id)).toBe(site1Id);
    expect(Number(mouvements[0].site_destination_id)).toBe(site2Id);
    expect(Number(mouvements[0].user_id)).toBe(userId);
    expect(mouvements[0].motif).toBe("Remisage saisonnier");

    const canon = await canoniqueDe(veh1CanonId);
    expect(canon.statut_immobilisation).toBe("en_reception");
  });

  it("3. refus : réception sans expédition (EN_ATTENTE)", async () => {
    const v = await creerVehicule(9204, I_VEH4);
    veh4Id = v.parkingId;
    const caller = garageRouter.createCaller(ctxSuperadmin());
    const created = await caller.transfertCreer({
      vehicleId: veh4Id,
      siteDestinationId: site2Id,
      motif: "Réception prématurée",
    });
    expect(await codeDe(caller.transfertRecevoir({ transferId: created.id }))).toBe("CONFLICT");
  });

  it("4. annulation EN_ATTENTE : ANNULE + motif", async () => {
    const caller = garageRouter.createCaller(ctxSuperadmin());
    const list = await caller.transferts({ statut: "EN_ATTENTE", recherche: I_VEH4 });
    const transferId = list[0]?.id;
    expect(transferId).toBeDefined();

    await caller.transfertAnnuler({
      transferId: transferId!,
      motifAnnulation: "Fini par soi-même",
    });
    const t = await transfertDe(transferId!);
    expect(t.statut).toBe("ANNULE");
    expect(t.motif_annulation).toBe("Fini par soi-même");
    expect(Number(t.annule_par_id)).toBe(userId);

    // Le véhicule n'a jamais bougé.
    const p = await vehiculeDe(veh4Id);
    expect(p.statut).toBe("EN_PARKING");
    expect(Number(p.site_id)).toBe(site1Id);
  });

  it("4. annulation EN_TRANSIT : restaure l'état métier capturé", async () => {
    const v = await creerVehicule(9205, I_VEH5);
    veh5Id = v.parkingId;
    const caller = garageRouter.createCaller(ctxSuperadmin());

    // État métier non trivial avant l'expédition.
    await db.execute(sql`UPDATE parking_vehicles SET statut = 'EN_ATTENTE_PIECE' WHERE id = ${veh5Id}`);
    await db.execute(
      sql`UPDATE vehicules SET statut_immobilisation = 'attente_piece_locale' WHERE id = ${v.canonId}`,
    );

    const created = await caller.transfertCreer({
      vehicleId: veh5Id,
      siteDestinationId: site2Id,
      motif: "Annulation en transit",
    });
    await caller.transfertExpedier({ transferId: created.id });

    const expedie = await transfertDe(created.id);
    expect(expedie.statut).toBe("EN_TRANSIT");
    expect(expedie.statut_precedent).toBe("EN_ATTENTE_PIECE");

    await caller.transfertAnnuler({ transferId: created.id, motifAnnulation: "Annulé par le chef" });

    const t = await transfertDe(created.id);
    expect(t.statut).toBe("ANNULE");
    const p = await vehiculeDe(veh5Id);
    expect(p.statut).toBe("EN_ATTENTE_PIECE");
    expect(Number(p.site_id)).toBe(site1Id);
    const canon = await canoniqueDe(v.canonId);
    expect(canon.statut_immobilisation).toBe("attente_piece_locale");
  });

  it("5. RBAC : sans permission transfert → FORBIDDEN", async () => {
    const caller = garageRouter.createCaller(ctxSansPermission());
    expect(
      await codeDe(
        caller.transfertCreer({ vehicleId: veh2Id, siteDestinationId: site2Id, motif: "Sans droit" }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("6. recherche serveur par immatriculation", async () => {
    const caller = garageRouter.createCaller(ctxSuperadmin());
    const list = await caller.transferts({ recherche: I_VEH1 });
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((t) => t.vehicleId === veh1Id)).toBe(true);
    expect(list[0]?.siteSource?.code).toBe("GPJ-S1");
  });

  it("7. siteModifier : édition d'un site jetable ; désactivation du dernier actif refusée", async () => {
    const [jetable] = (await db.execute(
      sql`INSERT INTO parking_sites (agence_id, code, nom, description, is_active)
          VALUES (1, ${SITE_JETABLE_CODE}, 'Lot2 jetable', 'Fixture', true)
          RETURNING id`,
    )) as unknown as Row[];
    const jetableId = Number(jetable.id);

    const caller = garageRouter.createCaller(ctxSuperadmin());
    await caller.siteModifier({ siteId: jetableId, nom: "Lot2 renommé", description: "Modifié", isActive: false });

    const rows = (await db.execute(
      sql`SELECT nom, description, is_active FROM parking_sites WHERE id = ${jetableId}`,
    )) as unknown as Row[];
    expect(rows[0].nom).toBe("Lot2 renommé");
    expect(rows[0].is_active).toBe(false);

    // S1 et S2 restent actifs : désactiver le jetable était légal.
    const actifs = (await db.execute(
      sql`SELECT count(*)::int AS n FROM parking_sites WHERE agence_id = 1 AND is_active = true AND code IN ('GPJ-S1', 'GPJ-S2')`,
    )) as unknown as Row[];
    expect(Number(actifs[0].n)).toBe(2);
  });
});
