/**
 * LOT U2 (E8, RD5) — Kilométrage : une seule valeur fait foi, et l'invariant
 * de cohérence est garanti par le SERVEUR.
 *
 * Avant ce lot :
 *  - deux champs km coexistaient dans le formulaire de réception (fiche
 *    véhicule / section Entrée) avec des libellés AMBIGUS : « Kilométrage » et
 *    « Kilométrage d'entrée ». Ils pouvaient diverger ;
 *  - rien n'empêchait de restituer un véhicule avec MOINS de km qu'à son
 *    arrivée. La coquille s'écrivait sur le dossier ET sur la fiche véhicule,
 *    qui devenait ensuite une référence FAUSSE pour toutes les visites
 *    suivantes.
 *
 * Garanties testées :
 *
 *  1. SOURCE UNIQUE : le km relevé à l'entrée devient le km de la fiche.
 *  2. INVARIANT : un km de sortie inférieur au km d'entrée est REFUSÉ
 *     (BAD_REQUEST) — testé en contournant l'IHM, donc bien côté serveur.
 *  3. Le message d'erreur est explicite et chiffré (pas un « champ invalide »).
 *  4. Un km de sortie ÉGAL ou supérieur est accepté.
 *  5. Un dossier SANS km d'entrée (héritage) n'est pas bloqué : pas
 *     d'invention, pas de blocage injustifié.
 *
 * Fixtures RBAC réelles, namespace `u2km`.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "u2km";
const ROLE_CODE = `${NS}_or`;
const USER_EMAIL = `${NS}.or@gpj.cm`;

type Row = Record<string, unknown>;

let userId = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "U2 superadmin",
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
        VALUES (${ROLE_CODE}, 'LotU2 km', 'Fixture LotU2', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[];
  if (!role?.id) throw new Error(`Fixtures ${NS} : rôle introuvable.`);
  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'U2KM', 'Fixture', 1, ${role.id}::uuid, true, 'active')
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
  const vehs = (await db.execute(
    sql`SELECT id FROM vehicules WHERE immat_norm LIKE 'U2KM%' OR immatriculation LIKE 'U2KM%'`,
  )) as unknown as Row[];
  for (const v of vehs) {
    await db.execute(sql`DELETE FROM or_photos WHERE or_id IN (SELECT id FROM ordres_reparation WHERE vehicule_id = ${v.id})`);
    await db.execute(sql`DELETE FROM ordres_reparation WHERE vehicule_id = ${v.id}`);
  }
  await db.execute(sql`DELETE FROM vehicules WHERE immat_norm LIKE 'U2KM%' OR immatriculation LIKE 'U2KM%'`);
  await db.execute(sql`DELETE FROM clients WHERE nom = 'Client U2km'`);
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

/** Client unique du fichier, résolu par téléphone (un doublon ne se crée pas en silence). */
async function clientDuLotU2(): Promise<{ id: number } | { nom: string; telephone: string }> {
  const [row] = (await db.execute(
    sql`SELECT id FROM clients WHERE telephone = ${"690100900"}`,
  )) as unknown as Row[];
  return row ? { id: Number(row.id) } : { nom: "Client U2km", telephone: "690100900" };
}

/** Réception à km entrée donné, dossier mené jusqu'à « prêt à livrer ». */
async function dossierPret(immat: string, kmEntree: number) {
  const caller = orRouter.createCaller(ctxSuperadmin());
  const r = await caller.receptionner({
    client: await clientDuLotU2(),
    vehicule: { immatriculation: immat, marque: "LotU2" },
    reception: { kilometrageEntree: kmEntree, pannesDeclarees: "Freins" },
  });
  for (const etape of ["EN_COURS", "CONTROLE_QUALITE", "PRET_A_LIVRER"] as const) {
    await caller.changerStatut({ id: r.id, nouveauStatut: etape as never, raison: `LotU2 → ${etape}` });
  }
  return { orId: r.id, vehiculeId: r.vehiculeId };
}

const restituer = (orId: number, kmSortie: number) => {
  const caller = orRouter.createCaller(ctxSuperadmin());
  return caller
    .restituerVehicule({
      orId,
      kilometrageSortie: kmSortie,
      checklist: [{ libelle: "État des lieux", ok: true }],
      recuperateurNom: "Recuperateur Test",
      signatureClient: "Signature test",
      sortieExceptionnelle: true,
      motifException: "Client impatient (test U2)",
      commentaireException: "Sortie exceptionnelle tracée pour le test U2.",
    })
    .then(() => "OK" as const)
    .catch((e: { code?: string }) => e.code ?? "UNKNOWN");
};

const kmFiche = async (vehiculeId: number) =>
  Number(
    ((await db.execute(
      sql`SELECT kilometrage FROM vehicules WHERE id = ${vehiculeId}`,
    )) as unknown as Row[])[0]?.kilometrage ?? -1,
  );

describe("LOT U2 — kilométrage (E8, RD5)", () => {
  it("1. SOURCE UNIQUE — le km relevé à l'entrée alimente la fiche véhicule", async () => {
    const { vehiculeId } = await dossierPret("U2KM-001", 120_000);
    expect(await kmFiche(vehiculeId)).toBe(120_000);
  });

  it("2-3. INVARIANT — sortie < entrée refusée, avec un message chiffré", async () => {
    const { orId } = await dossierPret("U2KM-002", 120_000);

    // Coquille classique : 12 000 au lieu de 120 000.
    const code = await restituer(orId, 12_000);
    expect(code).toBe("BAD_REQUEST");

    // Le refus est explicite et chiffré (pas un « champ invalide »).
    const caller = orRouter.createCaller(ctxSuperadmin());
    let message = "";
    try {
      await caller.restituerVehicule({
        orId,
        kilometrageSortie: 11_999,
        checklist: [{ libelle: "État des lieux", ok: true }],
        recuperateurNom: "Recuperateur Test",
        signatureClient: "Signature test",
        sortieExceptionnelle: true,
        motifException: "Client impatient (test U2)",
        commentaireException: "Sortie exceptionnelle tracée pour le test U2.",
      });
    } catch (e) {
      message = (e as { message: string }).message;
    }
    expect(message).toContain("120");
    expect(message.toLowerCase()).toContain("kilométrage");

    // Rien n'a été écrit : le dossier reste ouvert et sans km de sortie.
    const lignes = (await db.execute(
      sql`SELECT statut, kilometrage_sortie FROM ordres_reparation WHERE id = ${orId}`,
    )) as unknown as { statut: string; kilometrage_sortie: number | null }[];
    expect(lignes[0].kilometrage_sortie).toBeNull();
    expect(lignes[0].statut).toBe("PRET_A_LIVRER");
  });

  it("4. km de sortie égal ou supérieur : accepté", async () => {
    const egal = await dossierPret("U2KM-003", 50_000);
    expect(await restituer(egal.orId, 50_000)).toBe("OK");

    const superieur = await dossierPret("U2KM-004", 50_000);
    expect(await restituer(superieur.orId, 50_420)).toBe("OK");
  });

  it("5. dossier sans km d'entrée (héritage) : pas de blocage injustifié", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.receptionner({
      client: await clientDuLotU2(),
      vehicule: { immatriculation: "U2KM-005", marque: "LotU2" },
      reception: { kilometrageEntree: 0, pannesDeclarees: "Freins" },
    });
    for (const etape of ["EN_COURS", "CONTROLE_QUALITE", "PRET_A_LIVRER"] as const) {
      await caller.changerStatut({ id: r.id, nouveauStatut: etape as never, raison: `LotU2 → ${etape}` });
    }
    // km entrée = 0 : aucune référence à opposer, la restitution passe.
    expect(await restituer(r.id, 0)).toBe("OK");
  });
});
