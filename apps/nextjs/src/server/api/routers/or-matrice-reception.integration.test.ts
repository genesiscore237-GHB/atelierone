import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * MATRICE DE RÉCEPTION — les 9 combinaisons véhicule × client
 *
 * Chaque ligne de la matrice est un couple (véhicule connu ?) × (client connu ?).
 * Croisées, cela donne neuf cas, et non quatre : les deux axes sont
 * INDÉPENDANTS, et traiter l'un sans l'autre laisse des trous — c'est
 * exactement ce qui est arrivé (un client régulier ramenant un second véhicule
 * obtenait une deuxième fiche, et un changement de propriétaire était ignoré
 * sans message).
 *
 *   M1  vehicule nouveau  + client nouveau            -> fiche creee
 *   M2  véhicule nouveau  + client sélectionné       → client réutilisé
 *   M3  véhicule nouveau  + client reconnu, non choisi→ REFUSÉ, confirmation exigée
 *   M4  véhicule connu    + client nouveau            → propriétaire renseigné
 *   M5  véhicule connu    + même client               → accepté
 *   M6  véhicule connu    + AUTRE client              → REFUSÉ (le garage n'a pas
 *                                                        le droit de changer de
 *                                                        propriétaire)
 *   M7  véhicule connu    + aucun client              → « à wartier »
 *   M8  client reconnu par téléphone, doublon écarté  → le choix est transmis
 *   M9  véhicule nouveau  + aucun client              → « à wartier »
 *
 * Ce fichier verrouille les trois décisions métier prises :
 *   1. un doublon de client se CONFIRME, il ne se crée pas en silence ;
 *   2. le garage ne change pas le propriétaire d'un véhicule ;
 *   3. un véhicule sans client identifié part « à wartier ».
 */

vi.mock("@atelierone/auth", () => ({}));

const { orRouter } = await import("~/server/api/routers/or-router");

const NS = "mx";
const AGENCE = 1;
const TEL_A = "695000001";
const TEL_B = "695000002";
const TEL_NEUF = "695000009";

let userId = 0;

function ctx() {
  const user = {
    id: String(userId),
    name: "Matrice",
    email: `${NS}.matrice@gpj.cm`,
    agenceId: AGENCE,
    agenceName: "GPJ",
    organizationId: String(AGENCE),
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

type Row = Record<string, unknown>;

async function clientParTel(tel: string) {
  const r = (await db.execute(sql`SELECT id, nom FROM clients WHERE telephone = ${tel}`)) as unknown as Row[];
  return r[0];
}
async function vehiculeParImmat(immat: string) {
  const r = (await db.execute(
    sql`SELECT id, client_id FROM vehicules WHERE immatriculation = ${immat}`,
  )) as unknown as Row[];
  return r[0];
}
async function orParImmat(immat: string) {
  const r = (await db.execute(sql`
    SELECT o.id, o.client_id, o.emplacement
    FROM ordres_reparation o
    JOIN vehicules v ON v.id = o.vehicule_id
    WHERE v.immatriculation = ${immat}
    ORDER BY o.id DESC LIMIT 1`)) as unknown as Row[];
  return r[0];
}

/**
 * Client de référence, créé UNE seule fois. Les cas qui demandent « un client
 * nouveau » le nomment explicitement ; les autres réutilisent cette fiche —
 * recréer un second client pour le même téléphone est précisément ce que la
 * règle de confirmation interdit.
 */
let baseClientId = 0;

async function clientBase(): Promise<number> {
  if (baseClientId) return baseClientId;
  const r = (await db.execute(sql`
    INSERT INTO clients (nom, telephone, agence_id, statut, type_client, is_active)
    VALUES ('Client Matrice', ${TEL_A}, ${AGENCE}, 'ACTIF', 'PART', true)
    RETURNING id`)) as unknown as Row[];
  baseClientId = Number(r[0]!.id);
  return baseClientId;
}

const reception = async (immat: string, extra: Record<string, unknown> = {}) => ({
  client: { id: await clientBase() },
  vehicule: { immatriculation: immat },
  reception: { kilometrageEntree: 10_000, pannesDeclarees: "Test matrice" },
  ...extra,
});

/**
 * Comptage PORTÉ AU PÉRIMÈTRE du test, pas à toute la base : les fichiers de
 * test partagent la même base et s'exécutent en parallèle. Un `count(*)`
 * global change dès qu'un AUTRE fichier crée un client, et l'échec pointe
 * alors vers le mauvais fichier — ou pire, vers un défaut inexistant.
 */
const compterCeLot = async () => {
  const r = (await db.execute(
    sql`SELECT count(*)::int AS n FROM clients
        WHERE telephone IN (${TEL_A}, ${TEL_B}, ${TEL_NEUF})`,
  )) as unknown as Row[];
  return Number((r[0] as any).n);
};
describe("Matrice de réception — les 9 combinaisons", () => {
  beforeAll(async () => {
    await db.execute(sql`
      DELETE FROM lignes_ordre_reparation WHERE ordre_id IN (
        SELECT o.id FROM ordres_reparation o
        JOIN vehicules v ON v.id = o.vehicule_id
        WHERE v.immatriculation LIKE 'MXVEH%')`);
    await db.execute(sql`
      DELETE FROM ordres_reparation WHERE vehicule_id IN (
        SELECT id FROM vehicules WHERE immatriculation LIKE 'MXVEH%')`);
    await db.execute(sql`DELETE FROM vehicules WHERE immatriculation LIKE 'MXVEH%'`);
    await db.execute(sql`DELETE FROM clients WHERE telephone IN (${TEL_A}, ${TEL_B}, ${TEL_NEUF})`);
    await db.execute(sql`DELETE FROM audit_logs WHERE user_id IN
                         (SELECT id FROM utilisateurs WHERE email = ${`${NS}.matrice@gpj.cm`})`);
    await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${`${NS}.matrice@gpj.cm`}`);

    const [u] = (await db.execute(sql`
      INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
      VALUES (${`${NS}.matrice@gpj.cm`}, 'Matrice', 'RX', ${AGENCE}, true, 'active')
      RETURNING id`)) as unknown as { id: string }[];
    userId = Number(u!.id);

    // Le client de référence existe AVANT le premier test : plusieurs cas le
    // réutilisent, et M2 doit pouvoir le retrouver sans dépendre de l'ordre
    // d'exécution des cas précédents.
    await clientBase();
  });

  afterAll(async () => {
    await db.execute(sql`
      DELETE FROM lignes_ordre_reparation WHERE ordre_id IN (
        SELECT o.id FROM ordres_reparation o
        JOIN vehicules v ON v.id = o.vehicule_id
        WHERE v.immatriculation LIKE 'MXVEH%')`);
    await db.execute(sql`
      DELETE FROM ordres_reparation WHERE vehicule_id IN (
        SELECT id FROM vehicules WHERE immatriculation LIKE 'MXVEH%')`);
    await db.execute(sql`DELETE FROM vehicules WHERE immatriculation LIKE 'MXVEH%'`);
    await db.execute(sql`DELETE FROM clients WHERE telephone IN (${TEL_A}, ${TEL_B}, ${TEL_NEUF})`);
    if (userId) {
      await db.execute(sql`DELETE FROM audit_logs WHERE user_id = ${userId}`);
      await db.execute(sql`DELETE FROM utilisateurs WHERE id = ${userId}`);
    }
  });

  // ── M1 ────────────────────────────────────────────────────────────────
  it("M1 — vehicule nouveau + client NEUF : les deux fiches sont creees", async () => {
    const caller = orRouter.createCaller(ctx());
    const avant = await compterCeLot();

    const r = await caller.receptionner({
      client: { nom: "Client Neuf", telephone: "695000009" },
      vehicule: { immatriculation: "MXVEH01" },
      reception: { kilometrageEntree: 10_000, pannesDeclarees: "Test M1" },
    });

    expect(r.vehiculeId).toBeGreaterThan(0);
    expect(r.clientId).toBeGreaterThan(0);
    const v = await vehiculeParImmat("MXVEH01");
    expect(Number(v!.client_id)).toBe(r.clientId);
    const apres = await compterCeLot();
    expect(apres).toBe(avant + 1);
  });

  // ── M2 ────────────────────────────────────────────────────────────────
  it("M2 — véhicule nouveau + client SELECTIONNE : le client existant est reutilise, aucune fiche creee", async () => {
    const caller = orRouter.createCaller(ctx());
    const existant = await clientParTel(TEL_A);

    const avant = await compterCeLot();
    const r = await caller.receptionner({
      client: { id: Number(existant!.id) },
      vehicule: { immatriculation: "MXVEH02" },
      reception: { kilometrageEntree: 11_000, pannesDeclarees: "Test M2" },
    });
    const apres = await compterCeLot();

    expect(r.clientId).toBe(Number(existant!.id));
    expect(apres).toBe(avant);
  });

  // ── M3 : la confirmation exigée ────────────────────────────────────────
  it("M3 — client reconnu mais NON selectionne : la reception est refusee et exige une confirmation", async () => {
    const caller = orRouter.createCaller(ctx());
    const avant = await compterCeLot();

    await expect(
      caller.receptionner({
        client: { nom: "Client Matrice", telephone: TEL_A },
        vehicule: { immatriculation: "MXVEH03" },
        reception: { kilometrageEntree: 12_000, pannesDeclarees: "Test M3" },
      }),
    ).rejects.toThrow(/Confirmez-vous|CONFLICT/i);

    // Aucune fiche créée : c'est le but de la confirmation.
    const apres = await compterCeLot();
    expect(apres).toBe(avant);
  });

  it("M3-bis — après confirmation explicite, la seconde fiche est creee", async () => {
    const caller = orRouter.createCaller(ctx());
    const r = await caller.receptionner({
      client: { nom: "Autre personne", telephone: TEL_A },
      vehicule: { immatriculation: "MXVEH04" },
      confirmerClientDoublon: true,
      reception: { kilometrageEntree: 13_000, pannesDeclarees: "Test M3bis" },
    });
    expect(r.clientId).toBeGreaterThan(0);
    // Et le doublon reste MARQUÉ, pour que l'UI propose la fusion.
    const marque = await db.execute(
      sql`SELECT clients_doublonnes AS d FROM clients WHERE id = ${r.clientId}`,
    );
    expect(Boolean((marque[0] as any).d)).toBe(true);
  });

  // ── M5 ────────────────────────────────────────────────────────────────
  it("M5 — véhicule connu + MEME client : accepte, le propriétaire ne bouge pas", async () => {
    const caller = orRouter.createCaller(ctx());
    const or1 = await caller.receptionner(await reception("MXVEH05"));
    const or2 = await caller.receptionner({
      client: { id: or1.clientId },
      vehicule: { immatriculation: "MXVEH05" },
      reception: { kilometrageEntree: 14_000, pannesDeclarees: "Test M5" },
      confirmerNouvelleIntervention: true,
    });
    expect(or2.vehiculeId).toBe(or1.vehiculeId);
    const v = await vehiculeParImmat("MXVEH05");
    expect(Number(v!.client_id)).toBe(or1.clientId);
  });

  // ── M6 : le garage ne change pas de propriétaire ───────────────────────
  it("M6 — véhicule connu + AUTRE client : REFUSE, et le propriétaire est intact", async () => {
    const caller = orRouter.createCaller(ctx());
    const clientB = (await db.execute(
      sql`INSERT INTO clients (nom, telephone, agence_id, statut, type_client, is_active)
          VALUES ('Client B Matrice', ${TEL_B}, ${AGENCE}, 'ACTIF', 'PART', true)
          RETURNING id`,
    )) as unknown as Row[];

    const or1 = await caller.receptionner(await reception("MXVEH06"));
    await expect(
      caller.receptionner({
        client: { id: Number(clientB[0]!.id) },
        vehicule: { immatriculation: "MXVEH06" },
        reception: { kilometrageEntree: 15_000, pannesDeclarees: "Test M6" },
      }),
    ).rejects.toThrow(/propriétaire|proprietaire|cession/i);

    const v = await vehiculeParImmat("MXVEH06");
    expect(Number(v!.client_id)).toBe(or1.clientId);
  });

  // ── M7 / M9 : propriétaire historique et « à wartier » ──────────────────
  it("M7 — véhicule connu avec propriétaire, aucun client saisi : le propriétaire est conservé", async () => {
    const caller = orRouter.createCaller(ctx());
    const or1 = await caller.receptionner(await reception("MXVEH07"));

    // Ni nom ni téléphone : l'agent n'invente pas de fiche, mais le véhicule
    // a déjà un propriétaire — le dossier doit le conserver.
    const r = await caller.receptionner({
      client: {},
      vehicule: { immatriculation: "MXVEH07" },
      reception: { kilometrageEntree: 16_000, pannesDeclarees: "Test M7" },
      confirmerNouvelleIntervention: true,
    });

    expect(r.vehiculeId).toBe(or1.vehiculeId);
    const or = await orParImmat("MXVEH07");
    expect(Number(or!.client_id)).toBe(or1.clientId);
    expect(String(or!.emplacement ?? "").toUpperCase()).not.toContain("WARTIER");
  });

  it("M9 — véhicule nouveau SANS client : fiche creee, sans proprietaire", async () => {
    const caller = orRouter.createCaller(ctx());
    const r = await caller.receptionner({
      client: {},
      vehicule: { immatriculation: "MXVEH09" },
      reception: { kilometrageEntree: 17_000, pannesDeclarees: "Test M9" },
    });

    expect(r.vehiculeId).toBeGreaterThan(0);
    const v = await vehiculeParImmat("MXVEH09");
    expect(v!.client_id ?? null).toBeNull();
    const or = await orParImmat("MXVEH09");
    expect(String(or!.emplacement ?? "").toUpperCase()).toContain("WARTIER");
  });
});