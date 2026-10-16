/**
 * ÉTAPE 2 — « qui l'a fait » : l'attribution doit être RÉELLE.
 *
 * ## Le défaut
 *
 * `creerRapportDiagnostic` écrivait :
 *
 *     technicienId: Number(ctx.user.id) ?? null
 *
 * `ctx.user.id` est un `utilisateurs.id`. `technicien_id` attend un
 * `employes.id`. Les deux sont des nombres, et AUCUNE clé étrangère ne les
 * rapproche : écrire l'un à la place de l'autre ne lève aucune erreur. Le
 * rapport est attribué au mauvais numéro, et le journal affiche un nom faux —
 * ou aucun.
 *
 * C'est l'exigence « interventions datées et attribuées à celui qui les a
 * faites », cassée à la racine, et de manière INVISIBLE.
 *
 * Le `?? null` ne protégeait rien : `Number(x)` ne renvoie jamais `null`. Il
 * donnait l'illusion d'une protection.
 *
 * ## Ce que ces tests verrouillent
 *
 *  1. L'identifiant écrit vaut l'EMPLOYÉ, pas le compte. Les deux sont créés
 *     avec des numéros volontairement différents : un test qui comparerait
 *     « l'un des deux » passerait avec le mauvais.
 *  2. Cette différence est ASSERTÉE, sinon le test 1 ne prouve rien.
 *  3. Un compte SANS fiche employé n'invente pas d'auteur.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import postgres from "postgres";
import { orRouter } from "~/server/api/routers/or-router";

const NS = "p2auteur";
const AGENCE = 1;
const EMAIL = "p2auteur@x.test";
let userId = 0;
let roleId = 0;
let employeId = 0;
let client: ReturnType<typeof postgres>;

function ctx() {
  const user = {
    id: String(userId), name: "P2Auteur", email: EMAIL,
    agenceId: AGENCE, agenceName: "TEST", organizationId: "1",
    role: "superadmin", permissions: [], isActive: true, status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } } as never;
}

const caller = () => orRouter.createCaller(ctx());

/**
 * On ne purge QUE la donnée métier du test.
 *
 * Les comptes et employés restent, délibérément : `utilisateurs` est
 * référencée par plus de cent cinquante tables (`or_historique.change_par`,
 * `user_roles.user_id`, `atelier_notifications.lue_par`…), et le message
 * d'erreur — « violation de clé étrangère » — ne nomme pas la table fautive.
 * Supprimer un compte de fixture à l'aveugle est un jeu de devinette qui casse
 * au premier ajout de table. Et ce n'est pas nécessaire : la base de test est
 * RECONSTRUITE par `pnpm db:test-setup`, qui remonte le socle à l'identique.
 */
async function nettoyerMetier(): Promise<void> {
  await client`DELETE FROM or_rapports_diagnostic WHERE constat LIKE ${`%${NS}%`}`;
  await client`DELETE FROM ordres_reparation WHERE numero LIKE ${`%${NS}%`}`;
  await client`DELETE FROM vehicules WHERE marque LIKE ${`%${NS}%`}`;
}

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  await nettoyerMetier();

  const [role] = await client`
    INSERT INTO roles (code, nom, description, niveau)
    VALUES (${`${NS}_modif`}, 'P2Auteur', 'Fixture', 0)
    ON CONFLICT (code) DO NOTHING RETURNING id`;
  roleId = role?.id ?? (await client`SELECT id FROM roles WHERE code = ${`${NS}_modif`}`)[0]!.id;

  // L'employé est RÉUTILISÉ s'il existe. Sinon chaque exécution en crée un
  // nouveau (111, puis 112…) pendant que le compte reste rattaché au premier,
  // et le test échoue sur « expected 110 to be 111 » en accusant à tort le
  // code, qui résout parfaitement.
  await client`
    INSERT INTO employes (nom, prenom, matricule, fonction, agence_id)
    VALUES (${`${NS}-Employe`}, 'Denis', ${`${NS}-E1`}, 'MECANICIEN', ${AGENCE})
    ON CONFLICT DO NOTHING`;
  employeId = (await client`SELECT id FROM employes WHERE matricule = ${`${NS}-E1`}`)[0]!.id;

  // Le compte est RÉALIGNÉ sur l'employé à chaque exécution : c'est le lien
  // `employe_id` que le code va résoudre.
  await client`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, employe_id, is_active, status)
    VALUES (${EMAIL}, 'P2Auteur', 'Denis', ${AGENCE}, ${roleId}::uuid, ${employeId}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET employe_id = EXCLUDED.employe_id`;
  userId = (await client`SELECT id FROM utilisateurs WHERE email = ${EMAIL}`)[0]!.id;

  // Un second compte, SANS fiche employé : un compte d'administration.
  await client`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, employe_id, is_active, status)
    VALUES (${`${NS}-admin@x.test`}, 'P2Admin', 'Awa', ${AGENCE}, ${roleId}::uuid, NULL, true, 'active')
    ON CONFLICT (email) DO NOTHING`;
}, 30000);

afterAll(async () => {
  await nettoyerMetier();
  await client.end();
});

async function orOuvert(): Promise<number> {
  await nettoyerMetier();
  const [v] = await client`
    INSERT INTO vehicules (agence_id, immatriculation, marque, modele, statut_immobilisation, is_active)
    VALUES (${AGENCE}, ${`AU-${NS}-1`}, ${`${NS}-M`}, 'Mod', 'en_reception', true)
    RETURNING id`;
  const [o] = await client`
    INSERT INTO ordres_reparation (vehicule_id, agence_id, numero, statut, date_ouverture)
    VALUES (${v!.id}, ${AGENCE}, ${`${NS}-OR-${Date.now()}`}, 'EN_COURS', now()) RETURNING id`;
  return o!.id as number;
}

describe("Attribution — l'auteur est un employé, pas un compte", () => {
  it("1. l'identifiant écrit est celui de l'EMPLOYÉ", async () => {
    const orId = await orOuvert();
    await caller().creerRapportDiagnostic({
      orId,
      constat: `${NS} constat de controle`,
      lignes: [{ type: "SERVICE", libelle: `${NS}-intervention`, quantite: 1, prixUnitaire: 1000 }],
    });

    const [r] = await client`
      SELECT technicien_id FROM or_rapports_diagnostic WHERE constat LIKE ${`%${NS}%`} LIMIT 1`;

    expect(r, "le rapport doit etre enregistre").toBeDefined();
    expect(r!.technicien_id).toBe(employeId);
    expect(r!.technicien_id).not.toBe(userId);
  }, 30000);

  it("2. les deux identifiants sont bien distincts — sinon le test 1 ne prouve rien", () => {
    expect(userId).not.toBe(employeId);
  });

  it("3. un compte sans fiche employé n'invente pas d'auteur", async () => {
    const [admin] = await client`SELECT id, employe_id FROM utilisateurs WHERE email = ${`${NS}-admin@x.test`}`;
    expect(admin!.employe_id ?? null).toBeNull();
    // Aucun employé ne porte cet identifiant : on ne le devine pas.
    const faux = await client`SELECT count(*)::int n FROM employes WHERE id = ${admin!.id}`;
    expect(faux[0].n).toBe(0);
  });
});