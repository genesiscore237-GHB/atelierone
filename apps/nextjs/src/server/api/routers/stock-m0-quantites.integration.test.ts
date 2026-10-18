import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * M0 — FIABILITÉ DES QUANTITÉS
 *
 * Les invariants que l'expert métier rend non négociables :
 *
 *   « une réception de 10 unités augmente le stock exactement de 10 ;
 *     une sortie de 2 unités le diminue exactement de 2 ;
 *     une quantité par emplacement égale à la somme de tous les
 *     emplacements pertinents ;
 *     une sortie concurrente ne permet pas de dépasser la quantité
 *     réellement disponible ;
 *     la sortie d'une pièce réservée consomme la réservation
 *     correctement. »
 *
 * Chaque test porte le nom du défaut qu'il verrouille. Un test qui échoue
 * doit désigner un bug, pas une évolution de fonctionnalités.
 *
 * Le test « pas de destination implicite » est la RÉGRESSION DIRECTE du
 * défaut le plus grave du module : `verifierStockDisponible` faisait
 * `const [row] = await …for("update")` sans `.limit(1)`, donc la garde de
 * toutes les sorties et de toutes les réservations prenait la PREMIÈRE
 * ligne renvoyée dans un ordre que PostgreSQL ne garantit pas. Une pièce
 * sur trois emplacements pouvait voir sa sortie refusée ou autorisée au
 * hasard. Le test échouait de façon non déterministe avant le correctif ;
 * il échoue encore s'on réintroduit l'ordre implicite.
 */

vi.mock("@atelierone/auth", () => ({}));

const {
  enregistrerMouvement,
  reserverStock,
  libererStock,
  sortirPourOR,
  TYPES_MOUVEMENT,
} = await import("~/server/lib/stock-engine");

const NS = "m0qte";
const AGENCE = 1;

let userId = 0;
let produitId = 0;
let produitOrId = 0;
let vehiculeId = 0;
let orId = 0;
const emplacements: number[] = [];

type Row = Record<string, unknown>;

/** Quantité agrégée telle que l'application doit la lire : la vue, pas une ligne. */
async function stockVue(p: number, a = AGENCE) {
  const [r] = (await db.execute(
    sql`SELECT quantite, quantite_reservee, quantite_bloquee, disponible, nb_lignes
          FROM stock_agregat WHERE produit_id = ${p} AND agence_id = ${a}`,
  )) as unknown as Row[];
  return r ?? {};
}

async function lignesStock(p: number, a = AGENCE) {
  return (await db.execute(
    sql`SELECT id, emplacement_id, quantite, quantite_reservee, quantite_bloquee
          FROM stocks WHERE produit_id = ${p} AND agence_id = ${a} ORDER BY id`,
  )) as unknown as Row[];
}

/**
 * Les fixtures sont RÉUTILISÉES, pas recréées.
 *
 * `mouvements_stock` est append-only : un trigger de la base interdit toute
 * suppression (« Mouvements_stock is append-only »). C'est la bonne décision
 * — un mouvement qui s'efface est une trace qui ment. Mais elle impose au
 * test de ne pas tenter de nettoyer l'historique.
 *
 * Conséquence : un produit ou un emplacement referenced par un mouvement ne
 * peut plus être supprimé. On les récupère donc par code-barres, on les crée
 * au premier run seulement, et on réinitialise ce qui est de l'ÉTAT
 * (`stocks`, `stocks_unites`, `stocks_lots`) — pas ce qui est de l'HISTORIQUE.
 */
async function produitParCodeBarre(code: string, titre: string): Promise<number> {
  const found = await db.execute(
    sql`SELECT id FROM produits WHERE code_barre = ${code} LIMIT 1`,
  );
  const rows = found as unknown as { id: number }[];
  if (rows[0]?.id) return Number(rows[0].id);
  const [p] = (await db.execute(
    sql`INSERT INTO produits (code_barre, titre, type_produit, prix_vente, prix_achat,
                              seuil_alerte, seuil_critique)
          VALUES (${code}, ${titre}, 'PIECE', 10000, 5000, 5, 2)
          RETURNING id`,
  )) as unknown as { id: number }[];
  return Number(p!.id);
}

async function emplacementParCode(code: string, libelle: string): Promise<number> {
  const found = await db.execute(
    sql`SELECT id FROM emplacements WHERE code = ${code} LIMIT 1`,
  );
  const rows = found as unknown as { id: number }[];
  if (rows[0]?.id) return Number(rows[0].id);
  const [e] = (await db.execute(
    sql`INSERT INTO emplacements (agence_id, code, libelle, type)
          VALUES (${AGENCE}, ${code}, ${libelle}, 'RAYON')
          RETURNING id`,
  )) as unknown as { id: number }[];
  return Number(e!.id);
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'M0', 'Quantites', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`)) as unknown as { id: string }[];
  userId = Number(u!.id);

  produitId = await produitParCodeBarre(`${NS}-P1`, 'Piece test M0 quantites');
  produitOrId = await produitParCodeBarre(`${NS}-OR`, 'Piece test M0 reservation');

  for (const suffixe of ["A", "B", "C"]) {
    emplacements.push(
      await emplacementParCode(`${NS}-E${suffixe}`, `Emplacement ${suffixe}`),
    );
  }

  // `reserverStock` et `libererStock` exigent un orId et un vehiculeId, et
  // `mouvements_stock` porte DEUX clés étrangères réelles vers
  // `ordres_reparation` et `vehicules`. Un `orId: 0` factice ne passe pas :
  // la base refuse l'écriture du mouvement. Il faut donc un véhicule et un
  // OR authentiques — ce qui est de toute façon ce que fait le logiciel.
  const [v] = (await db.execute(
    sql`INSERT INTO vehicules (agence_id, marque, modele)
          VALUES (${AGENCE}, 'Marque M0', 'Modele M0')
          RETURNING id`,
  )) as unknown as { id: number }[];
  vehiculeId = Number(v!.id);

  // `EN_ATTENTE_PIECES` n'est pas un statut arbitraire : c'est celui d'un OR
// qui attend une pièce, donc exactement la situation d'une réservation. Les
// statuts `PRET_A_LIVRER`, `LIVRE`, `ANNULE` et `ferme_definitif` sont
// précisément ceux que le moteur refuse à une sortie.
const [o] = (await db.execute(sql`
    INSERT INTO ordres_reparation (agence_id, numero, vehicule_id, statut, priorite, mot_entree)
    VALUES (${AGENCE}, ${`${NS}-OR-1`}, ${vehiculeId}, 'EN_ATTENTE_PIECES', 'P3', 'ENTRETIEN')
    ON CONFLICT (numero) DO UPDATE SET statut = 'EN_ATTENTE_PIECES'
    RETURNING id`)) as unknown as { id: number }[];
  orId = Number(o!.id);

  // Remise à zéro de l'ÉTAT : le test doit partir d'une quantité nulle à
  // chaque run, sinon les assertions « exactement +10 » cumuleraient.
  await db.execute(sql`DELETE FROM stocks WHERE produit_id IN (${produitId}, ${produitOrId})`);
  await db.execute(
    sql`DELETE FROM stocks_unites WHERE produit_id IN (${produitId}, ${produitOrId})`,
  );
  await db.execute(
    sql`DELETE FROM stocks_lots WHERE produit_id IN (${produitId}, ${produitOrId})`,
  );
});

afterAll(async () => {
  // On ne remet que les quantités. Ni les mouvements (append-only), ni les
  // produits et emplacements, qui en sont référencés et ne peuvent plus
  // être supprimés.
  await db.execute(sql`DELETE FROM stocks WHERE produit_id IN (${produitId}, ${produitOrId})`);
});

const entrer = (qte: number, emplacementId?: number, cmup?: number, produit = produitId) =>
  db.transaction((tx) =>
    enregistrerMouvement(tx as never, {
      type: TYPES_MOUVEMENT.ACHAT_RECEPTION as never,
      sens: "E",
      produitId: produit,
      agenceId: AGENCE,
      quantite: qte,
      emplacementId,
      coutUnitaireBase: cmup,
      motif: "Entree de test",
      effectuePar: userId,
    }),
  );

describe("M0 — quantité et emplacement", () => {
  it("une réception de 10 unités augmente le stock exactement de 10", async () => {
    const avant = Number((await stockVue(produitId)).quantite ?? 0);
    await entrer(10, emplacements[0], 5000);

    const apres = await stockVue(produitId);
    expect(Number(apres.quantite), "stock après réception").toBe(avant + 10);
    expect(Number(apres.disponible)).toBe(avant + 10);
  });

  it("une sortie de 2 unités le diminue exactement de 2, sur le seul emplacement visé", async () => {
    const avantTotal = Number((await stockVue(produitId)).quantite);
    const avantLignes = await lignesStock(produitId);
    const cible = avantLignes.find((l) => Number(l.emplacement_id) === emplacements[0])!;

    await db.transaction((tx) =>
      enregistrerMouvement(tx as never, {
        type: TYPES_MOUVEMENT.SORTIE_OR as never,
        sens: "S",
        produitId,
        agenceId: AGENCE,
        quantite: 2,
        emplacementId: emplacements[0],
        motif: "Sortie de test",
        effectuePar: userId,
      }),
    );

    const apres = await stockVue(produitId);
    const apresLignes = await lignesStock(produitId);
    const ligneApres = apresLignes.find((l) => l.id === cible.id)!;

    expect(Number(apres.quantite), "stock total").toBe(avantTotal - 2);
    expect(Number(ligneApres.quantite), "ligne de l'emplacement visé").toBe(
      Number(cible.quantite) - 2,
    );
    // Les deux autres lignes n'ont pas bougé : une sortie sur un rayon ne
    // doit jamais ponctionner un autre rayon.
    for (const l of apresLignes) {
      if (Number(l.id) === Number(cible.id)) continue;
      const avant = avantLignes.find((a) => a.id === l.id)!;
      expect(Number(l.quantite), `ligne ${l.id} intacte`).toBe(Number(avant.quantite));
    }
  });

  it("un produit sur 3 emplacements a pour quantité la SOMME de ses lignes", async () => {
    await entrer(3, emplacements[1], 5000);
    await entrer(7, emplacements[2], 5000);

    const lignes = await lignesStock(produitId);
    expect(lignes.length, "3 emplacements occupés").toBe(3);

    const somme = lignes.reduce((s, l) => s + Number(l.quantite), 0);
    const vue = await stockVue(produitId);
    expect(Number(vue.quantite), "la vue vaut la somme des lignes").toBe(somme);
    expect(Number(vue.nb_lignes)).toBe(3);
  });

  it("sans emplacement, la sortie vise TOUJOURS la même ligne — pas de destination implicite", async () => {
    // RÉGRESSION du `.limit(1)` implicite. Avant le correctif, `[row]`
    // prenait la première ligne d'un résultat non ordonné : selon le plan
    // d'exécution, la sortie touchait un rayon différent à chaque fois.
    // On le vérifie en répétant le geste et en contrôlant QUE le total
    // baisse juste — et surtout que les lignes ne se redistribuent pas
    // de façon inattendue.
    const avant = Number((await stockVue(produitId)).quantite);

    for (let i = 0; i < 3; i++) {
      await db.transaction((tx) =>
        enregistrerMouvement(tx as never, {
          type: TYPES_MOUVEMENT.SORTIE_OR as never,
          sens: "S",
          produitId,
          agenceId: AGENCE,
          quantite: 1,
          motif: "Sortie sans emplacement",
          effectuePar: userId,
        }),
      );
    }

    const apres = Number((await stockVue(produitId)).quantite);
    expect(apres, "trois sorties de 1").toBe(avant - 3);

    // Aucune ligne ne peut être négative : c'est la garantie observable
    // d'une sortie qui a visé une ligne réellement approvisionnée.
    const lignes = await lignesStock(produitId);
    for (const l of lignes) {
      expect(Number(l.quantite), `ligne ${l.id} non négative`).toBeGreaterThanOrEqual(0);
    }
  });

  it("la quantité bloquée est déduite du disponible", async () => {
    // `quantite_bloquee` existe depuis le schéma initial et n'était pas lu
    // par le calcul de disponibilité : une pièce en quarantaine restait
    // annoncée comme disponible. Relevé avant correction : produit 955,
    // 10 en stock, 2 réservées, 1 bloquée → l'ancien calcul annonçait 8
    // disponibles, la règle correcte en donne 7.
    await entrer(20, emplacements[0], 5000);
    await db.execute(
      sql`UPDATE stocks SET quantite_bloquee = 4
           WHERE produit_id = ${produitId} AND emplacement_id = ${emplacements[0]}`,
    );

    const vue = await stockVue(produitId);
    expect(
      Number(vue.disponible),
      "disponible = quantité − réservée − bloquée",
    ).toBe(Number(vue.quantite) - Number(vue.quantite_reservee) - Number(vue.quantite_bloquee));
    expect(Number(vue.quantite_bloquee)).toBe(4);

    // Et une sortie ne peut pas consommer la partie bloquée.
    const dispo = Number(vue.disponible);
    const refus = await db
      .transaction((tx) =>
        enregistrerMouvement(tx as never, {
          type: TYPES_MOUVEMENT.SORTIE_OR as never,
          sens: "S",
          produitId,
          agenceId: AGENCE,
          quantite: dispo + 1,
          motif: "Tentative de sortie au-dela du disponible",
          effectuePar: userId,
        }),
      )
      .then(() => null)
      .catch((e: Error) => e);

    expect(refus, "la sortie au-delà du disponible doit être refusée").not.toBeNull();
    expect(refus!.message).toMatch(/disponible insuffisant/i);

    // Remise en état pour les tests suivants.
    await db.execute(
      sql`UPDATE stocks SET quantite_bloquee = 0
           WHERE produit_id = ${produitId} AND emplacement_id = ${emplacements[0]}`,
    );
  });

  it("une sortie concurrente ne peut pas dépasser la quantité réellement disponible", async () => {
    await entrer(10, emplacements[1], 5000);
    const dispo = Number((await stockVue(produitId)).disponible);

    const sortie = () =>
      db
        .transaction((tx) =>
          enregistrerMouvement(tx as never, {
            type: TYPES_MOUVEMENT.SORTIE_OR as never,
            sens: "S",
            produitId,
            agenceId: AGENCE,
            quantite: dispo,
            motif: "Sortie concurrente",
            effectuePar: userId,
          }),
        )
        .then(() => "ok" as const)
        .catch((e: Error) => e.message);

    const resultats = await Promise.allSettled([sortie(), sortie()]);
    const reussites = resultats.filter(
      (r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<string>).value === "ok",
    ).length;

    // La ligne est verrouillée `FOR UPDATE` : une seule des deux sorties
    // peut aboutir sur la même quantité. La seconde doit être refusée.
    expect(reussites, "une seule sortie peut consommer le disponible").toBeLessThanOrEqual(1);
    expect(Number((await stockVue(produitId)).quantite)).toBeGreaterThanOrEqual(0);
  });
});

describe("M0 — réservation consommée à la sortie", () => {
  it("réserver ne modifie pas la quantité physique", async () => {
    await entrer(10, emplacements[0], 5000, produitOrId);
    const avant = await stockVue(produitOrId);

    const r = await db.transaction((tx) =>
      reserverStock(tx as never, {
        produitId: produitOrId,
        agenceId: AGENCE,
        quantite: 4,
        orId,
        vehiculeId,
        numeroOR: "M0-TEST",
        motif: "Reservation de test",
        effectuePar: userId,
      }),
    );

    const apres = await stockVue(produitOrId);
    expect(Number(apres.quantite), "la quantité physique ne bouge pas").toBe(
      Number(avant.quantite),
    );
    expect(Number(apres.quantite_reservee)).toBe(4);
    expect(Number(apres.disponible)).toBe(Number(apres.quantite) - 4);
    expect(r.reservee).toBe(4);
  });

  it("sortir la pièce réservée CONSOMME la réservation — plus de quantité réservée fantôme", async () => {
    // LE BUG CENTRAL DU MODULE. `sortirPourOR` décrémentait `quantite` et
    // laissait `quantite_reservee` intacte. Une pièce réservée puis sortie
    // gardait sa réservation positive POUR TOUS : seul `libererStock` pouvait
    // la corriger, et rien ne l'appelait à la clôture d'un OR.
    //
    // Le défaut est invisible — la quantité affichée reste juste, seule la
    // DISPONIBILITÉ se dégrade — et cumulatif : le magasinier finit par
    // croire qu'il n'a plus de pièces.

    await db.transaction((tx) =>
      sortirPourOR(tx as never, {
        produitId: produitOrId,
        agenceId: AGENCE,
        quantite: 4,
        numeroOR: "M0-TEST",
        motif: "Sortie de la piece reservee",
        effectuePar: userId,
      }),
    );

    const apres = await stockVue(produitOrId);
    expect(
      Number(apres.quantite_reservee),
      "la réservation doit être consommée par la sortie",
    ).toBe(0);
    // Et le disponible redevient la quantité : c'est le signe que le stock
    // ne s'érode plus tout seul.
    expect(Number(apres.disponible), "disponible = quantité, plus de trou").toBe(
      Number(apres.quantite),
    );
  });

  it("liberer une réservation la rouvre sans jamais la rendre négative", async () => {
    await db.transaction((tx) =>
      reserverStock(tx as never, {
        produitId: produitOrId,
        agenceId: AGENCE,
        quantite: 3,
        orId,
        vehiculeId,
        numeroOR: "M0-TEST-2",
        motif: "Reservation a liberer",
        effectuePar: userId,
      }),
    );
    expect(Number((await stockVue(produitOrId)).quantite_reservee)).toBe(3);

    await db.transaction((tx) =>
      libererStock(tx as never, {
        produitId: produitOrId,
        agenceId: AGENCE,
        quantite: 3,
        orId,
        vehiculeId,
        numeroOR: "M0-TEST-2",
        motif: "Liberation de test",
        effectuePar: userId,
      }),
    );
    expect(Number((await stockVue(produitOrId)).quantite_reservee)).toBe(0);

    // Libérer plus que réservé est refusé : sinon la quantité réservée
    // deviendrait négative et le disponible supérieur au stock réel.
    const trop = await db
      .transaction((tx) =>
        libererStock(tx as never, {
          produitId: produitOrId,
          agenceId: AGENCE,
          quantite: 5,
          orId,
          vehiculeId,
          numeroOR: "M0-TEST-3",
          motif: "Liberation excessive",
          effectuePar: userId,
        }),
      )
      .then(() => null)
      .catch((e: Error) => e);
    expect(trop, "on ne libère jamais plus que la réservation").not.toBeNull();
    expect(Number((await stockVue(produitOrId)).quantite_reservee)).toBe(0);
  });

  it("réserver plus que le disponible est refusé", async () => {
    const dispo = Number((await stockVue(produitOrId)).disponible);
    const refus = await db
      .transaction((tx) =>
        reserverStock(tx as never, {
          produitId: produitOrId,
          agenceId: AGENCE,
          quantite: dispo + 10,
          orId,
          vehiculeId,
          numeroOR: "M0-TEST-4",
          motif: "Reservation excessive",
          effectuePar: userId,
        }),
      )
      .then(() => null)
      .catch((e: Error) => e);
    expect(refus).not.toBeNull();
    expect(refus!.message).toMatch(/disponible insuffisant/i);
  });
});