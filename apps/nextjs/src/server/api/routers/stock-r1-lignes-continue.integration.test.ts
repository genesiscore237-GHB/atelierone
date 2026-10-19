import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * ÉTAPE 1 DU LOT 1 — UNE LIGNE SAISIE SURVIT À L'ÉCRAN FERMÉ.
 *
 * Le recensement gardeait les lignes en mémoire de réact (useState) : la
 * page fermée, la ligne disparaissait — et avec elle le comptage fait sur
 * site, parfois avec la pièce entre les mains. `lignesSession` elle-même ne
 * rendait que des lignes déjà VALIDÉES (`inventaires`), ce qui rendait la
 * reprise d'une session en cours techniquement impossible.
 *
 * Le contrat que ces tests verrouillent :
 *
 *   · `enregistrerLigne` écrit la ligne SUR LE CHAMP, et la relecture la
 *     retrouve — écran fermé, réact réinitialisé, peu importe ;
 *   · ressaisir la même (produit, emplacement, lot) remplace la valeur
 *     précédente : on corrige un comptage, on n'empile pas ;
 *   · deux emplacements différents font deux lignes distinctes ;
 *   · `retirerLigne` fait disparaître une ligne mal comptée ;
 *   · ajouter une ligne à une session déjà appliquée est REFUSÉ (le rejeu
 *     doublerait les mouvements) ;
 *   · `valider` consomme les lignes persistées : le stock est ajusté et la
 *     relit de la session rend les lignes APPLIQUÉES, plus une seule fois
 *     chacune.
 */

vi.mock("@atelierone/auth", () => ({}));

const { stockRecensementRouter } = await import("~/server/api/routers/stock-recensement");

const NS = "r1lignes";
const AGENCE = 1;

let userId = 0;
let produitPrincipal = 0;
let produitSecond = 0;
let emplMagasin = 0;
let emplBureau = 0;

function ctx() {
  const user = {
    id: String(userId),
    name: "Lignes persistees",
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

async function produitParCodeBarre(code: string, titre: string): Promise<number> {
  const found = await db.execute(sql`SELECT id FROM produits WHERE code_barre = ${code} LIMIT 1`);
  const rows = found as unknown as { id: number }[];
  if (rows[0]?.id) return Number(rows[0].id);
  const [p] = (await db.execute(
    sql`INSERT INTO produits (code_barre, titre, type_produit, prix_vente, prix_achat, seuil_alerte, seuil_critique)
        VALUES (${code}, ${titre}, 'PIECE', 10000, 5000, 5, 2)
        RETURNING id`,
  )) as unknown as { id: number }[];
  return Number(p!.id);
}

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

async function stockVue(produitId: number, agenceId = AGENCE) {
  const [r] = (await db.execute(
    sql`SELECT quantite FROM stock_agregat
          WHERE produit_id = ${produitId} AND agence_id = ${agenceId}`,
  )) as unknown as { quantite: string }[];
  return r ? Number(r.quantite) : 0;
}

async function supprimerTout() {
  // les lignes de recensement prennent et laissent la place : aucune trace.
  // Tolérant tant que la table n'existe pas (le test DOIT aussi partir d'une
  // base à l'état zéro).
  try {
    await db.execute(sql`DELETE FROM recensement_lignes WHERE session_id IN (
        SELECT id FROM inventaires_sessions WHERE libelle LIKE ${`${NS}-%`})`);
  } catch {
    /* table pas encore créée — comportement rouge attendu */
  }
  await db.execute(sql`DELETE FROM inventaires WHERE produit_id IN (
        SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`);
  await db.execute(sql`DELETE FROM stocks WHERE produit_id IN (
        SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`);
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'R1', 'Lignes', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`)) as unknown as { id: string }[];
  userId = Number(u!.id);

  produitPrincipal = await produitParCodeBarre(`${NS}-P1`, "Filtre a air Toyota");
  produitSecond = await produitParCodeBarre(`${NS}-P2`, "Plaquettes avant Yaris");
  emplMagasin = await emplacementParCode(`${NS}-MAG`, "Magasin comptage");
  emplBureau = await emplacementParCode(`${NS}-BUREAU`, "Bureau comptage");

  await supprimerTout();
});

afterAll(supprimerTout);

describe("R1 — la ligne saisie survit à l'écran fermé", () => {
  it("enregistrerLigne écrit tout de suite, lignesSession la retrouve", async () => {
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-survive` });

    const r = await api().enregistrerLigne({
      sessionId,
      ligne: {
        produitId: produitPrincipal,
        emplacementId: emplMagasin,
        quantite: 8,
        uniteId: null,
        lotId: null,
        prixAchat: 2500,
        note: "compte derrière l'établi",
      },
    });
    expect(Number(r.ligneId)).toBeGreaterThan(0);
    expect(r.totalLignes).toBe(1);

    // La relecture — équivalent exact de rouvrir l'écran.
    const relues = await api().lignesSession({ sessionId });
    expect(relues.length).toBe(1);
    const l = relues[0]!;
    expect(l.produitId).toBe(produitPrincipal);
    expect(Number(l.quantiteReelle)).toBe(8);
    expect(Number(l.emplacementId)).toBe(emplMagasin);
    expect(l.note).toContain("établi");
    expect(Number(l.prixAchat)).toBe(2500);
  });

  it("ressaisir la même clé (produit, emplacement) corrige la ligne, sans duplicata", async () => {
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-correction` });
    await api().enregistrerLigne({
      sessionId,
      ligne: { produitId: produitPrincipal, emplacementId: emplMagasin, quantite: 8 },
    });
    await api().enregistrerLigne({
      sessionId,
      ligne: { produitId: produitPrincipal, emplacementId: emplMagasin, quantite: 12 },
    });

    const relues = await api().lignesSession({ sessionId });
    const duProduit = relues.filter((l) => l.produitId === produitPrincipal && l.emplacementId === emplMagasin);
    expect(duProduit.length, "seulement UNE ligne par clé").toBe(1);
    expect(Number(duProduit[0]!.quantiteReelle), "la valeur finale gagne").toBe(12);
    expect(relues.length).toBe(1);
  });

  it("deux emplacements différents font deux lignes distinctes", async () => {
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-deux-lieux` });
    await api().enregistrerLigne({
      sessionId,
      ligne: { produitId: produitPrincipal, emplacementId: emplMagasin, quantite: 4 },
    });
    await api().enregistrerLigne({
      sessionId,
      ligne: { produitId: produitPrincipal, emplacementId: emplBureau, quantite: 3 },
    });

    const relues = await api().lignesSession({ sessionId });
    expect(relues.length).toBe(2);
  });

  it("retirerLigne supprime la ligne persistée", async () => {
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-retirer` });
    const r = await api().enregistrerLigne({
      sessionId,
      ligne: { produitId: produitPrincipal, quantite: 7 },
    });
    await api().retirerLigne({ ligneId: Number(r.ligneId) });

    const relues = await api().lignesSession({ sessionId });
    expect(relues.length, "la ligne mal comptée disparaît").toBe(0);
  });

  it("refuse d'ajouter une ligne à une session déjà appliquée", async () => {
    // Le verrou porte sur « ajuster » : la session passe alors à « valide ».
    // « constater » au contraire laisse la session ouverte pour continuer
    // à compter — c'est son but.
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-fermee` });
    await api().valider({
      sessionId,
      mode: "ajuster",
      lignes: [{ produitId: produitPrincipal, quantite: 2 }],
    });

    const refus = await api()
      .enregistrerLigne({
        sessionId,
        ligne: { produitId: produitSecond, quantite: 5 },
      })
      .then(() => null)
      .catch((e: Error) => e);

    expect(refus, "une session appliquée n'accepte plus de lignes").not.toBeNull();
    expect(refus!.message).toMatch(/déjà été appliquée|apliquée|fermée|valide/i);
  });
});

describe("R1 — valider consomme les lignes enregistrées", () => {
  it("applique les lignes persistées puis n'en rend qu'une copie appliquée", async () => {
    // produitSecond : aucun autre test n'écrit dans son stock — son écart
    // reste donc du comptage pur (théorique 0).
    const { sessionId } = await api().ouvrirSession({ libelle: `${NS}-valider` });
    await api().enregistrerLigne({
      sessionId,
      ligne: { produitId: produitSecond, emplacementId: emplMagasin, quantite: 15, prixAchat: 500 },
    });

    const relues = await api().lignesSession({ sessionId });
    expect(relues.length).toBe(1);

    // L'écran mappe ses lignes relues vers l'input de valider — c'est
    // exactement ce que fera l'UI de reprise.
    const lignesValider = relues.map((l) => ({
      produitId: l.produitId,
      emplacementId: l.emplacementId,
      lotId: l.lotId,
      quantite: Number(l.quantiteReelle),
      uniteId: l.uniteId,
      prixAchat: l.prixAchat != null ? Number(l.prixAchat) : null,
      note: l.note,
    }));

    const r = await api().valider({ sessionId, mode: "ajuster", lignes: lignesValider });
    expect(r.ecroutes).toBe(1);
    expect(await stockVue(produitSecond), "le comptage est entré dans le stock").toBe(15);

    // Reprendre la session ne doit riEN retarder ni la doubler : les lignes
    // en attente sont consommées et l'on ne voit que la trace appliquée.
    const relit = await api().lignesSession({ sessionId });
    expect(relit.length, "chaque ligne exactement une fois après validation").toBe(1);
    const ecart = Number(relit[0]!.ecart);
    expect(ecart, "l'écart calculé à la validation").toBe(15);
  });
});
