/**
 * LOT 1 — Liaison parking_vehicles ↔ vehicules (dé-duplication, patch 5).
 *
 * Garanties testées contre la base de test :
 *
 *  1. T1.5 — `garage.create` crée/retrouve le véhicule canonique par
 *     immatriculation normalisée et écrit `vehicule_id` ; sans immatriculation,
 *     AUCUNE ligne n'est inventée (vehicule_id reste NULL).
 *  2. T1.5 — projection synchronisée dans les deux sens :
 *     parking → `statut_immobilisation` (garage.update),
 *     `statut_immobilisation` → parking (vehicules.changerStatut).
 *     Un statut sans équivalent exact (EN_VENTE) n'écrit JAMAIS l'autre table.
 *  3. T1.5 — changement d'immatriculation = (ré)liation au bon canonique ;
 *     identité partagée (marque/modele…) synchronisée dans les deux sens.
 *  4. T1.3 — le script de backfill `migrate-parking-vehicules.ts` lie les
 *     lignes existantes par normalisation, crée les canons manquants
 *     (projection P2I) et, depuis la migration 0011, crée AUSSI un canon pour
 *     les lignes sans immatriculation — sans jamais inventer de plaque.
 *
 * Fixtures RBAC réelles (roles / utilisateurs) : mêmes règles que
 * or-lot0.integration.test.ts — namespace `lot1`, bande de registre 9000-9999.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `next-auth` n'est pas resolvable hors de Next — on ne mocke QUE le
// transport d'authentification ; le RBAC reste réel.
vi.mock("@atelierone/auth", () => ({}));

import { garageRouter } from "~/server/api/routers/garage-router";
import { vehiculesRouter } from "~/server/api/routers/vehicules-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "lot1";
const ROLE_CODE = `${NS}_parking`;
const USER_EMAIL = `${NS}.parking@gpj.cm`;
const NUM_MIN = 9000;
const NUM_MAX = 9999;

const I_CREATE = "LOT1-CREATE-01";
const I_CANON2 = "LOT1-CANON2";
const I_RELINK = "LOT1-RELINK";
const I_BF_EXIST = "LOT1-BFEX";
const I_BF_NEW = "LOT1-BFNEW";
const IMMATS = [I_CREATE, I_CANON2, I_RELINK, I_BF_EXIST, I_BF_NEW];

type Row = Record<string, unknown>;

const IN = (valeurs: readonly string[]) =>
  sql.join(
    valeurs.map((v) => sql`${v}`),
    sql`, `,
  );

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..", "..");
const SCRIPT_BACKFILL = path.join(REPO, "packages", "db", "src", "migrate-parking-vehicules.ts");

let userId = 0;
let canon2Id = 0;
let rowCreateId = 0;
let rowNoPlateId = 0;
let rowRelinkId = 0;
let canonCreateId = 0;

/** Contexte forge « superadmin » : profil réel (FK valide) + rôle forge. */
function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "Lot1 superadmin",
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

/** Résolution du binaire tsx sans shell (miroir de findBin, scripts/dburl.mjs). */
function trouverTsx(): string {
  let dir = HERE;
  for (;;) {
    const pkgPath = path.join(dir, "node_modules", "tsx", "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        bin?: string | Record<string, string>;
      };
      const rel =
        typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.tsx ?? Object.values(pkg.bin ?? {})[0];
      if (rel) return path.join(path.dirname(pkgPath), rel);
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Lot1 : binaire tsx introuvable.");
}

/** Exécute le script de backfill contre la base de test (DATABASE_URL vitest). */
function lancerBackfill(): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [trouverTsx(), SCRIPT_BACKFILL], {
    cwd: path.join(REPO, "packages", "db"),
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL, FORCE: undefined },
    encoding: "utf8",
    timeout: 15000,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

async function parkingDe(id: number): Promise<Row> {
  const rows = (await db.execute(
    sql`SELECT id, vehicule_id, statut, immatriculation, marque, modele FROM parking_vehicles WHERE id = ${id}`,
  )) as unknown as Row[];
  return rows[0] ?? {};
}

async function vehiculeDe(id: number): Promise<Row> {
  const rows = (await db.execute(
    sql`SELECT id, immatriculation, immat_norm, marque, modele, statut_immobilisation, notes FROM vehicules WHERE id = ${id}`,
  )) as unknown as Row[];
  return rows[0] ?? {};
}

async function vehiculeParImmat(immat: string): Promise<Row | undefined> {
  const rows = (await db.execute(
    sql`SELECT id, statut_immobilisation, notes FROM vehicules
        WHERE upper(regexp_replace(btrim(immatriculation), '[[:space:]]+', '', 'g')) = ${immat}`,
  )) as unknown as Row[];
  return rows[0];
}

beforeAll(async () => {
  await retirer();

  // Utilisateur réel : FK de parking_movements.user_id (garage.create).
  await db.execute(
    sql`INSERT INTO roles (code, nom, description, niveau)
        VALUES (${ROLE_CODE}, 'Lot1 Parking', 'Fixture Lot1', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(
    sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`,
  )) as unknown as Row[];
  const roleId = role?.id;
  if (!roleId) throw new Error(`Fixtures ${NS} : role ${ROLE_CODE} introuvable.`);

  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'LOT1', 'Fixture', 1, ${roleId}::uuid, true, 'active')
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

  // Canonique cible de la (ré)liation : existe AVANT la ligne parking.
  const [canon2] = (await db.execute(
    sql`INSERT INTO vehicules (agence_id, immatriculation, marque, modele, statut_immobilisation)
        VALUES (1, ${I_CANON2}, 'Cible', 'Avant', 'en_reception')
        RETURNING id`,
  )) as unknown as Row[];
  canon2Id = Number(canon2.id);
});

afterAll(async () => {
  await retirer();
});

/** Nettoyage cible du namespace Lot1 (idempotent, avant et après). */
async function retirer(): Promise<void> {
  await db.execute(
    sql`DELETE FROM parking_movements
        WHERE vehicle_id IN (SELECT id FROM parking_vehicles WHERE num_registre BETWEEN ${NUM_MIN} AND ${NUM_MAX})`,
  );
  await db.execute(
    sql`DELETE FROM parking_vehicles WHERE num_registre BETWEEN ${NUM_MIN} AND ${NUM_MAX}`,
  );
  await db.execute(
    sql`DELETE FROM vehicules
        WHERE upper(regexp_replace(btrim(immatriculation), '[[:space:]]+', '', 'g')) IN (${IN(IMMATS)})`,
  );
  // FK : audit puis utilisateur AVANT le rôle qu'il référence.
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(
    sql`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code = ${ROLE_CODE})`,
  );
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`);
  userId = 0;
  canon2Id = 0;
  rowCreateId = 0;
  rowNoPlateId = 0;
  rowRelinkId = 0;
  canonCreateId = 0;
}

describe("Lot 1 — dé-duplication parking ↔ véhicules", () => {
  it("T1.5 — création : lien vers le canonique créé, statut projeté", async () => {
    const caller = garageRouter.createCaller(ctxSuperadmin());
    const created = await caller.create({
      numRegistre: 9001,
      immatriculation: I_CREATE,
      marque: "Toyota",
      modele: "Corolla",
      statut: "EN_PARKING",
    });
    rowCreateId = created.id;

    const p = await parkingDe(rowCreateId);
    expect(p.vehicule_id).not.toBeNull();
    canonCreateId = Number(p.vehicule_id);

    const v = await vehiculeDe(canonCreateId);
    expect(v.immatriculation).toBe(I_CREATE);
    // Projection EN_PARKING → en_reception au moment de la création.
    expect(v.statut_immobilisation).toBe("en_reception");
    expect(String(v.notes)).toContain("registre parking");
  });

  it("T1.5 — création sans immatriculation : aucun véhicule inventé", async () => {
    const caller = garageRouter.createCaller(ctxSuperadmin());
    const created = await caller.create({
      numRegistre: 9002,
      marque: "Sans",
      modele: "Plaque",
      notes: "LOT1-FIXTURE sans immatriculation",
    });
    rowNoPlateId = created.id;

    const p = await parkingDe(rowNoPlateId);
    expect(p.vehicule_id).toBeNull();
  });

  it("T1.5 — vehicules.changerStatut projette vers le registre parking", async () => {
    const caller = vehiculesRouter.createCaller(ctxSuperadmin());
    await caller.changerStatut({ id: canonCreateId, nouveauStatut: "en_diagnostic" });

    const p = await parkingDe(rowCreateId);
    expect(p.statut).toBe("EN_ATTENTE_DIAGNOSTIC");

    // La ligne sans lien n'est jamais touchée.
    const pNoPlate = await parkingDe(rowNoPlateId);
    expect(pNoPlate.vehicule_id).toBeNull();
  });

  it("T1.5 — garage.update (statut) projette vers le canonique", async () => {
    const caller = garageRouter.createCaller(ctxSuperadmin());
    await caller.update({ id: rowCreateId, statut: "EN_TRAVAUX" });

    const v = await vehiculeDe(canonCreateId);
    expect(v.statut_immobilisation).toBe("en_reparation");
  });

  it("T1.5 — EN_VENTE : le canonique porte enfin l'état qu'il vivait", async () => {
    const caller = garageRouter.createCaller(ctxSuperadmin());
    await caller.update({ id: rowCreateId, statut: "EN_VENTE" });

    // ÉTAPE 3. Ce test affirmait `en_reparation` — c'est-à-dire « le parking
    // dit EN_VENTE, l'atelier dit en réparation ». Deux vérités contradictoires
    // sur le même véhicule, et rien ne le signalait.
    //
    // L'ancien raisonnement était « n'invente pas d'état qui n'a pas
    // d'équivalent ». Le sophisme : `null` ne veut pas dire « n'invente rien »,
    // il veut dire « n'écris rien » — donc GARDER le statut précédent, qui est
    // lui faux. Le pire des deux, parce qu'invisible.
    //
    // EN_VENTE est une situation réelle du garage, pas une invention. Elle a
    // maintenant un nom.
    const v = await vehiculeDe(canonCreateId);
    expect(v.statut_immobilisation).toBe("en_vente");
    const p = await parkingDe(rowCreateId);
    expect(p.statut).toBe("EN_VENTE");
  });

  it("T1.5 — changement d'immatriculation : (ré)lié au bon canonique", async () => {
    const caller = garageRouter.createCaller(ctxSuperadmin());
    const created = await caller.create({
      numRegistre: 9003,
      immatriculation: I_RELINK,
      marque: "Avant",
    });
    rowRelinkId = created.id;

    const avant = await parkingDe(rowRelinkId);
    expect(Number(avant.vehicule_id)).not.toBe(canon2Id);

    await caller.update({ id: rowRelinkId, immatriculation: I_CANON2 });
    const apres = await parkingDe(rowRelinkId);
    expect(Number(apres.vehicule_id)).toBe(canon2Id);
  });

  it("T1.5 — identité partagée synchronisée dans les deux sens", async () => {
    const garage = garageRouter.createCaller(ctxSuperadmin());
    await garage.update({ id: rowRelinkId, marque: "Renault" });
    const canon2 = await vehiculeDe(canon2Id);
    expect(canon2.marque).toBe("Renault");

    const vehicules = vehiculesRouter.createCaller(ctxSuperadmin());
    await vehicules.update({ id: canon2Id, modele: "BerlineX" });
    const p = await parkingDe(rowRelinkId);
    expect(p.modele).toBe("BerlineX");
  });

  it("T1.3 — backfill : apparie, crée les canons manquants, laisse NULL sans immat", async () => {
    // Canonique existant avec immatriculation mal normalisée (espaces + minuscules).
    const [bfCanon] = (await db.execute(
      sql`INSERT INTO vehicules (agence_id, immatriculation, marque, statut_immobilisation)
          VALUES (1, ${"  lot1-bfex  "}, 'BF', 'en_reception')
          RETURNING id`,
    )) as unknown as Row[];
    const bfCanonId = Number(bfCanon.id);

    // Trois lignes du registre, non liées : à apparier, à créer, sans plaque.
    const insererLigne = async (num: number, immat: string | null, statut: string): Promise<number> => {
      const [row] = (await db.execute(
        sql`INSERT INTO parking_vehicles (agence_id, num_registre, immatriculation, statut, notes)
            VALUES (1, ${num}, ${immat}, ${statut}, 'LOT1-FIXTURE backfill')
            RETURNING id`,
      )) as unknown as Row[];
      return Number(row.id);
    };
    const ligneExist = await insererLigne(9010, I_BF_EXIST, "EN_PARKING");
    const ligneNew = await insererLigne(9011, I_BF_NEW, "EN_TRAVAUX");
    const ligneSans = await insererLigne(9012, null, "EN_PARKING");

    expect((await parkingDe(ligneExist)).vehicule_id).toBeNull();
    expect((await parkingDe(ligneNew)).vehicule_id).toBeNull();

    const r = lancerBackfill();
    expect(r.status, `backfill échoué :\n${r.stdout}\n${r.stderr}`).toBe(0);

    // 1. Appariement par immatriculation normalisée → canonique préexistant.
    expect(Number((await parkingDe(ligneExist)).vehicule_id)).toBe(bfCanonId);

    // 2. Canonique créé (projection EN_TRAVAUX → en_reparation) + lié.
    const pNew = await parkingDe(ligneNew);
    expect(pNew.vehicule_id).not.toBeNull();
    const canonNew = await vehiculeDe(Number(pNew.vehicule_id));
    expect(canonNew.statut_immobilisation).toBe("en_reparation");
    expect(String(canonNew.notes)).toContain("Lot 1");

    // 3. Sans immatriculation : le canon est CRÉÉ (migration 0011) mais sa
    //    plaque reste NULL. L'absence d'invention ne se prouve donc plus par
    //    « aucune fiche », mais par « une fiche dont la plaque n'a pas été
    //    remplie » — c'est la garantie qui compte réellement.
    const pSans = await parkingDe(ligneSans);
    expect(pSans.vehicule_id).not.toBeNull();
    const canonSans = await vehiculeDe(Number(pSans.vehicule_id));
    expect(canonSans.immatriculation).toBeNull();
    expect(canonSans.immat_norm).toBeNull();
    expect(String(canonSans.notes)).toContain(`parking_id=${ligneSans}`);

    await db.execute(
      sql`DELETE FROM parking_vehicles WHERE id IN (${IN([
        String(ligneExist),
        String(ligneNew),
        String(ligneSans),
      ])})`,
    );
    await vehiculeParImmat(I_BF_NEW).then(async (v) => {
      if (v) await db.execute(sql`DELETE FROM vehicules WHERE id = ${Number(v.id)}`);
    });
    await db.execute(sql`DELETE FROM vehicules WHERE id = ${bfCanonId}`);
  });
});
