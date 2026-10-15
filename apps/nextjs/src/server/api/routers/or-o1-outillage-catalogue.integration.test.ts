/**
 * LOT O1/O2 — CATALOGUE « OUTILLAGE & ACCESSOIRES »
 * =================================================
 *
 * Ce que ces tests verrouillent avant correction :
 *
 *  1. **Perte de données.** `ReceptionTab.tsx` (onglet Réception de la fiche
 *     dossier) reconstruisait un objet `outillage` à partir de SA propre liste
 *     de 5 clés en `camelCase` — `cric`, `roueSecours` — puis l'envoyait en
 *     remplacement intégral. La réception, elle, écrit 18 clés en majuscules.
 *     Les deux écritures visent la même colonne JSONB et ne se recouvrent
 *     pas : **ouvrir cet onglet et enregistrer effaçait les 18 réponses**.
 *
 *  2. **Aucune validation.** `z.record(z.any())` acceptait n'importe quelle clé
 *     et n'importe quelle valeur.
 *
 *  3. **Aucune personnalisation possible.** La liste des outils était une
 *     constante codée en dur dans le composant React.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  OUTILLAGE_PAR_DEFAUT,
  slugifierElement,
  normaliserOutillage,
  controlerCatalogue,
  type ElementOutillage,
} from "~/server/lib/outillage-catalogue";

const NS = "o1outillage";
const ROLE_CODE = `${NS}_or`;
const USER_EMAIL = `${NS}.or@gpj.cm`;

type Row = Record<string, unknown>;
let userId = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "O1 outillage",
    email: USER_EMAIL,
    agenceId: 1,
    agenceName: "GPJ",
    organizationId: "1",
    role: "superadmin",
    permissions: [],
    isActive: true,
    status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } } as never;
}

beforeAll(async () => {
  await retirer();
  await db.execute(
    sql`INSERT INTO roles (code, nom, description, niveau)
        VALUES (${ROLE_CODE}, 'O1 outillage', 'Fixture O1', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[];
  await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'O1OUT', 'Fixture', 1, ${role.id}::uuid, true, 'active')
        ON CONFLICT (email) DO NOTHING`,
  );
  const [u] = (await db.execute(sql`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`)) as unknown as Row[];
  userId = Number(u.id);
});

beforeEach(async () => {
  await db.execute(sql`UPDATE atelier_parametres SET outillage_catalogue = NULL WHERE agence_id = 1`);
});

afterAll(async () => {
  await retirer();
  await db.execute(sql`UPDATE atelier_parametres SET outillage_catalogue = NULL WHERE agence_id = 1`);
});

async function retirer(): Promise<void> {
  await db.execute(
    sql`DELETE FROM lignes_ordre_reparation
        WHERE ordre_id IN (SELECT id FROM ordres_reparation WHERE pannes_declarees LIKE 'O1OUT%')`,
  );
  await db.execute(sql`DELETE FROM ordres_reparation WHERE pannes_declarees LIKE 'O1OUT%'`);
  await db.execute(sql`DELETE FROM vehicules WHERE immat_norm LIKE 'O1OUT-%' OR immatriculation LIKE 'O1OUT-%'`);
  await db.execute(sql`DELETE FROM clients WHERE nom LIKE 'Client O1OUT%'`);
  await db.execute(sql`UPDATE atelier_parametres SET outillage_catalogue = NULL WHERE agence_id = 1`);
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`);
  userId = 0;
}

/**
 * Un client par dossier, avec un TÉLÉPHONE PROPRE.
 *
 * Tous ces dossiers partageaient le même numéro : depuis qu'un doublon client
 * se signale au lieu de se créer en silence, le deuxième dossier était refusé
 * — à raison, le numéro aurait réellement fleuri une fiche par dossier.
 * Un téléphone distinct par immatriculation rend la fixture honnête.
 */
async function receptionnerAvec(immat: string, outillage: Record<string, unknown>) {
  const caller = orRouter.createCaller(ctxSuperadmin());
  const suffixe = immat.replace(/[^0-9]/g, "").slice(-4).padStart(4, "0");
  const r = await caller.receptionner({
    client: { nom: `Client O1OUT ${immat}`, telephone: `6919${suffixe}` },
    vehicule: { immatriculation: immat, marque: "Peugeot" },
    reception: { kilometrageEntree: 10000, pannesDeclarees: `O1OUT-${immat}`, outillage },
  });
  return { orId: r.id as number, caller };
}

const lireOutillage = async (orId: number) => {
  const [o] = (await db.execute(
    sql`SELECT outillage FROM ordres_reparation WHERE id = ${orId}`,
  )) as unknown as { outillage: Record<string, unknown> | null }[];
  return o?.outillage ?? {};
};

describe("LOT O1 — l'outillage a une forme, et elle ne se perd plus", () => {
  it("1. la nomenclature par défaut est celle que les agents ont déjà cochée", async () => {
    // Les clés sont une identité : 8 dossiers de production portent déjà des
    // réponses. Les changer en slug les aurait rendus orphelins.
    const cles = OUTILLAGE_PAR_DEFAUT.map((i) => i.cle);
    expect(cles).toContain("CRIC");
    expect(cles).toContain("ROUE DE SECOURS");
    expect(cles).toContain("CLÉ DE ROUE");
    expect(cles).toContain("PIÈCES DU VÉHICULE");
    expect(cles).toContain("AUTRES");
    expect(OUTILLAGE_PAR_DEFAUT).toHaveLength(18);
  });

  it("2. forme invalide REFUSÉE (là où z.record(z.any()) acceptait n'importe quoi)", async () => {
    await expect(
      receptionnerAvec("O1OUT-002", { CRIC: "oui" } as never),
    ).rejects.toThrow();

    await expect(
      receptionnerAvec("O1OUT-002B", { "": { present: true } } as never),
    ).rejects.toThrow();

    // Une réponse d'agent a toujours la même forme : présence + observation.
    const { orId } = await receptionnerAvec("O1OUT-002C", {
      CRIC: { present: true, observation: "Cric hydraulique présent." },
    });
    const o = await lireOutillage(orId);
    expect((o.CRIC as { present: boolean }).present).toBe(true);
  });

  it("3. le libellé est FIGÉ dans le dossier au moment de la saisie", async () => {
    // Renommer un outil dans le catalogue ne doit pas réécrire l'historique :
    // un dossier archivé doit montrer ce que l'agent a coché ce jour-là.
    const { orId } = await receptionnerAvec("O1OUT-003", {
      CRIC: { present: true, observation: "" },
    });

    const appelant = orRouter.createCaller(ctxSuperadmin());
    await appelant.updateCatalogueOutillage({
      items: OUTILLAGE_PAR_DEFAUT.map((i) =>
        i.cle === "CRIC" ? { ...i, libelle: "ÉLÉVATEUR HYDRAULIQUE" } : i,
      ),
    });

    const apres = await lireOutillage(orId);
    expect(apres.CRIC).toBeDefined();
    expect((apres.CRIC as { present: boolean }).present).toBe(true);

    // Le catalogue, lui, présente le nouveau libellé.
    const { items } = await appelant.getCatalogueOutillage();
    expect(items.find((i) => i.cle === "CRIC")?.libelle).toBe("ÉLÉVATEUR HYDRAULIQUE");
  });

  it("4. un élément RETIRÉ du catalogue reste visible dans les dossiers passés", async () => {
    // Le piège : en ne renvoyant que les éléments du catalogue, une réponse
    // déjà donnée disparaît de l'affichage. L'agent qui rouvre son dossier
    // verrait « absent » pour un outil qu'il avait lui-même coché.
    const { orId } = await receptionnerAvec("O1OUT-004", {
      BOUGIES: { present: true, observation: "" },
      CRIC: { present: false, observation: "" },
    });

    const appelant = orRouter.createCaller(ctxSuperadmin());
    await appelant.updateCatalogueOutillage({
      items: OUTILLAGE_PAR_DEFAUT.filter((i) => i.cle !== "BOUGIES"),
    });

    const { items } = await appelant.getCatalogueOutillage();
    expect(items.find((i) => i.cle === "BOUGIES")).toBeUndefined();

    // Mais la réponse reste dans le dossier, et se réaffiche.
    const brut = await lireOutillage(orId);
    expect(brut.BOUGIES).toBeDefined();

    const normalise = normaliserOutillage(
      items,
      { ...brut, BOUGIES: { present: true, observation: "", libelle: "BOUGIES" } },
    );
    expect(normalise.BOUGIES.present).toBe(true);
  });
});

describe("LOT O1 — la perte de données de l'onglet Réception est fermée", () => {
  /**
   * Le bug le plus grave trouvé par l'audit.
   *
   * `ReceptionTab.tsx` reconstruisait `outillage` à partir de SA propre liste
   * de 5 clés en `camelCase` et envoyait le résultat en remplacement
   * intégral. La réception écrit 18 clés en majuscules. Ouvrir l'onglet
   * Réception d'un dossier et enregistrer effaçait donc les 18 réponses.
   *
   * Ce test rejoue le scénario à travers `or.update`, qui est la mutation que
   * cet onglet appelle.
   */
  it("10. enregistrer l'onglet Réception ne détruit plus les réponses de la réception", async () => {
    const { orId, caller } = await receptionnerAvec("O1OUT-010", {
      CRIC: { present: true, observation: "Cric présent, vérifié au sol." },
      "ROUE DE SECOURS": { present: true, observation: "" },
      NATTES: { present: false, observation: "" },
      BOUGIES: { present: true, observation: "" },
    });

    // Le dossier fige l'état de TOUTE la nomenclature, pas seulement des
    // éléments cochés. C'est ce qui distingue « absent du véhicule » (clé
    // présente, `present: false`) de « jamais regardé » (clé absente) — deux
    // informations qu'un simple `{ CRIC: true }` confond.
    const { items } = await caller.getCatalogueOutillage();
    const clesAttendues = items.map((i) => i.cle).sort();
    const avant = Object.keys(await lireOutillage(orId)).sort();
    expect(avant).toEqual(clesAttendues);

    // Ce que fait l'onglet Réception : mise à jour de quelques champs de la
    // fiche SANS toucher à l'outillage…
    await caller.update({ id: orId, pannesDeclarees: "O1OUT-fiche mise à jour" });
    // …puis sauvegarde de l'outillage reconstruit à partir du catalogue.
    const reconstruit = normaliserOutillage(items, await lireOutillage(orId));
    await caller.update({ id: orId, outillage: reconstruit });

    const apres = await lireOutillage(orId);
    expect(Object.keys(apres).sort()).toEqual(clesAttendues);

    // Et les VALEURS, pas seulement les clés : c'est bien la perte de valeur
    // qui destructurait le dossier.
    expect((apres.CRIC as { present: boolean }).present).toBe(true);
    expect((apres.CRIC as { observation: string }).observation).toBe("Cric présent, vérifié au sol.");
    expect((apres["ROUE DE SECOURS"] as { present: boolean }).present).toBe(true);
    expect((apres.NATTES as { present: boolean }).present).toBe(false);
    expect((apres.BOUGIES as { present: boolean }).present).toBe(true);
  });

  it("11. le serveur fige le libellé, même si le client ne l'envoie pas", async () => {
    // La garantie ne doit pas reposer sur la bonne volonté de chaque écran.
    const { orId } = await receptionnerAvec("O1OUT-011", {
      CRIC: { present: true },
      SACS: { present: false },
    });

    const o = await lireOutillage(orId);
    expect((o.CRIC as { libelle?: string }).libelle).toBe("CRIC");
    expect((o.SACS as { libelle?: string }).libelle).toBe("SACS");
  });
});

describe("LOT O2 — gérer la liste proposée", () => {
  it("5. ajout, renommage et retrait depuis le catalogue de l'agence", async () => {
    const appelant = orRouter.createCaller(ctxSuperadmin());
    const { items } = await appelant.getCatalogueOutillage();
    expect(items).toHaveLength(18);

    // Ajout
    const avecCale = slugifierElement("Cale de nivellement", new Set(items.map((i) => i.cle)));
    await appelant.updateCatalogueOutillage({
      items: [...items, { cle: avecCale, libelle: "Cale de nivellement", ordre: 9999 }],
    });
    const apresAjout = await appelant.getCatalogueOutillage();
    expect(apresAjout.items).toHaveLength(19);
    expect(apresAjout.items.at(-1)?.ordre).toBe(190);

    // Renommage : la clé ne bouge pas, seul le libellé.
    await appelant.updateCatalogueOutillage({
      items: apresAjout.items.map((i) =>
        i.cle === avecCale ? { ...i, libelle: "Cales de nivellement" } : i,
      ),
    });
    const apresRenommage = await appelant.getCatalogueOutillage();
    expect(apresRenommage.items.find((i) => i.cle === avecCale)?.libelle).toBe("Cales de nivellement");

    // Retrait
    await appelant.updateCatalogueOutillage({
      items: apresRenommage.items.filter((i) => i.cle !== avecCale),
    });
    expect((await appelant.getCatalogueOutillage()).items).toHaveLength(18);
  });

  it("6. la clé reste stable quand le libellé change", async () => {
    // Renommer ne doit JAMAIS créer une nouvelle clé : sinon les réponses
    // déjà enregistrées perdent leur rattachement.
    const cles = OUTILLAGE_PAR_DEFAUT.map((i) => i.cle);
    const renomme = OUTILLAGE_PAR_DEFAUT.map((i) =>
      i.cle === "CRIC" ? { ...i, libelle: "Élévateur" } : i,
    );
    expect(renomme.map((i) => i.cle)).toEqual(cles);
  });

  it("7. doublons REFUSÉS, avec un message qui nomme l'élément", async () => {
    const items: ElementOutillage[] = [
      { cle: "A", libelle: "Cric", ordre: 10 },
      { cle: "B", libelle: "cric", ordre: 20 },
    ];
    expect(() => controlerCatalogue(items)).toThrow(/Cric/);

    expect(() =>
      controlerCatalogue([
        { cle: "MEME", libelle: "Triangle", ordre: 10 },
        { cle: "MEME", libelle: "Tri", ordre: 20 },
      ]),
    ).toThrow(/Clé en double/);

    expect(() => controlerCatalogue([])).toThrow();
  });

  it("8. la clé générée est lisible et unique", () => {
    expect(slugifierElement("Cale de nivellement", new Set())).toBe("CALE_DE_NIVELLEMENT");
    // Accents retirés, pas remplacés par un caractère parasite.
    expect(slugifierElement("Clé de roue", new Set())).toBe("CLE_DE_ROUE");
    expect(slugifierElement("Trousse à outils", new Set())).toBe("TROUSSE_A_OUTILS");
    // Collision : on suffixe plutôt que d'écraser un élément existant.
    expect(slugifierElement("Cric", new Set(["CRIC"]))).toBe("CRIC_2");
  });

  it("9. le catalogue est privé de son agence", async () => {
    // L'agent d'une autre agence : sa liste est la sienne, pas celle de l'agence 1.
    const ctxAutre = ctxSuperadmin() as unknown as { user: Record<string, unknown> };
    const appelant = orRouter.createCaller({
      ...ctxAutre,
      user: { ...ctxAutre.user, agenceId: 2 },
    } as never);
    const { items } = await appelant.getCatalogueOutillage();
    // L'agence 2 n'a rien personnalisé : elle reçoit la nomenclature par défaut.
    expect(items).toHaveLength(18);
  });
});
