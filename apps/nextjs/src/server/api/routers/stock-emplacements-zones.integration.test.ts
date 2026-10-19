import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

/**
 * ÉTAPES 4.1 — ZONES FONCTIONNELLES ET CAPACITÉ (Lot 1, migration 0029).
 *
 * Un emplacement porte sa FONCTION (`zone_stockage`) indépendamment de
 * son type physique (RAYON, BAC…) : le bac de contrôle qualité est un bac
 * en QUARANTAINE. Ce test prouve :
 *
 *  1. PROTOCOLE : le fichier 0029 s'exécute ENTIER (DO compris) en une
 *     instruction et est REJOUABLE sans exception — deux passages de suite.
 *  2. L'API : `createEmplacement` persiste la zone et la capacité telles
 *     que saisies, avec NORMAL par défaut quand on ne la précise pas.
 *  3. `updateEmplacement` change la zone et peut retirer la capacité
 *     (NULL = aucune limite définie).
 *  4. La barrière : une zone hors liste est refusée au niveau base (CHECK).
 */

vi.mock("@atelierone/auth", () => ({}));

const { stockRouter } = await import("~/server/api/routers/stock");

const SQL_TEST = postgres(
  process.env.DATABASE_URL_TEST ??
    "postgres://postgres:postgres@localhost:5432/atelierone_erp_test",
  { max: 1, prepare: false },
);

const FICHIER = fileURLToPath(
  new URL(
    "../../../../../../packages/db/drizzle/0029_emplacements_stockage.sql",
    import.meta.url,
  ),
);
const DDL = readFileSync(FICHIER, "utf8");

const NS = `z9${Date.now().toString(36)}`;
const AGENCE = 1;
let userId = 100;

function ctx() {
  const user = {
    id: String(userId),
    name: "Z9 Zones",
    email: `${NS}@gpj.cm`,
    agenceId: AGENCE,
    agenceName: "GPJ",
    organizationId: String(AGENCE),
    role: "superadmin",
    permissions: ["stock.modifier"],
    isActive: true,
    status: "active",
  };
  return {
    headers: new Headers(),
    user,
    session: { user, expires: "2099-01-01T00:00:00.000Z" },
  } as never;
}

async function lireParCode(code: string) {
  const r = await SQL_TEST<{ zone_stockage: string; capacite: number | null }[]>`
    SELECT zone_stockage, capacite
      FROM emplacements
     WHERE agence_id = ${AGENCE} AND code = ${code}`;
  return r[0] ?? null;
}

let emplacementIdRef = 0;

beforeAll(async () => {
  // 1er passage : crée tout ce qui manque. 2e passage : IDEMPOTENCE — le
  // protocole `migrate:sql` rejouera aussi, aucune exception tolérée.
  await SQL_TEST.unsafe(DDL);
  await SQL_TEST.unsafe(DDL);

  // Un utilisateur réel (motif q-journal) : les logs d'audit persistaient
  // un FK bruité avec un id de fixture autrement.
  const [u] = (await SQL_TEST<{ id: string }[]>`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'Z9', 'Zones', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`) as unknown as { id: string }[];
  userId = Number(u!.id);
});

afterAll(async () => {
  // Un emplacement de test n'a ni stock, ni mouvement, ni fichier : il part.
  // La contrainte postes_vente n'est pas concernée : aucun poste créé ici.
  await SQL_TEST`DELETE FROM emplacements WHERE agence_id = ${AGENCE} AND code LIKE ${`${NS}%`}`;
  await SQL_TEST.end({ timeout: 5 });
});

describe("etapes 4.1 — zones et capacité des emplacements", () => {
  it("la migration s'applique en une instruction, deux fois, en posant la règle", async () => {
    const legs = await SQL_TEST<{ n: number }[]>`
      SELECT count(*)::int AS n
        FROM pg_constraint
       WHERE conname = 'emplacements_zone_stockage_check'`;
    expect(legs[0]!.n).toBe(1);
    const cols = await SQL_TEST<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'emplacements' AND column_name = 'zone_stockage'
      ) AS exists`;
    expect(cols[0]!.exists).toBe(true);
  });

  it("createEmplacement persiste la zone et la capacité, NORMAL par défaut", async () => {
    const code = `${NS}-REC01`;
    await stockRouter.createCaller(ctx()).createEmplacement({
      code,
      libelle: "Zone de réception de test",
      type: "ZONE",
      zoneStockage: "RECEPTION",
      capacite: 12,
    });
    const lu = await lireParCode(code);
    expect(lu!.zone_stockage).toBe("RECEPTION");
    expect(lu!.capacite).toBe(12);

    // Sans zone précisée : NORMAL — l'hypothèse prudente de la base.
    const codeDefaut = `${NS}-NRM02`;
    await stockRouter.createCaller(ctx()).createEmplacement({
      code: codeDefaut,
      type: "RAYON",
    });
    const luDefaut = await lireParCode(codeDefaut);
    expect(luDefaut!.zone_stockage).toBe("NORMAL");

    const [racine] = await SQL_TEST<{ id: number }[]>`
      SELECT id FROM emplacements WHERE code = ${code}`;
    emplacementIdRef = Number(racine!.id);
  });

  it("updateEmplacement change la zone et retire la capacité (NULL = illimité)", async () => {
    expect(emplacementIdRef).toBeGreaterThan(0);
    await stockRouter.createCaller(ctx()).updateEmplacement({
      id: emplacementIdRef,
      zoneStockage: "QUARANTAINE",
      capacite: 25,
    });
    const lu = await lireParCode(`${NS}-REC01`);
    expect(lu!.zone_stockage).toBe("QUARANTAINE");
    expect(lu!.capacite).toBe(25);

    await stockRouter.createCaller(ctx()).updateEmplacement({
      id: emplacementIdRef,
      capacite: null,
    });
    const sansLimite = await lireParCode(`${NS}-REC01`);
    expect(sansLimite!.capacite).toBeNull();
  });

  it("une zone hors liste est refusée par la base (CHECK)", async () => {
    const essai = SQL_TEST`
      INSERT INTO emplacements (agence_id, code, type, zone_stockage)
      VALUES (${AGENCE}, ${`${NS}-KO`}, 'BAC', 'PLACARD')`;
    await expect(essai).rejects.toThrow();
    const [reste] = await SQL_TEST<{ n: number }[]>`
      SELECT count(*)::int AS n
        FROM emplacements WHERE code = ${`${NS}-KO`}`;
    expect(reste!.n).toBe(0);
  });
});
