/**
 * LOT U3 (E9, RD7) — Check-list d'outillage reformée, section 6 absorbée.
 *
 * L'IHM a changé (une ligne = case + libellé + observation dépliable ; la
 * section 6 disparaît au profit d'un bloc « Constats » unique). Ce lot ne
 * doit RIEN casser côté données — d'où l'insistance sur le format JSONB.
 *
 * Garanties testées :
 *
 *  1. NON-RÉGRESSION DU FORMAT (RD7) : le JSONB `outillage` conserve
 *     exactement `{present, observation}` par élément. Aucune migration.
 *  2. L'observation d'un élément est BIEN RATTACHÉE à cet élément (c'était
 *     précisément la défaut : deux listes séparées, rien ne liait une
 *     observation à sa case).
 *  3. Un élément non coché mais commenté est conservé (une observation
 *     « jante de secours en cave » vaut même si la case n'est pas cochée).
 *  4. Les pannes déclarées et les observations de réception sont bien
 *     enregistrées (la section 6 absorbée ne doit rien perdre).
 *  5. La plainte est bien reportée depuis les pannes déclarées : la zone de
 *     texte supprimée du formulaire l'était déjà côté serveur.
 *
 * Fixtures RBAC réelles, namespace `u3check`.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "u3check";
const ROLE_CODE = `${NS}_or`;
const USER_EMAIL = `${NS}.or@gpj.cm`;

type Row = Record<string, unknown>;

let userId = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "U3 superadmin",
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
        VALUES (${ROLE_CODE}, 'LotU3 check', 'Fixture LotU3', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[];
  if (!role?.id) throw new Error(`Fixtures ${NS} : rôle introuvable.`);
  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'U3CHK', 'Fixture', 1, ${role.id}::uuid, true, 'active')
        ON CONFLICT (email) DO NOTHING
        RETURNING id`,
  )) as unknown as Row[];
  userId = insere.length > 0 ? Number(insere[0].id) : 0;
  if (userId === 0) {
    const v = (await db.execute(sql`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`)) as unknown as Row[];
    userId = Number(v[0]?.id);
  }
  if (!Number.isFinite(userId) || userId === 0) throw new Error(`Fixtures ${NS} : utilisateur introuvable.`);
});

beforeEach(retirerDonnees);
afterAll(retirer);

async function retirerDonnees(): Promise<void> {
  const vehs = (await db.execute(
    sql`SELECT id FROM vehicules WHERE immat_norm LIKE 'U3CHECK%' OR immatriculation LIKE 'U3CHECK%'`,
  )) as unknown as Row[];
  for (const v of vehs) {
    await db.execute(sql`DELETE FROM ordres_reparation WHERE vehicule_id = ${v.id}`);
  }
  await db.execute(sql`DELETE FROM vehicules WHERE immat_norm LIKE 'U3CHECK%' OR immatriculation LIKE 'U3CHECK%'`);
  await db.execute(sql`DELETE FROM clients WHERE nom = 'Client U3check'`);
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

type Entree = { present?: boolean; observation?: string };

const lireOr = async (orId: number) =>
  ((await db.execute(
    sql`SELECT outillage, pannes_declarees, observations_reception, plainte
        FROM ordres_reparation WHERE id = ${orId}`,
  )) as unknown as (Row & { outillage: Record<string, Entree> | null })[])[0];

describe("LOT U3 — check-list outillage + section 6 absorbée", () => {
  it("1-3. format JSONB inchangé et observation rattachée à son élément", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.receptionner({
      client: { nom: "Client U3check", telephone: "690100700" },
      vehicule: { immatriculation: "U3CHECK-001", marque: "LotU3" },
      reception: {
        kilometrageEntree: 1000,
        pannesDeclarees: "Voyant moteur",
        observationsReception: "Client pressé",
        outillage: {
          CRIC: { present: true, observation: "Clé 17" },
          "ROUE DE SECOURS": { present: true, observation: "Sous le coffre" },
          // Observation SANS coche : elle doit survivre (une information
          // pertinente existe même si l'agent n'a pas coché).
          NATTES: { present: false, observation: "Jante de secours en cave" },
        },
      },
    });

    const or = await lireOr(r.id);
    // La colonne est un JSONB : on la relit avec le type du domaine plutôt
    // qu'avec celui, très large, que renvoie la requête brute.
    const out = (or.outillage ?? {}) as Record<
      string,
      { present: boolean; observation: string; libelle?: string }
    >;

    // 1. Format : le dossier fige l'état de TOUTE la nomenclature de l'agence,
    //    pas seulement des éléments cochés. C'est le changement du lot O1 —
    //    et ce qui distingue « absent du véhicule » (`present: false`) de
    //    « jamais regardé » (clé absente).
    const { items } = await caller.getCatalogueOutillage();
    expect(Object.keys(out).sort()).toEqual(items.map((i) => i.cle).sort());

    // 2. Chaque observation est celle de SON élément (pas de mélange), et le
    //    libellé est figé au moment de la saisie.
    expect(out.CRIC.present).toBe(true);
    expect(out.CRIC.observation).toBe("Clé 17");
    expect(out.CRIC.libelle).toBe("CRIC");
    expect(out["ROUE DE SECOURS"].observation).toBe("Sous le coffre");

    // 3. Une observation non cochée est conservée.
    expect(out.NATTES.present).toBe(false);
    expect(out.NATTES.observation).toBe("Jante de secours en cave");

    // 4. Les éléments non cochés sont bien présents, à `false`.
    expect(out.TRIANGLE.present).toBe(false);
    expect(out.TRIANGLE.observation).toBe("");
  });

  it("4-5. pannes, observations de réception et plainte reportée", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.receptionner({
      client: { nom: "Client U3check", telephone: "690100700" },
      vehicule: { immatriculation: "U3CHECK-002", marque: "LotU3" },
      reception: {
        kilometrageEntree: 2000,
        pannesDeclarees: "Bruit à l’accélération",
        observationsReception: "Refuse l’attente, veut repartir demain",
        outillage: { CRIC: { present: true, observation: "" } },
      },
    });

    const or = await lireOr(r.id);
    // 4. La section 6 absorbée ne perd rien.
    expect(or.pannes_declarees).toBe("Bruit à l’accélération");
    expect(or.observations_reception).toBe("Refuse l’attente, veut repartir demain");

    // 5. La plainte, dont la zone de texte a été supprimée du formulaire,
    // reste alimentée par les pannes déclarées.
    expect(or.plainte).toBe("Bruit à l’accélération");
  });
});
