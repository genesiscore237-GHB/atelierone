/**
 * LOT 0 — Verrous du cycle OR (T0.1 → T0.5).
 *
 * Quatre garanties de sécurité du cycle, testées contre la base de test :
 *
 *  1. T0.1 — `or.update` ne peut plus écrire le champ `statut` (le champ a
 *     été retiré du schéma ; même envoyé, il est ignoré et le statut réel en
 *     base ne bouge pas).
 *  2. T0.2 — la sortie exceptionnelle exige (a) un dossier quasi abouti
 *     (PRET_A_LIVRER ou CONTROLE_QUALITE) et (b) la permission `or.valider`.
 *  3. T0.3 — `fermerDefinitivement` refuse un dossier ANNULE.
 *  4. T0.5 — deux créations concurrentes d'OR obtiennent deux numéros
 *     distincts (verrou advisory + séquence en MAX, jamais `count + 1`).
 *
 * Fixtures RBAC REELLES (roles / role_permissions / utilisateurs) : mêmes
 * règles que `rbac-fixtures-rpt05` — pas de mock du RBAC. Chaque fichier
 * d'intégration porte son propre namespace pour tourner en parallèle.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

// `next-auth` n'est pas resolvable hors de Next (il importe `next/server`).
// On ne mocke QUE le transport d'authentification ; le RBAC reste reel.
vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { sql } from "drizzle-orm";

import { db } from "~/server/db";

const NS = "lot0";
const ROLE_CODE = `${NS}_modifier`;
const USER_EMAIL = `${NS}.modifier@gpj.cm`;
const IMMAT = "LOT0-IMMAT-001";
const NUM_PREFIX = "LOT0-OR-";

type Row = Record<string, unknown>;

const IN = (valeurs: readonly string[]) =>
  sql.join(
    valeurs.map((v) => sql`${v}`),
    sql`, `,
  );

let userId = 0;
let vehiculeId = 0;
const orIds: number[] = [];
let orEnCours = 0;
let orPret = 0;
let orAnnule = 0;

/**
 * Contexte forge « superadmin » : MÊME profil reel que `ctxModifier`
 * (id FK valide pour cree_par / audit), mais `role` forge en `superadmin`
 * pour bypasser `requirePermissionProcedure` (aucun middleware ne relit le
 * role en base — cf. trpc.ts isAuthed).
 */
function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "Lot0 superadmin",
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

/** Contexte forge : profil reel avec or.modifier SEULEMENT (pas or.valider). */
function ctxModifier() {
  const user = {
    id: String(userId),
    name: "Lot0 modifier",
    email: USER_EMAIL,
    agenceId: 1,
    agenceName: "GPJ",
    organizationId: "1",
    role: "secretaire",
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

/** Code TRPC + message d'une rejection, ou null si la mutation a reussi. */
async function errDe(promesse: Promise<unknown>): Promise<{ code: string; message: string } | null> {
  try {
    await promesse;
    return null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code ?? "UNKNOWN", message: err.message ?? "" };
  }
}

beforeAll(async () => {
  // 1. Permissions du socle : on echoue loudly plutot que d'inventer un droit.
  const codes = ["or.modifier", "or.valider", "or.creer"];
  const connues = (await db.execute(
    sql`SELECT code FROM permissions WHERE code IN (${IN(codes)})`,
  )) as unknown as Row[];
  const manquantes = codes.filter((c) => !connues.some((k) => k.code === c));
  if (manquantes.length > 0) {
    throw new Error(`Fixtures ${NS} : permissions absentes de la base : ${manquantes.join(", ")}.`);
  }

  // 2. Role reel avec or.modifier UNIQUEMENT.
  await retirer();
  await db.execute(
    sql`INSERT INTO roles (code, nom, description, niveau)
        VALUES (${ROLE_CODE}, ${`Lot0 ${NS}`}, 'Fixture Lot0', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(
    sql`INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p
        WHERE r.code = ${ROLE_CODE} AND p.code = 'or.modifier'
        ON CONFLICT DO NOTHING
        RETURNING role_id`,
  )) as unknown as Row[];
  const roleId = role?.role_id ?? (
    (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[]
  )[0]?.id;
  if (!roleId) throw new Error(`Fixtures ${NS} : role ${ROLE_CODE} introuvable.`);

  // 3. Utilisateur reel portant ce role.
  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'LOT0', 'Fixture', 1, ${roleId}::uuid, true, 'active')
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

  // 4. Un vehicule + trois OR (statuts differents pour les gardes T0.2/T0.3).
  const [veh] = (await db.execute(
    sql`INSERT INTO vehicules (agence_id, immatriculation, marque, modele, statut_immobilisation)
        VALUES (1, ${IMMAT}, 'Lot0', 'Test', 'en_reception')
        RETURNING id`,
  )) as unknown as Row[];
  vehiculeId = Number(veh.id);

  const creerOr = async (numero: string, statut: string): Promise<number> => {
    const [row] = (await db.execute(
      sql`INSERT INTO ordres_reparation (agence_id, numero, vehicule_id, statut, plainte)
          VALUES (1, ${numero}, ${vehiculeId}, ${statut}, 'Fixture Lot0')
          RETURNING id`,
    )) as unknown as Row[];
    orIds.push(Number(row.id));
    return Number(row.id);
  };
  orEnCours = await creerOr(`${NUM_PREFIX}ENCOURS`, "EN_COURS");
  orPret = await creerOr(`${NUM_PREFIX}PRET`, "PRET_A_LIVRER");
  orAnnule = await creerOr(`${NUM_PREFIX}ANNULE`, "ANNULE");
});

afterAll(async () => {
  await retirer();
});

/** Nettoyage cible du namespace Lot0 (idempotent, appele avant et apres). */
async function retirer(): Promise<void> {
  // Tous les OR du namespace : prefixe LOT0-OR- ET les OR a numero reel
  // crees par le test de concurrence T0.5 (lies au vehicule fixture).
  const cibles = (await db.execute(sql`
    SELECT id FROM ordres_reparation
    WHERE numero LIKE ${NUM_PREFIX + "%"}
       OR vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation = ${IMMAT})
  `)) as unknown as Row[];
  const ids = cibles.map((r) => String(r.id));
  if (ids.length > 0) {
    // Enfants avant les OR (FK restrict), vehicule ensuite (OR -> vehicule).
    await db.execute(sql`DELETE FROM or_historique WHERE or_id IN (${IN(ids)})`);
    await db.execute(sql`DELETE FROM or_restitutions WHERE or_id IN (${IN(ids)})`);
    await db.execute(sql`DELETE FROM ordres_reparation WHERE id IN (${IN(ids)})`);
  }
  orIds.length = 0;
  vehiculeId = 0;
  await db.execute(sql`DELETE FROM vehicules WHERE immatriculation = ${IMMAT}`);
  // FK : audit puis utilisateur AVANT le role qu'il reference.
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(sql`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code = ${ROLE_CODE})`);
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`);
}

describe("Lot 0 — verrous du cycle OR", () => {
  it("T0.1 : or.update ignore le champ statut (plus d'écriture sauvage)", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    await caller.update({ id: orEnCours, statut: "LIVRE", plainte: "Maj plainte" } as never);

    const rows = (await db.execute(
      sql`SELECT statut FROM ordres_reparation WHERE id = ${orEnCours}`,
    )) as unknown as Row[];
    // Le statut reel n'a pas bouge : seul changerStatut / les endpoints
    // métier peuvent l'ecrire.
    expect(rows[0]?.statut).toBe("EN_COURS");
  });

  it("T0.2a : sortie exceptionnelle refusée hors PRET_A_LIVRER / CONTROLE_QUALITE", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const err = await errDe(
      caller.restituerVehicule({
        orId: orEnCours,
        kilometrageSortie: 12345,
        checklist: [{ libelle: "Entourage OK", ok: true }],
        recuperateurNom: "Jean Test",
        signatureClient: "Jean Test",
        sortieExceptionnelle: true,
        motifException: "Refus client",
        commentaireException: "Sortie autorisee malgre refus",
      }),
    );
    expect(err?.code).toBe("BAD_REQUEST");
    expect(err?.message).toContain("Sortie exceptionnelle refusée");

    // Aucune restitution ecrite (le refus est avant l'insert).
    const restitutions = (await db.execute(
      sql`SELECT id FROM or_restitutions WHERE or_id = ${orEnCours}`,
    )) as unknown as Row[];
    expect(restitutions.length).toBe(0);
  });

  it("T0.2b : sortie exceptionnelle refusée sans permission or.valider", async () => {
    // Profil reel : or.modifier (passe le middleware) mais PAS or.valider.
    const caller = orRouter.createCaller(ctxModifier());
    const err = await errDe(
      caller.restituerVehicule({
        orId: orPret,
        kilometrageSortie: 54321,
        checklist: [{ libelle: "Entourage OK", ok: true }],
        recuperateurNom: "Jean Test",
        signatureClient: "Jean Test",
        sortieExceptionnelle: true,
        motifException: "Refus client",
        commentaireException: "Sortie autorisee malgre refus",
      }),
    );
    expect(err?.code).toBe("FORBIDDEN");
    expect(err?.message).toContain("or.valider");

    const restitutions = (await db.execute(
      sql`SELECT id FROM or_restitutions WHERE or_id = ${orPret}`,
    )) as unknown as Row[];
    expect(restitutions.length).toBe(0);
  });

  it("T0.3 : fermerDefinitivement refuse un dossier ANNULE", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const err = await errDe(caller.fermerDefinitivement({ id: orAnnule }));
    expect(err?.code).toBe("BAD_REQUEST");
    expect(err?.message).toContain("Dossier annulé");

    const rows = (await db.execute(
      sql`SELECT statut FROM ordres_reparation WHERE id = ${orAnnule}`,
    )) as unknown as Row[];
    expect(rows[0]?.statut).toBe("ANNULE");
  });

  it("T0.5 : deux créations concurrentes obtiennent deux numéros distincts", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const [a, b] = await Promise.all([
      caller.create({ vehiculeId, plainte: "Concurrent A" }),
      caller.create({ vehiculeId, plainte: "Concurrent B" }),
    ]);
    expect(a.numero).toMatch(/^OR-\d{2}-\d{4}$/);
    expect(b.numero).toMatch(/^OR-\d{2}-\d{4}$/);
    expect(a.numero).not.toBe(b.numero);
  });
});
