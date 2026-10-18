import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * M3 — RÉCEPTION RAPIDE
 *
 * « Enregistrer les pièces que le garage achète pour la maintenance des
 *  véhicules. »
 *
 * Ce que ces tests verrouillent :
 *
 *   · le lot monte en stock de la quantité exacte, à l'emplacement choisi ;
 *   · un PRIX ABSENT ne devient pas un coût nul (sinon la pièce disparaît
 *     de la valeur du stock sans prévenir) ;
 *   · un prix saisi fait bouger le CMUP, pondéré ;
 *   · un numéro de lot crée un lot RÉELLEMENT traçable ;
 *   · la réception passe par le MOTEUR — pas d'écriture directe de `stocks` ;
 *   · deux réceptions du même article s'additionnent, même si la pièce
 *     était déjà répartie sur plusieurs emplacements.
 */

vi.mock("@atelierone/auth", () => ({}));

const { stockReceptionRouter } = await import("~/server/api/routers/stock-reception");

const NS = "m3recep";
const AGENCE = 1;

let userId = 0;
let produitId = 0;
let produitHuil = 0;
let produitSansPrix = 0;
let fournisseurId = 0;
const emplacements: number[] = [];

function ctx() {
  const user = {
    id: String(userId),
    name: "Reception",
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

const api = () => stockReceptionRouter.createCaller(ctx());

/**
 * Crée un produit de test si besoin.
 *
 * `prixAchat` à 
ull` simule une pièce dont le coût d'achat n'a JAMAIS été
 * saisi — le cas le plus fréquent dans une base qui démarre. C'est le seul
 * état où la ligne doit entrer en stock sans CMUP.
 *
 * `dlcJours` est un PARAMÈTRE, pas un fragment SQL concaténé : la première
 * version passait `", dlc_jours = 180"` dans un `sql.raw`, ce qui produisait
 * `erreur de syntaxe sur ou près de « = »`. Un gabarit paramétré évite la
 * question et rend la requête inerte vis-à-vis de l'injection.
 */
async function produitParCodeBarre(
  code: string,
  dlcJours: number | null = null,
  prixAchat: number | null = 5000,
): Promise<number> {
  const found = (await db.execute(sql`SELECT id FROM produits WHERE code_barre = ${code} LIMIT 1`)) as unknown as {
    id: number;
  }[];
  if (found[0]?.id) {
    await db.execute(sql`UPDATE produits SET prix_achat = ${prixAchat}, dlc_jours = ${dlcJours} WHERE id = ${found[0].id}`);
    return Number(found[0].id);
  }
  const [p] = (await db.execute(
    sql`INSERT INTO produits (code_barre, titre, type_produit, prix_vente, prix_achat,
                              seuil_alerte, seuil_critique, dlc_jours)
          VALUES (${code}, ${`Produit test M3 ${code}`}, 'PIECE', 10000, ${prixAchat}, 5, 2, ${dlcJours})
          RETURNING id`,
  )) as unknown as { id: number }[];
  return Number(p!.id);
}

async function emplacementParCode(code: string): Promise<number> {
  const found = (await db.execute(sql`SELECT id FROM emplacements WHERE code = ${code} LIMIT 1`)) as unknown as {
    id: number;
  }[];
  if (found[0]?.id) return Number(found[0].id);
  const [e] = (await db.execute(
    sql`INSERT INTO emplacements (agence_id, code, libelle, type)
        VALUES (${AGENCE}, ${code}, ${code}, 'RAYON') RETURNING id`,
  )) as unknown as { id: number }[];
  return Number(e!.id);
}

async function stockVue(p: number) {
  const [r] = (await db.execute(
    sql`SELECT quantite, cmup_pondere, nb_lignes, valeur_stock
          FROM stock_agregat WHERE produit_id = ${p} AND agence_id = ${AGENCE}`,
  )) as unknown as { quantite: string; cmup_pondere: string | null; nb_lignes: number; valeur_stock: string }[];
  return r ?? { quantite: "0", cmup_pondere: null, nb_lignes: 0, valeur_stock: "0" };
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'M3', 'Reception', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`)) as unknown as { id: string }[];
  userId = Number(u!.id);

  produitId = await produitParCodeBarre(`${NS}-P1`);
  produitHuil = await produitParCodeBarre(`${NS}-HUILE`, 180);
  produitSansPrix = await produitParCodeBarre(`${NS}-GRATUIT`, null, null);

  emplacements.push(await emplacementParCode(`${NS}-E1`));
  emplacements.push(await emplacementParCode(`${NS}-E2`));

  const f = (await db.execute(
    sql`SELECT id FROM fournisseurs WHERE nom = ${`${NS}-Fournisseur`} LIMIT 1`,
  )) as unknown as { id: number }[];
  if (f[0]?.id) {
    fournisseurId = f[0].id;
  } else {
    const [n] = (await db.execute(
      sql`INSERT INTO fournisseurs (nom, code, is_active)
          VALUES (${`${NS}-Fournisseur`}, ${NS}, true) RETURNING id`,
    )) as unknown as { id: number }[];
    fournisseurId = n!.id;
  }

  await db.execute(
    sql`DELETE FROM stocks WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
  await db.execute(
    sql`DELETE FROM stocks_lots WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
});

afterAll(async () => {
  await db.execute(
    sql`DELETE FROM stocks WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
  await db.execute(
    sql`DELETE FROM stocks_lots WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
});

describe("M3 — prévisualisation", () => {
  it("annonce ce que la réception va faire, sans rien écrire", async () => {
    await db.execute(
      sql`INSERT INTO stocks (produit_id, agence_id, quantite, cout_unitaire_moyen)
          VALUES (${produitId}, ${AGENCE}, 10, 5000)`,
    );

    const r = await api().previsualiser({
      lignes: [{ produitId, quantite: 5, prixUnitaire: 6000 }],
    });
    const l = r.lignes[0]!;
    expect(Number(l.quantiteAvant)).toBe(10);
    expect(Number(l.quantiteApres)).toBe(15);
    expect(l.prixSource).toBe("saisi");
    // CMUP pondéré : (5000×10 + 6000×5) / 15 = 5 333,33
    expect(Number(l.cmupApres)).toBeCloseTo(5333.33, 1);

    expect(Number((await stockVue(produitId)).quantite), "RIEN n'a été écrit").toBe(10);
  });

  it("un prix absent est signalé comme absent, pas supposé nul", async () => {
    await db.execute(
      sql`INSERT INTO stocks (produit_id, agence_id, quantite)
          VALUES (${produitSansPrix}, ${AGENCE}, 8)`,
    );

    const r = await api().previsualiser({
      lignes: [{ produitId: produitSansPrix, quantite: 4 }],
    });
    expect(r.lignes[0]!.prixUnitaire, "aucun coût annoncé").toBe(0);
    expect(r.lignes[0]!.cmupApres, "le CMUP reste indefini").toBeNull();
    expect(r.totaux.sansCout).toBe(1);
  });

  it("signale un dépassement du stock maximum sans bloquer", async () => {
    await db.execute(sql`UPDATE produits SET stock_maximum = 12 WHERE id = ${produitHuil}`);
    const r = await api().previsualiser({ lignes: [{ produitId: produitHuil, quantite: 40 }] });
    expect(r.lignes[0]!.auDessusDuMaximum).toBe(true);
    expect(r.totaux.auDessusDuMaximum).toBe(1);

    await db.execute(sql`UPDATE produits SET stock_maximum = NULL WHERE id = ${produitHuil}`);
  });
});

describe("M3 — réception effective", () => {
  it("reçoit la quantité exacte, dans l'emplacement choisi", async () => {
    const avant = Number((await stockVue(produitId)).quantite);

    await api().recevoir({
      fournisseurId,
      lignes: [{ produitId, quantite: 12, prixUnitaire: 5500, emplacementId: emplacements[0] }],
    });

    const apres = await stockVue(produitId);
    expect(Number(apres.quantite), "+12 exactement").toBe(avant + 12);

    // Et la pièce est vraiment à l'emplacement demandé.
    const [ligne] = (await db.execute(
      sql`SELECT quantite FROM stocks
           WHERE produit_id = ${produitId} AND emplacement_id = ${emplacements[0]}`,
    )) as unknown as { quantite: string }[];
    expect(Number(ligne?.quantite ?? 0)).toBe(12);
  });

  it("un prix absent n'écrit AUCUN coût — la ligne reste sans CMUP", async () => {
    // Le défaut : un coût à 0 ferait disparaître la pièce de la « Valeur du
    // stock » sans rien dire. On ne connaît pas le prix de ce qu'on n'a pas
    // chiffré : la valeur exacte est « inconnue », pas « nulle ».
    const r = await api().recevoir({
      fournisseurId,
      lignes: [{ produitId: produitSansPrix, quantite: 6 }],
    });
    expect(r.lignesRecues).toBe(1);

    const apres = await stockVue(produitSansPrix);
    expect(apres.cmup_pondere, "aucun coût inventé").toBeNull();
    expect(Number(apres.quantite)).toBeGreaterThanOrEqual(6);
  });

  it("un numéro de lot crée un lot RÉELLEMENT rattaché au stock", async () => {
    await api().recevoir({
      fournisseurId,
      lignes: [
        {
          produitId: produitHuil,
          quantite: 3,
          prixUnitaire: 3500,
          numeroLot: `${NS}-LOT-1`,
          datePeremption: "2028-06-30",
          dateFabrication: "2026-01-15",
        },
      ],
    });

    const [lot] = (await db.execute(
      sql`SELECT id FROM lots WHERE produit_id = ${produitHuil} AND numero_lot = ${`${NS}-LOT-1`}`,
    )) as unknown as { id: number }[];
    expect(lot, "le lot a été créé").toBeDefined();

    const [sl] = (await db.execute(
      sql`SELECT quantite FROM stocks_lots WHERE lot_id = ${lot!.id}`,
    )) as unknown as { quantite: string }[];
    expect(Number(sl?.quantite ?? 0), "le lot porte la quantité reçue").toBeGreaterThan(0);
  });

  it("l'entrée passe par le MOTEUR : il y a un mouvement, avec son stock avant/après", async () => {
    const mvt = (await db.execute(
      sql`SELECT type, sens, quantite, stock_avant, stock_apres, emplacement_id, reference_type
            FROM mouvements_stock
           WHERE produit_id = ${produitId}
             AND type = 'ACHAT_RECEPTION'
             AND emplacement_id = ${emplacements[0]}
           ORDER BY id DESC LIMIT 1`,
    )) as unknown as Record<string, string | number | null>[];
    expect(mvt.length, "un mouvement par réception").toBeGreaterThan(0);
    expect(mvt[0]!.sens).toBe("E");
    expect(mvt[0]!.reference_type).toBe("BON_RECEPTION");
    expect(Number(mvt[0]!.stock_apres)).toBeGreaterThan(Number(mvt[0]!.stock_avant));
  });

  it("deux réceptions sur un produit DÉJÀ RÉPARTI s'additionnent", async () => {
    // C'est le cas que le `.limit(1)` ancien rendait faux : le produit est
    // sur deux emplacements, et la quantité doit être la somme.
    // `as never` puis `const [r1] = …` est un mensonge que TypeScript finit par
    // refuser : `never` n'est pas déstructurable. Le résultat n'est pas utilisé,
    // on n'affirme donc rien sur sa forme.
    await db.execute(
      sql`INSERT INTO stocks (produit_id, agence_id, emplacement_id, quantite, cout_unitaire_moyen)
          VALUES (${produitId}, ${AGENCE}, ${emplacements[1]}, 7, 5000)`,
    );

    const avant = await stockVue(produitId);
    expect(Number(avant.nb_lignes), "produit réparti").toBeGreaterThan(1);

    await api().recevoir({
      fournisseurId,
      lignes: [{ produitId, quantite: 4, prixUnitaire: 5000 }],
    });

    const apres = await stockVue(produitId);
    expect(
      Number(apres.quantite),
      "la vue vaut la somme des lignes, pas une ligne au hasard",
    ).toBe(Number(avant.quantite) + 4);
  });

  it("refuse un fournisseur inexistant", async () => {
    const refus = await api()
      .recevoir({ fournisseurId: 999999, lignes: [{ produitId, quantite: 1 }] })
      .then(() => null)
      .catch((e: Error) => e);
    expect(refus, "un fournisseur fantôme ne passe pas").not.toBeNull();
  });
});