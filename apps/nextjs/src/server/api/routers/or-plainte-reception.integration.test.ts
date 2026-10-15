import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * PLAINTE ≠ PANNE DÉCLARÉE
 *
 * Ce sont deux objets métier distincts, et la base les distingue déjà :
 *   - `ordres_reparation.plainte`          → ce dont le client se plaint
 *                                             (« facturé 30 % au-dessus du devis »,
 *                                             « le véhicule est revenu abîmé »)
 *   - `ordres_reparation.pannes_declarees` → l'état technique constaté
 *                                             (« voyant moteur », « bruit à l'accélération »)
 *
 * Bug : `or.receptionner` écrivait
 *     plainte: input.reception.plainte ?? input.reception.pannesDeclarees
 * et l'écran de réception ne proposait QUE le champ « pannes déclarées ».
 * Conséquence : sur le formulaire de réception principal, la plainte était
 * TOUJOURS un copié-collage des pannes. La réclamation commerciale d'un client
 * n'était donc jamais enregistrée — et l'écran d'un dossier affichait, sous
 * l'intitulé « Plainte », la liste des pannes. Une information fausse, présentée
 * comme vraie, à l'endroit exact où l'on décide d'une concession commerciale.
 *
 * Corollaire aggravant : un client qui vient se plaindre SANS panne (il veut
 * contester la facture précédente, faire reprendre une rayure) n'a aucune
 * panne à déclarer. Le champ « pannes déclarées » étant obligatoire, l'agent
 * devait y écrire la plainte — ce qui polluait la donnée technique.
 *
 * Ce test verrouille l'indépendance des deux champs, dans les deux sens.
 */

vi.mock("@atelierone/auth", () => ({}));

const { orRouter } = await import("~/server/api/routers/or-router");

const NS = "plainte";
const IMAAT = `${NS.toUpperCase()}-IMM-01`;
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

describe("Réception : la plainte n'est pas la panne", () => {
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

  it("conserve la plainte ET la panne, sans les confondre", async () => {
    const caller = orRouter.createCaller(ctx());
    const r = await caller.receptionner({
      client: { nom: `Client ${NS}`, telephone: "690000042" },
      vehicule: { immatriculation: IMAAT, marque: "Renault", modele: "Clio", typeVehicule: "voiture" },
      reception: {
        kilometrageEntree: 45_000,
        pannesDeclarees: PANNE,
        plainte: PLAINTE,
        motEntree: "PANNE",
        priorite: "P3",
      },
    });
    orId = r.id;

    const row = await lire(orId);
    expect(row.pannes_declarees).toBe(PANNE);
    expect(row.plainte).toBe(PLAINTE);
    // Le piège exact du bug : la plainte copiée sur la panne.
    expect(row.plainte).not.toBe(PANNE);
  });

  it("laisse la plainte vide quand le client n'en exprime aucune", async () => {
    const caller = orRouter.createCaller(ctx());
    const r = await caller.receptionner({
      client: { nom: `Client ${NS} bis`, telephone: "690000043" },
      vehicule: { immatriculation: `${NS.toUpperCase()}-IMM-02`, marque: "Peugeot", modele: "208", typeVehicule: "voiture" },
      reception: {
        kilometrageEntree: 12_000,
        pannesDeclarees: "Disque avant raye",
        motEntree: "PANNE",
        priorite: "P3",
      },
    });

    const row = await lire(r.id);
    expect(row.pannes_declarees).toBe("Disque avant raye");
    // Aucune plainte n'a ete declaree : la colonne doit rester vide, pas se
    // remplir avec la panne. Un dossier sans reclamation doit le dire.
    expect(row.plainte).toBeNull();

    await db.execute(sql`DELETE FROM lignes_ordre_reparation WHERE ordre_id = ${r.id}`);
    await db.execute(sql`DELETE FROM ordres_reparation WHERE id = ${r.id}`);
    await db.execute(sql`DELETE FROM vehicules WHERE immatriculation = ${`${NS.toUpperCase()}-IMM-02`}`);
    await db.execute(sql`DELETE FROM clients WHERE nom = ${`Client ${NS} bis`}`);
  });
});