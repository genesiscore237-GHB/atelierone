/**
 * ÉTAPE 5 — RELANCES : les quatre gardes du routeur.
 *
 * Le service sait ce qui mérite d'être relancé ; la migration sait ce qu'est une
 * relance. Ces tests vérifient ce qui se passe quand quelqu'un essaie d'écrire
 * une relance qui ne veut rien dire.
 *
 *
 * POURQUOI DES GARDES ET PAS SEULEMENT UN SCHÉMA
 *
 * La contrainte SQL dit « valeur invalide » sans dire **lesquelles** sont
 * valides. Un agent — ou un script — qui se trompe n'a rien pour se corriger.
 * Le message serveur doit nommer les valeurs acceptées : c'est la différence
 * entre un mur et une consigne.
 *
 * Et surtout : une colonne nullable et une règle applicative font deux
 * vérités. C'est la seconde qu'on contourne.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { relancesRouter } from "~/server/api/routers/relances-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "e5relance";
const USER_EMAIL = `${NS}.or@gpj.cm`;
const TEL = "690500950";

type Row = Record<string, unknown>;

let userId = 0;
let clientId = 0;
let vehiculeId = 0;
let orId = 0;
let avantRelance: { orId: number | null; candidates: { type: string; raison: string; poids: number }[]; dejaEnCours: string[] } | null = null;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "E5 relance",
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
 * Nettoyage.
 *
 * L'ordre n'est pas libre : `ordres_reparation.vehicule_id` est `NOT NULL`
 * sans `ON DELETE CASCADE` — supprimer un véhicule qui a un dossier échoue.
 * Ce qui pointe part donc avant ce qui est pointé.
 *
 * `relances.or_id` et `relances.vehicule_id` sont, eux, en cascade depuis la
 * 0014 : les relances disparaissent avec leur véhicule. C'est le premier lien
 * de la base où une suppression ne demande pas d'ordre.
 *
 * `cree_par` reste une FK simple : le compte est réutilisé, pas supprimé.
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

beforeAll(async () => {
  await retirer();

  const [u] = (await db.execute(
    sql`INSERT INTO utilisateurs (email, login_email, mot_de_passe, nom, agence_id, status)
        VALUES (${USER_EMAIL}, ${USER_EMAIL}, 'x', 'E5 relance', 1, 'active')
        ON CONFLICT (email) DO UPDATE SET nom = 'E5 relance'
        RETURNING id`,
  )) as unknown as Row[];
  userId = Number(u.id);

  // Le client est résolu au moment de la réception, comme dans le fichier de
  // l'étape 4 : `receptionner` sait le créer, et le faire icimierait dueless.
  const [v] = (await db.execute(
    sql`INSERT INTO vehicules (immatriculation, marque, modele, agence_id)
        VALUES (${`${NS}-001`}, 'Relance', 'Test', 1) RETURNING id`,
  )) as unknown as Row[];
  vehiculeId = Number(v.id);

  // Un dossier en attente de réponse : c'est l'état qu'on veut voir signalé.
  const orCaller = (await import("~/server/api/routers/or-router")).orRouter.createCaller(ctxSuperadmin());
  const r = await orCaller.receptionner({
    client: { nom: `Client ${NS}`, telephone: TEL },
    vehicule: { id: vehiculeId, immatriculation: `${NS}-001` },
    reception: { kilometrageEntree: 50000, pannesDeclarees: "Freins" },
  });
  orId = r.id as number;
  clientId = Number(
    ((await db.execute(sql`SELECT client_id FROM vehicules WHERE id = ${vehiculeId}`)) as unknown as Row[])[0]
      ?.client_id ?? 0,
  );
  await orCaller.changerStatut({
    id: r.id,
    nouveauStatut: "EN_ATTENTE_VALIDATION" as never,
    raison: "E5 — devis envoyé, client silencieux",
  });
});

afterAll(async () => {
  await retirer();
});

describe("ÉTAPE 5 — relances : ce que le routeur refuse", () => {
  it("1. une relance sans sujet est refusée — elle ne relancerait rien", async () => {
    const caller = relancesRouter.createCaller(ctxSuperadmin());
    await expect(
      caller.creer({ type: "DEVIS", canal: "APPEL", message: "Bonjour" }),
    ).rejects.toThrow(/ce qu'elle relance/i);
  });

  it("2. un vocabulaire hors liste nomme les valeurs acceptées", async () => {
    const caller = relancesRouter.createCaller(ctxSuperadmin());

    // L'état AVANT toute relance, capté ici parce que les tests s'exécutent
    // dans l'ordre : le test 3 en crée une, et après coup on ne peut plus
    // prouver que le système l'avait bien proposée.
    avantRelance = await caller.attendues({ vehiculeId });

    // Le refus doit être instructif. « valeur invalide » sans plus laisse
    // l'appelant deviner ; nommer les valeurs autorisées, c'est le rendre
    // capable de se corriger tout seul.
    await expect(
      caller.creer({ type: "RECLAMATION", canal: "APPEL", message: "x", vehiculeId }),
    ).rejects.toThrow(/DEVIS/);

    await expect(
      caller.creer({ type: "DEVIS", canal: "CARTE_POSTALE", message: "x", vehiculeId }),
    ).rejects.toThrow(/WHATSAPP/);

    await expect(
      caller.creer({ type: "DEVIS", canal: "APPEL", message: "x", vehiculeId, statut: "REPONSE" }),
    ).rejects.toThrow(/REPONDUE/);
  });

  it("3. une relance par un canal porte un auteur", async () => {
    const caller = relancesRouter.createCaller(ctxSuperadmin());
    const row = await caller.creer({
      type: "DEVIS",
      canal: "APPEL",
      message: "Rappel du devis",
      vehiculeId,
      orId,
      clientId,
    });
    // Le serveur enregistre l'auteur à partir de la session, pas d'un champ
    // fourni : un appelant ne peut pas se faire passer pour quelqu'un d'autre.
    expect(row.creePar).toBe(userId);
    expect(row.canal).toBe("APPEL");
  });

  it("4. une relance.close ne se rouvre pas — le client a déjà répondu", async () => {
    const caller = relancesRouter.createCaller(ctxSuperadmin());
    const creee = await caller.creer({
      type: "PAIEMENT",
      canal: "SMS",
      message: "Rappel de solde",
      vehiculeId,
      orId,
    });

    await caller.changerStatut({ id: creee.id, statut: "REPONDUE" });

    // Rouvrir ferait réapparaître dans la file d'attente un client qui a déjà
    // répondu. Si on veut vraiment le relancer, c'est une NOUVELLE relance —
    // et la distinction entre les deux est exactement ce qu'on cherche ensuite.
    await expect(caller.changerStatut({ id: creee.id, statut: "ENVOYEE" })).rejects.toThrow(/close/i);
  });

  it("5. l'historique par véhicule répond ce qu'il a promis", async () => {
    const caller = relancesRouter.createCaller(ctxSuperadmin());
    const lignes = await caller.parVehicule({ vehiculeId });

    expect(lignes.length).toBeGreaterThan(0);
    // Sans quoi on aurait une vue « Historique » vide — le défaut de la
    // colonne « Non défini », déplacé sur un écran.
    for (const l of lignes) {
      expect(l.vehiculeId).toBe(vehiculeId);
      expect(l.agenceId).toBe(1);
      expect(l.message).toBeTruthy();
    }
    // La plus récente d'abord : un historique qu'on lit à l'envers est un
    // historique qu'on ne lit pas.
    const dates = lignes.map((l) => new Date(l.createdAt as string).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

it("6. une relance déjà partie n'est pas redemandée", async () => {
    const caller = relancesRouter.createCaller(ctxSuperadmin());

    // AVANT (capté au test 2, avant que le test 3 n'écrive quoi que ce soit) :
    // un dossier en attente de validation PROPOSE une relance.
    expect(
      avantRelance.candidates.some((c) => c.type === "DEVIS"),
      "un dossier en attente de validation doit proposer une relance",
    ).toBe(true);

    // APRÈS (le test 3 en a créé une) : la ligne sort de la file. Sinon
    // l'agent relance en boucle — et apprend à ne plus regarder l'écran.
    const apres = await caller.attendues({ vehiculeId });
    expect(apres.candidates.some((c) => c.type === "DEVIS")).toBe(false);
    expect(apres.dejaEnCours).toContain("DEVIS");

    // Et surtout : la relance déjà partie reste VISIBLE. Filtrer l'affichage
    // aurait été le raccourci — alors qu'elle est précisément l'information
    // qui dit « on a essayé, le client n'a pas répondu ».
const historique = await caller.parVehicule({ vehiculeId });
    expect(historique.some((h) => h.type === "DEVIS")).toBe(true);
  });

  it("7. le vocabulaire servi au client est celui du service — pas une recopie", async () => {
    const caller = relancesRouter.createCaller(ctxSuperadmin());
    const v = await caller.vocabulaire();
    // Les écrans listent les statuts pour colorer, les canaux pour choisir.
    // Un tableau serveur et un tableau local qui divergent donnent un
    // `<select>` qui propose une valeur que la base refuse.
    for (const t of v.types) expect(t.label).toBeTruthy();
    for (const c of v.canaux) expect(c.label).toBeTruthy();
    for (const s of v.statuts) expect(s.label).toBeTruthy();
    expect(v.seuils.devisJours).toBeGreaterThan(0);
    expect(v.seuils.immobilisationJours).toBeGreaterThan(v.seuils.devisJours);
  });
});