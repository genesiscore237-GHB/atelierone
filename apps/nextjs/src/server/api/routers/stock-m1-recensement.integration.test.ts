import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * M1 — RECENSEMENT
 *
 * Le besoin du garage, littéralement : « le garage regorge de toute une
 * multitude de pièces qu'on doit enregistrer, les pièces sont éparpillées
 * partout et dans les bureaux, et il y en a beaucoup à recenser ».
 *
 * Ce que ces tests verrouillent :
 *
 *   · une session de recensement peut être ouverte, reprise, et appliquée ;
 *   · le théorique vient de la SOMME des emplacements, jamais d'une ligne ;
 *   · appliquer un recensement n'écrit JAMAIS directement dans `stocks` :
 *     tout passe par le moteur de mouvements ;
 *   · rejouer une session déjà validée est REFUSÉ — sinon le stock s'éloigne
 *     du réel à chaque rejeu ;
 *   · « constater » n'écrit rien dans le stock ;
 *   · un prix d'achat absent reste absent : jamais de coût inventé.
 */

vi.mock("@atelierone/auth", () => ({}));

const { stockRecensementRouter } = await import("~/server/api/routers/stock-recensement");

const NS = "m1rec";
const AGENCE = 1;

let userId = 0;
let produitPrincipal = 0;
const emplacements: number[] = [];

function ctx() {
  const user = {
    id: String(userId),
    name: "Recensement",
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

const api = () => stockRecensementRouter.createCaller(ctx());

async function produitParCodeBarre(code: string, titre: string, extra = ""): Promise<number> {
  const found = await db.execute(sql`SELECT id FROM produits WHERE code_barre = ${code} LIMIT 1`);
  const rows = found as unknown as { id: number }[];
  if (rows[0]?.id) return Number(rows[0].id);
  const [p] = (await db.execute(
    sql.raw(`
      INSERT INTO produits (code_barre, titre, type_produit, prix_vente, prix_achat,
                            seuil_alerte, seuil_critique${extra})
      VALUES ('${code}', '${titre.replace(/'/g, "''")}', 'PIECE', 10000, 5000, 5, 2)
      RETURNING id`),
  )) as unknown as { id: number }[];
  return Number(p!.id);
}

async function emplacementParCode(code: string, libelle: string, parentId?: number): Promise<number> {
  const found = await db.execute(sql`SELECT id FROM emplacements WHERE code = ${code} LIMIT 1`);
  const rows = found as unknown as { id: number }[];
  if (rows[0]?.id) return Number(rows[0].id);
  const [e] = (await db.execute(
    sql.raw(`
      INSERT INTO emplacements (agence_id, code, libelle, type, parent_id, profondeur)
      VALUES (${AGENCE}, '${code}', '${libelle}', 'RAYON',
              ${parentId ?? "NULL"}, ${parentId ? 1 : 0})
      RETURNING id`),
  )) as unknown as { id: number }[];
  return Number(e!.id);
}

async function stockVue(produitId: number, agenceId = AGENCE) {
  const [r] = (await db.execute(
    sql`SELECT quantite, disponible FROM stock_agregat
          WHERE produit_id = ${produitId} AND agence_id = ${agenceId}`,
  )) as unknown as { quantite: string; disponible: string }[];
  return r ?? { quantite: "0", disponible: "0" };
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'M1', 'Recensement', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`)) as unknown as { id: string }[];
  userId = Number(u!.id);

  produitPrincipal = await produitParCodeBarre(
    `${NS}-P1`,
    'Filtre a huile 15W40',
  );
  // Un article au libellé proche, pour éprouver le garde-fou anti-doublon.
  await produitParCodeBarre(`${NS}-P2`, 'Filtre huile 15W40 Castrol');

  emplacements.push(await emplacementParCode(`${NS}-MAG`, 'Magasin central'));
  emplacements.push(await emplacementParCode(`${NS}-BUREAU`, 'Bureau du chef', emplacements[0]));

  // Remise à zéro de l'état : le test doit partir de zéro à chaque run.
  await db.execute(
    sql`DELETE FROM inventaires WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
  await db.execute(
    sql`DELETE FROM stocks WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
});

afterAll(async () => {
  await db.execute(
    sql`DELETE FROM inventaires WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
  await db.execute(
    sql`DELETE FROM stocks WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
});

describe("M1 — recherche et garde-fou anti-doublon", () => {
  it("trouve l'article par code-barres et donne son stock déjà connu", async () => {
    const r = await api().rechercher({ query: `${NS}-P1` });
    expect(r.resultats.length).toBeGreaterThan(0);
    const p = r.resultats.find((x) => x.id === produitPrincipal);
    expect(p, "l'article sought after must be found by its barcode").toBeDefined();
    expect(p!.quantiteStock, "stock connu au départ").toBe(0);
  });

  it("signale un article au libellé proche SANS fusionner ni le masquer", async () => {
    const r = await api().rechercher({ query: `${NS}-P1` });
    // Le garde-fou doit SUGGÉRER, jamais trancher : les deux articles restent
    // interrogeables et distincts.
    const ids = r.resultats.map((x) => x.id);
    expect(ids).toContain(produitPrincipal);

    const similar = await api().rechercher({ query: "Filtre a huile 15W40" });
    const titres = similar.resultats.map((x) => x.titre);
    expect(titres.some((t) => t.includes("Castrol")), "le second article existe aussi").toBe(true);
  });

  it("propose le stock réparti quand l'article est sur plusieurs emplacements", async () => {
    // On sème un stock réparti : c'est le cas que le `.limit(1)` rendait
    // illisible — 6 dans le magasin, 4 au bureau.
    await db.execute(
      sql`INSERT INTO stocks (produit_id, agence_id, emplacement_id, quantite)
          VALUES (${produitPrincipal}, ${AGENCE}, ${emplacements[0]}, 6)`,
    );
    await db.execute(
      sql`INSERT INTO stocks (produit_id, agence_id, emplacement_id, quantite)
          VALUES (${produitPrincipal}, ${AGENCE}, ${emplacements[1]}, 4)`,
    );

    const r = await api().rechercher({ query: `${NS}-P1` });
    const p = r.resultats.find((x) => x.id === produitPrincipal)!;
    expect(Number(p.quantiteStock), "la quantité affichée est la SOMME").toBe(10);
    expect(p.nbEmplacements).toBe(2);
    expect(p.estReparti, "un stock réparti est signalé").toBe(true);

    const detail = await api().preparerLigne({ produitId: produitPrincipal });
    expect(detail.stockConnu.quantite, "préparation : total connu").toBe(10);
    expect(detail.parEmplacement.length).toBe(2);
  });
});

describe("M1 — prévisualisation n'écrit rien", () => {
  it("compare le comptage au théorique du LIEU et au total, séparément", async () => {
    // 6 au magasin, 4 au bureau. Le magasinier en trouve 8 au magasin.
    const r = await api().previsualiser({
      lignes: [{ produitId: produitPrincipal, emplacementId: emplacements[0], quantite: 8 }],
    });
    const l = r.lignes[0]!;
    expect(Number(l.quantiteTheoriqueLieu)).toBe(6);
    expect(Number(l.quantiteTheoriqueTotal)).toBe(10);
    expect(Number(l.ecartLieu), "écart au lieu").toBe(2);
    expect(Number(l.ecartTotal), "écart au total").toBe(-2);
    expect(l.stockDejaConnu).toBe(true);

    // RIEN n'a été écrit : c'est le contrat de la prévisualisation.
    expect(Number((await stockVue(produitPrincipal)).quantite)).toBe(10);
  });

  it("signale un emplacement suspect : pièce comptée là où le stock ne connaît rien", async () => {
    const r = await api().previsualiser({
      lignes: [{ produitId: produitPrincipal, emplacementId: emplacements[1], quantite: 4 }],
    });
    expect(r.lignes[0]!.emplacementSuspect).toBe(false);

    const r2 = await api().previsualiser({
      lignes: [{ produitId: produitPrincipal, quantite: 4 }],
    });
    expect(r2.lignes[0]!.quantiteTheoriqueLieu, "sans lieu, on compare au global").toBe(0);
  });
});

describe("M1 — validation", () => {
  it("constater enregistre les écarts sans toucher au stock", async () => {
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-constater` });
    await api().valider({
      sessionId,
      mode: "constater",
      lignes: [{ produitId: produitPrincipal, quantite: 999 }],
    });

    expect(Number((await stockVue(produitPrincipal)).quantite), "stock inchangé").toBe(10);

    const lignes = await api().lignesSession({ sessionId });
    expect(lignes.length).toBe(1);
    expect(Number(lignes[0]!.ecart), "l'écart estrecorded malgré tout").toBe(989);
  });

  it("ajuster écrit par le MOTEUR — un mouvement par écart, jamais un UPDATE direct", async () => {
    const avant = Number((await stockVue(produitPrincipal)).quantite);
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-ajuster` });

    const r = await api().valider({
      sessionId,
      mode: "ajuster",
      lignes: [{ produitId: produitPrincipal, quantite: avant + 7 }],
    });

    expect(r.ecroutes, "une ligne a produit un ajustement").toBe(1);
    expect(Number((await stockVue(produitPrincipal)).quantite), "stock +7 exactement").toBe(avant + 7);

    const mvt = await db.execute(
      sql`SELECT type, sens, quantite, reference_type FROM mouvements_stock
           WHERE produit_id = ${produitPrincipal}
             AND reference = ${`RECENS-${sessionId}`}
           ORDER BY id DESC LIMIT 1`,
    );
    const ligne = (mvt as unknown as Record<string, string>[])[0];
    expect(ligne, "un mouvement a été écrit").toBeDefined();
    expect(ligne!.type).toMatch(/AJUSTEMENT_INVENTAIRE_POSITIF/);
    expect(ligne!.reference_type).toBe("INVENTAIRE");
  });

  it("un écart négatif passe par la sortie, jamais par un stock négatif", async () => {
    const avant = Number((await stockVue(produitPrincipal)).quantite);
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-negatif` });

    await api().valider({
      sessionId,
      mode: "ajuster",
      lignes: [{ produitId: produitPrincipal, quantite: avant - 3 }],
    });

    expect(Number((await stockVue(produitPrincipal)).quantite)).toBe(avant - 3);
    expect(Number((await stockVue(produitPrincipal)).quantite)).toBeGreaterThan(0);
  });

  it("rejouer une session déjà validée est REFUSÉ", async () => {
    // Le défaut le plus coûteux d'un inventaire : rejouer appliquerait une
    // SECONDE fois les mêmes écarts. Le stock s'éloignerait du réel à chaque
    // rejeu, et l'écart deviendrait plus grand que l'erreur qu'il corrige.
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-rejeu` });
    await api().valider({ sessionId, mode: "constater", lignes: [{ produitId: produitPrincipal, quantite: 5 }] });

    const { sessionId: s2 } = await api().ouvrirSession({ libelle: `${NS}-rejeu2` });
    await api().valider({ sessionId: s2, mode: "ajuster", lignes: [{ produitId: produitPrincipal, quantite: 12 }] });
    const apres = Number((await stockVue(produitPrincipal)).quantite);

    const refus = await api()
      .valider({ sessionId: s2, mode: "ajuster", lignes: [{ produitId: produitPrincipal, quantite: 50 }] })
      .then(() => null)
      .catch((e: Error) => e);

    expect(refus, "un session validée ne se rejoue pas").not.toBeNull();
    expect(refus!.message).toMatch(/déjà été appliquée|rejoue/i);
    expect(Number((await stockVue(produitPrincipal)).quantite), "stock inchangé par le rejeu").toBe(apres);
  });

  it("n'invente jamais de coût d'achat", async () => {
    const avantCMUP = await db.execute(
      sql`SELECT COALESCE(SUM(COALESCE(cout_unitaire_moyen, 0)), 0) AS v FROM stocks
           WHERE produit_id = ${produitPrincipal}`,
    );
    const vAvant = Number((avantCMUP as unknown as { v: string }[])[0]!.v);

    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-cmup` });
    await api().valider({
      sessionId,
      mode: "ajuster",
      // Aucun prixAchat : le magasinier compte, il ne connaît pas le coût.
      lignes: [{ produitId: produitPrincipal, quantite: 5 }],
    });

    const apresCMUP = await db.execute(
      sql`SELECT COALESCE(SUM(COALESCE(cout_unitaire_moyen, 0)), 0) AS v FROM stocks
           WHERE produit_id = ${produitPrincipal}`,
    );
    expect(
      Number((apresCMUP as unknown as { v: string }[])[0]!.v),
      "aucun coût inventé lors d'un recensement physique",
    ).toBe(vAvant);
  });

  it("reprend une session laissée en cours", async () => {
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-en-cours` });
    const list = await api().sessions();
    expect(list.find((s) => s.id === sessionId)).toBeDefined();
    expect(list.find((s) => s.id === sessionId)!.statut).toBe("en_cours");
  });
});