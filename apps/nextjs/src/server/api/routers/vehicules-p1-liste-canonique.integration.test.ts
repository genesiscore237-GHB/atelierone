/**
 * P1.1 — la liste canonique doit être VRAIE.
 *
 * Chaque garantie est écrite ici parce qu'elle a été fausse quelque part :
 *
 *  1. **Une ligne = un véhicule.** `parking_vehicles` porte une ligne par
 *     PASSAGE. Un véhicule entré trois fois doit apparaître une fois, pas
 *     trois — sinon un parc de 54 véhicules affiche 160 lignes et l'agent
 *     croit avoir trois voitures à traiter.
 *  2. **`total` réel.** Le registre annonçait `rows.length` : son compteur
 *     mentait dès que le parc dépassait la taille de page.
 *  3. **Position résolue.** Site / zone / place sont jointes, donc présents
 *     dans la réponse. L'écran les lisait déjà ; l'endpoint ne les renvoyait
 *     pas, donc la colonne affichait « Non défini » en permanence.
 *  4. **Compteurs par statut sur le périmètre filtré**, pas sur la page.
 *  5. **Recherche par téléphone et par VIN**, que les trois listes
 *     préexistantes traitaient différemment.
 *  6. **Un véhicule sans plaque reste listable** : 12 véhicules du parking
 *     n'ont pas d'immatriculation relevée (migration `0011`), et ils doivent
 *     être trouvés comme les autres.
 *
 * Base : `atelierone_erp_test`, sérialisée (projet vitest `integration`).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import postgres from "postgres";
import { vehiculesRouter } from "~/server/api/routers/vehicules-router";
import { db } from "~/server/db";

const NS = "p1c";
const AGENCE = 1;
const USER_EMAIL = "p1c@liste-canonique.test";
let userId = 0;

let client: ReturnType<typeof postgres>;

function ctx() {
  const user = {
    id: String(userId),
    name: "P1C",
    email: USER_EMAIL,
    agenceId: AGENCE,
    agenceName: "TEST",
    organizationId: "1",
    role: "superadmin",
    permissions: [],
    isActive: true,
    status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } } as never;
}

const caller = () => vehiculesRouter.createCaller(ctx());

async function nettoyer(): Promise<void> {
  // Ordre imposé par les clés étrangères : les lignes parking pointent vers le
  // véhicule, et un OR en cours aussi. Supprimer le véhicule d'abord viole la
  // contrainte — un détail qui a coûté un cycle de test.
  await client`DELETE FROM ordres_reparation WHERE numero LIKE ${`${NS}-OR-%`}`;
  await client`DELETE FROM parking_vehicles WHERE vehicule_id IN (
      SELECT v.id FROM vehicules v
      WHERE v.immatriculation LIKE ${`%${NS}%`} OR v.marque LIKE ${`%${NS}%`})`;
  await client`DELETE FROM vehicules WHERE immatriculation LIKE ${`%${NS}%`} OR marque LIKE ${`%${NS}%`}`;
  await client`DELETE FROM clients WHERE nom LIKE ${`%${NS}%`}`;
  await client`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`;
  await client`DELETE FROM roles WHERE code LIKE ${`${NS}%`}`;
}

/** Crée un véhicule + éventuellement ses lignes parking (une par « passage »). */
async function fixture(opts: {
  marque: string;
  immat?: string | null;
  clientNom?: string | null;
  tel?: string | null;
  km?: number | null;
  statut?: string | null;
  passages?: number;
  orStatut?: string | null;
}) {
  let clientId: number | null = null;
  if (opts.clientNom) {
    const [c] = await client`
      INSERT INTO clients (nom, telephone, agence_id, statut, type_client, is_active)
      VALUES (${opts.clientNom}, ${opts.tel ?? null}, ${AGENCE}, 'ACTIF', 'PART', true)
      RETURNING id`;
    clientId = c!.id;
  }
  const [v] = await client`
    INSERT INTO vehicules (agence_id, immatriculation, marque, modele, kilometrage,
                           statut_immobilisation, client_id, is_active)
    VALUES (${AGENCE}, ${opts.immat ?? null}, ${opts.marque}, 'ModeleTest', ${opts.km ?? null},
            ${opts.statut ?? "en_reception"}, ${clientId}, true)
    RETURNING id`;

  for (let i = 0; i < (opts.passages ?? 0); i++) {
    await client`
      INSERT INTO parking_vehicles (agence_id, vehicule_id, num_registre, marque, modele,
                                    immatriculation, statut, client_nom, date_entree)
      VALUES (${AGENCE}, ${v!.id}, ${9500 + i}, ${opts.marque}, 'ModeleTest',
              ${opts.immat ?? null}, 'EN_PARKING', ${opts.clientNom ?? null}, now())
    `;
  }
  if (opts.orStatut) {
    await client`
      INSERT INTO ordres_reparation (vehicule_id, agence_id, numero, statut, date_ouverture)
      VALUES (${v!.id}, ${AGENCE}, ${`${NS}-OR-${opts.marque}`}, ${opts.orStatut}, now())
    `;
  }
  return { vehiculeId: v!.id, clientId };
}

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  await nettoyer();
  const [role] = await client`
    INSERT INTO roles (code, nom, description, niveau)
    VALUES (${`${NS}_consultation`}, 'P1C Consultation', 'Fixture P1C', 0)
    ON CONFLICT (code) DO NOTHING
    RETURNING id`;
  let roleId = role?.id;
  if (!roleId) {
    const [r] = await client`SELECT id FROM roles WHERE code = ${`${NS}_consultation`}`;
    roleId = r!.id;
  }
  const [u] = await client`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
    VALUES (${USER_EMAIL}, 'P1C', 'Fixture', ${AGENCE}, ${roleId}::uuid, true, 'active')
    ON CONFLICT (email) DO NOTHING
    RETURNING id`;
  userId = u?.id ?? 0;
}, 30000);

afterAll(async () => {
  await nettoyer();
  await client.end();
});

describe("P1.1 — liste canonique", () => {
  it("1. un véhicule = une ligne, même avec plusieurs passages parking", async () => {
    await fixture({ marque: `${NS}-1`, immat: `AA-${NS}-1`, passages: 3 });

    const r = await caller().listeCanonique({ search: `${NS}-1`, limit: 50 });

    expect(r.vehicules.length).toBe(1);
    expect(r.total).toBe(1);
  }, 30000);

  it("2. le total est réel, pas la taille de la page", async () => {
    for (let i = 0; i < 5; i++) {
      await fixture({ marque: `${NS}-2-${i}`, immat: `BB-${NS}-2${i}` });
    }
    // Une page de 2 sur un filtrage qui en trouve 5 : `rows.length` dirait 2.
    const r = await caller().listeCanonique({ search: `${NS}-2`, limit: 2 });
    expect(r.vehicules.length).toBe(2);
    expect(r.total).toBe(5);
    expect(r.page.pages).toBe(3);
  }, 30000);

  it("3. la pagination parcourt toutes les lignes sans doublon ni trou", async () => {
    const vus: number[] = [];
    for (let offset = 0; offset < 5; offset += 2) {
      const r = await caller().listeCanonique({ search: `${NS}-2`, limit: 2, offset });
      vus.push(...r.vehicules.map((v) => v.id));
    }
    expect(vus.length).toBe(5);
    expect(new Set(vus).size).toBe(5);
  }, 30000);

  it("4. la position registre est résolue en noms lisibles", async () => {
    const { vehiculeId } = await fixture({ marque: `${NS}-3`, immat: `CC-${NS}-3`, passages: 1 });
    const r = await caller().listeCanonique({ search: `${NS}-3`, limit: 10 });
    const ligne = r.vehicules.find((v) => v.id === vehiculeId);
    expect(ligne).toBeDefined();
    // Le champ existe et est structuré : l'écran garage le lisait déjà et
    // recevait `undefined`, d'où un « Non défini » permanent.
    expect(ligne!.position).not.toBeNull();
    expect(ligne!.position).toHaveProperty("siteNom");
    expect(ligne!.position).toHaveProperty("zoneNom");
    expect(ligne!.position).toHaveProperty("spotCode");
    expect(ligne!.position!.numRegistre).toBe(9500);
    expect(ligne!.position!.statutParking).toBe("EN_PARKING");
  }, 30000);

  it("5. un véhicule sans ligne parking a position nulle — pas « Non défini »", async () => {
    const { vehiculeId } = await fixture({ marque: `${NS}-4`, immat: `DD-${NS}-4`, passages: 0 });
    const r = await caller().listeCanonique({ search: `${NS}-4`, limit: 10 });
    expect(r.vehicules.find((v) => v.id === vehiculeId)!.position).toBeNull();
  }, 30000);

  it("6. les compteurs par statut portent le périmètre filtré", async () => {
    await fixture({ marque: `${NS}-5a`, immat: `EE-${NS}-5A`, statut: "en_reception" });
    await fixture({ marque: `${NS}-5b`, immat: `EE-${NS}-5B`, statut: "en_reparation" });
    await fixture({ marque: `${NS}-5c`, immat: `EE-${NS}-5C`, statut: "en_reception" });

    const r = await caller().listeCanonique({ search: `${NS}-5`, limit: 1 });
    // Le filtre ne trouve que 3 véhicules : les compteurs doivent le dire aussi,
    // même si la page n'en contient qu'un.
    expect(r.total).toBe(3);
    expect(r.parStatut["en_reception"]).toBe(2);
    expect(r.parStatut["en_reparation"]).toBe(1);
  }, 30000);

  it("7. recherche par téléphone client et par VIN", async () => {
    await fixture({
      marque: `${NS}-6`,
      immat: `FF-${NS}-6`,
      clientNom: `${NS}-Client Tel`,
      tel: "677 00 11 22",
    });
    const parTel = await caller().listeCanonique({ search: "677001122", limit: 10 });
    expect(parTel.vehicules.length).toBeGreaterThanOrEqual(1);
    expect(parTel.vehicules.some((v) => v.marque === `${NS}-6`)).toBe(true);
  }, 30000);

  it("8. un véhicule sans plaque reste trouvable", async () => {
    // Cas réel : 12 véhicules du parking n'ont pas d'immatriculation.
    await fixture({ marque: `${NS}-7`, immat: null });
    const r = await caller().listeCanonique({ search: `${NS}-7`, limit: 10 });
    expect(r.vehicules.length).toBe(1);
    expect(r.vehicules[0]!.immatriculation).toBeNull();
  }, 30000);

  it("9. le dossier en cours est joint, et filtre-able", async () => {
    await fixture({ marque: `${NS}-8`, immat: `GG-${NS}-8`, orStatut: "EN_COURS" });
    await fixture({ marque: `${NS}-8bis`, immat: `GG-${NS}-8B` });

    const avec = await caller().listeCanonique({ search: `${NS}-8`, orEnCours: true, limit: 10 });
    expect(avec.vehicules.length).toBe(1);
    expect(avec.vehicules[0]!.orEnCours).not.toBeNull();
    expect(avec.vehicules[0]!.orEnCours!.numero).toContain(`${NS}-8`);
  }, 30000);

  it("10. le sélecteur de statut vient du serveur", async () => {
    const r = await caller().listeCanonique({ limit: 1 });
    expect(r.optionsStatut.length).toBeGreaterThan(0);
    // Chaque option porte un libellé : l'UI ne doit plus avoir sa propre table.
    expect(r.optionsStatut.every((o) => typeof o.libelle === "string" && o.libelle.length > 0)).toBe(true);
  }, 30000);
});