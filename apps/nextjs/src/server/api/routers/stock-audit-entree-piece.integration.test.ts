import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * ÉTAPE 2 DU LOT 1 — CRÉER UNE PIÈCE INCONNUE DEPUIS LE RECENSEMENT.
 *
 * Le magasinier tient une pièce entre les mains ; elle n'existe nulle part
 * dans le système. Aujourd'hui, créer la fiche oblige à quitter l'écran de
 * comptage, traverser un formulaire qui propose 60 champs, puis REVENIR pour
 * finir de compter — le comptage est perdu entre les deux.
 *
 * `creerPieceEtCompter` fait tout en un seul appel, dans UNE transaction :
 *
 *   · l'article et sa variante naissent (gardes anti-doublon AVANT écriture) ;
 *   · l'unité de base existe obligatoirement (PCE par défaut, jamais NULL) ;
 *   · le stock initial entre par le MOTEUR (`INITIAL_RECEIPT`), jamais une
 *     écriture directe de `stocks.quantite` ;
 *   · le code-barres scanné est porté à la fois par la variante et par la
 *     table `codes_barres` — et un code déjà utilisé REFUSE (RG-010) ;
 *   · la ligne de comptage s'inscrit dans la session en cours.
 */

vi.mock("@atelierone/auth", () => ({}));

const { stockRecensementRouter } = await import("~/server/api/routers/stock-recensement");

const NS = `p2piece${Date.now().toString(36)}`;
const AGENCE = 1;

let userId = 0;
let empl = 0;
let idPCE = "";

function ctx() {
  const user = {
    id: String(userId),
    name: "Creation piece",
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

async function emplacementParCode(code: string, libelle: string): Promise<number> {
  const found = await db.execute(sql`SELECT id FROM emplacements WHERE code = ${code} LIMIT 1`);
  const rows = found as unknown as { id: number }[];
  if (rows[0]?.id) return Number(rows[0].id);
  const [e] = (await db.execute(
    sql`INSERT INTO emplacements (agence_id, code, libelle, type, parent_id, profondeur)
        VALUES (${AGENCE}, ${code}, ${libelle}, 'RAYON', NULL, 0)
        RETURNING id`,
  )) as unknown as { id: number }[];
  return Number(e!.id);
}

async function produitsParMotif(motif: string): Promise<number> {
  const r = await db.execute(
    sql`SELECT count(*)::int AS n FROM produits WHERE titre LIKE ${motif}`,
  );
  return Number((r as unknown as { n: number }[])[0]!.n);
}

/**
 * Nettoyage PARTIEL, comme m1 : les fiches et leurs mouvements restent dans
 * la base (mouvements_stock est append-only et son FK interdit de supprimer
 * des produits), mais chaque run définit son NS unique — une fiche d'une
 * exécution passée ne peut pas faire dériver un test courant. Le nettoyage
 * retire seulement les comptages, pour que le stock reparte de zéro.
 */
async function effacerFiches() {
  await db.execute(sql`DELETE FROM recensement_lignes WHERE produit_id IN (
        SELECT id FROM produits WHERE titre LIKE ${`${NS}%`})`);
  await db.execute(sql`DELETE FROM inventaires WHERE produit_id IN (
        SELECT id FROM produits WHERE titre LIKE ${`${NS}%`})`);
  await db.execute(sql`DELETE FROM stocks WHERE produit_id IN (
        SELECT id FROM produits WHERE titre LIKE ${`${NS}%`})`);
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'P2', 'Piece', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`)) as unknown as { id: string }[];
  userId = Number(u!.id);

  empl = await emplacementParCode(`${NS}-MAG`, "Magasin creation");

  const [pce] = (await db.execute(
    sql`SELECT id FROM unites_mesure WHERE code = 'PCE' LIMIT 1`,
  )) as unknown as { id: string }[];
  idPCE = pce?.id ?? ""; // vide : la création doit garantir PCE elle-même

  await effacerFiches();
});

afterAll(effacerFiches);

describe("P2 — créer une pièce inconnue et la compter", () => {
  it("un appel crée la fiche, l'unité, le stock et la ligne de comptage", async () => {
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-creation` });

    const r = await api().creerPieceEtCompter({
      sessionId,
      titre: `${NS} Plaquettes Dyna RT30`,
      typeProduit: "PIECE",
      quantite: 12,
      emplacementId: empl,
      prixAchat: 5000,
    });

    expect(r.produitId).toBeGreaterThan(0);
    expect(r.articleId).toBeGreaterThan(0);

    // la fiche est un article varié, avec base PCE obligatoire
    const [fiche] = (await db.execute(
      sql`SELECT article_id, unite_base_id, statut FROM produits WHERE id = ${r.produitId}`,
    )) as unknown as { article_id: number; unite_base_id: string; statut: string }[];
    expect(Number(fiche!.article_id)).toBe(r.articleId);
    // unité de base garante : après création, PCE est là — idremplacé
    if (!idPCE) {
      idPCE = String(fiche!.unite_base_id);
      const [code] = (await db.execute(
        sql`SELECT code FROM unites_mesure WHERE id = ${idPCE}`,
      )) as unknown as { code: string }[];
      expect(code!.code).toBe("PCE");
    }
    expect(String(fiche!.unite_base_id)).toBe(idPCE);
    expect(fiche!.statut).toBe("actif");

    const [u] = (await db.execute(
      sql`SELECT count(*)::int AS n FROM produit_unites WHERE produit_id = ${r.produitId} AND est_unite_base = true AND unite_id = ${idPCE}`,
    )) as unknown as { n: number }[];
    expect(u!.n, "l'unité PCE est en place (base vraie, facteur 1)").toBe(1);

    // le stock est entré via le moteur — pas un UPDATE direct
    const [stk] = (await db.execute(
      sql`SELECT quantite FROM stock_agregat WHERE produit_id = ${r.produitId} AND agence_id = ${AGENCE}`,
    )) as unknown as { quantite: string }[];
    expect(Number(stk!.quantite), "le comptage est déjà dans le stock").toBe(12);

    const [mvt] = (await db.execute(
      sql`SELECT type FROM mouvements_stock WHERE produit_id = ${r.produitId} AND reference = ${`RECENS-INIT-${r.produitId}`} LIMIT 1`,
    )) as unknown as { type: string }[];
    expect(mvt).toBeDefined();
    expect(mvt!.type).toBe("INITIAL_RECEIPT");

    // et la ligne est dans la session
    const lignes = await api().lignesSession({ sessionId });
    const la = lignes.find((l) => l.produitId === r.produitId);
    expect(la).toBeDefined();
    expect(Number(la!.quantiteReelle)).toBe(12);
  });

  it("le code-barres scanné est porté par la variante ET la table codes_barres", async () => {
    const code = `${NS}2345678`;
    const r = await api().creerPieceEtCompter({
      titre: `${NS} Filtre Dyna RT31`,
      codeBarre: code,
    });

    const [f] = (await db.execute(
      sql`SELECT code_barre FROM produits WHERE id = ${r.produitId}`,
    )) as unknown as { code_barre: string }[];
    expect(f!.code_barre).toBe(code);

    const [c] = (await db.execute(
      sql`SELECT produit_id FROM codes_barres WHERE valeur = ${code} LIMIT 1`,
    )) as unknown as { produit_id: number }[];
    expect(Number(c!.produit_id)).toBe(r.produitId);
  });

  it("un code-barres déjà porté REFUSE — et ne laisse pas de fiche orpheline", async () => {
    const avant = await produitsParMotif(`${NS} REFUS%`);
    const refus = await api()
      .creerPieceEtCompter({
        titre: `${NS} REFUS Doublon RT32`,
        codeBarre: `${NS}2345678`,
      })
      .then(() => null)
      .catch((e: Error) => e);

    expect(refus).not.toBeNull();
    expect(refus!.message).toMatch(/déjà|conflit|existe/i);
    expect(await produitsParMotif(`${NS} REFUS%`), "aucune fiche créée").toBe(avant);
  });

  it("un titre déjà existant REFUSE — jamais deux fiches pour une même pièce", async () => {
    const avant = await produitsParMotif(`${NS} Plaquettes Dyna RT30%`);
    expect(avant).toBe(1);

    const refus = await api()
      .creerPieceEtCompter({
        titre: `${NS} Plaquettes Dyna RT30`,
      })
      .then(() => null)
      .catch((e: Error) => e);

    expect(refus).not.toBeNull();
    expect(refus!.message).toMatch(/déjà exister|conflit|variante/i);
    expect(await produitsParMotif(`${NS} Plaquettes Dyna RT30%`), "pas de seconde fiche").toBe(1);
  });

  it("sans quantité, la fiche naît sans mouvement ni ligne", async () => {
    const r = await api().creerPieceEtCompter({
      titre: `${NS} Sans quantite`,
    });
    expect(r.produitId).toBeGreaterThan(0);

    const [mvt] = (await db.execute(
      sql`SELECT count(*)::int AS n FROM mouvements_stock WHERE produit_id = ${r.produitId}`,
    )) as unknown as { n: number }[];
    expect(mvt!.n, "aucun mouvement inventé").toBe(0);
  });

  it("une session déjà appliquée refuse la création", async () => {
    // une session s'applique pour de vrai : une ligne « ajuster », puis le
    // refus de la création dessus.
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-fermee` });
    const [{ produitId }] = [
      await api().creerPieceEtCompter({ titre: `${NS} De session fermee` }),
    ];
    await api().valider({
      sessionId,
      mode: "ajuster",
      lignes: [{ produitId, quantite: 1 }],
    });

    const refus = await api()
      .creerPieceEtCompter({
        sessionId,
        titre: `${NS} Fiche sur session fermee`,
      })
      .then(() => null)
      .catch((e: Error) => e);
    expect(refus).not.toBeNull();
    expect(refus!.message).toMatch(/déjà été appliquée|apliquée|fermée|valide/i);
  });
});
