/**
 * LOT U0a — RÈGLE VÉHICULE UNIQUE, partagées par les TROIS écrans de création.
 *
 * Avant ce lot, la même plaque donnait trois résultats selon l'écran :
 * réception → réutilisée ; garage → liée au canonique ; parc → refusée.
 *
 * Garanties testées :
 *
 *  1. PARITÉ : les trois endpoints réconcilient une plaque connue (aucun
 *     refus, aucun doublon) et renvoient toujours le MÊME véhicule.
 *  2. NORMALISATION : « u0a parc 777 » ≡ « U0A-PARC-777 » selon la règle
 *     (espaces supprimés, majuscules, ponctuation conservée) — pareil partout.
 *  3. TRANSPARENCE (R4) : `vehicules.create` signale désormais la réutilisation
 *     (`vehiculeReconcilie`) au lieu de lever une erreur ; aucune donnée
 *     existante n'est écrasée.
 *  4. NON-ÉCRASEMENT : une marque déjà renseignée est conservée même si
 *     l'écran propose autre chose ; les champs VIDE sont seuls complétés.
 *  5. PROPRIÉTAIRE : `garage.create` ne fabrique plus de client et n'écrase
 *     pas un propriétaire existant.
 *  6. TYPE OUVERT : un type hors nomenclature (U1) est accepté partout — le
 *     `z.enum` de `vehicules.create` aurait refusé ce que la réception prend.
 *
 * Fixtures RBAC réelles, namespace `u0aregles`.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { vehiculesRouter } from "~/server/api/routers/vehicules-router";
import { garageRouter } from "~/server/api/routers/garage-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "u0aregles";
const ROLE_CODE = `${NS}_or`;
const USER_EMAIL = `${NS}.or@gpj.cm`;
const NUM_REGISTRE = 9601;

type Row = Record<string, unknown>;

let userId = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "U0a superadmin",
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
        VALUES (${ROLE_CODE}, 'LotU0a regles', 'Fixture LotU0a', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[];
  if (!role?.id) throw new Error(`Fixtures ${NS} : rôle introuvable.`);
  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'U0A', 'Fixture', 1, ${role.id}::uuid, true, 'active')
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
  // Les tests R1bis créent des lignes sur NUM_REGISTRE+1/+2/+3 : nettoyer
  // uniquement le registre de base laissait des `parking_movements` orphelins
  // qui faisaient échouer le `retirer()` suivant sur la FK utilisateurs.
  const pv = (await db.execute(
    sql`SELECT id FROM parking_vehicles
        WHERE num_registre BETWEEN ${NUM_REGISTRE} AND ${NUM_REGISTRE + 10}`,
  )) as unknown as Row[];
  for (const v of pv) {
    await db.execute(sql`DELETE FROM parking_movements WHERE vehicle_id = ${v.id}`);
  }
  await db.execute(
    sql`DELETE FROM parking_vehicles WHERE num_registre BETWEEN ${NUM_REGISTRE} AND ${NUM_REGISTRE + 10}`,
  );

  const vehs = (await db.execute(
    sql`SELECT id FROM vehicules WHERE immat_norm LIKE 'U0A%' OR immatriculation LIKE 'U0A%'`,
  )) as unknown as Row[];
  for (const v of vehs) {
    await db.execute(sql`DELETE FROM ordres_reparation WHERE vehicule_id = ${v.id}`);
  }
  await db.execute(sql`DELETE FROM vehicules WHERE immat_norm LIKE 'U0A%' OR immatriculation LIKE 'U0A%'`);
  await db.execute(sql`DELETE FROM clients WHERE nom LIKE 'Client U0a%'`);
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

const vehiculeParPlaque = async (immat: string) =>
  ((await db.execute(
    sql`SELECT id, client_id, marque, modele, version, couleur, type_vehicule, immat_norm
        FROM vehicules WHERE immat_norm = ${immat}`,
  )) as unknown as Row[])[0] ?? {};

describe("LOT U0a — règle véhicule unique sur les 3 écrans", () => {
  it("1. PARITÉ — les 3 endpoints réconcilient la même plaque vers le même véhicule", async () => {
    const or = orRouter.createCaller(ctxSuperadmin());
    const parc = vehiculesRouter.createCaller(ctxSuperadmin());
    const garage = garageRouter.createCaller(ctxSuperadmin());

    // 1ᵉʳ création : réception.
    const r1 = await or.receptionner({
      client: { nom: "Client U0a 1", telephone: "690100111" },
      vehicule: { immatriculation: "U0A-PARC-777", marque: "Toyota" },
      reception: { kilometrageEntree: 1000, pannesDeclarees: "Freins" },
    });
    expect((r1 as any).vehiculeReconcilie).toBe(false);

    // 2ᵉ passe : le PARC réutilise (il refusait avant) et le signale.
    const r2 = await parc.create({ immatriculation: "U0A-PARC-777", modele: "Hilux" });
    expect(r2.vehiculeReconcilie).toBe(true);
    expect(r2.id).toBe(r1.vehiculeId);

    // 3ᵉ passe : la RÉCEPTION réutilise toujours, avec le MÊME client.
    // Variante de saisie : espaces autour + casse différente — MÊME plaque
    // (RD1 conserve la ponctuation : « u0a parc 777 » ≠ « U0A-PARC-777 »).
    //
    // Le client est réutilisé, et non remplacé : le garage n'a pas le droit de
    // changer le propriétaire d'un véhicule. Un second client sur la même
    // plaque serait refusé — et il doit l'être.
    const r3 = await or.receptionner({
      client: { id: r1.clientId },
      vehicule: { immatriculation: "  u0a-parc-777  " },
      reception: { kilometrageEntree: 2000, pannesDeclarees: "Freins" },
    });
    expect((r3 as any).vehiculeReconcilie).toBe(true);
    expect(r3.vehiculeId).toBe(r1.vehiculeId);

    // 4ᵉ passe : le GARAGE rattache au MÊME véhicule. Depuis la règle « un
    // passage actif », il faut d'abord clôturer le passage créé par la
    // réception : un véhicule ne peut pas avoir deux places occupées.
    await db.execute(sql`UPDATE parking_vehicles SET statut = 'SORTI' WHERE vehicule_id = ${r1.vehiculeId}`);
    const g = await garage.create({ immatriculation: "U0A-PARC-777", numRegistre: NUM_REGISTRE });
    const ligne = ((await db.execute(
      sql`SELECT vehicule_id FROM parking_vehicles WHERE num_registre = ${NUM_REGISTRE}`,
    )) as unknown as Row[])[0] ?? {};
    expect(Number(ligne.vehicule_id)).toBe(r1.vehiculeId);

    // Une seule ligne véhicule pour cette plaque.
    const rows = (await db.execute(
      sql`SELECT id FROM vehicules WHERE immat_norm = 'U0A-PARC-777'`,
    )) as unknown as Row[];
    expect(rows.length).toBe(1);
  });

  it("3. NON-ÉCRASEMENT + TRANSPARENCE — une donnée existante n'est jamais écrasée", async () => {
    const or = orRouter.createCaller(ctxSuperadmin());
    const parc = vehiculesRouter.createCaller(ctxSuperadmin());

    const r1 = await or.receptionner({
      client: { nom: "Client U0a 1", telephone: "690100111" },
      vehicule: { immatriculation: "U0A-PARC-888", marque: "Toyota", modele: "Hilux", version: "Invincible" },
      reception: { kilometrageEntree: 1000, pannesDeclarees: "Freins" },
    });

    // Le parc propose une AUTRE marque : elle doit être ignorée, pas appliquée.
    const r2 = await parc.create({
      immatriculation: "U0A-PARC-888",
      marque: "Renault",
      version: "Break",
      couleur: "Rouge", // champ VIDE → celui-ci doit être REMPLI
    });
    expect(r2.vehiculeReconcilie).toBe(true);

    const v = await vehiculeParPlaque("U0A-PARC-888");
    expect(Number(v.id)).toBe(r1.vehiculeId);
    expect(v.marque).toBe("Toyota"); // historique conservé
    expect(v.version).toBe("Invincible"); // historique conservé
    expect(v.couleur).toBe("Rouge"); // champ vide → complété
  });

  it("5. le garage n'écrase pas un propriétaire déjà connu", async () => {
    const or = orRouter.createCaller(ctxSuperadmin());
    const garage = garageRouter.createCaller(ctxSuperadmin());

    const r1 = await or.receptionner({
      client: { nom: "Client U0a proprio", telephone: "690100333" },
      vehicule: { immatriculation: "U0A-PARC-999", marque: "Peugeot" },
      reception: { kilometrageEntree: 1000, pannesDeclarees: "Freins" },
    });
    const avant = await vehiculeParPlaque("U0A-PARC-999");
    const clientIdInitial = Number(avant.client_id);
    expect(clientIdInitial).toBeGreaterThan(0);

    // Le garage saisit un nom de client en texte libre : il ne doit NI
    // remplacer le propriétaire, NI fabriquer de client.
    await db.execute(sql`UPDATE parking_vehicles SET statut = 'SORTI' WHERE vehicule_id = ${r1.vehiculeId}`);
    await garage.create({
      immatriculation: "U0A-PARC-999",
      numRegistre: NUM_REGISTRE,
      clientNom: "Autre Nom Fictif",
    });
    const apres = await vehiculeParPlaque("U0A-PARC-999");
    expect(Number(apres.client_id)).toBe(clientIdInitial);
    const clients = (await db.execute(
      sql`SELECT count(*)::int AS n FROM clients WHERE nom = 'Autre Nom Fictif'`,
    )) as unknown as Row[];
    expect(Number(clients[0].n)).toBe(0);
  });

  it("6. TYPE OUVERT — un type hors nomenclature est accepté par les 2 endpoints", async () => {
    const or = orRouter.createCaller(ctxSuperadmin());
    const parc = vehiculesRouter.createCaller(ctxSuperadmin());

    const r1 = await or.receptionner({
      client: { nom: "Client U0a benne", telephone: "690100444" },
      vehicule: { immatriculation: "U0A-PARC-666", marque: "Renault", typeVehicule: "benne_littere" },
      reception: { kilometrageEntree: 1000, pannesDeclarees: "Freins" },
    });
    const v1 = await vehiculeParPlaque("U0A-PARC-666");
    expect(v1.type_vehicule).toBe("benne_littere");

    // Le parc ACCEPTE le même type (avant : z.enum → refus).
    // NB : `vehicules.create` renvoie les CLÉS du schéma (`typeVehicule`),
    // pas les noms de colonne SQL.
    const r2 = await parc.create({ immatriculation: "U0A-PARC-666", typeVehicule: "benne_littere" });
    expect(r2.id).toBe(r1.vehiculeId);
    expect(r2.typeVehicule).toBe("benne_littere");
  });

  it("7. une plaque sans propriétaire est adoptée par le client saisi (comblement)", async () => {
    const parc = vehiculesRouter.createCaller(ctxSuperadmin());
    const or = orRouter.createCaller(ctxSuperadmin());

    const r1 = await parc.create({ immatriculation: "U0A-PARC-555", marque: "Kia" });
    expect(r1.clientId).toBeNull();

    const r2 = await or.receptionner({
      client: { nom: "Client U0a adopts", telephone: "690100555" },
      vehicule: { immatriculation: "U0A-PARC-555" },
      reception: { kilometrageEntree: 5000, pannesDeclarees: "Freins" },
    });
    const v = await vehiculeParPlaque("U0A-PARC-555");
    expect(Number(v.id)).toBe(r1.id);
    expect(Number(v.client_id)).toBeGreaterThan(0);
  });
  it("8. U0d — l'empreinte physique est conservée et l'estimation reste signalée", async () => {
    const or = orRouter.createCaller(ctxSuperadmin());
    const parc = vehiculesRouter.createCaller(ctxSuperadmin());

    const r1 = await or.receptionner({
      client: { nom: "Client U0a dims", telephone: "690100666" },
      vehicule: {
        immatriculation: "U0A-PARC-444",
        marque: "Scania",
        typeVehicule: "poids_lourd",
        longueur: 12.5,
        largeur: 2.55,
        hauteur: 3.9,
        poids: 18000,
        dimensionsEstimees: true,
      },
      reception: { kilometrageEntree: 1000, pannesDeclarees: "Freins" },
    });

    const lignes = (await db.execute(
      sql`SELECT longueur, largeur, hauteur, poids, dimensions_estimees
          FROM vehicules WHERE id = ${r1.vehiculeId}`,
    )) as unknown as { longueur: number; largeur: number; hauteur: number; poids: number; dimensions_estimees: boolean }[];
    expect(Number(lignes[0].longueur)).toBe(12.5);
    expect(Number(lignes[0].largeur)).toBe(2.55);
    expect(Number(lignes[0].hauteur)).toBe(3.9);
    expect(Number(lignes[0].poids)).toBe(18000);
    // La qualité de la donnée reste visible : mesuré vs estimé.
    expect(lignes[0].dimensions_estimees).toBe(true);

    // Le parc reprend les mêmes champs (parité U0b/U0d).
    const r2 = await parc.create({ immatriculation: "U0A-PARC-444", longueur: 12.5 });
    expect(r2.id).toBe(r1.vehiculeId);
  });

  // ─── LOT R1bis — le garage produit un VRAI client, pas un texte ─────────────

  it("9. véhicule créé au garage : une vraie fiche client est rattachée", async () => {
    const garage = garageRouter.createCaller(ctxSuperadmin());

    // Plaque inconnue de la réception : création directe légitime.
    await garage.create({
      immatriculation: "U0A-GARA-001",
      numRegistre: NUM_REGISTRE + 1,
      clientNom: "Client U0a garage",
      clientTelephone: "691990077",
    });

    const v = await vehiculeParPlaque("U0A-GARA-001");
    expect(Number(v.client_id)).toBeGreaterThan(0);

    // Le client existe réellement dans le référentiel clients — il n'est pas
    // seulement du texte collé sur la ligne parking.
    const fiche = (await db.execute(
      sql`SELECT c.nom, c.code_client FROM clients c WHERE c.id = ${Number(v.client_id)}`,
    )) as unknown as Row[];
    expect(Number(fiche.length)).toBe(1);
    expect(fiche[0].nom).toBe("Client U0a garage");
    expect(String(fiche[0].code_client)).toMatch(/^CLT-\d{4}-\d{4}$/);
  });

  it("10. garage : un téléphone déjà connu RÉUTILISE le client, n'en crée pas un second", async () => {
    const or = orRouter.createCaller(ctxSuperadmin());
    const garage = garageRouter.createCaller(ctxSuperadmin());

    const r1 = await or.receptionner({
      client: { nom: "Client U0a deja connu", telephone: "691990088" },
      vehicule: { immatriculation: "U0A-GARA-002", marque: "Renault" },
      reception: { kilometrageEntree: 1000, pannesDeclarees: "Freins" },
    });
    const clientIdReception = (await vehiculeParPlaque("U0A-GARA-002")).client_id;

    // Autre plaque, MÊME téléphone : c'est le cas courant du garage.
    await garage.create({
      immatriculation: "U0A-GARA-003",
      numRegistre: NUM_REGISTRE + 2,
      clientNom: "Client U0a deja connu",
      clientTelephone: "691990088",
    });

    // Le véhicule du garage pointe sur le client EXISTANT, pas sur un homonyme.
    const v = await vehiculeParPlaque("U0A-GARA-003");
    expect(Number(v.client_id)).toBe(Number(clientIdReception));

    const comptes = (await db.execute(
      sql`SELECT count(*)::int AS n FROM clients WHERE telephone = '691990088'`,
    )) as unknown as Row[];
    expect(Number(comptes[0].n)).toBe(1);
    expect(Number(r1.vehiculeId)).toBeGreaterThan(0);
  });

  it("11. garage sans nom ni téléphone : AUCUNE fiche client inventée", async () => {
    const garage = garageRouter.createCaller(ctxSuperadmin());

    const avant = (await db.execute(sql`SELECT count(*)::int AS n FROM clients`)) as unknown as Row[];
    await garage.create({
      immatriculation: "U0A-GARA-004",
      numRegistre: NUM_REGISTRE + 3,
    });
    const apres = (await db.execute(sql`SELECT count(*)::int AS n FROM clients`)) as unknown as Row[];

    // Ni client, ni fiche fantôme : on n'invente pas de propriétaire.
    expect(Number(apres[0].n)).toBe(Number(avant[0].n));
    const v = await vehiculeParPlaque("U0A-GARA-004");
    expect(v.client_id == null || Number(v.client_id) === 0).toBe(true);
  });
});
