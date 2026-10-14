/**
 * LOT U0c — État des lieux photographique VERSIONNÉ PAR VISITE.
 *
 * Garanties testées contre la base de test :
 *
 *  1. Une réception AVEC photos aboutit (non-régression du bug P0 découvert en
 *     U0c : `or.receptionner` insérait `{ orId, photo, uploaderId }` — des
 *     colonnes inexistantes — ce qui annulait toute la transaction).
 *  2. VERSIONNEMENT : une 2ᵉ intervention du MÊME véhicule ne touche PAS aux
 *     photos de la 1ʳᵉ. C'est le cœur de la demande : à chaque passage, l'état
 *     des lieux doit refléter l'aspect RÉEL du moment.
 *  3. REPRISE : `etatDesLieuPrecedent` remonte la visite précédente, et une
 *     reprise est tracée via `reprise_de` — elle ne se substitue jamais à une
 *     prise réelle, et la référence proposée n'est jamais elle-même une reprise.
 *  4. REMPLACEMENT CIRCONSTREINT : reprendre une face remplace la photo de
 *     CETTE face à CETTE étape, et n'écrase ni les autres faces ni l'autre étape.
 *  5. COMPARAISON entrée / sortie à l'intérieur d'une même visite.
 *  6. REFUS EXPLICITE d'une photo trop lourde (l'ancien comportement la
 *     jetait en silence — P2-5).
 *
 * Fixtures RBAC réelles, namespace `u0cphotos`.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "u0cphotos";
const ROLE_CODE = `${NS}_or`;
const USER_EMAIL = `${NS}.or@gpj.cm`;

type Row = Record<string, unknown>;

let userId = 0;

/** Une image base64 valide (contenu volontairement minimal). */
const IMG = ( marqueur: string ) =>
  `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==#${marqueur}`;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "U0c superadmin",
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
        VALUES (${ROLE_CODE}, 'LotU0c photos', 'Fixture LotU0c', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[];
  if (!role?.id) throw new Error(`Fixtures ${NS} : rôle introuvable.`);
  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'U0C', 'Fixture', 1, ${role.id}::uuid, true, 'active')
        ON CONFLICT (email) DO NOTHING
        RETURNING id`,
  )) as unknown as Row[];
  userId = insere.length > 0 ? Number(insere[0].id) : 0;
  if (userId === 0) {
    const u = (await db.execute(sql`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`)) as unknown as Row[];
    userId = Number(u[0]?.id);
  }
  if (!Number.isFinite(userId) || userId === 0) throw new Error(`Fixtures ${NS} : utilisateur introuvable.`);
});

beforeEach(retirerDonnees);
afterAll(retirer);

async function retirerDonnees(): Promise<void> {
  const vehs = (await db.execute(
    sql`SELECT id FROM vehicules WHERE immat_norm LIKE 'U0CPHOTOS%' OR immatriculation LIKE 'U0CPHOTOS%'`,
  )) as unknown as Row[];
  for (const v of vehs) {
    await db.execute(sql`DELETE FROM or_photos WHERE or_id IN (SELECT id FROM ordres_reparation WHERE vehicule_id = ${v.id})`);
    await db.execute(sql`DELETE FROM ordres_reparation WHERE vehicule_id = ${v.id}`);
  }
  await db.execute(
    sql`DELETE FROM vehicules WHERE immat_norm LIKE 'U0CPHOTOS%' OR immatriculation LIKE 'U0CPHOTOS%'`,
  );
  await db.execute(sql`DELETE FROM clients WHERE nom = 'Client U0c'`);
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

/** Réception simple avec photos d'entrée. */
async function receptionnerAvecPhotos(immat: string, photos: { categorie: string; url: string }[]) {
  const caller = orRouter.createCaller(ctxSuperadmin());
  const r = await caller.receptionner({
    client: { nom: "Client U0c", telephone: "690100555" },
    vehicule: { immatriculation: immat, marque: "LotU0c" },
    reception: {
      kilometrageEntree: 1000,
      pannesDeclarees: "Freins",
      photos,
    },
  });
  return { orId: r.id, vehiculeId: r.vehiculeId };
}

const photosDe = async (orId: number) =>
  (await db.execute(
    sql`SELECT categorie, visite, reprise_de, url FROM or_photos WHERE or_id = ${orId} ORDER BY categorie`,
  )) as unknown as { categorie: string; visite: string; reprise_de: number | null; url: string }[];

describe("LOT U0c — état des lieux versionné par visite", () => {
  it("1. une réception AVEC photos aboutit (non-régression du bug d'insertion)", async () => {
    const { orId } = await receptionnerAvecPhotos("U0CPHOTOS-001", [
      { categorie: "AVANT", url: IMG("a") },
      { categorie: "ARRIERE", url: IMG("b") },
    ]);
    const photos = await photosDe(orId);
    expect(photos.length).toBe(2);
    expect(photos.map((p) => p.categorie).sort()).toEqual(["ARRIERE", "AVANT"]);
    expect(photos.every((p) => p.visite === "ENTREE")).toBe(true);
  });

  it("2. VERSIONNEMENT — la 2ᵉ visite n'écrase pas la 1ʳᵉ", async () => {
    const { orId: or1 } = await receptionnerAvecPhotos("U0CPHOTOS-002", [
      { categorie: "AVANT", url: IMG("visite1") },
    ]);
    // Même véhicule, nouvelle intervention, aspect différent.
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r2 = await caller.receptionner({
      client: { nom: "Client U0c", telephone: "690100555" },
      vehicule: { immatriculation: "U0CPHOTOS-002", marque: "LotU0c" },
      reception: {
        kilometrageEntree: 2000,
        pannesDeclarees: "Freins",
        photos: [{ categorie: "AVANT", url: IMG("visite2") }],
      },
    });
    expect(r2.id).not.toBe(or1);

    // Les deux visites ont chacune LEUR photo.
    const p1 = await photosDe(or1);
    const p2 = await photosDe(r2.id);
    expect(p1.length).toBe(1);
    expect(p2.length).toBe(1);
    expect(p1[0].url).toContain("visite1");
    expect(p2[0].url).toContain("visite2");
  });

  it("3. REPRISE — la visite précédente est proposée et tracée comme reprise", async () => {
    const { orId: or1, vehiculeId } = await receptionnerAvecPhotos("U0CPHOTOS-003", [
      { categorie: "AVANT", url: IMG("ref") },
      { categorie: "COTE_GAUCHE", url: IMG("ref2") },
    ]);
    const caller = orRouter.createCaller(ctxSuperadmin());

    const precedent = await caller.etatDesLieuPrecedent({ vehiculeId, avantOrId: 0 });
    expect(precedent.disponible).toBe(true);
    expect(precedent.orId).toBe(or1);
    expect(precedent.photos.length).toBe(2);

    // Nouvelle visite : on reprend une face, on en prend une nouvelle.
    const r2 = await caller.receptionner({
      client: { nom: "Client U0c", telephone: "690100555" },
      vehicule: { immatriculation: "U0CPHOTOS-003", marque: "LotU0c" },
      reception: {
        kilometrageEntree: 2000,
        pannesDeclarees: "Freins",
        photos: [{ categorie: "MOTEUR", url: IMG("neuf") }],
        photosReprise: [
          { categorie: "AVANT", url: IMG("ref"), sourceId: precedent.photos.find((p) => p.categorie === "AVANT")!.id },
        ],
      },
    });

    const photos = await photosDe(r2.id);
    expect(photos.length).toBe(2);
    const reprise = photos.find((p) => p.categorie === "AVANT");
    const prise = photos.find((p) => p.categorie === "MOTEUR");
    // La reprise est TRACÉE (reprise_de renseigné), la prise ne l'est pas.
    expect(reprise!.reprise_de).not.toBeNull();
    expect(prise!.reprise_de).toBeNull();

    // La 1ʳᵉ visite est INTACTE (une reprise n'est pas une prise).
    const avant = await photosDe(or1);
    expect(avant.length).toBe(2);
    expect(avant.every((p) => p.reprise_de === null)).toBe(true);
  });

  it("3b. la référence proposée ne contient jamais une reprise (état constaté, pas copie)", async () => {
    const { orId: or1, vehiculeId } = await receptionnerAvecPhotos("U0CPHOTOS-003B", [
      { categorie: "AVANT", url: IMG("constate1") },
    ]);
    const caller = orRouter.createCaller(ctxSuperadmin());
    const precedent = await caller.etatDesLieuPrecedent({ vehiculeId, avantOrId: 0 });
    // On crée une 2ᵉ visite entièrement reprise de la 1ʳᵉ.
    const r2 = await caller.receptionner({
      client: { nom: "Client U0c", telephone: "690100555" },
      vehicule: { immatriculation: "U0CPHOTOS-003B", marque: "LotU0c" },
      reception: {
        kilometrageEntree: 2000,
        pannesDeclarees: "Freins",
        photos: [],
        photosReprise: [{ categorie: "AVANT", url: IMG("constate1"), sourceId: precedent.photos[0].id }],
      },
    });
    const photos = await photosDe(r2.id);
    expect(photos[0].reprise_de).not.toBeNull();
    const toutesReprises = photos.every((p) => p.reprise_de !== null);
    expect(toutesReprises).toBe(true);

    // La visite 2 étant 100 % reprise, elle ne doit PAS devenir la référence
    // proposée : on remonte à la dernière visite ayant des prises RÉELLES,
    // sinon on propagerait indéfiniment une copie de copie.
    const suivant = await caller.etatDesLieuPrecedent({ vehiculeId, avantOrId: 0 });
    expect(suivant.orId).toBe(or1);
  });

  it("4. remplacer une face n'écrase ni les autres faces ni l'autre étape", async () => {
    const { orId } = await receptionnerAvecPhotos("U0CPHOTOS-004", [
      { categorie: "AVANT", url: IMG("avant1") },
      { categorie: "MOTEUR", url: IMG("moteur1") },
    ]);
    const caller = orRouter.createCaller(ctxSuperadmin());

    // Sortie d'abord…
    await caller.enregistrerEtatDesLieu({
      orId,
      visite: "SORTIE",
      photos: [{ categorie: "AVANT", url: IMG("avant-sortie") }],
    });
    // …puis reprise d'une face à l'entrée.
    await caller.enregistrerEtatDesLieu({
      orId,
      visite: "ENTREE",
      photos: [{ categorie: "AVANT", url: IMG("avant-corrige") }],
    });

    const photos = await photosDe(orId);
    const entreeAvant = photos.find((p) => p.categorie === "AVANT" && p.visite === "ENTREE");
    const entreeMoteur = photos.find((p) => p.categorie === "MOTEUR" && p.visite === "ENTREE");
    const sortieAvant = photos.find((p) => p.categorie === "AVANT" && p.visite === "SORTIE");

    expect(entreeAvant!.url).toContain("avant-corrige");
    expect(entreeMoteur!.url).toContain("moteur1");
    expect(sortieAvant!.url).toContain("avant-sortie");
  });

  it("5. comparaison entrée / sortie sur une MÊME visite", async () => {
    const { orId } = await receptionnerAvecPhotos("U0CPHOTOS-005", [
      { categorie: "AVANT", url: IMG("e") },
      { categorie: "ARRIERE", url: IMG("e2") },
    ]);
    const caller = orRouter.createCaller(ctxSuperadmin());
    await caller.enregistrerEtatDesLieu({
      orId,
      visite: "SORTIE",
      photos: [{ categorie: "AVANT", url: IMG("s") }],
    });

    const cmp = await caller.comparerPhotosEtatDesLieu({ orId });
    const avant = cmp.lignes.find((l) => l.categorie === "AVANT");
    const arriere = cmp.lignes.find((l) => l.categorie === "ARRIERE");
    expect(avant!.entree).toBeTruthy();
    expect(avant!.sortie).toBeTruthy();
    // Face photographiée à l'entrée mais pas à la sortie : signalée, pas inventée.
    expect(arriere!.entree).toBeTruthy();
    expect(arriere!.sortie).toBeNull();
    expect(cmp.comparees).toBe(1);
    expect(cmp.libelles["AVANT"]).toBe("Avant");
  });

  it("6. photo trop lourde : REFUS EXPLICITE (plus de rejet silencieux)", async () => {
    const { orId } = await receptionnerAvecPhotos("U0CPHOTOS-006", []);
    const caller = orRouter.createCaller(ctxSuperadmin());
    const tropLourde = `data:image/jpeg;base64,${"A".repeat(3_000_000)}`;

    const code = await caller.enregistrerEtatDesLieu({
      orId,
      visite: "ENTREE",
      photos: [{ categorie: "AVANT", url: tropLourde }],
    }).then(() => "OK").catch((e: { code?: string }) => e.code ?? "UNKNOWN");

    expect(code).toBe("BAD_REQUEST");
    expect((await photosDe(orId)).length).toBe(0);
  });
});
