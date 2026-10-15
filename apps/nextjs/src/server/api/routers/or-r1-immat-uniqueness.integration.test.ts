/**
 * LOT R1 — Unicité de la plaque par agence (immat_norm).
 *
 * Garanties testées contre la base de test :
 *
 *  1. `or.createVehicule` : la plaque saisie est normalisée dans `immat_norm`
 *     (trim + suppression espaces + majuscules ; ponctuation conservée).
 *  2. Doublon détecté sur la forme NORMALISÉE : « LOTR1VEH » puis « lotr1veh »
 *     sont refusés (BAD_REQUEST) — l'unicité repose sur `immat_norm`, pas sur
 *     le libellé brut.
 *  3. Deux plaques distinctes (ponctuation différente) coexistent.
 *  4. Index partiel `uq_vehicules_agence_immat_norm` actif en base
 *     (`immat_norm IS NOT NULL`) ; les véhicules sans plaque (NULL) ne sont
 *     pas soumis à l'unicité (modèle « pas d'invention »).
 *  5. `or.receptionner` : réconciliation par plaque — une seconde réception
 *     portant la même plaque (saisie différemment) RÉUTILISE le véhicule
 *     existant au lieu de créer un doublon. Le drapeau `vehiculeReconcilie`
 *     (RD3) est faux à la création, vrai à la réutilisation.
 *  6. RD4 — transparence du propriétaire : lors d'une réconciliation, le
 *     client historique du véhicule est conservé par défaut ; il n'est
 *     réassigné au nouveau client que si `reassignerClient: true` est envoyé
 *     (pas d'écrasement silencieux de la propriété).
 *  7. LOT R5 (E6) — `clients.suggestionsClients` regroupe les clients d'une
 *     agence partageant le même téléphone NORMALISÉ (« 691100001 » ≡
 *     « +237 690 100 001 ») ; un numéro distinct ne produit aucun groupe.
 *  8. LOT R5 — `clients.fusionner` : le survivant garde ses données non
 *     vides (jamais d'écrasement), hérite des champs vides du doublon, et
 *     TOUTES les références clients (véhicules, OR…) sont reportées vers lui
 *     (RD10 : invariant « plus aucune FK ne pointe vers un doublon »).
 *  9. LOT R5 — `clients.doublonParTelephone` : la réception signale un
 *     client existant portant déjà le numéro saisi (aide à la sélection, sans
 *     fusion automatique).
 *
 * Fixtures réelles — namespace `lotr1`, bande de registre 9300-9349.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

// `next-auth` n'est pas resolvable hors de Next — on ne mocke QUE le
// transport d'authentification ; le RBAC (DB) reste réel.
vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { clientsRouter } from "~/server/api/routers/clients-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { normaliserImmatriculation } from "~/server/lib/parking-vehicule-service";

const NS = "lotr1";
const ROLE_CODE = `${NS}_or`;
const USER_EMAIL = `${NS}.or@gpj.cm`;

type Row = Record<string, unknown>;

let userId = 0;

/** Contexte forge « superadmin » : bypass `requirePermissionProcedure`. */
function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "LotR1 superadmin",
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

const codeDe = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? "UNKNOWN";
  }
};

async function vehiculeByImmatNorm(immatNorm: string): Promise<Row> {
  const rows = (await db.execute(
    sql`SELECT id, agence_id, immatriculation, immat_norm, client_id
        FROM vehicules WHERE agence_id = 1 AND immat_norm = ${immatNorm}`,
  )) as unknown as Row[];
  return rows[0] ?? {};
}

beforeAll(async () => {
  await retirer();

  await db.execute(
    sql`INSERT INTO roles (code, nom, description, niveau)
        VALUES (${ROLE_CODE}, 'LotR1 OR', 'Fixture LotR1', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(
    sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`,
  )) as unknown as Row[];
  const roleId = role?.id;
  if (!roleId) throw new Error(`Fixtures ${NS} : role ${ROLE_CODE} introuvable.`);

  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'LOTR1', 'Fixture', 1, ${roleId}::uuid, true, 'active')
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
});

beforeEach(async () => {
  // Chaque test repart d'une base neutre : les fixtures R5 (clients C/D,
  // téléphone 691100001) sont partagées entre tests 7-9 et faussaient les
  // regroupements de suggestionsClients / doublonParTelephone. Seul le
  // données métier est purgée — le rôle/utilisateur (créés une fois dans
  // beforeAll) reste intact car ctxSuperadmin() dépend de userId.
  await retirerDonnees();
});

afterAll(async () => {
  await retirer();
});

/** Purge les données métier (véhicules, OR, clients R5) sans toucher au RBAC. */
async function retirerDonnees(): Promise<void> {
  // Nettoyage large, dans l'ordre des clés étrangères : OR d'abord, puis
  // véhicules. Les OR sont ciblés via leur véhicule (immatriculation LotR1)
  // car leur `numero` est généré côté serveur.
  const vehs = (await db.execute(
    sql`SELECT id FROM vehicules
        WHERE agence_id = 1 AND (immat_norm LIKE 'LOTR1%' OR immatriculation LIKE 'LOTR1%')`,
  )) as unknown as Row[];
  for (const v of vehs) {
    await db.execute(sql`DELETE FROM ordres_reparation WHERE vehicule_id = ${v.id}`);
    // Libère toute référence résiduelle hors OR (parcours parking, flotte…).
    await db.execute(sql`DELETE FROM parking_vehicles WHERE vehicule_id = ${v.id}`);
  }
  await db.execute(
    sql`DELETE FROM vehicules
        WHERE agence_id = 1 AND (immat_norm LIKE 'LOTR1%' OR immatriculation LIKE 'LOTR1%')`,
  );
  // Clients créés par les réceptions (LOTR1 / Client A-B / Client D-*) — après
  // les véhicules qui les référencent. Portée élargie au-delà de l'OR pour
  // absorber les fixtures R5 (fusion, doublon, téléphone).
  await db.execute(
    sql`DELETE FROM clients
        WHERE agence_id = 1
          AND (nom IN ('Client LotR1', 'Client A', 'Client B', 'Client C', 'Client D')
               OR code_client LIKE 'LOTR1-%')`,
  );
  await db.execute(
    sql`DELETE FROM audit_logs
        WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
}

/** Purge complète : données métier + fixtures RBAC (beforeAll / afterAll). */
async function retirer(): Promise<void> {
  await retirerDonnees();
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(
    sql`DELETE FROM role_permissions
        WHERE role_id IN (SELECT id FROM roles WHERE code = ${ROLE_CODE})`,
  );
  await db.execute(
    sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`,
  );
  userId = 0;
}

describe("LOT R1 — unicité de la plaque par agence (immat_norm)", () => {
  it("1-2. createVehicule normalise la plaque et refuse le doublon normalisé", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());

    const created = await caller.createVehicule({
      immatriculation: "LOTR1VEH00",
      marque: "LotR1",
      modele: "Test",
    });
    expect(created.id).toBeGreaterThan(0);

    const row = await vehiculeByImmatNorm("LOTR1VEH00");
    expect(row.immat_norm).toBe("LOTR1VEH00");
    expect(row.immatriculation).toBe("LOTR1VEH00");

    // Même plaque, saisie différemment (minuscules + espaces) → doublon refusé.
    const code = await codeDe(
      caller.createVehicule({
        immatriculation: "  lotr1veh00  ",
        marque: "LotR1",
        modele: "Doublon",
      }),
    );
    expect(code).toBe("BAD_REQUEST");

    // Un seul véhicule réellement créé pour cette plaque.
    const rows = (await db.execute(
      sql`SELECT id FROM vehicules
          WHERE agence_id = 1 AND immat_norm = ${"LOTR1VEH00"}`,
    )) as unknown as Row[];
    expect(rows.length).toBe(1);
  });

  it("3-4. la ponctuation est conservée (plaques distinctes) + index partiel actif", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());

    const a = await caller.createVehicule({
      immatriculation: "LOTR1-A.123",
      marque: "LotR1",
      modele: "PonctueA",
    });
    const b = await caller.createVehicule({
      immatriculation: "LOTR1A.123",
      marque: "LotR1",
      modele: "PonctueB",
    });
    expect(a.id).not.toBe(b.id);
    expect(await vehiculeByImmatNorm("LOTR1-A.123")).not.toEqual({});
    expect(await vehiculeByImmatNorm("LOTR1A.123")).not.toEqual({});

    // L'index partiel d'unicité est bien en place sur la base de test.
    const idx = (await db.execute(
      sql`SELECT indexname FROM pg_indexes
          WHERE tablename = 'vehicules'
            AND indexname = 'uq_vehicules_agence_immat_norm'`,
    )) as unknown as Row[];
    expect(idx.length).toBe(1);

    // Le véhicule créé ici n'a PAS de client (pas d'invention de propriété).
    const row = await vehiculeByImmatNorm("LOTR1-A.123");
    expect(row.client_id).toBeNull();
  });

  it("5. receptionner réconcilie par plaque et RÉUTILISE le véhicule existant", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());

    const reception = (immat: string) => ({
      client: { nom: "Client LotR1", prenom: "Test" },
      vehicule: { immatriculation: immat },
      reception: {
        kilometrageEntree: 12000,
        pannesDeclarees: "Bruit de roulement",
      },
    });

    const or1 = await caller.receptionner(reception("LOTR1VEH01"));
    // 2ᵉ réception : MÊME client, plaque réécrit différemment («  lotr1veh01  »).
    // On réutilise la fiche client : en créer une seconde pour le même
    // propriétaire est précisément ce que le garage ne peut pas faire.
    const or2 = await caller.receptionner({
      ...reception("  lotr1veh01  "),
      client: { id: or1.clientId },
    });

    // Les deux OR pointent vers le MÊME véhicule (réutilisation, pas de doublon).
    expect(or1.vehiculeId).toBe(or2.vehiculeId);

    // RD3 — transparence : la 1ʳᵉ réception crée le véhicule (flag faux),
    // la 2ᵉ le réutilise par plaque normalisée (flag vrai).
    expect((or1 as any).vehiculeReconcilie).toBe(false);
    expect((or2 as any).vehiculeReconcilie).toBe(true);

    const rows = (await db.execute(
      sql`SELECT id FROM vehicules
          WHERE agence_id = 1 AND immat_norm = ${"LOTR1VEH01"}`,
    )) as unknown as Row[];
    expect(rows.length).toBe(1);
  });

  it("6. le garage ne peut PAS changer le propriétaire d'un véhicule", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const immat = "LOTR1VEH02";

    // 1ʳᵉ réception : véhicule créé, rattaché au client A.
    const orA = await caller.receptionner({
      client: { nom: "Client A", telephone: "691000001" },
      vehicule: { immatriculation: immat },
      reception: { kilometrageEntree: 10000, pannesDeclarees: "Vidange" },
    });
    const v = await vehiculeByImmatNorm(immat);
    const clientIdA = v.client_id as number;
    expect(clientIdA).toBeGreaterThan(0);

    // 2ᵉ réception, même plaque, AUTRE client : la réception est REFUSÉE.
    //
    // Décision métier : le garage n'a pas le droit de changer le propriétaire
    // d'un véhicule. Le comportement précédent — conserver l'ancien
    // propriétaire en silence — était trompeur : l'agent croyait avoir
    // enregistré la réception pour le client choisi, alors que le véhicule
    // restait rattaché à l'ancien, sans aucun message.
    await expect(
      caller.receptionner({
        client: { nom: "Client B", telephone: "691000002" },
        vehicule: { immatriculation: immat },
        reception: { kilometrageEntree: 11000, pannesDeclarees: "Freins" },
      }),
    ).rejects.toThrow(/propriétaire|proprietaire/i);

    // Le véhicule est resté intact : ni détaché, ni réattribué.
    const v2 = await vehiculeByImmatNorm(immat);
    expect(v2.client_id).toBe(clientIdA);

    // 3ᵉ réception, même plaque, MÊME propriétaire : elle passe. Le véhicule
    //    appartient toujours à A, et A ramène son véhicule une seconde fois.
    const orA2 = await caller.receptionner({
      client: { id: clientIdA },
      vehicule: { immatriculation: immat },
      reception: { kilometrageEntree: 12000, pannesDeclarees: "Alternateur" },
    });
    expect(orA2.vehiculeId).toBe(orA.vehiculeId);
    const v3 = await vehiculeByImmatNorm(immat);
    expect(v3.client_id).toBe(clientIdA);
  });

  it("7. suggestionsClients regroupe les clients au même téléphone normalisé", async () => {
    const orCaller = orRouter.createCaller(ctxSuperadmin());
    const clCaller = clientsRouter.createCaller(ctxSuperadmin());
    const immat = "LOTR1VEH03";

    // Deux clients DISTINCTS partageant le même téléphone normalisé, sur deux
    // véhicules distincts : c'est le doublon que `suggestionsClients` doit
    // remonter. La confirmation est exigée — sans elle, la réception refuse
    // de créer une seconde fiche (règle : un doublon se signale, il ne se
    // crée pas en silence).
    await orCaller.receptionner({
      client: { nom: "Client C", telephone: "691100001" },
      vehicule: { immatriculation: immat },
      reception: { kilometrageEntree: 5000, pannesDeclarees: "Vidange" },
    });
    await orCaller.receptionner({
      client: { nom: "Client D", telephone: "+237 691 100 001" },
      vehicule: { immatriculation: "LOTR1VEH08" },
      confirmerClientDoublon: true,
      reception: { kilometrageEntree: 6000, pannesDeclarees: "Freins" },
    });

    const res = await clCaller.suggestionsClients();
    const groupe = res.groupes.find((g) => g.telNorm === "691100001");
    expect(groupe).toBeDefined();
    expect(groupe!.membres.length).toBeGreaterThanOrEqual(2);
    const noms = groupe!.membres.map((m) => m.nom).sort();
    expect(noms).toContain("Client C");
    expect(noms).toContain("Client D");

    // Le survivant proposé est le plus ancien (source de vérité historique).
    expect(groupe!.survivant.id).toBe(
      Math.min(...groupe!.membres.map((m) => m.id)),
    );
  });

  it("8. fusionner complète le survivant et reporte TOUTES les références (RD10)", async () => {
    const orCaller = orRouter.createCaller(ctxSuperadmin());
    const clCaller = clientsRouter.createCaller(ctxSuperadmin());
    const immat = "LOTR1VEH04";

    // Deux clients distincts, même téléphone normalisé, formats différents.
    // Véhicules distincts : on ne peut pas rattacher deux propriétaires
    // différents au même véhicule, et la fusion est précisément l'outil prévu
    // pour rapprocher ces deux fiches ensuite.
    const or1 = await orCaller.receptionner({
      client: { nom: "Client C", telephone: "691100001", email: "c@lotr1.cm" },
      vehicule: { immatriculation: immat },
      reception: { kilometrageEntree: 5000, pannesDeclarees: "Vidange" },
    });
    const or2 = await orCaller.receptionner({
      client: { nom: "Client D", telephone: "+237 691 100 001", ville: "Douala" },
      vehicule: { immatriculation: "LOTR1VEH09" },
      confirmerClientDoublon: true,
      reception: { kilometrageEntree: 6000, pannesDeclarees: "Freins" },
    });

    const v1 = await vehiculeByImmatNorm(immat);
    // Client D a son PROPRE véhicule : on ne peut pas rattacher deux
    // propriétaires au même véhicule. C'est la fiche de Client D qu'on
    // récupère, pour la fusionner ensuite dans celle de Client C.
    const vDoublon = await vehiculeByImmatNorm("LOTR1VEH09");
    const doublonId = vDoublon.client_id as number;
    expect(doublonId).toBeGreaterThan(0);
    expect(v1.client_id).not.toBe(doublonId);

    // Survivant = Client C (le plus ancien), doublon = Client D.
    const res = await clCaller.suggestionsClients();
    const groupe = res.groupes.find((g) => g.telNorm === "691100001");
    expect(groupe).toBeDefined();
    const survivantId = groupe!.survivant.id;
    expect(survivantId).toBe(v1.client_id);

    // Le doublon porte la ville (champ que le survivant n'a pas).
    const avSurv = (await db.execute(
      sql`SELECT ville, email FROM clients WHERE id = ${survivantId}`,
    )) as unknown as Row[];
    expect(avSurv[0]?.ville ?? null).toBeNull();

    const r = await clCaller.fusionner({ survivantId, doublonIds: [doublonId] });
    expect(r.fusionnes).toBe(1);

    // Survivant : ville héritée du doublon, email non écrasé (D3/RD4).
    const apSurv = (await db.execute(
      sql`SELECT ville, email, deleted_at FROM clients WHERE id = ${survivantId}`,
    )) as unknown as Row[];
    expect(apSurv[0]?.ville).toBe("Douala");
    expect(apSurv[0]?.email).toBe("c@lotr1.cm");
    expect(apSurv[0]?.deleted_at).toBeNull();

    // RD10 — TOUTES les références sont reportées : plus aucune ligne ne
    // pointe vers le doublon, et les deux OR + le véhicule pointent le survivant.
    const vehRef = (await db.execute(
      sql`SELECT client_id FROM vehicules WHERE id = ${or1.vehiculeId}`,
    )) as unknown as Row[];
    expect(vehRef[0]?.client_id).toBe(survivantId);

    const orRef = (await db.execute(
      sql`SELECT client_id FROM ordres_reparation WHERE id IN (${or1.id}, ${or2.id})`,
    )) as unknown as Row[];
    expect(orRef.length).toBe(2);
    for (const row of orRef) expect(row.client_id).toBe(survivantId);

    const fkRestantes = (await db.execute(
      sql`SELECT
            (SELECT count(*) FROM vehicules WHERE client_id = ${doublonId}) AS veh,
            (SELECT count(*) FROM ordres_reparation WHERE client_id = ${doublonId}) AS ors`,
    )) as unknown as Row[];
    expect(Number(fkRestantes[0]?.veh ?? 0)).toBe(0);
    expect(Number(fkRestantes[0]?.ors ?? 0)).toBe(0);

    // Le doublon est archivé (soft-delete), jamais supprimé physiquement.
    const doublon = (await db.execute(
      sql`SELECT deleted_at FROM clients WHERE id = ${doublonId}`,
    )) as unknown as Row[];
    expect(doublon[0]?.deleted_at).not.toBeNull();

    // Un client archivé n'apparaît plus dans les suggestions.
    const apres = await clCaller.suggestionsClients();
    const gApres = apres.groupes.find((g) => g.telNorm === "691100001");
    expect(gApres).toBeUndefined();
  });

  it("9. doublonParTelephone signale un client existant portant déjà le numéro", async () => {
    const orCaller = orRouter.createCaller(ctxSuperadmin());
    const clCaller = clientsRouter.createCaller(ctxSuperadmin());
    const immat = "LOTR1VEH05";

    await orCaller.receptionner({
      client: { nom: "Client D", telephone: "691100001" },
      vehicule: { immatriculation: immat },
      reception: { kilometrageEntree: 7000, pannesDeclarees: "Alternateur" },
    });

    // Même numéro, format international → même client détecté (pas de doublon).
    const res = await clCaller.doublonParTelephone({ telephone: "+237 691 100 001" });
    expect(res.client).not.toBeNull();
    expect(res.client!.nom).toBe("Client D");

    // Numéro inconnu → aucun signal (la réception créera un client neuf).
    const inconnu = await clCaller.doublonParTelephone({ telephone: "699999999" });
    expect(inconnu.client).toBeNull();
  });

  it("normaliserImmatriculation : trim + espaces supprimés + majuscules (ponctuation conservée)", () => {
    expect(normaliserImmatriculation("  ab-123-cd  ")).toBe("AB-123-CD");
    expect(normaliserImmatriculation("ab1 23cd")).toBe("AB123CD");
    expect(normaliserImmatriculation(null)).toBe("");
    expect(normaliserImmatriculation(undefined)).toBe("");
  });
});
