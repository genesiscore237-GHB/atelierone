import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * M5 — TRANSFERT
 *
 * « Changer l'emplacement d'une pièce » — et, plus généralement, les pièces
 * sont éparpillées dans 5 magasins et dans les bureaux.
 *
 * Ce que ces tests verrouillent :
 *
 *   · un transfert déplace la QUANTITÉ, et elle est conservée au total ;
 *   · un transfert vers un BUREAU ou un BAC fonctionne — pas seulement vers
 *     un rayon ;
 *   · toutes les lignes partent ou RIEN ne part (une seule transaction) ;
 *   · une quantité supérieure à la source est refusée ;
 *   · la conversion d'unité est respectée : déplacer 1 fût de 208 L retire
 *     208 litres, pas 1 ;
 *   · `quantite_rayon` suit : ce qui sort d'un rayon n'y est plus.
 */

vi.mock("@atelierone/auth", () => ({}));

const { stockRouter } = await import("~/server/api/routers/stock");

const NS = "m5xfert";
const AGENCE = 1;
const LITRES_PAR_FUT = 208;

let userId = 0;
let produitSimple = 0;
let produitFut = 0;
const emplacements: { id: number; type: string }[] = [];

function ctx() {
  const user = {
    id: String(userId),
    name: "Transfert",
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

const api = () => stockRouter.createCaller(ctx());

async function produitParCodeBarre(code: string): Promise<number> {
  const found = (await db.execute(sql`SELECT id FROM produits WHERE code_barre = ${code} LIMIT 1`)) as unknown as {
    id: number;
  }[];
  if (found[0]?.id) return Number(found[0].id);
  const [p] = (await db.execute(
    sql`INSERT INTO produits (code_barre, titre, type_produit, prix_vente, prix_achat,
                              seuil_alerte, seuil_critique)
          VALUES (${code}, ${`Produit test M5 ${code}`}, 'PIECE', 10000, 5000, 5, 2)
          RETURNING id`,
  )) as unknown as { id: number }[];
  return Number(p!.id);
}

async function emplacementParCode(code: string, type: string): Promise<number> {
  const found = (await db.execute(sql`SELECT id FROM emplacements WHERE code = ${code} LIMIT 1`)) as unknown as {
    id: number;
  }[];
  if (found[0]?.id) return Number(found[0].id);
  const [e] = (await db.execute(
    sql`INSERT INTO emplacements (agence_id, code, libelle, type)
        VALUES (${AGENCE}, ${code}, ${code}, ${type}) RETURNING id`,
  )) as unknown as { id: number }[];
  return Number(e!.id);
}

async function stockVue(p: number) {
  const [r] = (await db.execute(
    sql`SELECT quantite FROM stock_agregat WHERE produit_id = ${p} AND agence_id = ${AGENCE}`,
  )) as unknown as { quantite: string }[];
  return Number(r?.quantite ?? 0);
}

async function quantiteLieu(p: number, emplacementId: number) {
  const [r] = (await db.execute(
    sql`SELECT COALESCE(SUM(quantite), 0) AS q, COALESCE(SUM(quantite_rayon), 0) AS rayon
          FROM stocks WHERE produit_id = ${p} AND agence_id = ${AGENCE} AND emplacement_id = ${emplacementId}`,
  )) as unknown as { q: string; rayon: string }[];
  return { q: Number(r?.q ?? 0), rayon: Number(r?.rayon ?? 0) };
}

async function stockA(p: number, emplacementId: number, quantite: number, rayon = 0) {
  await db.execute(sql`DELETE FROM stocks WHERE produit_id = ${p} AND emplacement_id = ${emplacementId}`);
  await db.execute(
    sql`INSERT INTO stocks (produit_id, agence_id, emplacement_id, quantite, quantite_rayon)
          VALUES (${p}, ${AGENCE}, ${emplacementId}, ${quantite}, ${rayon})`,
  );
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'M5', 'Transfert', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`)) as unknown as { id: string }[];
  userId = Number(u!.id);

  produitSimple = await produitParCodeBarre(`${NS}-P1`);
  produitFut = await produitParCodeBarre(`${NS}-FUT`);

  emplacements.push({ id: await emplacementParCode(`${NS}-RAYON`, "RAYON"), type: "RAYON" });
  emplacements.push({ id: await emplacementParCode(`${NS}-BUREAU`, "BUREAU"), type: "BUREAU" });
  emplacements.push({ id: await emplacementParCode(`${NS}-BAC`, "BAC"), type: "BAC" });

  // Le fût : unité de base = L, unité « fut » = 208 L.
  const [uf] = (await db.execute(
    sql`INSERT INTO unites_mesure (code, libelle, symbole, type)
        VALUES (${`${NS}-FUT`}, 'Fut', 'FUT', 'QUANTITE')
        ON CONFLICT (code) DO UPDATE SET code = unites_mesure.code
        RETURNING id`,
  )) as unknown as { id: string }[];
  await db.execute(
    sql`INSERT INTO produit_unites (produit_id, unite_id, facteur_vers_base, est_unite_base)
        VALUES (${produitFut}, ${uf!.id}, ${LITRES_PAR_FUT}, true)
        ON CONFLICT (produit_id, unite_id) DO UPDATE SET facteur_vers_base = ${LITRES_PAR_FUT}`,
  );

  await db.execute(
    sql`DELETE FROM stocks WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
});

afterAll(async () => {
  await db.execute(
    sql`DELETE FROM stocks WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
});

describe("M5 — transfert de stock", () => {
  it("déplace la quantité, et le total est conservé", async () => {
    const [RAYON, BUREAU] = emplacements;
    await stockA(produitSimple, RAYON.id, 20, 20);

    await api().transfererLot({
      emplacementSourceId: RAYON.id,
      emplacementCibleId: BUREAU.id,
      lignes: [{ produitId: produitSimple, quantite: 6 }],
    });

    expect((await quantiteLieu(produitSimple, RAYON.id)).q, "source").toBe(14);
    expect((await quantiteLieu(produitSimple, BUREAU.id)).q, "destination").toBe(6);
    expect(await stockVue(produitSimple), "le total ne bouge pas").toBe(20);
  });

  it("transférer vers un BUREAU ou un BAC fonctionne — pas seulement vers un rayon", async () => {
    // `listRayons` ne renvoyait que les `type = 'RAYON'`. Or le relevé compte
    // des BAC, des CASIER, des ZONE, des ATELIER et un BUREAU — et c'est
    // précisément là que finissent les pièces du garage.
    const [RAYON, , BAC] = emplacements;
    await stockA(produitSimple, RAYON.id, 10, 10);

    await api().transfererLot({
      emplacementSourceId: RAYON.id,
      emplacementCibleId: BAC.id,
      lignes: [{ produitId: produitSimple, quantite: 4 }],
    });

    expect((await quantiteLieu(produitSimple, BAC.id)).q).toBe(4);
  });

  it("convertit l'unité : 1 fût de 208 L retire 208 LITRES, pas 1", async () => {
    // L'ancien `transferer` écrivait dans `stocks` la quantité BRUTE alors
    // que `stocks_unites` recevait la quantité convertie. Les deux tables
    // divergeaient à chaque transfert d'un article à conditionnement non
    // unitaire — le même défaut que sur le déconditionnement.
    const [RAYON, BUREAU] = emplacements;
    await stockA(produitFut, RAYON.id, LITRES_PAR_FUT, LITRES_PAR_FUT);
    expect(await stockVue(produitFut), "un fût = 208 L en base").toBe(LITRES_PAR_FUT);

    const [uf] = (await db.execute(
      sql`SELECT id FROM unites_mesure WHERE code = ${`${NS}-FUT`} LIMIT 1`,
    )) as unknown as { id: string }[];

    await api().transfererLot({
      emplacementSourceId: RAYON.id,
      emplacementCibleId: BUREAU.id,
      lignes: [{ produitId: produitFut, uniteId: uf!.id, quantite: 1 }],
    });

    expect((await quantiteLieu(produitFut, RAYON.id)).q, "sortie en litres").toBe(0);
    expect(
      (await quantiteLieu(produitFut, BUREAU.id)).q,
      "entrée en LITRES, pas en unités de fût",
    ).toBe(LITRES_PAR_FUT);
  });

  it("transfère un produit SANS ligne stocks_unites", async () => {
    // `stocks_unites` est GLOBAL : pas de dimension `emplacement_id`. Il
    // décrit « combien ce produit existe dans l'atelier », pas « combien dans
    // ce rayon ». Un déplacement ne change donc pas le nombre de fûts.
    //
    // L'ancien `transferer` décrémentait `stocks_unites` à la sortie puis
    // l'incrémentait à l'entrée : le solde revenait juste, mais le décrément
    // exigeait une ligne EXISTANTE. Conséquence mesurée : 112 des 135 lignes
    // de stock réel n'ont aucune ligne `stocks_unites`, et ces produits
    // étaient tout simplement INTRANSFÉRABLES — avec un message trompeur
    // (« stock insuffisant ») alors que la pièce était bien là.
    const [RAYON, BUREAU] = emplacements;
    await stockA(produitSimple, RAYON.id, 7, 7);
    await db.execute(sql`DELETE FROM stocks_unites WHERE produit_id = ${produitSimple}`);

    // `stockA` ne réinitialise que l'emplacement donné : la destination
    // accumule ce qu'y ont laissé les tests précédents. On compare donc des
    // écarts, pas des absolus.
    const bureauAvant = (await quantiteLieu(produitSimple, BUREAU.id)).q;

    const r = await api()
      .transfererLot({
        emplacementSourceId: RAYON.id,
        emplacementCibleId: BUREAU.id,
        lignes: [{ produitId: produitSimple, quantite: 2 }],
      })
      .then(() => "ok")
      .catch((e: Error) => e.message);

    expect(r, "le transfert ne doit pas exiger de ligne stocks_unites").toBe("ok");
    expect((await quantiteLieu(produitSimple, RAYON.id)).q, "source décrémentée").toBe(5);
    expect(
      (await quantiteLieu(produitSimple, BUREAU.id)).q - bureauAvant,
      "destination incrémentée",
    ).toBe(2);
  });

  it("un déplacement ne crée pas de ligne stocks_unites", async () => {
    // Conséquence directe : le stock global par unité ne bouge pas. Le
    // sebanyak de fûts dans l'atelier est le même avant et après.
    const [RAYON, BUREAU] = emplacements;
    await stockA(produitSimple, RAYON.id, 9, 9);
    await db.execute(sql`DELETE FROM stocks_unites WHERE produit_id = ${produitSimple}`);

    await api().transfererLot({
      emplacementSourceId: RAYON.id,
      emplacementCibleId: BUREAU.id,
      lignes: [{ produitId: produitSimple, quantite: 4 }],
    });

    const lignes = (await db.execute(
      sql`SELECT quantite FROM stocks_unites WHERE produit_id = ${produitSimple}`,
    )) as unknown as { quantite: string }[];
    expect(
      lignes.length,
      "une relocation n'a pas à faire apparaître de stock par unité",
    ).toBe(0);
  });

  it("TOUT bouge ensemble, ou RIEN ne bouge", async () => {
    // L'ancienne écran appelait `transferer` une fois par ligne EN PARALLÈLE :
    // si la troisième échouait, les deux premières étaient déjà appliquées
    // dans des transactions séparées. Le magasinier lisait « effectué » et le
    // stock ne correspondait plus.
    const [RAYON, BUREAU] = emplacements;
    await stockA(produitSimple, RAYON.id, 50, 50);

    const avantBureau = (await quantiteLieu(produitSimple, BUREAU.id)).q;

    const refus = await api()
      .transfererLot({
        emplacementSourceId: RAYON.id,
        emplacementCibleId: BUREAU.id,
        lignes: [
          { produitId: produitSimple, quantite: 5 },
          // Ligne 2 : quantité supérieure à ce que contient la source.
          { produitId: produitFut, quantite: 9999 },
        ],
      })
      .then(() => null)
      .catch((e: Error) => e);

    expect(refus, "le lot doit échouer").not.toBeNull();
    expect(
      (await quantiteLieu(produitSimple, RAYON.id)).q,
      "la PREMIÈRE ligne ne doit pas être restée appliquée",
    ).toBe(50);
    expect(
      (await quantiteLieu(produitSimple, BUREAU.id)).q,
      "rien n'a été déposé",
    ).toBe(avantBureau);
  });

  it("refuse une quantité supérieure à la source", async () => {
    const [RAYON, BUREAU] = emplacements;
    await stockA(produitSimple, RAYON.id, 3, 3);

    const refus = await api()
      .transfererLot({
        emplacementSourceId: RAYON.id,
        emplacementCibleId: BUREAU.id,
        lignes: [{ produitId: produitSimple, quantite: 10 }],
      })
      .then(() => null)
      .catch((e: Error) => e);

    expect(refus).not.toBeNull();
    expect((await quantiteLieu(produitSimple, RAYON.id)).q, "source intacte").toBe(3);
  });

  it("refuse une source égale à la destination", async () => {
    const [RAYON] = emplacements;
    const refus = await api()
      .transfererLot({
        emplacementSourceId: RAYON.id,
        emplacementCibleId: RAYON.id,
        lignes: [{ produitId: produitSimple, quantite: 1 }],
      })
      .then(() => null)
      .catch((e: Error) => e);
    expect(refus, "se déplacer une pièce sur elle-même n'est pas un transfert").not.toBeNull();
  });

  it("quantite_rayon suit : ce qui sort d'un rayon n'y est plus", async () => {
    // La colonne était incrémentée à la mise en rayon et n'était JAMAIS
    // décrémentée : après un transfert sortant, le rayon source continuait
    // d'annoncer son contenu, et la vue « À achalander » le proposait encore.
    const [RAYON, BUREAU] = emplacements;
    await stockA(produitSimple, RAYON.id, 12, 12);

    await api().transfererLot({
      emplacementSourceId: RAYON.id,
      emplacementCibleId: BUREAU.id,
      lignes: [{ produitId: produitSimple, quantite: 12 }],
    });

    const source = await quantiteLieu(produitSimple, RAYON.id);
    expect(source.q, "rayon vidé").toBe(0);
    expect(source.rayon, "plus rien 'en rayon' dans un rayon vidé").toBe(0);
  });

  it("chaque ligne produit une sortie ET une entrée, liées par un groupe", async () => {
    const [RAYON, BUREAU] = emplacements;
    await stockA(produitSimple, RAYON.id, 8, 8);

    const r = await api().transfererLot({
      emplacementSourceId: RAYON.id,
      emplacementCibleId: BUREAU.id,
      lignes: [{ produitId: produitSimple, quantite: 3 }],
    });

    const mvt = (await db.execute(
      sql`SELECT type, sens, quantite, emplacement_id, groupe_operation_id, reference_type
            FROM mouvements_stock
           WHERE produit_id = ${produitSimple}
             AND groupe_operation_id = ${r.groupeOperationId}
           ORDER BY id`,
    )) as unknown as Record<string, string>[];

    expect(mvt.length, "deux mouvements par ligne").toBe(2);
    expect(mvt.filter((m) => m.sens === "S").length).toBe(1);
    expect(mvt.filter((m) => m.sens === "E").length).toBe(1);
    for (const m of mvt) {
      expect(m.groupe_operation_id, "un seul groupe par transfert").toBe(r.groupeOperationId);
      expect(m.reference_type).toBe("TRANSFERT");
    }
  });
});