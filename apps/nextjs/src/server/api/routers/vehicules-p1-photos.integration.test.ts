/**
 * F1/F2 — photos d'un véhicule dans l'ATELIER.
 *
 * L'atelier n'avait aucune photo : ni colonne dans la liste, ni galerie dans
 * la fiche. Le parking en avait. Deux écrans, deux sources — donc deux
 * vérités, dont une forcément fausse.
 *
 * Ce qui est vérifié ici :
 *
 *  1. La liste canonique renvoie une vignette. La photo vit sur
 *     `parking_vehicles.photos` (jsonb) ; `photo_presente` est un miroir
 *     booléen qui évite de dépacketer 11 Mo de jsonb pour lister un parc.
 *  2. La photo est indexée par VÉHICULE, pas par ligne parking. L'atelier
 *     connaît le véhicule ; lui demander de retrouver la ligne de registre
 *     l'obligerait à charger le registre pour ouvrir une fiche technique.
 *  3. Une photo absente ne produit **pas** de vignette cassée. `photo_presente`
 *     peut dire vrai alors que l'URL est vide — la ligne dit vrai, l'image
 *     ne s'affiche pas. Il faut donc les deux.
 *  4. Un véhicule sans ligne parking n'a pas de photo. Un véhicule sur la
 *     liste atelier n'est pas forcément au registre.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import postgres from "postgres";
import { vehiculesRouter } from "~/server/api/routers/vehicules-router";

const NS = "p1photo";
const AGENCE = 1;
const USER_EMAIL = "p1photo@photos.test";
let userId = 0;
let client: ReturnType<typeof postgres>;

const IMG = (n: string) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"/><!--${n}-->`).toString("base64")}`;

function ctx() {
  const user = {
    id: String(userId), name: "P1Photo", email: USER_EMAIL,
    agenceId: AGENCE, agenceName: "TEST", organizationId: "1",
    role: "superadmin", permissions: [], isActive: true, status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } } as never;
}

const caller = () => vehiculesRouter.createCaller(ctx());

async function nettoyer(): Promise<void> {
  await client`DELETE FROM parking_vehicles WHERE marque LIKE ${`%${NS}%`}`;
  await client`DELETE FROM vehicules WHERE marque LIKE ${`%${NS}%`}`;
  await client`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`;
  await client`DELETE FROM roles WHERE code LIKE ${`${NS}%`}`;
}

/** Véhicule + ligne parking, avec un nombre de photos donné. */
async function fixture(photos: { url: string; categorie: string; date: string; auteur: string }[] | null, suffixe = "a") {
  const [v] = await client`
    INSERT INTO vehicules (agence_id, immatriculation, marque, modele, statut_immobilisation, is_active)
    VALUES (${AGENCE}, ${`PH-${NS}-${suffixe}`}, ${`${NS}-${suffixe}`}, 'Modele', 'en_reception', true)
    RETURNING id`;
  // On passe le TABLEAU JS, pas `JSON.stringify(...)`.
  //
  // `JSON.stringify(photos) :: jsonb` produit une valeur jsonb de type **string**
  // qui contient le JSON — un double encodage. La ligne paraît correcte à la
  // lecture (`photos::text` affiche bien un tableau), et `jsonb_typeof` renvoie
  // pourtant `string`. C'est le genre de faute qui ne se voit qu'en
  // interrogeant le type : `jsonb_array_length` lève alors « cannot get length
  // of a scalar ». L'application écrit via drizzle, qui sérialise correctement ;
  // c'est le test qui devait refléter ce chemin-là, pas l'inventer.
  // `any` : postgres.js type son paramètre sur l'usage, et un tableau dont le
  // type n'est pas inférable casse l'overload alors que l'exécution est
  // correcte. Le comportement à vérifier ici est SQL, pas le typage du driver.
  const photosJsonb = (photos ?? []) as never;
  const [p] = await client`
    INSERT INTO parking_vehicles (agence_id, vehicule_id, num_registre, marque, modele,
                                  immatriculation, statut, photo_presente, photos)
    VALUES (${AGENCE}, ${v!.id}, ${9700 + (suffixe.charCodeAt(0) % 20)}, ${`${NS}-${suffixe}`}, 'Modele',
            ${`PH-${NS}-${suffixe}`}, 'EN_PARKING', ${photos != null}, ${photosJsonb}::jsonb)
    RETURNING id`;
  return { vehiculeId: v!.id, parkingId: p!.id };
}

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  await nettoyer();
  const [role] = await client`
    INSERT INTO roles (code, nom, description, niveau)
    VALUES (${`${NS}_consultation`}, 'P1Photo', 'Fixture', 0)
    ON CONFLICT (code) DO NOTHING RETURNING id`;
  let roleId = role?.id;
  if (!roleId) {
    const [r] = await client`SELECT id FROM roles WHERE code = ${`${NS}_consultation`}`;
    roleId = r!.id;
  }
  const [u] = await client`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
    VALUES (${USER_EMAIL}, 'P1Photo', 'Fixture', ${AGENCE}, ${roleId}::uuid, true, 'active')
    ON CONFLICT (email) DO NOTHING RETURNING id`;
  userId = u?.id ?? 0;
}, 30000);

afterAll(async () => {
  await nettoyer();
  await client.end();
});

describe("Photos véhicule côté atelier", () => {
  it("1. la liste canonique renvoie vignette et compte", async () => {
    const { vehiculeId } = await fixture([
      { url: IMG("a"), categorie: "AVANT", date: "2026-10-01T10:00:00.000Z", auteur: "Agent" },
      { url: IMG("b"), categorie: "MOTEUR", date: "2026-10-01T10:05:00.000Z", auteur: "Agent" },
    ], "1");

    const r = await caller().listeCanonique({ search: `${NS}-1`, limit: 10 });
    const v = r.vehicules.find((x) => x.id === vehiculeId);
    expect(v).toBeDefined();
    expect(v!.photoPresente).toBe(true);
    expect(v!.nbPhotos).toBe(2);
    expect(v!.photoUrl).toBeTruthy();
    expect(v!.parkingRowId).toBeTruthy();
  }, 30000);

  it("2. photos indexées par véhicule — pas par ligne parking", async () => {
    const { vehiculeId } = await fixture([
      { url: IMG("x"), categorie: "AVANT", date: "2026-10-01T10:00:00.000Z", auteur: "Agent" },
    ], "2");

    // On appelle avec l'identifiant VÉHICULE : l'atelier ne connaît pas la
    // ligne de registre, et ne doit pas avoir à la retrouver.
    const r = await caller().photos({ id: vehiculeId });
    expect(r.photos.length).toBe(1);
    expect(r.photos[0]!.url).toBeTruthy();
    expect(r.photos[0]!.categorie).toBe("AVANT");
  }, 30000);

  it("3. miroir vrai + URL vide = pas de vignette cassée", async () => {
    // Cas réel : la photo a été retirée du stockage sans que la colonne
    // dénormalisée soit remise à jour. Afficher la vignette produirait une
    // image cassée ; prétendre qu'il n'y a pas de photo serait faux aussi.
    const [v] = await client`
      INSERT INTO vehicules (agence_id, immatriculation, marque, modele, statut_immobilisation, is_active)
      VALUES (${AGENCE}, ${`PH-${NS}-3`}, ${`${NS}-3`}, 'Modele', 'en_reception', true) RETURNING id`;
    await client`
      INSERT INTO parking_vehicles (agence_id, vehicule_id, num_registre, marque, immatriculation,
                                    statut, photo_presente, photos)
      VALUES (${AGENCE}, ${v!.id}, 9713, ${`${NS}-3`}, ${`PH-${NS}-3`}, 'EN_PARKING', true,
              '[{"categorie":"AVANT","date":"2026-10-01"}]'::jsonb)`;

    const r = await caller().listeCanonique({ search: `${NS}-3`, limit: 10 });
    const l = r.vehicules.find((x) => x.id === v!.id);
    expect(l!.photoPresente).toBe(false);
  }, 30000);

  it("4. un véhicule hors registre n'a pas de photo — et ça ne casse rien", async () => {
    const [v] = await client`
      INSERT INTO vehicules (agence_id, immatriculation, marque, modele, statut_immobilisation, is_active)
      VALUES (${AGENCE}, ${`PH-${NS}-4`}, ${`${NS}-4`}, 'Modele', 'en_reception', true) RETURNING id`;
    const r = await caller().listeCanonique({ search: `${NS}-4`, limit: 10 });
    const l = r.vehicules.find((x) => x.id === v!.id);
    expect(l).toBeDefined();
    expect(l!.photoPresente).toBe(false);
    expect(l!.nbPhotos).toBe(0);
    expect(l!.parkingRowId).toBeNull();

    // Et l'endpoint ne lève pas : un atelier sans registre n'est pas une erreur.
    const ph = await caller().photos({ id: v!.id });
    expect(ph.photos).toEqual([]);
  }, 30000);
});