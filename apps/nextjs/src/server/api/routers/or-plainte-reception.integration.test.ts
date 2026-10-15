import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * UNE SEULE ZONE DE SAISIE : « Pannes déclarées »
 *
 * Décision métier : ce que le client déclare en déposant son véhicule est sa
 * plainte. Il n'y a donc pas deux champs à l'écran — un formulaire qui demande
 * « pannes » ET « plainte » oblige l'agent à choisir lequel est le vrai, et
 * l'un des deux reste vide.
 *
 * `pannes_declarees` est donc la saisie ; `plainte` est la colonne historique
 * sur laquelle elle est reportée, et que lisent la fiche dossier, le planning,
 * les alertes et le parc. Tous les écrans qui affichent « Plainte » désignent
 * exactement ce que le client a déclaré.
 *
 * Ce test verrouille deux choses qui doivent rester vraies :
 *   1. la saisie unique alimente bien l'affichage ;
 *   2. le libellé « Plainte du client » ne réapparaît PAS dans le formulaire.
 *
 * Le second point a été corrigé : une zone « Plainte du client » avait été
 * ajoutée au formulaire sur la base d'une misunderstanding — le besoin exprimé
 * était déjà couvert par « Pannes déclarées ».
 */

vi.mock("@atelierone/auth", () => ({}));

const { orRouter } = await import("~/server/api/routers/or-router");
const { readFileSync } = await import("node:fs");
const { fileURLToPath } = await import("node:url");

const NS = "panne";
const IMAAT = "PANNE-IMM-01";
const PANNE = "Voyant moteur allume, bruit a l'acceleration";
const PLAINTE = "Facture 30 % au-dessus du devis du mois dernier";

let userId = 0;
let orId = 0;

function ctx() {
  const user = {
    id: String(userId),
    name: "Plainte test",
    email: `${NS}.test@gpj.cm`,
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

async function lire(id: number) {
  const [row] = (await db.execute(
    sql`SELECT plainte, pannes_declarees FROM ordres_reparation WHERE id = ${id}`,
  )) as unknown as { plainte: string | null; pannes_declarees: string | null }[];
  return row!;
}

describe("Réception : une seule zone de saisie — les pannes déclarées", () => {
  beforeAll(async () => {
    // Rejouable : on nettoie d'abord, sinon un run interrompu laisse des
    // fixtures et le suivant bute sur une contrainte d'unicité. L'ordre
    // suit la hiérarchie des clés étrangères — supprimer les clients avant
    // leurs dossiers viole la FK `ordres_reparation.client_id`.
    await db.execute(sql`
      DELETE FROM lignes_ordre_reparation
      WHERE ordre_id IN (SELECT id FROM ordres_reparation
                         WHERE client_id IN (SELECT id FROM clients WHERE nom LIKE ${`Client ${NS}%`}))`);
    await db.execute(sql`
      DELETE FROM ordres_reparation
      WHERE client_id IN (SELECT id FROM clients WHERE nom LIKE ${`Client ${NS}%`})`);
    await db.execute(sql`DELETE FROM vehicules WHERE immatriculation LIKE ${`${NS.toUpperCase()}-IMM-%`}`);
    await db.execute(sql`DELETE FROM clients WHERE nom LIKE ${`Client ${NS}%`}`);
    await db.execute(sql`DELETE FROM audit_logs WHERE user_id IN
                       (SELECT id FROM utilisateurs WHERE email = ${`${NS}.test@gpj.cm`})`);
    await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${`${NS}.test@gpj.cm`}`);

    const [u] = (await db.execute(sql`
      INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
      VALUES (${`${NS}.test@gpj.cm`}, 'Plainte', 'Test', 1, true, 'active')
      RETURNING id`)) as unknown as { id: string }[];
    userId = Number(u!.id);
  });

  afterAll(async () => {
    // Même hiérarchie que le nettoyage d'entrée.
    await db.execute(sql`
      DELETE FROM lignes_ordre_reparation
      WHERE ordre_id IN (SELECT id FROM ordres_reparation
                         WHERE client_id IN (SELECT id FROM clients WHERE nom LIKE ${`Client ${NS}%`}))`);
    await db.execute(sql`
      DELETE FROM ordres_reparation
      WHERE client_id IN (SELECT id FROM clients WHERE nom LIKE ${`Client ${NS}%`})`);
    await db.execute(sql`DELETE FROM vehicules WHERE immatriculation LIKE ${`${NS.toUpperCase()}-IMM-%`}`);
    await db.execute(sql`DELETE FROM clients WHERE nom LIKE ${`Client ${NS}%`}`);
    if (userId) {
      await db.execute(sql`DELETE FROM audit_logs WHERE user_id = ${userId}`);
      await db.execute(sql`DELETE FROM utilisateurs WHERE id = ${userId}`);
    }
  });

  it("l'ecran de reception ne propose QU'UN champ : pannes declarees", async () => {
    // Garde-fou de conception : si une zone « Plainte du client » réapparaît
    // dans le formulaire, l'agent aura deux endroits pour écrire le même énoncé
    // et l'un des deux restera vide — sans que rien ne le signale.
    const chemin = fileURLToPath(
      new URL(
        "../../../app/(dashboard)/dashboard/atelier/reception/_components/ReceptionVehicule.tsx",
        import.meta.url,
      ),
    );
    const source = readFileSync(chemin, "utf8");
    const libelles = [...source.matchAll(/label="([^"]+)"/g)].map((m) => m[1]);

    expect(libelles).toContain("Pannes déclarées");
    expect(
      libelles.filter((l) => /plainte/i.test(l)),
      "aucun libellé « Plainte » ne doit exister dans le formulaire de réception",
    ).toEqual([]);
    // Et la saisie ne doit pas être dupliquée côté état.
    expect(source).not.toMatch(/set\("reception",\s*"plainte"/);
  });

  it("la saisie « pannes declarees » alimente la colonne affichee « Plainte »", async () => {
    const caller = orRouter.createCaller(ctx());
    const r = await caller.receptionner({
      client: { nom: `Client ${NS}`, telephone: "690000042" },
      vehicule: { immatriculation: IMAAT, marque: "Renault", modele: "Clio", typeVehicule: "voiture" },
      reception: {
        kilometrageEntree: 45_000,
        pannesDeclarees: PANNE,
        motEntree: "PANNE",
        priorite: "P3",
      },
    });
    orId = r.id;

    const row = await lire(orId);
    expect(row.pannes_declarees).toBe(PANNE);
    // Les écrans qui affichent « Plainte » (fiche dossier, planning, alertes,
    // parc) doivent montrer ce que le client a réellement déclaré.
    expect(row.plainte).toBe(PANNE);
  });
});