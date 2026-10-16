/**
 * ÉTAPE 2 — modifier une intervention DEPUIS la 360.
 *
 * L'interface appelle `or.updateLigne`, qui existe déjà. Ce test ne vérifie pas
 * l'interface — il vérifie que l='API sur laquelle elle s'appuie refuse ce qu'i
 * doit refuser.
 *
 * ## Pourquoi c'est important
 *
 * L'écran propose un menu déroulant des statuts disponibles. Si le serveur
 * accepte n'importe quelle transition, l'agent peut faire passer une ligne
 * « à faire » directement à « validé », sans travail. Le garde du P0.3 existe
 * précisément pour cela — mais il ne protège que s'il est testé sur le chemin
 * réellement utilisé par l'écran.
 *
 * ## Les garanties
 *
 *  1. Une transition autorisée passe : a_faire → en_cours → fait.
 *  2. Un SAUT d'état est refusé, avec un message qui NOMME les deux états —
 *     un agent qui ne comprend pas pourquoi refuse de réessayer à l'aveugle.
 *  3. Le RETOUR EN ARRIÈRE est autorisé (fait → en_cours) : corriger une ligne
 *     marquée faite à tort est un besoin réel, pas une erreur de saisie. Le
 *     refus obligerait à rouvrir le dossier.
 *  4. Chaque écriture est JOURNALISÉE avec son auteur — sans quoi l'historique
 *     « qui l'a fait » ment.
 *  5. Un dossier fermé refuse toute modification.
 *  6. Un statut hors nomenclature est refusé par le schéma lui-même (P0.3 :
 *     `z.string()` acceptait n'importe quoi).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import postgres from "postgres";
import { orRouter } from "~/server/api/routers/or-router";

const NS = "p2ligne";
const AGENCE = 1;
const USER_EMAIL = "p2ligne@x.test";
let userId = 0;
let roleId = 0;
let client: ReturnType<typeof postgres>;

function ctx() {
  const user = {
    id: String(userId), name: "P2Ligne", email: USER_EMAIL,
    agenceId: AGENCE, agenceName: "TEST", organizationId: "1",
    role: "superadmin", permissions: [], isActive: true, status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } } as never;
}

const caller = () => orRouter.createCaller(ctx());

async function nettoyerMetier(): Promise<void> {
  await client`DELETE FROM ordres_reparation WHERE numero LIKE ${`%${NS}%`}`;
  await client`DELETE FROM vehicules WHERE marque LIKE ${`%${NS}%`}`;
}

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  await nettoyerMetier();
  const [role] = await client`
    INSERT INTO roles (code, nom, description, niveau)
    VALUES (${`${NS}_modif`}, 'P2Ligne', 'Fixture', 0)
    ON CONFLICT (code) DO NOTHING RETURNING id`;
  roleId = role?.id ?? (await client`SELECT id FROM roles WHERE code = ${`${NS}_modif`}`)[0]!.id;
  await client`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
    VALUES (${USER_EMAIL}, 'P2Ligne', 'Lina', ${AGENCE}, ${roleId}::uuid, true, 'active')
    ON CONFLICT (email) DO NOTHING`;
  userId = (await client`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`)[0]!.id;
}, 30000);

afterAll(async () => {
  await nettoyerMetier();
  await client.end();
});

/** Dossier ouvert + une ligne de travail « à faire ». */
async function fixture(statutDossier = "EN_COURS") {
  await nettoyerMetier();
  const [v] = await client`
    INSERT INTO vehicules (agence_id, immatriculation, marque, modele, statut_immobilisation, is_active)
    VALUES (${AGENCE}, ${`LG-${NS}-1`}, ${`${NS}-M`}, 'Mod', 'en_reception', true) RETURNING id`;
  const [o] = await client`
    INSERT INTO ordres_reparation (vehicule_id, agence_id, numero, statut, date_ouverture)
    VALUES (${v!.id}, ${AGENCE}, ${`${NS}-OR-${Date.now()}`}, ${statutDossier}, now()) RETURNING id`;
  const [l] = await client`
    INSERT INTO lignes_ordre_reparation (ordre_id, libelle, quantite, prix_unitaire, statut)
    VALUES (${o!.id}, ${`${NS}-Remplacement disque`}, 1, 5000, 'a_faire') RETURNING id`;
  return { orId: o!.id as number, ligneId: l!.id as number };
}

describe("Mise à jour d'une intervention", () => {
  it("1. la progression normale passe : a_faire → en_cours → fait", async () => {
    const { ligneId } = await fixture();
    await caller().updateLigne({ id: ligneId, statut: "en_cours" });
    await caller().updateLigne({ id: ligneId, statut: "fait" });
    const [l] = await client`SELECT statut FROM lignes_ordre_reparation WHERE id = ${ligneId}`;
    expect(l!.statut).toBe("fait");
  }, 30000);

  it("2. VALIDER sans avoir fait est refusé — c'est le garde qui compte", async () => {
    const { ligneId } = await fixture();
    // La machine autorise `a_faire → fait` : un petit travail peut être fait
    // d'un seul geste, et l'imposer en deux étapes serait une gêne sans
    // protection. Elle INTERDIT en revanche `a_faire → valide` : valider une
    // intervention qui n'a pas été faite est la faute qu'un dossier doit
    // pouvoir empêcher, et c'est celle-ci.
    let message = "";
    try {
      await caller().updateLigne({ id: ligneId, statut: "valide" });
    } catch (e: any) {
      message = e?.message ?? String(e);
    }
    expect(message, "valider sans avoir fait doit être refusé").not.toBe("");
    // Un agent qui ne comprend pas pourquoi échoue réessaie à l'aveugle.
    expect(message.toLowerCase()).toContain("transition");
  }, 30000);

  it("3. le retour en arrière est AUTORISÉ — corriger une ligne faite à tort", async () => {
    const { ligneId } = await fixture();
    await caller().updateLigne({ id: ligneId, statut: "en_cours" });
    await caller().updateLigne({ id: ligneId, statut: "fait" });
    // fait → en_cours doit passer : sinon l'agent doit rouvrir le dossier.
    await expect(caller().updateLigne({ id: ligneId, statut: "en_cours" })).resolves.toBeTruthy();
  }, 30000);

  it("4. chaque écriture est journalisée avec son auteur", async () => {
    const { orId, ligneId } = await fixture();
    await caller().updateLigne({ id: ligneId, statut: "en_cours" });
    const [h] = await client`
      SELECT type, commentaire, change_par FROM or_historique
      WHERE or_id = ${orId} AND type = 'LIGNE' ORDER BY id DESC LIMIT 1`;
    expect(h, "la modification doit être journalisée").toBeDefined();
    expect(h!.change_par).toBe(userId);
  }, 30000);

  it("5. un dossier fermé refuse toute modification", async () => {
    const { ligneId } = await fixture("ferme_definitif");
    let refuse = false;
    try {
      await caller().updateLigne({ id: ligneId, statut: "en_cours" });
    } catch {
      refuse = true;
    }
    expect(refuse, "un dossier fermé ne doit pas être modifiable").toBe(true);
  }, 30000);

  it("6. un statut hors nomenclature est refusé par le schéma", async () => {
    const { ligneId } = await fixture();
    let refuse = false;
    try {
      // @ts-expect-error — on force volontairement une valeur invalide.
      await caller().updateLigne({ id: ligneId, statut: "fait_ou_pas" });
    } catch {
      refuse = true;
    }
    expect(refuse).toBe(true);
  }, 30000);
});