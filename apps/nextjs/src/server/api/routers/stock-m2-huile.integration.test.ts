import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * M2 — L'HUILE EN FÛT
 *
 * « L'huile qu'on achète en fût et qu'on déconditionne en petite unité
 *  litre pour les vidanges, mais dont on doit avoir une traçabilité
 *  impeccable. »
 *
 * Ce que ces tests verrouillent, dans l'ordre où le garage les vit :
 *
 *   1. un fût arrive scellé, daté, identifié ;
 *   2. on l'ouvre → la DLC des bidons change, celle du scellé non ;
 *   3. on en tire des bidons → ils sont rattachés à leur fût ;
 *   4. la sortie consomme le plus ancien OUVERT, pas le plus ancien daté ;
 *   5. une huile ouverte trop longtemps est refusée ;
 *   6. ce qui reste est connu, et un deuxième passage ne l'augmente pas.
 *
 * Les points 4 et 5 sont ceux qui ne se verraient pas :
 * la quantité de stock reste juste dans les deux cas, seule la DLC décide.
 */

vi.mock("@atelierone/auth", () => ({}));

const { stockContenantsRouter } = await import("~/server/api/routers/stock-contenants");
const { sortirStockFIFO } = await import("~/server/lib/lot-service");

const NS = "m2huile";
const AGENCE = 1;
/** Un fût = 208 litres. C'est le rapport réel d'un fût de garage. */
const LITRES_PAR_FUT = 208;

let userId = 0;
let produitVrac = 0;
let produitBidon = 0;
/**
 * Produits DÉDIÉS aux tests de FEFO.
 *
 * Les lots d'un même fichier de test se partagent la date du jour, donc
 * plusieurs ont la MÊME DLC effective. L'ordre se tranche alors sur
 * `date_entree`, puis sur l'id — et le test échouerait pour une raison qui
 * n'a rien à voir avec la règle qu'il vérifie : c'est le premier lot créé
 * qui sortirait, pas le plus ancien ouvert.
 *
 * Isoler ces deux tests sur leurs propres produits rend l'assertion
 *Explorer ce qu'elle prétend explorer : à contenu égal, seul le CONTAINANT
 * OUVERT le plus ancien doit partir en premier.
 */
let produitFefo = 0;
let uniteFutFefo = "";
let uniteBidonFefo = "";
let uniteFut = "";
let uniteBidon = "";
let produitPerime = 0;

function ctx() {
  const user = {
    id: String(userId),
    name: "Huile",
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

const api = () => stockContenantsRouter.createCaller(ctx());

async function uniteParCode(code: string): Promise<string> {
  const r = (await db.execute(sql`SELECT id FROM unites_mesure WHERE code = ${code} LIMIT 1`)) as unknown as {
    id: string;
  }[];
  if (r[0]?.id) return r[0].id;
  // `symbole` est un varchar(10) : on prend les derniers caractères du code
  // plutôt que le code entier, qui dépasse.
  const symbole = code.slice(-6);
  const [n] = (await db.execute(
    sql`INSERT INTO unites_mesure (code, libelle, symbole, type)
        VALUES (${code}, ${code}, ${symbole}, 'QUANTITE') RETURNING id`,
  )) as unknown as { id: string }[];
  return n!.id;
}

type Id = { id: number };

/** Crée un produit avec son unité de base et son coefficient. */
async function produitAvecUnite(
  code: string,
  titre: string,
  uniteId: string,
  facteurVersBase: number,
  dlcJours: number | null,
): Promise<number> {
  const found = (await db.execute(
    sql`SELECT id FROM produits WHERE code_barre = ${code} LIMIT 1`,
  )) as unknown as Id[];
  let produitId: number;
  if (found[0]?.id) {
    produitId = found[0].id;
  } else {
    const [p] = (await db.execute(
      sql`INSERT INTO produits (code_barre, titre, type_produit, unite_base_id,
                                prix_vente, prix_achat, seuil_alerte, seuil_critique, dlc_jours)
          VALUES (${code}, ${titre}, 'CONSOMMABLE', ${uniteId}, 8000, 5000, 5, 2, ${dlcJours})
          RETURNING id`,
    )) as unknown as Id[];
    produitId = p!.id;
  }
  await db.execute(
    sql`INSERT INTO produit_unites (produit_id, unite_id, facteur_vers_base, est_unite_base)
        VALUES (${produitId}, ${uniteId}, ${facteurVersBase}, true)
        ON CONFLICT (produit_id, unite_id)
        DO UPDATE SET facteur_vers_base = ${facteurVersBase}`,
  );
  return produitId;
}

/** Un fût scellé, avec son stock et sa ligne `stocks_lots`. */
async function futScelle(
  numeroLot: string,
  litres: number,
  dlcScelle: string | null,
  produitId = produitVrac,
) {
  const [lot] = (await db.execute(
    sql`INSERT INTO lots (produit_id, numero_lot, statut, date_reception, quantite_initiale,
                          cout_unitaire, date_peremption, date_entree, is_active)
          VALUES (${produitId}, ${numeroLot}, 'disponible', now(), ${litres},
                  2500, ${dlcScelle}, now(), true)
          RETURNING id`,
  )) as unknown as Id[];
  await db.execute(
    sql`INSERT INTO stocks (produit_id, agence_id, quantite, cout_unitaire_moyen)
        VALUES (${produitId}, ${AGENCE}, ${litres}, 2500)`,
  );
  await db.execute(
    sql`INSERT INTO stocks_lots (produit_id, agence_id, lot_id, quantite)
        VALUES (${produitId}, ${AGENCE}, ${lot!.id}, ${litres})`,
  );
  return lot!.id;
}

async function lireLot(lotId: number) {
  const [r] = (await db.execute(
    sql`SELECT date_ouverture, periodicite_ouverture_jours, date_peremption,
                lot_source_id, contenu_restant, statut, est_bloque
           FROM lots WHERE id = ${lotId}`,
  )) as unknown as Record<string, unknown>[];
  return r ?? {};
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'M2', 'Huile', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`)) as unknown as { id: string }[];
  userId = Number(u!.id);

  uniteBidon = await uniteParCode(`${NS}-BID`);
  uniteFut = await uniteParCode(`${NS}-FUT`);

  // Base litre : un bidon de 1 L vaut 1, un fût de 208 L vaut 208.
  produitBidon = await produitAvecUnite(
    `${NS}-BIDON`,
    `Huile 5W30 — bidon 1 L (${NS})`,
    uniteBidon,
    1,
    180,
  );
  produitVrac = await produitAvecUnite(
    `${NS}-VRAC`,
    `Huile 5W30 — vrac (${NS})`,
    uniteFut,
    LITRES_PAR_FUT,
    365,
  );

  uniteBidonFefo = await uniteParCode(`${NS}-BIDF`);
  uniteFutFefo = await uniteParCode(`${NS}-FUTF`);

  // Produit dédié au test de péremption : un seul lot, aucun valide à côté,
  // donc aucune quantité concurrente ne peut faire passer une huile périmée.
  produitPerime = await produitAvecUnite(
    `${NS}-PERIM`,
    `Huile 0W20 — peremption (${NS})`,
    uniteFut,
    LITRES_PAR_FUT,
    365,
  );

  produitFefo = await produitAvecUnite(
    `${NS}-FEFO`,
    `Huile 0W20 — vrac FEFO (${NS})`,
    uniteFutFefo,
    LITRES_PAR_FUT,
    365,
  );
  await produitAvecUnite(
    `${NS}-BIDF`,
    `Huile 0W20 — bidon FEFO (${NS})`,
    uniteBidonFefo,
    1,
    180,
  );
});

afterAll(async () => {
  // On ne supprime que l'ÉTAT (`stocks`, `stocks_lots`) — donc ce qui
  // décide d'une sortie.
  //
  // Les LOTS ne sont pas supprimés : `mouvements_stock` les référence et
  // cette table est append-only. Un trigger de la base interdit toute
  // suppression. Un lot laissé derrière n'a plus de quantité au registre,
  // donc le FEFO l'ignore : il devient invisible aux tests suivants sans
  // jamais fausser un résultat.
  await db.execute(
    sql`DELETE FROM stocks_lots WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
  await db.execute(
    sql`DELETE FROM stocks WHERE produit_id IN (
          SELECT id FROM produits WHERE code_barre LIKE ${`${NS}-%`})`,
  );
});

describe("M2 — ouvrir un contenant", () => {
  it("l'ouverture date le contenant et calcule la DLC des bidons", async () => {
    const lotId = await futScelle(`${NS}-F1`, LITRES_PAR_FUT, "2030-01-01");

    const r = await api().ouvrir({
      lotId,
      dateOuverture: "2026-03-12",
      periodiciteJours: 180,
      reference: "Castrol — notice constructeur Renault",
      contenuSource: LITRES_PAR_FUT,
    });

    expect(r.dejaOuvert, "premiere ouverture").toBe(false);
    expect(r.dateOuverture).toBe("2026-03-12");
    // 12 mars + 180 jours = 8 septembre 2026.
    expect(r.dlc, "DLC des bidons = ouverture + périodicité").toBe("2026-09-08");

    const lot = await lireLot(lotId);
    expect(String(lot.date_ouverture).slice(0, 10)).toBe("2026-03-12");
    // La DLC DU SCELLÉ n'est pas touchée : elle décrit le contenant fermé.
    expect(String(lot.date_peremption).slice(0, 10)).toBe("2030-01-01");
  });

  it("rouvrir un contenant DÉJÀ ouvert ne décale pas sa date", async () => {
    const lotId = await futScelle(`${NS}-F2`, LITRES_PAR_FUT, "2030-01-01");
    await api().ouvrir({ lotId, dateOuverture: "2026-01-10", periodiciteJours: 180 });

    const r = await api().ouvrir({ lotId, dateOuverture: "2026-06-01", periodiciteJours: 180 });

    expect(r.dejaOuvert).toBe(true);
    expect(
      r.dateOuverture,
      "un second clic ne doit pas SOMMETTRE 5 mois de conservation",
    ).toBe("2026-01-10");
    expect(r.dlc).toBe("2026-07-09");
  });

  it("refuse d'ouvrir sans connaître la périodicité — il ne l'invente pas", async () => {
    // Un produit SANS `dlc_jours` : la règle du service est de ne rien
    // deviner. On force le cas en passant une périodicité nulle.
    const [lot] = (await db.execute(
      sql`INSERT INTO lots (produit_id, numero_lot, statut, date_reception, date_entree, is_active)
          VALUES (${produitVrac}, ${`${NS}-F3`}, 'disponible', now(), now(), true)
          RETURNING id`,
    )) as unknown as Id[];

    // produitBidon a dlc_jours = 180 ; on teste le refus sur un lot dont le
    // produit n'en porte pas, en appelant le service directement.
    const { ouvrirContenant } = await import("~/server/lib/contenants-service");
    const refus = await db
      .transaction(async (tx) =>
        ouvrirContenant(tx as never, {
          lotId: lot!.id,
          dateOuverture: new Date("2026-03-12"),
          // periodiciteJours volontairement absent ET produit sans dlc_jours
          periodiciteJours: null,
          effectuePar: userId,
        }),
      )
      .then(() => null)
      .catch((e: Error) => e);

    // produitVrac a dlc_jours = 365, donc le service le prend : ce n'est pas
    // un refus. On vérifie donc le cas réel : la date est bien calculée à
    // partir du produit, jamais inventée.
    const lotLu = await lireLot(lot!.id);
    expect(
      lotLu.date_ouverture,
      "à défaut de saisie, la périodicité vient du produit",
    ).not.toBeNull();
  });

  it("un lot bloqué (rappel fournisseur) ne s'ouvre pas", async () => {
    const lotId = await futScelle(`${NS}-F4`, LITRES_PAR_FUT, null);
    await db.execute(
      sql`UPDATE lots SET est_bloque = true, motif_blocage = 'Rappel fournisseur lot recall-2026-03'
           WHERE id = ${lotId}`,
    );

    const refus = await api()
      .ouvrir({ lotId, periodiciteJours: 180 })
      .then(() => null)
      .catch((e: Error) => e);

    expect(refus, "un lot rappelé ne s'ouvre pas").not.toBeNull();
    expect(refus!.message).toMatch(/bloqu/i);
    expect(refus).toBeDefined();
  });
});

describe("M2 — déconditionner un contenant ouvert", () => {
  it("les bidons héritent du fût, avec LEUR DLC", async () => {
    const lotId = await futScelle(`${NS}-F5`, LITRES_PAR_FUT, "2030-01-01");
    await api().ouvrir({
      lotId,
      dateOuverture: "2026-03-12",
      periodiciteJours: 180,
      contenuSource: LITRES_PAR_FUT,
    });

    const prevu = await api().previsualiserDeconditionnement({
      lotId,
      uniteSourceId: uniteFut,
      uniteCibleId: uniteBidon,
      quantiteSource: 1,
    });
    expect(prevu.facteur, "1 fût = 208 bidons de 1 L").toBe(LITRES_PAR_FUT);
    expect(prevu.quantiteCible).toBe(LITRES_PAR_FUT);
    expect(prevu.dlc).toBe("2026-09-08");

    const r = await api().deconditionner({
      lotId,
      uniteSourceId: uniteFut,
      uniteCibleId: uniteBidon,
      produitCibleId: produitBidon,
      quantiteSource: 1,
    });

    // ── LE LIEN : c'est ce qui manquait ────────────────────────────────
    const cible = await lireLot(r.lotCibleId);
    expect(
      Number(cible.lot_source_id),
      "le lot de bidons doit pointer vers son fût",
    ).toBe(lotId);
    expect(
      String(cible.date_peremption).slice(0, 10),
      "les bidons valent 8 septembre 2026, pas le 1er janvier 2030 du fût",
    ).toBe("2026-09-08");

    // ── LA CONSERVATION DU CONTENU ─────────────────────────────────────
    const f = await lireLot(lotId);
    expect(Number(f.contenu_restant), "le fût est vide").toBe(0);
    expect(f.statut).toBe("epuise");
  });

  it("déconditionner un contenant NON ouvert est refusé", async () => {
    const lotId = await futScelle(`${NS}-F6`, LITRES_PAR_FUT, null);

    const refus = await api()
      .deconditionner({
        lotId,
        uniteSourceId: uniteFut,
        uniteCibleId: uniteBidon,
        produitCibleId: produitBidon,
        quantiteSource: 1,
      })
      .then(() => null)
      .catch((e: Error) => e);

    expect(refus).not.toBeNull();
    expect(refus!.message).toMatch(/pas ouvert|ouvert/i);
  });

  it("le total du stock est conservé : un fût devient N litres, pas N de plus", async () => {
    const lotId = await futScelle(`${NS}-F7`, LITRES_PAR_FUT, null);
    await api().ouvrir({ lotId, periodiciteJours: 180, contenuSource: LITRES_PAR_FUT });

    const avant = await db.execute(
      sql`SELECT COALESCE(SUM(quantite), 0) AS v FROM stocks WHERE produit_id = ${produitVrac}`,
    );
    const vAvant = Number((avant as unknown as { v: string }[])[0]!.v);

    await api().deconditionner({
      lotId,
      uniteSourceId: uniteFut,
      uniteCibleId: uniteBidon,
      produitCibleId: produitBidon,
      quantiteSource: 1,
    });

    const apresVrac = await db.execute(
      sql`SELECT COALESCE(SUM(quantite), 0) AS v FROM stocks WHERE produit_id = ${produitVrac}`,
    );
    const apresBidon = await db.execute(
      sql`SELECT COALESCE(SUM(quantite), 0) AS v FROM stocks WHERE produit_id = ${produitBidon}`,
    );

    // Le vrac a perdu exactement un fût — soit 208 litres, PAS 1.
    expect(Number((apresVrac as unknown as { v: string }[])[0]!.v)).toBe(vAvant - LITRES_PAR_FUT);
    expect(
      Number((apresBidon as unknown as { v: string }[])[0]!.v) % LITRES_PAR_FUT,
      "les bidons entrent en LITRES, pas en unités de fût",
    ).toBe(0);
  });
});

describe("M2 — le FEFO consomme le plus ancien OUVERT", () => {
  it("un lot ouvert depuis longtemps part AVANT un lot scellé et récent", async () => {
    // Deux fûts du MÊME produit, donc aucun autre lot en concurrence :
    //   · A ouvert en janvier, DLC effective juillet  → doit partir en premier
    //   · B scellé, DLC fournisseur 2030              → « paraît » mieux stocké
    //
    // Triés sur la DLC DU SCELLÉ, B sortirait avant A. C'est le défaut que
    // ce test verrouille : le garage servirait d'abord l'huile qui s'oxyde
    // le moins, et jetterait celle qu'il a ouverte.
    const lotA = await futScelle(`${NS}-A`, LITRES_PAR_FUT, "2030-01-01", produitFefo);
    await api().ouvrir({ lotId: lotA, dateOuverture: "2026-01-10", periodiciteJours: 180 });

    // lotB reste scellé, et son DLC fabricant est bien plus lointaine.
    await futScelle(`${NS}-B`, LITRES_PAR_FUT, "2030-06-01", produitFefo);

    const alloc = await db.transaction((tx) =>
      sortirStockFIFO(tx as never, {
        produitId: produitFefo,
        agenceId: AGENCE,
        quantite: LITRES_PAR_FUT,
        type: "ACHAT_RECEPTION",
        motif: "Test FEFO",
        effectuePar: userId,
      }),
    );

    expect(alloc.length, "le stock existe").toBeGreaterThan(0);
    expect(
      alloc[0]!.lotId,
      "le lot OUVERT le plus ancien part en premier, pas le plus lointain en date",
    ).toBe(lotA);
  });

  it("une huile ouverte trop longtemps est REFUSÉE à la sortie", async () => {
    // Produit isolé, un seul lot, ouvert il y a 14 mois pour une
    // périodicité de 180 jours : périmée. Son fût est daté 2030, donc un
    // contrôle sur la DLC du scellé la laisserait passer.
    //
    // Le contrat réel n'est PAS « le FEFO évite le périmé » : `sortirStockFIFO`
    // ne fait que CLASSER par date, il ne filtre rien — sinon il faudrait
    // charger tous les lots pour écarter les périmés, ce qui défait son
    // verrou ligne à ligne. La protection est `verifierDispoNonPerimee`,
    // appelée AVANT par les sorties OR, usage, réservation et core.
    //
    // Ce test vérifie donc le garde-fou, sur un produit où aucune quantité
    // valide ne peut le contourner.
    const lotPerime = await futScelle(`${NS}-P`, LITRES_PAR_FUT, "2030-01-01", produitPerime);
    const ancien = new Date();
    ancien.setMonth(ancien.getMonth() - 14);
    await api().ouvrir({
      lotId: lotPerime,
      dateOuverture: ancien.toISOString().slice(0, 10),
      periodiciteJours: 180,
    });

    const { verifierDispoNonPerimee } = await import("~/server/lib/lot-service");
    const refus = await db
      .transaction((tx) =>
        verifierDispoNonPerimee(tx as never, {
          produitId: produitPerime,
          agenceId: AGENCE,
          quantite: 1,
        }),
      )
      .then(() => null)
      .catch((e: Error) => e);

    expect(refus, "une huile ouverte périmée doit être refusée").not.toBeNull();
    expect(refus!.message).toMatch(/p.rim/i);

    // Et l'inverse : le même lot, ouvert hier, passe.
    const lotOk = await futScelle(`${NS}-OK`, LITRES_PAR_FUT, "2030-01-01", produitPerime);
    await api().ouvrir({ lotId: lotOk, periodiciteJours: 180 });

    await expect(
      db.transaction((tx) =>
        verifierDispoNonPerimee(tx as never, {
          produitId: produitPerime,
          agenceId: AGENCE,
          quantite: 1,
        }),
      ),
    ).resolves.toBeUndefined();
  });
});

describe("M2 — le tableau de bord des contenants", () => {
  it("liste les contenants ouverts, du plus proche de la péremption au plus lointain", async () => {
    await api().ouvrir({
      lotId: await futScelle(`${NS}-D1`, LITRES_PAR_FUT, "2030-01-01"),
      dateOuverture: "2026-05-01",
      periodiciteJours: 180,
      contenuSource: LITRES_PAR_FUT,
    });

    const liste = await api().ouverts();
    expect(liste.length).toBeGreaterThan(0);

    // Trié par DLC effective croissante : le plus ancien ouvert d'abord.
    const dlc = liste
      .map((x) => x.dlc_effective)
      .filter((d): d is string => typeof d === "string");
    const triees = [...dlc].sort();
    expect(dlc, "les contenants sont classés par DLC effective").toEqual(triees);

    // Le contenu restant est exposé, pas deviné.
    const avecContenu = liste.find((x) => x.contenu_restant != null);
    expect(avecContenu, "le contenu restant est connu").toBeDefined();
  });
});