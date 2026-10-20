import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { enregistrerMouvement, TYPES_MOUVEMENT } from "~/server/lib/stock-engine";

/**
 * INVARIANT LOT C — TOUTE ÉCRITURE DE STOCK S'accorde AU JOURNAL.
 *
 * Depuis le Lot C, `enregistrerMouvement` (le MOTEUR) est le seul écrivain du
 * stock, appelé par TOUTES les routes : créations, réceptions, rejets,
 * annulations de vente. Ce test vérifie l'invariant qui rend le moteur
 * vérifiable une fois pour toutes :
 *
 *   pour un (produit, agence) donné, après N'IMPORTE QUELLE suite d'écritures,
 *   la quantité des tables `stocks` et `stocks_unites` égale exactement la
 *   somme nette du journal `mouvements_stock` (entrées moins sorties).
 *
 * Deux chemins NON couverts par d'autres tests sont ici pris par les DEUX
 * bouts :
 *   · `procurement.rejeterReception` — rejet d'une réception en contrôle
 *     (REJET_RECEPTION n'écrit plus par une mise à jour directe + INSERT à la
 *     main, mais par le moteur) ;
 *   · `sales.voidSale` — annulation d'une vente terminée (RETOUR_CLIENT
 *     ré-entre la quantité, la ligne d'unité incluse).
 */

vi.mock("@atelierone/auth", () => ({}));

const { salesRouter } = await import("~/server/api/routers/sales");
const { procurementRouter } = await import("~/server/api/routers/procurement");

const NS = `qjournal${Date.now().toString(36)}`;
const AGENCE = 1;

let userId = 0;
let produitRejet = 0;
let produitVente = 0;
let fournisseurId = 0;
let uniteId = "";
let bonId = 0;
let venteId = 0;

function ctx() {
  const user = {
    id: String(userId),
    name: "Q Journal",
    email: `${NS}@gpj.cm`,
    agenceId: AGENCE,
    agenceName: "GPJ",
    organizationId: String(AGENCE),
    role: "superadmin",
    permissions: ["achats.recevoir"],
    isActive: true,
    status: "active",
  };
  return {
    headers: new Headers(),
    user,
    session: { user, expires: "2099-01-01T00:00:00.000Z" },
  } as never;
}

/** La somme nette du journal (entrées moins sorties) pour un produit agence. */
async function netJournal(p: number, uniteOnly: boolean): Promise<number> {
  const filtreUnite = uniteOnly ? sql`AND unite_id = ${uniteId}` : sql``;
  const [r] = (await db.execute(
    sql`SELECT COALESCE(SUM(CASE WHEN sens = 'E' THEN quantite ELSE -quantite END), 0)::numeric AS net
          FROM mouvements_stock WHERE produit_id = ${p} AND agence_id = ${AGENCE} ${filtreUnite}`,
  )) as unknown as { net: string }[];
  return Number(r!.net);
}

async function stockTable(p: number): Promise<number> {
  const [r] = (await db.execute(
    sql`SELECT COALESCE(SUM(quantite), 0)::numeric AS q FROM stocks
         WHERE produit_id = ${p} AND agence_id = ${AGENCE}`,
  )) as unknown as { q: string }[];
  return Number(r!.q);
}

async function stockUnitesTable(p: number): Promise<number> {
  const [r] = (await db.execute(
    sql`SELECT COALESCE(SUM(quantite), 0)::numeric AS q FROM stocks_unites
         WHERE produit_id = ${p} AND agence_id = ${AGENCE} AND unite_id = ${uniteId}`,
  )) as unknown as { q: string }[];
  return Number(r!.q);
}

/**
 * L'INVARIANT — les tables dérivées égale le journal. Appelé après CHAQUE
 * écriture : une dérive localiserait encore l'écriture fautive.
 */
async function verifierInvariant(p: number, ou: string) {
  const net = await netJournal(p, false);
  expect(await stockTable(p), `${ou} — stocks = net du journal`).toBe(net);

  const netU = await netJournal(p, true);
  expect(await stockUnitesTable(p), `${ou} — stocks_unites = net du journal`).toBe(netU);
  return net;
}

/** Crée une variante de test et son unité de base (PCE, facteur 1). */
async function creerProduit(suffixe: string): Promise<number> {
  const [p] = (await db.execute(
    sql`INSERT INTO produits (code_barre, titre, type_produit, niveau, prix_vente, prix_achat,
                              seuil_alerte, seuil_critique)
          VALUES (${`${NS}-${suffixe}`}, ${`Produit test Q ${NS} ${suffixe}`}, 'PIECE', 'VARIANTE',
                  10000, 5000, 5, 2)
          RETURNING id`,
  )) as unknown as { id: number }[];
  const id = Number(p!.id);

  await db.execute(
    sql`INSERT INTO produit_unites (produit_id, unite_id, facteur_vers_base, est_unite_base)
          VALUES (${id}, ${uniteId}, 1, true)`,
  );
  return id;
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'Q', 'Journal', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`)) as unknown as { id: string }[];
  userId = Number(u!.id);

  // La CI part d'une base test fraîche : l'unité de base est ASSURÉE ici
  // (pattern upsert de stock-unites-base-migration), pas supposée existante.
  const [uPCE] = (await db.execute(
    sql`INSERT INTO unites_mesure (code, libelle, symbole, type, is_active)
          VALUES ('PCE', 'Pièce', 'pce', 'QUANTITE', true)
          ON CONFLICT (code) DO UPDATE SET is_active = true
          RETURNING id`,
  )) as unknown as { id: string }[];
  uniteId = uPCE!.id;

  produitRejet = await creerProduit("REJET");
  produitVente = await creerProduit("VENTE");

  const [n] = (await db.execute(
    sql`INSERT INTO fournisseurs (nom, code, is_active)
          VALUES (${`${NS}-Fournisseur Q`}, ${NS}, true) RETURNING id`,
  )) as unknown as { id: number }[];
  fournisseurId = Number(n!.id);
});

afterAll(async () => {
  // mouvements_stock est append-only et sa FK produits interdit de supprimer
  // une pièce qui porte des mouvements. Le produit est donc conservé et
  // simplement désactivé — ses miroirs (stocks, stocks_unites) restent
  // alignés sur le journal : la base de test reste un monde COHÉRENT.
  // ventes, bons, pertes et fournisseurs, eux, n'ont rien d'historique à
  // garder : ils partent.
  await db.execute(sql`DELETE FROM ventes_lignes WHERE vente_id = ${venteId}`);
  await db.execute(sql`DELETE FROM ventes WHERE id = ${venteId}`);
  await db.execute(sql`DELETE FROM pertes_financieres WHERE reference = ${`${NS}-BR`}`);
  await db.execute(sql`DELETE FROM lignes_bon_reception WHERE bon_reception_id = ${bonId}`);
  await db.execute(sql`DELETE FROM bons_reception WHERE id = ${bonId}`);
  await db.execute(sql`UPDATE produits SET is_active = false WHERE id IN (${produitRejet}, ${produitVente})`);
  await db.execute(sql`DELETE FROM fournisseurs WHERE id = ${fournisseurId}`);
});

describe("Q — toute écriture s'accorde au journal", () => {
  it("un rejet de réception écrit S dans le journal et la table, plus rien ailleurs", async () => {
    const p = produitRejet;

    // Phase « réception » honnête : l'entrée est passée PAR LE MOTEUR, comme
    // `procurement.receive` le fait depuis le Lot C. Puis `rejeterReception`
    // sort la quantité — et ce test vérifie qu'il n'existe qu'UN écrivain.
    await enregistrerMouvement(db, {
      type: TYPES_MOUVEMENT.ACHAT_RECEPTION,
      sens: "E",
      produitId: p,
      agenceId: AGENCE,
      quantite: 2,
      coutUnitaireBase: 5000,
      reference: `${NS}-BR`,
      referenceType: "BON_RECEPTION",
      motif: "Réception Q",
      effectuePar: userId,
    });
    await verifierInvariant(p, "après la réception");

    const [b] = (await db.execute(
      sql`INSERT INTO bons_reception (fournisseur_id, agence_id, reference, statut)
            VALUES (${fournisseurId}, ${AGENCE}, ${`${NS}-BR`}, 'en_controle')
            RETURNING id`,
    )) as unknown as { id: number }[];
    bonId = Number(b!.id);

    await db.execute(
      sql`INSERT INTO lignes_bon_reception (bon_reception_id, produit_id, quantite_commandee, quantite_recue, prix_unitaire)
            VALUES (${bonId}, ${p}, 2, 2, 5000)`,
    );

    await procurementRouter.createCaller(ctx()).rejeterReception({ id: String(bonId), motifRejet: "Contrôle qualité" });

    const netApresRejet = await verifierInvariant(p, "après le rejet");
    expect(netApresRejet).toBe(0); // E(2) puis S(2) — retombe à zéro

    const [m] = (await db.execute(
      sql`SELECT count(*)::int AS n FROM mouvements_stock
           WHERE produit_id = ${p} AND agence_id = ${AGENCE}
             AND type = 'REJET_RECEPTION' AND sens = 'S'`,
    )) as unknown as { n: number }[];
    expect(m!.n).toBe(1);

    const [st] = (await db.execute(
      sql`SELECT statut::text AS s FROM bons_reception WHERE id = ${bonId}`,
    )) as unknown as { s: string }[];
    expect(st!.s).toBe("rejetee");
  });

  it("une vente annulée ré-entre la quantité, ligne et unité incluses", async () => {
    const p = produitVente;

    // État d'entrée : le stock arrivé PAR LE MOTEUR.
    await enregistrerMouvement(db, {
      type: TYPES_MOUVEMENT.INITIAL_RECEIPT,
      sens: "E",
      produitId: p,
      agenceId: AGENCE,
      quantite: 2,
      uniteId,
      coutUnitaireBase: 5000,
      motif: "Stock initial Q",
      effectuePar: userId,
      synchroniserStocksUnites: true,
    });
    await verifierInvariant(p, "après le stock initial");

    // La sortie de vente est journalisée par le moteur, comme toute vente des
    // routes principales — l'annulation ne devra restituer que ce qui est parti.
    await enregistrerMouvement(db, {
      type: TYPES_MOUVEMENT.VENTE,
      sens: "S",
      produitId: p,
      agenceId: AGENCE,
      quantite: 1,
      uniteId,
      motif: "Vente Q",
      effectuePar: userId,
      synchroniserStocksUnites: true,
    });
    await verifierInvariant(p, "après la sortie de vente");

    const [v] = (await db.execute(
      sql`INSERT INTO ventes (agence_id, reference, operateur_id, montant_total, statut)
            VALUES (${AGENCE}, ${`${NS}-V1`}, ${userId}, '0', 'termine') RETURNING id`,
    )) as unknown as { id: number }[];
    venteId = Number(v!.id);

    await db.execute(
      sql`INSERT INTO ventes_lignes (vente_id, produit_id, quantite, prix_unitaire, facteur_conversion, unite_id)
            VALUES (${venteId}, ${p}, 1, 10000, 1, ${uniteId})`,
    );

    await salesRouter.createCaller(ctx()).voidSale({
      venteId: String(venteId),
      motif: "Erreur opérateur",
    });

    // E(2 stock initial) − S(1 vente) + E(1 annulation) = 2, sur le journal ET
    // les deux tables dérivées.
    const fin = await verifierInvariant(p, "après l'annulation");
    expect(fin).toBe(2);
    expect(await stockTable(p)).toBe(2);
    expect(await stockUnitesTable(p)).toBe(2);

    const [m] = (await db.execute(
      sql`SELECT count(*)::int AS n FROM mouvements_stock
           WHERE produit_id = ${p} AND agence_id = ${AGENCE}
             AND type = 'RETOUR_CLIENT' AND sens = 'E'
             AND reference_type = 'ANNULATION' AND reference = ${`${NS}-V1`}`,
    )) as unknown as { n: number }[];
    expect(m!.n).toBe(1);

    const [statutVente] = (await db.execute(
      sql`SELECT statut::text AS s FROM ventes WHERE id = ${venteId}`,
    )) as unknown as { s: string }[];
    expect(statutVente!.s).toBe("annule");
  });
});
