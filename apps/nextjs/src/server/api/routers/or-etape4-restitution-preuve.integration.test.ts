/**
 * ÉTAPE 4 — « Un véhicule `LIVRE` sans restitution n'existe pas. »
 *
 * RESTITUTIONS : ce qui rend un véhicule restituable, ce qui l'empêche, et la
 * trace de qui l'a restitué.
 *
 *
 * CE QUE LA LECTURE DU CODE LAISSAIT CROIRE
 *
 * Le module est solide. `or.restituerVehicule` écrit `or_restitutions`
 * (kilométrage de sortie, carburant, checklist, signature du client, nom du
 * récupérateur, motif des travaux non réalisés), écrit un `or_historique` de
 * type `RESTITUTION`, libère la place du parking et journalise le mouvement
 * `SORTIE`. C'est exactement ce qu'on demande d'une restitution.
 *
 * `or.changerStatut` ne peut PAS produire le même résultat : la machine
 * d'états refuse `PRET_A_LIVRER → LIVRE` (`atelier-service.test.ts` l'affirme
 * explicitement). `or.update` n'a plus de champ `statut` depuis T0.1.
 *
 * Sur le papier, donc, un dossier ne peut arriver à `LIVRE` que par une
 * restitution tracée.
 *
 *
 * LE CONSTAT QUI FAIT SORTIR CE TEST
 *
 * L'invariant n'est garanti par RIEN.
 *
 *  - aucune contrainte en base : rien n'empêche `statut = 'LIVRE'` ;
 *  - aucun déclencheur : rien ne l'exige ;
 *  - le seul garde est une vérification applicative, dans UN handler ;
 *  - et elle ne porte que sur la transition. Un script de migration, un
 *    script d'administration, une correction manuelle en SQL passe à côté.
 *
 * Il faut avoir fait l'audit pour s'en apercevoir :
 *
 *   base locale      : 0 dossier, 0 restitution      -> invariant respecté
 *   base de test     : 0 dossier, 0 restitution      -> invariant respecté
 *   PRODUCTION       : 1 dossier, 0 restitution      -> invariant respecté
 *
 * Trois « conformes », tous vides. On n'avait pas la preuve que la règle
 * tenait : on avait la preuve qu'elle n'avait jamais été mise à l'épreuve.
 *
 * Une règle qui n'a jamais été testée n'est pas une règle, c'est une
 * intention.
 *
 *
 * CE QUE CE TEST FAIT
 *
 * 1. Il exerce le chemin LÉGITIME et vérifie que la trace est complète —
 *    pas seulement présente : auteur, kilométrage, signature.
 * 2. Il vérifie que la machine d'états refuse bien `LIVRE` par un simple
 *    changement de statut, et que le message renvoie vers la restitution.
 * 3. PUIS IL AUDITE TOUTE LA TABLE, pas le seul dossier qu'il vient de créer.
 *    C'est le test qui tient dans le temps : le jour où un nouveau chemin écrit
 *    `LIVRE` sans restitution, il échoue — même si le dossier fautif n'a rien
 *    à voir avec celui de ce fichier.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

// `next-auth` n'est pas résolvable hors de Next : on ne mocke QUE le transport
// d'authentification ; le RBAC (DB) reste réel.
vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "e4restit";
const USER_EMAIL = `${NS}.or@gpj.cm`;
const NUM_REGISTRE = 9801;
const TEL = "690900980";

type Row = Record<string, unknown>;

let userId = 0;

/** Contexte forgé « superadmin » : bypass `requirePermissionProcedure`. */
function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "E4 superadmin",
    email: USER_EMAIL,
    agenceId: 1,
    agenceName: "GPJ",
    organizationId: "1",
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

/**
 * Nettoyage par immatriculation.
 *
 * L'ordre compte, et il n'est pas libre : `or_restitutions.or_id` et
 * `or_historique.or_id` pointent vers `ordres_reparation`, sans
 * `ON DELETE CASCADE`. Il faut donc vider ce qui pointe avant ce qui est
 * pointé.
 *
 * L'utilisateur, en revanche, on ne le supprime PAS.
 *
 * En cherchant la cause du refus de clé étrangère, le comptage a répondu :
 * 187 tables référencent `utilisateurs`. Parmi elles, pour un dossier d'atelier
 * seulement : `or_restitutions.restitue_par`, `or_historique.change_par`,
 * `ordres_reparation.cree_par` et `receptionniste_id`, `or_photos.cree_par`,
 * `or_controles_qualite.controle_par`, `or_devis_versions.cree_par`,
 * `parking_movements.user_id`, `audit_logs.user_id`…
 *
 * Et Postgre16 ne dit pas QUELLE contrainte bloque : il répond « la relation
 * « utilisateurs » viole la contrainte de clé étrangère », ce qui désigne la
 * table cible comme si elle était fautive. On cherche au mauvais endroit.
 *
 * On RÉUTILISE donc le compte s'il existe. C'est ce que fait la production :
 * un utilisateur ne se supprime pas, il s'archive (`deleted_at`).
 */
async function retirer() {
  await db.execute(
    sql`DELETE FROM or_restitutions
        WHERE or_id IN (
          SELECT o.id FROM ordres_reparation o
          JOIN vehicules v ON v.id = o.vehicule_id
          WHERE v.immatriculation LIKE ${`${NS}%`})`,
  );
  await db.execute(
    sql`DELETE FROM or_historique
        WHERE or_id IN (
          SELECT o.id FROM ordres_reparation o
          JOIN vehicules v ON v.id = o.vehicule_id
          WHERE v.immatriculation LIKE ${`${NS}%`})`,
  );
  await db.execute(
    sql`DELETE FROM ordres_reparation
        WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE ${`${NS}%`})`,
  );
  await db.execute(sql`DELETE FROM vehicules WHERE immatriculation LIKE ${`${NS}%`}`);
  await db.execute(sql`DELETE FROM clients WHERE telephone = ${TEL}`);
}

/**
 * Client du fichier, résolu par téléphone.
 *
 * Toutes les immatriculations de ce fichier sont rattachées au même client :
 * on le crée une fois et on le retrouve ensuite.
 */
async function clientDuLot() {
  const [row] = (await db.execute(
    sql`SELECT id FROM clients WHERE telephone = ${TEL}`,
  )) as unknown as Row[];
  return row
    ? { id: Number(row.id) }
    : { nom: `Client ${NS}`, telephone: TEL };
}

let compteur = 0;

/**
 * Ouvre un dossier, l'amène à « Prêt à livrer » par la machine d'états, puis
 * fait VALIDER le contrôle qualité.
 *
 * Le QC n'est pas une formalité du test : sans lui, la restitution est
 * refusée (« Contrôle qualité non validé »). C'est l'une des réponses à la
 * question « ce qui empêche un véhicule de partir », et elle est bonne — on
 * passe donc par là plutôt que par la sortie exceptionnelle, qui contourne
 * précisément ce qu'on veut éprouver.
 */
async function dossierPretALivrer() {
  const orCaller = orRouter.createCaller(ctxSuperadmin());
  const immat = `${NS}-${++compteur}`;
  const [v] = (await db.execute(
    sql`INSERT INTO vehicules (immatriculation, marque, modele, agence_id)
        VALUES (${immat}, 'Restitution', 'Test', 1) RETURNING id`,
  )) as unknown as Row[];

  const r = await orCaller.receptionner({
    client: await clientDuLot(),
    vehicule: { id: Number(v.id), immatriculation: immat },
    reception: { kilometrageEntree: 10000, pannesDeclarees: "Freins" },
  });
  for (const etape of ["EN_COURS", "CONTROLE_QUALITE"] as const) {
    await orCaller.changerStatut({
      id: r.id,
      nouveauStatut: etape as never,
      raison: `Étape 4 -> ${etape}`,
    });
  }
  await orCaller.validerControleQualite({
    orId: r.id as number,
    checklist: [{ libelle: "Freinage", ok: true }],
    essaiRoutier: true,
    resultat: "VALIDE",
  });
  return { orId: r.id as number, vehiculeId: Number(v.id), immat };
}

beforeAll(async () => {
  await retirer();

  // On RÉUTILISE un compte déjà présent au lieu d'en créer un nouveau à
  // chaque exécution : voir la note de `retirer()` — 187 tables référencent
  // `utilisateurs`, et le compte ne peut donc pas être supprimé entre deux
  // exécutions.
  //
  // La ligne n'existe d'ailleurs que pour satisfaire la clé étrangère
  // `or_restitutions.restitue_par`. Le rôle vient du contexte forgé
  // (`role: "superadmin"`), pas de la base : inutile de créer un `roles`
  // que rien ne lirait.
  const [u] = (await db.execute(
    sql`INSERT INTO utilisateurs (email, login_email, mot_de_passe, nom, agence_id, status)
        VALUES (${USER_EMAIL}, ${USER_EMAIL}, 'x', 'E4 restitution', 1, 'active')
        ON CONFLICT (email) DO UPDATE SET nom = 'E4 restitution'
        RETURNING id`,
  )) as unknown as Row[];
  userId = Number(u.id);
});

afterAll(async () => {
  await retirer();
});

describe("ÉTAPE 4 — restitution : la trace est obligatoire", () => {
  it("1. ce qui EMPÊCHE : un dossier non facturé ne part pas par la voie normale", async () => {
    const orCaller = orRouter.createCaller(ctxSuperadmin());
    const { orId } = await dossierPretALivrer();

    // Quatre portes gardent la sortie, et elles se rencontrent l'une après
    // l'autre. La première qu'on franchit est celle-ci : sans facture, pas de
    // restitution normale. (Les suivantes : solde non encaissé, travaux non
    // réglés, QC non validé.)
    //
    // C'est le comportement VOLONTAIRE. Un véhicule qui repart sans que sa
    // facture soit émise est un véhicule dont le garage ne saura pas ce qu'il
    // a facturé.
    await expect(
      orCaller.restituerVehicule({
        orId,
        kilometrageSortie: 10420,
        checklist: [{ libelle: "État des lieux", ok: true }],
        recuperateurNom: "M. KOFFI",
        signatureClient: "Signature",
      }),
    ).rejects.toThrow(/factur/i);

    const [row] = (await db.execute(
      sql`SELECT statut FROM ordres_reparation WHERE id = ${orId}`,
    )) as unknown as Row[];
    expect(row.statut).not.toBe("LIVRE");
  });

  it("2. même en sortie exceptionnelle, la trace est COMPLÈTE — pas seulement présente", async () => {
    const orCaller = orRouter.createCaller(ctxSuperadmin());
    const { orId } = await dossierPretALivrer();

    // La sortie exceptionnelle contourne les portes — c'est son métier, pour
    // un véhicule remorqué ou un client pressé. Elle n'a PAS le droit de
    // contourner la trace : c'est même son seul intérêt. Un véhicule parti
    // dans l'urgence est celui qu'on aura le plus besoin de documenter.
    const r = await orCaller.restituerVehicule({
      orId,
      kilometrageSortie: 10420,
      niveauCarburantSortie: "1/2",
      checklist: [{ libelle: "État des lieux", ok: true }],
      recuperateurNom: "M. KOFFI",
      signatureClient: "Signature du client",
      observations: "Clés rendues",
      sortieExceptionnelle: true,
      motifException: "Client absent, véhicule remorqué",
      commentaireException: "Sortie tracée pour l'étape 4.",
    });
    expect((r as any).success).toBe(true);

    const [rest] = (await db.execute(
      sql`SELECT kilometrage_sortie, niveau_carburant_sortie, recuperateur_nom,
                 signature_client, observations, restitue_par, date_restitution
          FROM or_restitutions WHERE or_id = ${orId}`,
    )) as unknown as Row[];

    // Présente ne suffit pas : une restitution sans auteur n'est pas une
    // trace, c'est un trou. Sans auteur, la question « qui a rendu le
    // véhicule ? » n'a pas de réponse — donc la restitution n'a pas eu lieu,
    // elle a été constatée.
    expect(Number(rest.kilometrage_sortie)).toBe(10420);
    expect(rest.niveau_carburant_sortie).toBe("1/2");
    expect(rest.recuperateur_nom).toBe("M. KOFFI");
    expect(rest.signature_client).toBe("Signature du client");
    // Le motif de l'exception doit survivre DANS la trace, pas seulement dans
    // le message du toast : c'est la seule preuve qu'on est SORTI DE FORCE.
    expect(String(rest.observations)).toMatch(/exceptionnelle/i);
    expect(Number(rest.restitue_par)).toBe(userId);
    expect(rest.date_restitution).toBeTruthy();
  });

  it("3. un changement de statut ne peut pas fabriquer un `LIVRE` sans restitution", async () => {
    const orCaller = orRouter.createCaller(ctxSuperadmin());
    const { orId } = await dossierPretALivrer();

    // Le refus doit être motivé ET indiquer le chemin. Un agent qui se voit
    // dire « refus » sans savoir où aller cherche un autre chemin : l'interface,
    // puis la base. C'est le trajet qu'on voulait éviter.
    await orCaller
      .changerStatut({ id: orId, nouveauStatut: "LIVRE" as never })
      .then(
        () => expect.unreachable("changerStatut n'aurait pas dû produire un LIVRE"),
        (e: unknown) => {
          expect(String((e as Error).message)).toMatch(/restitu/i);
        },
      );

    const [row] = (await db.execute(
      sql`SELECT statut FROM ordres_reparation WHERE id = ${orId}`,
    )) as unknown as Row[];
    expect(row.statut).toBe("PRET_A_LIVRER");
  });

  it("4. l'invariant, sur TOUTE la table — le test qui tiendra dans le temps", async () => {
    const [coupables] = (await db.execute(
      sql`SELECT count(*)::int AS n
          FROM ordres_reparation o
          WHERE o.statut = 'LIVRE'
            AND NOT EXISTS (SELECT 1 FROM or_restitutions r WHERE r.or_id = o.id)`,
    )) as unknown as Row[];

    // Un dossier livré sans trace de restitution, c'est un véhicule parti
    // sans que personne n'ait noté qui l'avait, à quel kilométrage, ni pour
    // combien de carburant. Le garage le découvre le jour de la réclamation.
    expect(
      Number(coupables.n),
      "un dossier est LIVRE sans restitution : la sortie n'a pas de trace",
    ).toBe(0);

    // Et l'autre moitié de l'invariant : une restitution sans auteur n'est
    // pas une trace non plus.
    const [orphelins] = (await db.execute(
      sql`SELECT count(*)::int AS n
          FROM or_restitutions
          WHERE restitue_par IS NULL OR date_restitution IS NULL`,
    )) as unknown as Row[];
    expect(
      Number(orphelins.n),
      "une restitution existe mais sans auteur ni date : c'est une assertion, pas une trace",
    ).toBe(0);
  });
});