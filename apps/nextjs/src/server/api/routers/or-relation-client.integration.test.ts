/**
 * P3.2 — la première réponse et la réclamation sortent de l'oral.
 *
 * Avant ce lot, un appel au client ne laissait aucune trace et une réclamation
 * n'existait que dans la mémoire de celui qui l'avait reçue. Ces tests
 * montrent deux choses concrètes :
 *
 *  1. la première réponse est un événement UNIQUE, horodaté, donc le délai
 *     entre l'entrée du véhicule et la réponse est mesurable ;
 *  2. une réclamation ouvre un cycle, reste visible tant qu'elle est ouverte,
 *     puis se résout avec sa trace — et la fiche client 360 la reçoit aussi.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { atelierKpiRouter } from "~/server/api/routers/atelier-kpi-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "p32rel";
const USER_EMAIL = `${NS}.or@gpj.cm`;
const IMMAT = `${NS}-001`;
const IMMAT_2 = `${NS}-002`;
const TELEPHONE = "690600961";
const TELEPHONE_2 = "690600962";

type Row = Record<string, unknown>;
let userId = 0;
let orId = 0;
let orId2 = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "P32 Relation",
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

async function retirer() {
  await db.execute(
    sql`DELETE FROM client_interactions
        WHERE client_id IN (SELECT id FROM clients WHERE telephone IN (${TELEPHONE}, ${TELEPHONE_2}))`,
  );
  await db.execute(
    sql`DELETE FROM or_historique
        WHERE or_id IN (SELECT o.id FROM ordres_reparation o
          JOIN vehicules v ON v.id = o.vehicule_id
          WHERE v.immatriculation LIKE ${`${NS}%`})`,
  );
  await db.execute(
    sql`DELETE FROM ordres_reparation
        WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE ${`${NS}%`})`,
  );
  await db.execute(sql`DELETE FROM vehicules WHERE immatriculation LIKE ${`${NS}%`}`);
  await db.execute(sql`DELETE FROM clients WHERE telephone IN (${TELEPHONE}, ${TELEPHONE_2})`);
}

beforeAll(async () => {
  await retirer();
  const [u] = (await db.execute(
    sql`INSERT INTO utilisateurs (email, login_email, mot_de_passe, nom, agence_id, status)
        VALUES (${USER_EMAIL}, ${USER_EMAIL}, 'x', 'P32 Relation', 1, 'active')
        ON CONFLICT (email) DO UPDATE SET nom = 'P32 Relation'
        RETURNING id`,
  )) as unknown as Row[];
  userId = Number(u.id);

  const [v] = (await db.execute(
    sql`INSERT INTO vehicules (immatriculation, marque, modele, agence_id)
        VALUES (${IMMAT}, 'Relation', 'Test', 1) RETURNING id`,
  )) as unknown as Row[];
  const [v2] = (await db.execute(
    sql`INSERT INTO vehicules (immatriculation, marque, modele, agence_id)
        VALUES (${IMMAT_2}, 'Relation', 'Test 2', 1) RETURNING id`,
  )) as unknown as Row[];

  const caller = orRouter.createCaller(ctxSuperadmin());
  const r = await caller.receptionner({
    client: { nom: `Client ${NS}`, telephone: TELEPHONE },
    vehicule: { id: Number(v.id), immatriculation: IMMAT },
    reception: { kilometrageEntree: 10000, pannesDeclarees: "Bruit moteur" },
  });
  orId = Number(r.id);
  const r2 = await caller.receptionner({
    client: { nom: `Client ${NS} 2`, telephone: TELEPHONE_2 },
    vehicule: { id: Number(v2.id), immatriculation: IMMAT_2 },
    reception: { kilometrageEntree: 20000, pannesDeclarees: "Voyant moteur" },
  });
  orId2 = Number(r2.id);
});

afterAll(async () => {
  await retirer();
});

describe("P3.2 — relation client traçable", () => {
  it("part de dossiers sans réponse ni réclamation", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    for (const id of [orId, orId2]) {
      const or = await caller.getById({ id });
      expect(or.suiviRelation.reponse).toBeNull();
      expect(or.suiviRelation.reclamation).toBeNull();
    }
  });

  it("un devis envoyé trace automatiquement la première réponse", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    await db.execute(
      sql`INSERT INTO lignes_ordre_reparation (ordre_id, type, libelle, quantite, prix_unitaire, tva, total_ligne)
          VALUES (${orId}, 'SERVICE', 'Main d''œuvre', '1', '10000', '0', '10000')`,
    );
    await caller.creerVersionDevis({ orId });
    const [devis] = (await db.execute(
      sql`SELECT id FROM or_devis_versions WHERE or_id = ${orId} ORDER BY version DESC LIMIT 1`,
    )) as unknown as Row[];
    await caller.envoyerVersionDevis({ devisVersionId: Number(devis.id) });

    const or = await caller.getById({ id: orId });
    expect(or.suiviRelation.reponse?.canal).toBe("DEVIS");
    expect(or.suiviRelation.reponse?.delaiHeures).not.toBeNull();
  });

  it("trace une réponse manuelle et refuse de réécrire son délai", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    await caller.enregistrerReponseClient({ orId: orId2, canal: "APPEL", commentaire: "Diagnostic en cours" });

    const or = await caller.getById({ id: orId2 });
    expect(or.suiviRelation.reponse?.canal).toBe("APPEL");
    expect(or.suiviRelation.reponse?.commentaire).toBe("Diagnostic en cours");
    expect(or.suiviRelation.reponse?.delaiHeures).not.toBeNull();
    expect(or.suiviRelation.reponse!.delaiHeures!).toBeGreaterThanOrEqual(0);

    await expect(
      caller.enregistrerReponseClient({ orId: orId2, canal: "SMS" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("ouvre, suit puis résout une réclamation — y compris sur la fiche client", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    await caller.ouvrirReclamation({ orId, motif: "Bruit persistant après réparation" });

    let or = await caller.getById({ id: orId });
    expect(or.suiviRelation.reclamation?.statut).toBe("OUVERTE");
    expect(or.suiviRelation.reclamation?.motif).toBe("Bruit persistant après réparation");
    expect(or.suiviRelation.reclamation?.resolution).toBeNull();

    await expect(
      caller.ouvrirReclamation({ orId, motif: "Deuxième réclamation" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const sante = await atelierKpiRouter.createCaller(ctxSuperadmin()).getSanteGarage({ periode: "mois" });
    expect(sante.relationClient.reclamationsOuvertes).toBeGreaterThanOrEqual(1);

    await caller.resoudreReclamation({ orId, resolution: "Reprise du serrage et essai routier" });
    or = await caller.getById({ id: orId });
    expect(or.suiviRelation.reclamation?.statut).toBe("RESOLUE");
    expect(or.suiviRelation.reclamation?.resolution).toBe("Reprise du serrage et essai routier");
    expect(or.suiviRelation.reclamation?.resolueLe).not.toBeNull();

    await expect(
      caller.resoudreReclamation({ orId, resolution: "Encore" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const [client] = (await db.execute(
      sql`SELECT client_id FROM ordres_reparation WHERE id = ${orId}`,
    )) as unknown as Row[];
    const interactions = (await db.execute(
      sql`SELECT type, sujet, contenu FROM client_interactions
          WHERE client_id = ${Number(client.client_id)}
          ORDER BY id`,
    )) as unknown as Row[];
    expect(interactions).toHaveLength(2);
    expect(interactions[0]!.type).toBe("RECLAMATION");
    expect(interactions[1]!.type).toBe("RECLAMATION");
    expect(String(interactions[1]!.contenu)).toContain("Reprise du serrage");

    const apres = await atelierKpiRouter.createCaller(ctxSuperadmin()).getSanteGarage({ periode: "mois" });
    expect(apres.relationClient.reponses).toBeGreaterThanOrEqual(1);
    expect(apres.relationClient.delaiReponseMoyenHeures).not.toBeNull();
    expect(apres.relationClient.reclamationsOuvertes).toBe(0);
  });
});
