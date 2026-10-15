/**
 * LOT P0.3 — GARDES SUR LES TRAVAUX
 * =================================
 *
 * Ce que ce test verrouillait AVANT la correction :
 *
 *   La garde « travaux non terminés » de `or.restituerVehicule` ne lisait
 *   aucune ligne de travaux. Elle vérifiait `ordres_reparation.statut ===
 *   "PRET_A_LIVRER"` et son message annonçait l'état des travaux. Or
 *   `or.validerControleQualite` ne les lisait pas non plus : un dossier dont
 *   toutes les lignes étaient en `a_faire` pouvait être validé en qualité
 *   puis restitué. Le véhicule partait avec le travail non fait, sans que
 *   rien ne bronche.
 *
 * Ces tests échouent sur le code d'avant la correction.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "p0travaux";
const ROLE_CODE = `${NS}_or`;
const USER_EMAIL = `${NS}.or@gpj.cm`;

type Row = Record<string, unknown>;

let userId = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "P0 travaux",
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
        VALUES (${ROLE_CODE}, 'P0 travaux', 'Fixture P0 travaux', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[];
  await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'P0TR', 'Fixture', 1, ${role.id}::uuid, true, 'active')
        ON CONFLICT (email) DO NOTHING`,
  );
  const [u] = (await db.execute(sql`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`)) as unknown as Row[];
  userId = Number(u.id);
});

beforeEach(async () => {
  await db.execute(
    sql`DELETE FROM lignes_ordre_reparation
        WHERE ordre_id IN (SELECT id FROM ordres_reparation WHERE pannes_declarees LIKE 'P0TR%')`,
  );
  await db.execute(
    sql`DELETE FROM ordres_reparation WHERE pannes_declarees LIKE 'P0TR%'`,
  );
  await db.execute(
    sql`DELETE FROM vehicules WHERE immat_norm LIKE 'P0TR-%' OR immatriculation LIKE 'P0TR-%'`,
  );
  await db.execute(sql`DELETE FROM clients WHERE nom LIKE 'Client P0TR%'`);
});

afterAll(async () => {
  await retirer();
});

async function retirer(): Promise<void> {
  await db.execute(
    sql`DELETE FROM lignes_ordre_reparation
        WHERE ordre_id IN (SELECT id FROM ordres_reparation WHERE pannes_declarees LIKE 'P0TR%')`,
  );
  await db.execute(
    sql`DELETE FROM or_restitutions
        WHERE or_id NOT IN (SELECT id FROM ordres_reparation)`,
  );
  await db.execute(sql`DELETE FROM ordres_reparation WHERE pannes_declarees LIKE 'P0TR%'`);
  await db.execute(
    sql`DELETE FROM vehicules WHERE immat_norm LIKE 'P0TR-%' OR immatriculation LIKE 'P0TR-%'`,
  );
  await db.execute(sql`DELETE FROM clients WHERE nom LIKE 'Client P0TR%'`);
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`);
  userId = 0;
}

/**
 * Ouvre un dossier avec des lignes de travaux dans les statuts demandés.
 * `pannesDeclarees` porte la marque P0TR : c'est le seul moyen fiable de
 * retrouver les dossiers de ce test, un numéro d'OR ne le permettant pas
 * (`OR-` est un préfixe métier, pas un marqueur de test).
 */
async function dossierAvecTravaux(
  immat: string,
  lignes: { libelle: string; statut?: string; bloque?: boolean }[],
) {
  const caller = orRouter.createCaller(ctxSuperadmin());
  const r = await caller.receptionner({
    client: { nom: `Client P0TR ${immat}`, telephone: "691997001" },
    vehicule: { immatriculation: immat, marque: "Peugeot" },
    reception: {
      kilometrageEntree: 10000,
      pannesDeclarees: `P0TR-${lignes.length}-${immat}`,
    },
  });

  const [v] = (await db.execute(
    sql`SELECT id FROM vehicules WHERE immat_norm = ${immat}`,
  )) as unknown as Row[];

  for (const l of lignes) {
    await db.execute(
      sql`INSERT INTO lignes_ordre_reparation
            (ordre_id, type, libelle, quantite, prix_unitaire, tva, total_ligne, statut, bloque)
          VALUES (${r.id}, 'SERVICE', ${l.libelle}, '1', '10000', '0', '10000',
                  ${l.statut ?? "a_faire"}, ${l.bloque ?? false})`,
    );
  }
  return { orId: r.id as number, vehiculeId: Number(v.id) };
}

/** Amène le dossier à PRET_A_LIVRER par le sélecteur de statut (contournement du QC). */
async function passerPretALivrer(orId: number) {
  const caller = orRouter.createCaller(ctxSuperadmin());
  for (const etape of ["EN_COURS", "CONTROLE_QUALITE", "PRET_A_LIVRER"] as const) {
    await caller.changerStatut({ id: orId, nouveauStatut: etape as never, raison: `P0 → ${etape}` });
  }
}

const codeErreur = async (p: Promise<unknown>): Promise<string> =>
  p.then(() => "AUCUNE").catch((e: { code?: string }) => e.code ?? "AUTRE");

describe("LOT P0.3 — un véhicule ne part pas avec des travaux non faits", () => {
  it("1. contrôle qualité REFUSÉ tant qu'une ligne est « à faire »", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const { orId } = await dossierAvecTravaux("P0TR-001", [
      { libelle: "Changement plaquettes avant" },
      { libelle: "Vidange moteur", statut: "fait" },
    ]);

    // Une seule ligne non terminée suffit à interdire la validation.
    const code = await codeErreur(
      caller.validerControleQualite({
        orId,
        checklist: [{ libelle: "Conforme", ok: true }],
        resultat: "VALIDE",
      }),
    );
    expect(code).toBe("BAD_REQUEST");

    const [o] = (await db.execute(
      sql`SELECT statut FROM ordres_reparation WHERE id = ${orId}`,
    )) as unknown as Row[];
    expect(o.statut).not.toBe("PRET_A_LIVRER");
  });

  it("2. le message nomme les travaux fautifs, pas seulement leur nombre", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const { orId } = await dossierAvecTravaux("P0TR-002", [
      { libelle: "Remplacement disque de frein" },
      { libelle: "Purge circuit de refroidissement" },
    ]);

    const message = await caller
      .validerControleQualite({ orId, checklist: [{ libelle: "Conforme", ok: true }], resultat: "VALIDE" })
      .then(() => "")
      .catch((e: { message?: string }) => e.message ?? "");

    expect(message).toContain("Remplacement disque de frein");
    expect(message).toContain("Purge circuit de refroidissement");
  });

  it("3. contrôle qualité ACCEPTÉ quand tous les travaux sont faits", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const { orId } = await dossierAvecTravaux("P0TR-003", [
      { libelle: "Changement plaquettes avant", statut: "fait" },
      { libelle: "Vidange moteur", statut: "valide" },
    ]);

    const r = await caller.validerControleQualite({
      orId,
      checklist: [{ libelle: "Conforme", ok: true }],
      resultat: "VALIDE",
    });
    expect(r.nouveauStatut).toBe("PRET_A_LIVRER");
  });

  it("4. une ligne BLOQUÉE interdit la restitution même marquée « faite »", async () => {
    // Le cas que le libellé seul ne révèle pas : le technicien a fini, mais la
    // ligne reste gelée en attente d'une pièce ou d'une décision. Restituer
    // alors reviendrait à effacer le blocage.
    //
    // Voie ORDINAIRE (pas de sortie exceptionnelle) : c'est celle que le client
    // encounter dans 95 % des cas, et celle que la garde doit couvrir.
    const { orId } = await dossierAvecTravaux("P0TR-004", [
      { libelle: "Pose stops", statut: "fait" },
    ]);
    await passerPretALivrer(orId);
    await db.execute(
      sql`UPDATE lignes_ordre_reparation SET bloque = true, raison_blocage_ligne = 'Pièce en attente'
          WHERE ordre_id = ${orId}`,
    );

    const caller = orRouter.createCaller(ctxSuperadmin());
    const message = await caller
      .restituerVehicule({
        orId,
        kilometrageSortie: 10500,
        checklist: [{ libelle: "État des lieux", ok: true }],
        recuperateurNom: "Recuperateur P0",
        signatureClient: "Signature P0",
      })
      .then(() => "AUCUNE")
      .catch((e: { message?: string }) => e.message ?? "");

    // Le blocage est nommé, et l'échec porte sur les travaux — pas sur un
    // contrôle financier qui n'a pas encore lieu.
    expect(message).toContain("Travaux non terminés");
    expect(message).toContain("Pose stops");
    expect(message).toContain("Pièce en attente");
  });

  it("4b. sortie exceptionnelle : la porte de sortie reste ouverte, mais tracée", async () => {
    // Comportement voulu et non contournement : la sortie exceptionnelle
    // existe précisément pour rendre un véhicule malgré un blocage. Ce qui la
    // rend acceptable, c'est d'être motivée et journalisée — pas d'être
    // silencieuse. C'est aussi pourquoi elle n'est PAS protégée par la garde
    // travaux : elle est le contrepoids volontaire de cette garde.
    const { orId } = await dossierAvecTravaux("P0TR-004B", [{ libelle: "Pare-chocs" }]);
    await passerPretALivrer(orId);

    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.restituerVehicule({
      orId,
      kilometrageSortie: 10500,
      checklist: [{ libelle: "État des lieux", ok: true }],
      recuperateurNom: "Recuperateur P0",
      signatureClient: "Signature P0",
      sortieExceptionnelle: true,
      motifException: "Client_TIMEOUT",
      commentaireException: "Pare-chocs indisponible, véhicule rendu en l'état.",
    });

    expect((r as { success: boolean; exceptionnelle?: boolean }).success).toBe(true);
    expect((r as { exceptionnelle?: boolean }).exceptionnelle).toBe(true);

    // La trace doit exister : c'est elle qui justifie le contournement.
    const [h] = (await db.execute(
      sql`SELECT type FROM or_historique WHERE or_id = ${orId} ORDER BY id DESC LIMIT 1`,
    )) as unknown as Row[];
    expect(h.type).toBe("RESTITUTION");
  });

  it("5. statut de ligne hors nomenclature REFUSÉ (et non stocké)", async () => {
    const { orId } = await dossierAvecTravaux("P0TR-005", [{ libelle: "Réglage géométrie" }]);
    const [ligne] = (await db.execute(
      sql`SELECT id FROM lignes_ordre_reparation WHERE ordre_id = ${orId}`,
    )) as unknown as Row[];

    const caller = orRouter.createCaller(ctxSuperadmin());
    // `z.enum` : la requête est rejetée avant d'atteindre la base.
    await expect(
      caller.updateLigne({ id: Number(ligne.id), statut: "fait_ou_pas" as never }),
    ).rejects.toThrow();

    const [apres] = (await db.execute(
      sql`SELECT statut FROM lignes_ordre_reparation WHERE id = ${Number(ligne.id)}`,
    )) as unknown as Row[];
    expect(apres.statut).toBe("a_faire");
  });

  it("6. transition de ligne interdite REFUSÉE", async () => {
    const { orId } = await dossierAvecTravaux("P0TR-006", [{ libelle: "Changement filtre" }]);
    const [ligne] = (await db.execute(
      sql`SELECT id FROM lignes_ordre_reparation WHERE ordre_id = ${orId}`,
    )) as unknown as Row[];

    const caller = orRouter.createCaller(ctxSuperadmin());
    const code = await codeErreur(
      caller.updateLigne({ id: Number(ligne.id), statut: "valide" as never }),
    );
    expect(code).toBe("BAD_REQUEST");
  });

  it("7. retour en arrière autorisé : corriger une ligne marquée « faite » à tort", async () => {
    // Refuser ce retour obligerait l'agent à rouvrir tout le dossier pour
    // corriger une erreur de saisie — le garde-fou deviendrait un obstacle.
    const { orId } = await dossierAvecTravaux("P0TR-007", [{ libelle: "Alignement roues" }]);
    const [ligne] = (await db.execute(
      sql`SELECT id FROM lignes_ordre_reparation WHERE ordre_id = ${orId}`,
    )) as unknown as Row[];

    const caller = orRouter.createCaller(ctxSuperadmin());
    await caller.updateLigne({ id: Number(ligne.id), statut: "fait" });
    const r = await caller.updateLigne({ id: Number(ligne.id), statut: "en_cours" });

    expect((r as { success: boolean }).success).toBe(true);
    const [apres] = (await db.execute(
      sql`SELECT statut FROM lignes_ordre_reparation WHERE id = ${Number(ligne.id)}`,
    )) as unknown as Row[];
    expect(apres.statut).toBe("en_cours");
  });
});