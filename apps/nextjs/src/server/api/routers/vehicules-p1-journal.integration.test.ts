/**
 * E — le journal d'un véhicule doit être DATÉ et ATTRIBUÉ.
 *
 * ## Le défaut mesuré
 *
 * `or_historique.change_par` existe en base. La fiche 360 le sélectionnait
 * pourtant comme suit :
 *
 *     select({ id, type, ancienneValeur, nouvelleValeur, commentaire, changeLe })
 *
 * L'information d'auteur était là, disponible, et simplement pas demandée.
 * L'historique était donc daté et **anonyme** : l'agent voyait qu'un diagnostic
 * avait été validé le 14 mars, et pas par qui. Sur un dossier où la
 * responsabilité technique est le cœur du métier, un historique anonyme n'est
 * pas un historique.
 *
 * Ce que ces tests verrouillent, c'est cette régression précise : si quelqu'un
 * dispense un `changePar` du SELECT, la suite doit rougir.
 *
 * ## Le reste des garanties
 *
 *  2. Les interventions et les constats portent aussi un auteur (technicien).
 *  3. Une entrée sans auteur reste VISIBLE et comptée — on ne masque pas un
 *     manque, on le dit. Cacher une saisie incomplète la rend invisible.
 *  4. Le tri est anti-chronologique, et les entrées sans date vont en FIN :
 *     un historique qui commence par du non-daté se lit comme un journal qui
 *     ne sait pas quand il commence.
 *  5. Un véhicule sans dossier a un journal vide — pas une erreur.
 *  6. Deux agents distincts donnent deux auteurs distincts : le test qui
 *     compterait « une attribution présente » passerait avec un auteur unique
 *    _branché en dur.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import postgres from "postgres";
import { vehiculesRouter } from "~/server/api/routers/vehicules-router";

const NS = "p1jour";
const AGENCE = 1;
const USER_EMAIL = "p1jour@journal.test";
let userId = 0;
let roleId = 0;
let client: ReturnType<typeof postgres>;

function ctx() {
  const user = {
    id: String(userId), name: "P1JOUR", email: USER_EMAIL,
    agenceId: AGENCE, agenceName: "TEST", organizationId: "1",
    role: "superadmin", permissions: [], isActive: true, status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } } as never;
}

const caller = () => vehiculesRouter.createCaller(ctx());

async function nettoyer(): Promise<void> {
  await client`DELETE FROM or_historique WHERE commentaire LIKE ${`%${NS}%`}`;
  await client`DELETE FROM lignes_ordre_reparation WHERE libelle LIKE ${`%${NS}%`}`;
  await client`DELETE FROM ordres_reparation WHERE numero LIKE ${`%${NS}%`}`;
  await client`DELETE FROM vehicules WHERE marque LIKE ${`%${NS}%`}`;
  await client`DELETE FROM employes WHERE nom LIKE ${`%${NS}%`}`;
  await client`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL} OR email LIKE ${`%${NS}%`}`;
  await client`DELETE FROM roles WHERE code LIKE ${`${NS}%`}`;
}

async function fixture() {
  // Rejouée à chaque test : sans purge, le second passage viole l'unicité de
  // la plaque. Le namespace suffixe donc l'immatriculation d'un compteur.
  await client`DELETE FROM or_historique WHERE or_id IN (SELECT id FROM ordres_reparation WHERE numero LIKE ${`${NS}-%`})`;
  await client`DELETE FROM ordres_reparation WHERE numero LIKE ${`${NS}-%`}`;
  await client`DELETE FROM vehicules WHERE immatriculation LIKE ${`JO-${NS}-%`}`;
  const [v] = await client`
    INSERT INTO vehicules (agence_id, immatriculation, marque, modele, statut_immobilisation, is_active)
    VALUES (${AGENCE}, ${`JO-${NS}-1`}, ${`${NS}-Marque`}, 'M', 'en_reception', true) RETURNING id`;
  const [o] = await client`
    INSERT INTO ordres_reparation (vehicule_id, agence_id, numero, statut, date_ouverture)
    VALUES (${v!.id}, ${AGENCE}, ${`${NS}-OR-1`}, 'EN_COURS', now()) RETURNING id`;
  return { vehiculeId: v!.id, orId: o!.id };
}

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  await nettoyer();
  const [role] = await client`
    INSERT INTO roles (code, nom, description, niveau)
    VALUES (${`${NS}_consultation`}, 'P1Jour', 'Fixture', 0)
    ON CONFLICT (code) DO NOTHING RETURNING id`;
  roleId = role?.id ?? (await client`SELECT id FROM roles WHERE code = ${`${NS}_consultation`}`)[0]!.id;

  // DEUX utilisateurs distincts : c'est ce qui distingue une vraie attribution
  // d'un auteur unique câblé en dur.
  const [u1] = await client`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
    VALUES (${USER_EMAIL}, ${`${NS}-Alice`}, 'Alice', ${AGENCE}, ${roleId}::uuid, true, 'active')
    ON CONFLICT (email) DO NOTHING RETURNING id`;
  userId = u1?.id ?? (await client`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`)[0]!.id;
  await client`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
    VALUES (${`${NS}-bob@x.test`}, ${`${NS}-Bob`}, 'Bob', ${AGENCE}, ${roleId}::uuid, true, 'active')
    ON CONFLICT (email) DO NOTHING`;

  const [emp] = await client`
    INSERT INTO employes (nom, prenom, matricule, fonction, agence_id)
    VALUES (${`${NS}-Tech`}, 'Carla', ${`${NS}-T1`}, 'MECANICIEN', ${AGENCE}) RETURNING id`;
  return emp;
}, 30000);

afterAll(async () => {
  await nettoyer();
  await client.end();
});

describe("Journal véhicule — daté et attribué", () => {
  it("1. un événement d'OR porte son auteur, et il est résolu en nom", async () => {
    const { orId } = await fixture();
    await client`
      INSERT INTO or_historique (or_id, type, ancienne_valeur, nouvelle_valeur, commentaire, change_par, change_le)
      VALUES (${orId}, 'VALIDATION_DIAGNOSTIC', 'BROUILLON', 'VALIDE', ${`${NS}-constat validé`}, ${userId}, now() - interval '2 hours')`;

    const r = await caller().journal({ id: (await client`
      SELECT vehicule_id FROM ordres_reparation WHERE id = ${orId}`)[0]!.vehicule_id });

    const ev = r.entrees.find((e) => e.source === "evenement");
    expect(ev, "l'événement doit être présent").toBeDefined();
    // C'EST LE TEST CENTRAL : `change_par` existe, il doit être demandé.
    expect(ev!.auteur).toBeTruthy();
    expect(ev!.auteur).toContain(NS);
    expect(ev!.quand, "l'événement doit être daté").toBeTruthy();
    expect(ev!.libelle).toBe("Validation du diagnostic");
  }, 30000);

  it("2. deux agents donnent deux auteurs distincts", async () => {
    const { vehiculeId, orId } = await fixture();
    const bob = (await client`SELECT id FROM utilisateurs WHERE email = ${`${NS}-bob@x.test`}`)[0]!.id;
    await client`
      INSERT INTO or_historique (or_id, type, nouvelle_valeur, commentaire, change_par, change_le)
      VALUES (${orId}, 'VALIDATION_DEVIS', 'VALIDE', ${`${NS}-a`}, ${userId}, now() - interval '3 hours')`;
    await client`
      INSERT INTO or_historique (or_id, type, nouvelle_valeur, commentaire, change_par, change_le)
      VALUES (${orId}, 'DEMANDE_PIECES', 'EN_ATTENTE', ${`${NS}-b`}, ${bob}, now() - interval '1 hour')`;

    const r = await caller().journal({ id: vehiculeId });
    const auteurs = new Set(r.entrees.filter((e) => e.source === "evenement").map((e) => e.auteur));
    expect(auteurs.size).toBe(2);
  }, 30000);

  it("3. une intervention porte son technicien", async () => {
    const { orId, vehiculeId } = await fixture();
    const tech = (await client`SELECT id FROM employes WHERE matricule = ${`${NS}-T1`}`)[0]!.id;
    await client`
      INSERT INTO lignes_ordre_reparation (ordre_id, libelle, quantite, statut, technicien_id)
      VALUES (${orId}, ${`${NS}-Remplacement plaquettes`}, 4, 'fait', ${tech})`;

    const r = await caller().journal({ id: vehiculeId });
    const t = r.entrees.find((e) => e.source === "travail");
    expect(t).toBeDefined();
    expect(t!.libelle).toContain("plaquettes");
    expect(t!.auteur).toContain("Carla");
  }, 30000);

  it("4. une entrée sans auteur reste visible et comptée", async () => {
    const { orId, vehiculeId } = await fixture();
    await client`
      INSERT INTO or_historique (or_id, type, nouvelle_valeur, commentaire, change_par, change_le)
      VALUES (${orId}, 'NOTE', 'note', ${`${NS}-sans auteur`}, NULL, now())`;

    const r = await caller().journal({ id: vehiculeId });
    const e = r.entrees.find((x) => x.commentaire === undefined ? false : x.libelle === "Note");
    // L'entrée existe, l'absence est dite, elle n'est pas masquée.
    expect(r.entrees.some((x) => x.source === "evenement")).toBe(true);
    expect(r.sansAuteur).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("5. tri anti-chronologique, et les entrées sans date en FIN", async () => {
    const { orId, vehiculeId } = await fixture();
    await client`
      INSERT INTO or_historique (or_id, type, nouvelle_valeur, commentaire, change_par, change_le)
      VALUES (${orId}, 'NOTE', 'vieux', ${`${NS}-vieux`}, ${userId}, now() - interval '10 days')`;
    await client`
      INSERT INTO or_historique (or_id, type, nouvelle_valeur, commentaire, change_par, change_le)
      VALUES (${orId}, 'NOTE', 'recent', ${`${NS}-recent`}, ${userId}, now() - interval '1 day')`;
    // Ligne de travail : pas de date propre.
    await client`
      INSERT INTO lignes_ordre_reparation (ordre_id, libelle, quantite, statut)
      VALUES (${orId}, ${`${NS}-sans date`}, 1, 'a_faire')`;

    const r = await caller().journal({ id: vehiculeId });
    const dates = r.entrees.map((e) => e.quand);
    const premierSansDate = dates.findIndex((d) => d === null);
    const dernierAvecDate = dates.map((d) => d !== null).lastIndexOf(true);
    if (premierSansDate >= 0) {
      expect(premierSansDate).toBeGreaterThan(dernierAvecDate);
    }
    // L'ordre décroissant doit être respecté sur la partie datée.
    const avecDate = r.entrees.filter((e) => e.quand).map((e) => e.quand!);
    expect(avecDate).toEqual([...avecDate].sort().reverse());
  }, 30000);

  it("6. un véhicule sans dossier a un journal vide — pas une erreur", async () => {
    const [v] = await client`
      INSERT INTO vehicules (agence_id, immatriculation, marque, modele, statut_immobilisation, is_active)
      VALUES (${AGENCE}, ${`JO-${NS}-2`}, ${`${NS}-Seul`}, 'M', 'en_reception', true) RETURNING id`;
    const r = await caller().journal({ id: v!.id });
    expect(r.entrees).toEqual([]);
    expect(r.sansAuteur).toBe(0);
  }, 30000);
});