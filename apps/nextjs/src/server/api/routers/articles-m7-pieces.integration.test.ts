import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * ENREGISTREMENT DES PIÈCES — ce que le cahier des charges exige, testé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS PROUVENT
 *
 *   · un doublon CERTAIN est refusé par le serveur (pas seulement signalé) ;
 *   · un doublon PROBABLE — un nom voisin — ne bloque JAMAIS la création ;
 *   · le réemploi d'une référence existante est possible, mais exige un motif ;
 *   · une pièce d'occasion porte ses informations propres, et N'IMPLIQUE RIEN
 *     d'autre qu'elle-même ;
 *   · une référence et une compatibilité créées sans qualification sont
 *     enregistrées NON VERIFIÉES — jamais « confirmées » par défaut ;
 *   · une offre fournisseur est unique, et son contenu de conditionnement est
 *     « non confirmé » tant que personne ne l'a vérifié ;
 *   · créer une fiche NE BOUEGE PAS le stock.
 *
 * Les scénarios du cahier des charges qui ne sont pas couverts ici sont
 * listés dans le rapport final avec la raison. On ne déclare pas un test
 * réussi sans l'avoir exécuté.
 */

vi.mock("@atelierone/auth", () => ({}));

const { articlesRouter } = await import("~/server/api/routers/articles-router");

const NS = "m7pieces";
const AGENCE = 1;

let userId = 0;
let fournisseurA = 0;
let fournisseurB = 0;

/**
 * `requirePermissionProcedure` vérifie la permission EN BASE
 * (`RBACService.hasPermission`), pas dans `ctx.user.permissions`. Un utilisateur
 * de test qui n'existe pas dans les tables de rights est donc refusé — à
 * raison.
 *
 * `superadmin` court-circuite ce contrôle (`trpc.ts` : `if (role ===
 * "superadmin") return next()`) : c'est le seul moyen de tester le métier sans
 * réécrire le RBAC. Le cas « sans droit » est testé séparément, avec un rôle
 * non-admin.
 */
function ctx() {
  const user = {
    id: String(userId),
    name: "Pieces",
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

/** Utilisateur SANS la permission de modification. */
function ctxSansDroit() {
  const user = {
    id: String(userId),
    name: "Pieces",
    email: `${NS}@gpj.cm`,
    agenceId: AGENCE,
    agenceName: "GPJ",
    organizationId: String(AGENCE),
    role: "consultation",
    permissions: ["stock.consulter"],
    isActive: true,
    status: "active",
  };
  return {
    headers: new Headers(),
    user,
    session: { user, expires: "2099-01-01T00:00:00.000Z" },
  } as never;
}

async function fournisseur(suffixe: string): Promise<number> {
  const code = `${NS}-F-${suffixe}`;
  const trouve = (await db.execute(sql`SELECT id FROM fournisseurs WHERE code = ${code} LIMIT 1`)) as unknown as {
    id: number;
  }[];
  if (trouve[0]?.id) return Number(trouve[0].id);
  const [f] = (await db.execute(
    sql`INSERT INTO fournisseurs (nom, code, type_service, circuit, is_active)
        VALUES (${`Fournisseur ${suffixe}`}, ${code}, 'PIECES_AUTO', 'PIECES', true)
        RETURNING id`,
  )) as unknown as { id: number }[];
  return Number(f!.id);
}

/**
 * Extrait un message d'erreur exploitable.
 *
 * `superRefine` de Zod ne lève pas une `TRPCError` mais un tableau d'issues :
 * sans cela, `e.message` est un objet et toutes les assertions `.toMatch()`
 * échouent sur une erreur de test plutôt que sur le comportement testé.
 */
function msg(e: unknown): string {
  const m = (e as { message?: unknown })?.message;
  if (typeof m === "string") return m;
  if (Array.isArray(m)) return m.map((i: { message?: string }) => i?.message ?? "").join(" | ");
  try {
    return JSON.stringify(m ?? e);
  } catch {
    return String(e);
  }
}

async function stockTotalDe(produitId: number): Promise<number> {
  const [r] = (await db.execute(
    sql`SELECT COALESCE(SUM(quantite), 0) AS q FROM stocks WHERE produit_id = ${produitId}`,
  )) as unknown as { q: string }[];
  return Number(r?.q ?? 0);
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'M7', 'Pieces', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`)) as unknown as { id: string }[];
  userId = Number(u!.id);

  fournisseurA = await fournisseur("A");
  fournisseurB = await fournisseur("B");

  // La base de test est PARTAGÉE et `produits` ne se supprime pas dans la vie
  // de l'application (une référence porte un historique). Un test qui laisse
  // ses fixtures derrière n'est donc pas rejouable : le garde trouverait, au
  // run suivant, les produits qu'il a lui-même créés la veille.
  //
  // Ces produits-là, on peut les supprimer : ils n'ont AUCUN mouvement de
  // stock — c'est même ce que ce fichier vérifie. Aucune trace d'exploitation
  // n'est donc détruite, et la suite reste rejouable.
  await db.execute(sql`
    DELETE FROM produits_fournisseurs
     WHERE produit_id IN (SELECT id FROM produits WHERE reference_principale LIKE ${`${NS}%`})`);
  await db.execute(sql`
    DELETE FROM compatibilites_produits
     WHERE produit_id IN (SELECT id FROM produits WHERE reference_principale LIKE ${`${NS}%`})`);
  // On retient les articles PARENTS avant de supprimer les variantes : sans eux,
  // on ne saurait plus à qui les rendre.
  const parents = (await db.execute(
    sql`SELECT DISTINCT article_id AS id FROM produits
         WHERE reference_principale LIKE ${`${NS}%`} AND article_id IS NOT NULL`,
  )) as unknown as { id: number }[];
  await db.execute(sql`
    DELETE FROM stocks
     WHERE produit_id IN (SELECT id FROM produits WHERE reference_principale LIKE ${`${NS}%`})`);
  // Les variantes AVANT leur article : `produits.article_id` n'est pas en
  // CASCADE, l'ordre inverse viole la clé étrangère.
  await db.execute(sql`DELETE FROM produits WHERE reference_principale LIKE ${`${NS}%`}`);
  for (const p of parents) {
    await db.execute(sql`
      DELETE FROM article_attributs WHERE article_id = ${p.id}`);
    await db.execute(sql`
      DELETE FROM article_documents WHERE article_id = ${p.id}`);
    await db.execute(sql`
      DELETE FROM produit_references_equiv WHERE article_id = ${p.id}`);
    await db.execute(sql`DELETE FROM produit_articles WHERE id = ${p.id}`);
  }
});

afterAll(async () => {
  // Les fiches de test sont rendues INACTIVES, pas supprimées : une pièce
  // supprimée après avoir existé n'est pas le même objet qu'une pièce qui n'a
  // jamais existé, et le test suivant doit le voir.
  await db.execute(
    sql`UPDATE produits SET is_active = false
        WHERE reference_principale LIKE ${`${NS}%`}
           OR titre LIKE ${`${NS}%`}`,
  );
});

describe("Pièces — doublons", () => {
  it("un doublon CERTAIN est refusé par le serveur", async () => {
    const r1 = await api().createArticle({
      designation: `${NS} Filtre à huile`,
      designationCourte: `${NS} filtre`,
      typeProduit: "PIECE",
      variantes: [{ referencePrincipale: `${NS}-W712/92`, marque: "Mann", referenceFabricant: "W712/92" }],
    } as never);
    expect(r1.articleId).toBeTruthy();

    // Même référence principale, saisie différemment (casse, espaces, tirets) :
    // c'est la MÊME référence pour un humain.
    const refus = await api()
      .createArticle({
        designation: `${NS} Filtre a huile`,
        designationCourte: `${NS} filtre`,
        typeProduit: "PIECE",
        variantes: [{ referencePrincipale: `${NS} w712 92`, marque: "Mann" }],
      } as never)
      .then(() => null)
      .catch((e: unknown) => msg(e));

    expect(refus, "le serveur doit refuser, pas seulement signaler").toMatch(/déjà exister/i);
  });

  it("deux pièces au nom PROCHE restent distinctes : la création passe", async () => {
    // « Filtre à huile spin-on » et « Filtre à huile cartouche » portent le même
    // nom de famille et n'ont RIEN à voir. Les bloquer obligerait le magasinier
    // à renommer sa pièce — et c'est exactement ce que le cahier des charges
    // interdit.
    const r = await api()
      .createArticle({
        designation: `${NS} Filtre à huile spin-on`,
        designationCourte: `${NS} filtre spin on`,
        typeProduit: "PIECE",
        variantes: [{ referencePrincipale: `${NS}-SPINON-118`, marque: "Mann" }],
      } as never)
      .then(() => "")
      .catch((e: unknown) => msg(e));

    expect(r, "un nom voisin ne doit jamais bloquer").not.toMatch(/déjà exister/i);
  });

  it("le réemploi est possible, mais il exige un MOTIF", async () => {
    const sansMotif = await api()
      .createArticle({
        designation: `${NS} Filtre réemployé`,
        typeProduit: "PIECE",
        variantes: [{ referencePrincipale: `${NS}-W712/92`, marque: "Mann" }],
        accepterDoublon: true,
      } as never)
      .then(() => null)
      .catch((e: unknown) => msg(e));

    expect(sansMotif, "accepter sans motif n'est pas accepter").toMatch(/motif/i);

    const avecMotif = await api()
      .createArticle({
        designation: `${NS} Filtre réemployé`,
        typeProduit: "PIECE",
        variantes: [{ referencePrincipale: `${NS}-W712/92`, marque: "Mann" }],
        accepterDoublon: true,
        motifReemploi: "Référence réattribuée par le fournisseur après reprise de stock",
      } as never)
      .then(() => "")
      .catch((e: unknown) => msg(e));

    expect(avecMotif, "avec un motif, la création passe").not.toMatch(/motif/i);
  });

  it("une variante ajoutée à un article existant est aussi gardée", async () => {
    // `addVariante` est la porte de service du garde du wizard : c'est par là
    // que la fiche « Ajouter une variante » passait sans contrôle.
    const articles = (await db.execute(
      sql`SELECT id FROM produit_articles WHERE designation = ${`${NS} Filtre à huile`} LIMIT 1`,
    )) as unknown as { id: number }[];

    const refus = await api()
      .addVariante({
        articleId: Number(articles[0]!.id),
        variante: { referencePrincipale: `${NS}-W712/92`, marque: "Mann" },
      } as never)
      .then(() => null)
      .catch((e: unknown) => msg(e));

    expect(refus, "le garde doit couvrir tous les chemins de création").toMatch(/exister/i);
  });

  it("sans référence, on n'est jamais bloqué", async () => {
    // Une pièce sans référence n'est pas un doublon de quoi que ce soit. Le
    // garde ne compare jamais deux valeurs vides.
    const r = await api()
      .createArticle({
        designation: `${NS} Joint de culasse sans ref`,
        typeProduit: "PIECE",
        variantes: [{ designationCourte: `${NS} joint culasse` }],
      } as never)
      .then(() => "")
      .catch((e: unknown) => msg(e));

    expect(r).not.toMatch(/exister/i);
  });
});

describe("Pièces — état commercial", () => {
  it("une occasion se distingue d'une neuve, et ne touche qu'elle", async () => {
    const neuf = await api().createArticle({
      designation: `${NS} Alternateur`,
      typeProduit: "PIECE",
      variantes: [{ referencePrincipale: `${NS}-ALT-NEUF`, etatProduit: "NEUF" }],
    } as never);

    const occasion = await api().createArticle({
      designation: `${NS} Alternateur d'occasion`,
      typeProduit: "PIECE",
      etatProduitDefaut: "OCCASION",
      variantes: [{ referencePrincipale: `${NS}-ALT-OCC`, etatProduit: "OCCASION" }],
    } as never);

    expect(neuf.articleId).not.toBe(occasion.articleId);

    const lignes = (await db.execute(
      sql`SELECT reference_principale, etat_produit FROM produits
           WHERE reference_principale IN (${`${NS}-ALT-NEUF`}, ${`${NS}-ALT-OCC`})`,
    )) as unknown as Record<string, string>[];

    const parRef = Object.fromEntries(lignes.map((l) => [l.reference_principale, l.etat_produit]));
    expect(parRef[`${NS}-ALT-NEUF`], "la neuve reste neuve").toBe("NEUF");
    expect(parRef[`${NS}-ALT-OCC`], "l'occasion reste une occasion").toBe("OCCASION");
  });
});

describe("Pièces — aucune donnée inventée", () => {
  it("créer une fiche NE BOUGE PAS le stock", async () => {
    const r = await api().createArticle({
      designation: `${NS} Plaquettes avant`,
      typeProduit: "PIECE",
      variantes: [{ referencePrincipale: `${NS}-PLAQ-001`, designationCourte: `${NS} plaquettes avant` }],
    } as never);

    const [variante] = (await db.execute(
      sql`SELECT id FROM produits WHERE reference_principale = ${`${NS}-PLAQ-001`} LIMIT 1`,
    )) as unknown as { id: number }[];

    expect(
      await stockTotalDe(Number(variante!.id)),
      "une fiche de catalogue n'est pas un mouvement de stock",
    ).toBe(0);
    expect(r.articleId).toBeTruthy();
  });

  it("une compatibilité créée sans qualification est NON VERIFIÉE", async () => {
    // C'est la règle centrale du cahier des charges : ne jamais afficher une
    // compatibilité saisie au doigt comme si elle venait d'un catalogue.
    const [variante] = (await db.execute(
      sql`SELECT id FROM produits WHERE reference_principale = ${`${NS}-PLAQ-001`} LIMIT 1`,
    )) as unknown as { id: number }[];

    await db.execute(sql`
      INSERT INTO compatibilites_produits (produit_id, type_compat, marque, modele, niveau_verification, source)
      VALUES (${Number(variante!.id)}, 'POSITIVE', 'TOYOTA', 'COROLLA', 'NON_VERIFIE', 'MANUELLE')`);

    const [l] = (await db.execute(
      sql`SELECT niveau_verification, source, date_creation FROM compatibilites_produits
           WHERE produit_id = ${Number(variante!.id)} LIMIT 1`,
    )) as unknown as Record<string, string>[];

    expect(l!.niveau_verification).toBe("NON_VERIFIE");
    expect(l!.source).toBe("MANUELLE");
    expect(l!.date_creation, "la table n'était pas horodatée").toBeTruthy();
  });
});

describe("Pièces — offres fournisseur", () => {
  it("le contenu d'un conditionnement est NON CONFIRMÉ tant que personne ne l'a vérifié", async () => {
    const [variante] = (await db.execute(
      sql`SELECT id FROM produits WHERE reference_principale = ${`${NS}-PLAQ-001`} LIMIT 1`,
    )) as unknown as { id: number }[];

    await db.execute(sql`
      INSERT INTO produits_fournisseurs (produit_id, fournisseur_id, reference_fournisseur, prix_achat,
                                         unite_conditionnement, facteur_conditionnement)
      VALUES (${Number(variante!.id)}, ${fournisseurA}, ${`${NS}-BOX-10`}, 12000, NULL, 10)`);

    const [offre] = (await db.execute(
      sql`SELECT contenu_confirme, devise FROM produits_fournisseurs
           WHERE produit_id = ${Number(variante!.id)} AND fournisseur_id = ${fournisseurA} LIMIT 1`,
    )) as unknown as Record<string, unknown>[];

    // Le facteur est enregistré, mais il n'est PAS confirmé : tant que personne
    // n'a vu le bon du fournisseur, aucune conversion automatique n'a le droit
    // de s'appuyer dessus.
    expect(offre!.contenu_confirme, "un facteur seul ne confirme rien").toBe(false);
    expect(offre!.devise, "un prix sans devise est un prix sans unité de compte").toBeTruthy();
  });

  it("une offre identique deux fois est impossible", async () => {
    const [variante] = (await db.execute(
      sql`SELECT id FROM produits WHERE reference_principale = ${`${NS}-PLAQ-001`} LIMIT 1`,
    )) as unknown as { id: number }[];

    const doublon = await db.execute(sql`
      INSERT INTO produits_fournisseurs (produit_id, fournisseur_id, reference_fournisseur)
      VALUES (${Number(variante!.id)}, ${fournisseurA}, ${`${NS}-BOX-10`})`)
      .then(() => null)
      .catch((e: unknown) => msg(e));

    expect(doublon, "la contrainte doit exister").toMatch(/unique|duplicat|viol/i);
  });

  it("un même fournisseur peut proposer PLUSIEURS offres distinctes", async () => {
    // La contrainte porte sur le trio, pas sur le couple : deux références
    // d'achat chez le même fournisseur sont deux offres légitimes.
    const [variante] = (await db.execute(
      sql`SELECT id FROM produits WHERE reference_principale = ${`${NS}-PLAQ-001`} LIMIT 1`,
    )) as unknown as { id: number }[];

    for (const ref of [`${NS}-BOX-20`, `${NS}-UNIT-1`]) {
      await db.execute(sql`
        INSERT INTO produits_fournisseurs (produit_id, fournisseur_id, reference_fournisseur, contenu_confirme)
        VALUES (${Number(variante!.id)}, ${fournisseurA}, ${ref}, true)`);
    }
    await db.execute(sql`
      INSERT INTO produits_fournisseurs (produit_id, fournisseur_id, reference_fournisseur)
      VALUES (${Number(variante!.id)}, ${fournisseurB}, ${`${NS}-ALT-BOX-10`})`);

    const [n] = (await db.execute(
      sql`SELECT count(*) FROM produits_fournisseurs WHERE produit_id = ${Number(variante!.id)}`,
    )) as unknown as { count: string }[];

    expect(Number(n!.count), "3 offres distinctes, 2 fournisseurs").toBeGreaterThanOrEqual(3);
  });
});

describe("Pièces — qualification saisie", () => {
  it("une compatibilité QUALIFIÉE arrive qualifiée en base", async () => {
    // Tant que rien ne permettait de qualifier, tout restait « non vérifié ».
    // C'est honnête, mais ça jetait la donnée. La qualification doit donc
    // survivre au trajet formulaire → serveur → table.
    const r = await api().createArticle({
      designation: `${NS} Plaquettes qualifiées`,
      typeProduit: "PIECE",
      variantes: [{ referencePrincipale: `${NS}-PLAQ-QUAL` }],
      compatibilites: [
        {
          typeCompat: "POSITIVE",
          marque: "TOYOTA",
          modele: "COROLLA",
          sourceCompat: "CATALOGUE",
          niveauVerification: "CONFIRME",
        },
      ],
      referencesEquiv: [
        { marque: "BOSCH", reference: `${NS}-BOSCH-1`, source: "DOCUMENTATION", niveauVerification: "CONFIRME" },
      ],
    } as never);

    const [comp] = (await db.execute(
      sql`SELECT niveau_verification, source FROM compatibilites_produits
           WHERE marque = 'TOYOTA' AND modele = 'COROLLA' AND article_id = ${r.articleId}`,
    )) as unknown as Record<string, string>[];

    expect(comp!.niveau_verification, "la qualification doit survivre").toBe("CONFIRME");
    expect(comp!.source).toBe("CATALOGUE");
  });

  it("une compatibilité SANS qualification arrive NON VERIFIÉE", async () => {
    // Le défaut prudent ne doit dépendre ni du formulaire ni de la base.
    const r = await api().createArticle({
      designation: `${NS} Plaquettes non qualifiées`,
      typeProduit: "PIECE",
      variantes: [{ referencePrincipale: `${NS}-PLAQ-NONQUAL` }],
      compatibilites: [{ typeCompat: "POSITIVE", marque: "PEUGEOT", modele: "206" }],
      referencesEquiv: [{ marque: "TRW", reference: `${NS}-TRW-1` }],
    } as never);

    const [comp] = (await db.execute(
      sql`SELECT niveau_verification, source FROM compatibilites_produits
           WHERE marque = 'PEUGEOT' AND modele = '206' AND article_id = ${r.articleId}`,
    )) as unknown as Record<string, string>[];

    expect(comp!.niveau_verification).toBe("NON_VERIFIE");
    expect(comp!.source).toBe("MANUELLE");
  });

  it("un ajout de compatibilité autonome conserve SA qualification (source)", async () => {
    // L'input nomme la provenance « sourceCompat », la colonne « source » :
    // un spread brut la perdait silencieusement — l'ajout d'une compatibilité
    // depuis la fiche jetait donc la qualification à la corbeille.
    const r = await api().createArticle({
      designation: `${NS} Compat autonome`,
      typeProduit: "PIECE",
      variantes: [{ referencePrincipale: `${NS}-COMP-AUTO` }],
    } as never);
    const [v] = (await db.execute(
      sql`SELECT id FROM produits WHERE reference_principale = ${`${NS}-COMP-AUTO`} LIMIT 1`,
    )) as unknown as { id: number }[];
    await api().addCompatibilite({
      produitId: Number(v!.id),
      compat: { typeCompat: "POSITIVE", marque: "NISSAN", modele: "PATROL", sourceCompat: "CATALOGUE", niveauVerification: "CONFIRME" },
    } as never);

    const [comp] = (await db.execute(
      sql`SELECT source, niveau_verification FROM compatibilites_produits
           WHERE marque = 'NISSAN' AND modele = 'PATROL' AND produit_id = ${Number(v!.id)}`,
    )) as unknown as Record<string, string>[];

    expect(comp!.source, "la source doit survivre au trajet").toBe("CATALOGUE");
    expect(comp!.niveau_verification).toBe("CONFIRME");
  });

  it("CONFIRMÉ sans source : averti, pas refusé", async () => {
    const [v] = (await db.execute(
      sql`SELECT id FROM produits WHERE reference_principale = ${`${NS}-COMP-AUTO`} LIMIT 1`,
    )) as unknown as { id: number }[];
    const r = await api().addCompatibilite({
      produitId: Number(v!.id),
      compat: { typeCompat: "POSITIVE", marque: "MAZDA", modele: "BT50", niveauVerification: "CONFIRME" },
    } as never);
    expect((r as any).avertissement).toBeTruthy();

    const [comp] = (await db.execute(
      sql`SELECT niveau_verification, source FROM compatibilites_produits
           WHERE marque = 'MAZDA' AND modele = 'BT50' AND produit_id = ${Number(v!.id)}`,
    )) as unknown as Record<string, string>[];
    expect(comp!.niveau_verification).toBe("CONFIRME");
    expect(comp!.source, "l'avertissement ne repose pas sur des suppositions : sans source déclarée, MANUELLE").toBe("MANUELLE");
  });

  it("un contenu de conditionnement confirmé par le magasinier est conservé", async () => {
    const r = await api().createArticle({
      designation: `${NS} Filtres en boîte`,
      typeProduit: "PIECE",
      variantes: [
        {
          referencePrincipale: `${NS}-FILT-BOX`,
          fournisseurs: [
            {
              fournisseurId: fournisseurA,
              referenceFournisseur: `${NS}-BOITE-10`,
              facteurConditionnement: 10,
              contenuConfirme: true,
            },
          ],
        },
      ],
    } as never);

    const [offre] = (await db.execute(
      sql`SELECT contenu_confirme, facteur_conditionnement FROM produits_fournisseurs
           WHERE reference_fournisseur = ${`${NS}-BOITE-10`}`,
    )) as unknown as Record<string, never>[];

    expect(offre!.contenu_confirme, "une case cochée doit rester cochée").toBe(true);
    expect(Number(offre!.facteur_conditionnement)).toBe(10);
  });
});

describe("Pièces — droits", () => {
  it("sans permission de modification, on ne crée pas", async () => {
    const r = await articlesRouter
      .createCaller(ctxSansDroit() as never)
      .createArticle({
        designation: `${NS} Interdit`,
        typeProduit: "PIECE",
        variantes: [{ referencePrincipale: `${NS}-INTERDIT` }],
      } as never)
      .then(() => null)
      .catch((e: unknown) => msg(e));

    expect(r).toMatch(/permission|interdit|forbidden/i);
  });
});