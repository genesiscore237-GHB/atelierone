import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * POUR VÉHICULE — le pont catalogue ↔ voiture réelle, testé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS PROUVENT
 *
 *   · la fourchette d'années de la compatibilité est appliquée : une pièce
 *     valable 2010-2018 ne revient pas pour un véhicule de 2022 ;
 *   · une exclusion NEGATIVE (compatible SAUF avec) gagne contre une
 *     POSITIVE sur la même fiche — l'équivalence n'implique jamais la compatibilité ;
 *   · le châssis/VIN fait le pont seul, sans marque ;
 *   · la version affinante (motorisation portée par la fiche) ne JAMAIS faire
 *     disparaître des pièces réellement compatibles : relâchée quand elle
 *     élimine tout ;
 *   · une fiche trop pauvre (ni marque, ni châssis) ne renvoie RIEN et le DIT
 *     (`ficheIncomplete`) — on ne déduit pas, on ne fabrique pas de critères.
 */
vi.mock("@atelierone/auth", () => ({}));

const { articlesRouter } = await import("~/server/api/routers/articles-router");

const NS = "pvveh";
const AGENCE = 1;

let userId = 0;
let articleId = 0;
const variantes: Record<string, number> = {};
const vehiculesCrees: number[] = [];

function ctx() {
  const user = {
    id: String(userId),
    name: "PourVehicule",
    email: `${NS}@gpj.cm`,
    agenceId: AGENCE,
    agenceName: "GPJ",
    organizationId: String(AGENCE),
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

const api = () => articlesRouter.createCaller(ctx());

async function vehicule(sel: { marque: string | null; modele: string | null; version?: string | null; annee?: number | null; chassis?: string | null }): Promise<number> {
  const [v] = (await db.execute(
    sql`INSERT INTO vehicules (agence_id, marque, modele, version, annee, numero_chassis, type_vehicule, is_active)
        VALUES (${AGENCE}, ${sel.marque}, ${sel.modele}, ${sel.version ?? null}, ${sel.annee ?? null}, ${sel.chassis ?? null}, 'voiture', true)
        RETURNING id`,
  )) as unknown as { id: number }[];
  const id = Number(v!.id);
  vehiculesCrees.push(id);
  return id;
}

/** Compatibilité produit-testée au niveau VARIANTE (produit_id). */
async function compat(produitId: number, r: { type: string; marque?: string; modele?: string; anneeDe?: number; anneeA?: number; motorisation?: string; chassis?: string }) {
  await db.execute(
    sql`INSERT INTO compatibilites_produits (produit_id, type_compat, marque, modele, annee_de, annee_a, motorisation, code_chassis, source, niveau_verification, cree_par)
        VALUES (${produitId}, ${r.type}, ${r.marque ?? "MULTIMARQUE"}, ${r.modele ?? "TOUTES"}, ${r.anneeDe ?? null}, ${r.anneeA ?? null}, ${r.motorisation ?? null}, ${r.chassis ?? null}, 'MANUELLE', 'NON_VERIFIE', ${userId})`,
  );
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'PV', 'PourVehicule', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`)) as unknown as { id: string }[];
  userId = Number(u!.id);

  // Rejouabilité : le tri des fixtures de la veille (compat → stock → variante
  // → article → véhicules), ordre inverse des dépendances.
  await db.execute(sql`DELETE FROM compatibilites_produits WHERE produit_id IN (SELECT id FROM produits WHERE reference_principale LIKE ${`${NS}%`})`);
  await db.execute(sql`DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE reference_principale LIKE ${`${NS}%`})`);
  await db.execute(sql`DELETE FROM produits WHERE reference_principale LIKE ${`${NS}%`}`);
  await db.execute(sql`DELETE FROM produit_articles WHERE designation LIKE ${`${NS}%`}`);
  await db.execute(sql`DELETE FROM vehicules WHERE agence_id = ${AGENCE} AND (numero_chassis LIKE ${`${NS}%`} OR modele LIKE ${`SYS-${NS}%`})`);

  const r = await api().createArticle({
    designation: `${NS} Filtres`,
    designationCourte: `${NS} filtres`,
    typeProduit: "PIECE",
    variantes: [
      { referencePrincipale: `${NS}-A`, marque: "Mann" },
      { referencePrincipale: `${NS}-B`, marque: "Mann" },
      { referencePrincipale: `${NS}-C`, marque: "Mann" },
      { referencePrincipale: `${NS}-D`, marque: "Mann" },
      { referencePrincipale: `${NS}-E`, marque: "Mann" },
    ] as never,
  } as never);
  articleId = Number(r.articleId);

  const rows = (await db.execute(
    sql`SELECT id, reference_principale AS ref FROM produits WHERE article_id = ${articleId}`,
  )) as unknown as { id: number; ref: string }[];
  for (const x of rows) {
    if (x.ref?.endsWith("-A")) variantes.A = Number(x.id);
    if (x.ref?.endsWith("-B")) variantes.B = Number(x.id);
    if (x.ref?.endsWith("-C")) variantes.C = Number(x.id);
    if (x.ref?.endsWith("-D")) variantes.D = Number(x.id);
    if (x.ref?.endsWith("-E")) variantes.E = Number(x.id);
  }
  expect(variantes.A).toBeTruthy();

  await compat(variantes.A, { type: "POSITIVE", marque: "Toyota", modele: "Hilux", anneeDe: 2010, anneeA: 2018 });
  await compat(variantes.B, { type: "POSITIVE", marque: "Toyota", modele: "Dyna" });
  await compat(variantes.C, { type: "POSITIVE", marque: "Toyota", modele: "Hilux" });
  await compat(variantes.C, { type: "NEGATIVE", marque: "Toyota", modele: "Hilux", anneeDe: 2020 });
  await compat(variantes.D, { type: "POSITIVE", chassis: `${NS}-VIN0001` });
  await compat(variantes.E, { type: "POSITIVE", marque: "Toyota", modele: "Hilux", motorisation: "DIESEL 2.8 TDI" });
});

afterAll(async () => {
  // Rejouabilité totale : les fiches de test n'ont exploré aucun stock, la
  // suppression est propre — ordre inverse des dépendances.
  await db.execute(sql`DELETE FROM compatibilites_produits WHERE produit_id IN (SELECT id FROM produits WHERE reference_principale LIKE ${`${NS}%`})`);
  await db.execute(sql`DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE reference_principale LIKE ${`${NS}%`})`);
  await db.execute(sql`DELETE FROM produits WHERE reference_principale LIKE ${`${NS}%`}`);
  await db.execute(sql`DELETE FROM produit_articles WHERE designation LIKE ${`${NS}%`}`);
  for (const v of vehiculesCrees) {
    await db.execute(sql`DELETE FROM vehicules WHERE id = ${v}`);
  }
});

describe("articles.pourVehicule — la pièce appartient à la voiture", () => {
  it("la fourchette d'années s'applique, la marque seule ne suffit pas", async () => {
    const dansLaFourchette = await api().pourVehicule({ vehiculeId: await vehicule({ marque: "Toyota", modele: "Hilux", annee: 2014, version: "EX 4x4" }) });
    const idsDans = (dansLaFourchette.items as { id: number }[]).map((i) => i.id);
    expect(idsDans).toContain(variantes.A);
    expect(idsDans).toContain(variantes.E); // version affinée relâchée, marque/modèle l'ont déjà retenu

    const horsFourchette = await api().pourVehicule({ vehiculeId: await vehicule({ marque: "Toyota", modele: "Hilux", annee: 2022 }) });
    const idsHors = (horsFourchette.items as { id: number }[]).map((i) => i.id);
    expect(idsHors).not.toContain(variantes.A);
  });

  it("une exclusion NEGATIVE gagne contre une POSITIVE", async () => {
    const r = await api().pourVehicule({ vehiculeId: await vehicule({ marque: "Toyota", modele: "Hilux", annee: 2021 }) });
    const ids = (r.items as { id: number }[]).map((i) => i.id);
    // 2021 : compatible POSITIVE (sans année), mais NEGATIVE dès 2020 → exclue.
    expect(ids).not.toContain(variantes.C);
  });

  it("le châssis fait le pont seul, et une fiche pauvre déclare son impuissance", async () => {
    const parChassis = await api().pourVehicule({ vehiculeId: await vehicule({ marque: null, modele: null, chassis: `${NS}-VIN0001ABCD` }) });
    const ids = (parChassis.items as { id: number }[]).map((i) => i.id);
    expect(ids).toContain(variantes.D);
    expect(parChassis.ficheIncomplete).toBe(false);

    const pauvre = await api().pourVehicule({ vehiculeId: await vehicule({ marque: null, modele: null }) });
    expect(pauvre.ficheIncomplete).toBe(true);
    expect((pauvre.items as unknown[]).length).toBe(0);
  });

  it("la version affinante ne rejette pas des pièces réellement compatibles", async () => {
    // Version de la fiche jamais présente dans les motorisations du catalogue :
    // si elle était une exclusion stricte, la pièce E disparaîtrait de la
    // réponse — c'est précisément le relâchement qui est testé ici.
    const v = await vehicule({ marque: "Toyota", modele: "Hilux", annee: 2014, version: "DynDiesel 2.8TDI LWB" });
    const r = await api().pourVehicule({ vehiculeId: v });
    const ids = (r.items as { id: number }[]).map((i) => i.id);
    expect(ids).toContain(variantes.E);
    expect(r.criteres).toMatchObject({ version: "DynDiesel 2.8TDI LWB" });
  });
});
